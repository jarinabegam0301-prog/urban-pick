from tests.conftest import ADMIN_EMAIL

PRIVATE_FIELDS = {
    "cost_price",
    "profit",
    "profit_per_unit",
    "estimated_profit",
    "initial_quantity",
    "sold_quantity",
    "available_quantity",
    "total_quantity",
}


def create_premium_shirt(client, category_id: str) -> dict:
    response = client.post(
        "/admin/products",
        json={
            "name": "Urban Premium Shirt Test",
            "category_id": category_id,
            "description": "Test shirt",
            "cost_price": 650,
            "selling_price": 1099,
            "sizes": [
                {"size": "S", "quantity": 5},
                {"size": "M", "quantity": 10},
                {"size": "L", "quantity": 10},
                {"size": "XL", "quantity": 5},
                {"size": "XXL", "quantity": 5},
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def all_keys(value) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {k for v in value.values() for k in all_keys(v)}
    if isinstance(value, list):
        return {k for item in value for k in all_keys(item)}
    return set()


def test_public_api_never_exposes_private_fields(client):
    listing = client.get("/products").json()
    assert listing["items"]
    assert not all_keys(listing) & PRIVATE_FIELDS

    detail = client.get(f"/products/{listing['items'][0]['id']}").json()
    assert not all_keys(detail) & PRIVATE_FIELDS


def test_admin_endpoints_require_login(client):
    for method, path in [
        ("get", "/admin/products"),
        ("get", "/admin/dashboard"),
        ("post", "/admin/products"),
        ("get", "/admin/sales"),
        ("get", "/admin/settings"),
    ]:
        assert getattr(client, method)(path).status_code == 401


def test_admin_can_manage_categories(admin_client, category_id):
    created = admin_client.post("/admin/categories", json={"name": "Accessories"})
    assert created.status_code == 201, created.text
    category = created.json()
    assert category["name"] == "Accessories"
    assert category["slug"] == "accessories"

    renamed = admin_client.put(f"/admin/categories/{category['id']}", json={"name": "Jewellery"})
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["slug"] == "jewellery"

    duplicate = admin_client.post("/admin/categories", json={"name": "jewellery"})
    assert duplicate.status_code == 409

    product_category = admin_client.get("/admin/categories").json()
    shirts_id = next(item["id"] for item in product_category if item["slug"] == "shirts")
    create_premium_shirt(admin_client, shirts_id)
    in_use = admin_client.delete(f"/admin/categories/{shirts_id}")
    assert in_use.status_code == 409
    assert "assigned to products" in in_use.json()["detail"]

    deleted = admin_client.delete(f"/admin/categories/{category['id']}")
    assert deleted.status_code == 204
    assert all(item["id"] != category["id"] for item in admin_client.get("/admin/categories").json())


def test_wrong_password_is_rejected_and_rate_limited(client):
    for _ in range(5):
        response = client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert response.status_code == 401
    response = client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
    assert response.status_code == 429


def test_session_cookie_is_http_only(client):
    from tests.conftest import ADMIN_PASSWORD

    response = client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "password_hash" not in response.text


def test_stock_example_from_spec(admin_client, category_id):
    product = create_premium_shirt(admin_client, category_id)
    assert product["total_quantity"] == 35
    assert product["profit_per_unit"] == 449

    sale = admin_client.post(
        "/admin/sales", json={"product_id": product["id"], "size": "M", "quantity": 3}
    )
    assert sale.status_code == 201, sale.text
    assert sale.json()["profit"] == 1347

    updated = admin_client.get(f"/admin/products/{product['id']}").json()
    medium = next(s for s in updated["sizes"] if s["size"] == "M")
    assert (medium["initial_quantity"], medium["sold_quantity"], medium["available_quantity"]) == (10, 3, 7)
    assert updated["total_quantity"] == 35
    assert updated["sold_quantity"] == 3
    assert updated["available_quantity"] == 32
    assert updated["estimated_profit"] == 1347


def test_cannot_sell_more_than_available(admin_client, category_id):
    product = create_premium_shirt(admin_client, category_id)
    response = admin_client.post(
        "/admin/sales", json={"product_id": product["id"], "size": "S", "quantity": 6}
    )
    assert response.status_code == 409
    assert "Only 5 left" in response.json()["detail"]


def test_size_sold_out_reflects_publicly(admin_client, category_id):
    product = create_premium_shirt(admin_client, category_id)
    response = admin_client.patch(f"/admin/products/{product['id']}/sizes/M/sold-out")
    assert response.status_code == 200
    assert response.json()["status"] == "partially_sold_out"

    public = admin_client.get(f"/products/{product['id']}").json()
    availability = {s["size"]: s["available"] for s in public["sizes"]}
    assert availability == {"S": True, "M": False, "L": True, "XL": True, "XXL": True}
    assert public["status"] == "available"


def test_product_sold_out_reflects_publicly(admin_client, category_id):
    product = create_premium_shirt(admin_client, category_id)
    response = admin_client.patch(f"/admin/products/{product['id']}/sold-out")
    assert response.json()["status"] == "sold_out"
    assert response.json()["available_quantity"] == 0

    public = admin_client.get(f"/products/{product['id']}").json()
    assert public["status"] == "sold_out"
    assert not any(s["available"] for s in public["sizes"])


def test_stock_cannot_drop_below_sold(admin_client, category_id):
    product = create_premium_shirt(admin_client, category_id)
    admin_client.post("/admin/sales", json={"product_id": product["id"], "size": "M", "quantity": 4})
    response = admin_client.patch(
        f"/admin/products/{product['id']}/stock",
        json={"sizes": [{"size": "M", "initial_quantity": 3}]},
    )
    assert response.status_code == 422


def test_cancel_sale_returns_stock(admin_client, category_id):
    product = create_premium_shirt(admin_client, category_id)
    sale = admin_client.post(
        "/admin/sales", json={"product_id": product["id"], "size": "L", "quantity": 2}
    ).json()
    cancelled = admin_client.post(f"/admin/sales/{sale['id']}/cancel")
    assert cancelled.json()["status"] == "cancelled"
    updated = admin_client.get(f"/admin/products/{product['id']}").json()
    large = next(s for s in updated["sizes"] if s["size"] == "L")
    assert large["available_quantity"] == 10


def test_deleted_product_disappears_from_store(admin_client, category_id):
    product = create_premium_shirt(admin_client, category_id)
    assert admin_client.delete(f"/admin/products/{product['id']}").status_code == 204
    assert admin_client.get(f"/products/{product['id']}").status_code == 404


def test_hidden_product_is_not_public(admin_client, category_id):
    product = create_premium_shirt(admin_client, category_id)
    body = {
        "name": product["name"],
        "category_id": category_id,
        "description": "",
        "cost_price": 650,
        "selling_price": 1099,
        "images": [],
        "is_published": False,
    }
    assert admin_client.put(f"/admin/products/{product['id']}", json=body).status_code == 200
    assert admin_client.get(f"/products/{product['id']}").status_code == 404


def test_original_price_must_not_be_below_selling(admin_client, category_id):
    response = admin_client.post(
        "/admin/products",
        json={
            "name": "Bad price",
            "category_id": category_id,
            "cost_price": 100,
            "selling_price": 500,
            "original_price": 400,
            "sizes": [{"size": "S", "quantity": 1}],
        },
    )
    assert response.status_code == 422


def test_public_filters(client):
    sold_out = client.get("/products", params={"availability": "sold_out"}).json()
    assert sold_out["items"]
    assert all(p["status"] == "sold_out" for p in sold_out["items"])

    cheap = client.get("/products", params={"max_price": 800, "sort": "price_asc"}).json()
    prices = [p["selling_price"] for p in cheap["items"]]
    assert prices == sorted(prices)
    assert all(price <= 800 for price in prices)

    medium = client.get("/products", params={"size": "M"}).json()
    for product in medium["items"]:
        assert any(s["size"] == "M" and s["available"] for s in product["sizes"])


def test_dashboard(admin_client):
    data = admin_client.get("/admin/dashboard").json()
    kpis = data["kpis"]
    assert kpis["total_products"] == 10
    assert kpis["total_stock"] == kpis["remaining_stock"] + kpis["sold_units"]
    assert set(data["sales_overview"]) == {"today", "week", "month", "year"}
    assert len(data["sales_chart"]) == 30


def test_upload_rejects_non_images(admin_client):
    response = admin_client.post(
        "/admin/uploads", files={"file": ("x.png", b"not an image", "image/png")}
    )
    assert response.status_code == 415

    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
    response = admin_client.post("/admin/uploads", files={"file": ("x.png", png, "image/png")})
    assert response.status_code == 201
    assert response.json()["url"].startswith("/uploads/")


def test_change_password(admin_client):
    from tests.conftest import ADMIN_PASSWORD

    response = admin_client.post(
        "/auth/change-password",
        json={"current_password": ADMIN_PASSWORD, "new_password": "another-password-456"},
    )
    assert response.status_code == 204
    admin_client.post("/auth/logout")
    assert admin_client.get("/admin/products").status_code == 401
    login = admin_client.post(
        "/auth/login", json={"email": ADMIN_EMAIL, "password": "another-password-456"}
    )
    assert login.status_code == 200
