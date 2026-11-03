"""Beállítások. Minden felülírható környezeti változóval."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("KP_DATA", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DIR = BASE_DIR / "public"

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
SESSION_DAYS = 365
LOGIN_MAX_ATTEMPTS = 5       # ennyi próbálkozás ...
LOGIN_WINDOW = 10 * 60       # ... ennyi idő alatt, IP-nként és fiókonként

# --- Teszt fiók (véletlen adatokkal, KRÉTA nélkül); KP_DEMO=0-val kikapcsolható ---
DEMO_ENABLED = os.environ.get("KP_DEMO", "1") != "0"
