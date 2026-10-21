"""Személyes beállítások: nevek, becenevek, tanár- és tantárgynevek, téma, egyedi CSS."""
import json
import re
import time

from flask import Blueprint, g, jsonify, request

from .. import db, security

bp = Blueprint("prefs", __name__, url_prefix="/api/prefs")

DEFAULTS = {
    "displayName": "",
    "nickname": "",
    "emoji": "🎓",
    "theme": "auto",          # auto | dark | light | amoled
    "accent": "#6c5ce7",
    "density": "normal",      # compact | normal | cozy
    "fontScale": 1.0,
    "radius": 16,
    "startView": "dashboard",
    "targetAvg": 4.5,
    "weighted": True,         # súlyozott átlag (SulySzazalekErteke)
    "customCss": "",
    "subjectNames": {},
    "teacherNames": {},
    "subjectGoals": {},
    "hiddenSubjects": [],
    "widgets": ["avg", "next", "grades", "homework", "tests", "absences", "trend", "subjects"],
}

THEMES = {"auto", "dark", "light", "amoled"}
DENSITY = {"compact", "normal", "cozy"}
VIEWS = {"dashboard", "grades", "stats", "timetable", "homework", "absences", "notes", "names", "settings"}


def _str(v, n):
    return v.strip()[:n] if isinstance(v, str) else ""


def _map(v, n=300):
    if not isinstance(v, dict):
        return {}
    out = {}
    for k, val in list(v.items())[:n]:
        if isinstance(k, str) and isinstance(val, str) and val.strip():
            out[k[:120]] = val.strip()[:80]
    return out


def clean_css(css):
    css = _str(css, 20000) if css else ""
    css = re.sub(r"@import[^;]*;?", "", css, flags=re.I)
    css = re.sub(r"expression\s*\(|javascript:|</?style|behavior\s*:|-moz-binding", "", css, flags=re.I)
    # külső url()-k tiltása, csak data: engedett
    css = re.sub(r"url\(\s*['\"]?(?!data:)[^)]*\)", "none", css, flags=re.I)
    return css


def sanitize(d):
    out = dict(DEFAULTS)
    if not isinstance(d, dict):
        return out
    out["displayName"] = _str(d.get("displayName"), 60)
    out["nickname"] = _str(d.get("nickname"), 40)
    out["emoji"] = _str(d.get("emoji"), 8) or DEFAULTS["emoji"]
    out["theme"] = d.get("theme") if d.get("theme") in THEMES else "auto"
    acc = d.get("accent")
    out["accent"] = acc if isinstance(acc, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", acc) else DEFAULTS["accent"]
    out["density"] = d.get("density") if d.get("density") in DENSITY else "normal"
    try:
        out["fontScale"] = min(1.3, max(0.8, float(d.get("fontScale", 1.0))))
        out["radius"] = int(min(28, max(0, float(d.get("radius", 16)))))
        out["targetAvg"] = min(5.0, max(1.0, float(d.get("targetAvg", 4.5))))
    except (TypeError, ValueError):
        pass
    out["startView"] = d.get("startView") if d.get("startView") in VIEWS else "dashboard"
    out["weighted"] = bool(d.get("weighted", True))
    out["customCss"] = clean_css(d.get("customCss"))
    out["subjectNames"] = _map(d.get("subjectNames"))
    out["teacherNames"] = _map(d.get("teacherNames"))
    goals = {}
    if isinstance(d.get("subjectGoals"), dict):
        for k, v in list(d["subjectGoals"].items())[:200]:
            try:
                goals[str(k)[:120]] = min(5.0, max(1.0, float(v)))
            except (TypeError, ValueError):
                pass
    out["subjectGoals"] = goals
    hs = d.get("hiddenSubjects")
    out["hiddenSubjects"] = [_str(x, 120) for x in hs[:200] if isinstance(x, str)] if isinstance(hs, list) else []
    w = d.get("widgets")
    allowed = set(DEFAULTS["widgets"])
    out["widgets"] = [x for x in w if x in allowed] if isinstance(w, list) else DEFAULTS["widgets"]
    return out


@bp.get("")
@security.login_required
def get_prefs():
    row = db.one("SELECT body FROM prefs WHERE user_id=?", (g.user["id"],))
    try:
        data = json.loads(row["body"]) if row else {}
    except ValueError:
        data = {}
    return jsonify(sanitize(data))


@bp.put("")
@security.login_required
def put_prefs():
    clean = sanitize(request.get_json(silent=True))
    db.run(
        "INSERT INTO prefs(user_id,body,updated) VALUES(?,?,?) "
        "ON CONFLICT(user_id) DO UPDATE SET body=excluded.body, updated=excluded.updated",
        (g.user["id"], json.dumps(clean, ensure_ascii=False), time.time()),
    )
    return jsonify(clean)
