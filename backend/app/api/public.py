from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status

from app.auth.dependencies import RepoDep, SettingsDep, valid_id
from app.models.domain import ProductQuery, Size
from app.schemas.common import Page, page_count
from app.schemas.public import PublicCategory, PublicProduct, StoreConfig

router = APIRouter(tags=["store"])


@router.get("/config", response_model=StoreConfig)
def store_config(settings: SettingsDep) -> StoreConfig:
    return StoreConfig(whatsapp_number=settings.whatsapp_number or None)


@router.get("/categories", response_model=list[PublicCategory])
def categories(repo: RepoDep) -> list[PublicCategory]:
    return [PublicCategory.build(c) for c in repo.list_categories()]


@router.get("/products", response_model=Page[PublicProduct])
def list_products(
    repo: RepoDep,
    q: Annotated[str | None, Query(max_length=100)] = None,
    category: Annotated[str | None, Query(max_length=60)] = None,
    size: Size | None = None,
    min_price: Annotated[Decimal | None, Query(ge=0, le=10_000_000)] = None,
    max_price: Annotated[Decimal | None, Query(ge=0, le=10_000_000)] = None,
    availability: Literal["all", "available", "sold_out"] = "all",
    sort: Literal["newest", "price_asc", "price_desc", "name_asc"] = "newest",
    page: Annotated[int, Query(ge=1, le=10_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=48)] = 12,
) -> Page[PublicProduct]:
    products, total = repo.query_products(
        ProductQuery(
            search=q.strip() if q and q.strip() else None,
            category=category or None,
            size=size,
            min_price=min_price,
            max_price=max_price,
            availability=availability,
            published_only=True,
            sort=sort,
            page=page,
            page_size=page_size,
        )
    )
    return Page[PublicProduct](
        items=[PublicProduct.build(p) for p in products],
        total=total,
        page=page,
        page_size=page_size,
        pages=page_count(total, page_size),
    )


@router.get("/products/{product_id}", response_model=PublicProduct)
def get_product(product_id: str, repo: RepoDep) -> PublicProduct:
    product = repo.get_product(valid_id(product_id), published_only=True)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")
    return PublicProduct.build(product)
