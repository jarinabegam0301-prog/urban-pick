-- Run this file once in the Supabase SQL Editor for a new project.
-- It ports the application's PostgreSQL data model and business rules to Supabase.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE product_size AS ENUM ('S', 'M', 'L', 'XL', 'XXL');
CREATE TYPE product_status AS ENUM ('in_stock', 'low_stock', 'partially_sold_out', 'sold_out');
CREATE TYPE sale_status AS ENUM ('pending', 'confirmed', 'cancelled');
CREATE TYPE stock_event_type AS ENUM (
  'stock_added',
  'stock_sold',
  'stock_adjusted',
  'size_marked_sold_out',
  'product_marked_sold_out'
);

CREATE TABLE admins (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 60),
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX categories_name_case_insensitive_idx ON categories (lower(name));

INSERT INTO categories (name, slug) VALUES
  ('T-Shirts', 't-shirts'),
  ('Shirts', 'shirts'),
  ('Pants', 'pants'),
  ('Hoodies', 'hoodies'),
  ('Others', 'others');

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  slug TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES categories (id),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  cost_price NUMERIC(12, 2) NOT NULL CHECK (cost_price BETWEEN 0 AND 10000000),
  selling_price NUMERIC(12, 2) NOT NULL CHECK (selling_price BETWEEN 0 AND 10000000),
  original_price NUMERIC(12, 2) CHECK (
    original_price IS NULL OR (original_price BETWEEN selling_price AND 10000000)
  ),
  status product_status NOT NULL DEFAULT 'in_stock',
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX products_slug_active_idx ON products (slug) WHERE deleted_at IS NULL;
CREATE INDEX products_category_id_idx ON products (category_id);
CREATE INDEX products_status_idx ON products (status);
CREATE INDEX products_created_at_idx ON products (created_at DESC);
CREATE INDEX products_store_idx ON products (is_published, selling_price) WHERE deleted_at IS NULL;

CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX product_images_product_id_idx ON product_images (product_id, sort_order);

CREATE TABLE product_size_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  size product_size NOT NULL,
  initial_quantity INTEGER NOT NULL CHECK (initial_quantity BETWEEN 0 AND 100000),
  sold_quantity INTEGER NOT NULL DEFAULT 0 CHECK (sold_quantity >= 0 AND sold_quantity <= initial_quantity),
  available_quantity INTEGER GENERATED ALWAYS AS (initial_quantity - sold_quantity) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_size_stock_product_size_unique UNIQUE (product_id, size)
);

CREATE INDEX product_size_stock_product_id_idx ON product_size_stock (product_id);

CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products (id),
  size product_size NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
  selling_price NUMERIC(12, 2) NOT NULL CHECK (selling_price BETWEEN 0 AND 10000000),
  cost_price NUMERIC(12, 2) NOT NULL CHECK (cost_price BETWEEN 0 AND 10000000),
  profit NUMERIC(12, 2) GENERATED ALWAYS AS ((selling_price - cost_price) * quantity) STORED,
  customer_name TEXT CHECK (customer_name IS NULL OR length(customer_name) <= 120),
  customer_phone TEXT CHECK (
    customer_phone IS NULL OR customer_phone ~ '^\+?[0-9 ]{6,20}$'
  ),
  status sale_status NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sales_product_id_idx ON sales (product_id);
CREATE INDEX sales_created_at_idx ON sales (created_at DESC);
CREATE INDEX sales_status_idx ON sales (status);

CREATE TABLE stock_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products (id),
  size product_size,
  event_type stock_event_type NOT NULL,
  quantity_before INTEGER NOT NULL CHECK (quantity_before >= 0),
  quantity_change INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
  note TEXT,
  admin_id UUID REFERENCES admins (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX stock_events_product_id_idx ON stock_events (product_id, created_at DESC);
CREATE INDEX stock_events_created_at_idx ON stock_events (created_at DESC);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value) VALUES
  ('low_stock_threshold', '5'),
  ('whatsapp_number', ''),
  ('timezone', 'Asia/Kolkata');

CREATE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER admins_set_updated_at BEFORE UPDATE ON admins
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER product_size_stock_set_updated_at BEFORE UPDATE ON product_size_stock
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER app_settings_set_updated_at BEFORE UPDATE ON app_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE id = auth.uid());
$$;

