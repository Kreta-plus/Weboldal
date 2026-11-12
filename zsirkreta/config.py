"""Beállítások. Minden felülírható környezeti változóval."""
import os
from pathlib import Path
from urllib.parse import urlsplit

BASE_DIR = Path(__file__).resolve().parent.parent
# Helyi titkok (pl. a Discord webhook) a gitből kimaradó .env fájlból; a valódi környezeti változó erősebb.
_ENV_FILE = BASE_DIR / ".env"
if _ENV_FILE.exists():
    for _line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        _k, _sep, _v = _line.partition("=")
        if _sep and _k.strip() and not _k.strip().startswith("#"):
            os.environ.setdefault(_k.strip(), _v.strip().strip("'\""))
DATA_DIR = Path(os.environ.get("KP_DATA", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DIR = BASE_DIR / "public"

DB_PATH = DATA_DIR / "zsirkreta.db"
# a régi (KRÉTA Plusz nevű) adatbázist átnevezzük, hogy a fiókok és beállítások megmaradjanak
if not DB_PATH.exists() and (DATA_DIR / "kreta_plusz.db").exists():
    try:
        for ext in ("", "-wal", "-shm"):
            old = DATA_DIR / f"kreta_plusz.db{ext}"
            if old.exists():
                old.rename(DATA_DIR / f"zsirkreta.db{ext}")
    except OSError:  # egy még futó régi szerver fogja a fájlt: addig a régi néven használjuk
        DB_PATH = DATA_DIR / "kreta_plusz.db"
KEY_PATH = DATA_DIR / "secret.key"

# --- KRÉTA ---
# FIGYELEM: ezeket élőben nem tudtam ellenőrizni. Ha a belépés nem megy,
# a terminál [KRÉTA] sorai mutatják, melyik lépés bukik. A pontos értékek
# a Refilc / Firka nyílt forráskódjában megtalálhatók.
IDP = os.environ.get("KRETA_IDP", "https://idp.e-kreta.hu")
CLIENT_ID = os.environ.get("KRETA_CLIENT_ID", "kreta-ellenorzo-student-mobile-ios")
UA = os.environ.get("KRETA_UA", "hu.ekreta.student/2.0.0/Android/0/0")
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
AUTHORIZE = os.environ.get("KRETA_AUTHORIZE", f"{IDP}/connect/authorize")
REDIRECT_URI = os.environ.get(
    "KRETA_REDIRECT_URI", "https://mobil.e-kreta.hu/ellenorzo-student/prod/oauthredirect"
)
SCOPE = os.environ.get("KRETA_SCOPE", "openid email offline_access kreta-ellenorzo-webapi.public")

ENDPOINTS = {
    "tanulo": "Sajat/TanuloAdatlap",
    "jegyek": "Sajat/Ertekelesek",
    "orarend": "Sajat/OrarendElemek",
    "mulasztasok": "Sajat/Mulasztasok",
    "hazi": "Sajat/HaziFeladatok",
    "szamonkeres": "Sajat/BejelentettSzamonkeresek",
    "feljegyzesek": "Sajat/Feljegyzesek",
}

# --- Udvarias lekérdezés: gyorsítótár és tempó ---
# Ennyi másodpercig él egy válasz, utána fordulunk újra a KRÉTA felé.
CACHE_TTL = {
    "tanulo": 24 * 3600,
    "jegyek": 10 * 60,
    "orarend": 15 * 60,
    "mulasztasok": 15 * 60,
    "hazi": 10 * 60,
    "szamonkeres": 15 * 60,
    "feljegyzesek": 30 * 60,
}
MIN_GAP = float(os.environ.get("KP_MIN_GAP", 1.0))        # két KRÉTA-hívás közti minimum (mp, felhasználónként)
FORCE_MIN_AGE = int(os.environ.get("KP_FORCE_MIN_AGE", 60))  # "Frissítés" gomb: legfeljebb percenként
COOLDOWN_429 = int(os.environ.get("KP_COOLDOWN", 300))       # 429/403 után ennyi ideig nem hívjuk a KRÉTÁt
STALE_MAX = 7 * 24 * 3600                                  # hiba esetén ennél régebbi adatot már nem mutatunk

# --- Munkamenet / belépés ---
# A belépés minden adata (a KRÉTA-tokenek is) titkosítva a böngésző sütijében van, a szerveren nincs tárolva.
# Belépéskor választható, mennyi idő után járjon le (másodperc; 0 = soha).
SESSION_CHOICES = {"1h": 3600, "1d": 86400, "7d": 7 * 86400, "30d": 30 * 86400, "365d": 365 * 86400, "never": 0}
SESSION_DEFAULT = "365d"
LOGIN_MAX_ATTEMPTS = 5       # ennyi próbálkozás ...
LOGIN_WINDOW = 10 * 60       # ... ennyi idő alatt, IP-nként és fiókonként

# --- Teszt fiók (véletlen adatokkal, KRÉTA nélkül); KP_DEMO=0-val kikapcsolható ---
DEMO_ENABLED = os.environ.get("KP_DEMO", "1") != "0"

# --- GlitchTip (hibakövetés, Sentry-kompatibilis); KP_GLITCHTIP_DSN= üresen kikapcsolja ---
GLITCHTIP_DSN = os.environ.get(
    "KP_GLITCHTIP_DSN", "https://cfed720f1f6f473f882317c9ad5d54ec@app.glitchtip.com/29549"
)
GLITCHTIP_ENV = os.environ.get("KP_ENV", "production")
# a Discord-értesítés GlitchTip-linkjéhez: a webes felület címe (a DSN-ből) és a szervezet rövid neve,
# ami a címsorban látszik: app.glitchtip.com/<EZ>/issues; KP_GLITCHTIP_ORG= üresen: nincs link, csak az esemény azonosítója
GLITCHTIP_WEB = f"{urlsplit(GLITCHTIP_DSN).scheme}://{urlsplit(GLITCHTIP_DSN).netloc.rsplit('@', 1)[-1]}" if GLITCHTIP_DSN else ""
GLITCHTIP_ORG = os.environ.get("KP_GLITCHTIP_ORG", "zsirkreta")

# --- Fordított proxy (nginx, Caddy) mögött: ennyi proxy fejléceit (X-Forwarded-*) fogadjuk el; 0 = nincs proxy ---
TRUST_PROXY = int(os.environ.get("KP_TRUST_PROXY", 0))

# --- Discord: a Kapcsolatok oldal meghívója, és a webhook, amire az üzenetek és a bejelentések értesítése megy ---
# A webhook titok (vele bárki írhat a csatornába): ne kerüljön a gitbe, a .env fájlban vagy környezeti változóban a helye.
DISCORD_INVITE = os.environ.get("KP_DISCORD_INVITE", "https://discord.gg/ufyyQUxnKG")
DISCORD_WEBHOOK = os.environ.get("KP_DISCORD_WEBHOOK", "")

# --- Fejlesztők: ezekkel az e-mail címekkel belépve a fejlesztői oldal nyílik meg (az egész oldal beállításai) ---
# E-mail-visszaigazolás nincs, ezért ezekhez a címekhez csatoláskor a KP_DEV_CODE fejlesztői kód is kell,
# különben bárki a saját fiókjához köthetné őket. A kód titok: a .env fájlban vagy környezeti változóban a helye.
ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("KP_ADMIN_EMAILS", "d-kreta@kopaszhegy.hu,b-kreta@kopaszhegy.hu").split(",") if e.strip()}
DEV_CODE = os.environ.get("KP_DEV_CODE", "")
