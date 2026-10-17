import re
import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

from app.models.domain import (
    Admin,
    Category,
    Product,
    ProductStatus,
    Sale,
    SaleStatus,
    Size,
    SizeStock,
    StockEvent,
    StockEventType,
)
from app.schemas.common import Money, PriceIn
from app.services.products import ProductFields

IMAGE_URL = re.compile(r"^(/uploads/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|avif)|https://\S+)$")

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
Quantity = Annotated[int, Field(ge=0, le=100_000)]


class CategoryOut(BaseModel):
    id: str
    name: str
    slug: str

    @classmethod
    def build(cls, category: Category) -> "CategoryOut":
        return cls(id=category.id, name=category.name, slug=category.slug)


class CategoryIn(BaseModel):
    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=2, max_length=60)
    ]


class SizeQuantityIn(BaseModel):
    size: Size
    quantity: Quantity


class ProductFieldsIn(BaseModel):
    name: Name
    category_id: str
    description: Description = ""
    cost_price: PriceIn
    selling_price: PriceIn
    original_price: PriceIn | None = None
    images: list[str] = Field(default_factory=list, max_length=8)
    is_published: bool = True

    @field_validator("category_id")
    @classmethod
    def valid_uuid(cls, value: str) -> str:
        try:
            return str(uuid.UUID(value))
        except ValueError as exc:
            raise ValueError("Choose a valid category.") from exc

    @field_validator("images")
    @classmethod
    def valid_images(cls, value: list[str]) -> list[str]:
        for url in value:
            if not IMAGE_URL.match(url):
                raise ValueError("Images must be uploaded files or https links.")
        return value

    @model_validator(mode="after")
    def original_above_selling(self) -> "ProductFieldsIn":
        if self.original_price is not None and self.original_price < self.selling_price:
            raise ValueError("Original price must be equal to or higher than the selling price.")
        return self

    def fields(self) -> ProductFields:
        return ProductFields(
            name=self.name,
            category_id=self.category_id,
            description=self.description,
            cost_price=self.cost_price,
            selling_price=self.selling_price,
            original_price=self.original_price,
            images=self.images,
            is_published=self.is_published,
        )


class ProductCreateIn(ProductFieldsIn):
    sizes: list[SizeQuantityIn] = Field(min_length=1, max_length=len(Size))

    @field_validator("sizes")
    @classmethod
    def unique_sizes(cls, value: list[SizeQuantityIn]) -> list[SizeQuantityIn]:
        if len({s.size for s in value}) != len(value):
            raise ValueError("Each size can only appear once.")
        return value

    def quantities(self) -> dict[Size, int]:
        return {s.size: s.quantity for s in self.sizes}


class StockSizeIn(BaseModel):
    size: Size
    initial_quantity: Quantity


class StockUpdateIn(BaseModel):
    sizes: list[StockSizeIn] = Field(min_length=1, max_length=len(Size))
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None

    @field_validator("sizes")
    @classmethod
    def unique_sizes(cls, value: list[StockSizeIn]) -> list[StockSizeIn]:
        if len({s.size for s in value}) != len(value):
            raise ValueError("Each size can only appear once.")
        return value


class AdminSizeOut(BaseModel):
    size: Size
    initial_quantity: int
    sold_quantity: int
    available_quantity: int

    @classmethod
    def build(cls, stock: SizeStock) -> "AdminSizeOut":
        return cls(
            size=stock.size,
            initial_quantity=stock.initial_quantity,
            sold_quantity=stock.sold_quantity,
            available_quantity=stock.available_quantity,
        )


class AdminProductOut(BaseModel):
    id: str
    name: str
    slug: str
    description: str
    category: CategoryOut
    cost_price: Money
    selling_price: Money
    original_price: Money | None
    images: list[str]
    sizes: list[AdminSizeOut]
    total_quantity: int
    sold_quantity: int
    available_quantity: int
    profit_per_unit: Money
    estimated_profit: Money
    status: ProductStatus
    is_published: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def build(cls, product: Product) -> "AdminProductOut":
        return cls(
            id=product.id,
            name=product.name,
            slug=product.slug,
            description=product.description,
            category=CategoryOut.build(product.category),
            cost_price=product.cost_price,
            selling_price=product.selling_price,
            original_price=product.original_price,
            images=product.images,
            sizes=[AdminSizeOut.build(s) for s in product.sizes],
            total_quantity=product.total_quantity,
            sold_quantity=product.sold_quantity,
            available_quantity=product.available_quantity,
            profit_per_unit=product.profit_per_unit,
            estimated_profit=product.profit_per_unit * product.sold_quantity,
            status=product.status,
            is_published=product.is_published,
            created_at=product.created_at,
            updated_at=product.updated_at,
        )


