"""Belépés: KRÉTA-fiókkal (a KRÉTA saját oldalán vagy jelszóval), teszt fiókkal; kilépés, fiók törlése.

A munkamenet és a KRÉTA-tokenek a titkosított sütiben vannak (security.py); a lejáratot belépéskor a tanár választja.
"""
import secrets
import time
from urllib.parse import parse_qs, urlparse

import requests
from flask import Blueprint, g, jsonify, make_response, request

from .. import config as C
from .. import db, kreta_client, security
from . import feedback

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

# a KRÉTA-oldali belépésre váró böngészők: pid -> (verifier, mikor)
_pending = {}
PID_COOKIE = "kt_pid"


TERMS_ERROR = "A belépéshez fogadd el az Általános Szerződési Feltételeket"


def _terms(d):
    return d.get("terms") is True


def _start(uid, d, tokens=None):
    """Belépés: a süti a kérés végén megy ki (security.save_session), a választott lejárattal."""
    security.begin_session(uid, d.get("keep"), tokens)
    return make_response(jsonify(ok=True))


def _client_ip():
    return request.remote_addr or "?"


@bp.get("/info")
def info():
    return jsonify(demo=C.DEMO_ENABLED, kreta=C.KRETA_READY, link=C.KRETA_READY and bool(C.TEACHER_REDIRECT_URI), feedback=feedback.kinds())


@bp.post("/login")
def login():
    """Valódi tanári belépés. A jelszó csak a KRÉTA felé megy, nem tároljuk; csak a titkosított token marad."""
    if not C.KRETA_READY:
        return jsonify(error="A valódi KRÉTA-belépés ki van kapcsolva (KT_KRETA=0)"), 403
    d = request.get_json(silent=True) or {}
    user, pw, inst = (d.get("user") or "").strip(), d.get("pass") or "", (d.get("inst") or "").strip().lower()
    if not (user and pw and inst):
        return jsonify(error="Töltsd ki az összes mezőt"), 400
    if not _terms(d):
        return jsonify(error=TERMS_ERROR, code="terms"), 400
    keys = (f"ip:{_client_ip()}", f"u:{inst}:{user.lower()}")
    if security.too_many_attempts(*keys):
        return jsonify(error="Túl sok próbálkozás, várj pár percet", code="throttle"), 429
    security.record_attempt(*keys)
    try:
        kreta_client.base_url(inst)
        j = kreta_client.login(user, pw, inst)
    except kreta_client.KretaError as e:
        return jsonify(error=e.msg, code=e.code), e.status
    security.clear_attempts(*keys)
    return _start(kreta_client.save_user(inst, user, j), d, j)


# ---- belépés a KRÉTA saját oldalán: a végén kapott címet a tanár beilleszti ----
@bp.get("/link/start")
def link_start():
    if not (C.KRETA_READY and C.TEACHER_REDIRECT_URI):
        return jsonify(error="A KRÉTA-oldali belépés nincs beállítva"), 403
    verifier, challenge, state = kreta_client.new_pkce()
    pid, now = secrets.token_hex(16), time.time()
    for k in [k for k, v in _pending.items() if now - v[1] > 900]:
        _pending.pop(k, None)
    _pending[pid] = (verifier, now)
    resp = make_response(jsonify(url=kreta_client.authorize_url(challenge, state)))
    resp.set_cookie(PID_COOKIE, pid, httponly=True, samesite="Lax", secure=request.is_secure, path="/api/auth", max_age=900)
    return resp


@bp.post("/link/finish")
def link_finish():
    d = request.get_json(silent=True) or {}
    pid = request.cookies.get(PID_COOKIE, "")
    if pid not in _pending:
        return jsonify(error="Előbb kattints a „Belépés a KRÉTA-ban” gombra."), 400
    raw = (d.get("url") or "").strip()
    q = parse_qs(urlparse(raw).query)
    if q.get("error"):
        return jsonify(error=f"A KRÉTA hibát adott vissza: {q['error'][0]}. Kattints újra a „Belépés a KRÉTA-ban” gombra."), 400
    code = (q.get("code") or [""])[0]
    if not code:
        return jsonify(error="Nem találtam kódot a címben. A cím végén ?code=… kell legyen."), 400
    if not _terms(d):
        return jsonify(error=TERMS_ERROR, code="terms"), 400
    key = f"ip:{_client_ip()}"
    if security.too_many_attempts(key):
        return jsonify(error="Túl sok próbálkozás, várj pár percet", code="throttle"), 429
    security.record_attempt(key)
    # a kód és a hozzá tartozó belépés is csak egyszer használható
    verifier = _pending.pop(pid)[0]
    try:
        r, j = kreta_client.exchange_code(code, verifier)
    except requests.RequestException as e:
        return jsonify(error="A KRÉTA nem elérhető", detail=str(e)), 502
    if not r.ok or "access_token" not in j:
        print(f"[KRÉTA] kódbeváltás: {r.status_code} {str(j)[:300]}")
        return jsonify(error="A kód beváltása nem sikerült (lejárt vagy már felhasznált kód). Kattints újra a „Belépés a KRÉTA-ban” gombra."), 401
    inst = kreta_client.institute(j) or ""
    if not inst:
        return jsonify(error="A KRÉTA nem adta meg az iskola azonosítóját, ezzel a fiókkal így nem lehet belépni."), 502
    try:
        kreta_client.check_teacher(j)
        kreta_client.base_url(inst)
    except kreta_client.KretaError as e:
        return jsonify(error=e.msg, code=e.code), e.status
    security.clear_attempts(key)
    resp = _start(kreta_client.save_user(inst, None, j), d, j)
    resp.delete_cookie(PID_COOKIE, path="/api/auth")
    return resp


@bp.post("/demo")
def demo_login():
    """Teszt fiók: minden belépés új, különálló iskolát generál (jelszó és KRÉTA nélkül)."""
    if not C.DEMO_ENABLED:
        return jsonify(error="A teszt fiók ki van kapcsolva"), 403
    d = request.get_json(silent=True) or {}
    if not _terms(d):
        return jsonify(error=TERMS_ERROR, code="terms"), 400
    key = f"demo:{_client_ip()}"
    if security.too_many_attempts(key):
        return jsonify(error="Túl sok teszt fiók, várj pár percet", code="throttle"), 429
    security.record_attempt(key)
    now = time.time()
    db.run("DELETE FROM users WHERE inst=? AND created<?", (C.DEMO_INST, now - 7 * 86400))
    uid = db.run(
        "INSERT INTO users(ukey,inst,username,name,created,last_login) VALUES(?,?,?,?,?,?)",
        (f"demo:{secrets.token_hex(8)}", C.DEMO_INST, "teszt", None, now, now),
    ).lastrowid
    return _start(uid, d)


@bp.get("/me")
def me():
    row = security.load_session()
    if not row:
        return jsonify(loggedIn=False)
    s = security.current()
    return jsonify(loggedIn=True, user={"id": row["id"], "inst": row["inst"], "demo": row["inst"] == C.DEMO_INST,
                                        "session": {"created": s["c"], "expires": s["e"] or None, "keep": s["k"]}})


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
