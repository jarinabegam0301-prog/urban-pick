from pathlib import Path

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.catalog import SIZES, CatalogError
from app.core.config import settings
from app.core.security import create_token, read_token, verify_password

router = APIRouter()
store = None
UPLOADS = Path(__file__).resolve().parents[1] / "uploads"


class LoginBody(BaseModel):
    email: str
    password: str


class ProductBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category_id: str
    description: str = ""
    cost_price: float = Field(ge=0)
    selling_price: float = Field(ge=0)
    images: list[str] = []
    sizes: dict[str, int]


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    category_id: str | None = None
    description: str | None = None
    cost_price: float | None = Field(default=None, ge=0)
    selling_price: float | None = Field(default=None, ge=0)
    images: list[str] | None = None
    sizes: dict[str, int] | None = None


class SaleBody(BaseModel):
    product_id: str
    size: str
    quantity: int = Field(ge=1)
    customer_name: str = ""
    customer_phone: str = ""


class SettingsBody(BaseModel):
    low_stock_threshold: int = Field(ge=0, le=10000)


def bind_store(active_store) -> None:
    global store
    store = active_store


def require_admin(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Login required.")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = read_token(token)
    except Exception as error:
        raise HTTPException(status_code=401, detail="Login required.") from error
    admin = store.admin_by_id(payload.get("sub", ""))
    if not admin:
        raise HTTPException(status_code=401, detail="Login required.")
    return admin


def run(action):
    try:
        return action()
    except CatalogError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error


@router.get("/config/store")
def store_config() -> dict:
    return {"whatsapp_number": "".join(ch for ch in settings.whatsapp_number if ch.isdigit())}


@router.get("/categories")
def categories() -> list[dict]:
    return store.categories_public()


@router.get("/products")
def products(
    q: str = "",
    category: str = "",
    size: str = "",
    availability: str = "all",
    min_price: float | None = None,
    max_price: float | None = None,
    sort: str = "newest",
    page: int = 1,
    page_size: int = 12,
) -> dict:
    return store.list_public(
        {
            "q": q,
            "category": category,
            "size": size,
            "availability": availability,
            "min_price": min_price,
            "max_price": max_price,
            "sort": sort,
            "page": page,
            "page_size": page_size,
        }
    )


@router.get("/products/{product_id}")
def product(product_id: str) -> dict:
    return run(lambda: store.get_public(product_id))


@router.post("/auth/login")
def login(body: LoginBody) -> dict:
    admin = store.admin_by_email(body.email.strip())
    if not admin or not verify_password(body.password, admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    return {
        "access_token": create_token(admin["id"], admin["email"]),
        "token_type": "bearer",
        "admin": {"id": admin["id"], "name": admin["name"], "email": admin["email"]},
    }


@router.get("/admin/products")
def admin_products(
    q: str = "",
    status: str = "",
    page: int = 1,
    page_size: int = 12,
    admin: dict = Depends(require_admin),
) -> dict:
    del admin
    return store.list_admin({"q": q, "status": status, "page": page, "page_size": page_size})


@router.post("/admin/products")
def create_product(body: ProductBody, admin: dict = Depends(require_admin)) -> dict:
    _check_sizes(body.sizes)
    return run(lambda: store.create_product(body.model_dump(), admin["id"]))


@router.get("/admin/products/{product_id}")
def admin_product(product_id: str, admin: dict = Depends(require_admin)) -> dict:
    del admin
    return run(lambda: store.get_admin(product_id))


@router.put("/admin/products/{product_id}")
def update_product(
    product_id: str, body: ProductUpdate, admin: dict = Depends(require_admin)
) -> dict:
    payload = body.model_dump(exclude_unset=True)
    if "sizes" in payload:
        _check_sizes(payload["sizes"], partial=True)
    return run(lambda: store.update_product(product_id, payload, admin["id"]))


@router.delete("/admin/products/{product_id}")
def delete_product(product_id: str, admin: dict = Depends(require_admin)) -> dict:
    del admin
    run(lambda: store.delete_product(product_id))
    return {"deleted": True}


@router.patch("/admin/products/{product_id}/stock")
def update_stock(
    product_id: str, body: ProductUpdate, admin: dict = Depends(require_admin)
) -> dict:
    if not body.sizes:
        raise HTTPException(status_code=400, detail="Size quantities are required.")
    _check_sizes(body.sizes, partial=True)
    return run(lambda: store.update_product(product_id, {"sizes": body.sizes}, admin["id"]))


@router.patch("/admin/products/{product_id}/sold-out")
def sold_out(product_id: str, admin: dict = Depends(require_admin)) -> dict:
    return run(lambda: store.mark_sold_out(product_id, admin["id"]))


@router.patch("/admin/products/{product_id}/sizes/{size}/sold-out")
def size_sold_out(product_id: str, size: str, admin: dict = Depends(require_admin)) -> dict:
    return run(lambda: store.mark_size_sold_out(product_id, size.upper(), admin["id"]))


@router.get("/admin/products/{product_id}/history")
def history(product_id: str, admin: dict = Depends(require_admin)) -> list[dict]:
    del admin
    return run(lambda: store.history(product_id))


@router.post("/admin/sales")
def create_sale(body: SaleBody, admin: dict = Depends(require_admin)) -> dict:
    return run(lambda: store.record_sale(body.model_dump(), admin["id"]))


@router.get("/admin/sales")
def sales(
    period: str = "month",
    page: int = 1,
    page_size: int = 12,
    admin: dict = Depends(require_admin),
) -> dict:
    del admin
    if period not in {"today", "week", "month", "year"}:
        raise HTTPException(status_code=400, detail="Period is not supported.")
    return store.sales_list({"period": period, "page": page, "page_size": page_size})


@router.get("/admin/dashboard")
def dashboard(period: str = "month", admin: dict = Depends(require_admin)) -> dict:
    del admin
    if period not in {"today", "week", "month", "year"}:
        raise HTTPException(status_code=400, detail="Period is not supported.")
    return store.dashboard(period)


@router.get("/admin/inventory")
def inventory(admin: dict = Depends(require_admin)) -> list[dict]:
    del admin
    return store.inventory()


@router.get("/admin/settings")
def get_settings(admin: dict = Depends(require_admin)) -> dict:
    del admin
    return {
        **store.get_settings(),
        "whatsapp_number": "".join(ch for ch in settings.whatsapp_number if ch.isdigit()),
        "admin_email": settings.admin_email,
    }


@router.put("/admin/settings")
def update_settings(body: SettingsBody, admin: dict = Depends(require_admin)) -> dict:
    del admin
    return run(lambda: store.update_settings(body.low_stock_threshold))


@router.post("/admin/uploads")
def upload(file: UploadFile = File(...), admin: dict = Depends(require_admin)) -> dict:
    del admin
    content_type = file.content_type or ""
    if content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=400, detail="Upload a JPG, PNG, or WebP image.")
    data = file.file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be 5 MB or smaller.")
    extension = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[content_type]
    UPLOADS.mkdir(parents=True, exist_ok=True)
    name = f"{__import__('uuid').uuid4().hex}.{extension}"
    (UPLOADS / name).write_bytes(data)
    return {"image_url": f"/uploads/{name}"}


def _check_sizes(sizes: dict[str, int], partial: bool = False) -> None:
    allowed = set(SIZES)
    unknown = set(sizes) - allowed
    if unknown:
        raise HTTPException(status_code=400, detail="Size must be S, M, L, XL, or XXL.")
    if not partial and set(sizes) != allowed:
        raise HTTPException(status_code=400, detail="Enter a quantity for S, M, L, XL, and XXL.")
    for size, quantity in sizes.items():
        if quantity < 0:
            raise HTTPException(status_code=400, detail=f"{size} quantity cannot be negative.")
