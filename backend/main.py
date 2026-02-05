"""
API Garantías: usuarios (auth), RMA/productos/clientes en base de datos.
Carga de Excel: contrasta con la BD y solo añade registros nuevos.
El Excel de sincronización puede ser una ruta fija (p. ej. QNAP) o subida manual.
Tareas largas (sync, sync-reset, catalog refresh) devuelven task_id y reportan progreso vía GET /api/tasks/{task_id}.
Integración Atractor: informe de ventas totalizadas por rango de fechas (configurable desde la app).
"""
import base64
import csv
import io
import json
import os
import ssl
import threading
import urllib.error
import urllib.request
import uuid
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import pandas as pd
import numpy as np
from pydantic import BaseModel

from auth import router as auth_router, get_current_username, get_password_hash
from hosts_config import get_server_ip
from productos_catalogo import get_productos_catalogo
from database import (
    get_connection,
    get_all_rma_items,
    get_client_groups,
    get_productos_rma,
    get_setting,
    set_setting,
    insert_audit_log,
    list_audit_log,
    get_catalog_cache,
    set_catalog_cache,
    insert_rma_item,
    rma_item_exists,
    delete_all_rma_items,
    update_estado_by_rma_number,
    update_estado_by_rma_numbers,
    update_fecha_recogida_by_rma_number,
    set_hidden_by_rma_number,
    set_serial_warranty,
    unify_clients,
    remove_member_from_group,
    get_all_repuestos,
    get_repuesto_by_id,
    create_repuesto,
    update_repuesto,
    delete_repuesto,
    get_user_by_username,
    get_user_by_id,
    get_user_by_id_full,
    list_users,
    list_users_admin,
    create_user,
    update_user,
    update_password_by_id,
    count_admins,
    delete_user,
    user_is_admin,
    get_notifications_for_user,
    get_notifications_sent_by_user,
    count_unread_notifications,
    save_push_subscription,
    get_push_subscriptions_for_user,
    create_notification,
    mark_notification_read,
    get_all_rma_especiales,
    get_rma_especial_by_id,
    get_rma_especial_by_rma_number,
    insert_rma_especial,
    update_rma_especial_estado,
    update_rma_especial_linea_estado,
    update_rma_especial_dates,
    delete_rma_especial,
)

# CORS: en desarrollo solo localhost; en red local poner CORS_ORIGINS=* en .env
# Por defecto se incluyen localhost y el dominio www.Approx-SAT.com (puertos 8000, 8443, 80, 443) para acceso por nombre
_default_cors = "http://localhost:3000,http://localhost:5173,http://www.Approx-SAT.com:8000,http://www.Approx-SAT.com:80,https://www.Approx-SAT.com:443,https://www.Approx-SAT.com:8443"
_cors_origins = os.getenv("CORS_ORIGINS", _default_cors).strip()
_cors_list = [o.strip() for o in _cors_origins.split(",") if o.strip()] if _cors_origins != "*" else ["*"]

app = FastAPI(title="API Garantías")


@app.on_event("startup")
def ensure_admin_user():
    """Si no existe ningún usuario administrador, crea uno por defecto: admin / approx2026."""
    with get_connection() as conn:
        cur = conn.execute("SELECT 1 FROM users WHERE COALESCE(is_admin, 0) = 1 LIMIT 1")
        if cur.fetchone() is not None:
            return
        if get_user_by_username(conn, "admin"):
            return
        create_user(
            conn,
            "admin",
            get_password_hash(DEFAULT_NEW_USER_PASSWORD),
            "admin@approx.es",
            is_admin=True,
        )


