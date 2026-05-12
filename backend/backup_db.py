"""
Copia de seguridad local de la base de datos SQLite.

Uso:
  python backup_db.py
  python backup_db.py --keep 30 --output-dir backups
"""
from __future__ import annotations

import argparse
import sqlite3
from datetime import datetime
from pathlib import Path

from database import DB_PATH


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Crea un backup de garantia.db")
    parser.add_argument(
        "--output-dir",
        default="backups",
        help="Carpeta (relativa a backend) donde guardar copias.",
    )
    parser.add_argument(
        "--keep",
        type=int,
        default=21,
        help="Numero maximo de backups a conservar.",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="No imprimir salida en caso de exito.",
    )
    return parser.parse_args()


def create_backup(output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = output_dir / f"garantia-{timestamp}.db"
    with sqlite3.connect(DB_PATH) as src, sqlite3.connect(backup_path) as dst:
        src.backup(dst)
    return backup_path


def prune_backups(output_dir: Path, keep: int) -> int:
    if keep <= 0:
        keep = 1
    backups = sorted(output_dir.glob("garantia-*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
    removed = 0
    for old in backups[keep:]:
        old.unlink(missing_ok=True)
        removed += 1
    return removed


def main() -> int:
    args = parse_args()
    backend_dir = Path(__file__).resolve().parent
    out_dir = (backend_dir / args.output_dir).resolve()

    if not DB_PATH.is_file():
        print(f"[backup] No existe base de datos en: {DB_PATH}")
        return 1

    backup_path = create_backup(out_dir)
    removed = prune_backups(out_dir, args.keep)
    if not args.quiet:
        print(f"[backup] Copia creada: {backup_path}")
        if removed:
            print(f"[backup] Copias antiguas eliminadas: {removed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
