"""
Autenticación: registro con verificación por correo (código enviado a @approx.es) y login (JWT).
Usuarios en base de datos SQLite. Usa bcrypt directamente (compatible con bcrypt 5.x).
"""
import os
import random
import string
from datetime import datetime, timedelta

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from jose import jwt, JWTError

from database import (
    get_connection,
    get_user_by_username,
    get_user_by_email,
    create_user,
    update_password_by_username,
    save_verification_code,
    get_verification_code,
    delete_verification_code,
)
from email_service import send_verification_email, _smtp_configured

# Dominio permitido para registro: solo correos corporativos
ALLOWED_EMAIL_DOMAIN = os.environ.get("ALLOWED_EMAIL_DOMAIN", "approx.es").lower()
CODE_EXPIRE_MINUTES = 15
DEV_EMAIL_CODE_IN_RESPONSE = os.environ.get("DEV_EMAIL_CODE_IN_RESPONSE", "").lower() in ("1", "true", "yes")

SECRET_KEY = os.environ.get("JWT_SECRET", "garantia-sat-secret-cambiar-en-produccion")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 días


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def get_password_hash(password: str) -> str:
    """Hash de contraseña para uso desde otras rutas (p. ej. crear usuario desde Configuración)."""
    return _hash_password(password)


def _verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    h = password_hash.encode("utf-8") if isinstance(password_hash, str) else password_hash
    return bcrypt.checkpw(password.encode("utf-8"), h)

router = APIRouter(prefix="/api/auth", tags=["auth"])
_http_bearer = HTTPBearer(auto_error=True)


def get_current_username(
    credentials: HTTPAuthorizationCredentials = Depends(_http_bearer),
) -> str:
    """Obtiene el nombre de usuario del JWT (Bearer). Lanza 401 si no válido."""
    try:
        payload = jwt.decode(
            credentials.credentials,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Token inválido")
        return str(username)
    except JWTError:
        raise HTTPException(status_code=401, detail="No autorizado")


class RegisterBody(BaseModel):
    username: str
    password: str
    email: str


class VerifyBody(BaseModel):
    email: str
    code: str


class LoginBody(BaseModel):
    username: str
    password: str


def _email_domain_allowed(email: str) -> bool:
    """Comprueba que el correo sea del dominio corporativo (ej. @approx.es)."""
    if not email or "@" not in email:
        return False
    domain = email.strip().lower().split("@")[-1]
    return domain == ALLOWED_EMAIL_DOMAIN


def _create_token(username: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _generate_code(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


@router.post("/register")
def register(body: RegisterBody):
    """
    Valida correo corporativo (@approx.es), genera un código de verificación,
    lo guarda y lo envía por correo. La cuenta no se crea hasta llamar a /verify.
    """
    if not _email_domain_allowed(body.email):
        raise HTTPException(
            status_code=403,
            detail=f"Solo se permite registro con correo corporativo (@{ALLOWED_EMAIL_DOMAIN}). Ejemplo: usuario@approx.es",
        )
    email_normalized = body.email.strip().lower()
    username_clean = body.username.strip()
    if not username_clean:
        raise HTTPException(status_code=400, detail="El nombre de usuario no puede estar vacío")

    with get_connection() as conn:
        if get_user_by_username(conn, username_clean):
            raise HTTPException(status_code=400, detail="El nombre de usuario ya existe")
        if get_user_by_email(conn, email_normalized):
            raise HTTPException(status_code=400, detail="Ya existe una cuenta con ese correo")

        code = _generate_code(6)
        expires_at = (datetime.utcnow() + timedelta(minutes=CODE_EXPIRE_MINUTES)).strftime("%Y-%m-%d %H:%M:%S")
        hashed = _hash_password(body.password)
        save_verification_code(conn, email_normalized, code, username_clean, hashed, expires_at)

    sent = False
    error_msg = None
    if _smtp_configured():
        sent, error_msg = send_verification_email(email_normalized, code)
    if not sent and not DEV_EMAIL_CODE_IN_RESPONSE:
        detail = error_msg or "No está configurado el envío de correos (SMTP). Contacta al administrador o usa modo desarrollo (DEV_EMAIL_CODE_IN_RESPONSE=1)."
        raise HTTPException(status_code=503, detail=detail)

    out = {
        "message": "Te hemos enviado un código de verificación a tu correo. Introdúcelo para completar el registro." if sent else "No se pudo enviar el correo. Usa el código abajo para completar el registro.",
        "email": email_normalized,
    }
    if not sent:
        out["codigo_verificacion"] = code
    return out


@router.post("/verify")
def verify(body: VerifyBody):
    """
    Comprueba el código enviado por correo y crea la cuenta. Devuelve JWT.
    """
    email_normalized = body.email.strip().lower()
    code_clean = body.code.strip()
    if not email_normalized or not code_clean:
        raise HTTPException(status_code=400, detail="Correo y código son obligatorios")

    with get_connection() as conn:
        row = get_verification_code(conn, email_normalized, code_clean)
        if not row:
            raise HTTPException(status_code=400, detail="Código incorrecto o expirado. Solicita uno nuevo desde el registro.")

        create_user(conn, row["username"], row["password_hash"], row["email"], is_admin=False)
        delete_verification_code(conn, email_normalized, code_clean)

    token = _create_token(row["username"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": row["username"],
        "is_admin": False,
    }


@router.post("/login")
def login(body: LoginBody):
    with get_connection() as conn:
        user = get_user_by_username(conn, body.username)
    if not user or not _verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    token = _create_token(user["username"])
    is_admin = bool(user.get("is_admin"))
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user["username"],
        "is_admin": is_admin,
    }


@router.get("/me")
def me(username: str = Depends(get_current_username)):
    """Devuelve el usuario actual (username, is_admin) para el frontend."""
    with get_connection() as conn:
        user = get_user_by_username(conn, username)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {
        "username": user["username"],
        "is_admin": bool(user.get("is_admin")),
    }


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
def change_password(
    body: ChangePasswordBody,
    username: str = Depends(get_current_username),
):
    """Cambia la contraseña del usuario actual. Requiere la contraseña actual."""
    with get_connection() as conn:
        user = get_user_by_username(conn, username)
        if not user or not _verify_password(body.current_password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Contraseña actual incorrecta")
        if not body.new_password or len(body.new_password.strip()) < 4:
            raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 4 caracteres")
        new_hash = _hash_password(body.new_password.strip())
        if not update_password_by_username(conn, username, new_hash):
            raise HTTPException(status_code=500, detail="Error al actualizar la contraseña")
    return {"message": "Contraseña actualizada"}