app.include_router(auth_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Tareas en segundo plano (sync, sync-reset, catalog refresh) con progreso en tiempo real
_tasks: dict[str, dict] = {}
_tasks_lock = threading.Lock()


def _update_task(task_id: str, **kwargs) -> None:
    with _tasks_lock:
        if task_id in _tasks:
            _tasks[task_id] = {**_tasks[task_id], **kwargs}


# Mapeo de posibles nombres de columna en Excel a nuestras claves internas
_EXCEL_COLUMNS = {
    "rma_number": ["Nº DE RMA", "NÂº DE RMA", "N° DE RMA", "Nº DE RMA"],
    "product": ["PRODUCTO"],
    "serial": ["Nº DE SERIE", "NÂº DE SERIE", "NUMERO DE SERIE", "Serie", "Nº SERIE"],
    "client_name": ["RAZON SOCIAL O NOMBRE", "RAZÓN SOCIAL O NOMBRE", "CLIENTE", "NOMBRE"],
    "client_email": ["EMAIL", "CORREO", "E-MAIL"],
    "client_phone": ["TELEFONO", "TELÉFONO", "TELF", "TELEFONO"],
    "date_received": ["FECHA RECIBIDO", "FECHA"],
    "date_pickup": ["FECHA RECOGIDA"],
    "date_sent": ["FECHA ENVIADO"],
    "averia": ["AVERIA", "AVERÍA"],
    "observaciones": ["OBSERVACIONES"],
}


def _excel_row_to_columns(df: pd.DataFrame) -> dict:
    """Construye un mapa: clave interna -> nombre de columna en el Excel (el primero que coincida)."""
    col_map = {}
    for col in df.columns:
        col_str = str(col).strip()
        for key, candidates in _EXCEL_COLUMNS.items():
            if key in col_map:
                continue
            for c in candidates:
                if c.strip() == col_str or c == col_str:
                    col_map[key] = col
                    break
    return col_map


def _value(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    if hasattr(v, "isoformat"):  # datetime
        return v.isoformat()[:10] if hasattr(v, "isoformat") else str(v)
    return str(v).strip() or None


# Rutas por defecto (env); se pueden sobreescribir desde la app (tabla settings)
_BASE_DIR = Path(__file__).resolve().parent
_DEFAULT_EXCEL_SYNC_PATH = os.environ.get("EXCEL_SYNC_PATH", str(_BASE_DIR / "productos.xlsx"))
_DEFAULT_PRODUCTOS_CATALOG_PATH = os.environ.get("PRODUCTOS_CATALOG_PATH", "").strip()


def _normalize_unc_path(raw: str) -> str:
    r"""
    Normaliza ruta para acceso a red (UNC) en Windows.
    - \\server\share o \server\share -> \\server\share (dos barras al inicio).
    - server\share o Qnap-approx2\z\... (sin barras al inicio) -> \\server\share (interpretado como UNC).
    - En Windows la ruta debe pasarse como una sola cadena a Path() para que no se normalice mal.
    """
    if not raw or not raw.strip():
        return raw.strip() if raw is not None else ""
    s = raw.strip()
    # Ya tiene una barra al inicio pero no dos: \server\share -> \\server\share
    if len(s) > 1 and s[0] == "\\" and s[1] != "\\":
        s = "\\" + s
    # Sin barras al inicio pero parece UNC: "server\share" o "Qnap-approx2\z\DEPT. TEC\..."
    # (en Windows una ruta que no sea C:\ etc. y contenga \ puede ser host\share)
    elif s and s[0] != "\\" and "\\" in s and (len(s) < 2 or s[1] != ":"):
        s = "\\" + s
    return s


def _get_excel_sync_path(conn) -> str:
    # .strip() solo quita espacios al inicio/final; espacios en la ruta (ej. "DEPT. TEC\\archivo nombre.xlsx") se conservan
    raw = (get_setting(conn, "EXCEL_SYNC_PATH") or _DEFAULT_EXCEL_SYNC_PATH).strip()
    return _normalize_unc_path(raw)


def _get_productos_catalog_path(conn) -> str:
    raw = (get_setting(conn, "PRODUCTOS_CATALOG_PATH") or _DEFAULT_PRODUCTOS_CATALOG_PATH).strip()
    return _normalize_unc_path(raw)

# Ruta raíz: solo si NO servimos el frontend compilado (para no tapar la SPA)
_frontend_dist = Path(__file__).resolve().parent / ".." / "frontend" / "dist"
if not _frontend_dist.exists():
    @app.get("/")
    def root():
        return {"mensaje": "API Garantías", "frontend": "Compila con: cd frontend && npm run build"}


@app.get("/api/productos")
def leer_productos():
    """Devuelve todos los ítems RMA desde la base de datos (con estado y ocultos)."""
    with get_connection() as conn:
        return get_all_rma_items(conn)


def _save_last_sync_error(message: str) -> None:
    """Guarda en settings el último error de sincronización para mostrarlo en Estado."""
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    with get_connection() as c:
        set_setting(c, "LAST_SYNC_AT", now)
        set_setting(c, "LAST_SYNC_STATUS", "error")
        set_setting(c, "LAST_SYNC_MESSAGE", message[:500])


def _save_last_catalog_error(message: str) -> None:
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    with get_connection() as c:
        set_setting(c, "LAST_CATALOG_AT", now)
        set_setting(c, "LAST_CATALOG_STATUS", "error")
        set_setting(c, "LAST_CATALOG_MESSAGE", message[:500])


def _run_sync_reset_task(task_id: str, excel_path: str) -> None:
    """Ejecuta sync-reset en segundo plano. La ruta Excel viene ya normalizada desde settings."""
    try:
        path_str = os.path.normpath(excel_path) if (os.name == "nt" and excel_path and excel_path.startswith("\\\\")) else (excel_path or "")
        _update_task(task_id, percent=0, message="Leyendo Excel...")
        df = pd.read_excel(path_str, sheet_name=0)
        df = df.replace({np.nan: None})
        col_map = _excel_row_to_columns(df)
        if "rma_number" not in col_map:
            _update_task(task_id, status="error", percent=0, message="Excel sin columna Nº DE RMA", result=None)
            return
        total = len(df)
        _update_task(task_id, percent=5, message="Borrando registros anteriores...")
        with get_connection() as conn:
            delete_all_rma_items(conn)
        loaded = 0
        seen: set[tuple[str, str]] = set()  # (rma_number, serial) para evitar duplicados del Excel
        with get_connection() as conn:
            for idx, row in df.iterrows():
                rma = _value(row.get(col_map.get("rma_number")))
                serial = _value(row.get(col_map.get("serial"))) if col_map.get("serial") else None
                serial_key = (serial or "").strip()
                if not rma:
                    continue
                if (rma, serial_key) in seen:
                    continue  # Duplicado en el Excel: misma combinación RMA + serie
                seen.add((rma, serial_key))
                pct = 5 + int(90 * (idx + 1) / total) if total else 95
                _update_task(task_id, percent=min(pct, 95), message=f"Insertando fila {idx + 2}...")
                excel_row = int(idx) + 2
                insert_rma_item(
                    conn,
                    rma_number=rma,
                    product=_value(row.get(col_map.get("product"))) if col_map.get("product") else None,
                    serial=serial,
                    client_name=_value(row.get(col_map.get("client_name"))) if col_map.get("client_name") else None,
                    client_email=_value(row.get(col_map.get("client_email"))) if col_map.get("client_email") else None,
                    client_phone=_value(row.get(col_map.get("client_phone"))) if col_map.get("client_phone") else None,
                    date_received=_value(row.get(col_map.get("date_received"))) if col_map.get("date_received") else None,
                    averia=_value(row.get(col_map.get("averia"))) if col_map.get("averia") else None,
                    observaciones=_value(row.get(col_map.get("observaciones"))) if col_map.get("observaciones") else None,
                    date_pickup=_value(row.get(col_map.get("date_pickup"))) if col_map.get("date_pickup") else None,
                    date_sent=_value(row.get(col_map.get("date_sent"))) if col_map.get("date_sent") else None,
                    excel_row=excel_row,
                )
                loaded += 1
        _update_task(
            task_id,
            status="done",
            percent=100,
            message="Completado",
            result={"mensaje": "Lista RMA recargada desde Excel. Todos los registros tienen número de fila.", "cargados": loaded},
        )
        _now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        with get_connection() as c:
            set_setting(c, "LAST_SYNC_AT", _now)
            set_setting(c, "LAST_SYNC_STATUS", "ok")
            set_setting(c, "LAST_SYNC_MESSAGE", f"Recargados {loaded} registros desde Excel.")
    except FileNotFoundError as e:
        msg = f"No se encuentra el archivo Excel: {e}"
        _update_task(task_id, status="error", percent=0, message=msg, result=None)
        _save_last_sync_error(msg)
    except PermissionError as e:
        msg = f"Sin permiso para leer el Excel (puede estar abierto en otro programa): {e}"
        _update_task(task_id, status="error", percent=0, message=msg, result=None)
        _save_last_sync_error(msg)
    except Exception as e:
        msg = str(e)
        _update_task(task_id, status="error", percent=0, message=msg, result=None)
        _save_last_sync_error(msg)


@app.post("/api/productos/sync-reset")
async def recargar_rma_desde_excel(username: str = Depends(get_current_username)):
    """
    Borra todos los registros RMA y vuelve a cargar la lista entera desde el Excel
    configurado (EXCEL_SYNC_PATH). Devuelve task_id para consultar progreso en GET /api/tasks/{task_id}.
    """
    with get_connection() as conn:
        excel_path = _get_excel_sync_path(conn)
        insert_audit_log(conn, username, "sync_reset_started", "rma", "", excel_path or "")
    path_str = os.path.normpath(excel_path) if (os.name == "nt" and excel_path and excel_path.startswith("\\\\")) else (excel_path or "")
    if not path_str or not path_str.strip():
        raise HTTPException(status_code=400, detail="No hay ruta de Excel configurada. Configura la ruta en Configuración (solo administrador).")
    if not os.path.exists(path_str):
        raise HTTPException(
            status_code=400,
            detail=f"No se encuentra el archivo Excel. Comprueba que el servidor tiene acceso a la unidad de red. Ruta: {path_str}",
        )
    if not os.path.isfile(path_str):
        raise HTTPException(status_code=400, detail=f"La ruta no es un archivo: {path_str}")
    task_id = str(uuid.uuid4())
    with _tasks_lock:
        _tasks[task_id] = {"status": "running", "percent": 0, "message": "Iniciando...", "result": None}
    threading.Thread(target=_run_sync_reset_task, args=(task_id, excel_path), daemon=True).start()
    return {"task_id": task_id}


@app.get("/api/tasks/{task_id}")
def get_task_progress(task_id: str):
    """Devuelve el progreso de una tarea (sync, sync-reset, catalog refresh)."""
    with _tasks_lock:
        t = _tasks.get(task_id)
    if t is None:
        return {"status": "not_found", "percent": 0, "message": "", "result": None}
    return {
        "status": t.get("status", "running"),
        "percent": t.get("percent", 0),
        "message": t.get("message", ""),
        "result": t.get("result"),
    }


def _run_sync_task(task_id: str, excel_path: str | None, file_content: bytes | None) -> None:
    """Ejecuta sync (añadir solo nuevos) en segundo plano. La ruta Excel viene ya normalizada desde settings."""
    try:
        if file_content is not None:
            _update_task(task_id, percent=0, message="Leyendo Excel subido...")
            df = pd.read_excel(io.BytesIO(file_content), sheet_name=0)
        else:
            _update_task(task_id, percent=0, message="Leyendo Excel...")
            path_str = os.path.normpath(excel_path) if (os.name == "nt" and excel_path and excel_path.startswith("\\\\")) else (excel_path or "")
            df = pd.read_excel(path_str, sheet_name=0)
        df = df.replace({np.nan: None})
        col_map = _excel_row_to_columns(df)
        if "rma_number" not in col_map:
            _update_task(task_id, status="error", percent=0, message="Excel sin columna Nº DE RMA", result=None)
            return
        total = len(df)
        added = 0
        seen: set[tuple[str, str]] = set()  # (rma_number, serial) para no insertar duplicados del Excel
        with get_connection() as conn:
            for idx, row in df.iterrows():
                rma = _value(row.get(col_map.get("rma_number")))
                serial = _value(row.get(col_map.get("serial"))) if col_map.get("serial") else None
                serial_key = (serial or "").strip()
                if not rma:
                    continue
                if (rma, serial_key) in seen:
                    continue
                seen.add((rma, serial_key))
                pct = int(100 * (idx + 1) / total) if total else 100
                _update_task(task_id, percent=pct, message=f"Procesando fila {idx + 2}...")
                if rma_item_exists(conn, rma, serial_key):
                    continue
                excel_row = int(idx) + 2
                insert_rma_item(
                    conn,
                    rma_number=rma,
                    product=_value(row.get(col_map.get("product"))) if col_map.get("product") else None,
                    serial=serial,
                    client_name=_value(row.get(col_map.get("client_name"))) if col_map.get("client_name") else None,
                    client_email=_value(row.get(col_map.get("client_email"))) if col_map.get("client_email") else None,
                    client_phone=_value(row.get(col_map.get("client_phone"))) if col_map.get("client_phone") else None,
                    date_received=_value(row.get(col_map.get("date_received"))) if col_map.get("date_received") else None,
                    averia=_value(row.get(col_map.get("averia"))) if col_map.get("averia") else None,
                    observaciones=_value(row.get(col_map.get("observaciones"))) if col_map.get("observaciones") else None,
                    date_pickup=_value(row.get(col_map.get("date_pickup"))) if col_map.get("date_pickup") else None,
                    date_sent=_value(row.get(col_map.get("date_sent"))) if col_map.get("date_sent") else None,
                    excel_row=excel_row,
                )
                added += 1
        _update_task(
            task_id,
            status="done",
            percent=100,
            message="Completado",
            result={"mensaje": "Sincronización completada", "añadidos": added},
        )
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        with get_connection() as c:
            set_setting(c, "LAST_SYNC_AT", now)
            set_setting(c, "LAST_SYNC_STATUS", "ok")
            set_setting(c, "LAST_SYNC_MESSAGE", f"Sincronización completada. Añadidos: {added}.")
    except FileNotFoundError as e:
        msg = f"No se encuentra el archivo Excel: {e}"
        _update_task(task_id, status="error", percent=0, message=msg, result=None)
        _save_last_sync_error(msg)
    except PermissionError as e:
        msg = f"Sin permiso para leer el Excel (puede estar abierto en otro programa): {e}"
        _update_task(task_id, status="error", percent=0, message=msg, result=None)
        _save_last_sync_error(msg)
    except Exception as e:
        _update_task(task_id, status="error", percent=0, message=str(e), result=None)
        _save_last_sync_error(str(e))


@app.post("/api/productos/sync")
async def sincronizar_excel(
    file: UploadFile = File(None),
    username: str = Depends(get_current_username),
):
    """
    Sincroniza con la BD leyendo el Excel (ruta configurada o archivo subido).
    Solo se insertan filas nuevas. Devuelve task_id para consultar progreso en GET /api/tasks/{task_id}.
    """
    file_content = None
    excel_path = None
    if file and file.filename:
        if not file.filename.lower().endswith((".xlsx", ".xls")):
            raise HTTPException(status_code=400, detail="Debe subir un archivo Excel (.xlsx o .xls)")
        file_content = await file.read()
    else:
        with get_connection() as conn:
            excel_path = _get_excel_sync_path(conn)
            insert_audit_log(conn, username, "sync_started", "rma", "", excel_path or "")
        path_str = os.path.normpath(excel_path) if (os.name == "nt" and excel_path and excel_path.startswith("\\\\")) else (excel_path or "")
        if not path_str or not path_str.strip():
            raise HTTPException(status_code=400, detail="No hay ruta de Excel configurada. Configura la ruta en Configuración (solo administrador).")
        if not os.path.exists(path_str):
            raise HTTPException(status_code=400, detail=f"No se encuentra el archivo o la ruta. Comprueba que el servidor tiene acceso. Ruta: {path_str}")
        if not os.path.isfile(path_str):
            raise HTTPException(status_code=400, detail=f"La ruta no es un archivo: {path_str}")
    task_id = str(uuid.uuid4())
    with _tasks_lock:
        _tasks[task_id] = {"status": "running", "percent": 0, "message": "Iniciando...", "result": None}
    threading.Thread(target=_run_sync_task, args=(task_id, excel_path, file_content), daemon=True).start()
    return {"task_id": task_id}


class EstadoBody(BaseModel):
    estado: str = ""


@app.patch("/api/rmas/{rma_number}/estado")
def actualizar_estado(rma_number: str, body: EstadoBody):
    """Actualiza el estado (abonado, reparado, no_anomalias, vacío) de todos los ítems del RMA."""
    with get_connection() as conn:
        n = update_estado_by_rma_number(conn, rma_number, (body.estado or "").strip())
    return {"actualizados": n}


class FechaRecogidaBody(BaseModel):
    fecha_recogida: str = ""


@app.patch("/api/rmas/{rma_number}/fecha-recogida")
def actualizar_fecha_recogida(rma_number: str, body: FechaRecogidaBody):
    """Actualiza la fecha de recogida de todos los ítems del RMA (YYYY-MM-DD o vacío)."""
    with get_connection() as conn:
        n = update_fecha_recogida_by_rma_number(
            conn, rma_number, (body.fecha_recogida or "").strip()
        )
    return {"actualizados": n}


class EstadoMasivoBody(BaseModel):
    rma_numbers: list[str] = []
    estado: str = ""


@app.patch("/api/rmas/estado-masivo")
def actualizar_estado_masivo(body: EstadoMasivoBody):
    """Actualiza el estado de varios RMAs a la vez."""
    rma_numbers = [n.strip() for n in (body.rma_numbers or []) if n and n.strip()]
    estado = (body.estado or "").strip()
    if not rma_numbers:
        raise HTTPException(status_code=400, detail="Indica al menos un RMA")
    with get_connection() as conn:
        n = update_estado_by_rma_numbers(conn, rma_numbers, estado)
    return {"actualizados": n}


@app.patch("/api/rmas/{rma_number}/ocultar")
def ocultar_rma(rma_number: str, username: str = Depends(get_current_username)):
    """Marca como ocultos todos los ítems del RMA. Se guarda el usuario que oculta (afecta a todos)."""
    with get_connection() as conn:
        n = set_hidden_by_rma_number(conn, rma_number, True, hidden_by=username)
    return {"actualizados": n}


@app.patch("/api/rmas/{rma_number}/desocultar")
def desocultar_rma(rma_number: str):
    """Quita el marcado de oculto de todos los ítems del RMA."""
    with get_connection() as conn:
        n = set_hidden_by_rma_number(conn, rma_number, False)
    return {"actualizados": n}


class UnificarClientesBody(BaseModel):
    nombres: list[str] = []


@app.get("/api/clientes/grupos")
def listar_grupos_clientes():
    """Devuelve todos los grupos de clientes unificados (canónico + miembros)."""
    with get_connection() as conn:
        return get_client_groups(conn)


@app.post("/api/clientes/unificar")
def unificar_clientes(body: UnificarClientesBody, username: str = Depends(get_current_username)):
    """
    Unifica varios clientes seleccionados en un grupo. Se conservan nombre y correo
    del cliente que tiene más RMAs; el resto se muestran bajo ese canónico.
    """
    nombres = [n.strip() for n in (body.nombres or []) if n and n.strip()]
    if len(nombres) < 2:
        raise HTTPException(status_code=400, detail="Selecciona al menos dos clientes")
    with get_connection() as conn:
        group_id = unify_clients(conn, nombres)
    if group_id is None:
        raise HTTPException(
            status_code=400,
            detail="No se pudo crear el grupo (menos de 2 identidades distintas)",
        )
    return {"mensaje": "Clientes unificados", "group_id": group_id}


class SacarMiembroBody(BaseModel):
    client_name: str = ""
    client_email: str = ""


@app.delete("/api/clientes/grupos/{group_id}/miembros")
def sacar_miembro_grupo(
    group_id: int,
    body: SacarMiembroBody,
    username: str = Depends(get_current_username),
):
    """Saca un cliente del grupo unificado; vuelve a mostrarse como cliente aparte."""
    name = (body.client_name or "").strip()
    email = (body.client_email or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Falta nombre del cliente")
    with get_connection() as conn:
        ok = remove_member_from_group(conn, group_id, name, email)
    if not ok:
        raise HTTPException(status_code=404, detail="Miembro no encontrado en el grupo")
    return {"mensaje": "Miembro sacado del grupo"}


# --- Productos RMA (lista con garantía vigente) ---


@app.get("/api/productos-rma")
def listar_productos_rma():
    """Lista por número de serie (clave primaria) con info agregada y si la garantía está vigente."""
    with get_connection() as conn:
        return get_productos_rma(conn)


class GarantiaVigenteBody(BaseModel):
    vigente: bool = True


@app.patch("/api/productos-rma/{serial:path}/garantia")
def actualizar_garantia_serial(serial: str, body: GarantiaVigenteBody):
    """Marca si la garantía del producto (por número de serie) está vigente (por defecto True)."""
    s = (serial or "").strip()
    if not s:
        raise HTTPException(status_code=400, detail="Número de serie vacío")
    with get_connection() as conn:
        set_serial_warranty(conn, s, body.vigente)
    return {"mensaje": "Garantía actualizada", "vigente": body.vigente}


# --- Configuración (paths QNAP, Excel) desde la app ---


@app.get("/api/settings")
def obtener_settings(username: str = Depends(get_current_username)):
    """Devuelve las claves de configuración editables (paths, Atractor, RMA especiales). La contraseña de Atractor no se devuelve."""
    with get_connection() as conn:
        aliases_raw = get_setting(conn, "RMA_ESPECIALES_ALIASES")
        try:
            aliases = json.loads(aliases_raw) if aliases_raw else None
        except json.JSONDecodeError:
            aliases = None
        return {
            "PRODUCTOS_CATALOG_PATH": get_setting(conn, "PRODUCTOS_CATALOG_PATH") or "",
            "EXCEL_SYNC_PATH": get_setting(conn, "EXCEL_SYNC_PATH") or "",
            "RMA_ESPECIALES_FOLDER": get_setting(conn, "RMA_ESPECIALES_FOLDER") or "",
            "RMA_ESPECIALES_ALIASES": aliases,
            "ATRACTOR_URL": get_setting(conn, "ATRACTOR_URL") or "",
            "ATRACTOR_USER": get_setting(conn, "ATRACTOR_USER") or "",
            "ATRACTOR_PASSWORD": "",  # Nunca devolver la contraseña
        }


class SettingsBody(BaseModel):
    PRODUCTOS_CATALOG_PATH: str = ""
    EXCEL_SYNC_PATH: str = ""
    RMA_ESPECIALES_FOLDER: str = ""
    RMA_ESPECIALES_ALIASES: dict | None = None  # {"serial": ["Nº de Serie", ...], "fallo": [...], "resolucion": [...]}
    ATRACTOR_URL: str = ""
    ATRACTOR_USER: str = ""
    ATRACTOR_PASSWORD: str = ""  # Si está vacío no se actualiza la guardada


@app.patch("/api/settings")
def actualizar_settings(
    body: SettingsBody,
    username: str = Depends(get_current_username),
):
    """Guarda las rutas de catálogo, Excel, RMA especiales y configuración de Atractor. Solo administradores pueden cambiar las rutas."""
    with get_connection() as conn:
        if user_is_admin(conn, username):
            set_setting(conn, "PRODUCTOS_CATALOG_PATH", _normalize_unc_path(body.PRODUCTOS_CATALOG_PATH or ""))
            set_setting(conn, "EXCEL_SYNC_PATH", _normalize_unc_path(body.EXCEL_SYNC_PATH or ""))
            set_setting(conn, "RMA_ESPECIALES_FOLDER", _normalize_unc_path(body.RMA_ESPECIALES_FOLDER or ""))
        else:
            pass
        if body.RMA_ESPECIALES_ALIASES is not None:
            set_setting(conn, "RMA_ESPECIALES_ALIASES", json.dumps(body.RMA_ESPECIALES_ALIASES, ensure_ascii=False))
        set_setting(conn, "ATRACTOR_URL", (body.ATRACTOR_URL or "").strip())
        set_setting(conn, "ATRACTOR_USER", (body.ATRACTOR_USER or "").strip())
        if (body.ATRACTOR_PASSWORD or "").strip():
            set_setting(conn, "ATRACTOR_PASSWORD", (body.ATRACTOR_PASSWORD or "").strip())
        insert_audit_log(conn, username, "settings_updated", "settings", "", "Rutas y Atractor")
    return {"mensaje": "Configuración guardada"}


@app.get("/api/settings/server-ip")
def obtener_ip_servidor(username: str = Depends(get_current_username)):
    """Devuelve la IP del servidor (red local) para que el script de dominio configure el archivo hosts correctamente."""
    ip = get_server_ip()
    if not ip:
        raise HTTPException(status_code=503, detail="No se pudo obtener la IP del servidor.")
    return {"ip": ip}


@app.get("/api/settings/certificate")
def descargar_certificado(username: str = Depends(get_current_username)):
    """Permite al cliente descargar cert.pem para instalar el certificado HTTPS en su equipo (solo certificado, no la clave privada)."""
    backend_dir = Path(__file__).resolve().parent
    cert_path = backend_dir / "cert.pem"
    if not cert_path.is_file():
        raise HTTPException(status_code=404, detail="No hay certificado configurado. Genera cert.pem en la carpeta backend del servidor para usar HTTPS.")
    return FileResponse(str(cert_path), filename="cert.pem", media_type="application/x-pem-file")


@app.get("/api/settings/status")
def obtener_estado_sistema(username: str = Depends(get_current_username)):
    """Devuelve el estado de la última sincronización RMA y del último refresco de catálogo (para la sección Estado en Configuración)."""
    with get_connection() as conn:
        return {
            "last_sync_at": get_setting(conn, "LAST_SYNC_AT") or "",
            "last_sync_status": get_setting(conn, "LAST_SYNC_STATUS") or "",
            "last_sync_message": get_setting(conn, "LAST_SYNC_MESSAGE") or "",
            "last_catalog_at": get_setting(conn, "LAST_CATALOG_AT") or "",
            "last_catalog_status": get_setting(conn, "LAST_CATALOG_STATUS") or "",
            "last_catalog_message": get_setting(conn, "LAST_CATALOG_MESSAGE") or "",
        }


class ValidatePathsBody(BaseModel):
    excel_path: str = ""
    catalog_path: str = ""


@app.post("/api/settings/validate-paths")
def validar_rutas(
    body: ValidatePathsBody,
    username: str = Depends(get_current_username),
):
    """Comprueba si las rutas de Excel y catálogo existen y son accesibles. Operación: no modifica nada.
    Usa os.path para comprobar (más fiable con rutas UNC en Windows). Devuelve path_used para diagnosticar."""
    def check_excel(p: str) -> dict:
        if not (p or "").strip():
            return {"path": p or "", "path_used": "", "exists": False, "readable": False, "message": "Ruta vacía"}
        p = _normalize_unc_path(p)
        path_str = os.path.normpath(p) if os.name == "nt" and p.startswith("\\\\") else p
        exists_os = os.path.exists(path_str)
        if not exists_os:
            return {
                "path": p,
                "path_used": path_str,
                "exists": False,
                "readable": False,
                "message": "No existe el archivo o la ruta. Comprueba que el servidor (donde corre la app) tiene acceso a la unidad de red.",
            }
        if not os.path.isfile(path_str):
            return {"path": p, "path_used": path_str, "exists": True, "readable": False, "message": "La ruta no es un archivo"}
        try:
            with open(path_str, "rb") as f:
                f.read(1)
            return {"path": p, "path_used": path_str, "exists": True, "readable": True, "message": "OK"}
        except PermissionError as e:
            return {"path": p, "path_used": path_str, "exists": True, "readable": False, "message": f"Sin permiso de lectura (p. ej. archivo abierto en otro programa): {e}"}
        except OSError as e:
            err = getattr(e, "errno", None)
            msg = str(e)[:200]
            if err is not None:
                msg = f"[errno {err}] {msg}"
            return {"path": p, "path_used": path_str, "exists": True, "readable": False, "message": msg}

    def check_catalog(p: str) -> dict:
        if not (p or "").strip():
            return {"path": p or "", "path_used": "", "exists": False, "readable": False, "message": "Ruta vacía"}
        p = _normalize_unc_path(p)
        path_str = os.path.normpath(p) if os.name == "nt" and p.startswith("\\\\") else p
        exists_os = os.path.exists(path_str)
        if not exists_os:
            return {
                "path": p,
                "path_used": path_str,
                "exists": False,
                "readable": False,
                "message": "No existe la carpeta. Comprueba que el servidor (donde corre la app) tiene acceso a la unidad de red (QNAP).",
            }
        if not os.path.isdir(path_str):
            return {"path": p, "path_used": path_str, "exists": True, "readable": False, "message": "La ruta no es una carpeta"}
        try:
            with os.scandir(path_str) as it:
                next(it, None)
            return {"path": p, "path_used": path_str, "exists": True, "readable": True, "message": "OK"}
        except PermissionError as e:
            return {"path": p, "path_used": path_str, "exists": True, "readable": False, "message": f"Sin permiso de lectura: {e}"}
        except OSError as e:
            err = getattr(e, "errno", None)
            msg = str(e)[:200]
            if err is not None:
                msg = f"[errno {err}] {msg}"
            return {"path": p, "path_used": path_str, "exists": True, "readable": False, "message": msg}

    return {
        "excel": check_excel(body.excel_path or ""),
        "catalog": check_catalog(body.catalog_path or ""),
    }


@app.get("/api/audit-log")
def listar_audit_log(
    limit: int = 50,
    offset: int = 0,
    username: str = Depends(get_current_username),
):
    """Lista las últimas entradas del log de auditoría (trazabilidad)."""
    limit = max(1, min(200, limit))
    offset = max(0, offset)
    with get_connection() as conn:
        items = list_audit_log(conn, limit=limit, offset=offset)
    return {"items": items}


# --- RMA especiales (carpeta año/mes, 1 Excel = 1 RMA, columnas variables) ---

# Aliases por defecto para detectar columnas en Excels de RMA especiales (serial, fallo, resolución)
_DEFAULT_RMA_ESPECIALES_ALIASES = {
    "serial": [
        "Nº de Serie", "Nº DE SERIE", "NÂº de Serie", "N° de Serie", "Numero de serie", "Número de serie",
        "Referencia", "REFERENCIA", "Ref. Proveedor", "Ref proveedor", "Ref. interna", "Ref interna",
        "Serie", "SERIE", "Nº serie", "Nº SERIE", "Serial", "SERIAL",
    ],
    "fallo": [
        "Fallo", "FALLO", "Falla", "FALLA", "Avería", "AVERIA", "AVERÍA", "Defecto", "DEFECTO",
        "Problema", "PROBLEMA", "Descripción fallo", "Descripcion fallo",
    ],
    "resolucion": [
        "Resolución", "RESOLUCION", "RESOLUCIÓN", "Resolucion", "Solución", "SOLUCION", "SOLUCIÓN",
        "Reparación", "REPARACION", "REPARACIÓN", "Estado", "ESTADO",
    ],
}


def _get_rma_especiales_aliases(conn) -> dict:
    raw = get_setting(conn, "RMA_ESPECIALES_ALIASES")
    if not raw:
        return _DEFAULT_RMA_ESPECIALES_ALIASES
    try:
        data = json.loads(raw)
        return {
            "serial": list(data.get("serial") or _DEFAULT_RMA_ESPECIALES_ALIASES["serial"]),
            "fallo": list(data.get("fallo") or _DEFAULT_RMA_ESPECIALES_ALIASES["fallo"]),
            "resolucion": list(data.get("resolucion") or _DEFAULT_RMA_ESPECIALES_ALIASES["resolucion"]),
        }
    except (json.JSONDecodeError, TypeError):
        return _DEFAULT_RMA_ESPECIALES_ALIASES


def _add_rma_especiales_alias(conn, key: str, column_name: str) -> None:
    """Añade un nombre de columna a la lista de aliases (serial, fallo o resolucion) si no está ya.
    Guarda la estructura completa de aliases para no perder las demás claves."""
    if not (key and column_name and key in ("serial", "fallo", "resolucion")):
        return
    name = str(column_name).strip()
    if not name:
        return
    aliases = _get_rma_especiales_aliases(conn)
    lst = list(aliases.get(key) or [])
    if name not in lst:
        lst.append(name)
        # Persistir la estructura completa (serial, fallo, resolucion) para no perder otras claves
        full = {k: list(aliases.get(k) or []) for k in ("serial", "fallo", "resolucion")}
        full[key] = lst
        set_setting(conn, "RMA_ESPECIALES_ALIASES", json.dumps(full, ensure_ascii=False))


def _match_especial_column(header_str: str, aliases: list[str]) -> bool:
    h = (header_str or "").strip()
    for a in aliases:
        if (a or "").strip() == h:
            return True
    return False


def _especial_columns_from_df(df: pd.DataFrame, aliases: dict) -> dict:
    """Devuelve { serial: nombre_columna o None, fallo: ..., resolucion: ... } según los headers del DataFrame."""
    result = {"serial": None, "fallo": None, "resolucion": None}
    for col in df.columns:
        col_str = str(col).strip()
        for key in ("serial", "fallo", "resolucion"):
            if result[key] is not None:
                continue
            if _match_especial_column(col_str, aliases[key]):
                result[key] = col
                break
    return result


def _extract_rma_from_filename(path: str | Path) -> str:
    """Extrae el número RMA del nombre del archivo (sin extensión). Ej: RMA2601221058.xlsx -> RMA2601221058."""
    name = Path(path).stem if hasattr(path, "stem") else os.path.splitext(os.path.basename(str(path)))[0]
    return (name or "").strip()


def _scan_rma_especiales_folder(base_path: str) -> list[dict]:
    """
    Recorre base_path / año / mes / *.xlsx y devuelve lista de { path, rma_number, headers, mapped, missing }.
    Sin callback; para progreso en tiempo real usar _run_rma_especiales_scan_task.
    """
    return _scan_rma_especiales_folder_impl(base_path, None)


def _scan_rma_especiales_folder_impl(
    base_path: str,
    update_progress: None | tuple[str, callable],
) -> list[dict]:
    """Implementación del escaneo; si update_progress es (task_id, _update_task) actualiza progreso en tiempo real."""
    task_id, update_fn = update_progress if update_progress else (None, None)
    with get_connection() as conn:
        aliases = _get_rma_especiales_aliases(conn)
    base = Path(base_path) if base_path else None
    if not base or not base.is_dir():
        return []
    # Recoger todos los archivos para poder mostrar progreso
    files_to_scan: list[tuple[Path, str, str]] = []  # (path, year_name, month_name)
    for year_dir in sorted(base.iterdir()):
        if not year_dir.is_dir():
            continue
        try:
            int(year_dir.name)
        except ValueError:
            continue
        for month_dir in sorted(year_dir.iterdir()):
            if not month_dir.is_dir():
                continue
            for f in month_dir.iterdir():
                if f.suffix.lower() not in (".xlsx", ".xls"):
                    continue
                rma_number = _extract_rma_from_filename(f)
                if rma_number:
                    files_to_scan.append((f, year_dir.name, month_dir.name))
    total = len(files_to_scan)
    if update_fn and task_id and total > 0:
        update_fn(task_id, percent=0, message=f"Encontrados {total} archivos. Leyendo Excel...")
    out = []
    for idx, (f, year_name, month_name) in enumerate(files_to_scan):
        if update_fn and task_id:
            pct = int(90 * (idx + 1) / total) if total else 0
            update_fn(task_id, percent=pct, message=f"Escaneando {year_name} / {month_name} — Leyendo {f.name}...")
        rma_number = _extract_rma_from_filename(f)
        try:
            df = pd.read_excel(str(f), sheet_name=0, header=0)
            df = df.replace({np.nan: None})
            headers = [str(c).strip() for c in df.columns]
            mapped = _especial_columns_from_df(df, aliases)
            missing = [k for k in ("serial", "fallo", "resolucion") if mapped[k] is None]
            out.append({
                "path": str(f),
                "rma_number": rma_number,
                "headers": headers,
                "mapped": {k: (mapped[k] if mapped[k] is not None else None) for k in ("serial", "fallo", "resolucion")},
                "missing": missing,
            })
        except Exception as e:
            out.append({
                "path": str(f),
                "rma_number": rma_number,
                "headers": [],
                "mapped": {"serial": None, "fallo": None, "resolucion": None},
                "missing": ["serial", "fallo", "resolucion"],
                "error": str(e),
            })
    return out


def _run_rma_especiales_scan_task(task_id: str, base_path: str) -> None:
    """Ejecuta el escaneo de la carpeta RMA especiales y actualiza progreso (carpeta y archivo en tiempo real)."""
    try:
        _update_task(task_id, percent=0, message="Listando carpetas año / mes...")
        update_progress = (task_id, lambda tid, **kw: _update_task(tid, **kw))
        items = _scan_rma_especiales_folder_impl(base_path, update_progress)
        _update_task(
            task_id,
            status="done",
            percent=100,
            message="Completado",
            result={"items": items, "total": len(items)},
        )
    except FileNotFoundError as e:
        _update_task(task_id, status="error", percent=0, message=f"Carpeta no encontrada: {e}", result=None)
    except PermissionError as e:
        _update_task(task_id, status="error", percent=0, message=f"Sin permiso de acceso: {e}", result=None)
    except Exception as e:
        _update_task(task_id, status="error", percent=0, message=str(e), result=None)


def _import_rma_especial_excel(
    path: str,
    rma_number: str,
    col_serial: str | None,
    col_fallo: str | None,
    col_resolucion: str | None,
    conn,
) -> int:
    """Lee el Excel en path y crea/actualiza el RMA especial. col_* son los nombres de columna en el Excel. Devuelve id."""
    df = pd.read_excel(path, sheet_name=0, header=0)
    df = df.replace({np.nan: None})
    lineas = []
    for _, row in df.iterrows():
        def v(c):
            if c is None:
                return None
            x = row.get(c)
            if x is None or (isinstance(x, float) and np.isnan(x)):
                return None
            return str(x).strip() or None
        ref_proveedor = None
        for col in df.columns:
            if str(col).strip() and col not in (col_serial, col_fallo, col_resolucion):
                ref_proveedor = v(col)
                if ref_proveedor:
                    break
        lineas.append({
            "ref_proveedor": ref_proveedor,
            "serial": v(col_serial),
            "fallo": v(col_fallo),
            "resolucion": v(col_resolucion),
        })
    existing = get_rma_especial_by_rma_number(conn, rma_number)
    if existing:
        delete_rma_especial(conn, existing["id"])
    return insert_rma_especial(conn, rma_number=rma_number, source_path=path, lineas=lineas)


@app.get("/api/rma-especiales")
def listar_rma_especiales(username: str = Depends(get_current_username)):
    """Lista todos los RMA especiales."""
    with get_connection() as conn:
        return get_all_rma_especiales(conn)


@app.get("/api/rma-especiales/{rma_especial_id:int}")
def obtener_rma_especial(rma_especial_id: int, username: str = Depends(get_current_username)):
    """Devuelve un RMA especial con sus líneas."""
    with get_connection() as conn:
        item = get_rma_especial_by_id(conn, rma_especial_id)
    if not item:
        raise HTTPException(status_code=404, detail="RMA especial no encontrado")
    return item


class RmaEspecialEstadoBody(BaseModel):
    estado: str = ""


@app.patch("/api/rma-especiales/{rma_especial_id:int}/estado")
def actualizar_rma_especial_estado(
    rma_especial_id: int,
    body: RmaEspecialEstadoBody,
    username: str = Depends(get_current_username),
):
    """Actualiza el estado de un RMA especial (legacy; el estado real es por línea)."""
    estado = (body.estado or "").strip()
    with get_connection() as conn:
        ok = update_rma_especial_estado(conn, rma_especial_id, estado)
    if not ok:
        raise HTTPException(status_code=404, detail="RMA especial no encontrado")
    return {"mensaje": "Estado actualizado"}


class RmaEspecialLineaEstadoBody(BaseModel):
    estado: str = ""


@app.patch("/api/rma-especiales/lineas/{linea_id:int}/estado")
def actualizar_rma_especial_linea_estado(
    linea_id: int,
    body: RmaEspecialLineaEstadoBody,
    username: str = Depends(get_current_username),
):
    """Actualiza el estado de una línea (producto) de un RMA especial."""
    estado = (body.estado or "").strip()
    with get_connection() as conn:
        ok = update_rma_especial_linea_estado(conn, linea_id, estado)
    if not ok:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    return {"mensaje": "Estado actualizado"}


@app.post("/api/rma-especiales/scan")
def escanear_rma_especiales(username: str = Depends(get_current_username)):
    """
    Inicia el escaneo de la carpeta RMA especiales en segundo plano.
    Devuelve task_id para consultar progreso en GET /api/tasks/{task_id}.
    El resultado final incluye items y total.
    """
    with get_connection() as conn:
        folder = (get_setting(conn, "RMA_ESPECIALES_FOLDER") or "").strip()
        folder = _normalize_unc_path(folder)
    if not folder:
        raise HTTPException(status_code=400, detail="No hay carpeta de RMA especiales configurada. Configúrala en Ajustes (solo administrador).")
    path_str = os.path.normpath(folder) if (os.name == "nt" and folder.startswith("\\\\")) else folder
    if not os.path.isdir(path_str):
        raise HTTPException(status_code=400, detail=f"No se encuentra la carpeta: {path_str}")
    task_id = str(uuid.uuid4())
    with _tasks_lock:
        _tasks[task_id] = {"status": "running", "percent": 0, "message": "Iniciando escaneo...", "result": None}
    threading.Thread(target=_run_rma_especiales_scan_task, args=(task_id, path_str), daemon=True).start()
    return {"task_id": task_id}


class RmaEspecialImportBody(BaseModel):
    path: str
    rma_number: str
    column_serial: str | None = None
    column_fallo: str | None = None
    column_resolucion: str | None = None


@app.post("/api/rma-especiales/import")
def importar_rma_especial(
    body: RmaEspecialImportBody,
    username: str = Depends(get_current_username),
):
    """Importa un RMA especial desde un Excel. Si faltan columnas se indican; el cliente puede enviar el mapeo con column_serial, column_fallo, column_resolucion (nombres exactos de cabecera)."""
    path_str = (body.path or "").strip()
    if not path_str or not os.path.isfile(path_str):
        raise HTTPException(status_code=400, detail="Ruta de archivo no válida o archivo no encontrado.")
    rma_number = (body.rma_number or "").strip() or _extract_rma_from_filename(path_str)
    if not rma_number:
        raise HTTPException(status_code=400, detail="No se pudo obtener el número RMA del nombre del archivo.")
    with get_connection() as conn:
        if not body.column_serial and not body.column_fallo and not body.column_resolucion:
            df = pd.read_excel(path_str, sheet_name=0, header=0)
            aliases = _get_rma_especiales_aliases(conn)
            mapped = _especial_columns_from_df(df, aliases)
            missing = [k for k in ("serial", "fallo", "resolucion") if mapped[k] is None]
            if missing:
                headers = [str(c).strip() for c in df.columns]
                raise HTTPException(
                    status_code=400,
                    detail=json.dumps({
                        "code": "columns_missing",
                        "message": "Faltan columnas que no se reconocen. Asigna manualmente las columnas.",
                        "headers": headers,
                        "missing": missing,
                    }, ensure_ascii=False),
                )
            col_serial, col_fallo, col_resolucion = mapped["serial"], mapped["fallo"], mapped["resolucion"]
        else:
            col_serial = (body.column_serial or "").strip() or None
            col_fallo = (body.column_fallo or "").strip() or None
            col_resolucion = (body.column_resolucion or "").strip() or None
        nid = _import_rma_especial_excel(
            path_str, rma_number, col_serial, col_fallo, col_resolucion, conn
        )
        if body.column_serial or body.column_fallo or body.column_resolucion:
            if col_serial:
                _add_rma_especiales_alias(conn, "serial", col_serial)
            if col_fallo:
                _add_rma_especiales_alias(conn, "fallo", col_fallo)
            if col_resolucion:
                _add_rma_especiales_alias(conn, "resolucion", col_resolucion)
    return {"id": nid, "rma_number": rma_number, "mensaje": "RMA especial importado"}


class RmaEspecialRecheckBody(BaseModel):
    paths: list[str] = []


@app.post("/api/rma-especiales/recheck")
def recheck_rma_especiales_columnas(
    body: RmaEspecialRecheckBody,
    username: str = Depends(get_current_username),
):
    """
    Vuelve a intentar reconocer las columnas de los Excel indicados con los aliases actuales
    (p. ej. tras haber asignado columnas en otro archivo, que se añadieron a la lista).
    Devuelve para cada path: path, rma_number, headers, mapped, missing.
    """
    paths = [p.strip() for p in (body.paths or []) if p and p.strip()]
    if not paths:
        return {"items": []}
    with get_connection() as conn:
        aliases = _get_rma_especiales_aliases(conn)
    out = []
    for path_str in paths:
        if not path_str or not os.path.isfile(path_str):
            continue
        rma_number = _extract_rma_from_filename(path_str)
        try:
            df = pd.read_excel(path_str, sheet_name=0, header=0)
            df = df.replace({np.nan: None})
            headers = [str(c).strip() for c in df.columns]
            mapped = _especial_columns_from_df(df, aliases)
            missing = [k for k in ("serial", "fallo", "resolucion") if mapped[k] is None]
            out.append({
                "path": path_str,
                "rma_number": rma_number,
                "headers": headers,
                "mapped": {k: (mapped[k] if mapped[k] is not None else None) for k in ("serial", "fallo", "resolucion")},
                "missing": missing,
            })
        except Exception as e:
            out.append({
                "path": path_str,
                "rma_number": rma_number,
                "headers": [],
                "mapped": {"serial": None, "fallo": None, "resolucion": None},
                "missing": ["serial", "fallo", "resolucion"],
                "error": str(e),
            })
    return {"items": out}


@app.delete("/api/rma-especiales/{rma_especial_id:int}")
def eliminar_rma_especial(rma_especial_id: int, username: str = Depends(get_current_username)):
    """Elimina un RMA especial y sus líneas."""
    with get_connection() as conn:
        ok = delete_rma_especial(conn, rma_especial_id)
    if not ok:
        raise HTTPException(status_code=404, detail="RMA especial no encontrado")
    return {"mensaje": "RMA especial eliminado"}


# --- Exportación (datos y trazabilidad) ---


@app.get("/api/export/rma")
def exportar_rma_csv(username: str = Depends(get_current_username)):
    """Exporta todos los registros RMA a CSV."""
    with get_connection() as conn:
        rows = get_all_rma_items(conn)
    if not rows:
        raise HTTPException(status_code=404, detail="No hay registros RMA para exportar")

    def to_dict(r) -> dict:
        return dict(r) if hasattr(r, "keys") else r

    keys = ["rma_number", "product", "serial", "client_name", "client_email", "client_phone", "date_received", "averia", "observaciones", "estado", "excel_row", "created_at"]
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=keys, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    for r in rows:
        writer.writerow({k: (to_dict(r).get(k) or "") for k in keys})
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=export-rma.csv"},
    )


@app.get("/api/export/clientes")
def exportar_clientes_csv(username: str = Depends(get_current_username)):
    """Exporta lista de clientes (nombre, email, teléfono, nº RMAs) desde RMA a CSV."""
    with get_connection() as conn:
        rows = get_all_rma_items(conn)
    # Agrupar por (client_name, client_email, client_phone) y contar
    counts = defaultdict(int)
    for r in rows:
        row = dict(r) if hasattr(r, "keys") else r
        key = (row.get("client_name") or "", row.get("client_email") or "", row.get("client_phone") or "")
        counts[key] += 1
    if not counts:
        raise HTTPException(status_code=404, detail="No hay clientes para exportar")

    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["nombre", "email", "telefono", "num_rmas"])
    for (name, email, phone), count in sorted(counts.items(), key=lambda x: (-x[1], x[0][0])):
        writer.writerow([name, email, phone, count])
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=export-clientes.csv"},
    )


