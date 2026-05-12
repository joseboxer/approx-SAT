"""
Copias JSON automáticas tras mutaciones HTTP exitosas (ver middleware en main.py).

- Directorio: backups/auto-json/ junto a garantia.db
- AUTO_BACKUP_JSON=0|false desactiva
- AUTO_BACKUP_JSON_KEEP: máximo de ficheros (default 80)
- AUTO_BACKUP_JSON_MIN_INTERVAL_SEC: mínimo segundos entre copias (default 3);
  evita decenas de escrituras en ráfaga; pon 0 para intentar copia tras cada petición OK.
"""
from __future__ import annotations

import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

_lock = threading.Lock()
_last_write_ts = 0.0

_AUTO_BACKUP_SKIP_PREFIXES = (
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/verify",
)


def should_skip_auto_backup_path(path: str) -> bool:
    p = path or ""
    return any(p.startswith(pref) for pref in _AUTO_BACKUP_SKIP_PREFIXES)


def trigger_auto_backup_json_if_enabled() -> None:
    if os.environ.get("AUTO_BACKUP_JSON", "1").lower() in ("0", "false", "no"):
        return
    threading.Thread(target=_write_auto_backup_safe, daemon=True).start()


def _write_auto_backup_safe() -> None:
    global _last_write_ts
    try:
        min_interval = float(os.environ.get("AUTO_BACKUP_JSON_MIN_INTERVAL_SEC", "3"))
    except ValueError:
        min_interval = 3.0
    try:
        keep = int(os.environ.get("AUTO_BACKUP_JSON_KEEP", "80"))
    except ValueError:
        keep = 80
    try:
        with _lock:
            now = time.time()
            if min_interval > 0 and (now - _last_write_ts) < min_interval:
                return
            _last_write_ts = now
            from database import DB_PATH, export_app_backup, get_connection

            out_dir = DB_PATH.parent / "backups" / "auto-json"
            out_dir.mkdir(parents=True, exist_ok=True)
            ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")[:-3]
            path = out_dir / f"garantia-auto-{ts}.json"
            with get_connection() as conn:
                payload = export_app_backup(conn)
            path.write_text(
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
            _prune_old(out_dir, keep)
    except Exception:
        pass


def _prune_old(out_dir: Path, keep: int) -> None:
    files = sorted(out_dir.glob("garantia-auto-*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    for old in files[keep:]:
        try:
            old.unlink()
        except OSError:
            pass
