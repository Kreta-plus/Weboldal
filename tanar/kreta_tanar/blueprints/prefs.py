"""Felhasználói beállítások (téma, kiemelő szín, kezdőoldal), szerveroldali ellenőrzéssel."""
import json
import re
import time

from flask import Blueprint, g, jsonify, request

from .. import db, security

bp = Blueprint("prefs", __name__, url_prefix="/api/prefs")

DEFAULTS = {"theme": "dark", "palette": "desk", "accent": "#ffe14d", "radius": 16, "fontScale": 1, "startView": "dashboard",
            "confirmBulk": True}
THEMES = ("dark", "amoled", "light", "auto")
PALETTES = ("desk", "ocean", "forest", "grape", "rose", "slate", "midnight", "sunset", "teal", "sand", "ice", "neon")
VIEWS = ("dashboard", "timetable", "gradebook", "attendance", "journal", "homework", "notes", "tests", "classes", "log", "settings")


def sanitize(p):
    out = dict(DEFAULTS)
    if not isinstance(p, dict):
        return out
    if p.get("theme") in THEMES:
        out["theme"] = p["theme"]
    if p.get("palette") in PALETTES:
        out["palette"] = p["palette"]
    if isinstance(p.get("accent"), str) and re.fullmatch(r"#[0-9a-fA-F]{6}", p["accent"]):
        out["accent"] = p["accent"].lower()
    if isinstance(p.get("radius"), (int, float)):
        out["radius"] = max(0, min(28, int(p["radius"])))
    if isinstance(p.get("fontScale"), (int, float)):
        out["fontScale"] = max(0.85, min(1.3, round(float(p["fontScale"]), 2)))
    if p.get("startView") in VIEWS:
        out["startView"] = p["startView"]
    if isinstance(p.get("confirmBulk"), bool):
        out["confirmBulk"] = p["confirmBulk"]
    return out


@bp.get("")
@security.login_required
def get_prefs():
    row = db.one("SELECT body FROM prefs WHERE user_id=?", (g.user["id"],))
    return jsonify(sanitize(json.loads(row["body"]) if row else {}))


@bp.put("")
@security.login_required
def put_prefs():
    p = sanitize(request.get_json(silent=True))
    db.run("INSERT INTO prefs(user_id,body,updated) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET body=excluded.body, updated=excluded.updated",
           (g.user["id"], json.dumps(p), time.time()))
    return jsonify(p)
