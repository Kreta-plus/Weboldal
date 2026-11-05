"""Az egész oldalra érvényes beállítások: a fejlesztői oldalon szerkeszthetők, az adatbázisban tárolva."""
import json
import re
import time

from . import db
from .config import DISCORD_INVITE

DEFAULTS = {
    "announcement": "",            # közlemény minden felhasználónak a felület tetején (üres: nincs)
    "announcementLevel": "info",   # info | warn | danger
    "maintenance": False,          # karbantartás: közben csak a fejlesztők használhatják az oldalt
    "maintenanceText": "Karbantartás miatt az oldal most nem elérhető. Hamarosan visszajövünk!",
    "maintenanceFrom": None,       # ütemezett kezdet (Unix-idő, mp): ekkor magától indul, előtte a diákok előre látják
    "maintenanceUntil": None,      # vége: ekkor magától leáll (a kézzel bekapcsoltat is leállítja)
    "demoEnabled": True,           # „Kipróbálom teszt fiókkal” a belépőoldalon
    "feedbackEnabled": True,       # hibabejelentés, ötlet és üzenet küldése
    "discordInvite": DISCORD_INVITE,
}
LEVELS = ("info", "warn", "danger")
PUBLIC = ("announcement", "announcementLevel", "maintenanceText", "maintenanceFrom", "maintenanceUntil", "demoEnabled", "feedbackEnabled")
_INVITE = re.compile(r"https://(discord\.gg|discord\.com/invite)/[\w-]{2,64}")


def valid_invite(url):
    return isinstance(url, str) and bool(_INVITE.fullmatch(url))


def _txt(v, n):
    return v.strip()[:n] if isinstance(v, str) else ""


def _ts(v):
    ok = isinstance(v, (int, float)) and not isinstance(v, bool) and 1.5e9 < v < 4.2e9
    return float(v) if ok else None


def sanitize(d):
    out = dict(DEFAULTS)
    if not isinstance(d, dict):
        return out
    out["announcement"] = _txt(d.get("announcement"), 300)
    out["announcementLevel"] = d.get("announcementLevel") if d.get("announcementLevel") in LEVELS else "info"
    out["maintenance"] = bool(d.get("maintenance", False))
    out["maintenanceText"] = _txt(d.get("maintenanceText"), 300) or DEFAULTS["maintenanceText"]
    out["maintenanceFrom"] = _ts(d.get("maintenanceFrom"))
    out["maintenanceUntil"] = _ts(d.get("maintenanceUntil"))
    out["demoEnabled"] = bool(d.get("demoEnabled", True))
    out["feedbackEnabled"] = bool(d.get("feedbackEnabled", True))
    inv = _txt(d.get("discordInvite"), 120)
    out["discordInvite"] = inv if valid_invite(inv) else DEFAULTS["discordInvite"]
    return out


def get():
    row = db.one("SELECT body FROM site WHERE key='settings'")
    try:
        return sanitize(json.loads(row["body"])) if row else dict(DEFAULTS)
    except ValueError:
        return dict(DEFAULTS)


def save(d):
    clean = sanitize(d)
    db.run(
        "INSERT INTO site(key,body,updated) VALUES('settings',?,?) "
        "ON CONFLICT(key) DO UPDATE SET body=excluded.body, updated=excluded.updated",
        (json.dumps(clean, ensure_ascii=False), time.time()),
    )
    return clean


def maintenance_status(s=None, now=None):
    """A karbantartás tényleges állapota: off | scheduled (közelgő) | active | ended (a vége elmúlt)."""
    s = s or get()
    now = time.time() if now is None else now
    frm, until = s["maintenanceFrom"], s["maintenanceUntil"]
    if until is not None and now >= until:
        return "ended" if s["maintenance"] or frm is not None else "off"
    if s["maintenance"] or (frm is not None and now >= frm):
        return "active"
    return "scheduled" if frm is not None else "off"


def public():
    """Ami mindenkinek kell (belépőoldal, közlemény, karbantartás); a meghívó a saját végpontján jön."""
    s = get()
    status = maintenance_status(s)
    return {**{k: s[k] for k in PUBLIC}, "maintenance": status == "active", "maintenanceUpcoming": status == "scheduled"}
