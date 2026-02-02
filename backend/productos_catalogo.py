"""
Catálogo de productos desde carpeta de red (QNAP).
Estructura: \\Qnap-approx2\z\DEPT. TEC\PRODUCTOS
  -> carpetas por marca
    -> carpetas por número de serie base (o por tipo de producto -> carpetas por serie)
      -> Excel con "visual datasheet" y número de serie en el nombre; celdas D31 (serie base), D28 (fecha creación).
      -> Visual: PDF o Excel con "visual" / "datasheet" en el nombre.
"""
import os
from pathlib import Path

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


def _is_technical_excel(name: str) -> bool:
    """El Excel técnico contiene 'visual datasheet' y suele llevar el número de serie en el nombre."""
    n = name.lower()
    return "visual" in n and "datasheet" in n and (n.endswith(".xlsx") or n.endswith(".xls"))


def _is_visual_file(name: str) -> bool:
    """Archivo que puede ser el visual (PDF o Excel con 'visual' o 'datasheet')."""
    n = name.lower()
    if n.endswith(".pdf"):
        return "visual" in n or "datasheet" in n
    if n.endswith(".xlsx") or n.endswith(".xls"):
        return "visual" in n or "datasheet" in n
    return False


def _find_product_in_dir(
    folder: Path,
    base_path: Path,
    brand: str,
    product_type: str | None,
) -> dict | None:
    """
    Si en esta carpeta hay un Excel técnico (visual datasheet), devuelve un dict con
    base_serial, brand, product_type, creation_date, folder_rel, excel_rel, visual_pdf_rel, visual_excel_rel.
    """
    folder = _normalize_path(folder)
    try:
        entries = list(folder.iterdir())
    except (OSError, PermissionError):
        return None

    technical_excel = None
    for e in entries:
        if e.is_file() and _is_technical_excel(e.name):
            technical_excel = e
            break

    if not technical_excel:
        return None

    serie_base, fecha_creacion = _read_serial_and_date_from_excel(technical_excel)
    if not serie_base:
        serie_base = folder.name  # fallback al nombre de carpeta

    try:
        folder_rel = folder.relative_to(base_path)
    except ValueError:
        folder_rel = folder

    try:
        excel_rel = technical_excel.relative_to(base_path)
    except ValueError:
        excel_rel = Path(technical_excel.name)

    visual_pdf = None
    visual_excel = None
    for e in entries:
        if not e.is_file():
            continue
        if not _is_visual_file(e.name):
            continue
        try:
            rel = e.relative_to(base_path)
        except ValueError:
            rel = Path(e.name)
        if e.suffix.lower() == ".pdf":
            visual_pdf = str(rel).replace("\\", "/")
        elif e.suffix.lower() in (".xlsx", ".xls"):
            visual_excel = str(rel).replace("\\", "/")

    return {
        "base_serial": serie_base,
        "brand": brand,
        "product_type": product_type or None,
        "creation_date": fecha_creacion,
        "folder_rel": str(folder_rel).replace("\\", "/"),
        "excel_rel": str(excel_rel).replace("\\", "/"),
        "visual_pdf_rel": visual_pdf,
        "visual_excel_rel": visual_excel,
    }


def _scan_brand_dir(
    brand_path: Path,
    base_path: Path,
    brand: str,
) -> list[dict]:
    """Recorre una carpeta de marca: puede tener productos directamente o subcarpetas por tipo."""
    out = []
    try:
        entries = list(brand_path.iterdir())
    except (OSError, PermissionError):
        return out

    for e in entries:
        if not e.is_dir():
            continue
        # Puede ser carpeta de producto (tiene Excel técnico) o carpeta de tipo (contiene carpetas de producto)
        product = _find_product_in_dir(e, base_path, brand, None)
        if product:
            out.append(product)
            continue
        # Subcarpeta por tipo de producto
        try:
            sub_entries = list(e.iterdir())
        except (OSError, PermissionError):
            continue
        tipo = e.name
        for sub in sub_entries:
            if not sub.is_dir():
                continue
            product = _find_product_in_dir(sub, base_path, brand, tipo)
            if product:
                out.append(product)
    return out


def get_productos_catalogo(base_path: str | Path) -> list[dict]:
    """
    Escanea la ruta base (ej: \\\\Qnap-approx2\\z\\DEPT. TEC\\PRODUCTOS).
    Devuelve lista de productos con base_serial, brand, product_type, creation_date,
    folder_rel, excel_rel, visual_pdf_rel, visual_excel_rel.
    Lanza excepción si la ruta no existe o no se puede acceder.
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

    try:
        top_entries = list(base.iterdir())
    except (OSError, PermissionError) as e:
        raise PermissionError(f"No se puede acceder a la carpeta: {base_path}") from e

    for e in top_entries:
        if not e.is_dir():
            continue
        brand = e.name
        out.extend(_scan_brand_dir(e, base, brand))

    return out
