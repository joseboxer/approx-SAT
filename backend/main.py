"""
API Garantías: usuarios (auth), RMA/productos/clientes en base de datos.
Carga de Excel: contrasta con la BD y solo añade registros nuevos.
El Excel de sincronización puede ser una ruta fija (p. ej. QNAP) o subida manual.
Tareas largas (sync, sync-reset, catalog refresh) devuelven task_id y reportan progreso vía GET /api/tasks/{task_id}.
"""
import io
import os
import threading
import uuid
from pathlib import Path

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
    """Devuelve las claves de configuración editables (paths)."""
    with get_connection() as conn:
        return {
            "PRODUCTOS_CATALOG_PATH": get_setting(conn, "PRODUCTOS_CATALOG_PATH") or "",
            "EXCEL_SYNC_PATH": get_setting(conn, "EXCEL_SYNC_PATH") or "",
        }


class SettingsBody(BaseModel):
    PRODUCTOS_CATALOG_PATH: str = ""
    EXCEL_SYNC_PATH: str = ""


@app.patch("/api/settings")
def actualizar_settings(
    body: SettingsBody,
    username: str = Depends(get_current_username),
):
    """Guarda las rutas de catálogo y Excel (sin tocar archivos)."""
    with get_connection() as conn:
        set_setting(conn, "PRODUCTOS_CATALOG_PATH", (body.PRODUCTOS_CATALOG_PATH or "").strip())
        set_setting(conn, "EXCEL_SYNC_PATH", (body.EXCEL_SYNC_PATH or "").strip())
    return {"mensaje": "Configuración guardada"}


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
    """Escanea QNAP, guarda en caché y actualiza progreso (directorio actual en tiempo real)."""
    try:
        _update_task(task_id, percent=0, message="Iniciando escaneo...")

        def on_dir(path_rel: str) -> None:
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


# Servir frontend compilado (para despliegue en un solo servidor)
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
