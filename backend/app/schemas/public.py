from typing import Literal

from pydantic import BaseModel

from app.models.domain import Category, Product, Size
from app.schemas.common import Money


class PublicCategory(BaseModel):
    name: str
    slug: str

    @classmethod
    def build(cls, category: Category) -> "PublicCategory":
        return cls(name=category.name, slug=category.slug)


class PublicSize(BaseModel):
    size: Size
    available: bool


class PublicProduct(BaseModel):
    """What the store may see. Never add cost price, profit or quantities here."""

    id: str
    name: str
    slug: str
    description: str
    selling_price: Money
    original_price: Money | None
    images: list[str]
    category: PublicCategory
    sizes: list[PublicSize]
    status: Literal["available", "sold_out"]

    @classmethod
    def build(cls, product: Product) -> "PublicProduct":
        return cls(
            id=product.id,
            name=product.name,
            slug=product.slug,
            description=product.description,
            selling_price=product.selling_price,
            original_price=product.original_price,
            images=product.images,
            category=PublicCategory.build(product.category),
            sizes=[
                PublicSize(size=s.size, available=s.available_quantity > 0) for s in product.sizes
            ],
            status="available" if product.available_quantity > 0 else "sold_out",
        )


class StoreConfig(BaseModel):
    whatsapp_number: str | None
    currency: str = "INR"
