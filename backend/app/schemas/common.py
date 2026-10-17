from decimal import Decimal
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, Field, PlainSerializer

Money = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]

PriceIn = Annotated[Decimal, Field(ge=0, le=10_000_000, max_digits=12, decimal_places=2)]

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


def page_count(total: int, page_size: int) -> int:
    return max(1, -(-total // page_size))
