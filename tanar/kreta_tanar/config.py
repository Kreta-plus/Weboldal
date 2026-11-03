"""Beállítások (tanári verzió). Minden felülírható környezeti változóval."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("KT_DATA", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DIR = BASE_DIR / "public"

DB_PATH = DATA_DIR / "kreta_tanar.db"
KEY_PATH = DATA_DIR / "secret.key"

# --- KRÉTA, tanári hozzáférés („Napló” API, V3) ---
# Forrás: nem hivatalos, nyílt forráskódú kliensek (kreta.js NaploApiV3, Coware Napló+). ÉLŐBEN NINCS KIPRÓBÁLVA.
# Ha valami nem megy, a terminál [KRÉTA] sorai mutatják a hibát; minden érték felülírható környezeti változóval.
IDP = os.environ.get("KRETA_IDP", "https://idp.e-kreta.hu")
# A kliens, az átirányítási cím és a scope az idp.e-kreta.hu authorize végpontján ellenőrizve (2026.11.03.):
# ezekkel a KRÉTA a belépőoldalt adja, rossz értéknél hibaoldalt. A régi „kreta-naplo-mobile” kliens már nem létezik.
TEACHER_CLIENT_ID = os.environ.get("KT_CLIENT_ID", "kreta-naplo-mobile-ios")
TEACHER_UA = os.environ.get("KT_UA", "hu.ekreta.teacher/1.0.5/Android/0/0")
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
# Böngészős (PKCE) belépés: a KRÉTA belépés után erre a címre irányít, a végén ?code=… van
TEACHER_REDIRECT_URI = os.environ.get("KT_REDIRECT_URI", "https://mobil.e-kreta.hu/naplo/prod/oauthredirect")
TEACHER_SCOPE = os.environ.get("KT_SCOPE", "openid email offline_access kreta-naplo-webapi.public")
NAPLO_PATH = os.environ.get("KT_NAPLO_PATH", "/naplo/V3/")
KRETA_READY = os.environ.get("KT_KRETA", "1") != "0"
MIN_GAP = float(os.environ.get("KT_MIN_GAP", 0.3))      # két KRÉTA-hívás közti minimum (mp)
COOLDOWN_429 = int(os.environ.get("KT_COOLDOWN", 300))  # 429/403 után ennyi ideig csak a tárolt adat

# Éles írás a KRÉTA-ba: alapból KI. Két feltétel kell hozzá:
#   KT_LIVE_WRITE=1 és a művelet neve a KT_LIVE_OPS listában (pl. KT_LIVE_OPS=lesson.log,homework.add)
# Amíg egy művelet nincs bekapcsolva, a megerősítő ablak csak megmutatja a pontos kérést, de nem küldi el.
LIVE_WRITE = os.environ.get("KT_LIVE_WRITE") == "1"
LIVE_OPS = {x.strip() for x in os.environ.get("KT_LIVE_OPS", "").split(",") if x.strip()}

# --- Munkamenet / belépés ---
SESSION_DAYS = 30            # tanári fióknál rövidebb, mint a diáknál
LOGIN_MAX_ATTEMPTS = 5
LOGIN_WINDOW = 10 * 60

# --- Műveletek ---
PENDING_TTL = 10 * 60        # ennyi ideig érvényes egy jóváhagyásra váró művelet
MAX_ENTRIES = 60             # egy műveletben legfeljebb ennyi diák (egy osztály)

# --- Teszt fiók (generált osztályokkal, KRÉTA nélkül); KT_DEMO=0-val kikapcsolható ---
DEMO_ENABLED = os.environ.get("KT_DEMO", "1") != "0"
DEMO_INST = "demo"
