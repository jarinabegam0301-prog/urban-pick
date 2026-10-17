import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.auth import login_limiter

ADMIN_EMAIL = "admin@urban.com"
ADMIN_PASSWORD = "test-password-123"


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        database_url=None,
        auth_secret="test-secret-value-that-is-long-enough",
        admin_email=ADMIN_EMAIL,
        admin_password=ADMIN_PASSWORD,
        whatsapp_number="919876543210",
        upload_dir=tmp_path / "uploads",
        seed_sample_data=True,
    )


@pytest.fixture
def client(settings) -> TestClient:
    login_limiter._failures.clear()
    return TestClient(create_app(settings))


@pytest.fixture
def admin_client(client) -> TestClient:
    response = client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert response.status_code == 200
    return client


@pytest.fixture
def category_id(admin_client) -> str:
    categories = admin_client.get("/admin/categories").json()
    return next(c["id"] for c in categories if c["slug"] == "shirts")