CREATE FUNCTION product_status_for(p_product_id UUID)
RETURNS product_status
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  total_available INTEGER;
  has_empty_size BOOLEAN;
  threshold INTEGER;
BEGIN
  SELECT COALESCE(sum(available_quantity), 0), COALESCE(bool_or(available_quantity <= 0), false)
    INTO total_available, has_empty_size
    FROM product_size_stock
    WHERE product_id = p_product_id;

  SELECT COALESCE((SELECT value::INTEGER FROM app_settings WHERE key = 'low_stock_threshold'), 5)
    INTO threshold;

  IF total_available <= 0 THEN
    RETURN 'sold_out';
  ELSIF total_available < threshold THEN
    RETURN 'low_stock';
  ELSIF has_empty_size THEN
    RETURN 'partially_sold_out';
  END IF;
  RETURN 'in_stock';
END;
$$;

CREATE FUNCTION refresh_product_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  changed_product_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    changed_product_id := OLD.product_id;
  ELSE
    changed_product_id := NEW.product_id;
  END IF;
  UPDATE products
    SET status = product_status_for(changed_product_id)
    WHERE id = changed_product_id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_stock_refresh_status
AFTER INSERT OR UPDATE OR DELETE ON product_size_stock
FOR EACH ROW EXECUTE FUNCTION refresh_product_status();

CREATE FUNCTION category_slug(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT trim(both '-' FROM regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
$$;

CREATE FUNCTION admin_create_category(p_name TEXT)
RETURNS categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  clean_name TEXT := trim(p_name);
  clean_slug TEXT;
  result categories;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  IF length(clean_name) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'Enter a category name between 2 and 60 characters.' USING ERRCODE = 'P0001';
  END IF;
  clean_slug := category_slug(clean_name);
  IF clean_slug = '' THEN
    RAISE EXCEPTION 'Category name must include a letter or number.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM categories WHERE lower(name) = lower(clean_name) OR slug = clean_slug) THEN
    RAISE EXCEPTION 'A category with this name already exists.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO categories (name, slug) VALUES (clean_name, clean_slug) RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION admin_update_category(p_category_id UUID, p_name TEXT)
RETURNS categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  clean_name TEXT := trim(p_name);
  clean_slug TEXT;
  result categories;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  IF length(clean_name) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'Enter a category name between 2 and 60 characters.' USING ERRCODE = 'P0001';
  END IF;
  clean_slug := category_slug(clean_name);
  IF clean_slug = '' THEN
    RAISE EXCEPTION 'Category name must include a letter or number.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM categories
    WHERE id <> p_category_id AND (lower(name) = lower(clean_name) OR slug = clean_slug)
  ) THEN
    RAISE EXCEPTION 'A category with this name already exists.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE categories SET name = clean_name, slug = clean_slug
    WHERE id = p_category_id RETURNING * INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'Category not found.' USING ERRCODE = 'P0001'; END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION admin_delete_category(p_category_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM categories WHERE id = p_category_id) THEN
    RAISE EXCEPTION 'Category not found.' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM categories) <= 1 THEN
    RAISE EXCEPTION 'Keep at least one category in the store.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM products WHERE category_id = p_category_id) THEN
    RAISE EXCEPTION 'This category is assigned to products. Reassign those products before deleting it.' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM categories WHERE id = p_category_id;
END;
$$;

