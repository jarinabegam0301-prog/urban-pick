import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import admin, auth, public
from app.core.config import Settings, settings as default_settings
from app.repositories.base import Repository
from app.services.auth import ensure_initial_admin
from app.services.errors import ServiceError
from app.services.products import ProductService
from app.services.settings import get_low_stock_threshold

logger = logging.getLogger("urban")


def build_repository(settings: Settings) -> Repository:
    if settings.database_url:
        from app.repositories.postgres import PostgresRepository

        return PostgresRepository(settings.database_url)

    from app.repositories.memory import MemoryRepository
    from app.repositories.sample_data import seed_sample_data

    repo = MemoryRepository()
    if settings.seed_sample_data:
        seed_sample_data(repo, get_low_stock_threshold(repo))
    logger.warning("DATABASE_URL is not set. Using in-memory sample data; changes are lost on restart.")
    return repo


def create_app(settings: Settings | None = None, repo: Repository | None = None) -> FastAPI:
    settings = settings or default_settings
    if not settings.auth_secret:
        raise RuntimeError("AUTH_SECRET is not set. Add it to backend/.env before starting the API.")

    repo = repo or build_repository(settings)
    if ensure_initial_admin(repo, settings.admin_email, settings.admin_password, settings.admin_name):
        logger.info("Created the first admin account for %s", settings.admin_email)
    ProductService(repo).refresh_all_statuses()

    app = FastAPI(title="URBAN API", version="1.0.0")
    app.state.settings = settings
    app.state.repo = repo

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(ServiceError)
    async def service_error(_: Request, exc: ServiceError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "storage": "postgresql" if settings.uses_database else "memory"}

    app.include_router(public.router)
    app.include_router(auth.router)
    app.include_router(admin.router)

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")
    return app
