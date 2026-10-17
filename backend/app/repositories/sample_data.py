"""Sample catalogue for running without a database. Never used with PostgreSQL."""

import random
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from app.models.domain import (
    SIZE_ORDER,
    Category,
    Product,
    ProductStatus,
    Sale,
    SaleStatus,
    SizeStock,
    StockEvent,
    StockEventType,
)
from app.repositories.memory import MemoryRepository

CATEGORIES = [
    ("T-Shirts", "t-shirts"),
    ("Shirts", "shirts"),
    ("Pants", "pants"),
    ("Hoodies", "hoodies"),
    ("Others", "others"),
]

# name, category slug, cost, selling, original, initial per size, sold per size, description
PRODUCTS = [
    (
        "Urban Oversized Tee", "t-shirts", 380, 799, 999,
        [12, 18, 20, 14, 8], [4, 9, 11, 6, 2],
        "Heavy 240 GSM cotton with a dropped shoulder and a boxy fit. Built to keep its shape wash after wash.",
    ),
    (
        "Urban Classic Shirt", "shirts", 700, 1199, 1499,
        [10, 10, 10, 10, 10], [2, 10, 2, 3, 1],
        "A crisp cotton poplin shirt with a clean collar. Dresses up or down without trying.",
    ),
    (
        "Urban Premium Shirt", "shirts", 650, 1099, None,
        [5, 10, 10, 5, 5], [0, 3, 1, 0, 0],
        "Soft brushed twill in a relaxed cut. The everyday shirt you reach for first.",
    ),
    (
        "Urban Cargo Pants", "pants", 900, 1699, 1999,
        [6, 8, 8, 6, 4], [2, 3, 4, 1, 0],
        "Utility cargo in durable cotton ripstop, with a tapered leg and roomy pockets.",
    ),
    (
        "Urban Heavyweight Hoodie", "hoodies", 1100, 2199, 2599,
        [4, 6, 6, 4, 2], [4, 5, 6, 3, 2],
        "Brushed-back fleece at 400 GSM, double-lined hood and ribbed cuffs.",
    ),
    (
        "Urban Linen Shirt", "shirts", 820, 1399, None,
        [3, 3, 3, 2, 2], [3, 3, 3, 2, 2],
        "Breathable pure linen for warm days. Relaxed, airy and naturally textured.",
    ),
    (
        "Urban Pocket Tee", "t-shirts", 300, 649, None,
        [15, 20, 20, 15, 10], [3, 6, 5, 2, 1],
        "A regular-fit tee with a single chest pocket, cut from combed cotton jersey.",
    ),
    (
        "Urban Relaxed Chinos", "pants", 850, 1599, None,
        [5, 7, 7, 5, 3], [1, 2, 2, 1, 0],
        "Stretch cotton chinos with a relaxed straight leg. Smart enough for anywhere.",
    ),
    (
        "Urban Overshirt Jacket", "others", 1200, 2299, 2799,
        [3, 5, 5, 3, 2], [0, 1, 2, 1, 0],
        "A structured overshirt in heavy cotton canvas. Layer it over a tee or hoodie.",
    ),
    (
        "Urban Zip Hoodie", "hoodies", 1050, 1999, None,
        [6, 8, 8, 6, 4], [0, 0, 0, 0, 0],
        "Full-zip hoodie in midweight fleece with a metal zip and kangaroo pockets.",
    ),
]


def seed_sample_data(repo: MemoryRepository, low_stock_threshold: int) -> None:
    from app.services.stock import compute_status, slugify

    rng = random.Random(42)
    now = datetime.now(UTC)
    categories: dict[str, Category] = {}
    for name, slug in CATEGORIES:
        category = Category(id=str(uuid.uuid4()), name=name, slug=slug)
        repo.add_category(category)
        categories[slug] = category

    for index, (name, category_slug, cost, selling, original, initial, sold, description) in enumerate(
        PRODUCTS
    ):
        created_at = now - timedelta(days=120 - index * 9)
        sizes = [
            SizeStock(size=size, initial_quantity=quantity)
            for size, quantity in zip(SIZE_ORDER, initial, strict=True)
        ]
        product = Product(
            id=str(uuid.uuid4()),
            name=name,
            slug=slugify(name),
            category=categories[category_slug],
            description=description,
            cost_price=Decimal(cost),
            selling_price=Decimal(selling),
            original_price=Decimal(original) if original else None,
            status=ProductStatus.IN_STOCK,
            is_published=True,
            created_at=created_at,
            updated_at=created_at,
            sizes=sizes,
        )
        repo.insert_product(product)
        for stock in sizes:
            repo.add_stock_event(
                StockEvent(
                    id=str(uuid.uuid4()),
                    product_id=product.id,
                    product_name=name,
                    size=stock.size,
                    event_type=StockEventType.STOCK_ADDED,
                    quantity_before=0,
                    quantity_change=stock.initial_quantity,
                    quantity_after=stock.initial_quantity,
                    created_at=created_at,
                    note="Initial stock",
                )
            )

        product_age = (now - created_at).days
        for size, units in zip(SIZE_ORDER, sold, strict=True):
            remaining = units
            available = product.size_stock(size).initial_quantity
            while remaining > 0:
                quantity = min(remaining, rng.randint(1, 3))
                days_ago = rng.randint(0, min(product_age - 1, 75))
                sold_at = now - timedelta(days=days_ago, hours=rng.randint(0, 20))
                sold_at = min(sold_at, now - timedelta(minutes=5))
                sale = Sale(
                    id=str(uuid.uuid4()),
                    product_id=product.id,
                    product_name=name,
                    size=size,
                    quantity=quantity,
                    selling_price=product.selling_price,
                    cost_price=product.cost_price,
                    status=SaleStatus.CONFIRMED,
                    created_at=sold_at,
                    customer_name=rng.choice(["Aarav", "Diya", "Kabir", "Meera", "Rohan", None]),
                )
                repo.record_sale(sale)
                repo.add_stock_event(
                    StockEvent(
                        id=str(uuid.uuid4()),
                        product_id=product.id,
                        product_name=name,
                        size=size,
                        event_type=StockEventType.STOCK_SOLD,
                        quantity_before=available,
                        quantity_change=-quantity,
                        quantity_after=available - quantity,
                        created_at=sold_at,
                    )
                )
                available -= quantity
                remaining -= quantity

    for product in repo.list_all_products():
        repo.set_product_status(product.id, compute_status(product.sizes, low_stock_threshold))