CREATE FUNCTION admin_create_product(p_input JSONB, p_slug TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_product_id UUID := gen_random_uuid();
  clean_name TEXT := trim(p_input->>'name');
  clean_slug TEXT := trim(both '-' FROM p_slug);
  base_slug TEXT := trim(both '-' FROM p_slug);
  suffix INTEGER := 2;
  item JSONB;
  stock_size product_size;
  stock_quantity INTEGER;
  product_category UUID := (p_input->>'category_id')::UUID;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  IF length(clean_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Product name must be between 2 and 120 characters.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM categories WHERE id = product_category) THEN
    RAISE EXCEPTION 'Choose a valid category.' USING ERRCODE = 'P0001';
  END IF;
  IF base_slug = '' THEN base_slug := 'product'; END IF;
  clean_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM products WHERE slug = clean_slug AND deleted_at IS NULL) LOOP
    clean_slug := base_slug || '-' || suffix;
    suffix := suffix + 1;
  END LOOP;
  IF jsonb_typeof(p_input->'sizes') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Add stock for at least one size.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(p_input->'sizes') NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Add stock for at least one size.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_input->'sizes') AS item(value)
    WHERE value->>'size' NOT IN ('S', 'M', 'L', 'XL', 'XXL')
      OR (value->>'quantity')::INTEGER NOT BETWEEN 0 AND 100000
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_input->'sizes') AS item(value)
    GROUP BY value->>'size'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Check the selected sizes and stock quantities.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(COALESCE(p_input->'images', '[]'::JSONB)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'You can add up to 8 images.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(COALESCE(p_input->'images', '[]'::JSONB)) > 8 THEN
    RAISE EXCEPTION 'You can add up to 8 images.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(p_input->'images', '[]'::JSONB)) AS image(url)
    WHERE url !~ '^(https://[^[:space:]]+|/uploads/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|avif))$'
  ) THEN
    RAISE EXCEPTION 'Images must be uploaded files or HTTPS links.' USING ERRCODE = 'P0001';
  END IF;
  IF (p_input->>'original_price') IS NOT NULL
    AND (p_input->>'original_price')::NUMERIC < (p_input->>'selling_price')::NUMERIC THEN
    RAISE EXCEPTION 'Original price must be equal to or higher than the selling price.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO products (
    id, name, slug, category_id, description, cost_price, selling_price, original_price, is_published
  ) VALUES (
    new_product_id, clean_name, clean_slug, product_category,
    COALESCE(p_input->>'description', ''),
    (p_input->>'cost_price')::NUMERIC,
    (p_input->>'selling_price')::NUMERIC,
    NULLIF(p_input->>'original_price', '')::NUMERIC,
    COALESCE((p_input->>'is_published')::BOOLEAN, true)
  );

  FOR stock_size IN SELECT unnest(ARRAY['S','M','L','XL','XXL']::product_size[]) LOOP
    stock_quantity := 0;
    FOR item IN SELECT value FROM jsonb_array_elements(p_input->'sizes') LOOP
      IF item->>'size' = stock_size::TEXT THEN
        stock_quantity := (item->>'quantity')::INTEGER;
        EXIT;
      END IF;
    END LOOP;
    IF stock_quantity < 0 OR stock_quantity > 100000 THEN
      RAISE EXCEPTION 'Stock quantity must be between 0 and 100000.' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO product_size_stock (product_id, size, initial_quantity)
      VALUES (new_product_id, stock_size, stock_quantity);
    IF stock_quantity > 0 THEN
      INSERT INTO stock_events (
        product_id, size, event_type, quantity_before, quantity_change, quantity_after, note, admin_id
      ) VALUES (
        new_product_id, stock_size, 'stock_added', 0, stock_quantity, stock_quantity, 'Initial stock', auth.uid()
      );
    END IF;
  END LOOP;

  INSERT INTO product_images (product_id, image_url, sort_order)
    SELECT new_product_id, value, ordinality - 1
    FROM jsonb_array_elements_text(COALESCE(p_input->'images', '[]'::JSONB)) WITH ORDINALITY;
  RETURN new_product_id;
END;
$$;

