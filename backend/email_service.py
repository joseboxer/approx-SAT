"""
Envío de correos para verificación de registro.
Configuración por variables de entorno (ver .env.example).
Servidor corporativo approx.es (smtp.approx.es), puerto 465 con SSL.
"""
import os
import smtplib
import socket
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SMTP_TIMEOUT = 15  # segundos; evita que la petición se quede colgada


def _smtp_configured() -> bool:
    host = os.environ.get("SMTP_HOST", "").strip()
    user = os.environ.get("SMTP_USER", "").strip()
    return bool(host and user)


def send_verification_email(to_email: str, code: str) -> tuple[bool, str | None]:
    """
    Envía el correo con el código de verificación.
    Devuelve (True, None) si se envió correctamente, (False, mensaje_error) si falla.
    """
    if not _smtp_configured():
        return False, "SMTP no configurado"

    host = os.environ.get("SMTP_HOST", "smtp.approx.es").strip()
    port = int(os.environ.get("SMTP_PORT", "465"))
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "")
    if isinstance(password, str) and password.startswith('"') and password.endswith('"'):
        password = password[1:-1]
    from_addr = os.environ.get("EMAIL_FROM", user or "noreply@approx.es")

    subject = "Código de verificación - SAT aqprox"
    body = f"""Hola,

Has solicitado crear una cuenta en SAT (Servicio de Asistencia Técnica).

Tu código de verificación es: {code}

Introduce este código en la pantalla de registro para completar la creación de la cuenta.
El código es válido durante 15 minutos.

Si no has solicitado este registro, puedes ignorar este correo.

—
SAT · aqprox
"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        if port == 465:
            # SSL requerido (serviciodecorreo.es), con timeout para no colgar
            with smtplib.SMTP_SSL(host, port, timeout=SMTP_TIMEOUT) as server:
                if user and password:
                    server.login(user, password)
                server.sendmail(from_addr, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(host, port, timeout=SMTP_TIMEOUT) as server:
                if port == 587:
                    server.starttls()
                if user and password:
                    server.login(user, password)
                server.sendmail(from_addr, [to_email], msg.as_string())
        return True, None
    except socket.timeout:
        return False, "Tiempo de espera agotado al conectar con el servidor de correo. Comprueba SMTP_HOST y red."
    except Exception as e:
        return False, str(e) or "Error desconocido al enviar el correo"
