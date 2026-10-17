import re
import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status

from app.auth.dependencies import AdminDep, RepoDep, SettingsDep, valid_id
from app.models.domain import Category, ProductQuery, ProductStatus, SaleStatus, Size
from app.schemas.admin import (
    AdminProductOut,
    CategoryIn,
    CategoryOut,
    DashboardOut,
    ProductCreateIn,
    ProductFieldsIn,
    SaleCreateIn,
    SaleOut,
    SalesPageOut,
    SalesSummaryOut,
    SettingsOut,
    SettingsUpdateIn,
    StockEventOut,
    StockUpdateIn,
    UploadOut,
)
from app.schemas.common import Page, page_count
from app.services.dashboard import build_dashboard
from app.services.products import ProductService
from app.services.sales import SalesService, period_start, summarize
from app.services.settings import get_low_stock_threshold, set_low_stock_threshold

router = APIRouter(prefix="/admin", tags=["admin"])

ALL_TIME = datetime(2000, 1, 1, tzinfo=UTC)

IMAGE_SIGNATURES = {
    "jpg": (b"\xff\xd8\xff",),
    "png": (b"\x89PNG\r\n\x1a\n",),
    "webp": (b"RIFF",),
}


@router.get("/categories", response_model=list[CategoryOut])
def categories(_: AdminDep, repo: RepoDep) -> list[CategoryOut]:
    return [CategoryOut.build(c) for c in repo.list_categories()]


def _category_slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if not slug:
        raise HTTPException(status_code=422, detail="Category name must include a letter or number.")
    return slug


def _ensure_category_available(
    repo: RepoDep, name: str, slug: str, category_id: str | None = None
) -> None:
    for category in repo.list_categories():
        if category.id != category_id and (
            category.name.casefold() == name.casefold() or category.slug == slug
        ):
            raise HTTPException(status_code=409, detail="A category with this name already exists.")


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(_: AdminDep, repo: RepoDep, body: CategoryIn) -> CategoryOut:
    slug = _category_slug(body.name)
    _ensure_category_available(repo, body.name, slug)
    category = Category(id=str(uuid.uuid4()), name=body.name, slug=slug)
    repo.insert_category(category)
    return CategoryOut.build(category)


