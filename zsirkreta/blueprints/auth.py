"""Belépés: normál űrlap, e-mail cím, kilépés, fiók törlése, tartalék linkes belépés.

A munkamenet és a KRÉTA-tokenek a titkosított sütiben vannak (security.py); a lejáratot belépéskor a felhasználó választja.
"""
import hmac
import re
import secrets
import sqlite3
import time
from urllib.parse import parse_qs, urlparse

import requests
from flask import Blueprint, g, jsonify, make_response, request

from .. import config as C
from .. import db, demo, kreta, security, site
from ..config import ADMIN_EMAILS, DEV_CODE

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

_pending = {}  # pid -> (verifier, ts)


TERMS_ERROR = "A belépéshez fogadd el az Általános Szerződési Feltételeket"


def _terms(d):
    return d.get("terms") is True


def _start(uid, d, tokens=None, **extra):
    """Belépés: a süti a kérés végén megy ki (security.save_session), a választott lejárattal."""
    security.begin_session(uid, d.get("keep"), tokens)
    return jsonify(ok=True, **extra)


def _client_ip():
    return request.remote_addr or "?"


@bp.post("/login")
def login():
    d = request.get_json(silent=True) or {}
    user = (d.get("user") or "").strip()
    pw = d.get("pass") or ""
    inst = (d.get("inst") or "").strip()
    if not (user and pw and inst):
        return jsonify(error="Töltsd ki az összes mezőt"), 400
    if not _terms(d):
        return jsonify(error=TERMS_ERROR, code="terms"), 400
    keys = (f"ip:{_client_ip()}", f"u:{inst}:{user.lower()}")
    if security.too_many_attempts(*keys):
        return jsonify(error="Túl sok próbálkozás, várj pár percet", code="throttle"), 429
    security.record_attempt(*keys)
    try:
        j = kreta.login_with_password(user, pw, inst)
    except kreta.KretaError as e:
        return jsonify(error=e.msg, detail=e.detail, code=e.code), e.status
    security.clear_attempts(*keys)
    uid = kreta.save_user(inst, user, j)
    return _start(uid, d, j)


@bp.post("/demo")
def demo_login():
    """Teszt fiók: minden belépés új, különálló fiók véletlen adatokkal (jelszó és KRÉTA nélkül)."""
    if not (C.DEMO_ENABLED and site.get()["demoEnabled"]):
        return jsonify(error="A teszt fiók ki van kapcsolva"), 403
    d = request.get_json(silent=True) or {}
    if not _terms(d):
        return jsonify(error=TERMS_ERROR, code="terms"), 400
    key = f"demo:{_client_ip()}"
    if security.too_many_attempts(key):
        return jsonify(error="Túl sok teszt fiók, várj pár percet", code="throttle"), 429
    security.record_attempt(key)
    now = time.time()
    # a régi teszt fiókok törlődnek, kivéve amihez e-mail címet csatoltak (azt meg akarták tartani)
    db.run("DELETE FROM users WHERE inst=? AND created<? AND email IS NULL", (demo.DEMO_INST, now - 7 * 86400))
    uid = db.run(
        "INSERT INTO users(ukey,inst,username,name,created,last_login) VALUES(?,?,?,?,?,?)",
        (f"demo:{secrets.token_hex(8)}", demo.DEMO_INST, "teszt", "Teszt Elek", now, now),
    ).lastrowid
    return _start(uid, d)


@bp.get("/me")
def me():
    row = security.load_session()
    if not row:
        return jsonify(loggedIn=False)
    s, kr = security.current(), security.has_kreta()
    return jsonify(
        loggedIn=True,
        user={"id": row["id"], "inst": row["inst"], "name": row["name"], "needsLogin": not kr and row["inst"] != demo.DEMO_INST,
              "kreta": kr, "email": row["email"], "admin": security.is_admin(row),
              "session": {"created": s["c"], "expires": s["e"] or None, "keep": s["k"]}},
    )


# ---- e-mailes belépés: a KRÉTA-fiókhoz csatolt e-mail címmel és saját jelszóval (visszaigazolás nincs) ----
EMAIL_RE = re.compile(r"[^@\s]{1,64}@[^@\s]{1,189}\.[^@\s]{2,63}")


def _email(v):
    e = v.strip().lower() if isinstance(v, str) else ""
    return e if EMAIL_RE.fullmatch(e) else ""


@bp.post("/email/login")
def email_login():
    d = request.get_json(silent=True) or {}
    email, pw = _email(d.get("email")), d.get("pass")
    if not email or not isinstance(pw, str) or not pw:
        return jsonify(error="Add meg az e-mail címed és a jelszavad"), 400
    if not _terms(d):
        return jsonify(error=TERMS_ERROR, code="terms"), 400
    keys = (f"ip:{_client_ip()}", f"em:{email}")
    if security.too_many_attempts(*keys):
        return jsonify(error="Túl sok próbálkozás, várj pár percet", code="throttle"), 429
    security.record_attempt(*keys)
    row = db.one("SELECT id, email, pw_hash, admin FROM users WHERE email=?", (email,))
    if not security.check_pw(pw, row["pw_hash"] if row else security.DUMMY_HASH) or not row:
        return jsonify(error="Hibás e-mail cím vagy jelszó"), 401
    security.clear_attempts(*keys)
    db.run("UPDATE users SET last_login=? WHERE id=?", (time.time(), row["id"]))
    return _start(row["id"], d, admin=security.is_admin(row))


