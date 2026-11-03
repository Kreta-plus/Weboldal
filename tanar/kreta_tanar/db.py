"""SQLite réteg: felhasználók, munkamenetek, beállítások, teszt adatok, műveletek és műveletnapló."""
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
    refresh_enc TEXT,                      -- titkosítva (Fernet), a valódi belépéshez
    access_enc  TEXT,
    access_exp  REAL DEFAULT 0,
    created     REAL NOT NULL,
    last_login  REAL
);
CREATE TABLE IF NOT EXISTS sessions (
    sid_hash  TEXT PRIMARY KEY,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created   REAL NOT NULL,
    last_seen REAL NOT NULL,
    expires   REAL NOT NULL,
    ua        TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
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


def init():
    conn().executescript(SCHEMA)
    conn().commit()


def all_(sql, args=()):
    return conn().execute(sql, args).fetchall()


def one(sql, args=()):
    return conn().execute(sql, args).fetchone()


def run(sql, args=()):
    c = conn()
    cur = c.execute(sql, args)
    c.commit()
    return cur
