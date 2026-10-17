import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from app.models.domain import (
    SIZE_ORDER,
    Product,
    Size,
    SizeStock,
    StockEvent,
    StockEventType,
)
from app.repositories.base import Repository
from app.services.errors import NotFoundError, ValidationError
from app.services.settings import get_low_stock_threshold
from app.services.stock import compute_status, slugify


@dataclass
class ProductFields:
    name: str
    category_id: str
    description: str
    cost_price: Decimal
    selling_price: Decimal
    original_price: Decimal | None
    images: list[str]
    is_published: bool


class ProductService:
    def __init__(self, repo: Repository) -> None:
        self.repo = repo

    def get(self, product_id: str) -> Product:
        product = self.repo.get_product(product_id)
        if product is None:
            raise NotFoundError("Product not found.")
        return product

    def _unique_slug(self, name: str, exclude_id: str | None = None) -> str:
        base = slugify(name)
        slug = base
        suffix = 2
        while self.repo.slug_exists(slug, exclude_id):
            slug = f"{base}-{suffix}"
            suffix += 1
        return slug

    def _category(self, category_id: str):
        category = self.repo.get_category(category_id)
        if category is None:
            raise ValidationError("Choose a valid category.")
        return category

    def _event(
        self,
        product: Product,
        size: Size | None,
        event_type: StockEventType,
        before: int,
        after: int,
        admin_id: str | None,
        note: str | None = None,
    ) -> None:
        self.repo.add_stock_event(
            StockEvent(
                id=str(uuid.uuid4()),
                product_id=product.id,
                product_name=product.name,
                size=size,
                event_type=event_type,
                quantity_before=before,
                quantity_change=after - before,
                quantity_after=after,
                created_at=datetime.now(UTC),
                note=note,
                admin_id=admin_id,
            )
        )

    def refresh_status(self, product_id: str) -> Product:
        product = self.get(product_id)
        status = compute_status(product.sizes, get_low_stock_threshold(self.repo))
        if status != product.status:
            self.repo.set_product_status(product_id, status)
            product.status = status
        return product

    def refresh_all_statuses(self) -> None:
        threshold = get_low_stock_threshold(self.repo)
        for product in self.repo.list_all_products():
            status = compute_status(product.sizes, threshold)
            if status != product.status:
                self.repo.set_product_status(product.id, status)

    def create(
        self, fields: ProductFields, quantities: dict[Size, int], admin_id: str | None
    ) -> Product:
        category = self._category(fields.category_id)
        now = datetime.now(UTC)
        sizes = [SizeStock(size=size, initial_quantity=quantities.get(size, 0)) for size in SIZE_ORDER]
        product = Product(
            id=str(uuid.uuid4()),
            name=fields.name,
            slug=self._unique_slug(fields.name),
            category=category,
            description=fields.description,
            cost_price=fields.cost_price,
            selling_price=fields.selling_price,
            original_price=fields.original_price,
            status=compute_status(sizes, get_low_stock_threshold(self.repo)),
            is_published=fields.is_published,
            created_at=now,
            updated_at=now,
            images=fields.images,
            sizes=sizes,
        )
        self.repo.insert_product(product)
        for stock in sizes:
            if stock.initial_quantity > 0:
                self._event(
                    product,
                    stock.size,
                    StockEventType.STOCK_ADDED,
                    0,
                    stock.initial_quantity,
                    admin_id,
                    "Initial stock",
                )
        return self.get(product.id)

    def update(self, product_id: str, fields: ProductFields) -> Product:
        product = self.get(product_id)
        if fields.name != product.name:
            product.slug = self._unique_slug(fields.name, exclude_id=product_id)
        product.name = fields.name
        product.category = self._category(fields.category_id)
        product.description = fields.description
        product.cost_price = fields.cost_price
        product.selling_price = fields.selling_price
        product.original_price = fields.original_price
        product.images = fields.images
        product.is_published = fields.is_published
        self.repo.update_product(product)
        return self.get(product_id)

    def update_stock(
        self,
        product_id: str,
        initial_quantities: dict[Size, int],
        admin_id: str | None,
        note: str | None = None,
    ) -> Product:
        product = self.get(product_id)
        changes: list[SizeStock] = []
        for size, initial in initial_quantities.items():
            current = product.size_stock(size) or SizeStock(size=size, initial_quantity=0)
            if initial < current.sold_quantity:
                raise ValidationError(
                    f"Size {size.value} has already sold {current.sold_quantity}. "
                    f"Stock cannot be lower than that."
                )
            if initial != current.initial_quantity:
                changes.append(
                    SizeStock(size=size, initial_quantity=initial, sold_quantity=current.sold_quantity)
                )

        if not changes:
            return product

        self.repo.update_sizes(product_id, changes)
        for change in changes:
            previous = product.size_stock(change.size)
            before = previous.available_quantity if previous else 0
            after = change.available_quantity
            event_type = (
                StockEventType.STOCK_ADDED if after > before else StockEventType.STOCK_ADJUSTED
            )
            self._event(product, change.size, event_type, before, after, admin_id, note)
        return self.refresh_status(product_id)

    def mark_size_sold_out(self, product_id: str, size: Size, admin_id: str | None) -> Product:
        product = self.get(product_id)
        stock = product.size_stock(size)
        if stock is None:
            raise NotFoundError(f"Size {size.value} is not set up for this product.")
        if stock.available_quantity > 0:
            before = stock.available_quantity
            self.repo.update_sizes(
                product_id,
                [SizeStock(size=size, initial_quantity=stock.sold_quantity, sold_quantity=stock.sold_quantity)],
            )
            self._event(product, size, StockEventType.SIZE_MARKED_SOLD_OUT, before, 0, admin_id)
        return self.refresh_status(product_id)

    def mark_sold_out(self, product_id: str, admin_id: str | None) -> Product:
        product = self.get(product_id)
        in_stock = [s for s in product.sizes if s.available_quantity > 0]
        if in_stock:
            self.repo.update_sizes(
                product_id,
                [
                    SizeStock(size=s.size, initial_quantity=s.sold_quantity, sold_quantity=s.sold_quantity)
                    for s in in_stock
                ],
            )
            for stock in in_stock:
                self._event(
                    product,
                    stock.size,
                    StockEventType.PRODUCT_MARKED_SOLD_OUT,
                    stock.available_quantity,
                    0,
                    admin_id,
                )
        return self.refresh_status(product_id)

    def delete(self, product_id: str) -> None:
        self.get(product_id)
        self.repo.soft_delete_product(product_id)
