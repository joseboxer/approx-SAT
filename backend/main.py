"""
API Garantías: usuarios (auth), RMA/productos/clientes en base de datos.
Carga de Excel: contrasta con la BD y solo añade registros nuevos.
El Excel de sincronización puede ser una ruta fija (p. ej. QNAP) o subida manual.
Tareas largas (sync, sync-reset, catalog refresh) devuelven task_id y reportan progreso vía GET /api/tasks/{task_id}.
Integración Atractor: informe de ventas totalizadas por rango de fechas (configurable desde la app).
"""
import base64
import io
import json
import os
import ssl
import threading
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from urllib.parse import urlencode

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import pandas as pd
import numpy as np
from pydantic import BaseModel

from auth import router as auth_router, get_current_username
from productos_catalogo import get_productos_catalogo
from database import (
    get_connection,
    get_all_rma_items,
    get_client_groups,
    get_productos_rma,
    get_setting,
    set_setting,
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
    list_users,
    get_notifications_for_user,
    count_unread_notifications,
    create_notification,
    mark_notification_read,
)

# CORS: en desarrollo solo localhost; en red local poner CORS_ORIGINS=* en .env
_cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").strip()
_cors_list = [o.strip() for o in _cors_origins.split(",") if o.strip()] if _cors_origins != "*" else ["*"]

app = FastAPI(title="API Garantías")
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


def _get_excel_sync_path(conn) -> str:
    # .strip() solo quita espacios al inicio/final; los espacios en la ruta (ej. "DEPT. TEC\archivo nombre.xlsx") se conservan
    return (get_setting(conn, "EXCEL_SYNC_PATH") or _DEFAULT_EXCEL_SYNC_PATH).strip()


def _get_productos_catalog_path(conn) -> str:
    raw = (get_setting(conn, "PRODUCTOS_CATALOG_PATH") or _DEFAULT_PRODUCTOS_CATALOG_PATH).strip()
    # Normalizar ruta UNC en Windows: \server\share -> \\server\share
    if raw and len(raw) > 1 and raw[0] == "\\" and raw[1] != "\\":
        raw = "\\" + raw
    return raw

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


def _run_sync_reset_task(task_id: str, excel_path: str) -> None:
    """Ejecuta sync-reset en segundo plano y actualiza progreso en _tasks[task_id]."""
    try:
        path = Path(excel_path)
        _update_task(task_id, percent=0, message="Leyendo Excel...")
        df = pd.read_excel(path, sheet_name=0)
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
    except Exception as e:
        _update_task(task_id, status="error", percent=0, message=str(e), result=None)


@app.post("/api/productos/sync-reset")
async def recargar_rma_desde_excel(username: str = Depends(get_current_username)):
    """
    Borra todos los registros RMA y vuelve a cargar la lista entera desde el Excel
    configurado (EXCEL_SYNC_PATH). Devuelve task_id para consultar progreso en GET /api/tasks/{task_id}.
    """
    with get_connection() as conn:
        excel_path = _get_excel_sync_path(conn)
    path = Path(excel_path)
    if not path.is_file():
        raise HTTPException(
            status_code=400,
            detail=f"No se encuentra el archivo Excel en la ruta configurada: {path}",
        )
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
    """Ejecuta sync (añadir solo nuevos) en segundo plano."""
    try:
        if file_content is not None:
            _update_task(task_id, percent=0, message="Leyendo Excel subido...")
            df = pd.read_excel(io.BytesIO(file_content), sheet_name=0)
        else:
            _update_task(task_id, percent=0, message="Leyendo Excel...")
            path = Path(excel_path)
            df = pd.read_excel(path, sheet_name=0)
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
    except Exception as e:
        _update_task(task_id, status="error", percent=0, message=str(e), result=None)