PHONE = re.compile(r"^\+?[0-9 ]{6,20}$")


class SaleCreateIn(BaseModel):
    product_id: str
    size: Size
    quantity: int = Field(ge=1, le=1000)
    customer_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None
    customer_phone: Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)] | None = None

    @field_validator("product_id")
    @classmethod
    def valid_uuid(cls, value: str) -> str:
        try:
            return str(uuid.UUID(value))
        except ValueError as exc:
            raise ValueError("Choose a valid product.") from exc

    @field_validator("customer_name", "customer_phone")
    @classmethod
    def empty_is_none(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("customer_phone")
    @classmethod
    def valid_phone(cls, value: str | None) -> str | None:
        if value is not None and not PHONE.match(value):
            raise ValueError("Enter a valid phone number.")
        return value


class SaleOut(BaseModel):
    id: str
    product_id: str
    product_name: str
    size: Size
    quantity: int
    selling_price: Money
    cost_price: Money
    revenue: Money
    profit: Money
    customer_name: str | None
    customer_phone: str | None
    status: SaleStatus
    created_at: datetime

    @classmethod
    def build(cls, sale: Sale) -> "SaleOut":
        return cls(
            id=sale.id,
            product_id=sale.product_id,
            product_name=sale.product_name,
            size=sale.size,
            quantity=sale.quantity,
            selling_price=sale.selling_price,
            cost_price=sale.cost_price,
            revenue=sale.revenue,
            profit=sale.profit,
            customer_name=sale.customer_name,
            customer_phone=sale.customer_phone,
            status=sale.status,
            created_at=sale.created_at,
        )


class SalesSummaryOut(BaseModel):
    orders: int
    units: int
    revenue: Money
    profit: Money


class SalesPageOut(BaseModel):
    items: list[SaleOut]
    total: int
    page: int
    page_size: int
    pages: int
    summary: SalesSummaryOut


class StockEventOut(BaseModel):
    id: str
    product_id: str
    product_name: str
    size: Size | None
    event_type: StockEventType
    quantity_before: int
    quantity_change: int
    quantity_after: int
    note: str | None
    created_at: datetime

    @classmethod
    def build(cls, event: StockEvent) -> "StockEventOut":
        return cls(
            id=event.id,
            product_id=event.product_id,
            product_name=event.product_name,
            size=event.size,
            event_type=event.event_type,
            quantity_before=event.quantity_before,
            quantity_change=event.quantity_change,
            quantity_after=event.quantity_after,
            note=event.note,
            created_at=event.created_at,
        )


class KpisOut(BaseModel):
    total_products: int
    available_products: int
    sold_out_products: int
    total_stock: int
    remaining_stock: int
    sold_units: int
    inventory_value: Money
    inventory_retail_value: Money
    estimated_profit: Money


class DailySalesOut(BaseModel):
    date: str
    revenue: Money
    units: int


class ProductStockRowOut(BaseModel):
    product_id: str
    name: str
    total: int
    available: int
    sold: int
    status: ProductStatus


class TopProductOut(BaseModel):
    product_id: str
    name: str
    units: int
    revenue: Money


class DashboardOut(BaseModel):
    kpis: KpisOut
    low_stock_threshold: int
    sales_overview: dict[str, SalesSummaryOut]
    sales_chart: list[DailySalesOut]
    inventory: list[ProductStockRowOut]
    low_stock: list[ProductStockRowOut]
    top_products: list[TopProductOut]


class SettingsOut(BaseModel):
    low_stock_threshold: int
    whatsapp_number: str | None
    storage: str
    admin_email: str


class SettingsUpdateIn(BaseModel):
    low_stock_threshold: int = Field(ge=1, le=10_000)


class LoginIn(BaseModel):
    email: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)]
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]


class ChangePasswordIn(BaseModel):
    current_password: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    new_password: Annotated[str, StringConstraints(min_length=8, max_length=128)]


class AdminOut(BaseModel):
    id: str
    name: str
    email: str
    role: str

    @classmethod
    def build(cls, admin: Admin) -> "AdminOut":
        return cls(id=admin.id, name=admin.name, email=admin.email, role=admin.role)


class UploadOut(BaseModel):
    url: str