CREATE FUNCTION admin_update_product(p_product_id UUID, p_input JSONB, p_slug TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  old_product products;
  clean_name TEXT := trim(p_input->>'name');
  clean_slug TEXT;
  base_slug TEXT := trim(both '-' FROM p_slug);
  suffix INTEGER := 2;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO old_product FROM products WHERE id = p_product_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found.' USING ERRCODE = 'P0001'; END IF;
  IF length(clean_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Product name must be between 2 and 120 characters.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM categories WHERE id = (p_input->>'category_id')::UUID) THEN
    RAISE EXCEPTION 'Choose a valid category.' USING ERRCODE = 'P0001';
  END IF;
  IF (p_input->>'original_price') IS NOT NULL
    AND (p_input->>'original_price')::NUMERIC < (p_input->>'selling_price')::NUMERIC THEN
    RAISE EXCEPTION 'Original price must be equal to or higher than the selling price.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(COALESCE(p_input->'images', '[]'::JSONB)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'You can add up to 8 images.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(COALESCE(p_input->'images', '[]'::JSONB)) > 8 THEN
    RAISE EXCEPTION 'You can add up to 8 images.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(p_input->'images', '[]'::JSONB)) AS image(url)
    WHERE url !~ '^(https://[^[:space:]]+|/uploads/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|avif))$'
  ) THEN
    RAISE EXCEPTION 'Images must be uploaded files or HTTPS links.' USING ERRCODE = 'P0001';
  END IF;

  clean_slug := old_product.slug;
  IF clean_name <> old_product.name THEN
    IF base_slug = '' THEN base_slug := 'product'; END IF;
    clean_slug := base_slug;
    WHILE EXISTS (
      SELECT 1 FROM products WHERE slug = clean_slug AND deleted_at IS NULL AND id <> p_product_id
    ) LOOP
      clean_slug := base_slug || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;
  END IF;
  UPDATE products SET
    name = clean_name,
    slug = clean_slug,
    category_id = (p_input->>'category_id')::UUID,
    description = COALESCE(p_input->>'description', ''),
    cost_price = (p_input->>'cost_price')::NUMERIC,
    selling_price = (p_input->>'selling_price')::NUMERIC,
    original_price = NULLIF(p_input->>'original_price', '')::NUMERIC,
    is_published = COALESCE((p_input->>'is_published')::BOOLEAN, true)
  WHERE id = p_product_id;

  DELETE FROM product_images WHERE product_id = p_product_id;
  INSERT INTO product_images (product_id, image_url, sort_order)
    SELECT p_product_id, value, ordinality - 1
    FROM jsonb_array_elements_text(COALESCE(p_input->'images', '[]'::JSONB)) WITH ORDINALITY;
  RETURN p_product_id;
END;
$$;

CREATE FUNCTION admin_update_stock(p_product_id UUID, p_sizes JSONB, p_note TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  item JSONB;
  current_stock product_size_stock;
  selected_size product_size;
  next_initial INTEGER;
  before_quantity INTEGER;
  after_quantity INTEGER;
  kind stock_event_type;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM products WHERE id = p_product_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found.' USING ERRCODE = 'P0001'; END IF;
  IF jsonb_typeof(p_sizes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Choose at least one size to update.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(p_sizes) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Choose at least one size to update.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_sizes) WITH ORDINALITY AS a(value, ordinality)
    JOIN jsonb_array_elements(p_sizes) WITH ORDINALITY AS b(value, ordinality)
      ON a.ordinality < b.ordinality AND a.value->>'size' = b.value->>'size'
  ) THEN
    RAISE EXCEPTION 'Each size can only appear once.' USING ERRCODE = 'P0001';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_sizes) LOOP
    selected_size := (item->>'size')::product_size;
    next_initial := (item->>'initial_quantity')::INTEGER;
    IF next_initial < 0 OR next_initial > 100000 THEN
      RAISE EXCEPTION 'Stock quantity must be between 0 and 100000.' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO current_stock FROM product_size_stock
      WHERE product_id = p_product_id AND size = selected_size FOR UPDATE;
    IF NOT FOUND THEN
      current_stock.initial_quantity := 0;
      current_stock.sold_quantity := 0;
      before_quantity := 0;
      INSERT INTO product_size_stock (product_id, size, initial_quantity)
        VALUES (p_product_id, selected_size, next_initial);
    ELSE
      IF next_initial < current_stock.sold_quantity THEN
        RAISE EXCEPTION 'Size % has already sold %. Stock cannot be lower than that.',
          selected_size, current_stock.sold_quantity USING ERRCODE = 'P0001';
      END IF;
      before_quantity := current_stock.initial_quantity - current_stock.sold_quantity;
      UPDATE product_size_stock SET initial_quantity = next_initial
        WHERE product_id = p_product_id AND size = selected_size;
    END IF;
    after_quantity := next_initial - current_stock.sold_quantity;
    IF next_initial <> current_stock.initial_quantity THEN
      kind := CASE
        WHEN after_quantity > before_quantity THEN 'stock_added'::stock_event_type
        ELSE 'stock_adjusted'::stock_event_type
      END;
      INSERT INTO stock_events (
        product_id, size, event_type, quantity_before, quantity_change, quantity_after, note, admin_id
      ) VALUES (
        p_product_id, selected_size, kind, before_quantity, after_quantity - before_quantity,
        after_quantity, NULLIF(trim(p_note), ''), auth.uid()
      );
    END IF;
  END LOOP;
  RETURN p_product_id;
