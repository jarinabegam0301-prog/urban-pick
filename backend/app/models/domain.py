from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import StrEnum


class Size(StrEnum):
    S = "S"
    M = "M"
    L = "L"
    XL = "XL"
    XXL = "XXL"


SIZE_ORDER = list(Size)


class ProductStatus(StrEnum):
    IN_STOCK = "in_stock"
    LOW_STOCK = "low_stock"
    PARTIALLY_SOLD_OUT = "partially_sold_out"
    SOLD_OUT = "sold_out"


class SaleStatus(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class StockEventType(StrEnum):
    STOCK_ADDED = "stock_added"
    STOCK_SOLD = "stock_sold"
    STOCK_ADJUSTED = "stock_adjusted"
    SIZE_MARKED_SOLD_OUT = "size_marked_sold_out"
    PRODUCT_MARKED_SOLD_OUT = "product_marked_sold_out"


@dataclass
class Category:
    id: str
    name: str
    slug: str


@dataclass
class SizeStock:
    size: Size
    initial_quantity: int
    sold_quantity: int = 0

    @property
    def available_quantity(self) -> int:
        return self.initial_quantity - self.sold_quantity


@dataclass
class Product:
    id: str
    name: str
    slug: str
    category: Category
    description: str
    cost_price: Decimal
    selling_price: Decimal
    original_price: Decimal | None
    status: ProductStatus
    is_published: bool
    created_at: datetime
    updated_at: datetime
    images: list[str] = field(default_factory=list)
    sizes: list[SizeStock] = field(default_factory=list)
    deleted_at: datetime | None = None

    @property
    def total_quantity(self) -> int:
        return sum(s.initial_quantity for s in self.sizes)

    @property
    def sold_quantity(self) -> int:
        return sum(s.sold_quantity for s in self.sizes)

    @property
    def available_quantity(self) -> int:
        return sum(s.available_quantity for s in self.sizes)

    @property
    def profit_per_unit(self) -> Decimal:
        return self.selling_price - self.cost_price

    def size_stock(self, size: Size) -> SizeStock | None:
        return next((s for s in self.sizes if s.size == size), None)


@dataclass
class Sale:
    id: str
    product_id: str
    product_name: str
    size: Size
    quantity: int
    selling_price: Decimal
    cost_price: Decimal
    status: SaleStatus
    created_at: datetime
    customer_name: str | None = None
    customer_phone: str | None = None

    @property
    def revenue(self) -> Decimal:
        return self.selling_price * self.quantity

    @property
    def profit(self) -> Decimal:
        return (self.selling_price - self.cost_price) * self.quantity


@dataclass
class StockEvent:
    id: str
    product_id: str
    product_name: str
    size: Size | None
    event_type: StockEventType
    quantity_before: int
    quantity_change: int
    quantity_after: int
    created_at: datetime
    note: str | None = None
    admin_id: str | None = None


@dataclass
class Admin:
    id: str
    name: str
    email: str
    password_hash: str
    role: str
    created_at: datetime


@dataclass
class ProductQuery:
    search: str | None = None
    category: str | None = None
    size: Size | None = None
    min_price: Decimal | None = None
    max_price: Decimal | None = None
    availability: str = "all"
    status: ProductStatus | None = None
    published_only: bool = False
    sort: str = "newest"
    page: int = 1
    page_size: int = 12
