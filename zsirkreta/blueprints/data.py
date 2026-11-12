"""Adatok: gyorsítótárazott, udvarias KRÉTA-lekérdezések."""
import datetime as dt
import threading
import time

from flask import Blueprint, g, jsonify, request

from .. import config as C
from .. import db, demo, kreta, security

bp = Blueprint("data", __name__, url_prefix="/api/data")

BUNDLE = ("tanulo", "jegyek", "orarend", "mulasztasok", "hazi", "szamonkeres", "feljegyzesek")
NO_FORCE = {"tanulo"}  # az adatlap ritkán változik: a frissítés ezt nem kéri le újra, csak ha lejárt

# Kényszerített frissítés (gomb vagy percenkénti automatikus) felhasználónként legfeljebb FORCE_MIN_AGE mp-enként.
# Az időt a frissítés VÉGÉN is beírjuk, így a következő körre minden elem elég régi lesz ahhoz, hogy újra lekérjük.
_last_force = {}
_force_guard = threading.Lock()


def _force_wait(uid):
    return max(0.0, _last_force.get(uid, 0) + C.FORCE_MIN_AGE - time.time())


def _iso(d):
    return d.strftime("%Y-%m-%d")


def _defaults(what, args):
    """Hiányzó dátumparaméterek pótlása észszerű alapértékekkel."""
    p = {k: v for k, v in args.items() if k in ("datumTol", "datumIg")}
    today = dt.date.today()
    if what == "orarend" and "datumTol" not in p:
        mon = today - dt.timedelta(days=today.weekday())
        p["datumTol"], p["datumIg"] = _iso(mon), _iso(mon + dt.timedelta(days=6))
    elif what == "hazi" and "datumTol" not in p:
        p["datumTol"] = _iso(today - dt.timedelta(days=21))
    elif what == "szamonkeres" and "datumTol" not in p:
        p["datumTol"] = _iso(today - dt.timedelta(days=60))
    return p


def _remember_name(uid, tanulo):
    nev = (tanulo or {}).get("Nev") if isinstance(tanulo, dict) else None
    if nev:
        db.run("UPDATE users SET name=? WHERE id=?", (nev, uid))


@bp.get("/bundle")
@security.login_required
def bundle():
    """Mindent egyben ad (kezdőképernyőhöz). Elemenként hibatűrő.

    force=1: friss adat a KRÉTA-ból, de felhasználónként csak percenként; ha túl korán jön, a tárolt adatot
    adjuk és throttled=true, wait=hány mp múlva lehet újra. refreshed: jött-e bármi ténylegesen a KRÉTA-ból.
    """
    uid = g.user["id"]
    force = throttled = False
    if request.args.get("force") == "1":
        with _force_guard:
            throttled = _force_wait(uid) > 0
            if not throttled:
                force = True
                _last_force[uid] = time.time()
    out = {}
    for what in BUNDLE:
        try:
            out[what] = kreta.fetch(uid, what, _defaults(what, {}), force and what not in NO_FORCE)
            if what == "tanulo":
                _remember_name(uid, out[what]["data"])
        except kreta.KretaError as e:
            if e.code == "relogin":
                return jsonify(error=e.msg, code="relogin"), 401
            out[what] = {"error": e.msg, "code": e.code}
    if force:
        _last_force[uid] = time.time()
    metas = [v["meta"] for v in out.values() if "meta" in v]
    return jsonify(
        items=out,
        refreshed=any(not m["cached"] for m in metas),
        stale=any(m["stale"] for m in metas),
        throttled=throttled,
        wait=round(_force_wait(uid)),
        cooldown=round(kreta.cooldown_left(uid)),
        kreta=security.has_kreta() or g.user["inst"] == demo.DEMO_INST,  # false: e-mailes belépés, csak tárolt adat
    )


@bp.get("/<what>")
@security.login_required
def one(what):
    force = request.args.get("force") == "1"
    try:
        res = kreta.fetch(g.user["id"], what, _defaults(what, request.args), force)
    except kreta.KretaError as e:
        return jsonify(error=e.msg, code=e.code, detail=e.detail), e.status
    if what == "tanulo":
        _remember_name(g.user["id"], res["data"])
    return jsonify(res)