END;
$$;

CREATE FUNCTION admin_mark_size_sold_out(p_product_id UUID, p_size product_size)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_stock product_size_stock;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM products WHERE id = p_product_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found.' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO current_stock FROM product_size_stock
    WHERE product_id = p_product_id AND size = p_size FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Size % is not set up for this product.', p_size USING ERRCODE = 'P0001'; END IF;
  IF current_stock.available_quantity > 0 THEN
    UPDATE product_size_stock SET initial_quantity = sold_quantity
      WHERE product_id = p_product_id AND size = p_size;
    INSERT INTO stock_events (
      product_id, size, event_type, quantity_before, quantity_change, quantity_after, admin_id
    ) VALUES (
      p_product_id, p_size, 'size_marked_sold_out', current_stock.available_quantity,
      -current_stock.available_quantity, 0, auth.uid()
    );
  END IF;
  RETURN p_product_id;
END;
$$;

CREATE FUNCTION admin_mark_sold_out(p_product_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  stock_row product_size_stock;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM products WHERE id = p_product_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found.' USING ERRCODE = 'P0001'; END IF;
  FOR stock_row IN
    SELECT * FROM product_size_stock
    WHERE product_id = p_product_id AND available_quantity > 0 FOR UPDATE
  LOOP
    UPDATE product_size_stock SET initial_quantity = sold_quantity WHERE id = stock_row.id;
    INSERT INTO stock_events (
      product_id, size, event_type, quantity_before, quantity_change, quantity_after, admin_id
    ) VALUES (
      p_product_id, stock_row.size, 'product_marked_sold_out', stock_row.available_quantity,
      -stock_row.available_quantity, 0, auth.uid()
    );
  END LOOP;
  RETURN p_product_id;
END;
$$;

CREATE FUNCTION admin_record_sale(
  p_product_id UUID,
  p_size product_size,
  p_quantity INTEGER,
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  product_row products;
  stock_row product_size_stock;
  new_sale_id UUID;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  IF p_quantity NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Quantity must be between 1 and 1000.' USING ERRCODE = 'P0001';
  END IF;
  IF p_customer_name IS NOT NULL AND length(trim(p_customer_name)) > 120 THEN
    RAISE EXCEPTION 'Customer name must be 120 characters or fewer.' USING ERRCODE = 'P0001';
  END IF;
  IF p_customer_phone IS NOT NULL AND p_customer_phone !~ '^\+?[0-9 ]{6,20}$' THEN
    RAISE EXCEPTION 'Enter a valid phone number.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO product_row FROM products WHERE id = p_product_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found.' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO stock_row FROM product_size_stock
    WHERE product_id = p_product_id AND size = p_size FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Size % is not set up for this product.', p_size USING ERRCODE = 'P0001'; END IF;
  IF stock_row.available_quantity < p_quantity THEN
    RAISE EXCEPTION 'Only % left in size %.', stock_row.available_quantity, p_size USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO sales (product_id, size, quantity, selling_price, cost_price, customer_name, customer_phone)
  VALUES (
    p_product_id, p_size, p_quantity, product_row.selling_price, product_row.cost_price,
    NULLIF(trim(p_customer_name), ''), NULLIF(trim(p_customer_phone), '')
  ) RETURNING id INTO new_sale_id;
  UPDATE product_size_stock SET sold_quantity = sold_quantity + p_quantity WHERE id = stock_row.id;
  INSERT INTO stock_events (
    product_id, size, event_type, quantity_before, quantity_change, quantity_after, admin_id
  ) VALUES (
    p_product_id, p_size, 'stock_sold', stock_row.available_quantity, -p_quantity,
    stock_row.available_quantity - p_quantity, auth.uid()
  );
  RETURN new_sale_id;
END;
$$;

CREATE FUNCTION admin_cancel_sale(p_sale_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  sale_row sales;
  stock_row product_size_stock;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO sale_row FROM sales WHERE id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found.' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM products WHERE id = sale_row.product_id FOR UPDATE;
  SELECT * INTO sale_row FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF sale_row.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed sales can be cancelled.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO stock_row FROM product_size_stock
    WHERE product_id = sale_row.product_id AND size = sale_row.size FOR UPDATE;
  UPDATE sales SET status = 'cancelled' WHERE id = p_sale_id;
  IF FOUND AND stock_row.id IS NOT NULL THEN
    UPDATE product_size_stock SET sold_quantity = sold_quantity - sale_row.quantity
      WHERE id = stock_row.id AND sold_quantity >= sale_row.quantity;
    IF NOT FOUND THEN RAISE EXCEPTION 'Stock could not be restored for this sale.' USING ERRCODE = 'P0001'; END IF;
    INSERT INTO stock_events (
      product_id, size, event_type, quantity_before, quantity_change, quantity_after, note, admin_id
    ) VALUES (
      sale_row.product_id, sale_row.size, 'stock_adjusted', stock_row.available_quantity,
      sale_row.quantity, stock_row.available_quantity + sale_row.quantity, 'Sale cancelled', auth.uid()
    );
  END IF;
  RETURN p_sale_id;
END;
$$;

CREATE FUNCTION admin_update_settings(p_low_stock_threshold INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  IF p_low_stock_threshold NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Enter a whole number from 1 to 1000.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO app_settings (key, value) VALUES ('low_stock_threshold', p_low_stock_threshold::TEXT)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  UPDATE products SET status = product_status_for(id);
END;
$$;

CREATE VIEW store_categories WITH (security_barrier = true) AS
SELECT name, slug FROM categories;

CREATE VIEW store_products WITH (security_barrier = true) AS
SELECT
  p.id,
  p.name,
  p.slug,
  p.description,
  p.selling_price,
  p.original_price,
  p.created_at,
  jsonb_build_object('name', c.name, 'slug', c.slug) AS category,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('size', s.size, 'available', s.available_quantity > 0) ORDER BY
      CASE s.size WHEN 'S' THEN 1 WHEN 'M' THEN 2 WHEN 'L' THEN 3 WHEN 'XL' THEN 4 ELSE 5 END)
    FROM product_size_stock s WHERE s.product_id = p.id
  ), '[]'::JSONB) AS sizes,
  COALESCE((
    SELECT jsonb_agg(i.image_url ORDER BY i.sort_order, i.created_at)
    FROM product_images i WHERE i.product_id = p.id
  ), '[]'::JSONB) AS images,
  COALESCE((
    SELECT array_agg(s.size::TEXT ORDER BY
      CASE s.size WHEN 'S' THEN 1 WHEN 'M' THEN 2 WHEN 'L' THEN 3 WHEN 'XL' THEN 4 ELSE 5 END)
    FROM product_size_stock s WHERE s.product_id = p.id AND s.available_quantity > 0
  ), ARRAY[]::TEXT[]) AS available_sizes,
  COALESCE((
    SELECT sum(s.available_quantity) FROM product_size_stock s WHERE s.product_id = p.id
  ), 0) > 0 AS available,
  CASE WHEN COALESCE((
    SELECT sum(s.available_quantity) FROM product_size_stock s WHERE s.product_id = p.id
  ), 0) > 0 THEN 'available' ELSE 'sold_out' END AS status
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.deleted_at IS NULL AND p.is_published;

CREATE VIEW store_config WITH (security_barrier = true) AS
SELECT NULLIF(value, '') AS whatsapp_number
FROM app_settings WHERE key = 'whatsapp_number';

CREATE VIEW admin_products WITH (security_barrier = true) AS
SELECT
  p.id,
  p.name,
  p.slug,
  p.description,
  jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug) AS category,
  p.cost_price,
  p.selling_price,
  p.original_price,
  COALESCE((
    SELECT jsonb_agg(i.image_url ORDER BY i.sort_order, i.created_at)
    FROM product_images i WHERE i.product_id = p.id
  ), '[]'::JSONB) AS images,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'size', s.size,
      'initial_quantity', s.initial_quantity,
      'sold_quantity', s.sold_quantity,
      'available_quantity', s.available_quantity
    ) ORDER BY CASE s.size WHEN 'S' THEN 1 WHEN 'M' THEN 2 WHEN 'L' THEN 3 WHEN 'XL' THEN 4 ELSE 5 END)
    FROM product_size_stock s WHERE s.product_id = p.id
  ), '[]'::JSONB) AS sizes,
  COALESCE((SELECT sum(s.initial_quantity) FROM product_size_stock s WHERE s.product_id = p.id), 0) AS total_quantity,
  COALESCE((SELECT sum(s.sold_quantity) FROM product_size_stock s WHERE s.product_id = p.id), 0) AS sold_quantity,
  COALESCE((SELECT sum(s.available_quantity) FROM product_size_stock s WHERE s.product_id = p.id), 0) AS available_quantity,
  p.selling_price - p.cost_price AS profit_per_unit,
  (p.selling_price - p.cost_price) * COALESCE(
    (SELECT sum(s.sold_quantity) FROM product_size_stock s WHERE s.product_id = p.id), 0
  ) AS estimated_profit,
  p.status,
  p.is_published,
  p.created_at,
  p.updated_at
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.deleted_at IS NULL AND is_admin();

