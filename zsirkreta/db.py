"""SQLite réteg: felhasználók, gyorsítótár, beállítások, belépési próbák, oldalbeállítások.

A munkamenetek és a KRÉTA-tokenek nincsenek itt: titkosítva a böngésző sütijében vannak (security.py).
"""
import sqlite3
import threading

from .config import DB_PATH

_local = threading.local()

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ukey        TEXT UNIQUE NOT NULL,      -- inst:sub (vagy inst:felhasználónév)
    inst        TEXT NOT NULL,
    username    TEXT,
    name        TEXT,
    created     REAL NOT NULL,
    last_login  REAL,
    email       TEXT,                      -- e-mailes belépés (kisbetűsen), visszaigazolás nélkül
    pw_hash     TEXT,                      -- az e-mailes belépés jelszava (scrypt)
    admin       INTEGER DEFAULT 0,         -- fejlesztő: fejlesztői címet a fejlesztői kóddal csatolt
    gen         INTEGER NOT NULL DEFAULT 0, -- „kilépés mindenhonnan” számláló: a régebbi sütik érvénytelenek
    last_seen   REAL                       -- utolsó aktivitás (a fejlesztői statisztikához)
);
CREATE TABLE IF NOT EXISTS cache (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ckey       TEXT NOT NULL,
    body       TEXT NOT NULL,
    fetched_at REAL NOT NULL,
    PRIMARY KEY (user_id, ckey)
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
CREATE TABLE IF NOT EXISTS site (
    key     TEXT PRIMARY KEY,
    body    TEXT NOT NULL,
    updated REAL NOT NULL
);
"""

# régebbi adatbázisokba utólag felvett oszlopok: (tábla, oszlop, típus)
MIGRATIONS = [
    ("users", "email", "TEXT"),
    ("users", "pw_hash", "TEXT"),
    ("users", "admin", "INTEGER DEFAULT 0"),
    ("users", "gen", "INTEGER NOT NULL DEFAULT 0"),
    ("users", "last_seen", "REAL"),
]
# a belépési adatok régen az adatbázisban voltak, most a sütiben: ezeket egyszer, véglegesen töröljük
LEGACY_COLUMNS = ("refresh_enc", "access_enc", "access_exp", "needs_login")


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
    c = conn()
    c.executescript(SCHEMA)
    for table, col, typ in MIGRATIONS:
        if col not in {r["name"] for r in c.execute(f"PRAGMA table_info({table})")}:
            c.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
    c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)")
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
