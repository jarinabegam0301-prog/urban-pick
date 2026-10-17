import re
import uuid
from datetime import datetime, timedelta, timezone
from threading import Lock

SIZES = ("S", "M", "L", "XL", "XXL")
STATUSES = ("in_stock", "low_stock", "partially_sold_out", "sold_out")


class CatalogError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "product"


def now() -> datetime:
    return datetime.now(timezone.utc)


def money(value: float) -> float:
    return round(float(value), 2)


def product_status(sizes: dict[str, dict], threshold: int) -> str:
    available = [row["initial_quantity"] - row["sold_quantity"] for row in sizes.values()]
    if not available or all(qty <= 0 for qty in available):
        return "sold_out"
    if any(qty <= 0 for qty in available):
        return "partially_sold_out"
    if sum(available) <= threshold:
        return "low_stock"
    return "in_stock"


def size_rows(raw: dict[str, int] | None) -> dict[str, dict]:
    source = raw or {}
    rows = {}
    for size in SIZES:
        quantity = int(source.get(size, 0))
        if quantity < 0:
            raise CatalogError(f"{size} quantity cannot be negative.")
        rows[size] = {"initial_quantity": quantity, "sold_quantity": 0}
    return rows


class MemoryStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self.categories = [
            self._category("T-Shirts", "t-shirts"),
            self._category("Shirts", "shirts"),
            self._category("Pants", "pants"),
            self._category("Hoodies", "hoodies"),
            self._category("Others", "others"),
        ]
        self.products: dict[str, dict] = {}
        self.sales: list[dict] = []
        self.events: list[dict] = []
        self.admins: dict[str, dict] = {}
        self.settings = {"low_stock_threshold": 5}

    def _category(self, name: str, slug: str) -> dict:
        return {"id": str(uuid.uuid4()), "name": name, "slug": slug}

    def ensure_admin(self, email: str, password_hash: str, name: str) -> None:
        with self._lock:
            existing = next(
                (admin for admin in self.admins.values() if admin["email"] == email.lower()),
                None,
            )
            if existing:
                return
            admin_id = str(uuid.uuid4())
            self.admins[admin_id] = {
                "id": admin_id,
                "name": name,
                "email": email.lower(),
                "password_hash": password_hash,
                "role": "admin",
            }

    def admin_by_email(self, email: str) -> dict | None:
        with self._lock:
            return next(
                (dict(admin) for admin in self.admins.values() if admin["email"] == email.lower()),
                None,
            )

    def admin_by_id(self, admin_id: str) -> dict | None:
        with self._lock:
            admin = self.admins.get(admin_id)
            return dict(admin) if admin else None

    def categories_public(self) -> list[dict]:
        return [{"id": item["id"], "name": item["name"], "slug": item["slug"]} for item in self.categories]

    def list_public(self, filters: dict) -> dict:
        with self._lock:
            items = [self._public(product) for product in self._active_products()]
        items = _filter_public(items, filters)
        items = _sort_public(items, filters.get("sort") or "newest")
        return _page(items, filters.get("page") or 1, filters.get("page_size") or 12)

    def get_public(self, product_id: str) -> dict:
        with self._lock:
            product = self._active(product_id)
            return self._public(product)

    def list_admin(self, filters: dict) -> dict:
        with self._lock:
            items = [self._admin(product) for product in self._active_products()]
        query = (filters.get("q") or "").strip().lower()
        if query:
            items = [item for item in items if query in item["name"].lower()]
        status = filters.get("status") or ""
        if status:
            items = [item for item in items if item["status"] == status]
        items.sort(key=lambda item: item["created_at"], reverse=True)
        return _page(items, filters.get("page") or 1, filters.get("page_size") or 12)

    def get_admin(self, product_id: str) -> dict:
        with self._lock:
            return self._admin(self._active(product_id))

    def create_product(self, payload: dict, admin_id: str) -> dict:
        with self._lock:
            category = self._category_by_id(payload["category_id"])
            product_id = str(uuid.uuid4())
            created = now()
            sizes = size_rows(payload["sizes"])
            product = {
                "id": product_id,
                "name": payload["name"].strip(),
                "slug": self._unique_slug(payload["name"]),
                "category_id": category["id"],
                "description": payload.get("description") or "",
                "cost_price": money(payload["cost_price"]),
                "selling_price": money(payload["selling_price"]),
                "created_at": created,
                "updated_at": created,
                "deleted_at": None,
                "images": _images(product_id, payload.get("images") or []),
                "sizes": sizes,
            }
            product["status"] = product_status(sizes, self._threshold())
            self.products[product_id] = product
            for size, row in sizes.items():
                if row["initial_quantity"] > 0:
                    self._event(
                        product_id,
                        size,
                        "stock_added",
                        0,
                        row["initial_quantity"],
                        row["initial_quantity"],
                        admin_id,
                        "Initial stock",
                    )
            return self._admin(product)

    def update_product(self, product_id: str, payload: dict, admin_id: str) -> dict:
        with self._lock:
            product = self._active(product_id)
            if "category_id" in payload:
                self._category_by_id(payload["category_id"])
                product["category_id"] = payload["category_id"]
            if "name" in payload:
                product["name"] = payload["name"].strip()
            if "description" in payload:
                product["description"] = payload["description"]
            if "cost_price" in payload:
                product["cost_price"] = money(payload["cost_price"])
            if "selling_price" in payload:
                product["selling_price"] = money(payload["selling_price"])
            if "images" in payload:
                product["images"] = _images(product_id, payload["images"])
            if "sizes" in payload:
                self._apply_initial(product, payload["sizes"], admin_id)
            product["updated_at"] = now()
            product["status"] = product_status(product["sizes"], self._threshold())
            return self._admin(product)

    def delete_product(self, product_id: str) -> None:
        with self._lock:
            product = self._active(product_id)
            product["deleted_at"] = now()

    def mark_sold_out(self, product_id: str, admin_id: str) -> dict:
        with self._lock:
            product = self._active(product_id)
            for size, row in product["sizes"].items():
                available = row["initial_quantity"] - row["sold_quantity"]
                if available <= 0:
                    continue
                row["sold_quantity"] = row["initial_quantity"]
                self._event(
                    product_id,
                    size,
                    "product_marked_sold_out",
                    available,
                    -available,
                    0,
                    admin_id,
                    "Product marked sold out",
                )
            product["status"] = "sold_out"
            product["updated_at"] = now()
            return self._admin(product)

    def mark_size_sold_out(self, product_id: str, size: str, admin_id: str) -> dict:
        with self._lock:
            product = self._active(product_id)
            row = self._size(product, size)
            available = row["initial_quantity"] - row["sold_quantity"]
            row["sold_quantity"] = row["initial_quantity"]
            if available > 0:
                self._event(
                    product_id,
                    size,
                    "size_marked_sold_out",
                    available,
                    -available,
                    0,
                    admin_id,
                    f"{size} marked sold out",
                )
            product["status"] = product_status(product["sizes"], self._threshold())
            product["updated_at"] = now()
            return self._admin(product)

    def record_sale(self, payload: dict, admin_id: str) -> dict:
        with self._lock:
            product = self._active(payload["product_id"])
            size = payload["size"]
            quantity = int(payload["quantity"])
            if quantity < 1:
                raise CatalogError("Quantity must be at least 1.")
            row = self._size(product, size)
            available = row["initial_quantity"] - row["sold_quantity"]
            if quantity > available:
                raise CatalogError(
                    f"Only {available} available in size {size}. Requested {quantity}."
                )
            before = available
            row["sold_quantity"] += quantity
            after = row["initial_quantity"] - row["sold_quantity"]
            sale = {
                "id": str(uuid.uuid4()),
                "product_id": product["id"],
                "product_name": product["name"],
                "size": size,
                "quantity": quantity,
                "selling_price": product["selling_price"],
                "cost_price": product["cost_price"],
                "profit": money((product["selling_price"] - product["cost_price"]) * quantity),
                "customer_name": payload.get("customer_name") or "",
                "customer_phone": payload.get("customer_phone") or "",
                "status": "confirmed",
                "created_at": now(),
            }
            self.sales.append(sale)
            self._event(
                product["id"],
                size,
                "stock_sold",
                before,
                -quantity,
                after,
                admin_id,
                "Sale recorded",
            )
            product["status"] = product_status(product["sizes"], self._threshold())
            product["updated_at"] = now()
            return _sale_out(sale)

    def history(self, product_id: str) -> list[dict]:
        with self._lock:
            self._active(product_id)
            rows = [event for event in self.events if event["product_id"] == product_id]
        rows.sort(key=lambda item: item["created_at"], reverse=True)
        return [_event_out(event) for event in rows]

    def sales_list(self, filters: dict) -> dict:
        start = _period_start(filters.get("period") or "month")
        with self._lock:
            rows = [sale for sale in self.sales if sale["created_at"] >= start and sale["status"] == "confirmed"]
        rows.sort(key=lambda item: item["created_at"], reverse=True)
        return _page([_sale_out(sale) for sale in rows], filters.get("page") or 1, filters.get("page_size") or 12)

    def dashboard(self, period: str) -> dict:
        start = _period_start(period)
        with self._lock:
            products = [self._admin(product) for product in self._active_products()]
            period_sales = [
                sale for sale in self.sales if sale["created_at"] >= start and sale["status"] == "confirmed"
            ]
            all_sales = [sale for sale in self.sales if sale["status"] == "confirmed"]
        return _dashboard(products, period_sales, all_sales, period)

    def inventory(self) -> list[dict]:
        with self._lock:
            products = [self._admin(product) for product in self._active_products()]
        return [
            {
                "id": item["id"],
                "name": item["name"],
                "category": item["category"],
                "total_quantity": item["total_quantity"],
                "available_quantity": item["available_quantity"],
                "sold_quantity": item["sold_quantity"],
                "status": item["status"],
            }
            for item in products
        ]

    def get_settings(self) -> dict:
        with self._lock:
            return {"low_stock_threshold": self._threshold()}

    def update_settings(self, threshold: int) -> dict:
        if threshold < 0:
            raise CatalogError("Low stock threshold cannot be negative.")
        with self._lock:
            self.settings["low_stock_threshold"] = threshold
            for product in self._active_products():
                product["status"] = product_status(product["sizes"], threshold)
            return {"low_stock_threshold": threshold}

    def _apply_initial(self, product: dict, sizes: dict, admin_id: str) -> None:
        for size in SIZES:
            if size not in sizes:
                continue
            initial = int(sizes[size])
            if initial < 0:
                raise CatalogError(f"{size} quantity cannot be negative.")
            row = product["sizes"][size]
            if initial < row["sold_quantity"]:
                raise CatalogError(
                    f"{size} stock cannot be lower than the sold quantity ({row['sold_quantity']})."
                )
            before = row["initial_quantity"] - row["sold_quantity"]
            row["initial_quantity"] = initial
            after = initial - row["sold_quantity"]
            if after != before:
                self._event(
                    product["id"],
                    size,
                    "stock_adjusted",
                    before,
                    after - before,
                    after,
                    admin_id,
                    "Stock adjusted",
                )

    def _event(
        self,
        product_id: str,
        size: str | None,
        event_type: str,
        before: int,
        change: int,
        after: int,
        admin_id: str | None,
        note: str,
    ) -> None:
        self.events.append(
            {
                "id": str(uuid.uuid4()),
                "product_id": product_id,
                "size": size,
                "event_type": event_type,
                "quantity_before": before,
                "quantity_change": change,
                "quantity_after": after,
                "note": note,
                "admin_id": admin_id,
                "created_at": now(),
            }
        )

    def _threshold(self) -> int:
        return int(self.settings["low_stock_threshold"])

    def _active_products(self) -> list[dict]:
        return [product for product in self.products.values() if product["deleted_at"] is None]

    def _active(self, product_id: str) -> dict:
        product = self.products.get(product_id)
        if not product or product["deleted_at"] is not None:
            raise CatalogError("Product not found.", 404)
        return product

    def _category_by_id(self, category_id: str) -> dict:
        category = next((item for item in self.categories if item["id"] == category_id), None)
        if not category:
            raise CatalogError("Category not found.", 404)
        return category

    def _size(self, product: dict, size: str) -> dict:
        if size not in SIZES:
            raise CatalogError("Size must be S, M, L, XL, or XXL.")
        return product["sizes"][size]

    def _unique_slug(self, name: str) -> str:
        base = slugify(name)
        slug = base
        taken = {product["slug"] for product in self.products.values() if product["deleted_at"] is None}
        count = 2
        while slug in taken:
            slug = f"{base}-{count}"
            count += 1
        return slug

    def _category_name(self, category_id: str) -> str:
        category = next(item for item in self.categories if item["id"] == category_id)
        return category["name"]

    def _public(self, product: dict) -> dict:
        sizes = [
            {
                "size": size,
                "available": product["sizes"][size]["initial_quantity"] - product["sizes"][size]["sold_quantity"] > 0,
            }
            for size in SIZES
        ]
        return {
            "id": product["id"],
            "name": product["name"],
            "slug": product["slug"],
            "description": product["description"],
            "selling_price": product["selling_price"],
            "images": list(product["images"]),
            "category": self._category_name(product["category_id"]),
            "category_id": product["category_id"],
            "sizes": sizes,
            "status": "sold_out" if all(not row["available"] for row in sizes) else "available",
            "created_at": product["created_at"].isoformat(),
        }

    def _admin(self, product: dict) -> dict:
        sizes = []
        total = available = sold = 0
        for size in SIZES:
            row = product["sizes"][size]
            row_available = row["initial_quantity"] - row["sold_quantity"]
            total += row["initial_quantity"]
            available += row_available
            sold += row["sold_quantity"]
            sizes.append(
                {
                    "size": size,
                    "initial_quantity": row["initial_quantity"],
                    "sold_quantity": row["sold_quantity"],
                    "available_quantity": row_available,
                }
            )
        profit_per_unit = money(product["selling_price"] - product["cost_price"])
        return {
            "id": product["id"],
            "name": product["name"],
            "slug": product["slug"],
            "description": product["description"],
            "category": self._category_name(product["category_id"]),
            "category_id": product["category_id"],
            "cost_price": product["cost_price"],
            "selling_price": product["selling_price"],
            "profit_per_unit": profit_per_unit,
            "total_quantity": total,
            "available_quantity": available,
            "sold_quantity": sold,
            "estimated_profit": money(profit_per_unit * sold),
            "status": product["status"],
            "images": list(product["images"]),
            "sizes": sizes,
            "created_at": product["created_at"].isoformat(),
        }


