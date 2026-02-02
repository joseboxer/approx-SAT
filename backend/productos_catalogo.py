"""
Catálogo de productos desde carpeta de red (QNAP).
- Se recorre la estructura recursivamente. Solo se considera "producto" un directorio que contenga al menos un Excel
  cuyo nombre incluya la palabra "visual" (insensible a mayúsculas). Si no hay ningún Excel con "visual", se ignora
  el directorio y se revisan el resto (subcarpetas).
- En un directorio producto: se usa el Excel más nuevo para datos técnicos (D31, D28); PDF más nuevo = visual.
- El Excel más nuevo del directorio con "visual" o "datasheet" en el nombre puede ser el visual Excel.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Callable

import pandas as pd

# Celdas del Excel técnico (0-based: D28 = col 3, row 27; D31 = col 3, row 30)
EXCEL_COL_SERIE = 3   # D
EXCEL_ROW_SERIE = 30  # D31
EXCEL_ROW_FECHA = 27  # D28


def _normalize_path(p: Path) -> Path:
    """Resuelve y normaliza; en Windows mantiene UNC."""
    try:
        return p.resolve()
    except (OSError, RuntimeError):
        return p


def _read_serial_and_date_from_excel(excel_path: Path) -> tuple[str | None, str | None]:
    """Lee número de serie base (D31) y fecha de creación (D28) del Excel técnico."""
    try:
        df = pd.read_excel(excel_path, sheet_name=0, header=None)
        if df.shape[0] <= max(EXCEL_ROW_SERIE, EXCEL_ROW_FECHA):
            return None, None
        serie_val = df.iloc[EXCEL_ROW_SERIE, EXCEL_COL_SERIE]
        fecha_val = df.iloc[EXCEL_ROW_FECHA, EXCEL_COL_SERIE]
        serie = None
        if serie_val is not None and not (isinstance(serie_val, float) and pd.isna(serie_val)):
            serie = str(serie_val).strip() or None
        fecha = None
        if fecha_val is not None and not (isinstance(fecha_val, float) and pd.isna(fecha_val)):
            fecha = str(fecha_val).strip() or None
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
    Procesa un directorio que contiene al menos un Excel (producto).
    Usa el Excel más nuevo para datos técnicos; el PDF más nuevo como visual; el Excel visual más nuevo si hay.
    path_parts = componentes de la ruta relativa (ej. ["PRODUCTOS APPROX", "APP500LITE"]).
    """
    folder = _normalize_path(folder)
    technical_excel = _newest_excel_in_dir(folder)
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
    excel_visual_file = _newest_visual_excel_in_dir(folder)
    if excel_visual_file:
        try:
            rel = excel_visual_file.relative_to(base_path)
            visual_excel = str(rel).replace("\\", "/")
        except ValueError:
            visual_excel = excel_visual_file.name

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


def _walk_and_collect(
    current: Path,
    base_path: Path,
    path_parts: list[str],
    out: list[dict],
    on_directory: Callable[[str], None] | None = None,
) -> None:
    """
    Recorre recursivamente. Solo se considera producto un directorio que tenga al menos un Excel
    con "visual" en el nombre (insensible a mayúsculas). Si no, se entra en cada subcarpeta y se repite.
    on_directory(path_rel) se llama al entrar en cada directorio para reportar progreso.
    """
    if on_directory:
        try:
            rel = current.relative_to(base_path)
            path_rel = str(rel).replace("\\", "/")
        except ValueError:
            path_rel = current.name or str(current)
        on_directory(path_rel or ".")

    try:
        entries = list(current.iterdir())
    except (OSError, PermissionError):
        return

    if _dir_has_visual_excel(current):
        product = _process_product_dir(current, base_path, path_parts)
        if product:
            out.append(product)
        return

    for e in entries:
        if not e.is_dir():
            continue
        new_parts = path_parts + [e.name]
        _walk_and_collect(e, base_path, new_parts, out, on_directory)


def get_productos_catalogo(
    base_path: str | Path,
    on_directory: Callable[[str], None] | None = None,
) -> list[dict]:
    """
    Escanea la ruta base recursivamente. Solo se considera producto un directorio que contenga al menos un Excel
    cuyo nombre incluya "visual" (insensible a mayúsculas). En ese directorio: Excel más nuevo = datos técnicos (D31, D28);
    PDF más nuevo = visual; Excel con "visual"/"datasheet" en nombre = visual Excel opcional.
    on_directory(path_rel) se invoca al entrar en cada directorio para mostrar progreso en tiempo real.
    """
    if not base_path or not str(base_path).strip():
        return []

    base = Path(base_path)
    if not base.exists():
        raise FileNotFoundError(f"La ruta no existe: {base_path}")
    if not base.is_dir():
        raise NotADirectoryError(f"La ruta no es una carpeta: {base_path}")

    base = _normalize_path(base)
    out = []
    _walk_and_collect(base, base, [], out, on_directory)
    return out
