"""Belépés: normál űrlap (tartós munkamenet), kilépés, fiók törlése, tartalék linkes belépés."""
import secrets
import time
from urllib.parse import parse_qs, urlparse

import requests
from flask import Blueprint, g, jsonify, make_response, request

from .. import config as C
from .. import db, demo, kreta, security

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

_pending = {}  # pid -> (verifier, ts)


def _start(uid, remember):
    sid, max_age = security.create_session(uid, remember)
    resp = make_response(jsonify(ok=True))
    resp.set_cookie(
        security.COOKIE, sid, max_age=max_age if remember else None,
        httponly=True, samesite="Lax", secure=request.is_secure, path="/",
    )
    return resp


def _client_ip():
    return request.remote_addr or "?"


@bp.post("/login")
def login():
    d = request.get_json(silent=True) or {}
    user = (d.get("user") or "").strip()
    pw = d.get("pass") or ""
    inst = (d.get("inst") or "").strip()
    remember = bool(d.get("remember", True))
    if not (user and pw and inst):
        return jsonify(error="Töltsd ki az összes mezőt"), 400
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
    return _start(uid, remember)


@bp.post("/demo")
def demo_login():
    """Teszt fiók: minden belépés új, különálló fiók véletlen adatokkal (jelszó és KRÉTA nélkül)."""
    if not C.DEMO_ENABLED:
        return jsonify(error="A teszt fiók ki van kapcsolva"), 403
    key = f"demo:{_client_ip()}"
    if security.too_many_attempts(key):
        return jsonify(error="Túl sok teszt fiók, várj pár percet", code="throttle"), 429
    security.record_attempt(key)
    now = time.time()
    db.run("DELETE FROM users WHERE inst=? AND created<?", (demo.DEMO_INST, now - 7 * 86400))
    uid = db.run(
        "INSERT INTO users(ukey,inst,username,name,created,last_login) VALUES(?,?,?,?,?,?)",
        (f"demo:{secrets.token_hex(8)}", demo.DEMO_INST, "teszt", "Teszt Elek", now, now),
    ).lastrowid
    return _start(uid, True)


@bp.get("/me")
def me():
    row = security.load_session()
    if not row:
        return jsonify(loggedIn=False)
    return jsonify(
        loggedIn=True,
        user={"id": row["id"], "inst": row["inst"], "name": row["name"], "needsLogin": bool(row["needs_login"])},
    )


@bp.post("/logout")
def logout():
    security.destroy_session()
    resp = make_response(jsonify(ok=True))
    resp.delete_cookie(security.COOKIE, path="/")
    return resp


@bp.post("/logout-all")
@security.login_required
def logout_all():
    db.run("DELETE FROM sessions WHERE user_id=?", (g.user["id"],))
    resp = make_response(jsonify(ok=True))
    resp.delete_cookie(security.COOKIE, path="/")
    return resp


@bp.get("/sessions")
@security.login_required
def sessions():
    rows = db.all_("SELECT sid_hash, created, last_seen, ua FROM sessions WHERE user_id=? ORDER BY last_seen DESC", (g.user["id"],))
    cur = g.user["sid_hash"]
    return jsonify([
        {"id": r["sid_hash"][:12], "created": r["created"], "lastSeen": r["last_seen"], "ua": r["ua"], "current": r["sid_hash"] == cur}
        for r in rows
    ])


@bp.post("/account/delete")
@security.login_required
def delete_account():
    db.run("DELETE FROM users WHERE id=?", (g.user["id"],))
    resp = make_response(jsonify(ok=True))
    resp.delete_cookie(security.COOKIE, path="/")
    return resp


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
    p = _pending.pop(request.cookies.get("kp_pid", ""), None)
    if not p:
        return jsonify(error="Előbb kattints a belépés gombra."), 400
    raw = (d.get("url") or "").strip()
    code = (parse_qs(urlparse(raw).query).get("code") or [""])[0]
    if not code and "?" not in raw and "/" not in raw and len(raw) >= 20:
        code = raw
    if not code:
        return jsonify(error="Nem találtam kódot a címben. A cím végén ?code=... kell legyen."), 400
    try:
        r, j = kreta.exchange_code(code, p[0])
    except requests.RequestException as e:
        return jsonify(error="A KRÉTA nem elérhető", detail=str(e)), 502
    if not r.ok or "access_token" not in j:
        return jsonify(error="A kód beváltása nem sikerült", detail=j.get("error_description") or j.get("error")), 401
    inst = (d.get("inst") or "").strip()
    uid = kreta.save_user(inst or "?", None, j)
    return _start(uid, bool(d.get("remember", True)))
