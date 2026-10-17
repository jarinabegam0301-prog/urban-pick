-- URBAN schema
-- Creates every table and column. Does not create the database itself.
--
-- On the machine that has PostgreSQL, create an empty database, then run:
--   psql -d urban -f backend/schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

CREATE TYPE admin_role AS ENUM ('admin');

CREATE TYPE product_size AS ENUM ('S', 'M', 'L', 'XL', 'XXL');

CREATE TYPE product_status AS ENUM (
  'in_stock',
  'low_stock',
  'partially_sold_out',
  'sold_out'
);

CREATE TYPE sale_status AS ENUM ('pending', 'confirmed', 'cancelled');

CREATE TYPE stock_event_type AS ENUM (
  'stock_added',
  'stock_sold',
  'stock_adjusted',
  'size_marked_sold_out',
  'product_marked_sold_out'
);

-- ---------------------------------------------------------------------------
-- Shared trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Admins
-- Password hashes are stored here. Never put a real password in this file.
-- Create the first admin on the database machine after this script runs.
-- ---------------------------------------------------------------------------

CREATE TABLE admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          admin_role NOT NULL DEFAULT 'admin',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admins_email_unique UNIQUE (email)
);

CREATE TRIGGER admins_set_updated_at
BEFORE UPDATE ON admins
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT categories_name_unique UNIQUE (name),
  CONSTRAINT categories_slug_unique UNIQUE (slug)
);

CREATE TRIGGER categories_set_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO categories (name, slug) VALUES
  ('T-Shirts', 't-shirts'),
  ('Shirts', 'shirts'),
  ('Pants', 'pants'),
  ('Hoodies', 'hoodies'),
  ('Others', 'others');

-- ---------------------------------------------------------------------------
-- Products
-- cost_price is admin-only. Public queries must not select it.
-- original_price is the public strike-through price, not the cost price.
-- is_published hides a product from the store without deleting it.
-- deleted_at is a soft delete so sales history can be kept.
-- status is maintained by the application from size stock.
-- ---------------------------------------------------------------------------

CREATE TABLE products (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL,
  category_id    UUID NOT NULL REFERENCES categories (id),
  description    TEXT NOT NULL DEFAULT '',
  cost_price     NUMERIC(12, 2) NOT NULL,
  selling_price  NUMERIC(12, 2) NOT NULL,
  original_price NUMERIC(12, 2),
  status         product_status NOT NULL DEFAULT 'in_stock',
  is_published   BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT products_prices_non_negative CHECK (
    cost_price >= 0 AND selling_price >= 0
  ),
  CONSTRAINT products_original_price_valid CHECK (
    original_price IS NULL OR original_price >= selling_price
  )
);

CREATE UNIQUE INDEX products_slug_active_idx
  ON products (slug)
  WHERE deleted_at IS NULL;

CREATE INDEX products_category_id_idx ON products (category_id);
CREATE INDEX products_status_idx ON products (status);
CREATE INDEX products_created_at_idx ON products (created_at DESC);
CREATE INDEX products_store_idx
  ON products (is_published, selling_price)
  WHERE deleted_at IS NULL;

CREATE TRIGGER products_set_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Product images
-- ---------------------------------------------------------------------------

CREATE TABLE product_images (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  image_url  TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_images_sort_order_non_negative CHECK (sort_order >= 0)
);

CREATE INDEX product_images_product_id_idx
  ON product_images (product_id, sort_order);

-- ---------------------------------------------------------------------------
-- Size stock
-- available_quantity is always initial_quantity - sold_quantity.
-- A sale cannot exceed the initial quantity, so available never goes below 0.
-- ---------------------------------------------------------------------------

CREATE TABLE product_size_stock (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  size               product_size NOT NULL,
  initial_quantity   INTEGER NOT NULL,
  sold_quantity      INTEGER NOT NULL DEFAULT 0,
  available_quantity INTEGER GENERATED ALWAYS AS (initial_quantity - sold_quantity) STORED,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_size_stock_product_size_unique UNIQUE (product_id, size),
  CONSTRAINT product_size_stock_quantities_valid CHECK (
    initial_quantity >= 0
    AND sold_quantity >= 0
    AND sold_quantity <= initial_quantity
  )
);

CREATE INDEX product_size_stock_product_id_idx
  ON product_size_stock (product_id);

CREATE TRIGGER product_size_stock_set_updated_at
BEFORE UPDATE ON product_size_stock
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Sales
-- Prices are copied onto the sale so later product edits do not rewrite history.
-- ---------------------------------------------------------------------------

CREATE TABLE sales (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID NOT NULL REFERENCES products (id),
  size           product_size NOT NULL,
  quantity       INTEGER NOT NULL,
  selling_price  NUMERIC(12, 2) NOT NULL,
  cost_price     NUMERIC(12, 2) NOT NULL,
  profit         NUMERIC(12, 2) GENERATED ALWAYS AS (
    (selling_price - cost_price) * quantity
  ) STORED,
  customer_name  TEXT,
  customer_phone TEXT,
  status         sale_status NOT NULL DEFAULT 'confirmed',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sales_quantity_positive CHECK (quantity > 0),
  CONSTRAINT sales_prices_non_negative CHECK (
    selling_price >= 0 AND cost_price >= 0
  )
);

CREATE INDEX sales_product_id_idx ON sales (product_id);
CREATE INDEX sales_created_at_idx ON sales (created_at DESC);
CREATE INDEX sales_status_idx ON sales (status);

-- ---------------------------------------------------------------------------
-- Stock history
-- quantity_before / quantity_after refer to available quantity for that size.
-- size is null when the event applies to the whole product.
-- ---------------------------------------------------------------------------

CREATE TABLE stock_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID NOT NULL REFERENCES products (id),
  size             product_size,
  event_type       stock_event_type NOT NULL,
  quantity_before  INTEGER NOT NULL,
  quantity_change  INTEGER NOT NULL,
  quantity_after   INTEGER NOT NULL,
  note             TEXT,
  admin_id         UUID REFERENCES admins (id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stock_events_quantities_non_negative CHECK (
    quantity_before >= 0 AND quantity_after >= 0
  )
);

CREATE INDEX stock_events_product_id_idx
  ON stock_events (product_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- App settings
-- WhatsApp number stays in the environment, not in this table.
-- ---------------------------------------------------------------------------

CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER app_settings_set_updated_at
BEFORE UPDATE ON app_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO app_settings (key, value) VALUES
  ('low_stock_threshold', '5');