# --- Atractor: informe de ventas totalizadas ---


class AtractorInformeVentasBody(BaseModel):
    desde: str = ""  # YYYY-MM-DD
    hasta: str = ""  # YYYY-MM-DD


@app.post("/api/atractor/informe-ventas")
def atractor_informe_ventas(
    body: AtractorInformeVentasBody,
    username: str = Depends(get_current_username),
):
    """
    Pide a Atractor un informe de ventas totalizadas para el rango de fechas dado.
    Usa la URL, usuario y contraseña configurados en Configuración.
    La URL configurada puede ser la base (ej. https://atractor.example.com) o el endpoint completo;
    se añaden query params desde y hasta si la URL no los lleva.
    """
    with get_connection() as conn:
        base_url = (get_setting(conn, "ATRACTOR_URL") or "").strip()
        user = (get_setting(conn, "ATRACTOR_USER") or "").strip()
        password = get_setting(conn, "ATRACTOR_PASSWORD") or ""

    if not base_url:
        raise HTTPException(
            status_code=400,
            detail="Configura la ubicación de Atractor en Configuración (URL).",
        )

    desde = (body.desde or "").strip()[:10]
    hasta = (body.hasta or "").strip()[:10]
    if not desde or not hasta:
        raise HTTPException(
            status_code=400,
            detail="Indica rango de fechas (desde y hasta, formato YYYY-MM-DD).",
        )

    sep = "&" if "?" in base_url else "?"
    url = f"{base_url.rstrip('/')}{sep}{urlencode({'desde': desde, 'hasta': hasta})}"

    req = urllib.request.Request(url, method="GET")
    req.add_header("Accept", "application/json")
    if user or password:
        cred = base64.b64encode(f"{user}:{password}".encode()).decode()
        req.add_header("Authorization", f"Basic {cred}")

    try:
        ctx = ssl.create_default_context()
        if os.environ.get("ATRACTOR_SSL_VERIFY", "1").lower() in ("0", "false"):
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            raw = resp.read().decode()
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode()
        except Exception:
            detail = str(e)
        raise HTTPException(status_code=502, detail=f"Atractor respondió con error: {e.code}. {detail[:500]}")
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=f"No se pudo conectar con Atractor: {e.reason}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)[:500])

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {"raw": raw}

    return {"ok": True, "datos": data}