CREATE VIEW admin_sales WITH (security_barrier = true) AS
SELECT
  s.id,
  s.product_id,
  p.name AS product_name,
  s.size,
  s.quantity,
  s.selling_price,
  s.cost_price,
  s.profit,
  s.customer_name,
  s.customer_phone,
  s.status,
  s.created_at
FROM sales s
JOIN products p ON p.id = s.product_id
WHERE is_admin();

CREATE VIEW admin_stock_events WITH (security_barrier = true) AS
SELECT
  e.id,
  e.product_id,
  p.name AS product_name,
  e.size,
  e.event_type,
  e.quantity_before,
  e.quantity_change,
  e.quantity_after,
  e.note,
  e.created_at
FROM stock_events e
JOIN products p ON p.id = e.product_id
WHERE is_admin();

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_size_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_select_admins ON admins FOR SELECT TO authenticated
USING (id = auth.uid() AND is_admin());
CREATE POLICY admin_all_categories ON categories FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY admin_all_products ON products FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY admin_all_product_images ON product_images FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY admin_all_product_stock ON product_size_stock FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY admin_all_sales ON sales FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY admin_all_stock_events ON stock_events FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY admin_all_settings ON app_settings FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT SELECT ON store_categories, store_products, store_config TO anon, authenticated;
GRANT SELECT ON admin_products, admin_sales, admin_stock_events TO authenticated;
GRANT USAGE ON TYPE product_size, product_status, sale_status, stock_event_type TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  admins, categories, products, product_images, product_size_stock, sales, stock_events, app_settings
TO authenticated;

REVOKE ALL ON FUNCTION is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION product_status_for(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION refresh_product_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION category_slug(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_create_category(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_update_category(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_delete_category(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_create_product(JSONB, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_update_product(UUID, JSONB, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_update_stock(UUID, JSONB, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_mark_size_sold_out(UUID, product_size) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_mark_sold_out(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_record_sale(UUID, product_size, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_cancel_sale(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_update_settings(INTEGER) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_create_category(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_category(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_category(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_create_product(JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_product(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_stock(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_mark_size_sold_out(UUID, product_size) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_mark_sold_out(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_record_sale(UUID, product_size, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_cancel_sale(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_settings(INTEGER) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Public product image reads" ON storage.objects
FOR SELECT TO anon, authenticated USING (bucket_id = 'product-images');
CREATE POLICY "Admins upload product images" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images' AND public.is_admin());
CREATE POLICY "Admins update product images" ON storage.objects
FOR UPDATE TO authenticated USING (bucket_id = 'product-images' AND public.is_admin())
WITH CHECK (bucket_id = 'product-images' AND public.is_admin());
CREATE POLICY "Admins delete product images" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'product-images' AND public.is_admin());
