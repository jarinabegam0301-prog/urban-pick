import re
import unicodedata

from app.models.domain import ProductStatus, SizeStock


def compute_status(sizes: list[SizeStock], low_stock_threshold: int) -> ProductStatus:
    available = [s.available_quantity for s in sizes]
    total = sum(available)
    if total <= 0:
        return ProductStatus.SOLD_OUT
    if total < low_stock_threshold:
        return ProductStatus.LOW_STOCK
    if any(quantity <= 0 for quantity in available):
        return ProductStatus.PARTIALLY_SOLD_OUT
    return ProductStatus.IN_STOCK


def slugify(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")
    return slug or "product"