def _images(product_id: str, urls: list[str]) -> list[dict]:
    images = []
    for index, url in enumerate(urls):
        cleaned = url.strip()
        if not cleaned:
            continue
        images.append(
            {
                "id": str(uuid.uuid4()),
                "product_id": product_id,
                "image_url": cleaned,
                "sort_order": index,
            }
        )
    return images


def _filter_public(items: list[dict], filters: dict) -> list[dict]:
    query = (filters.get("q") or "").strip().lower()
    category = filters.get("category") or ""
    size = filters.get("size") or ""
    availability = filters.get("availability") or "all"
    min_price = filters.get("min_price")
    max_price = filters.get("max_price")
    result = []
    for item in items:
        if query and query not in item["name"].lower():
            continue
        if category and item["category_id"] != category and item["category"].lower() != category.lower():
            continue
        if size:
            match = next((row for row in item["sizes"] if row["size"] == size), None)
            if not match or not match["available"]:
                continue
        if availability == "available" and item["status"] != "available":
            continue
        if availability == "sold_out" and item["status"] != "sold_out":
            continue
        if min_price is not None and item["selling_price"] < min_price:
            continue
        if max_price is not None and item["selling_price"] > max_price:
            continue
        result.append(item)
    return result


def _sort_public(items: list[dict], sort: str) -> list[dict]:
    if sort == "price_asc":
        return sorted(items, key=lambda item: item["selling_price"])
    if sort == "price_desc":
        return sorted(items, key=lambda item: item["selling_price"], reverse=True)
    if sort == "name":
        return sorted(items, key=lambda item: item["name"].lower())
    return sorted(items, key=lambda item: item["created_at"], reverse=True)