@router.put("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: str, _: AdminDep, repo: RepoDep, body: CategoryIn
) -> CategoryOut:
    category_id = valid_id(category_id, "Category")
    category = repo.get_category(category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found.")
    slug = _category_slug(body.name)
    _ensure_category_available(repo, body.name, slug, category_id)
    category.name = body.name
    category.slug = slug
    repo.update_category(category)
    return CategoryOut.build(category)


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: str, _: AdminDep, repo: RepoDep) -> None:
    category_id = valid_id(category_id, "Category")
    category = repo.get_category(category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found.")
    if len(repo.list_categories()) <= 1:
        raise HTTPException(status_code=409, detail="Keep at least one category in the store.")
    if repo.category_in_use(category_id):
        raise HTTPException(
            status_code=409,
            detail="This category is assigned to products. Reassign those products before deleting it.",
        )
    repo.delete_category(category_id)


@router.get("/products", response_model=Page[AdminProductOut])
def list_products(
    _: AdminDep,
    repo: RepoDep,
    q: Annotated[str | None, Query(max_length=100)] = None,
    category: Annotated[str | None, Query(max_length=60)] = None,
    status_filter: Annotated[ProductStatus | None, Query(alias="status")] = None,
    sort: Literal["newest", "price_asc", "price_desc", "name_asc", "stock_asc"] = "newest",
    page: Annotated[int, Query(ge=1, le=10_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> Page[AdminProductOut]:
    products, total = repo.query_products(
        ProductQuery(
            search=q.strip() if q and q.strip() else None,
            category=category or None,
            status=status_filter,
            sort=sort,
            page=page,
            page_size=page_size,
        )
    )
    return Page[AdminProductOut](
        items=[AdminProductOut.build(p) for p in products],
        total=total,
        page=page,
        page_size=page_size,
        pages=page_count(total, page_size),
    )


@router.post("/products", response_model=AdminProductOut, status_code=status.HTTP_201_CREATED)
def create_product(body: ProductCreateIn, admin: AdminDep, repo: RepoDep) -> AdminProductOut:
    product = ProductService(repo).create(body.fields(), body.quantities(), admin.id)
    return AdminProductOut.build(product)


@router.get("/products/{product_id}", response_model=AdminProductOut)
def get_product(product_id: str, _: AdminDep, repo: RepoDep) -> AdminProductOut:
    return AdminProductOut.build(ProductService(repo).get(valid_id(product_id)))


@router.put("/products/{product_id}", response_model=AdminProductOut)
def update_product(
    product_id: str, body: ProductFieldsIn, _: AdminDep, repo: RepoDep
) -> AdminProductOut:
    return AdminProductOut.build(ProductService(repo).update(valid_id(product_id), body.fields()))


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: str, _: AdminDep, repo: RepoDep) -> None:
    ProductService(repo).delete(valid_id(product_id))


@router.patch("/products/{product_id}/stock", response_model=AdminProductOut)
def update_stock(
    product_id: str, body: StockUpdateIn, admin: AdminDep, repo: RepoDep
) -> AdminProductOut:
    product = ProductService(repo).update_stock(
        valid_id(product_id),
        {s.size: s.initial_quantity for s in body.sizes},
        admin.id,
        body.note,
    )
    return AdminProductOut.build(product)


@router.patch("/products/{product_id}/sold-out", response_model=AdminProductOut)
def mark_sold_out(product_id: str, admin: AdminDep, repo: RepoDep) -> AdminProductOut:
    return AdminProductOut.build(ProductService(repo).mark_sold_out(valid_id(product_id), admin.id))


@router.patch("/products/{product_id}/sizes/{size}/sold-out", response_model=AdminProductOut)
def mark_size_sold_out(
    product_id: str, size: Size, admin: AdminDep, repo: RepoDep
) -> AdminProductOut:
    product = ProductService(repo).mark_size_sold_out(valid_id(product_id), size, admin.id)
    return AdminProductOut.build(product)


@router.get("/products/{product_id}/history", response_model=list[StockEventOut])
def product_history(
    product_id: str,
    _: AdminDep,
    repo: RepoDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[StockEventOut]:
    pid = valid_id(product_id)
    ProductService(repo).get(pid)
    return [StockEventOut.build(e) for e in repo.list_stock_events(pid, limit)]


@router.get("/inventory", response_model=Page[AdminProductOut])
def inventory(
    _: AdminDep,
    repo: RepoDep,
    q: Annotated[str | None, Query(max_length=100)] = None,
    page: Annotated[int, Query(ge=1, le=10_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[AdminProductOut]:
    products, total = repo.query_products(
        ProductQuery(
            search=q.strip() if q and q.strip() else None,
            sort="stock_asc",
            page=page,
            page_size=page_size,
        )
    )
    return Page[AdminProductOut](
        items=[AdminProductOut.build(p) for p in products],
        total=total,
        page=page,
        page_size=page_size,
        pages=page_count(total, page_size),
    )


@router.get("/stock-events", response_model=list[StockEventOut])
def stock_events(
    _: AdminDep,
    repo: RepoDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 30,
) -> list[StockEventOut]:
    return [StockEventOut.build(e) for e in repo.list_stock_events(None, limit)]


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(_: AdminDep, repo: RepoDep, settings: SettingsDep) -> DashboardOut:
    data = build_dashboard(repo, settings.timezone)
    return DashboardOut.model_validate(data, from_attributes=True)


@router.get("/sales", response_model=SalesPageOut)
def list_sales(
    _: AdminDep,
    repo: RepoDep,
    settings: SettingsDep,
    period: Literal["today", "week", "month", "year", "all"] = "month",
    page: Annotated[int, Query(ge=1, le=10_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> SalesPageOut:
    since = period_start(period, settings.timezone)
    sales, total = repo.list_sales(since, page, page_size)
    summary = summarize(repo.sales_since(since or ALL_TIME, SaleStatus.CONFIRMED))
    return SalesPageOut(
        items=[SaleOut.build(s) for s in sales],
        total=total,
        page=page,
        page_size=page_size,
        pages=page_count(total, page_size),
        summary=SalesSummaryOut.model_validate(summary, from_attributes=True),
    )


@router.post("/sales", response_model=SaleOut, status_code=status.HTTP_201_CREATED)
def record_sale(body: SaleCreateIn, admin: AdminDep, repo: RepoDep) -> SaleOut:
    sale = SalesService(repo).record(
        body.product_id,
        body.size,
        body.quantity,
        admin.id,
        body.customer_name,
        body.customer_phone,
    )
    return SaleOut.build(sale)


@router.post("/sales/{sale_id}/cancel", response_model=SaleOut)
def cancel_sale(sale_id: str, admin: AdminDep, repo: RepoDep) -> SaleOut:
    return SaleOut.build(SalesService(repo).cancel(valid_id(sale_id, "Sale"), admin.id))


@router.get("/settings", response_model=SettingsOut)
def get_settings(admin: AdminDep, repo: RepoDep, settings: SettingsDep) -> SettingsOut:
    return SettingsOut(
        low_stock_threshold=get_low_stock_threshold(repo),
        whatsapp_number=settings.whatsapp_number or None,
        storage="postgresql" if settings.uses_database else "memory",
        admin_email=admin.email,
    )


@router.put("/settings", response_model=SettingsOut)
def update_settings(
    body: SettingsUpdateIn, admin: AdminDep, repo: RepoDep, settings: SettingsDep
) -> SettingsOut:
    set_low_stock_threshold(repo, body.low_stock_threshold)
    ProductService(repo).refresh_all_statuses()
    return get_settings(admin, repo, settings)


@router.post("/uploads", response_model=UploadOut, status_code=status.HTTP_201_CREATED)
async def upload_image(
    _: AdminDep, settings: SettingsDep, file: Annotated[UploadFile, File()]
) -> UploadOut:
    limit = settings.max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Images must be {settings.max_upload_mb} MB or smaller.",
        )
    extension = next(
        (
            ext
            for ext, signatures in IMAGE_SIGNATURES.items()
            if any(data.startswith(sig) for sig in signatures)
            and (ext != "webp" or data[8:12] == b"WEBP")
        ),
        None,
    )
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Upload a JPG, PNG or WebP image.",
        )
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{extension}"
    (settings.upload_dir / name).write_bytes(data)
    return UploadOut(url=f"/uploads/{name}")