# --- Catálogo de productos (carpeta QNAP: caché en BD; solo lo nuevo con refresh) ---


@app.get("/api/productos-catalogo")
def listar_productos_catalogo():
    """Lista productos desde la caché en BD (no rescanear). Si no hay caché, productos vacío y cached=false."""
    with get_connection() as conn:
        scanned_at, productos = get_catalog_cache(conn)
    if scanned_at is None:
        return {"productos": [], "error": None, "cached": False, "scanned_at": None}
    return {"productos": productos, "error": None, "cached": True, "scanned_at": scanned_at}


def _run_catalog_refresh_task(task_id: str, catalog_path: str) -> None:
    """Escanea QNAP, guarda en caché y actualiza progreso (directorio + % en tiempo real)."""
    try:
        _update_task(task_id, percent=0, message="Contando directorios...")

        def on_dir(path_rel: str, current: int, total: int) -> None:
            if total > 0:
                pct = min(89, int(90 * current / total))
                _update_task(task_id, percent=pct, message=path_rel or ".")
            else:
                _update_task(task_id, message=path_rel or ".")

        productos = get_productos_catalogo(catalog_path, on_directory=on_dir)
        _update_task(task_id, percent=90, message="Guardando en caché...")
        with get_connection() as conn:
            set_catalog_cache(conn, productos)
        _update_task(
            task_id,
            status="done",
            percent=100,
            message="Completado",
            result={"productos": productos, "mensaje": f"Catálogo actualizado: {len(productos)} productos."},
        )
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        with get_connection() as c:
            set_setting(c, "LAST_CATALOG_AT", now)
            set_setting(c, "LAST_CATALOG_STATUS", "ok")
            set_setting(c, "LAST_CATALOG_MESSAGE", f"Catálogo actualizado: {len(productos)} productos.")
    except FileNotFoundError as e:
        msg = f"Carpeta de catálogo no encontrada: {e}"
        _update_task(task_id, status="error", percent=0, message=msg, result=None)
        _save_last_catalog_error(msg)
    except PermissionError as e:
        msg = f"Sin permiso para acceder al catálogo: {e}"
        _update_task(task_id, status="error", percent=0, message=msg, result=None)
        _save_last_catalog_error(msg)
    except Exception as e:
        _update_task(task_id, status="error", percent=0, message=str(e), result=None)
        _save_last_catalog_error(str(e))