def _page(items: list, page: int, page_size: int) -> dict:
    page = max(int(page), 1)
    page_size = min(max(int(page_size), 1), 48)
    start = (page - 1) * page_size
    return {
        "items": items[start : start + page_size],
        "page": page,
        "page_size": page_size,
        "total": len(items),
    }


def _period_start(period: str) -> datetime:
    current = now()
    if period == "today":
        return current.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "week":
        return current - timedelta(days=7)
    if period == "year":
        return current - timedelta(days=365)
    return current - timedelta(days=30)


def _sale_out(sale: dict) -> dict:
    return {
        "id": sale["id"],
        "product_id": sale["product_id"],
        "product_name": sale["product_name"],
        "size": sale["size"],
        "quantity": sale["quantity"],
        "selling_price": sale["selling_price"],
        "cost_price": sale["cost_price"],
        "profit": sale["profit"],
        "customer_name": sale["customer_name"],
        "customer_phone": sale["customer_phone"],
        "status": sale["status"],
        "created_at": sale["created_at"].isoformat(),
    }


def _event_out(event: dict) -> dict:
    return {
        "id": event["id"],
        "product_id": event["product_id"],
        "size": event["size"],
        "event_type": event["event_type"],
        "quantity_before": event["quantity_before"],
        "quantity_change": event["quantity_change"],
        "quantity_after": event["quantity_after"],
        "note": event["note"],
        "created_at": event["created_at"].isoformat(),
    }


