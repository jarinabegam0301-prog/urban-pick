from collections import defaultdict
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime
from typing import Any

import psycopg
from psycopg.rows import dict_row

from app.models.domain import (
    Admin,
    Category,
    Product,
    ProductQuery,
    ProductStatus,
    Sale,
    SaleStatus,
    Size,
    SizeStock,
    StockEvent,
    StockEventType,
)

ORDER_BY = {
    "newest": "p.created_at DESC",
    "price_asc": "p.selling_price ASC, p.created_at DESC",
    "price_desc": "p.selling_price DESC, p.created_at DESC",
    "name_asc": "lower(p.name) ASC",
    "stock_asc": "COALESCE(st.available, 0) ASC, p.created_at DESC",
}

PRODUCT_SELECT = """
SELECT p.id::text AS id, p.name, p.slug, p.description, p.cost_price, p.selling_price,
       p.original_price, p.status::text AS status, p.is_published, p.created_at,
       p.updated_at, p.deleted_at,
       c.id::text AS category_id, c.name AS category_name, c.slug AS category_slug
FROM products p
JOIN categories c ON c.id = p.category_id
LEFT JOIN (
  SELECT product_id, SUM(available_quantity) AS available
  FROM product_size_stock
  GROUP BY product_id
) st ON st.product_id = p.id
"""

SALE_SELECT = """
SELECT s.id::text AS id, s.product_id::text AS product_id, p.name AS product_name,
       s.size::text AS size, s.quantity, s.selling_price, s.cost_price,
       s.status::text AS status, s.created_at, s.customer_name, s.customer_phone
FROM sales s
JOIN products p ON p.id = s.product_id
"""


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _sale(row: dict[str, Any]) -> Sale:
    return Sale(
        id=row["id"],
        product_id=row["product_id"],
        product_name=row["product_name"],
        size=Size(row["size"]),
        quantity=row["quantity"],
        selling_price=row["selling_price"],
        cost_price=row["cost_price"],
        status=SaleStatus(row["status"]),
        created_at=row["created_at"],
        customer_name=row["customer_name"],
        customer_phone=row["customer_phone"],
    )


def _admin(row: dict[str, Any]) -> Admin:
    return Admin(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        password_hash=row["password_hash"],
        role=row["role"],
        created_at=row["created_at"],
    )


