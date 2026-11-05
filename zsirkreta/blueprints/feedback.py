"""Visszajelzés: hibabejelentés, ötlet vagy üzenet a csapatnak.

A hiba és az ötlet a GlitchTipbe kerül, és értesítés megy róla a Discordra; az üzenet csak a Discordra megy.
"""
import uuid

import sentry_sdk
from urllib.parse import quote

from flask import Blueprint, jsonify, request

from .. import demo, discord, monitoring, security, site
from ..config import GLITCHTIP_ORG, GLITCHTIP_WEB

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
    "dashboard": "Kezdőlap", "grades": "Jegyek", "stats": "Statisztika", "timetable": "Órarend", "homework": "Házi",
    "absences": "Hiányzás", "planner": "Tervező", "pack": "Táska", "notes": "Feljegyzések", "names": "Nevek",
    "settings": "Beállítások", "contact": "Kapcsolatok",
}

MAX_REPORTS = 5  # ennyi üzenet (az összes fajta együtt) ...
WINDOW = 3600    # ... óránként, IP-nként


def _s(v, n):
    return v.strip()[:n] if isinstance(v, str) else ""


def _who(user):
    """A küldő a Discordon: a diák neve a KRÉTA-adatlapról (amíg az nincs betöltve, a belső azonosító)."""
    if not user:
        return "nincs belépve"
    name = discord.esc(user["name"]) if user["name"] else f"diák #{user['id']}"
    return f"{name} (teszt fiók)" if user["inst"] == demo.DEMO_INST else name


@bp.post("")
def report():
    if not site.get()["feedbackEnabled"]:
        return jsonify(error="Az üzenetküldés most ki van kapcsolva"), 503
    d = request.get_json(silent=True)
    d = d if isinstance(d, dict) else {}
    kind = d.get("kind") if isinstance(d.get("kind"), str) and d.get("kind") in KINDS else "bug"
    prefix, level, tag, too_short = KINDS[kind]
    to_glitchtip = monitoring.enabled and kind != "msg"
    if not (to_glitchtip or discord.enabled()):
        return jsonify(error="Az üzenetküldés most nem elérhető"), 503
    text = _s(d.get("text"), 4000)
    if len(text) < 5:
        return jsonify(error=too_short), 400
    key = f"fb:{request.remote_addr or '?'}"
    if security.too_many_attempts(key, limit=MAX_REPORTS, window=WINDOW):
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
            scope.set_tag("logged_in", bool(user))
            if user:
                scope.set_tag("demo", user["inst"] == demo.DEMO_INST)
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
            title = text.splitlines()[0][:90]
            event_id = sentry_sdk.capture_message(f"{prefix}: {title}", level=level)

    # Discord: mindhárom fajta egyforma: cím, a szöveg (első sora nagy betűvel), alatta egy sor adat.
    # Az elérhetőség csak akkor kerül oda, ha máshol nincs meg (üzenet, vagy kikapcsolt GlitchTip).
    emoji, color = DISCORD_LOOK[kind]
    fields = [{"name": "Ki", "value": _who(user), "inline": True}]
    if view:
        fields.append({"name": "Oldal", "value": discord.esc(VIEW_NAMES.get(view, view)), "inline": True})
    embed = {"title": f"{emoji} {prefix}", "description": discord.headline(text)[:3800], "color": color, "fields": fields}
    if event_id and GLITCHTIP_ORG:
        # az esemény azonosítójára keresve a GlitchTip magától a bejelentés oldalára ugrik
        link = f"{GLITCHTIP_WEB}/{quote(GLITCHTIP_ORG)}/issues?query={event_id}"
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