@app.post("/api/productos-catalogo/refresh")
def refrescar_catalogo(username: str = Depends(get_current_username)):
    """
    Escanea la carpeta QNAP y actualiza la caché del catálogo.
    Devuelve task_id para consultar progreso en GET /api/tasks/{task_id}.
    """
    with get_connection() as conn:
        catalog_path = _get_productos_catalog_path(conn)
        insert_audit_log(conn, username, "catalog_refresh_started", "catalog", "", catalog_path or "")
    if not catalog_path or not catalog_path.strip():
        raise HTTPException(status_code=400, detail="Configura la ruta del catálogo en Configuración.")
    path_str = os.path.normpath(catalog_path) if (os.name == "nt" and catalog_path.startswith("\\\\")) else catalog_path
    if not os.path.exists(path_str):
        raise HTTPException(status_code=400, detail=f"No se encuentra la carpeta del catálogo. Comprueba que el servidor tiene acceso a la unidad de red. Ruta: {path_str}")
    if not os.path.isdir(path_str):
        raise HTTPException(status_code=400, detail=f"La ruta del catálogo no es una carpeta: {path_str}")
    task_id = str(uuid.uuid4())
    with _tasks_lock:
        _tasks[task_id] = {"status": "running", "percent": 0, "message": "Iniciando...", "result": None}
    threading.Thread(target=_run_catalog_refresh_task, args=(task_id, path_str), daemon=True).start()
    return {"task_id": task_id}


