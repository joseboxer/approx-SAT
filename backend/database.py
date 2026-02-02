"""
Base de datos SQLite para la aplicación.
- users: usuarios (correo @approx.es).
- rma_items: líneas RMA (productos, clientes, estado, ocultos). Sincronización con Excel añade solo registros nuevos.
"""
import math
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "garantia.db"

# Claves que devuelve la API (el frontend las espera)
RMA_KEYS = (
    "Nº DE RMA",
    "PRODUCTO",
    "Nº DE SERIE",
    "RAZON SOCIAL O NOMBRE",
    "EMAIL",
    "TELEFONO",
    "FECHA RECIBIDO",
    "AVERIA",
    "OBSERVACIONES",
)


def _init_db(conn: sqlite3.Connection):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

        CREATE TABLE IF NOT EXISTS rma_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rma_number TEXT NOT NULL,
            product TEXT,
            serial TEXT,
            client_name TEXT,
            client_email TEXT,
            client_phone TEXT,
            date_received TEXT,
            averia TEXT,
            observaciones TEXT,
            estado TEXT DEFAULT '',
            hidden INTEGER NOT NULL DEFAULT 0,
            hidden_by TEXT,
            hidden_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_rma_items_rma_number ON rma_items(rma_number);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_rma_items_rma_serial ON rma_items(rma_number, COALESCE(serial, ''));

        CREATE TABLE IF NOT EXISTS verification_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            username TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_verification_email ON verification_codes(email);
        CREATE INDEX IF NOT EXISTS idx_verification_expires ON verification_codes(expires_at);

        CREATE TABLE IF NOT EXISTS client_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            canonical_name TEXT NOT NULL,
            canonical_email TEXT,
            canonical_phone TEXT
        );
        CREATE TABLE IF NOT EXISTS client_group_members (
            group_id INTEGER NOT NULL REFERENCES client_groups(id) ON DELETE CASCADE,
            client_name TEXT NOT NULL,
            client_email TEXT,
            UNIQUE(client_name, client_email)
        );
        CREATE INDEX IF NOT EXISTS idx_group_members_group ON client_group_members(group_id);

        CREATE TABLE IF NOT EXISTS product_warranty (
            product_name TEXT PRIMARY KEY,
            warranty_valid INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS serial_warranty (
            serial TEXT PRIMARY KEY,
            warranty_valid INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    """)
    # Migración: añadir hidden_by y hidden_at si no existen (BD ya creada)
    cur = conn.execute("PRAGMA table_info(rma_items)")
    cols = [row[1] for row in cur.fetchall()]
    if "hidden_by" not in cols:
        conn.execute("ALTER TABLE rma_items ADD COLUMN hidden_by TEXT")
    if "hidden_at" not in cols:
        conn.execute("ALTER TABLE rma_items ADD COLUMN hidden_at TEXT")
    if "date_pickup" not in cols:
        conn.execute("ALTER TABLE rma_items ADD COLUMN date_pickup TEXT")
    if "date_sent" not in cols:
        conn.execute("ALTER TABLE rma_items ADD COLUMN date_sent TEXT")


@contextmanager
def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        _init_db(conn)
        conn.commit()
        yield conn
        conn.commit()
    finally:
        conn.close()


def get_user_by_username(conn: sqlite3.Connection, username: str) -> sqlite3.Row | None:
    cur = conn.execute(
        "SELECT id, username, password_hash, email, created_at FROM users WHERE username = ?",
        (username.strip(),),
    )
    return cur.fetchone()


def get_user_by_email(conn: sqlite3.Connection, email: str) -> sqlite3.Row | None:
    cur = conn.execute(
        "SELECT id, username, password_hash, email, created_at FROM users WHERE email = ?",
        (email.strip().lower(),),
    )
    return cur.fetchone()


def create_user(conn: sqlite3.Connection, username: str, password_hash: str, email: str) -> None:
    conn.execute(
        "INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)",
        (username.strip(), password_hash, email.strip().lower()),
    )


# --- Códigos de verificación por correo ---


def save_verification_code(
    conn: sqlite3.Connection,
    email: str,
    code: str,
    username: str,
    password_hash: str,
    expires_at: str,
) -> None:
    conn.execute(
        """INSERT INTO verification_codes (email, code, username, password_hash, expires_at)
           VALUES (?, ?, ?, ?, ?)""",
        (email.strip().lower(), code.strip(), username.strip(), password_hash, expires_at),
    )


def get_verification_code(conn: sqlite3.Connection, email: str, code: str) -> sqlite3.Row | None:
    cur = conn.execute(
        """SELECT id, email, code, username, password_hash, expires_at
           FROM verification_codes
           WHERE email = ? AND code = ? AND expires_at > datetime('now')
           ORDER BY created_at DESC LIMIT 1""",
        (email.strip().lower(), code.strip()),
    )
    return cur.fetchone()


def delete_verification_code(conn: sqlite3.Connection, email: str, code: str) -> None:
    conn.execute(
        "DELETE FROM verification_codes WHERE email = ? AND code = ?",
        (email.strip().lower(), code.strip()),
    )


# --- RMA items (productos, clientes, estado, ocultos) ---


def _row_to_api(row: sqlite3.Row) -> dict:
    """Convierte una fila de rma_items al formato que espera el frontend."""
    out = {
        "id": row["id"],
        "Nº DE RMA": row["rma_number"] or None,
        "PRODUCTO": row["product"] or None,
        "Nº DE SERIE": row["serial"] or None,
        "RAZON SOCIAL O NOMBRE": row["client_name"] or None,
        "EMAIL": row["client_email"] or None,
        "TELEFONO": row["client_phone"] or None,
        "FECHA RECIBIDO": row["date_received"] or None,
        "AVERIA": row["averia"] or None,
        "OBSERVACIONES": row["observaciones"] or None,
        "estado": row["estado"] or "",
        "hidden": bool(row["hidden"]),
    }
    if "hidden_by" in row.keys():
        out["hidden_by"] = row["hidden_by"] or None
    if "hidden_at" in row.keys():
        out["hidden_at"] = row["hidden_at"] or None
    if "date_pickup" in row.keys():
        out["FECHA RECOGIDA"] = row["date_pickup"] or None
    if "date_sent" in row.keys():
        out["FECHA ENVIADO"] = row["date_sent"] or None
    return out


def get_all_rma_items(conn: sqlite3.Connection) -> list[dict]:
    cur = conn.execute(
        """SELECT id, rma_number, product, serial, client_name, client_email, client_phone,
                  date_received, averia, observaciones, estado, hidden, hidden_by, hidden_at,
                  date_pickup, date_sent
           FROM rma_items ORDER BY id"""
    )
    return [_row_to_api(row) for row in cur.fetchall()]


def rma_item_exists(conn: sqlite3.Connection, rma_number: str, serial: str) -> bool:
    s = (serial or "").strip()
    cur = conn.execute(
        "SELECT 1 FROM rma_items WHERE rma_number = ? AND COALESCE(serial, '') = ?",
        (str(rma_number or "").strip(), s),
    )
    return cur.fetchone() is not None


def insert_rma_item(
    conn: sqlite3.Connection,
    rma_number: str,
    product: str,
    serial: str,
    client_name: str,
    client_email: str,
    client_phone: str,
    date_received,
    averia: str,
    observaciones: str,
    date_pickup=None,
    date_sent=None,
) -> None:
    def _s(v):
        if v is None or (isinstance(v, float) and math.isnan(v)):
            return None
        s = str(v).strip()
        return s if s else None

    conn.execute(
        """INSERT INTO rma_items (rma_number, product, serial, client_name, client_email, client_phone,
                                  date_received, averia, observaciones, date_pickup, date_sent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            _s(rma_number),
            _s(product),
            _s(serial),
            _s(client_name),
            _s(client_email),
            _s(client_phone),
            _s(date_received) if date_received is not None else None,
            _s(averia),
            _s(observaciones),
            _s(date_pickup) if date_pickup is not None else None,
            _s(date_sent) if date_sent is not None else None,
        ),
    )


def update_estado_by_rma_number(conn: sqlite3.Connection, rma_number: str, estado: str) -> int:
    cur = conn.execute(
        "UPDATE rma_items SET estado = ? WHERE rma_number = ?",
        (estado or "", str(rma_number).strip()),
    )
    return cur.rowcount


def update_fecha_recogida_by_rma_number(
    conn: sqlite3.Connection, rma_number: str, fecha_recogida: str | None
) -> int:
    """Actualiza la fecha de recogida de todos los ítems del RMA (YYYY-MM-DD o vacío)."""
    val = (fecha_recogida or "").strip()[:10] or None
    cur = conn.execute(
        "UPDATE rma_items SET date_pickup = ? WHERE rma_number = ?",
        (val, str(rma_number).strip()),
    )
    return cur.rowcount


def update_fecha_enviado_by_rma_number(
    conn: sqlite3.Connection, rma_number: str, fecha_enviado: str | None
) -> int:
    """Actualiza la fecha enviado de todos los ítems del RMA (YYYY-MM-DD o vacío)."""
    val = (fecha_enviado or "").strip()[:10] or None
    cur = conn.execute(
        "UPDATE rma_items SET date_sent = ? WHERE rma_number = ?",
        (val, str(rma_number).strip()),
    )
    return cur.rowcount


def update_fecha_recibido_by_rma_number(
    conn: sqlite3.Connection, rma_number: str, fecha_recibido: str | None
) -> int:
    """Actualiza la fecha recibido de todos los ítems del RMA (YYYY-MM-DD o vacío)."""
    val = (fecha_recibido or "").strip()[:10] or None
    cur = conn.execute(
        "UPDATE rma_items SET date_received = ? WHERE rma_number = ?",
        (val, str(rma_number).strip()),
    )
    return cur.rowcount


def update_estado_by_rma_numbers(
    conn: sqlite3.Connection, rma_numbers: list[str], estado: str
) -> int:
    """Actualiza el estado de todos los ítems de los RMAs indicados."""
    estado = (estado or "").strip()
    if not rma_numbers:
        return 0
    placeholders = ",".join("?" * len(rma_numbers))
    cur = conn.execute(
        f"UPDATE rma_items SET estado = ? WHERE rma_number IN ({placeholders})",
        [estado] + [str(n).strip() for n in rma_numbers],
    )
    return cur.rowcount


def set_hidden_by_rma_number(
    conn: sqlite3.Connection,
    rma_number: str,
    hidden: bool,
    hidden_by: str | None = None,
) -> int:
    rma = str(rma_number).strip()
    if hidden:
        cur = conn.execute(
            """UPDATE rma_items SET hidden = 1, hidden_by = ?, hidden_at = datetime('now')
               WHERE rma_number = ?""",
            (hidden_by.strip() if hidden_by else None, rma),
        )
    else:
        cur = conn.execute(
            "UPDATE rma_items SET hidden = 0 WHERE rma_number = ?",
            (rma,),
        )
    return cur.rowcount


# --- Grupos de clientes (unificar sin modificar rma_items) ---


def get_client_groups(conn: sqlite3.Connection) -> list[dict]:
    """Devuelve todos los grupos: { id, canonical_name, canonical_email, canonical_phone, members: [ { client_name, client_email }, ... ] }."""
    cur = conn.execute(
        "SELECT id, canonical_name, canonical_email, canonical_phone FROM client_groups ORDER BY id"
    )
    groups = []
    for row in cur.fetchall():
        gid = row[0]
        cur_m = conn.execute(
            "SELECT client_name, client_email FROM client_group_members WHERE group_id = ?",
            (gid,),
        )
        members = [
            {"client_name": r[0], "client_email": r[1] or ""}
            for r in cur_m.fetchall()
        ]
        groups.append(
            {
                "id": gid,
                "canonical_name": row[1],
                "canonical_email": row[2] or "",
                "canonical_phone": row[3] or "",
                "members": members,
            }
        )
    return groups


def _norm(s: str) -> str:
    return (s or "").strip()


def _identity_key(name: str, email: str) -> tuple[str, str]:
    return (_norm(name), _norm(email or ""))


def unify_clients(conn: sqlite3.Connection, nombres: list[str]) -> int | None:
    """
    Unifica varios clientes en un grupo. No modifica rma_items: el grupo define qué
    identidades (nombre, email) se muestran bajo el canónico (el que tiene más RMAs).
    Devuelve el id del grupo creado o None si hay menos de 2 identidades.
    """
    nombres = [_norm(n) for n in nombres if _norm(n)]
    if len(nombres) < 2:
        return None

    # Resolver cada nombre a identidades (client_name, client_email)
    # 1) Si existe un grupo con ese canonical_name, usar canonical + members
    # 2) Si no, usar distinct (client_name, client_email) de rma_items con ese nombre
    groups = get_client_groups(conn)
    canon_to_members = {}
    for g in groups:
        key = _identity_key(g["canonical_name"], g["canonical_email"])
        canon_to_members[key] = [
            _identity_key(m["client_name"], m["client_email"]) for m in g["members"]
        ]

    identities = set()
    for nom in nombres:
        # ¿Es canonical de algún grupo?
        found_group = False
        for g in groups:
            if _norm(g["canonical_name"]) == nom:
                key = _identity_key(g["canonical_name"], g["canonical_email"])
                identities.add(key)
                for m in g["members"]:
                    identities.add(_identity_key(m["client_name"], m["client_email"]))
                found_group = True
                break
        if not found_group:
            cur = conn.execute(
                """SELECT client_name, client_email FROM rma_items
                   WHERE TRIM(COALESCE(client_name, '')) = ?
                   GROUP BY TRIM(COALESCE(client_name, '')), TRIM(COALESCE(client_email, ''))""",
                (nom,),
            )
            for row in cur.fetchall():
                identities.add(_identity_key(row[0], row[1]))

    if len(identities) < 2:
        return None

    # Contar RMAs por identidad (solo visibles: no hidden)
    cur = conn.execute(
        """SELECT client_name, client_email, COUNT(*) FROM rma_items
           WHERE hidden = 0 GROUP BY TRIM(COALESCE(client_name, '')), TRIM(COALESCE(client_email, ''))"""
    )
    counts = {}
    for row in cur.fetchall():
        key = _identity_key(row[0], row[1])
        counts[key] = counts.get(key, 0) + row[2]

    # Canonical = identidad con más RMAs (de las que estamos uniendo)
    canonical = max((k for k in identities if k in counts), key=lambda k: counts.get(k, 0))
    canon_name, canon_email = canonical

    # Obtener teléfono del canónico desde rma_items
    cur = conn.execute(
        """SELECT client_phone FROM rma_items
           WHERE TRIM(COALESCE(client_name, '')) = ? AND TRIM(COALESCE(client_email, '')) = ?
           LIMIT 1""",
        (canon_name, canon_email),
    )
    row = cur.fetchone()
    canon_phone = row[0] if row else None

    # Quitar de grupos antiguos todas estas identidades
    for name, email in identities:
        conn.execute(
            "DELETE FROM client_group_members WHERE TRIM(COALESCE(client_name, '')) = ? AND TRIM(COALESCE(client_email, '')) = ?",
            (name, email),
        )
    # Borrar grupos cuyo canónico está en identities (se reemplazan por el nuevo)
    for name, email in identities:
        conn.execute(
            "DELETE FROM client_groups WHERE TRIM(COALESCE(canonical_name, '')) = ? AND TRIM(COALESCE(canonical_email, '')) = ?",
            (name, email),
        )

    # Crear nuevo grupo
    cur = conn.execute(
        "INSERT INTO client_groups (canonical_name, canonical_email, canonical_phone) VALUES (?, ?, ?)",
        (canon_name, canon_email, canon_phone or ""),
    )
    group_id = cur.lastrowid
    for name, email in identities:
        if (name, email) == canonical:
            continue
        conn.execute(
            "INSERT OR IGNORE INTO client_group_members (group_id, client_name, client_email) VALUES (?, ?, ?)",
            (group_id, name, email),
        )
    return group_id


def remove_member_from_group(
    conn: sqlite3.Connection, group_id: int, client_name: str, client_email: str
) -> bool:
    """Quita un miembro del grupo. Devuelve True si se eliminó alguna fila."""
    name = _norm(client_name)
    email = _norm(client_email or "")
    cur = conn.execute(
        """DELETE FROM client_group_members
           WHERE group_id = ? AND TRIM(COALESCE(client_name, '')) = ? AND TRIM(COALESCE(client_email, '')) = ?""",
        (group_id, name, email),
    )
    return cur.rowcount > 0


# --- Productos RMA y garantía ---


def _parse_date(value) -> date | None:
    """Convierte valor de fecha (str o date) a date; devuelve None si no es válida."""
    if value is None:
        return None
    if isinstance(value, date):
        return value
    s = (value or "").strip()[:10]
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def get_productos_rma(conn: sqlite3.Connection) -> list[dict]:
    """
    Lista por número de serie completo (clave primaria): cada fila es un serial
    con product_name, count, first_date, last_date, clients_sample y garantia_vigente.
    Misma fuente que lista RMA (rma_items). Una sola consulta de ítems para evitar N+1.
    """
    cur = conn.execute(
        """SELECT
               TRIM(COALESCE(serial, '')) AS serial_key,
               MAX(product) AS product_name,
               COUNT(*) AS count,
               MIN(date_received) AS first_date,
               MAX(date_received) AS last_date,
               GROUP_CONCAT(DISTINCT TRIM(COALESCE(client_name, ''))) AS clients_sample
           FROM rma_items
           WHERE hidden = 0 AND TRIM(COALESCE(serial, '')) != ''
           GROUP BY TRIM(COALESCE(serial, ''))
           ORDER BY serial_key"""
    )
    rows = cur.fetchall()
    cur = conn.execute("SELECT serial, warranty_valid FROM serial_warranty")
    warranty_map = {row[0]: bool(row[1]) for row in cur.fetchall()}
    serial_keys = [(row[0] or "").strip() for row in rows if (row[0] or "").strip()]
    items_by_serial = {}
    if serial_keys:
        placeholders = ",".join("?" * len(serial_keys))
        cur = conn.execute(
            f"""SELECT id, rma_number, product, serial, client_name, client_email, client_phone,
                      date_received, averia, observaciones, estado, hidden, hidden_by, hidden_at,
                      date_pickup, date_sent
               FROM rma_items
               WHERE hidden = 0 AND TRIM(COALESCE(serial, '')) IN ({placeholders})
               ORDER BY TRIM(COALESCE(serial, '')), date_received, id""",
            serial_keys,
        )
        for r in cur.fetchall():
            sk = (r[3] or "").strip()
            if sk not in items_by_serial:
                items_by_serial[sk] = []
            items_by_serial[sk].append(_row_to_api(r))
    today = date.today()
    out = []
    for row in rows:
        serial_key = (row[0] or "").strip()
        if not serial_key:
            continue
        clients = (row[5] or "").split(",")
        clients = [c.strip() for c in clients if c.strip()][:5]
        first_d = _parse_date(row[3])
        vigente = warranty_map.get(serial_key, True)
        if first_d and (today - first_d).days > 3 * 365:
            vigente = False
            set_serial_warranty(conn, serial_key, False)
        items = items_by_serial.get(serial_key, [])
        out.append(
            {
                "serial": serial_key,
                "product_name": row[1] or None,
                "count": row[2],
                "first_date": row[3] or None,
                "last_date": row[4] or None,
                "clients_sample": clients,
                "garantia_vigente": vigente,
                "items": items,
            }
        )
    return out


def set_product_warranty(
    conn: sqlite3.Connection, product_name: str, vigente: bool
) -> None:
    """Establece si la garantía del producto (por nombre) está vigente. Mantenido por compatibilidad."""
    name = (product_name or "").strip()
    if not name:
        return
    conn.execute(
        """INSERT INTO product_warranty (product_name, warranty_valid)
           VALUES (?, ?) ON CONFLICT(product_name) DO UPDATE SET warranty_valid = ?""",
        (name, 1 if vigente else 0, 1 if vigente else 0),
    )


def set_serial_warranty(
    conn: sqlite3.Connection, serial: str, vigente: bool
) -> None:
    """Establece si la garantía del producto (por número de serie) está vigente (por defecto True)."""
    s = (serial or "").strip()
    if not s:
        return
    conn.execute(
        """INSERT INTO serial_warranty (serial, warranty_valid)
           VALUES (?, ?) ON CONFLICT(serial) DO UPDATE SET warranty_valid = ?""",
        (s, 1 if vigente else 0, 1 if vigente else 0),
    )


# --- Settings (paths QNAP, Excel) ---


def get_setting(conn: sqlite3.Connection, key: str) -> str | None:
    """Obtiene el valor de una clave de configuración (ej: PRODUCTOS_CATALOG_PATH)."""
    cur = conn.execute("SELECT value FROM settings WHERE key = ?", (key.strip(),))
    row = cur.fetchone()
    return row[0] if row and row[0] is not None else None


def set_setting(conn: sqlite3.Connection, key: str, value: str | None) -> None:
    """Guarda el valor de una clave de configuración."""
    k = key.strip()
    v = (value or "").strip() or None
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (k, v),
    )
