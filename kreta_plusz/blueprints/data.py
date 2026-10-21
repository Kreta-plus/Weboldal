"""Adatok: gyorsítótárazott, udvarias KRÉTA-lekérdezések."""
import datetime as dt

from flask import Blueprint, g, jsonify, request

from .. import db, kreta, security

bp = Blueprint("data", __name__, url_prefix="/api/data")

BUNDLE = ("tanulo", "jegyek", "orarend", "mulasztasok", "hazi", "szamonkeres", "feljegyzesek")


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
    """Mindent egyben ad (kezdőképernyőhöz). Elemenként hibatűrő."""
    force = request.args.get("force") == "1"
    out = {}
    for what in BUNDLE:
        try:
            out[what] = kreta.fetch(g.user["id"], what, _defaults(what, {}), force)
            if what == "tanulo":
                _remember_name(g.user["id"], out[what]["data"])
        except kreta.KretaError as e:
            if e.code == "relogin":
                return jsonify(error=e.msg, code="relogin"), 401
            out[what] = {"error": e.msg, "code": e.code}
    return jsonify(items=out)


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