@app.get("/api/productos-catalogo/archivo")
def servir_archivo_catalogo(path: str = ""):
    """Sirve un archivo del catálogo por ruta relativa (para abrir visual PDF/Excel)."""
    with get_connection() as conn:
        catalog_path = _get_productos_catalog_path(conn)
    if not catalog_path or not path or ".." in path or path.startswith("/"):
        raise HTTPException(status_code=400, detail="Ruta no válida")
    base = Path(catalog_path)
    if not base.exists() or not base.is_dir():
        raise HTTPException(status_code=404, detail="Catálogo no disponible. Configura la ruta en Configuración.")
    # path ya está validado (sin ".."); unir con base. En Windows con UNC, resolve() puede fallar.
    path_normalized = path.replace("/", os.sep).lstrip(os.sep)
    full = base / path_normalized
    try:
        full_res = full.resolve()
        base_res = base.resolve()
        full_res.relative_to(base_res)
    except (ValueError, OSError):
        # OSError típico en rutas UNC en Windows; ValueError si full no está bajo base.
        # Si no podemos resolver, confiamos en que path no tiene ".." y que full está bajo base.
        if ".." in path_normalized or path_normalized.startswith(".."):
            raise HTTPException(status_code=403, detail="Acceso denegado")
    if not full.is_file():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return FileResponse(str(full), filename=full.name)


