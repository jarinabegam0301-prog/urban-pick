from app.models.domain import ProductStatus, Size, SizeStock
from app.services.stock import compute_status, slugify


def sizes(*available: int) -> list[SizeStock]:
    return [
        SizeStock(size=size, initial_quantity=quantity)
        for size, quantity in zip(list(Size), available, strict=True)
    ]


def test_all_sizes_zero_is_sold_out():
    assert compute_status(sizes(0, 0, 0, 0, 0), 5) == ProductStatus.SOLD_OUT


def test_some_sizes_zero_is_partially_sold_out():
    assert compute_status(sizes(5, 0, 3, 0, 2), 5) == ProductStatus.PARTIALLY_SOLD_OUT


def test_total_below_threshold_is_low_stock():
    assert compute_status(sizes(1, 1, 0, 1, 0), 5) == ProductStatus.LOW_STOCK


def test_full_stock_is_in_stock():
    assert compute_status(sizes(10, 10, 10, 10, 10), 5) == ProductStatus.IN_STOCK


def test_available_is_initial_minus_sold():
    stock = SizeStock(size=Size.M, initial_quantity=10, sold_quantity=3)
    assert stock.available_quantity == 7


def test_slugify():
    assert slugify("Urban Classic Shirt") == "urban-classic-shirt"
    assert slugify("  ###  ") == "product"
