import uuid
from datetime import datetime

import psycopg
from psycopg.rows import dict_row

from app.catalog import (
    SIZES,
    CatalogError,
    _dashboard,
    _event_out,
    _filter_public,
    _page,
    _period_start,
    _sale_out,
    _sort_public,
    money,
    now,
    product_status,
    size_rows,
    slugify,
)


class PostgresStore:
    """Uses the tables created by backend/schema.sql. Does not create the database."""

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def _connect(self):
        return psycopg.connect(self.database_url, row_factory=dict_row)

    def ensure_admin(self, email: str, password_hash: str, name: str) -> None:
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT id FROM admins WHERE email = %s", (email.lower(),)
            ).fetchone()
            if existing:
                return
            conn.execute(
                """
                INSERT INTO admins (name, email, password_hash)
                VALUES (%s, %s, %s)
                """,
                (name, email.lower(), password_hash),
            )

    def admin_by_email(self, email: str) -> dict | None:
        with self._connect() as conn:
            return conn.execute(
                "SELECT id::text, name, email, password_hash, role::text FROM admins WHERE email = %s",
                (email.lower(),),
            ).fetchone()

    def admin_by_id(self, admin_id: str) -> dict | None:
        with self._connect() as conn:
            return conn.execute(
                "SELECT id::text, name, email, password_hash, role::text FROM admins WHERE id = %s",
                (admin_id,),
            ).fetchone()

    def categories_public(self) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id::text, name, slug FROM categories ORDER BY name"
            ).fetchall()
        return rows

    def list_public(self, filters: dict) -> dict:
        items = [self._public(product) for product in self._load_all()]
        items = _filter_public(items, filters)
        items = _sort_public(items, filters.get("sort") or "newest")
        return _page(items, filters.get("page") or 1, filters.get("page_size") or 12)

    def get_public(self, product_id: str) -> dict:
        return self._public(self._load_one(product_id))

    def list_admin(self, filters: dict) -> dict:
        items = [self._admin(product) for product in self._load_all()]
        query = (filters.get("q") or "").strip().lower()
        if query:
            items = [item for item in items if query in item["name"].lower()]
        status = filters.get("status") or ""
        if status:
            items = [item for item in items if item["status"] == status]
        items.sort(key=lambda item: item["created_at"], reverse=True)
        return _page(items, filters.get("page") or 1, filters.get("page_size") or 12)

    def get_admin(self, product_id: str) -> dict:
        return self._admin(self._load_one(product_id))

    def create_product(self, payload: dict, admin_id: str) -> dict:
        product_id = str(uuid.uuid4())
        sizes = size_rows(payload["sizes"])
        with self._connect() as conn:
            category = conn.execute(
                "SELECT id::text, name FROM categories WHERE id = %s",
                (payload["category_id"],),
            ).fetchone()
            if not category:
                raise CatalogError("Category not found.", 404)
            threshold = self._threshold(conn)
            status = product_status(sizes, threshold)
            slug = self._unique_slug(conn, payload["name"])
            conn.execute(
                """
                INSERT INTO products
                  (id, name, slug, category_id, description, cost_price, selling_price, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    product_id,
                    payload["name"].strip(),
                    slug,
                    payload["category_id"],
                    payload.get("description") or "",
                    money(payload["cost_price"]),
                    money(payload["selling_price"]),
                    status,
                ),
            )
            for size, row in sizes.items():
                conn.execute(
                    """
                    INSERT INTO product_size_stock (product_id, size, initial_quantity, sold_quantity)
                    VALUES (%s, %s, %s, 0)
                    """,
                    (product_id, size, row["initial_quantity"]),
                )
                if row["initial_quantity"] > 0:
                    self._insert_event(
                        conn,
                        product_id,
                        size,
                        "stock_added",
                        0,
                        row["initial_quantity"],
                        row["initial_quantity"],
                        admin_id,
                        "Initial stock",
                    )
            for image in _clean_images(payload.get("images") or []):
                conn.execute(
                    """
                    INSERT INTO product_images (product_id, image_url, sort_order)
                    VALUES (%s, %s, %s)
                    """,
                    (product_id, image["image_url"], image["sort_order"]),
                )
        return self.get_admin(product_id)

    def update_product(self, product_id: str, payload: dict, admin_id: str) -> dict:
        with self._connect() as conn:
            product = self._load_one(product_id, conn)
            if "category_id" in payload:
                category = conn.execute(
                    "SELECT id FROM categories WHERE id = %s", (payload["category_id"],)
                ).fetchone()
                if not category:
                    raise CatalogError("Category not found.", 404)
                product["category_id"] = payload["category_id"]
            if "name" in payload:
                product["name"] = payload["name"].strip()
            if "description" in payload:
                product["description"] = payload["description"]
            if "cost_price" in payload:
                product["cost_price"] = money(payload["cost_price"])
            if "selling_price" in payload:
                product["selling_price"] = money(payload["selling_price"])
            if "sizes" in payload:
                self._apply_initial(conn, product, payload["sizes"], admin_id)
            product["status"] = product_status(product["sizes"], self._threshold(conn))
            conn.execute(
                """
                UPDATE products
                SET name = %s, category_id = %s, description = %s,
                    cost_price = %s, selling_price = %s, status = %s
                WHERE id = %s AND deleted_at IS NULL
                """,
                (
                    product["name"],
                    product["category_id"],
                    product["description"],
                    product["cost_price"],
                    product["selling_price"],
                    product["status"],
                    product_id,
                ),
            )
            if "images" in payload:
                conn.execute("DELETE FROM product_images WHERE product_id = %s", (product_id,))
                for image in _clean_images(payload["images"]):
                    conn.execute(
                        """
                        INSERT INTO product_images (product_id, image_url, sort_order)
                        VALUES (%s, %s, %s)
                        """,
                        (product_id, image["image_url"], image["sort_order"]),
                    )
        return self.get_admin(product_id)

    def delete_product(self, product_id: str) -> None:
        with self._connect() as conn:
            self._load_one(product_id, conn)
            conn.execute(
                "UPDATE products SET deleted_at = now() WHERE id = %s AND deleted_at IS NULL",
                (product_id,),
            )

    def mark_sold_out(self, product_id: str, admin_id: str) -> dict:
        with self._connect() as conn:
            product = self._load_one(product_id, conn)
            for size, row in product["sizes"].items():
                available = row["initial_quantity"] - row["sold_quantity"]
                if available <= 0:
                    continue
                row["sold_quantity"] = row["initial_quantity"]
                conn.execute(
                    """
                    UPDATE product_size_stock
                    SET sold_quantity = initial_quantity
                    WHERE product_id = %s AND size = %s
                    """,
                    (product_id, size),
                )
                self._insert_event(
                    conn,
                    product_id,
                    size,
                    "product_marked_sold_out",
                    available,
                    -available,
                    0,
                    admin_id,
                    "Product marked sold out",
                )
            conn.execute(
                "UPDATE products SET status = 'sold_out' WHERE id = %s",
                (product_id,),
            )
        return self.get_admin(product_id)

    def mark_size_sold_out(self, product_id: str, size: str, admin_id: str) -> dict:
        if size not in SIZES:
            raise CatalogError("Size must be S, M, L, XL, or XXL.")
        with self._connect() as conn:
            product = self._load_one(product_id, conn)
            row = product["sizes"][size]
            available = row["initial_quantity"] - row["sold_quantity"]
            conn.execute(
                """
                UPDATE product_size_stock
                SET sold_quantity = initial_quantity
                WHERE product_id = %s AND size = %s
                """,
                (product_id, size),
            )
            if available > 0:
                self._insert_event(
                    conn,
                    product_id,
                    size,
                    "size_marked_sold_out",
                    available,
                    -available,
                    0,
                    admin_id,
                    f"{size} marked sold out",
                )
            row["sold_quantity"] = row["initial_quantity"]
            status = product_status(product["sizes"], self._threshold(conn))
            conn.execute("UPDATE products SET status = %s WHERE id = %s", (status, product_id))
        return self.get_admin(product_id)

    def record_sale(self, payload: dict, admin_id: str) -> dict:
        size = payload["size"]
        quantity = int(payload["quantity"])
        if size not in SIZES:
            raise CatalogError("Size must be S, M, L, XL, or XXL.")
        if quantity < 1:
            raise CatalogError("Quantity must be at least 1.")
        with self._connect() as conn:
            product = self._load_one(payload["product_id"], conn)
            row = product["sizes"][size]
            available = row["initial_quantity"] - row["sold_quantity"]
            if quantity > available:
                raise CatalogError(
                    f"Only {available} available in size {size}. Requested {quantity}."
                )
            conn.execute(
                """
                UPDATE product_size_stock
                SET sold_quantity = sold_quantity + %s
                WHERE product_id = %s AND size = %s
                """,
                (quantity, product["id"], size),
            )
            sale_id = str(uuid.uuid4())
            profit = money((product["selling_price"] - product["cost_price"]) * quantity)
            created = now()
            conn.execute(
                """
                INSERT INTO sales
                  (id, product_id, size, quantity, selling_price, cost_price, customer_name, customer_phone, status, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'confirmed', %s)
                """,
                (
                    sale_id,
                    product["id"],
                    size,
                    quantity,
                    product["selling_price"],
                    product["cost_price"],
                    payload.get("customer_name") or None,
                    payload.get("customer_phone") or None,
                    created,
                ),
            )
            self._insert_event(
                conn,
                product["id"],
                size,
                "stock_sold",
                available,
                -quantity,
                available - quantity,
                admin_id,
                "Sale recorded",
            )
            row["sold_quantity"] += quantity
            status = product_status(product["sizes"], self._threshold(conn))
            conn.execute("UPDATE products SET status = %s WHERE id = %s", (status, product["id"]))
        return {
            "id": sale_id,
            "product_id": product["id"],
            "product_name": product["name"],
            "size": size,
            "quantity": quantity,
            "selling_price": product["selling_price"],
            "cost_price": product["cost_price"],
            "profit": profit,
            "customer_name": payload.get("customer_name") or "",
            "customer_phone": payload.get("customer_phone") or "",
            "status": "confirmed",
            "created_at": created.isoformat(),
        }

    def history(self, product_id: str) -> list[dict]:
        with self._connect() as conn:
            self._load_one(product_id, conn)
            rows = conn.execute(
                """
                SELECT id::text, product_id::text, size::text, event_type::text,
                       quantity_before, quantity_change, quantity_after, note, created_at
                FROM stock_events
                WHERE product_id = %s
                ORDER BY created_at DESC
                """,
                (product_id,),
            ).fetchall()
        return [_event_out(row) for row in rows]

    def sales_list(self, filters: dict) -> dict:
        start = _period_start(filters.get("period") or "month")
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT s.id::text, s.product_id::text, p.name AS product_name, s.size::text,
                       s.quantity, s.selling_price, s.cost_price, s.profit,
                       COALESCE(s.customer_name, '') AS customer_name,
                       COALESCE(s.customer_phone, '') AS customer_phone,
                       s.status::text, s.created_at
                FROM sales s
                JOIN products p ON p.id = s.product_id
                WHERE s.created_at >= %s AND s.status = 'confirmed'
                ORDER BY s.created_at DESC
                """,
                (start,),
            ).fetchall()
        items = [_sale_out(_numeric_sale(row)) for row in rows]
        return _page(items, filters.get("page") or 1, filters.get("page_size") or 12)

    def dashboard(self, period: str) -> dict:
        start = _period_start(period)
        products = [self._admin(product) for product in self._load_all()]
        with self._connect() as conn:
            period_rows = conn.execute(
                """
                SELECT s.id::text, s.product_id::text, p.name AS product_name, s.size::text,
                       s.quantity, s.selling_price, s.cost_price, s.profit,
                       COALESCE(s.customer_name, '') AS customer_name,
                       COALESCE(s.customer_phone, '') AS customer_phone,
                       s.status::text, s.created_at
                FROM sales s
                JOIN products p ON p.id = s.product_id
                WHERE s.created_at >= %s AND s.status = 'confirmed'
                """,
                (start,),
            ).fetchall()
            all_rows = conn.execute(
                """
                SELECT s.id::text, s.product_id::text, p.name AS product_name, s.size::text,
                       s.quantity, s.selling_price, s.cost_price, s.profit,
                       '' AS customer_name, '' AS customer_phone, s.status::text, s.created_at
                FROM sales s
                JOIN products p ON p.id = s.product_id
                WHERE s.status = 'confirmed'
                """
            ).fetchall()
        return _dashboard(
            products,
            [_numeric_sale(row) for row in period_rows],
            [_numeric_sale(row) for row in all_rows],
            period,
        )

    def inventory(self) -> list[dict]:
        return [
            {
                "id": item["id"],
                "name": item["name"],
                "category": item["category"],
                "total_quantity": item["total_quantity"],
                "available_quantity": item["available_quantity"],
                "sold_quantity": item["sold_quantity"],
                "status": item["status"],
            }
            for item in (self._admin(product) for product in self._load_all())
        ]

    def get_settings(self) -> dict:
        with self._connect() as conn:
            return {"low_stock_threshold": self._threshold(conn)}

    def update_settings(self, threshold: int) -> dict:
        if threshold < 0:
            raise CatalogError("Low stock threshold cannot be negative.")
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO app_settings (key, value)
                VALUES ('low_stock_threshold', %s)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """,
                (str(threshold),),
            )
            products = self._load_all(conn)
            for product in products:
                status = product_status(product["sizes"], threshold)
                conn.execute(
                    "UPDATE products SET status = %s WHERE id = %s",
                    (status, product["id"]),
                )
        return {"low_stock_threshold": threshold}

    def _apply_initial(self, conn, product: dict, sizes: dict, admin_id: str) -> None:
        for size in SIZES:
            if size not in sizes:
                continue
            initial = int(sizes[size])
            if initial < 0:
                raise CatalogError(f"{size} quantity cannot be negative.")
            row = product["sizes"][size]
            if initial < row["sold_quantity"]:
                raise CatalogError(
                    f"{size} stock cannot be lower than the sold quantity ({row['sold_quantity']})."
                )
            before = row["initial_quantity"] - row["sold_quantity"]
            after = initial - row["sold_quantity"]
            row["initial_quantity"] = initial
            conn.execute(
                """
                UPDATE product_size_stock
                SET initial_quantity = %s
                WHERE product_id = %s AND size = %s
                """,
                (initial, product["id"], size),
            )
            if after != before:
                self._insert_event(
                    conn,
                    product["id"],
                    size,
                    "stock_adjusted",
                    before,
                    after - before,
                    after,
                    admin_id,
                    "Stock adjusted",
                )

    def _insert_event(
        self,
        conn,
        product_id: str,
        size: str | None,
        event_type: str,
        before: int,
        change: int,
        after: int,
        admin_id: str | None,
        note: str,
    ) -> None:
        conn.execute(
            """
            INSERT INTO stock_events
              (product_id, size, event_type, quantity_before, quantity_change, quantity_after, note, admin_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (product_id, size, event_type, before, change, after, note, admin_id),
        )

    def _threshold(self, conn) -> int:
        row = conn.execute(
            "SELECT value FROM app_settings WHERE key = 'low_stock_threshold'"
        ).fetchone()
        return int(row["value"]) if row else 5

    def _load_all(self, conn=None) -> list[dict]:
        own = conn is None
        connection = conn or self._connect()
        try:
            rows = connection.execute(
                """
                SELECT p.id::text, p.name, p.slug, p.category_id::text, c.name AS category,
                       p.description, p.cost_price, p.selling_price, p.status::text, p.created_at
                FROM products p
                JOIN categories c ON c.id = p.category_id
                WHERE p.deleted_at IS NULL
                ORDER BY p.created_at DESC
                """
            ).fetchall()
            return [self._hydrate(connection, row) for row in rows]
        finally:
            if own:
                connection.close()

    def _load_one(self, product_id: str, conn=None) -> dict:
        own = conn is None
        connection = conn or self._connect()
        try:
            row = connection.execute(
                """
                SELECT p.id::text, p.name, p.slug, p.category_id::text, c.name AS category,
                       p.description, p.cost_price, p.selling_price, p.status::text, p.created_at
                FROM products p
                JOIN categories c ON c.id = p.category_id
                WHERE p.id = %s AND p.deleted_at IS NULL
                """,
                (product_id,),
            ).fetchone()
            if not row:
                raise CatalogError("Product not found.", 404)
            return self._hydrate(connection, row)
        finally:
            if own:
                connection.close()

    def _hydrate(self, conn, row: dict) -> dict:
        sizes = {
            size: {"initial_quantity": 0, "sold_quantity": 0}
            for size in SIZES
        }
        for stock in conn.execute(
            """
            SELECT size::text, initial_quantity, sold_quantity
            FROM product_size_stock
            WHERE product_id = %s
            """,
            (row["id"],),
        ).fetchall():
            sizes[stock["size"]] = {
                "initial_quantity": stock["initial_quantity"],
                "sold_quantity": stock["sold_quantity"],
            }
        images = conn.execute(
            """
            SELECT id::text, product_id::text, image_url, sort_order
            FROM product_images
            WHERE product_id = %s
            ORDER BY sort_order
            """,
            (row["id"],),
        ).fetchall()
        created = row["created_at"]
        return {
            "id": row["id"],
            "name": row["name"],
            "slug": row["slug"],
            "category_id": row["category_id"],
            "category": row["category"],
            "description": row["description"],
            "cost_price": money(row["cost_price"]),
            "selling_price": money(row["selling_price"]),
            "status": row["status"],
            "created_at": created if isinstance(created, datetime) else now(),
            "images": images,
            "sizes": sizes,
        }

    def _unique_slug(self, conn, name: str) -> str:
        base = slugify(name)
        slug = base
        count = 2
        while conn.execute(
            "SELECT 1 FROM products WHERE slug = %s AND deleted_at IS NULL",
            (slug,),
        ).fetchone():
            slug = f"{base}-{count}"
            count += 1
        return slug

    def _public(self, product: dict) -> dict:
        sizes = [
            {
                "size": size,
                "available": product["sizes"][size]["initial_quantity"] - product["sizes"][size]["sold_quantity"] > 0,
            }
            for size in SIZES
        ]
        created = product["created_at"]
        return {
            "id": product["id"],
            "name": product["name"],
            "slug": product["slug"],
            "description": product["description"],
            "selling_price": product["selling_price"],
            "images": product["images"],
            "category": product["category"],
            "category_id": product["category_id"],
            "sizes": sizes,
            "status": "sold_out" if all(not row["available"] for row in sizes) else "available",
            "created_at": created.isoformat(),
        }

    def _admin(self, product: dict) -> dict:
        sizes = []
        total = available = sold = 0
        for size in SIZES:
            row = product["sizes"][size]
            row_available = row["initial_quantity"] - row["sold_quantity"]
            total += row["initial_quantity"]
            available += row_available
            sold += row["sold_quantity"]
            sizes.append(
                {
                    "size": size,
                    "initial_quantity": row["initial_quantity"],
                    "sold_quantity": row["sold_quantity"],
                    "available_quantity": row_available,
                }
            )
        profit_per_unit = money(product["selling_price"] - product["cost_price"])
        created = product["created_at"]
        return {
            "id": product["id"],
            "name": product["name"],
            "slug": product["slug"],
            "description": product["description"],
            "category": product["category"],
            "category_id": product["category_id"],
            "cost_price": product["cost_price"],
            "selling_price": product["selling_price"],
            "profit_per_unit": profit_per_unit,
            "total_quantity": total,
            "available_quantity": available,
            "sold_quantity": sold,
            "estimated_profit": money(profit_per_unit * sold),
            "status": product["status"],
            "images": product["images"],
            "sizes": sizes,
            "created_at": created.isoformat(),
        }


def _clean_images(urls: list[str]) -> list[dict]:
    images = []
    for index, url in enumerate(urls):
        cleaned = str(url).strip()
        if cleaned:
            images.append({"image_url": cleaned, "sort_order": index})
    return images


def _numeric_sale(row: dict) -> dict:
    return {
        **row,
        "selling_price": money(row["selling_price"]),
        "cost_price": money(row["cost_price"]),
        "profit": money(row["profit"]),
        "customer_name": row.get("customer_name") or "",
        "customer_phone": row.get("customer_phone") or "",
    }
