"""Discord: értesítés a bejelentésekről a csapat csatornájába (webhook). KT_DISCORD_WEBHOOK nélkül ki van kapcsolva."""
import re
import threading
import time

import requests

from .config import DISCORD_WEBHOOK, GLITCHTIP_ENV

_MD = re.compile(r"([\\`*_~|>\[\]()#<@-])")


def enabled():
    return bool(DISCORD_WEBHOOK)


def esc(text):
    """Felhasználói szöveg: ne legyen benne működő Discord-formázás, rejtett link vagy említés."""
    return _MD.sub(r"\\\1", text)


def headline(text):
    """Az első sor nagy betűvel (## címsor), a többi normál méretben."""
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
    body = {"username": "ZsírKréta Tanári", "embeds": [embed], "allowed_mentions": {"parse": []}}
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
