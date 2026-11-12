"""KRÉTA kliens: belépés (OAuth2 + PKCE), tokenkezelés, udvarias lekérdezés gyorsítótárral.

Alapelvek, hogy a KRÉTA szervere felé minél kevesebb és egyenletes forgalom menjen:
  * minden válasz gyorsítótárba kerül (TTL adatfajtánként),
  * a "Frissítés" gomb és az oldal percenkénti automatikus frissítése együtt is csak percenként hív,
  * felhasználónként soros hívások, köztük minimális szünettel (+ kis véletlen eltérés),
  * 429/403 után cooldown: addig csak a tárolt adatot szolgáljuk ki,
  * a token megújítása csak lejáratkor történik, a jelszót soha nem tároljuk,
  * a tokenek a munkamenet titkosított sütijében vannak, nem az adatbázisban.
"""
import base64
import hashlib
import json
import random
import re
import secrets
import threading
import time
from html.parser import HTMLParser
from urllib.parse import parse_qs, quote, urlencode, urljoin, urlparse

import requests

from . import config as C
from . import db, demo, security


class KretaError(Exception):
    def __init__(self, msg, status=502, code="kreta", detail=None):
        super().__init__(msg)
        self.msg, self.status, self.code, self.detail = msg, status, code, detail


# ---------- PKCE ----------
def b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def new_pkce():
    verifier = b64url(secrets.token_bytes(48))
    challenge = b64url(hashlib.sha256(verifier.encode()).digest())
    return verifier, challenge, b64url(secrets.token_bytes(12))


def authorize_url(challenge, state):
    return (
        f"{C.AUTHORIZE}?response_type=code&client_id={C.CLIENT_ID}"
        f"&redirect_uri={quote(C.REDIRECT_URI, safe='')}&scope={quote(C.SCOPE)}"
        f"&code_challenge={challenge}&code_challenge_method=S256&state={state}&prompt=login"
    )


def jwt_claims(token):
    try:
        p = token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4)))
    except Exception:
        return {}


# ---------- a KRÉTA belépő oldalának kitöltése ----------
class FormParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.forms, self.cur = [], None

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "form":
            self.cur = {"action": d.get("action", ""), "fields": {}}
            self.forms.append(self.cur)
        elif tag in ("input", "select") and self.cur is not None and d.get("name"):
            self.cur["fields"][d["name"]] = d.get("value") or ""

    def handle_endtag(self, tag):
        if tag == "form":
            self.cur = None


def _follow(s, url, trace, method="GET", data=None):
    for _ in range(12):
        r = s.request(method, url, data=data, allow_redirects=False, timeout=20)
        trace.append(f"{method} {urlparse(url).netloc}{urlparse(url).path} -> {r.status_code}")
        loc = r.headers.get("Location")
        if loc:
            loc = urljoin(url, loc)
            code = (parse_qs(urlparse(loc).query).get("code") or [None])[0]
            if code:
                return r, code
            url, method, data = loc, "GET", None
            continue
        return r, None
    return None, None


def scripted_login(user, pw, inst):
    """Visszaad: (code, verifier, nyom, hiba)."""
    verifier, challenge, state = new_pkce()
    s = requests.Session()
    s.headers["User-Agent"] = C.BROWSER_UA
    trace = []
    try:
        r, code = _follow(s, authorize_url(challenge, state), trace)
        if code:
            return code, verifier, trace, None
        if r is None:
            return None, verifier, trace, "Túl sok átirányítás"
        forms = FormParser()
        forms.feed(r.text)
        form = next((f for f in forms.forms if any(re.search("pass", k, re.I) for k in f["fields"])), None)
        if not form:
            return None, verifier, trace, "Nem találtam belépő űrlapot a KRÉTA oldalán"
        fields = dict(form["fields"])
        for k in list(fields):
            if re.fullmatch(r"user.?name|login.?name", k, re.I):
                fields[k] = user
            elif re.search("pass", k, re.I):
                fields[k] = pw
            elif re.search("institute", k, re.I):
                fields[k] = inst
        fields.setdefault("UserName", user)
        fields.setdefault("Password", pw)
        fields.setdefault("InstituteCode", inst)
        trace.append("űrlap mezői: " + ", ".join(sorted(fields)))
        post_url = urljoin(r.url, form["action"] or r.url)
        _, code = _follow(s, post_url, trace, "POST", fields)
        if code:
            return code, verifier, trace, None
        return None, verifier, trace, "Hibás név, jelszó vagy iskolakód, vagy a KRÉTA captchát kér"
    except requests.RequestException as e:
        return None, verifier, trace, f"Hálózati hiba: {e}"


def exchange_code(code, verifier):
    r = requests.post(
        f"{C.IDP}/connect/token",
        headers={"User-Agent": C.UA},
        data={
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": C.REDIRECT_URI,
            "client_id": C.CLIENT_ID,
        },
        timeout=20,
    )
    try:
        j = r.json()
    except ValueError:
        j = {}
    return r, j