class PostgresRepository:
    """PostgreSQL storage. Expects the tables from backend/schema.sql."""

    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    @contextmanager
    def _connect(self) -> Iterator[psycopg.Connection[dict[str, Any]]]:
        with psycopg.connect(self._database_url, row_factory=dict_row) as conn:
            yield conn

    def list_categories(self) -> list[Category]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id::text AS id, name, slug FROM categories ORDER BY name"
            ).fetchall()
        return [Category(**row) for row in rows]

    def get_category(self, category_id: str) -> Category | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id::text AS id, name, slug FROM categories WHERE id = %s::uuid",
                (category_id,),
            ).fetchone()
        return Category(**row) if row else None

    def insert_category(self, category: Category) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO categories (id, name, slug) VALUES (%s::uuid, %s, %s)",
                (category.id, category.name, category.slug),
            )

    def update_category(self, category: Category) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE categories SET name = %s, slug = %s WHERE id = %s::uuid",
                (category.name, category.slug, category.id),
            )

    def category_in_use(self, category_id: str) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT EXISTS (SELECT 1 FROM products WHERE category_id = %s::uuid) AS used",
                (category_id,),
            ).fetchone()
        return bool(row and row["used"])

    def delete_category(self, category_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM categories WHERE id = %s::uuid", (category_id,))

    def _hydrate(self, conn: psycopg.Connection[dict[str, Any]], rows: list[dict[str, Any]]) -> list[Product]:
        if not rows:
            return []
        ids = [row["id"] for row in rows]
        sizes: dict[str, list[SizeStock]] = defaultdict(list)
        images: dict[str, list[str]] = defaultdict(list)
        for row in conn.execute(
            """
            SELECT product_id::text AS product_id, size::text AS size,
                   initial_quantity, sold_quantity
            FROM product_size_stock
            WHERE product_id = ANY(%s::uuid[])
            ORDER BY size
            """,
            (ids,),
        ):
            sizes[row["product_id"]].append(
                SizeStock(
                    size=Size(row["size"]),
                    initial_quantity=row["initial_quantity"],
                    sold_quantity=row["sold_quantity"],
                )
            )
        for row in conn.execute(
            """
            SELECT product_id::text AS product_id, image_url
            FROM product_images
            WHERE product_id = ANY(%s::uuid[])
            ORDER BY sort_order, created_at
            """,
            (ids,),
        ):
            images[row["product_id"]].append(row["image_url"])

        return [
            Product(
                id=row["id"],
                name=row["name"],
                slug=row["slug"],
                category=Category(
                    id=row["category_id"],
                    name=row["category_name"],
                    slug=row["category_slug"],
                ),
                description=row["description"],
                cost_price=row["cost_price"],
                selling_price=row["selling_price"],
                original_price=row["original_price"],
                status=ProductStatus(row["status"]),
                is_published=row["is_published"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                deleted_at=row["deleted_at"],
                images=images[row["id"]],
                sizes=sizes[row["id"]],
            )
            for row in rows
        ]

    def query_products(self, query: ProductQuery) -> tuple[list[Product], int]:
        where = ["p.deleted_at IS NULL"]
        params: list[Any] = []
        if query.published_only:
            where.append("p.is_published")
        if query.search:
            where.append("p.name ILIKE %s")
            params.append(f"%{_escape_like(query.search)}%")
        if query.category:
            where.append("c.slug = %s")
            params.append(query.category)
        if query.size:
            where.append(
                "EXISTS (SELECT 1 FROM product_size_stock s WHERE s.product_id = p.id"
                " AND s.size = %s::product_size AND s.available_quantity > 0)"
            )
            params.append(query.size.value)
        if query.min_price is not None:
            where.append("p.selling_price >= %s")
            params.append(query.min_price)
        if query.max_price is not None:
            where.append("p.selling_price <= %s")
            params.append(query.max_price)
        if query.availability == "available":
            where.append("COALESCE(st.available, 0) > 0")
        elif query.availability == "sold_out":
            where.append("COALESCE(st.available, 0) = 0")
        if query.status:
            where.append("p.status = %s::product_status")
            params.append(query.status.value)

        where_sql = " AND ".join(where)
        order_sql = ORDER_BY.get(query.sort, ORDER_BY["newest"])
        offset = (query.page - 1) * query.page_size

        with self._connect() as conn:
            count_row = conn.execute(
                f"SELECT COUNT(*) AS total FROM ({PRODUCT_SELECT} WHERE {where_sql}) q",
                params,
            ).fetchone()
            rows = conn.execute(
                f"{PRODUCT_SELECT} WHERE {where_sql} ORDER BY {order_sql} LIMIT %s OFFSET %s",
                [*params, query.page_size, offset],
            ).fetchall()
            products = self._hydrate(conn, rows)
        return products, count_row["total"] if count_row else 0

    def list_all_products(self) -> list[Product]:
        with self._connect() as conn:
            rows = conn.execute(
                f"{PRODUCT_SELECT} WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC"
            ).fetchall()
            return self._hydrate(conn, rows)

    def get_product(self, product_id: str, published_only: bool = False) -> Product | None:
        published_sql = " AND p.is_published" if published_only else ""
        with self._connect() as conn:
            row = conn.execute(
                f"{PRODUCT_SELECT} WHERE p.id = %s::uuid AND p.deleted_at IS NULL{published_sql}",
                (product_id,),
            ).fetchone()
            products = self._hydrate(conn, [row] if row else [])
        return products[0] if products else None

    def slug_exists(self, slug: str, exclude_id: str | None = None) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT 1 FROM products
                WHERE slug = %s AND deleted_at IS NULL
                  AND (%s::uuid IS NULL OR id <> %s::uuid)
                """,
                (slug, exclude_id, exclude_id),
            ).fetchone()
        return row is not None

    @staticmethod
    def _write_images(conn: psycopg.Connection[dict[str, Any]], product: Product) -> None:
        conn.execute("DELETE FROM product_images WHERE product_id = %s::uuid", (product.id,))
        for index, url in enumerate(product.images):
            conn.execute(
                """
                INSERT INTO product_images (product_id, image_url, sort_order)
                VALUES (%s::uuid, %s, %s)
                """,
                (product.id, url, index),
            )

    def insert_product(self, product: Product) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO products (
                  id, name, slug, category_id, description, cost_price, selling_price,
                  original_price, status, is_published, created_at, updated_at
                ) VALUES (
                  %s::uuid, %s, %s, %s::uuid, %s, %s, %s, %s, %s::product_status, %s, %s, %s
                )
                """,
                (
                    product.id,
                    product.name,
                    product.slug,
                    product.category.id,
                    product.description,
                    product.cost_price,
                    product.selling_price,
                    product.original_price,
                    product.status.value,
                    product.is_published,
                    product.created_at,
                    product.updated_at,
                ),
            )
            for stock in product.sizes:
                conn.execute(
                    """
                    INSERT INTO product_size_stock (product_id, size, initial_quantity, sold_quantity)
                    VALUES (%s::uuid, %s::product_size, %s, %s)
                    """,
                    (product.id, stock.size.value, stock.initial_quantity, stock.sold_quantity),
                )
            self._write_images(conn, product)

    def update_product(self, product: Product) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE products SET
                  name = %s, slug = %s, category_id = %s::uuid, description = %s,
                  cost_price = %s, selling_price = %s, original_price = %s, is_published = %s
                WHERE id = %s::uuid
                """,
                (
                    product.name,
                    product.slug,
                    product.category.id,
                    product.description,
                    product.cost_price,
                    product.selling_price,
                    product.original_price,
                    product.is_published,
                    product.id,
                ),
            )
            self._write_images(conn, product)

    def update_sizes(self, product_id: str, sizes: list[SizeStock]) -> None:
        with self._connect() as conn:
            for stock in sizes:
                conn.execute(
                    """
                    INSERT INTO product_size_stock (product_id, size, initial_quantity)
                    VALUES (%s::uuid, %s::product_size, %s)
                    ON CONFLICT (product_id, size)
                    DO UPDATE SET initial_quantity = EXCLUDED.initial_quantity
                    """,
                    (product_id, stock.size.value, stock.initial_quantity),
                )
            conn.execute(
                "UPDATE products SET updated_at = now() WHERE id = %s::uuid", (product_id,)
            )

    def set_product_status(self, product_id: str, status: ProductStatus) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE products SET status = %s::product_status WHERE id = %s::uuid",
                (status.value, product_id),
            )

    def soft_delete_product(self, product_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE products SET deleted_at = now() WHERE id = %s::uuid", (product_id,)
            )

    def record_sale(self, sale: Sale) -> bool:
        with self._connect() as conn:
            updated = conn.execute(
                """
                UPDATE product_size_stock
                SET sold_quantity = sold_quantity + %s
                WHERE product_id = %s::uuid
                  AND size = %s::product_size
                  AND initial_quantity - sold_quantity >= %s
                RETURNING id
                """,
                (sale.quantity, sale.product_id, sale.size.value, sale.quantity),
            ).fetchone()
            if updated is None:
                conn.rollback()
                return False
            conn.execute(
                """
                INSERT INTO sales (
                  id, product_id, size, quantity, selling_price, cost_price,
                  customer_name, customer_phone, status, created_at
                ) VALUES (
                  %s::uuid, %s::uuid, %s::product_size, %s, %s, %s, %s, %s, %s::sale_status, %s
                )
                """,
                (
                    sale.id,
                    sale.product_id,
                    sale.size.value,
                    sale.quantity,
                    sale.selling_price,
                    sale.cost_price,
                    sale.customer_name,
                    sale.customer_phone,
                    sale.status.value,
                    sale.created_at,
                ),
            )
            conn.execute(
                "UPDATE products SET updated_at = now() WHERE id = %s::uuid", (sale.product_id,)
            )
        return True

    def cancel_sale(self, sale_id: str) -> Sale | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                UPDATE sales SET status = 'cancelled'
                WHERE id = %s::uuid AND status = 'confirmed'
                RETURNING product_id::text AS product_id, size::text AS size, quantity
                """,
                (sale_id,),
            ).fetchone()
            if row is None:
                return None
            conn.execute(
                """
                UPDATE product_size_stock
                SET sold_quantity = GREATEST(sold_quantity - %s, 0)
                WHERE product_id = %s::uuid AND size = %s::product_size
                """,
                (row["quantity"], row["product_id"], row["size"]),
            )
            sale_row = conn.execute(f"{SALE_SELECT} WHERE s.id = %s::uuid", (sale_id,)).fetchone()
        return _sale(sale_row) if sale_row else None

    def get_sale(self, sale_id: str) -> Sale | None:
        with self._connect() as conn:
            row = conn.execute(f"{SALE_SELECT} WHERE s.id = %s::uuid", (sale_id,)).fetchone()
        return _sale(row) if row else None

    def list_sales(
        self, since: datetime | None, page: int, page_size: int
    ) -> tuple[list[Sale], int]:
        where = "WHERE s.created_at >= %s" if since else ""
        params: list[Any] = [since] if since else []
        with self._connect() as conn:
            total_row = conn.execute(
                f"SELECT COUNT(*) AS total FROM sales s {where}", params
            ).fetchone()
            rows = conn.execute(
                f"{SALE_SELECT} {where} ORDER BY s.created_at DESC LIMIT %s OFFSET %s",
                [*params, page_size, (page - 1) * page_size],
            ).fetchall()
        return [_sale(row) for row in rows], total_row["total"] if total_row else 0

    def sales_since(self, since: datetime, status: SaleStatus) -> list[Sale]:
        with self._connect() as conn:
            rows = conn.execute(
                f"{SALE_SELECT} WHERE s.created_at >= %s AND s.status = %s::sale_status"
                " ORDER BY s.created_at",
                (since, status.value),
            ).fetchall()
        return [_sale(row) for row in rows]

    def add_stock_event(self, event: StockEvent) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO stock_events (
                  id, product_id, size, event_type, quantity_before, quantity_change,
                  quantity_after, note, admin_id, created_at
                ) VALUES (
                  %s::uuid, %s::uuid, %s::product_size, %s::stock_event_type, %s, %s, %s, %s,
                  %s::uuid, %s
                )
                """,
                (
                    event.id,
                    event.product_id,
                    event.size.value if event.size else None,
                    event.event_type.value,
                    event.quantity_before,
                    event.quantity_change,
                    event.quantity_after,
                    event.note,
                    event.admin_id,
                    event.created_at,
                ),
            )

    def list_stock_events(self, product_id: str | None, limit: int) -> list[StockEvent]:
        where = "WHERE e.product_id = %s::uuid" if product_id else ""
        params: list[Any] = [product_id] if product_id else []
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT e.id::text AS id, e.product_id::text AS product_id,
                       p.name AS product_name, e.size::text AS size,
                       e.event_type::text AS event_type, e.quantity_before,
                       e.quantity_change, e.quantity_after, e.note,
                       e.admin_id::text AS admin_id, e.created_at
                FROM stock_events e
                JOIN products p ON p.id = e.product_id
                {where}
                ORDER BY e.created_at DESC
                LIMIT %s
                """,
                [*params, limit],
            ).fetchall()
        return [
            StockEvent(
                id=row["id"],
                product_id=row["product_id"],
                product_name=row["product_name"],
                size=Size(row["size"]) if row["size"] else None,
                event_type=StockEventType(row["event_type"]),
                quantity_before=row["quantity_before"],
                quantity_change=row["quantity_change"],
                quantity_after=row["quantity_after"],
                note=row["note"],
                admin_id=row["admin_id"],
                created_at=row["created_at"],
            )
            for row in rows
        ]

    def count_admins(self) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT COUNT(*) AS total FROM admins").fetchone()
        return row["total"] if row else 0

    def get_admin(self, admin_id: str) -> Admin | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id::text AS id, name, email, password_hash, role::text AS role, created_at
                FROM admins WHERE id = %s::uuid
                """,
                (admin_id,),
            ).fetchone()
        return _admin(row) if row else None

    def get_admin_by_email(self, email: str) -> Admin | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id::text AS id, name, email, password_hash, role::text AS role, created_at
                FROM admins WHERE email = %s
                """,
                (email,),
            ).fetchone()
        return _admin(row) if row else None

    def insert_admin(self, admin: Admin) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO admins (id, name, email, password_hash, role, created_at)
                VALUES (%s::uuid, %s, %s, %s, %s::admin_role, %s)
                """,
                (admin.id, admin.name, admin.email, admin.password_hash, admin.role, admin.created_at),
            )

    def update_admin_password(self, admin_id: str, password_hash: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE admins SET password_hash = %s WHERE id = %s::uuid",
                (password_hash, admin_id),
            )

    def get_setting(self, key: str) -> str | None:
        with self._connect() as conn:
            row = conn.execute("SELECT value FROM app_settings WHERE key = %s", (key,)).fetchone()
        return row["value"] if row else None

    def set_setting(self, key: str, value: str) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO app_settings (key, value) VALUES (%s, %s)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """,
                (key, value),
            )
