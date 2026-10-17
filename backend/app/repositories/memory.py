import copy
import threading
from datetime import UTC, datetime

from app.models.domain import (
    Admin,
    Category,
    Product,
    ProductQuery,
    ProductStatus,
    Sale,
    SaleStatus,
    SizeStock,
    StockEvent,
)

SORT_KEYS = {
    "newest": (lambda p: p.created_at, True),
    "price_asc": (lambda p: p.selling_price, False),
    "price_desc": (lambda p: p.selling_price, True),
    "name_asc": (lambda p: p.name.lower(), False),
    "stock_asc": (lambda p: p.available_quantity, False),
}


class MemoryRepository:
    """Keeps all data in process memory. Used when DATABASE_URL is not set.

    Everything is lost when the API restarts.
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._categories: dict[str, Category] = {}
        self._products: dict[str, Product] = {}
        self._sales: dict[str, Sale] = {}
        self._events: list[StockEvent] = []
        self._admins: dict[str, Admin] = {}
        self._settings: dict[str, str] = {}

    def add_category(self, category: Category) -> None:
        with self._lock:
            self._categories[category.id] = category

    def list_categories(self) -> list[Category]:
        with self._lock:
            return sorted(
                (copy.copy(c) for c in self._categories.values()), key=lambda c: c.name
            )

    def get_category(self, category_id: str) -> Category | None:
        with self._lock:
            category = self._categories.get(category_id)
            return copy.copy(category) if category else None

    def insert_category(self, category: Category) -> None:
        with self._lock:
            self._categories[category.id] = copy.copy(category)

    def update_category(self, category: Category) -> None:
        with self._lock:
            self._categories[category.id] = copy.copy(category)
            for product in self._products.values():
                if product.category.id == category.id:
                    product.category = copy.copy(category)

    def category_in_use(self, category_id: str) -> bool:
        with self._lock:
            return any(p.category.id == category_id for p in self._products.values())

    def delete_category(self, category_id: str) -> None:
        with self._lock:
            self._categories.pop(category_id, None)

    def _active(self) -> list[Product]:
        return [p for p in self._products.values() if p.deleted_at is None]

    @staticmethod
    def _matches(product: Product, query: ProductQuery) -> bool:
        if query.published_only and not product.is_published:
            return False
        if query.search and query.search.lower() not in product.name.lower():
            return False
        if query.category and product.category.slug != query.category:
            return False
        if query.size:
            stock = product.size_stock(query.size)
            if stock is None or stock.available_quantity <= 0:
                return False
        if query.min_price is not None and product.selling_price < query.min_price:
            return False
        if query.max_price is not None and product.selling_price > query.max_price:
            return False
        if query.availability == "available" and product.available_quantity <= 0:
            return False
        if query.availability == "sold_out" and product.available_quantity > 0:
            return False
        if query.status and product.status != query.status:
            return False
        return True

    def query_products(self, query: ProductQuery) -> tuple[list[Product], int]:
        with self._lock:
            matches = [p for p in self._active() if self._matches(p, query)]
            key, reverse = SORT_KEYS.get(query.sort, SORT_KEYS["newest"])
            matches.sort(key=key, reverse=reverse)
            start = (query.page - 1) * query.page_size
            page = matches[start : start + query.page_size]
            return copy.deepcopy(page), len(matches)

    def list_all_products(self) -> list[Product]:
        with self._lock:
            return copy.deepcopy(self._active())

    def get_product(self, product_id: str, published_only: bool = False) -> Product | None:
        with self._lock:
            product = self._products.get(product_id)
            if product is None or product.deleted_at is not None:
                return None
            if published_only and not product.is_published:
                return None
            return copy.deepcopy(product)

    def slug_exists(self, slug: str, exclude_id: str | None = None) -> bool:
        with self._lock:
            return any(p.slug == slug and p.id != exclude_id for p in self._active())

    def insert_product(self, product: Product) -> None:
        with self._lock:
            self._products[product.id] = copy.deepcopy(product)

    def update_product(self, product: Product) -> None:
        with self._lock:
            stored = self._products[product.id]
            stored.name = product.name
            stored.slug = product.slug
            stored.category = copy.copy(product.category)
            stored.description = product.description
            stored.cost_price = product.cost_price
            stored.selling_price = product.selling_price
            stored.original_price = product.original_price
            stored.is_published = product.is_published
            stored.images = list(product.images)
            stored.updated_at = datetime.now(UTC)

    def update_sizes(self, product_id: str, sizes: list[SizeStock]) -> None:
        with self._lock:
            stored = self._products[product_id]
            by_size = {s.size: s for s in stored.sizes}
            for incoming in sizes:
                existing = by_size.get(incoming.size)
                if existing is None:
                    stored.sizes.append(copy.copy(incoming))
                else:
                    existing.initial_quantity = incoming.initial_quantity
            stored.updated_at = datetime.now(UTC)

    def set_product_status(self, product_id: str, status: ProductStatus) -> None:
        with self._lock:
            self._products[product_id].status = status

    def soft_delete_product(self, product_id: str) -> None:
        with self._lock:
            self._products[product_id].deleted_at = datetime.now(UTC)

    def record_sale(self, sale: Sale) -> bool:
        with self._lock:
            product = self._products.get(sale.product_id)
            if product is None or product.deleted_at is not None:
                return False
            stock = product.size_stock(sale.size)
            if stock is None or stock.available_quantity < sale.quantity:
                return False
            stock.sold_quantity += sale.quantity
            product.updated_at = datetime.now(UTC)
            self._sales[sale.id] = copy.deepcopy(sale)
            return True

    def cancel_sale(self, sale_id: str) -> Sale | None:
        with self._lock:
            sale = self._sales.get(sale_id)
            if sale is None or sale.status != SaleStatus.CONFIRMED:
                return None
            product = self._products.get(sale.product_id)
            stock = product.size_stock(sale.size) if product else None
            if stock is not None:
                stock.sold_quantity = max(0, stock.sold_quantity - sale.quantity)
            sale.status = SaleStatus.CANCELLED
            return copy.deepcopy(sale)

    def get_sale(self, sale_id: str) -> Sale | None:
        with self._lock:
            sale = self._sales.get(sale_id)
            return copy.deepcopy(sale) if sale else None

    def list_sales(
        self, since: datetime | None, page: int, page_size: int
    ) -> tuple[list[Sale], int]:
        with self._lock:
            sales = [s for s in self._sales.values() if since is None or s.created_at >= since]
            sales.sort(key=lambda s: s.created_at, reverse=True)
            start = (page - 1) * page_size
            return copy.deepcopy(sales[start : start + page_size]), len(sales)

    def sales_since(self, since: datetime, status: SaleStatus) -> list[Sale]:
        with self._lock:
            return copy.deepcopy(
                [s for s in self._sales.values() if s.created_at >= since and s.status == status]
            )

    def add_stock_event(self, event: StockEvent) -> None:
        with self._lock:
            self._events.append(copy.deepcopy(event))

    def list_stock_events(self, product_id: str | None, limit: int) -> list[StockEvent]:
        with self._lock:
            events = [e for e in self._events if product_id is None or e.product_id == product_id]
            events.sort(key=lambda e: e.created_at, reverse=True)
            return copy.deepcopy(events[:limit])

    def count_admins(self) -> int:
        with self._lock:
            return len(self._admins)

    def get_admin(self, admin_id: str) -> Admin | None:
        with self._lock:
            admin = self._admins.get(admin_id)
            return copy.copy(admin) if admin else None

    def get_admin_by_email(self, email: str) -> Admin | None:
        with self._lock:
            match = next((a for a in self._admins.values() if a.email == email), None)
            return copy.copy(match) if match else None

    def insert_admin(self, admin: Admin) -> None:
        with self._lock:
            self._admins[admin.id] = copy.copy(admin)

    def update_admin_password(self, admin_id: str, password_hash: str) -> None:
        with self._lock:
            self._admins[admin_id].password_hash = password_hash

    def get_setting(self, key: str) -> str | None:
        with self._lock:
            return self._settings.get(key)

    def set_setting(self, key: str, value: str) -> None:
        with self._lock:
            self._settings[key] = value