def _dashboard(products: list[dict], period_sales: list[dict], all_sales: list[dict], period: str) -> dict:
    available_products = [item for item in products if item["status"] != "sold_out"]
    sold_out = [item for item in products if item["status"] == "sold_out"]
    low_stock = [item for item in products if item["status"] == "low_stock"]
    buckets = _sales_buckets(period_sales, period)
    top: dict[str, dict] = {}
    for sale in period_sales:
        row = top.setdefault(
            sale["product_id"],
            {"name": sale["product_name"], "sold": 0, "profit": 0.0},
        )
        row["sold"] += sale["quantity"]
        row["profit"] = money(row["profit"] + sale["profit"])
    top_products = sorted(top.values(), key=lambda item: item["sold"], reverse=True)[:5]
    return {
        "period": period,
        "kpis": {
            "total_products": len(products),
            "available_products": len(available_products),
            "sold_out_products": len(sold_out),
            "total_stock": sum(item["total_quantity"] for item in products),
            "remaining_stock": sum(item["available_quantity"] for item in products),
            "inventory_value": money(
                sum(item["cost_price"] * item["available_quantity"] for item in products)
            ),
            "estimated_profit": money(sum(sale["profit"] for sale in all_sales)),
        },
        "period_revenue": money(sum(sale["selling_price"] * sale["quantity"] for sale in period_sales)),
        "period_profit": money(sum(sale["profit"] for sale in period_sales)),
        "sales_series": buckets,
        "inventory_split": {
            "available": sum(item["available_quantity"] for item in products),
            "sold": sum(item["sold_quantity"] for item in products),
        },
        "top_products": top_products,
        "low_stock": [
            {
                "id": item["id"],
                "name": item["name"],
                "remaining": item["available_quantity"],
                "status": item["status"],
            }
            for item in low_stock
        ],
        "inventory_rows": [
            {
                "id": item["id"],
                "name": item["name"],
                "total_quantity": item["total_quantity"],
                "available_quantity": item["available_quantity"],
                "sold_quantity": item["sold_quantity"],
                "status": item["status"],
            }
            for item in products[:8]
        ],
    }


def _sales_buckets(sales: list[dict], period: str) -> list[dict]:
    current = now()
    if period == "today":
        labels = [f"{hour:02d}:00" for hour in range(0, 24, 3)]
        buckets = [{"label": label, "total": 0.0} for label in labels]
        for sale in sales:
            index = min(sale["created_at"].hour // 3, len(buckets) - 1)
            buckets[index]["total"] = money(buckets[index]["total"] + sale["selling_price"] * sale["quantity"])
        return buckets
    days = 7 if period == "week" else 12 if period == "month" else 12
    span = 1 if period == "week" else 30 if period == "year" else 2
    buckets = []
    for index in range(days):
        start = (current - timedelta(days=(days - index) * span)).date()
        buckets.append({"label": start.strftime("%d %b"), "start": start, "total": 0.0})
    for sale in sales:
        sale_date = sale["created_at"].date()
        for bucket in reversed(buckets):
            if sale_date >= bucket["start"]:
                bucket["total"] = money(bucket["total"] + sale["selling_price"] * sale["quantity"])
                break
    return [{"label": bucket["label"], "total": bucket["total"]} for bucket in buckets]
