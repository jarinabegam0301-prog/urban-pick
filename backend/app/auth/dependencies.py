import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.core.config import Settings
from app.core.security import read_session_token
from app.models.domain import Admin
from app.repositories.base import Repository

SESSION_COOKIE = "urban_session"


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_repo(request: Request) -> Repository:
    return request.app.state.repo


SettingsDep = Annotated[Settings, Depends(get_settings)]
RepoDep = Annotated[Repository, Depends(get_repo)]


def current_admin(request: Request, repo: RepoDep, settings: SettingsDep) -> Admin:
    token = request.cookies.get(SESSION_COOKIE)
    admin_id = read_session_token(token, settings.auth_secret) if token else None
    admin = repo.get_admin(admin_id) if admin_id else None
    if admin is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue.")
    return admin


AdminDep = Annotated[Admin, Depends(current_admin)]


def valid_id(value: str, label: str = "Product") -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} not found.") from exc