@app.post("/api/productos/sync")
async def sincronizar_excel(file: UploadFile = File(None)):
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
        path = Path(excel_path)
        if not path.is_file():
            raise HTTPException(status_code=400, detail=f"No se encuentra el Excel en la ruta configurada: {path}")
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
    """Devuelve las claves de configuración editables (paths y Atractor). La contraseña de Atractor no se devuelve."""
    with get_connection() as conn:
        return {
            "PRODUCTOS_CATALOG_PATH": get_setting(conn, "PRODUCTOS_CATALOG_PATH") or "",
            "EXCEL_SYNC_PATH": get_setting(conn, "EXCEL_SYNC_PATH") or "",
            "ATRACTOR_URL": get_setting(conn, "ATRACTOR_URL") or "",
            "ATRACTOR_USER": get_setting(conn, "ATRACTOR_USER") or "",
            "ATRACTOR_PASSWORD": "",  # Nunca devolver la contraseña
        }


class SettingsBody(BaseModel):
    PRODUCTOS_CATALOG_PATH: str = ""
    EXCEL_SYNC_PATH: str = ""
    ATRACTOR_URL: str = ""
    ATRACTOR_USER: str = ""
    ATRACTOR_PASSWORD: str = ""  # Si está vacío no se actualiza la guardada


@app.patch("/api/settings")
def actualizar_settings(
    body: SettingsBody,
    username: str = Depends(get_current_username),
):
    """Guarda las rutas de catálogo, Excel y configuración de Atractor."""
    with get_connection() as conn:
        set_setting(conn, "PRODUCTOS_CATALOG_PATH", (body.PRODUCTOS_CATALOG_PATH or "").strip())
        set_setting(conn, "EXCEL_SYNC_PATH", (body.EXCEL_SYNC_PATH or "").strip())
        set_setting(conn, "ATRACTOR_URL", (body.ATRACTOR_URL or "").strip())
        set_setting(conn, "ATRACTOR_USER", (body.ATRACTOR_USER or "").strip())
        if (body.ATRACTOR_PASSWORD or "").strip():
            set_setting(conn, "ATRACTOR_PASSWORD", (body.ATRACTOR_PASSWORD or "").strip())
    return {"mensaje": "Configuración guardada"}


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
    except Exception as e:
        _update_task(task_id, status="error", percent=0, message=str(e), result=None)


@app.post("/api/productos-catalogo/refresh")
def refrescar_catalogo(username: str = Depends(get_current_username)):
    """
    Escanea la carpeta QNAP y actualiza la caché del catálogo.
    Devuelve task_id para consultar progreso en GET /api/tasks/{task_id}.
    """
    with get_connection() as conn:
        catalog_path = _get_productos_catalog_path(conn)
    if not catalog_path or not catalog_path.strip():
        raise HTTPException(status_code=400, detail="Configura la ruta del catálogo en Configuración.")
    task_id = str(uuid.uuid4())
    with _tasks_lock:
        _tasks[task_id] = {"status": "running", "percent": 0, "message": "Iniciando...", "result": None}
    threading.Thread(target=_run_catalog_refresh_task, args=(task_id, catalog_path), daemon=True).start()
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
    full = base / path.replace("/", os.sep)
    try:
        full.resolve().relative_to(base.resolve())
    except (ValueError, OSError):
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


# --- Usuarios (para dropdown notificaciones) y Notificaciones ---


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


@app.get("/api/notifications")
def listar_notificaciones(username: str = Depends(get_current_username)):
    """Lista notificaciones recibidas por el usuario actual."""
    with get_connection() as conn:
        user = get_user_by_username(conn, username)
        if not user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        items = get_notifications_for_user(conn, user["id"])
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


class NotificationBody(BaseModel):
    to_user_id: int
    type: str  # 'rma' | 'catalogo' | 'producto_rma' | 'cliente'
    reference_data: dict
    message: str = ""


@app.post("/api/notifications")
def crear_notificacion(body: NotificationBody, username: str = Depends(get_current_username)):
    """Crea una notificación para otro usuario (compartir fila de RMA, catálogo, etc.)."""
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
        nid = create_notification(
            conn,
            from_user_id=from_user["id"],
            to_user_id=body.to_user_id,
            type_=body.type.strip(),
            reference_data=ref_json,
            message=body.message.strip() or None,
        )
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