# --- Repuestos (vinculados a productos, con inventario) ---


@app.get("/api/repuestos")
def listar_repuestos():
    """Lista todos los repuestos con sus productos vinculados y cantidad."""
    with get_connection() as conn:
        return get_all_repuestos(conn)


@app.get("/api/repuestos/{repuesto_id:int}")
def obtener_repuesto(repuesto_id: int):
    """Devuelve un repuesto por id."""
    with get_connection() as conn:
        r = get_repuesto_by_id(conn, repuesto_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Repuesto no encontrado")
    return r


class RepuestoBody(BaseModel):
    nombre: str = ""
    descripcion: str = ""
    cantidad: int = 0
    productos: list[str] = []


class RepuestoPatchBody(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    cantidad: int | None = None
    productos: list[str] | None = None


@app.post("/api/repuestos")
def crear_repuesto(body: RepuestoBody, username: str = Depends(get_current_username)):
    """Crea un repuesto con nombre, descripción, cantidad y productos vinculados."""
    nombre = (body.nombre or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")
    with get_connection() as conn:
        rid = create_repuesto(
            conn,
            nombre=nombre,
            descripcion=(body.descripcion or "").strip(),
            cantidad=max(0, body.cantidad),
            productos=body.productos or [],
        )
    return {"id": rid, "mensaje": "Repuesto creado"}


@app.patch("/api/repuestos/{repuesto_id:int}")
def actualizar_repuesto(repuesto_id: int, body: RepuestoPatchBody, username: str = Depends(get_current_username)):
    """Actualiza un repuesto (solo los campos enviados)."""
    with get_connection() as conn:
        ok = update_repuesto(
            conn,
            repuesto_id,
            nombre=body.nombre.strip() if body.nombre is not None else None,
            descripcion=body.descripcion.strip() if body.descripcion is not None else None,
            cantidad=max(0, body.cantidad) if body.cantidad is not None else None,
            productos=body.productos if body.productos is not None else None,
        )
    if not ok:
        raise HTTPException(status_code=404, detail="Repuesto no encontrado")
    return {"mensaje": "Repuesto actualizado"}


class CantidadBody(BaseModel):
    cantidad: int = 0


@app.patch("/api/repuestos/{repuesto_id:int}/cantidad")
def actualizar_cantidad_repuesto(repuesto_id: int, body: CantidadBody, username: str = Depends(get_current_username)):
    """Actualiza solo la cantidad en inventario de un repuesto."""
    with get_connection() as conn:
        ok = update_repuesto(conn, repuesto_id, cantidad=max(0, body.cantidad))
    if not ok:
        raise HTTPException(status_code=404, detail="Repuesto no encontrado")
    return {"mensaje": "Cantidad actualizada", "cantidad": max(0, body.cantidad)}


@app.delete("/api/repuestos/{repuesto_id:int}")
def eliminar_repuesto(repuesto_id: int, username: str = Depends(get_current_username)):
    """Elimina un repuesto."""
    with get_connection() as conn:
        ok = delete_repuesto(conn, repuesto_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Repuesto no encontrado")
    return {"mensaje": "Repuesto eliminado"}


# --- Usuarios (para dropdown notificaciones y creación desde Configuración) y Notificaciones ---

DEFAULT_NEW_USER_PASSWORD = "approx2026"


class CreateUserBody(BaseModel):
    username: str


@app.post("/api/users")
def crear_usuario(body: CreateUserBody, username: str = Depends(get_current_username)):
    """Crea un usuario nuevo (solo nombre). Contraseña por defecto: approx2026. Solo administradores."""
    username_clean = (body.username or "").strip()
    if not username_clean:
        raise HTTPException(status_code=400, detail="El nombre de usuario no puede estar vacío")
    with get_connection() as conn:
        if not user_is_admin(conn, username):
            raise HTTPException(
                status_code=403,
                detail="Solo un usuario administrador puede crear cuentas desde Configuración.",
            )
        if get_user_by_username(conn, username_clean):
            raise HTTPException(status_code=400, detail="Ya existe un usuario con ese nombre")
        email_placeholder = f"{username_clean}@approx.es"
        create_user(
            conn,
            username_clean,
            get_password_hash(DEFAULT_NEW_USER_PASSWORD),
            email_placeholder,
        )
        insert_audit_log(conn, username, "user_created", "user", username_clean, "Contraseña por defecto")
    return {"mensaje": f"Usuario '{username_clean}' creado. Contraseña por defecto: {DEFAULT_NEW_USER_PASSWORD}"}


@app.get("/api/users")
def listar_usuarios(username: str = Depends(get_current_username)):
    """Lista usuarios (id, username) para elegir destinatario de notificaciones. Excluye al actual."""
    with get_connection() as conn:
        current = get_user_by_username(conn, username)
        users = list_users(conn)
    if not current:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    current_id = current["id"]
    return [u for u in users if u["id"] != current_id]


@app.get("/api/users/admin")
def listar_usuarios_admin(username: str = Depends(get_current_username)):
    """Lista todos los usuarios con datos completos. Solo administradores."""
    with get_connection() as conn:
        if not user_is_admin(conn, username):
            raise HTTPException(status_code=403, detail="Solo administradores pueden acceder al panel de usuarios.")
        return list_users_admin(conn)


class UpdateUserBody(BaseModel):
    email: str | None = None
    is_admin: bool | None = None


@app.patch("/api/users/{user_id:int}")
def actualizar_usuario(
    user_id: int,
    body: UpdateUserBody,
    username: str = Depends(get_current_username),
):
    """Actualiza email y/o is_admin de un usuario. Solo administradores."""
    with get_connection() as conn:
        if not user_is_admin(conn, username):
            raise HTTPException(status_code=403, detail="Solo administradores pueden modificar usuarios.")
        target = get_user_by_id_full(conn, user_id)
        if not target:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        email = body.email.strip() if body.email is not None and body.email.strip() else None
        if email is not None:
            update_user(conn, user_id, email=email)
        if body.is_admin is not None:
            admins = count_admins(conn)
            if admins <= 1 and target["is_admin"] and not body.is_admin:
                raise HTTPException(
                    status_code=400,
                    detail="No se puede quitar el rol de administrador al último admin.",
                )
            update_user(conn, user_id, is_admin=body.is_admin)
        insert_audit_log(conn, username, "user_updated", "user", target["username"], str(body.model_dump()))
    return {"mensaje": "Usuario actualizado"}


@app.post("/api/users/{user_id:int}/reset-password")
def restablecer_password_usuario(
    user_id: int,
    username: str = Depends(get_current_username),
):
    """Establece la contraseña del usuario a la por defecto (approx2026). Solo administradores."""
    with get_connection() as conn:
        if not user_is_admin(conn, username):
            raise HTTPException(status_code=403, detail="Solo administradores pueden restablecer contraseñas.")
        target = get_user_by_id(conn, user_id)
        if not target:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        new_hash = get_password_hash(DEFAULT_NEW_USER_PASSWORD)
        update_password_by_id(conn, user_id, new_hash)
        insert_audit_log(conn, username, "user_password_reset", "user", target["username"], "")
    return {"mensaje": f"Contraseña de '{target['username']}' restablecida a {DEFAULT_NEW_USER_PASSWORD}"}


@app.delete("/api/users/{user_id:int}")
def eliminar_usuario(user_id: int, username: str = Depends(get_current_username)):
    """Elimina un usuario. Solo administradores. No se puede eliminar a uno mismo ni al último admin."""
    with get_connection() as conn:
        if not user_is_admin(conn, username):
            raise HTTPException(status_code=403, detail="Solo administradores pueden eliminar usuarios.")
        current = get_user_by_username(conn, username)
        target = get_user_by_id_full(conn, user_id)
        if not target:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        if current and current["id"] == user_id:
            raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta.")
        if target["is_admin"] and count_admins(conn) <= 1:
            raise HTTPException(status_code=400, detail="No se puede eliminar al único administrador.")
        delete_user(conn, user_id)
        insert_audit_log(conn, username, "user_deleted", "user", target["username"], "")
    return {"mensaje": "Usuario eliminado"}


@app.get("/api/notifications")
def listar_notificaciones(
    category: str | None = None,
    username: str = Depends(get_current_username),
):
    """Lista notificaciones recibidas por el usuario actual. category opcional: abono, envio, sin_categoria."""
    with get_connection() as conn:
        user = get_user_by_username(conn, username)
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        items = get_notifications_for_user(conn, user["id"], category=category if category else None)
    return items


@app.get("/api/notifications/sent")
def listar_notificaciones_enviadas(
    category: str | None = None,
    username: str = Depends(get_current_username),
):
    """Lista notificaciones enviadas por el usuario actual. category opcional: abono, envio, sin_categoria."""
    with get_connection() as conn:
        user = get_user_by_username(conn, username)
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        items = get_notifications_sent_by_user(conn, user["id"], category=category if category else None)
    return items


@app.get("/api/notifications/unread-count")
def contar_notificaciones_no_leidas(username: str = Depends(get_current_username)):
    """Cuenta notificaciones no leídas del usuario actual."""
    with get_connection() as conn:
        user = get_user_by_username(conn, username)
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        count = count_unread_notifications(conn, user["id"])
    return {"count": count}


# --- Web Push (notificaciones aunque el navegador esté cerrado) ---

_VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "").strip()


@app.get("/api/push/vapid-public")
def obtener_vapid_public(username: str = Depends(get_current_username)):
    """Devuelve la clave pública VAPID para que el frontend registre la suscripción push."""
    if not _VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=503, detail="Web Push no configurado (falta VAPID_PUBLIC_KEY)")
    return {"publicKey": _VAPID_PUBLIC_KEY}


class PushSubscribeBody(BaseModel):
    endpoint: str
    keys: dict  # {"p256dh": "...", "auth": "..."}


@app.post("/api/push/subscribe")
def suscribir_push(body: PushSubscribeBody, username: str = Depends(get_current_username)):
    """Guarda la suscripción push del navegador para enviar notificaciones Web Push."""
    p256dh = (body.keys or {}).get("p256dh") or (body.keys or {}).get("p256dh")
    auth = (body.keys or {}).get("auth")
    if not body.endpoint or not p256dh or not auth:
        raise HTTPException(status_code=400, detail="Faltan endpoint o keys (p256dh, auth)")
    with get_connection() as conn:
        user = get_user_by_username(conn, username)
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        save_push_subscription(conn, user["id"], body.endpoint, p256dh, auth)
    return {"mensaje": "Suscripción guardada"}


class NotificationBody(BaseModel):
    to_user_id: int
    type: str  # 'rma' | 'catalogo' | 'producto_rma' | 'cliente'
    category: str = "sin_categoria"  # 'abono' | 'envio' | 'sin_categoria'
    reference_data: dict
    message: str = ""


def _send_web_push_to_user(to_user_id: int, from_username: str, type_label: str, ref_summary: str, message: str | None) -> None:
    """Envía Web Push a todas las suscripciones del usuario. No bloquea; ignora errores."""
    vapid_private = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    if not vapid_private:
        return
    try:
        from pywebpush import webpush
    except ImportError:
        return
    payload = json.dumps({
        "title": "SAT · Nuevo mensaje",
        "body": f"{from_username}: {type_label}" + (f" — {ref_summary}" if ref_summary else ""),
        "message": message or "",
        "tag": "garantia-notification",
    }, ensure_ascii=False)
    with get_connection() as conn:
        subs = get_push_subscriptions_for_user(conn, to_user_id)
    for sub in subs:
        try:
            webpush(
                sub,
                payload,
                vapid_private_key=vapid_private,
                vapid_claims={"sub": "mailto:notificaciones@approx.es"},
            )
        except Exception:
            pass


@app.post("/api/notifications")
def crear_notificacion(body: NotificationBody, username: str = Depends(get_current_username)):
    """Crea una notificación para otro usuario (compartir fila de RMA, catálogo, etc.). Envía Web Push si está configurado."""
    with get_connection() as conn:
        from_user = get_user_by_username(conn, username)
        if not from_user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        to_user = get_user_by_id(conn, body.to_user_id)
        if not to_user:
            raise HTTPException(status_code=404, detail="Usuario destinatario no encontrado")
        if from_user["id"] == body.to_user_id:
            raise HTTPException(status_code=400, detail="No puedes notificarte a ti mismo")
        ref_json = json.dumps(body.reference_data, ensure_ascii=False)
        cat = (body.category or "sin_categoria").strip() or "sin_categoria"
        if cat not in ("abono", "envio", "sin_categoria"):
            cat = "sin_categoria"
        nid = create_notification(
            conn,
            from_user_id=from_user["id"],
            to_user_id=body.to_user_id,
            type_=body.type.strip(),
            reference_data=ref_json,
            message=body.message.strip() or None,
            category=cat,
        )
    type_labels = {"rma": "Lista RMA", "catalogo": "Catálogo", "producto_rma": "Productos RMA", "cliente": "Clientes"}
    ref_summary = (body.reference_data.get("rma_number") or body.reference_data.get("serial") or
                   body.reference_data.get("product_ref") or body.reference_data.get("nombre") or "")
    if isinstance(ref_summary, str) and len(ref_summary) > 40:
        ref_summary = ref_summary[:37] + "..."
    threading.Thread(
        target=_send_web_push_to_user,
        args=(body.to_user_id, from_user["username"], type_labels.get(body.type.strip(), body.type), str(ref_summary), body.message.strip() or None),
        daemon=True,
    ).start()
    return {"id": nid, "mensaje": "Notificación enviada"}


@app.patch("/api/notifications/{notification_id:int}/read")
def marcar_notificacion_leida(notification_id: int, username: str = Depends(get_current_username)):
    """Marca una notificación como leída."""
    with get_connection() as conn:
        user = get_user_by_username(conn, username)
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        ok = mark_notification_read(conn, notification_id, user["id"])
    if not ok:
        raise HTTPException(status_code=404, detail="Notificación no encontrada o ya leída")
    return {"mensaje": "Marcada como leída"}


# Servir frontend compilado (para despliegue en un solo servidor)
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
