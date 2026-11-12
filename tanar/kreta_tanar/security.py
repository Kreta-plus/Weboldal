"""Titkosítás, munkamenetek (titkosított sütiben), belépési korlát, CSRF-védelem (a diák verzióéval azonos)."""
import hashlib
import json
import os
import time
import zlib
from functools import wraps

from cryptography.fernet import Fernet, InvalidToken
from flask import g, jsonify, request

from . import db
from .config import KEY_PATH, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW, SESSION_CHOICES, SESSION_DEFAULT

COOKIE = "kt_sid"
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


# ---------- munkamenetek: minden a titkosított sütiben, a szerveren nincs tárolva ----------
# A süti tartalma Fernettel titkosított és aláírt JSON (a böngésző nem tudja se olvasni, se módosítani):
#   u: felhasználó, g: a „kilépés mindenhonnan” számláló a belépéskor, c: belépés ideje, k: választott időtartam,
#   e: lejárat (0 = soha), w: a süti utolsó kiírása; a KRÉTA-tokenek: rt (megújító), at (hozzáférési), ax (ennek lejárata).
# A tokenek megújításakor és a „soha” lejárat csúsztatásakor a kérés végén új süti megy ki (save_session).
COOKIE_MAX_AGE = 400 * 86400  # a böngészők ennél tovább nem tartanak meg sütit, a „soha” ezt csúsztatja
RENEW_AFTER = 7 * 86400       # a „soha” lejáratú süti ennyi idő után újra kiíródik
COOKIE_LIMIT = 3900           # a böngészők a kb. 4 KB-nál nagyobb sütit eldobják
_spill = {}                   # sha256(rt) -> (at, ax): ha a süti túl nagy lenne, a hozzáférési token csak a memóriában marad


def _pack(sess):
    return _get_fernet().encrypt(zlib.compress(json.dumps(sess, separators=(",", ":")).encode())).decode()


def _unpack(raw):
    try:
        sess = json.loads(zlib.decompress(_get_fernet().decrypt(raw.encode())))
    except (InvalidToken, ValueError, zlib.error):
        return None
    return sess if isinstance(sess, dict) and isinstance(sess.get("u"), int) else None


def _rt_key(rt):
    return hashlib.sha256(rt.encode()).hexdigest()


def token_fields(j):
    """A KRÉTA token-válaszából a sütibe kerülő mezők. Ha nem jött új megújító token, a régi marad."""
    t = {"at": j["access_token"], "ax": int(time.time() + float(j.get("expires_in", 3000)) - 30)}
    if j.get("refresh_token"):
        t["rt"] = j["refresh_token"]
    return t


def begin_session(user_id, keep, tokens=None):
    """Új belépés: a válaszban kimegy a süti. keep: a SESSION_CHOICES egyik kulcsa."""
    keep = keep if keep in SESSION_CHOICES else SESSION_DEFAULT
    now = int(time.time())
    row = db.one("SELECT gen FROM users WHERE id=?", (user_id,))
    sess = {"u": user_id, "g": row["gen"] if row else 0, "c": now, "k": keep, "e": now + SESSION_CHOICES[keep] if SESSION_CHOICES[keep] else 0}
    if tokens:
        sess.update(token_fields(tokens))
    g.sess, g.sess_dirty, g.sess_end = sess, True, False
    return sess


def session_changed():
    """A munkamenet (pl. a megújított KRÉTA-token) a kérés végén új sütiként megy ki."""
    g.sess_dirty = True


def end_session():
    """Kilépés: a kérés végén a süti törlődik."""
    g.sess, g.sess_end = None, True


def current():
    """A kérés munkamenete (a sütiből), a load_session után."""
    return g.get("sess")


def has_kreta(sess=None):
    sess = sess if sess is not None else current()
    return bool(sess and (sess.get("rt") or sess.get("at")))


def access_token(sess):
    """A még érvényes hozzáférési token, ha van."""
    at, ax = sess.get("at"), sess.get("ax", 0)
    if not at and sess.get("rt"):
        at, ax = _spill.get(_rt_key(sess["rt"]), (None, 0))
    return at if at and ax > time.time() else None


def drop_tokens(sess):
    for k in ("rt", "at", "ax"):
        sess.pop(k, None)
    session_changed()


def save_session(resp):
    """A kérés végén: belépésnél, token-megújításnál vagy a lejárat csúsztatásánál kiírja, kilépésnél törli a sütit."""
    if g.get("sess_end"):
        resp.delete_cookie(COOKIE, path="/", httponly=True, samesite="Lax", secure=request.is_secure)
        return resp
    sess = g.get("sess")
    if not (sess and g.get("sess_dirty")):
        return resp
    now = int(time.time())
    sess["w"] = now
    raw = _pack(sess)
    if len(raw) > COOKIE_LIMIT and sess.get("rt") and sess.get("at"):
        for k in [k for k, v in _spill.items() if v[1] < now]:
            _spill.pop(k, None)
        _spill[_rt_key(sess["rt"])] = (sess["at"], sess.get("ax", 0))
        raw = _pack({k: v for k, v in sess.items() if k not in ("at", "ax")})
        print(f"[munkamenet] a süti túl nagy lenne ({len(raw)} B), a hozzáférési token csak a memóriában marad")
    resp.set_cookie(
        COOKIE, raw, max_age=max(0, sess["e"] - now) if sess["e"] else COOKIE_MAX_AGE,
        httponly=True, samesite="Lax", secure=request.is_secure, path="/",
    )
    return resp


_NONE = object()


def load_session():
    """Beolvassa a sütiből a munkamenetet (g.sess); visszaad: user sor vagy None. Kérésenként egyszer olvas."""
    cached = g.get("_user", _NONE)
    if cached is not _NONE:
        return cached
    g._user = None
    raw = request.cookies.get(COOKIE)
    sess = _unpack(raw) if raw else None
    now = time.time()
    if not sess or (sess.get("e") and sess["e"] < now):
        return None
    row = db.one("SELECT * FROM users WHERE id=?", (sess["u"],))
    if not row or row["gen"] != sess.get("g", 0):  # törölt fiók, vagy „kilépés mindenhonnan” óta régi süti
        return None
    g.sess = sess
    if not sess.get("e") and now - sess.get("w", 0) > RENEW_AFTER:
        session_changed()
    g._user = row
    return row


def purge_expired():
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


# ---------- belépési próbák korlátozása ----------
def too_many_attempts(*keys):
    since = time.time() - LOGIN_WINDOW
    for k in keys:
        n = db.one("SELECT COUNT(*) AS n FROM attempts WHERE akey=? AND ts>?", (k, since))["n"]
        if n >= LOGIN_MAX_ATTEMPTS:
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
