import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.models.domain import Sale, SaleStatus, Size, StockEvent, StockEventType
from app.repositories.base import Repository
from app.services.errors import ConflictError, NotFoundError, ValidationError
from app.services.products import ProductService

PERIODS = ("today", "week", "month", "year")


@dataclass
class SalesSummary:
    orders: int = 0
    units: int = 0
    revenue: Decimal = Decimal("0")
    profit: Decimal = Decimal("0")


def period_start(period: str, timezone: str, now: datetime | None = None) -> datetime | None:
    """Start of a calendar period in the store's timezone, as a UTC datetime."""
    local_now = (now or datetime.now(UTC)).astimezone(ZoneInfo(timezone))
    midnight = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "today":
        start = midnight
    elif period == "week":
        start = midnight - timedelta(days=midnight.weekday())
    elif period == "month":
        start = midnight.replace(day=1)
    elif period == "year":
        start = midnight.replace(month=1, day=1)
    else:
        return None
    return start.astimezone(UTC)


def summarize(sales: list[Sale]) -> SalesSummary:
    summary = SalesSummary()
    for sale in sales:
        if sale.status != SaleStatus.CONFIRMED:
            continue
        summary.orders += 1
        summary.units += sale.quantity
        summary.revenue += sale.revenue
        summary.profit += sale.profit
    return summary


class SalesService:
    def __init__(self, repo: Repository) -> None:
        self.repo = repo
        self.products = ProductService(repo)

    def record(
        self,
        product_id: str,
        size: Size,
        quantity: int,
        admin_id: str | None,
        customer_name: str | None = None,
        customer_phone: str | None = None,
    ) -> Sale:
        product = self.products.get(product_id)
        stock = product.size_stock(size)
        if stock is None:
            raise ValidationError(f"Size {size.value} is not set up for this product.")
        if stock.available_quantity < quantity:
            raise ConflictError(
                f"Only {stock.available_quantity} left in size {size.value}."
            )

        sale = Sale(
            id=str(uuid.uuid4()),
            product_id=product.id,
            product_name=product.name,
            size=size,
            quantity=quantity,
            selling_price=product.selling_price,
            cost_price=product.cost_price,
            status=SaleStatus.CONFIRMED,
            created_at=datetime.now(UTC),
            customer_name=customer_name,
            customer_phone=customer_phone,
        )
        if not self.repo.record_sale(sale):
            raise ConflictError("Stock changed before the sale was saved. Check availability and try again.")

        before = stock.available_quantity
        self.repo.add_stock_event(
            StockEvent(
                id=str(uuid.uuid4()),
                product_id=product.id,
                product_name=product.name,
                size=size,
                event_type=StockEventType.STOCK_SOLD,
                quantity_before=before,
                quantity_change=-quantity,
                quantity_after=before - quantity,
                created_at=datetime.now(UTC),
                admin_id=admin_id,
            )
        )
        self.products.refresh_status(product.id)
        return sale

    def cancel(self, sale_id: str, admin_id: str | None) -> Sale:
        existing = self.repo.get_sale(sale_id)
        if existing is None:
            raise NotFoundError("Sale not found.")
        if existing.status != SaleStatus.CONFIRMED:
            raise ConflictError("Only confirmed sales can be cancelled.")

        product = self.repo.get_product(existing.product_id)
        stock = product.size_stock(existing.size) if product else None
        before = stock.available_quantity if stock else 0

        sale = self.repo.cancel_sale(sale_id)
        if sale is None:
            raise ConflictError("Only confirmed sales can be cancelled.")

        if product is not None:
            self.repo.add_stock_event(
                StockEvent(
                    id=str(uuid.uuid4()),
                    product_id=product.id,
                    product_name=product.name,
                    size=sale.size,
                    event_type=StockEventType.STOCK_ADJUSTED,
                    quantity_before=before,
                    quantity_change=sale.quantity,
                    quantity_after=before + sale.quantity,
                    created_at=datetime.now(UTC),
                    note="Sale cancelled",
                    admin_id=admin_id,
                )
            )
            self.products.refresh_status(product.id)
        return sale
