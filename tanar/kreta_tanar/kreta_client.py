"""KRÉTA kliens a tanári „Napló” API-hoz: belépés, tokenkezelés, udvarias olvasás, írás újrapróbálás nélkül.

A végpontok és a mezőnevek nem hivatalos, nyílt forráskódú kliensekből származnak (kreta.js NaploApiV3,
Coware Napló+). Élőben nincs kipróbálva: a hibák a terminálban [KRÉTA] előtaggal jelennek meg.

Alapelvek (mint a diák verzióban):
  * az olvasások gyorsítótárba kerülnek, adatfajtánként eltérő ideig,
  * felhasználónként soros hívások, köztük minimális szünettel; 429/403 után szünet,
  * a jelszót soha nem tároljuk, csak a titkosított tokeneket,
  * írásnál nincs automatikus újrapróbálás (kivéve, ha a KRÉTA 401-gyel még be sem fogadta a kérést).
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
from . import db, security


class KretaError(Exception):
    def __init__(self, msg, status=502, code="kreta", detail=None):
        super().__init__(msg)
        self.msg, self.status, self.code, self.detail = msg, status, code, detail


def jwt_claims(token):
    try:
        p = token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4)))
    except Exception:
        return {}


def _roles(claims):
    r = claims.get("role") or claims.get("roles") or []
    return [r] if isinstance(r, str) else list(r)


# ---------- belépés ----------
class _FormParser(HTMLParser):
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


def _b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def new_pkce():
    """Visszaad: (verifier, challenge, state)."""
    verifier = _b64url(secrets.token_bytes(48))
    return verifier, _b64url(hashlib.sha256(verifier.encode()).digest()), _b64url(secrets.token_bytes(12))


def authorize_url(challenge, state):
    return (f"{C.IDP}/connect/authorize?response_type=code&client_id={C.TEACHER_CLIENT_ID}"
            f"&redirect_uri={quote(C.TEACHER_REDIRECT_URI, safe='')}&scope={quote(C.TEACHER_SCOPE)}"
            f"&code_challenge={challenge}&code_challenge_method=S256&state={state}&prompt=login")


def exchange_code(code, verifier):
    """A belépés után kapott kód beváltása tokenre. Visszaad: (válasz, JSON)."""
    r = requests.post(f"{C.IDP}/connect/token", headers={"User-Agent": C.TEACHER_UA}, timeout=20, data={
        "grant_type": "authorization_code", "code": code, "code_verifier": verifier,
        "redirect_uri": C.TEACHER_REDIRECT_URI, "client_id": C.TEACHER_CLIENT_ID})
    try:
        j = r.json() if r.content else {}
    except ValueError:
        j = {}
    return r, j


def _pkce_login(user, pw, inst, trace):
    """Böngészős belépés a KRÉTA saját oldalán, a program tölti ki az űrlapot."""
    verifier, challenge, state = new_pkce()
    s = requests.Session()
    s.headers["User-Agent"] = C.BROWSER_UA

    def follow(u, method="GET", data=None):
        for _ in range(12):
            r = s.request(method, u, data=data, allow_redirects=False, timeout=20)
            trace.append(f"{method} {urlparse(u).netloc}{urlparse(u).path} -> {r.status_code}")
            loc = r.headers.get("Location")
            if not loc:
                return r, None
            loc = urljoin(u, loc)
            code = (parse_qs(urlparse(loc).query).get("code") or [None])[0]
            if code:
                return r, code
            u, method, data = loc, "GET", None
        return None, None

    r, code = follow(authorize_url(challenge, state))
    if not code and r is not None:
        fp = _FormParser()
        fp.feed(r.text)
        form = next((f for f in fp.forms if any(re.search("pass", k, re.I) for k in f["fields"])), None)
        if form:
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
            _, code = follow(urljoin(r.url, form["action"] or r.url), "POST", fields)
    if not code:
        return None
    r, j = exchange_code(code, verifier)
    trace.append(f"kódbeváltás -> {r.status_code}")
    return j if r.ok and "access_token" in j else None


def check_teacher(j):
    """Csak tanári szerepkörű fiókot engedünk be."""
    if not any("tanar" in x.lower() for x in _roles(jwt_claims(j["access_token"]))):
        raise KretaError("Ez nem tanári fiók. A tanári felülethez tanári KRÉTA-fiók kell.", 403, "role")
    return j


def login(user, pw, inst):
    """Visszaad: token-JSON. Hibánál KretaError. Csak tanári szerepkörű fiókot enged be."""
    trace, j = [], None
    try:
        if C.TEACHER_REDIRECT_URI:
            j = _pkce_login(user, pw, inst, trace)
        if not j:  # a tanári mobilkliens régi, közvetlen jelszavas módja
            r = requests.post(f"{C.IDP}/connect/token", headers={"User-Agent": C.TEACHER_UA}, timeout=20, data={
                "institute_code": inst, "userName": user, "password": pw, "grant_type": "password", "client_id": C.TEACHER_CLIENT_ID})
            trace.append(f"jelszavas token -> {r.status_code} {r.text[:160]}")
            j = r.json() if r.content and r.ok else None
    except (requests.RequestException, ValueError) as e:
        trace.append(f"hálózati hiba: {e}")
    if not j or "access_token" not in j:
        print("[KRÉTA] tanári belépés nyoma:\n  " + "\n  ".join(trace))
        raise KretaError("Sikertelen belépés. Ellenőrizd a nevet, a jelszót és az iskolakódot. "
                         "Ha biztosan jók, lépj be a KRÉTA saját oldalán (fent), az mindig működik.", 401, "login")
    return check_teacher(j)


def institute(j):
    return jwt_claims(j["access_token"]).get("kreta:institute_code")


def save_user(inst, username, j):
    claims = jwt_claims(j["access_token"])
    inst = claims.get("kreta:institute_code") or inst
    ukey = f"{inst}:{claims.get('sub') or (username or '').lower()}"
    now = time.time()
    exp = now + float(j.get("expires_in", 3000)) - 30
    row = db.one("SELECT id FROM users WHERE ukey=?", (ukey,))
    if row:
        db.run("UPDATE users SET inst=?, username=?, refresh_enc=COALESCE(?,refresh_enc), access_enc=?, access_exp=?, last_login=? WHERE id=?",
               (inst, username, security.enc(j.get("refresh_token")), security.enc(j["access_token"]), exp, now, row["id"]))
        return row["id"]
    return db.run("INSERT INTO users(ukey,inst,username,name,refresh_enc,access_enc,access_exp,created,last_login) VALUES(?,?,?,?,?,?,?,?,?)",
                  (ukey, inst, username, claims.get("name"), security.enc(j.get("refresh_token")), security.enc(j["access_token"]), exp, now, now)).lastrowid


# ---------- tokenek ----------
_locks, _guard, _last, _cooldown = {}, threading.Lock(), {}, {}


def _lock(uid):
    with _guard:
        return _locks.setdefault(uid, threading.RLock())


def _refresh(uid):
    u = db.one("SELECT refresh_enc FROM users WHERE id=?", (uid,))
    rt = security.dec(u["refresh_enc"]) if u else None
    if not rt:
        raise KretaError("Lejárt a belépés, jelentkezz be újra", 401, "relogin")
    try:
        r = requests.post(f"{C.IDP}/connect/token", headers={"User-Agent": C.TEACHER_UA}, timeout=15,
                          data={"grant_type": "refresh_token", "refresh_token": rt, "client_id": C.TEACHER_CLIENT_ID})
        j = r.json() if r.content else {}
    except (requests.RequestException, ValueError) as e:
        raise KretaError("A KRÉTA nem elérhető", 502, "net", str(e))
    if not r.ok or "access_token" not in j:
        print(f"[KRÉTA] token megújítás: {r.status_code} {str(j)[:200]}")
        if r.status_code in (400, 401):
            db.run("UPDATE users SET refresh_enc=NULL, access_enc=NULL WHERE id=?", (uid,))
            raise KretaError("Lejárt a belépés, jelentkezz be újra", 401, "relogin")
        raise KretaError("A KRÉTA ideiglenesen nem elérhető", 502, "net")
    db.run("UPDATE users SET access_enc=?, access_exp=?, refresh_enc=COALESCE(?,refresh_enc) WHERE id=?",
           (security.enc(j["access_token"]), time.time() + float(j.get("expires_in", 3000)) - 30, security.enc(j.get("refresh_token")), uid))
    return j["access_token"]


def _access(uid, force=False):
    u = db.one("SELECT access_enc, access_exp FROM users WHERE id=?", (uid,))
    if not force and u and u["access_exp"] > time.time():
        t = security.dec(u["access_enc"])
        if t:
            return t
    return _refresh(uid)


def base_url(inst):
    if not re.fullmatch(r"[a-z0-9-]{2,40}", inst or ""):
        raise KretaError("Érvénytelen iskolakód", 400, "inst")
    return f"https://{inst}.e-kreta.hu{C.NAPLO_PATH}"


# ---------- HTTP ----------
def _call(uid, inst, method, path, params=None, body=None):
    """Egy kérés a sorrend és a szünetek betartásával. 401-nél egyszer új tokennel (a KRÉTA be sem fogadta)."""
    url = base_url(inst) + path
    with _lock(uid):
        if _cooldown.get(uid, 0) > time.time():
            raise KretaError("A KRÉTA lassít minket, próbáld pár perc múlva", 429, "cooldown")
        wait = _last.get(uid, 0) + C.MIN_GAP + random.uniform(0.05, 0.3) - time.time()
        if wait > 0:
            time.sleep(wait)
        try:
            for attempt in (1, 2):
                r = requests.request(method, url, params=params, json=body, timeout=20, headers={
                    "Authorization": f"Bearer {_access(uid, force=attempt == 2)}", "User-Agent": C.TEACHER_UA})
                _last[uid] = time.time()
                if r.status_code == 401 and attempt == 1:
                    continue
                break
        except requests.RequestException as e:
            raise KretaError("A KRÉTA nem elérhető", 502, "net", str(e))
    if r.status_code in (429, 403):
        _cooldown[uid] = time.time() + C.COOLDOWN_429
    if r.status_code == 401:
        raise KretaError("Lejárt a belépés, jelentkezz be újra", 401, "relogin")
    return r


def _ttl(path):
    for prefix, ttl in (("Tanar/Profil", 86400), ("Enum/", 86400), ("Tanar/Tantargyfelosztas", 86400), ("OsztalyCsoport/Tanulok/Ertekeles", 600),
                        ("OsztalyCsoport/Tanulok", 12 * 3600), ("OsztalyCsoport/Ertekeles", 600), ("Orarend/Jelenlet", 120), ("Orarend", 600),
                        ("HaziFeladat", 600), ("OsztalyCsoport", 86400)):
        if path.startswith(prefix):
            return ttl
    return 600


def _reason(r):
    """A KRÉTA hibaüzenete röviden, ha a válaszban van ilyen."""
    try:
        j = r.json()
    except ValueError:
        return ""
    if isinstance(j, dict):
        for k in ("Message", "message", "Uzenet", "error_description", "ExceptionMessage", "title"):
            if isinstance(j.get(k), str) and j[k].strip():
                return j[k].strip()[:160]
    return ""


def get(uid, inst, path, params=None, fresh=False):
    """Olvasás gyorsítótárral. fresh=True: írás utáni visszaolvasás, mindig a KRÉTA-tól."""
    ckey = path + ("?" + urlencode(sorted((params or {}).items())) if params else "")
    row = db.one("SELECT body, fetched_at FROM cache WHERE user_id=? AND ckey=?", (uid, ckey))
    if row and not fresh and time.time() - row["fetched_at"] < _ttl(path):
        return json.loads(row["body"])
    try:
        r = _call(uid, inst, "GET", path, params)
    except KretaError as e:
        if row and e.code in ("net", "cooldown"):
            return json.loads(row["body"])  # inkább a régi adat, mint a semmi
        raise
    if not r.ok:
        print(f"[KRÉTA] GET {path} {params or ''} -> {r.status_code} {r.text[:300]}")
        if row and not fresh:
            return json.loads(row["body"])
        why = _reason(r)
        raise KretaError(f"A KRÉTA {r.status_code} hibát adott ({path}){': ' + why if why else ''}", 404 if r.status_code == 404 else 502, "kreta", r.text[:200])
    try:
        data = r.json() if r.text else None
    except ValueError:
        raise KretaError("A KRÉTA érvénytelen választ adott", 502, "kreta")
    if isinstance(data, dict) and "Adatcsomag" in data:  # a régi (v2) formátum csomagolása
        data = data["Adatcsomag"]
    db.run("INSERT INTO cache(user_id,ckey,body,fetched_at) VALUES(?,?,?,?) ON CONFLICT(user_id,ckey) DO UPDATE SET body=excluded.body, fetched_at=excluded.fetched_at",
           (uid, ckey, json.dumps(data), time.time()))
    return data


def exists(uid, inst, path, params=None):
    """Visszaolvasáshoz: van-e ilyen elem (404 = nincs)."""
    r = _call(uid, inst, "GET", path, params)
    return r.ok


def send(uid, inst, method, path, params=None, body=None):
    """Írás. Visszaad: a válasz JSON-ja (vagy None). Hibánál KretaError, a KRÉTA üzenetével, ha van."""
    print(f"[KRÉTA] {method} {path} {params or ''} {json.dumps(body, ensure_ascii=False)[:500] if body is not None else ''}")
    r = _call(uid, inst, method, path, params, body)
    try:
        data = r.json() if r.text else None
    except ValueError:
        data = None
    # a KRÉTA néha 200-zal, de a válaszban hibával tér vissza
    exc = (data[0] if isinstance(data, list) and data and isinstance(data[0], dict) else data if isinstance(data, dict) else {}).get("Exception")
    if not r.ok or exc:
        msg = (exc or {}).get("Message") if isinstance(exc, dict) else None
        items = "; ".join(f"{x.get('Id')}: {x.get('Message')}" for x in ((exc or {}).get("ValidationItems") or [])) if isinstance(exc, dict) else ""
        if not msg and isinstance(data, dict):
            msg = data.get("Message") or data.get("message") or data.get("error")
        print(f"[KRÉTA] írás hiba: {r.status_code} {r.text[:500]}")
        raise KretaError(f"A KRÉTA elutasította ({r.status_code}): {msg or 'ismeretlen hiba'}{' – ' + items if items else ''}", 502, "write", r.text[:300])
    return data


def invalidate(uid, *prefixes):
    for p in prefixes:
        db.run("DELETE FROM cache WHERE user_id=? AND ckey LIKE ?", (uid, p + "%"))
