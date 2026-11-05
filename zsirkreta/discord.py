"""Discord: üzenet a csapat csatornájába (webhook), és a Kapcsolatok oldal meghívójának élő adatai."""
import base64
import re
import threading
import time

import requests

from . import site
from .config import DISCORD_WEBHOOK, GLITCHTIP_ENV

API = "https://discord.com/api/v10"
_MD = re.compile(r"([\\`*_~|>\[\]()#<@-])")


def enabled():
    return bool(DISCORD_WEBHOOK)


def esc(text):
    """Felhasználói szöveg: ne legyen benne működő Discord-formázás, rejtett link vagy említés."""
    return _MD.sub(r"\\\1", text)


def headline(text):
    """Az első sor nagy betűvel (## címsor, a Discord a kártya leírásában jeleníti meg így), a többi normál méretben."""
    lines = [line.strip() for line in text.strip().splitlines()]
    body = re.sub(r"\n{3,}", "\n\n", "\n".join(esc(line) for line in lines[1:])).strip()
    return f"## {esc(lines[0])}" + (f"\n{body}" if body else "")


def send(embed):
    """Elküld egy beágyazott üzenetet a webhookra; True, ha sikerült. Senkit nem pingel meg."""
    if not DISCORD_WEBHOOK:
        return False
    embed.setdefault("timestamp", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    if GLITCHTIP_ENV != "production":  # a fejlesztés közbeni próbák jól elkülönüljenek
        embed.setdefault("footer", {"text": f"🧪 Próba ({GLITCHTIP_ENV})"})
    body = {"username": "ZsírKréta", "embeds": [embed], "allowed_mentions": {"parse": []}}
    try:
        r = requests.post(DISCORD_WEBHOOK, json=body, timeout=6)
    except requests.RequestException as e:  # a hibaszövegben a webhook címe is benne lenne, ezért csak a típusát írjuk ki
        print(f"[Discord] küldés sikertelen: {type(e).__name__}")
        return False
    if not r.ok:
        print(f"[Discord] küldés sikertelen: HTTP {r.status_code}")
    return r.ok


def send_async(embed):
    threading.Thread(target=send, args=(embed,), daemon=True).start()


_invite = {"url": "", "at": 0.0, "data": None}
_lock = threading.Lock()


def invite_info():
    """A meghívó adatai (szerver neve, ikonja, tag- és online létszám), 10 percig tárolva; hiba esetén csak a link."""
    url = site.get()["discordInvite"]
    with _lock:
        if _invite["url"] == url and time.time() - _invite["at"] < (600 if _invite["data"] else 120):
            return _invite["data"] or {"url": url}
        info = {"url": url}
        code = url.rstrip("/").rsplit("/", 1)[-1]
        try:
            j = requests.get(f"{API}/invites/{code}", params={"with_counts": "true"}, timeout=4).json()
            j = j if isinstance(j, dict) else {}
            g = j.get("guild") if isinstance(j.get("guild"), dict) else {}
            if isinstance(g.get("name"), str):
                info["name"] = g["name"][:100]
            for key, src in (("members", "approximate_member_count"), ("online", "approximate_presence_count")):
                if isinstance(j.get(src), int):
                    info[key] = j[src]
            gid, icon = str(g.get("id", "")), str(g.get("icon") or "")
            if re.fullmatch(r"\d+", gid) and re.fullmatch(r"\w+", icon):
                r = requests.get(f"https://cdn.discordapp.com/icons/{gid}/{icon}.png", params={"size": 128}, timeout=4)
                if r.ok and r.headers.get("Content-Type") == "image/png" and len(r.content) < 300_000:
                    # adat-URI-ként adjuk tovább, így a böngésző semmit nem tölt le közvetlenül a Discordtól
                    info["icon"] = "data:image/png;base64," + base64.b64encode(r.content).decode()
        except (requests.RequestException, ValueError):
            pass
        _invite.update(url=url, at=time.time(), data=info if "name" in info else None)
        return info
