"""Az egész oldal beállításai: a nyilvános rész mindenkinek, a szerkesztés és a statisztika csak fejlesztőknek."""
import time

from flask import Blueprint, jsonify, request

from .. import db, discord, monitoring, security, site
from ..config import ADMIN_EMAILS, DEMO_ENABLED, DEV_CODE, GLITCHTIP_ENV
from ..demo import DEMO_INST

bp = Blueprint("site", __name__, url_prefix="/api/site")


@bp.get("")
def public():
    return jsonify(site.public())


def _count(sql, *args):
    return db.one(sql, args)[0]


@bp.get("/admin")
@security.admin_required
def admin_get():
    now = time.time()
    devs = []
    for email in sorted(ADMIN_EMAILS):
        row = db.one("SELECT name, admin, last_login FROM users WHERE email=?", (email,))
        devs.append({"email": email, "claimed": bool(row and row["admin"]), "name": row["name"] if row else None,
                     "lastLogin": row["last_login"] if row else None})
    s = site.get()
    return jsonify(
        settings=s,
        maintenanceStatus=site.maintenance_status(s),
        stats={
            "users": _count("SELECT COUNT(*) FROM users WHERE inst<>?", DEMO_INST),
            "newWeek": _count("SELECT COUNT(*) FROM users WHERE inst<>? AND created>?", DEMO_INST, now - 7 * 86400),
            "active24h": _count("SELECT COUNT(*) FROM users WHERE last_seen>?", now - 86400),
            "active7d": _count("SELECT COUNT(*) FROM users WHERE last_seen>?", now - 7 * 86400),
            "email": _count("SELECT COUNT(*) FROM users WHERE email IS NOT NULL"),
            "demo": _count("SELECT COUNT(*) FROM users WHERE inst=?", DEMO_INST),
        },
        devs=devs,
        system={"env": GLITCHTIP_ENV, "glitchtip": monitoring.enabled, "discordWebhook": discord.enabled(),
                "devCode": bool(DEV_CODE), "demoAllowed": DEMO_ENABLED},
    )


@bp.put("/admin")
@security.admin_required
def admin_put():
    d = request.get_json(silent=True)
    if not isinstance(d, dict):
        return jsonify(error="Érvénytelen kérés"), 400
    inv = d.get("discordInvite")
    if inv is not None and not site.valid_invite(inv.strip() if isinstance(inv, str) else inv):
        return jsonify(error="A Discord-meghívó így nézzen ki: https://discord.gg/…"), 400
    clean = site.sanitize({**site.get(), **d})
    if clean["maintenanceFrom"] and clean["maintenanceUntil"] and clean["maintenanceUntil"] <= clean["maintenanceFrom"]:
        return jsonify(error="A karbantartás vége legyen később, mint a kezdete"), 400
    saved = site.save(clean)
    return jsonify(settings=saved, maintenanceStatus=site.maintenance_status(saved))
