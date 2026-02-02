"""
Script de uso único: crea el usuario joseantonio con contraseña approx2026
para poder iniciar sesión sin pasar por el registro con correo.
Ejecutar desde la carpeta backend: python create_initial_user.py
Usa bcrypt directamente para evitar incompatibilidad passlib/bcrypt 5.x.
"""
import bcrypt
from database import get_connection, get_user_by_username, create_user

USERNAME = "joseantonio"
PASSWORD = "approx2026"
EMAIL = "joseantonio@approx.es"


def main():
    with get_connection() as conn:
        if get_user_by_username(conn, USERNAME):
            print(f"El usuario '{USERNAME}' ya existe. Puedes iniciar sesión con él.")
            return
        hashed = bcrypt.hashpw(PASSWORD.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        create_user(conn, USERNAME, hashed, EMAIL)
    print(f"Usuario '{USERNAME}' creado correctamente.")
    print("Puedes iniciar sesión con:")
    print(f"  Usuario: {USERNAME}")
    print(f"  Contraseña: {PASSWORD}")


if __name__ == "__main__":
    main()