def login_with_password(user, pw, inst):
    """Teljes belépés. Visszaad: token-JSON. Hibánál KretaError."""
    code, verifier, trace, err = scripted_login(user, pw, inst)
    if code:
        try:
            r, j = exchange_code(code, verifier)
            if r.ok and "access_token" in j:
                return j
            print(f"[KRÉTA] kódbeváltás: {r.status_code} {str(j)[:300]}")
            err = f"A kód beváltása nem sikerült ({r.status_code})"
        except requests.RequestException as e:
            err = f"Hálózati hiba: {e}"
    print("[KRÉTA] belépés nyoma:\n  " + "\n  ".join(trace) + f"\n  hiba: {err}")

    # tartalék: a régi közvetlen jelszavas módszer
    try:
        r = requests.post(
            f"{C.IDP}/connect/token",
            headers={"User-Agent": C.UA},
            data={"userName": user, "password": pw, "institute_code": inst, "grant_type": "password", "client_id": C.CLIENT_ID},
            timeout=15,
        )
        j = r.json() if r.content else {}
        if r.ok and "access_token" in j:
            return j
    except (requests.RequestException, ValueError):
        pass
    raise KretaError("Sikertelen belépés. Ellenőrizd a nevet, jelszót és az iskolakódot.", 401, "login", err)


# ---------- felhasználók és tokenek ----------
def save_user(inst, username, j):
    """A fiók felvétele vagy frissítése. A tokenek nem ide kerülnek, hanem a munkamenet sütijébe."""
    claims = jwt_claims(j["access_token"])
    inst = claims.get("kreta:institute_code") or inst
    sub = claims.get("sub") or (username or "").lower()
    ukey = f"{inst}:{sub}"
    now = time.time()
    row = db.one("SELECT id FROM users WHERE ukey=?", (ukey,))
    if row:
        uid = row["id"]
        db.run("UPDATE users SET inst=?, username=?, last_login=? WHERE id=?", (inst, username, now, uid))
    else:
        uid = db.run(
            "INSERT INTO users(ukey,inst,username,created,last_login) VALUES(?,?,?,?,?)",
            (ukey, inst, username, now, now),
        ).lastrowid
    return uid


_locks = {}
_locks_guard = threading.Lock()
_last_call = {}
_cooldown = {}
# Megújításkor a KRÉTA új megújító tokent adhat, és a régi érvénytelen lesz. Ha egy másik kérés még a régi sütivel jön
# (párhuzamos kérés, vagy elveszett a válasz az új sütivel), itt találja meg az újat. Csak a memóriában, egy napig.
_renewed = {}  # sha256(régi megújító token) -> az új token-mezők (security.token_fields)
RENEWED_TTL = 24 * 3600


def _lock(uid):
    with _locks_guard:
        return _locks.setdefault(uid, threading.RLock())


def _adopt(sess):
    """Ha ezt a megújító tokent közben egy másik kérés már lecserélte, átvesszük az újabbat."""
    while sess.get("rt"):
        newer = _renewed.get(hashlib.sha256(sess["rt"].encode()).hexdigest())
        if not newer or newer["ax"] <= sess.get("ax", 0):
            return
        sess.update(newer)
        security.session_changed()


def _refresh(sess):
    rt = sess.get("rt")
    if not rt:
        raise KretaError("Lejárt a belépés, jelentkezz be újra", 401, "relogin")
    try:
        r = requests.post(
            f"{C.IDP}/connect/token",
            headers={"User-Agent": C.UA},
            data={"grant_type": "refresh_token", "refresh_token": rt, "client_id": C.CLIENT_ID},
            timeout=15,
        )
        j = r.json() if r.content else {}
    except (requests.RequestException, ValueError) as e:
        raise KretaError("A KRÉTA nem elérhető", 502, "net", str(e))
    if not r.ok or "access_token" not in j:
        print(f"[KRÉTA] token megújítás: {r.status_code} {str(j)[:200]}")
        if r.status_code in (400, 401):
            security.drop_tokens(sess)
            raise KretaError("Lejárt a belépés, jelentkezz be újra", 401, "relogin")
        raise KretaError("A KRÉTA ideiglenesen nem elérhető", 502, "net")
    t = security.token_fields(j)
    now = time.time()
    for k in [k for k, v in _renewed.items() if v["ax"] < now - RENEWED_TTL]:
        _renewed.pop(k, None)
    _renewed[hashlib.sha256(rt.encode()).hexdigest()] = t
    sess.update(t)
    security.session_changed()
    return t["at"]


def _access(force_refresh=False):
    """Hozzáférési token a kérés munkamenetéből (sütiből); lejárt vagy kérésre megújítja."""
    sess = security.current()
    _adopt(sess)
    t = None if force_refresh else security.access_token(sess)
    return t or _refresh(sess)


