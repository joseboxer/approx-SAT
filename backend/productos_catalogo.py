"""
Catálogo de productos desde carpeta de red (QNAP).
- Se recorre la estructura recursivamente. Solo se considera "producto" un directorio que contenga al menos un Excel
  cuyo nombre incluya la palabra "visual" (insensible a mayúsculas). Si no hay ningún Excel con "visual", se ignora
  el directorio y se revisan el resto (subcarpetas).
- En un directorio producto: se usa el Excel visual para datos técnicos. Toda la información se busca solo en
  las primeras 40 filas y hasta la columna K. Fecha: se recopilan todos los valores que sean fechas válidas
  y se elige la más antigua. Número de serie: se busca "TECHNICAL DEPARTMENT" en todo el rango (filas y columnas);
  el serial está dos columnas a la izquierda, debajo (ej. TECHNICAL en H29 → serial en F30, F31...).
"""
from __future__ import annotations

import os
import re
from datetime import datetime
from pathlib import Path
from typing import Callable

import pandas as pd

# Límites de búsqueda en el Excel: solo primeras 40 filas y hasta columna K
EXCEL_MAX_ROWS = 40   # filas 0..39 (0-based)
EXCEL_MAX_COL = 11    # columnas A..K = 0..10 (0-based), K = índice 10
# Número de serie: buscar "TECHNICAL DEPARTMENT" en cualquier columna (A–K); el número de serie está
# dos columnas a la izquierda, debajo (celdas unidas). Ej.: TECHNICAL en G29 → serial en E30,E31...; en H29 → F30,F31...
SERIE_COL_OFFSET = 2   # columnas a la izquierda de TECHNICAL DEPARTMENT donde buscar el serial


def _normalize_path(p: Path) -> Path:
    """Resuelve y normaliza; en Windows mantiene UNC."""
    try:
        return p.resolve()
    except (OSError, RuntimeError):
        return p


def _is_text_value(val) -> bool:
    """True si el valor es texto no vacío (no NaN ni vacío)."""
    if val is None:
        return False
    if isinstance(val, float) and pd.isna(val):
        return False
    s = str(val).strip()
    return len(s) > 0


