"""Visszajelzés: hibabejelentés, ötlet vagy üzenet a csapatnak (mint a diák verzióban).

A hiba és az ötlet a GlitchTipbe kerül (a „Tanári” projektbe), és ha be van állítva, értesítés megy róla a Discordra;
az üzenet csak a Discordra megy. Diákadat (nevek, jegyek, mulasztások) nem kerül bele, csak amit a tanár beír.
"""
import time
import uuid
from urllib.parse import quote

import sentry_sdk
from flask import Blueprint, jsonify, request

from .. import config as C
from .. import db, discord, monitoring, security

bp = Blueprint("feedback", __name__, url_prefix="/api/feedback")

# fajta -> (cím eleje, szint, GlitchTip címke "kind", üzenet túl rövid szövegnél)
KINDS = {
    "bug": ("Hibabejelentés", "warning", "bugreport", "Írd le pár szóban, mi a hiba"),
    "idea": ("Ötlet", "info", "idea", "Írd le pár szóban az ötleted"),
    "msg": ("Üzenet", "info", "message", "Írj legalább pár szót"),
}
DISCORD_LOOK = {"bug": ("🐞", 0xFF5D5D), "idea": ("💡", 0xFFE14D), "msg": ("💬", 0x5865F2)}
# a frontend nézetkulcsai olvasható néven, a Discord-értesítés „Oldal” mezőjéhez
VIEW_NAMES = {
    "dashboard": "Kezdőlap", "timetable": "Órarend", "gradebook": "Jegyek", "attendance": "Mulasztás", "journal": "Haladási napló",
    "homework": "Házi feladat", "tests": "Számonkérés", "classes": "Osztályok", "notes": "Feljegyzések", "log": "Műveletnapló",
    "settings": "Beállítások", "lesson": "Óra",
}

MAX_REPORTS = 5  # ennyi üzenet (az összes fajta együtt) ...
WINDOW = 3600    # ... óránként, IP-nként


def kinds():
    """Az elérhető fajták: hiba és ötlet a GlitchTiphez (vagy Discordhoz) kell, az üzenet csak Discorddal megy."""
    if not C.FEEDBACK_ENABLED:
        return []
    out = ["bug", "idea"] if (monitoring.enabled or discord.enabled()) else []
    return out + (["msg"] if discord.enabled() else [])


def _s(v, n):
    return v.strip()[:n] if isinstance(v, str) else ""


def _who(user):
    if not user:
        return "nincs belépve"
    name = discord.esc(user["name"]) if user["name"] else f"tanár #{user['id']}"
    return f"{name} (teszt fiók)" if user["inst"] == C.DEMO_INST else name


@bp.post("")
def report():
    d = request.get_json(silent=True)
    d = d if isinstance(d, dict) else {}
    kind = d.get("kind") if isinstance(d.get("kind"), str) and d.get("kind") in KINDS else "bug"
    if kind not in kinds():
        return jsonify(error="Az üzenetküldés most nem elérhető"), 503
    prefix, level, tag, too_short = KINDS[kind]
    to_glitchtip = monitoring.enabled and kind != "msg"
    text = _s(d.get("text"), 4000)
    if len(text) < 5:
        return jsonify(error=too_short), 400
    key = f"fb:{request.remote_addr or '?'}"
    if db.one("SELECT COUNT(*) AS n FROM attempts WHERE akey=? AND ts>?", (key, time.time() - WINDOW))["n"] >= MAX_REPORTS:
        return jsonify(error="Túl sok üzenet, próbáld később", code="throttle"), 429
    security.record_attempt(key)

    user = security.load_session()
    contact = _s(d.get("contact"), 120)
    tech = d.get("tech") if isinstance(d.get("tech"), dict) else None
    view = _s(tech.get("view"), 40) if tech else ""
    event_id = None
    if to_glitchtip:
        with sentry_sdk.new_scope() as scope:
            scope.fingerprint = [tag, uuid.uuid4().hex]  # minden üzenet külön tétel
            scope.set_tag("kind", tag)
            scope.set_tag("app", "tanari")
            scope.set_tag("logged_in", bool(user))
            if user:
                scope.set_tag("demo", user["inst"] == C.DEMO_INST)
                scope.set_user({"id": str(user["id"])})
            scope.set_context(tag, {"text": text, "contact": contact or None})
            if tech:
                errs = tech.get("errors")
                scope.set_tag("view", view or "?")
                scope.set_context("browser_info", {
                    "view": view,
                    "path": _s(tech.get("path"), 200),
                    "ua": (request.headers.get("User-Agent") or "")[:300],
                    "screen": _s(tech.get("screen"), 40),
                    "lang": _s(tech.get("lang"), 20),
                    "theme": _s(tech.get("theme"), 20),
                })
                if isinstance(errs, list):
                    scope.set_context("js_errors", {str(i): _s(e, 1500) for i, e in enumerate(errs[:10]) if isinstance(e, str)})
            event_id = sentry_sdk.capture_message(f"{prefix}: {text.splitlines()[0][:90]}", level=level)

    # Discord (ha be van állítva): cím, a szöveg, alatta egy sor adat; az elérhetőség csak a GlitchTipben látszik
    emoji, color = DISCORD_LOOK[kind]
    fields = [{"name": "Ki", "value": _who(user), "inline": True}]
    if view:
        fields.append({"name": "Oldal", "value": discord.esc(VIEW_NAMES.get(view.split("/")[0], view)), "inline": True})
    embed = {"title": f"{emoji} {prefix} (tanári)", "description": discord.headline(text)[:3800], "color": color, "fields": fields}
    if event_id and C.GLITCHTIP_ORG:
        link = f"{C.GLITCHTIP_WEB}/{quote(C.GLITCHTIP_ORG)}/issues?query={event_id}"
        embed["url"] = link
        fields.append({"name": "GlitchTip", "value": f"[Megnyitás ↗]({link})", "inline": True})
    elif event_id:
        fields.append({"name": "GlitchTip", "value": f"`{event_id}`", "inline": True})
    if contact:
        fields.append({"name": "Elérhetőség", "value": "megadta, a GlitchTipben látszik" if to_glitchtip else discord.esc(contact), "inline": True})
    if kind == "msg":
        if not discord.send(embed):
            return jsonify(error="Nem sikerült elküldeni, próbáld újra később"), 502
    elif discord.enabled():
        discord.send_async(embed)
    return jsonify(ok=True, id=event_id)