# ---------- udvarias lekérdezés ----------
def cooldown_left(uid):
    """Hány mp van még hátra a 429/403 utáni szünetből (0, ha nincs szünet)."""
    return max(0.0, _cooldown.get(uid, 0) - time.time())


def _cache_get(uid, ckey):
    return db.one("SELECT body, fetched_at FROM cache WHERE user_id=? AND ckey=?", (uid, ckey))


def _cache_put(uid, ckey, body):
    db.run(
        "INSERT INTO cache(user_id,ckey,body,fetched_at) VALUES(?,?,?,?) "
        "ON CONFLICT(user_id,ckey) DO UPDATE SET body=excluded.body, fetched_at=excluded.fetched_at",
        (uid, ckey, body, time.time()),
    )


def _wrap(row, stale=False, cached=True):
    return {"data": json.loads(row["body"]), "meta": {"fetchedAt": row["fetched_at"], "stale": stale, "cached": cached}}


def fetch(uid, what, params=None, force=False):
    """Visszaad: {"data":..., "meta":{...}}. Hibánál KretaError."""
    ep = C.ENDPOINTS.get(what)
    if not ep:
        raise KretaError("Ismeretlen végpont", 404, "nf")
    params = {k: v for k, v in (params or {}).items() if k in ("datumTol", "datumIg")}
    u0 = db.one("SELECT inst FROM users WHERE id=?", (uid,))
    if u0 and u0["inst"] == demo.DEMO_INST:  # teszt fiók: generált adat, nincs hálózat
        return {"data": demo.data(uid, what, params), "meta": {"fetchedAt": time.time(), "stale": False, "cached": False}}
    ckey = what + ("?" + urlencode(sorted(params.items())) if params else "")
    row = _cache_get(uid, ckey)
    now = time.time()
    if row:
        age = now - row["fetched_at"]
        if age < C.CACHE_TTL.get(what, 600) and not (force and age >= C.FORCE_MIN_AGE):
            return _wrap(row)

    def stale_or(err):
        if row and now - row["fetched_at"] < C.STALE_MAX:
            return _wrap(row, stale=True)
        raise err

    if not security.has_kreta():  # e-mailes belépés: ezen az eszközön nincs KRÉTA-token, csak a tárolt adat látszik
        return stale_or(KretaError("Ezen az eszközön nincs KRÉTA-belépés, a friss adatokhoz lépj be a KRÉTA-ban", 409, "nokreta"))
    if _cooldown.get(uid, 0) > now:
        return stale_or(KretaError("A KRÉTA lassít minket, próbáld később", 429, "cooldown"))

    u = db.one("SELECT inst FROM users WHERE id=?", (uid,))
    url = f"https://{u['inst']}.e-kreta.hu/ellenorzo/V3/{ep}"
    with _lock(uid):
        # amíg vártunk a zárra, más szál már frissíthette
        row2 = _cache_get(uid, ckey)
        if row2 and row2["fetched_at"] > (row["fetched_at"] if row else 0):
            return _wrap(row2)
        gap = C.MIN_GAP + random.uniform(0.1, 0.6)
        wait = _last_call.get(uid, 0) + gap - time.time()
        if wait > 0:
            time.sleep(wait)
        try:
            for attempt in (1, 2):
                token = _access(force_refresh=(attempt == 2))
                r = requests.get(
                    url, params=params, timeout=15,
                    headers={"Authorization": f"Bearer {token}", "User-Agent": C.UA},
                )
                _last_call[uid] = time.time()
                if r.status_code == 401 and attempt == 1:
                    continue
                break
        except requests.RequestException as e:
            print(f"[KRÉTA] {what}: hálózati hiba: {e}")
            return stale_or(KretaError("A KRÉTA nem elérhető", 502, "net", str(e)))
        except KretaError as e:
            if e.code == "relogin":
                raise
            return stale_or(e)

    if r.status_code in (429, 403):
        _cooldown[uid] = time.time() + C.COOLDOWN_429
        print(f"[KRÉTA] {what}: {r.status_code}, {C.COOLDOWN_429}s szünet")
        return stale_or(KretaError("A KRÉTA lassít minket, próbáld később", 429, "cooldown"))
    if r.status_code == 401:
        raise KretaError("Lejárt a belépés, jelentkezz be újra", 401, "relogin")
    if not r.ok:
        print(f"[KRÉTA] {what}: {r.status_code} {url} -> {r.text[:300]}")
        return stale_or(KretaError(f"A KRÉTA {r.status_code} hibát adott ({what})", 502, "kreta", r.text[:200]))
    try:
        body = r.text or "[]"
        json.loads(body)
    except ValueError:
        return stale_or(KretaError("A KRÉTA érvénytelen választ adott", 502, "kreta"))
    _cache_put(uid, ckey, body)
    return _wrap(_cache_get(uid, ckey), cached=False)
