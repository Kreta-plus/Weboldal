"""Titkosítás, munkamenetek, e-mailes jelszó, fejlesztői jog, belépési korlát, CSRF-védelem."""
import base64
import hashlib
import hmac
import os
import secrets
import time
from functools import wraps

from cryptography.fernet import Fernet, InvalidToken
from flask import g, jsonify, request

from . import db
from .config import ADMIN_EMAILS, KEY_PATH, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW, SESSION_DAYS

COOKIE = "kp_sid"
_fernet = None


def _get_fernet():
    global _fernet
    if _fernet is None:
        if KEY_PATH.exists():
            key = KEY_PATH.read_bytes().strip()
        else:
            key = Fernet.generate_key()
            KEY_PATH.write_bytes(key)
            try:
                os.chmod(KEY_PATH, 0o600)
            except OSError:
                pass
        _fernet = Fernet(key)
    return _fernet


def enc(text):
    return _get_fernet().encrypt(text.encode()).decode() if text else None


def dec(token):
    if not token:
        return None
    try:
        return _get_fernet().decrypt(token.encode()).decode()
    except (InvalidToken, ValueError):
        return None


# ---------- az e-mailes belépés jelszava (scrypt, sóval) ----------
_SCRYPT = {"n": 2 ** 14, "r": 8, "p": 1, "dklen": 32}


def hash_pw(pw):
    salt = os.urandom(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, **_SCRYPT)
    return f"scrypt${base64.b64encode(salt).decode()}${base64.b64encode(h).decode()}"


def check_pw(pw, stored):
    try:
        algo, salt, h = (stored or "").split("$")
        return algo == "scrypt" and hmac.compare_digest(hashlib.scrypt(pw.encode(), salt=base64.b64decode(salt), **_SCRYPT), base64.b64decode(h))
    except (ValueError, TypeError):
        return False


# nem létező címnél is lefut egy ellenőrzés, hogy a válaszidő ne árulja el, van-e ilyen fiók
DUMMY_HASH = hash_pw(secrets.token_hex(8))


# ---------- munkamenetek ----------
def _h(sid):
    return hashlib.sha256(sid.encode()).hexdigest()


def create_session(user_id, remember=True):
    sid = secrets.token_urlsafe(32)
    now = time.time()
    days = SESSION_DAYS if remember else 1
    db.run(
        "INSERT INTO sessions(sid_hash,user_id,created,last_seen,expires,ua) VALUES(?,?,?,?,?,?)",
        (_h(sid), user_id, now, now, now + days * 86400, (request.headers.get("User-Agent") or "")[:200]),
    )
    return sid, days * 86400


def load_session():
    """Beolvassa a sütiből a munkamenetet; visszaad: user sor vagy None."""
    sid = request.cookies.get(COOKIE)
    if not sid:
        return None
    now = time.time()
    row = db.one(
        "SELECT s.sid_hash, s.expires, s.last_seen, u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.sid_hash=?",
        (_h(sid),),
    )
    if not row or row["expires"] < now:
        if row:
            db.run("DELETE FROM sessions WHERE sid_hash=?", (_h(sid),))
        return None
    if now - row["last_seen"] > 600:
        db.run("UPDATE sessions SET last_seen=? WHERE sid_hash=?", (now, _h(sid)))
    return row


def destroy_session():
    sid = request.cookies.get(COOKIE)
    if sid:
        db.run("DELETE FROM sessions WHERE sid_hash=?", (_h(sid),))


def purge_expired():
    db.run("DELETE FROM sessions WHERE expires < ?", (time.time(),))
    db.run("DELETE FROM attempts WHERE ts < ?", (time.time() - 3600,))


def login_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        row = load_session()
        if not row:
            return jsonify(error="Nem vagy belépve", code="auth"), 401
        g.user = row
        return fn(*a, **kw)

    return wrapper


def is_admin(user):
    """Fejlesztő: fejlesztői e-mail cím, amit a fejlesztői kóddal csatoltak (mindkettő kell)."""
    return bool(user and user["admin"] and user["email"] in ADMIN_EMAILS)


def admin_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        row = load_session()
        if not row:
            return jsonify(error="Nem vagy belépve", code="auth"), 401
        if not is_admin(row):
            return jsonify(error="Ehhez fejlesztői fiók kell"), 403
        g.user = row
        return fn(*a, **kw)

    return wrapper


# ---------- belépési próbák korlátozása ----------
def too_many_attempts(*keys, limit=LOGIN_MAX_ATTEMPTS, window=LOGIN_WINDOW):
    since = time.time() - window
    for k in keys:
        n = db.one("SELECT COUNT(*) AS n FROM attempts WHERE akey=? AND ts>?", (k, since))["n"]
        if n >= limit:
            return True
    return False


def record_attempt(*keys):
    now = time.time()
    for k in keys:
        db.run("INSERT INTO attempts(akey,ts) VALUES(?,?)", (k, now))


def clear_attempts(*keys):
    for k in keys:
        db.run("DELETE FROM attempts WHERE akey=?", (k,))


# ---------- CSRF: csak saját oldalról jöhet módosító kérés ----------
def csrf_check():
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return None
    if request.headers.get("X-KP") != "1":
        return jsonify(error="Érvénytelen kérés"), 400
    origin = request.headers.get("Origin")
    if origin and origin.split("://", 1)[-1] != request.host:
        return jsonify(error="Érvénytelen eredet"), 403
    return None
