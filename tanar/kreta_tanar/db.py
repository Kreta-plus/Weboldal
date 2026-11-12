"""SQLite réteg: felhasználók, beállítások, teszt adatok, műveletek és műveletnapló.

A munkamenetek és a KRÉTA-tokenek nincsenek itt: titkosítva a böngésző sütijében vannak (security.py).
"""
import sqlite3
import threading

from .config import DB_PATH

_local = threading.local()

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ukey        TEXT UNIQUE NOT NULL,      -- inst:azonosító, teszt fióknál demo:<hex>
    inst        TEXT NOT NULL,
    username    TEXT,
    name        TEXT,
    created     REAL NOT NULL,
    last_login  REAL,
    gen         INTEGER NOT NULL DEFAULT 0  -- „kilépés mindenhonnan” számláló: a régebbi sütik érvénytelenek
);
CREATE TABLE IF NOT EXISTS prefs (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    body    TEXT NOT NULL,
    updated REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (
    akey TEXT NOT NULL,
    ts   REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts ON attempts(akey, ts);
-- KRÉTA-válaszok gyorsítótára (udvarias lekérdezés)
CREATE TABLE IF NOT EXISTS cache (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ckey       TEXT NOT NULL,
    body       TEXT NOT NULL,
    fetched_at REAL NOT NULL,
    PRIMARY KEY (user_id, ckey)
);
-- teszt fiók: a generált „iskola” egy JSON-ban; a műveletek ezt módosítják
CREATE TABLE IF NOT EXISTS demo_state (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    body    TEXT NOT NULL,
    updated REAL NOT NULL
);
-- jóváhagyásra váró műveletek: egy token egyszer használható fel
CREATE TABLE IF NOT EXISTS pending_ops (
    token   TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    op      TEXT NOT NULL,
    payload TEXT NOT NULL,
    created REAL NOT NULL
);
-- műveletnapló: minden elküldött művelet, sikeres és sikertelen is
CREATE TABLE IF NOT EXISTS audit (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ts        REAL NOT NULL,
    op        TEXT NOT NULL,
    title     TEXT NOT NULL,
    payload   TEXT NOT NULL,
    status    TEXT NOT NULL,               -- ok | unverified | error
    detail    TEXT,
    simulated INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit(user_id, ts);
"""


def conn():
    c = getattr(_local, "c", None)
    if c is None:
        c = sqlite3.connect(str(DB_PATH), timeout=15)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA foreign_keys=ON")
        _local.c = c
    return c


# régebbi adatbázisokba utólag felvett oszlopok: (tábla, oszlop, típus)
MIGRATIONS = [
    ("users", "gen", "INTEGER NOT NULL DEFAULT 0"),
]
# a belépési adatok régen az adatbázisban voltak, most a sütiben: ezeket egyszer, véglegesen töröljük
LEGACY_COLUMNS = ("refresh_enc", "access_enc", "access_exp")


def init():
    c = conn()
    c.executescript(SCHEMA)
    for table, col, typ in MIGRATIONS:
        if col not in {r["name"] for r in c.execute(f"PRAGMA table_info({table})")}:
            c.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
    c.commit()
    cols = {r["name"] for r in c.execute("PRAGMA table_info(users)")}
    legacy = [col for col in LEGACY_COLUMNS if col in cols]
    if legacy or c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sessions'").fetchone():
        c.execute("DROP TABLE IF EXISTS sessions")
        for col in legacy:
            c.execute(f"ALTER TABLE users DROP COLUMN {col}")
        c.commit()
        c.execute("VACUUM")  # a törölt tokenek a fájl szabad lapjain se maradjanak meg ...
        c.execute("PRAGMA wal_checkpoint(TRUNCATE)")  # ... és a WAL-ban se


def all_(sql, args=()):
    return conn().execute(sql, args).fetchall()


def one(sql, args=()):
    return conn().execute(sql, args).fetchone()


def run(sql, args=()):
    c = conn()
    cur = c.execute(sql, args)
    c.commit()
    return cur
