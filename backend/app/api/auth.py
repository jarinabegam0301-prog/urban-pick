from fastapi import APIRouter, HTTPException, Request, Response, status

from app.auth.dependencies import SESSION_COOKIE, AdminDep, RepoDep, SettingsDep
from app.core.security import create_session_token
from app.schemas.admin import AdminOut, ChangePasswordIn, LoginIn
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=AdminOut)
def login(
    body: LoginIn, request: Request, response: Response, repo: RepoDep, settings: SettingsDep
) -> AdminOut:
    client = request.client.host if request.client else "unknown"
    admin = auth_service.authenticate(repo, body.email, body.password, client)
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Email or password is incorrect."
        )
    token = create_session_token(admin.id, settings.auth_secret, settings.session_hours)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
    )
    return AdminOut.build(admin)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, settings: SettingsDep) -> None:
    response.delete_cookie(
        SESSION_COOKIE,
        path="/",
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        httponly=True,
    )


@router.get("/me", response_model=AdminOut)
def me(admin: AdminDep) -> AdminOut:
    return AdminOut.build(admin)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(body: ChangePasswordIn, admin: AdminDep, repo: RepoDep) -> None:
    auth_service.change_password(repo, admin, body.current_password, body.new_password)
