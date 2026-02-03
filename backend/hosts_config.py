"""
Configuración automática del nombre de dominio www.Approx-SAT.com en el archivo hosts
del sistema para que apunte a la IP del servidor donde se ejecuta la aplicación.

Al arrancar la aplicación:
- Se obtiene la IP del servidor actual.
- Se comprueba si www.Approx-SAT.com ya existe en el archivo hosts (local).
- Si existe, se reemplaza la IP por la del servidor actual.
- Si no existe, se añade una línea con la IP actual y www.Approx-SAT.com.

Requisito: en Linux/macOS hace falta ejecutar el servidor con permisos de
administrador (sudo) para poder escribir en /etc/hosts. En Windows, ejecutar
como administrador para modificar C:\\Windows\\System32\\drivers\\etc\\hosts.
"""
import logging
import os
import platform
import socket

logger = logging.getLogger(__name__)

DOMAIN = "www.Approx-SAT.com"


def get_server_ip() -> str | None:
    """Obtiene la IP del servidor actual (interfaz usada para salir a internet)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            hostname = socket.gethostname()
            ip = socket.gethostbyname(hostname)
            if ip and ip != "127.0.0.1":
                return ip
        except Exception:
            pass
    return None


def get_hosts_path() -> str:
    """Ruta del archivo hosts según el sistema operativo."""
    system = platform.system()
    if system == "Windows":
        return os.path.join(os.environ.get("SystemRoot", "C:\\Windows"), "System32", "drivers", "etc", "hosts")
    return "/etc/hosts"


def _line_contains_domain(line: str) -> bool:
    """True si la línea asigna una IP a nuestro dominio (o variante)."""
    line = line.strip()
    if not line or line.startswith("#"):
        return False
    parts = line.split()
    if len(parts) < 2:
        return False
    # Formato típico: IP hostname [alias ...]
    return any(
        p.lower() == DOMAIN.lower() or p.lower() == "approx-sat.com"
        for p in parts[1:]
    )


def _build_entry(ip: str) -> str:
    """Genera la línea a escribir para el dominio."""
    return f"{ip}\t{DOMAIN}\n"


def configure_hosts_domain() -> dict:
    """
    Configura www.Approx-SAT.com en el archivo hosts para que apunte a la IP del servidor.
    Si ya existe una entrada con ese dominio, se reemplaza la IP por la actual.

    Returns:
        dict con: ok (bool), ip (str|None), message (str), updated (bool)
    """
    result = {"ok": False, "ip": None, "message": "", "updated": False}
    ip = get_server_ip()
    if not ip:
        result["message"] = "No se pudo obtener la IP del servidor."
        logger.warning("hosts_config: %s", result["message"])
        return result
    result["ip"] = ip

    hosts_path = get_hosts_path()
    if not os.path.exists(hosts_path):
        result["message"] = f"El archivo hosts no existe: {hosts_path}"
        logger.warning("hosts_config: %s", result["message"])
        return result

    try:
        with open(hosts_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
    except PermissionError:
        result["message"] = (
            "Sin permisos para leer el archivo hosts. "
            "En Linux/macOS ejecuta el servidor con sudo; en Windows, como administrador."
        )
        logger.warning("hosts_config: %s", result["message"])
        return result
    except OSError as e:
        result["message"] = f"Error al leer el archivo hosts: {e}"
        logger.warning("hosts_config: %s", result["message"])
        return result

    new_entry = _build_entry(ip)
    new_lines: list[str] = []
    found = False
    for line in lines:
        if _line_contains_domain(line):
            # Reemplazar esta línea por la nueva (misma IP del servidor actual)
            new_lines.append(new_entry)
            found = True
            result["updated"] = True
        else:
            new_lines.append(line)

    if not found:
        # Añadir al final (evitar doble newline si el archivo ya termina en \n)
        if new_lines and not new_lines[-1].endswith("\n"):
            new_lines.append("\n")
        new_lines.append(new_entry)
        result["updated"] = True

    try:
        with open(hosts_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    except PermissionError:
        result["message"] = (
            "Sin permisos para escribir en el archivo hosts. "
            "En Linux/macOS ejecuta el servidor con sudo; en Windows, como administrador."
        )
        logger.warning("hosts_config: %s", result["message"])
        return result
    except OSError as e:
        result["message"] = f"Error al escribir el archivo hosts: {e}"
        logger.warning("hosts_config: %s", result["message"])
        return result

    result["ok"] = True
    result["message"] = f"Dominio {DOMAIN} configurado con IP {ip}." if result["updated"] else f"Dominio {DOMAIN} ya apuntaba a {ip}."
    logger.info("hosts_config: %s", result["message"])
    return result
