from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.models.domain import Product, ProductStatus, SaleStatus
from app.repositories.base import Repository
from app.services.sales import PERIODS, SalesSummary, period_start, summarize
from app.services.settings import get_low_stock_threshold

CHART_DAYS = 30


@dataclass
class Kpis:
    total_products: int
    available_products: int
    sold_out_products: int
    total_stock: int
    remaining_stock: int
    sold_units: int
    inventory_value: Decimal
    inventory_retail_value: Decimal
    estimated_profit: Decimal


@dataclass
class DailySales:
    date: str
    revenue: Decimal
    units: int


@dataclass
class ProductStockRow:
    product_id: str
    name: str
    total: int
    available: int
    sold: int
    status: ProductStatus


@dataclass
class TopProduct:
    product_id: str
    name: str
    units: int
    revenue: Decimal


@dataclass
class Dashboard:
    kpis: Kpis
    low_stock_threshold: int
    sales_overview: dict[str, SalesSummary] = field(default_factory=dict)
    sales_chart: list[DailySales] = field(default_factory=list)
    inventory: list[ProductStockRow] = field(default_factory=list)
    low_stock: list[ProductStockRow] = field(default_factory=list)
    top_products: list[TopProduct] = field(default_factory=list)


def _stock_row(product: Product) -> ProductStockRow:
    return ProductStockRow(
        product_id=product.id,
        name=product.name,
        total=product.total_quantity,
        available=product.available_quantity,
        sold=product.sold_quantity,
        status=product.status,
    )


def build_dashboard(repo: Repository, timezone: str, now: datetime | None = None) -> Dashboard:
    now = now or datetime.now(UTC)
    tz = ZoneInfo(timezone)
    threshold = get_low_stock_threshold(repo)
    products = repo.list_all_products()

    year_start = period_start("year", timezone, now)
    chart_start_local = (now.astimezone(tz) - timedelta(days=CHART_DAYS - 1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    since = min(year_start, chart_start_local.astimezone(UTC)) if year_start else chart_start_local
    sales = repo.sales_since(since, SaleStatus.CONFIRMED)

    kpis = Kpis(
        total_products=len(products),
        available_products=sum(1 for p in products if p.available_quantity > 0),
        sold_out_products=sum(1 for p in products if p.available_quantity <= 0),
        total_stock=sum(p.total_quantity for p in products),
        remaining_stock=sum(p.available_quantity for p in products),
        sold_units=sum(p.sold_quantity for p in products),
        inventory_value=sum((p.cost_price * p.available_quantity for p in products), Decimal("0")),
        inventory_retail_value=sum(
            (p.selling_price * p.available_quantity for p in products), Decimal("0")
        ),
        estimated_profit=sum((p.profit_per_unit * p.sold_quantity for p in products), Decimal("0")),
    )

    overview: dict[str, SalesSummary] = {}
    for period in PERIODS:
        start = period_start(period, timezone, now)
        overview[period] = summarize([s for s in sales if start is None or s.created_at >= start])

    daily_revenue: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    daily_units: dict[str, int] = defaultdict(int)
    for sale in sales:
        day = sale.created_at.astimezone(tz).date().isoformat()
        daily_revenue[day] += sale.revenue
        daily_units[day] += sale.quantity
    chart = []
    for offset in range(CHART_DAYS):
        day = (chart_start_local + timedelta(days=offset)).date().isoformat()
        chart.append(DailySales(date=day, revenue=daily_revenue[day], units=daily_units[day]))

    rows = [_stock_row(p) for p in products]
    low_stock = sorted(
        (r for r in rows if 0 < r.available < threshold), key=lambda r: r.available
    )

    top = sorted(
        (
            TopProduct(
                product_id=p.id,
                name=p.name,
                units=p.sold_quantity,
                revenue=p.selling_price * p.sold_quantity,
            )
            for p in products
            if p.sold_quantity > 0
        ),
        key=lambda t: t.units,
        reverse=True,
    )

    return Dashboard(
        kpis=kpis,
        low_stock_threshold=threshold,
        sales_overview=overview,
        sales_chart=chart,
        inventory=sorted(rows, key=lambda r: r.available)[:8],
        low_stock=low_stock[:8],
        top_products=top[:5],
    )