@bp.post("/email")
@security.login_required
def email_set():
    """E-mail cím és jelszó csatolása a belépett fiókhoz, vagy a jelszó cseréje."""
    d = request.get_json(silent=True) or {}
    email, pw, me = _email(d.get("email")), d.get("pass"), g.user
    if not email:
        return jsonify(error="Ez nem tűnik e-mail címnek"), 400
    if not isinstance(pw, str) or not 8 <= len(pw) <= 200:
        return jsonify(error="A jelszó legalább 8 karakter legyen"), 400
    if db.one("SELECT 1 FROM users WHERE email=? AND id<>?", (email, me["id"])):
        return jsonify(error="Ez az e-mail cím már egy másik fiókhoz tartozik"), 409
    admin = me["admin"] if email == me["email"] else 0  # a már csatolt saját címnél marad, ami volt
    if email in ADMIN_EMAILS and not admin:
        # fejlesztői cím: visszaigazolás helyett a szerver fejlesztői kódja kell, különben bárki fejlesztő lehetne
        if not DEV_CODE:
            return jsonify(error="Fejlesztői címhez a szerveren be kell állítani a KP_DEV_CODE kódot", code="devcode"), 403
        key = f"dev:{_client_ip()}"
        if security.too_many_attempts(key):
            return jsonify(error="Túl sok próbálkozás, várj pár percet", code="throttle"), 429
        code = d.get("devCode").strip() if isinstance(d.get("devCode"), str) else ""
        if not hmac.compare_digest(code.upper().encode(), DEV_CODE.upper().encode()):  # kis- és nagybetű mindegy
            security.record_attempt(key)
            return jsonify(error="Hibás fejlesztői kód" if code else "Ez fejlesztői cím: add meg a fejlesztői kódot", code="devcode"), 403
        admin = 1
    try:
        db.run("UPDATE users SET email=?, pw_hash=?, admin=? WHERE id=?", (email, security.hash_pw(pw), admin, me["id"]))
    except sqlite3.IntegrityError:  # közben valaki más csatolta ugyanezt
        return jsonify(error="Ez az e-mail cím már egy másik fiókhoz tartozik"), 409
    return jsonify(ok=True, email=email, admin=security.is_admin({"email": email, "admin": admin}))


@bp.post("/email/remove")
@security.login_required
def email_remove():
    db.run("UPDATE users SET email=NULL, pw_hash=NULL, admin=0 WHERE id=?", (g.user["id"],))
    return jsonify(ok=True)


@bp.post("/logout")
def logout():
    security.end_session()
    return jsonify(ok=True)


@bp.post("/logout-all")
@security.login_required
def logout_all():
    """Minden eszközön kiléptet: a számláló növelésével minden eddig kiadott süti érvénytelen lesz."""
    db.run("UPDATE users SET gen=gen+1 WHERE id=?", (g.user["id"],))
    security.end_session()
    return jsonify(ok=True)


@bp.post("/account/delete")
@security.login_required
def delete_account():
    db.run("DELETE FROM users WHERE id=?", (g.user["id"],))
    security.end_session()
    return jsonify(ok=True)


# ---- tartalék: belépés a KRÉTA böngészős oldalán, a végső cím beillesztésével ----
@bp.get("/link/start")
def link_start():
    verifier, challenge, state = kreta.new_pkce()
    pid = secrets.token_hex(16)
    now = time.time()
    for k in [k for k, v in _pending.items() if now - v[1] > 900]:
        _pending.pop(k, None)
    _pending[pid] = (verifier, now)
    resp = make_response(jsonify(url=kreta.authorize_url(challenge, state)))
    resp.set_cookie("kp_pid", pid, httponly=True, samesite="Lax", path="/", max_age=900)
    return resp


@bp.post("/link/finish")
def link_finish():
    d = request.get_json(silent=True) or {}
    pid = request.cookies.get("kp_pid", "")
    if pid not in _pending:
        return jsonify(error="Előbb kattints a „Belépés a KRÉTA-ban” gombra."), 400
    raw = (d.get("url") or "").strip()
    code = (parse_qs(urlparse(raw).query).get("code") or [""])[0]
    if not code and "?" not in raw and "/" not in raw and len(raw) >= 20:
        code = raw
    if not code:
        return jsonify(error="Nem találtam kódot a címben. A cím végén ?code=... kell legyen."), 400
    if not _terms(d):
        return jsonify(error=TERMS_ERROR, code="terms"), 400
    # a kód egyszer használható, innentől a függő belépés is elhasználódik
    p = _pending.pop(pid, None)
    if not p:
        return jsonify(error="Előbb kattints a „Belépés a KRÉTA-ban” gombra."), 400
    try:
        r, j = kreta.exchange_code(code, p[0])
    except requests.RequestException as e:
        return jsonify(error="A KRÉTA nem elérhető", detail=str(e)), 502
    if not r.ok or "access_token" not in j:
        return jsonify(error="A kód beváltása nem sikerült. Kattints újra a „Belépés a KRÉTA-ban” gombra.", detail=j.get("error_description") or j.get("error")), 401
    inst = (d.get("inst") or "").strip()
    uid = kreta.save_user(inst or "?", None, j)
    return _start(uid, d, j)