def _parse_date(val) -> datetime | None:
    """
    Intenta interpretar el valor como fecha. Devuelve datetime o None.
    Acepta: número serial de Excel, string ISO, string DD/MM/YYYY o similares.
    """
    if val is None:
        return None
    if isinstance(val, float):
        if pd.isna(val):
            return None
        # Excel serial: días desde 1900-01-01
        try:
            from datetime import timedelta
            base = datetime(1899, 12, 30)
            d = base + timedelta(days=int(val)) if val == int(val) else base + timedelta(days=val)
            return d
        except (ValueError, OverflowError):
            return None
    if isinstance(val, datetime):
        return val
    s = str(val).strip()
    if not s:
        return None
    # Formatos de cadena comunes
    formats = (
        "%Y-%m-%d",
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y",
        "%d/%m/%Y %H:%M:%S",
        "%d-%m-%Y",
        "%d.%m.%Y",
    )
    for fmt in formats:
        try:
            s_ = s[:19] if " " in fmt else s[:10]
            return datetime.strptime(s_, fmt)
        except ValueError:
            continue
    # Regex: YYYY-MM-DD
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        try:
            return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass
    # Regex: DD/MM/YYYY o DD-MM-YYYY
    m = re.match(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", s)
    if m:
        try:
            return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            pass
    return None


def _find_oldest_date_in_range(df: pd.DataFrame) -> str | None:
    """
    Recorre las primeras EXCEL_MAX_ROWS filas y hasta columna K; recopila todos los valores
    que sean fechas válidas y devuelve la más antigua como string YYYY-MM-DD.
    """
    dates = []
    rows = min(EXCEL_MAX_ROWS, len(df))
    cols = min(EXCEL_MAX_COL, df.shape[1]) if len(df.shape) > 1 else 0
    for r in range(rows):
        for c in range(cols):
            try:
                val = df.iloc[r, c]
                d = _parse_date(val)
                if d is not None:
                    dates.append(d)
            except (IndexError, KeyError):
                continue
    if not dates:
        return None
    oldest = min(dates)
    return oldest.strftime("%Y-%m-%d")


def _find_serial_below_technical_in_column_g(df: pd.DataFrame) -> str | None:
    """
    Busca "TECHNICAL DEPARTMENT" en todo el rango (primeras filas, columnas A–K). No tiene que estar
    en la columna G; puede estar en cualquier columna. Una vez encontrada en (fila r, columna c),
    el número de serie está dos columnas a la izquierda (c - 2), en las filas debajo (r+1, r+2...),
    porque las celdas debajo están unidas. Ej.: TECHNICAL en H29 → serial en F30, F31, F32...
    """
    target = "technical department"
    rows = min(EXCEL_MAX_ROWS, len(df))
    cols = min(EXCEL_MAX_COL, df.shape[1]) if len(df.shape) > 1 else 0
    if cols == 0:
        return None
    for r in range(rows):
        for c in range(cols):
            try:
                val = df.iloc[r, c]
                if not _is_text_value(val):
                    continue
                if target in str(val).strip().lower():
                    serial_col = c - SERIE_COL_OFFSET
                    if serial_col < 0:
                        continue
                    if serial_col >= df.shape[1]:
                        continue
                    for r2 in range(r + 1, rows):
                        try:
                            val2 = df.iloc[r2, serial_col]
                            if _is_text_value(val2):
                                return str(val2).strip()
                        except (IndexError, KeyError):
                            continue
                    return None
            except (IndexError, KeyError):
                continue
    return None


def _read_serial_and_date_from_excel(excel_path: Path) -> tuple[str | None, str | None]:
    """
    Lee el Excel limitado a las primeras 40 filas y columna K.
    Fecha: recopila todas las fechas válidas en ese rango y devuelve la más antigua (YYYY-MM-DD).
    Serie base: busca "TECHNICAL DEPARTMENT" en cualquier columna; debajo (celdas unidas) el primer texto
    en la columna dos posiciones a la izquierda (G→E, H→F, etc.).
    """
    try:
        df = pd.read_excel(excel_path, sheet_name=0, header=None)
        if df.empty or df.shape[0] == 0:
            return None, None

        fecha = _find_oldest_date_in_range(df)
        serie = _find_serial_below_technical_in_column_g(df)
        return serie, fecha
    except Exception:
        return None, None


def _mtime(p: Path) -> float:
    """Mtime del archivo; 0 si no se puede leer."""
    try:
        return p.stat().st_mtime
    except (OSError, PermissionError):
        return 0.0


def _dir_has_excel(folder: Path) -> bool:
    """True si el directorio contiene al menos un archivo .xlsx o .xls."""
    try:
        for e in folder.iterdir():
            if e.is_file() and e.suffix.lower() in (".xlsx", ".xls"):
                return True
    except (OSError, PermissionError):
        pass
    return False


def _dir_has_visual_excel(folder: Path) -> bool:
    """True si el directorio contiene al menos un Excel cuyo nombre incluya 'visual' (insensible a mayúsculas)."""
    try:
        for e in folder.iterdir():
            if e.is_file() and e.suffix.lower() in (".xlsx", ".xls"):
                if "visual" in e.name.lower():
                    return True
    except (OSError, PermissionError):
        pass
    return False


def _newest_excel_in_dir(folder: Path) -> Path | None:
    """Devuelve el Excel más nuevo (por fecha de modificación) del directorio."""
    excels = []
    try:
        for e in folder.iterdir():
            if e.is_file() and e.suffix.lower() in (".xlsx", ".xls"):
                excels.append(e)
    except (OSError, PermissionError):
        return None
    if not excels:
        return None
    excels.sort(key=_mtime, reverse=True)
    return excels[0]


def _newest_pdf_in_dir(folder: Path) -> Path | None:
    """Devuelve el PDF más nuevo (por fecha de modificación) del directorio."""
    pdfs = []
    try:
        for e in folder.iterdir():
            if e.is_file() and e.suffix.lower() == ".pdf":
                pdfs.append(e)
    except (OSError, PermissionError):
        return None
    if not pdfs:
        return None
    pdfs.sort(key=_mtime, reverse=True)
    return pdfs[0]


def _newest_visual_excel_in_dir(folder: Path) -> Path | None:
    """Devuelve el Excel más nuevo que tenga 'visual' o 'datasheet' en el nombre (para abrir como visual)."""
    excels = []
    try:
        for e in folder.iterdir():
            if not e.is_file() or e.suffix.lower() not in (".xlsx", ".xls"):
                continue
            n = e.name.lower()
            if "visual" in n or "datasheet" in n:
                excels.append(e)
    except (OSError, PermissionError):
        return None
    if not excels:
        return None
    excels.sort(key=_mtime, reverse=True)
    return excels[0]


def _process_product_dir(
    folder: Path,
    base_path: Path,
    path_parts: list[str],
) -> dict | None:
    """
    Procesa un directorio producto. Solo se abre el Excel con "visual"/"datasheet" en el nombre
    (fecha C3, serie = última celda con texto en col D), para no cargar Excels que no sean del producto.
    path_parts = componentes de la ruta relativa (ej. ["PRODUCTOS APPROX", "APP500LITE"]).
    """
    folder = _normalize_path(folder)
    # Usar solo el Excel visual para leer C3 y última celda con texto: no abrir otros Excels de la carpeta
    technical_excel = _newest_visual_excel_in_dir(folder)
    if not technical_excel:
        return None

    serie_base, fecha_creacion = _read_serial_and_date_from_excel(technical_excel)
    if not serie_base:
        serie_base = folder.name

    try:
        folder_rel = folder.relative_to(base_path)
    except ValueError:
        folder_rel = folder
    folder_rel_str = str(folder_rel).replace("\\", "/")

    try:
        excel_rel = technical_excel.relative_to(base_path)
    except ValueError:
        excel_rel = Path(technical_excel.name)
    excel_rel_str = str(excel_rel).replace("\\", "/")

    visual_pdf = None
    pdf_file = _newest_pdf_in_dir(folder)
    if pdf_file:
        try:
            rel = pdf_file.relative_to(base_path)
            visual_pdf = str(rel).replace("\\", "/")
        except ValueError:
            visual_pdf = pdf_file.name

    visual_excel = None
    # Mismo Excel que technical_excel (ya es el visual); ruta relativa para enlace
    try:
        rel = technical_excel.relative_to(base_path)
        visual_excel = str(rel).replace("\\", "/")
    except ValueError:
        visual_excel = technical_excel.name

    brand = path_parts[0] if path_parts else folder.name
    product_type = path_parts[1] if len(path_parts) >= 3 else None

    return {
        "base_serial": serie_base,
        "brand": brand,
        "product_type": product_type,
        "creation_date": fecha_creacion,
        "folder_rel": folder_rel_str,
        "excel_rel": excel_rel_str,
        "visual_pdf_rel": visual_pdf,
        "visual_excel_rel": visual_excel,
    }


def _count_directory_visits(current: Path) -> int:
    """
    Cuenta cuántos directorios se visitarán en el recorrido (misma lógica que _walk_and_collect).
    Sirve para calcular el total y mostrar porcentaje en tiempo real.
    """
    try:
        entries = list(current.iterdir())
    except (OSError, PermissionError):
        return 0
    if _dir_has_visual_excel(current):
        return 1
    total = 1
    for e in entries:
        if e.is_dir():
            total += _count_directory_visits(e)
    return total


def _walk_and_collect(
    current: Path,
    base_path: Path,
    path_parts: list[str],
    out: list[dict],
    on_directory: Callable[[str, int, int], None] | None = None,
    current_index: list[int] | None = None,
    total_visits: int = 0,
) -> None:
    """
    Recorre recursivamente. Solo se considera producto un directorio que tenga al menos un Excel
    con "visual" en el nombre (insensible a mayúsculas). Si no, se entra en cada subcarpeta y se repite.
    on_directory(path_rel, current, total) se llama al entrar en cada directorio para progreso en tiempo real.
    """
    if on_directory:
        try:
            rel = current.relative_to(base_path)
            path_rel = str(rel).replace("\\", "/")
        except ValueError:
            path_rel = current.name or str(current)
        if current_index is not None:
            current_index[0] += 1
            on_directory(path_rel or ".", current_index[0], total_visits)
        else:
            on_directory(path_rel or ".", 0, 0)

    try:
        entries = list(current.iterdir())
    except (OSError, PermissionError):
        return

    # Si tiene Excel "visual", este directorio es el del producto (hoja), no un contenedor de productos.
    # Se procesa y se sale: no se entra en subcarpetas (ese directorio ya está comprobado al completo).
    if _dir_has_visual_excel(current):
        product = _process_product_dir(current, base_path, path_parts)
        if product:
            out.append(product)
        return

    for e in entries:
        if not e.is_dir():
            continue
        new_parts = path_parts + [e.name]
        _walk_and_collect(e, base_path, new_parts, out, on_directory, current_index, total_visits)


def get_productos_catalogo(
    base_path: str | Path,
    on_directory: Callable[[str, int, int], None] | None = None,
) -> list[dict]:
    """
    Escanea la ruta base recursivamente. Solo se considera producto un directorio que contenga al menos un Excel
    cuyo nombre incluya "visual" (insensible a mayúsculas). En cada Excel visual: se buscan fecha y serie solo
    en las primeras 40 filas y hasta columna K; fecha = la más antigua entre las celdas con formato de fecha
    válido; serie = primer texto en la columna (TECHNICAL - 2) debajo de la fila de "TECHNICAL DEPARTMENT".
    on_directory(path_rel, current, total) se invoca al entrar en cada directorio para progreso en tiempo real.
    """
    if not base_path or not str(base_path).strip():
        return []

    base_path_str = str(base_path).strip()
    # En Windows, rutas UNC (\\server\share) se normalizan con os.path para acceso fiable
    if os.name == "nt" and base_path_str.startswith("\\\\"):
        base_path_str = os.path.normpath(base_path_str)
    base = Path(base_path_str)
    if not base.exists():
        raise FileNotFoundError(f"La ruta no existe: {base_path_str}")
    if not base.is_dir():
        raise NotADirectoryError(f"La ruta no es una carpeta: {base_path_str}")

    base = _normalize_path(base)
    out = []
    total_visits = 0
    current_index: list[int] | None = None
    if on_directory:
        total_visits = _count_directory_visits(base)
        current_index = [0]
    _walk_and_collect(base, base, [], out, on_directory, current_index, total_visits)
    return out
