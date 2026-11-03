"""Írási műveletek: ellenőrzés → előnézet → jóváhagyás → végrehajtás → visszaolvasás → napló.

Minden írás két lépésben megy:
  1. preview(): a szerver ellenőrzi és megtisztítja az adatot, emberi nyelvű előnézetet ad és egy
     egyszer használható tokent. Ekkor még semmi nem íródik.
  2. commit(token): a tokenhez tartozó (már ellenőrzött) adatot hajtja végre. A token azonnal elhasználódik,
     így dupla kattintásból vagy újraküldésből nem lesz dupla jegy. Automatikus újrapróbálás nincs.
Új művelet: egy validátor ide (OPS), és egy apply/verify ág a szolgáltatóba.
"""
import datetime as dt
import json
import re
import secrets
import time

from . import config as C
from . import db
from .kreta_client import KretaError
from .providers.base import BELLS, HEAD_ONLY, WEIGHTS, NotSupported


class OpError(Exception):
    def __init__(self, msg, status=400):
        super().__init__(msg)
        self.msg, self.status = msg, status


MONTHS = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."]


def _hu(ds):
    d = dt.date.fromisoformat(ds)
    return f"{d.year}. {MONTHS[d.month - 1]} {d.day}."


def _date(v, what="dátum"):
    try:
        return dt.date.fromisoformat(str(v)[:10]).isoformat()
    except ValueError:
        raise OpError(f"Érvénytelen {what}")


def _text(v, what, maxlen, required=True):
    s = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", str(v or "")).strip()
    if required and not s:
        raise OpError(f"Add meg: {what}")
    if len(s) > maxlen:
        raise OpError(f"Túl hosszú: {what} (max. {maxlen} karakter)")
    return s


def _int(v, what, lo, hi):
    try:
        n = int(v)
    except (TypeError, ValueError):
        raise OpError(f"Érvénytelen {what}")
    if not lo <= n <= hi:
        raise OpError(f"Érvénytelen {what}")
    return n


def _group(prov, gid):
    g = next((g for g in prov.groups() if g["id"] == gid), None)
    if not g:
        raise OpError("Ismeretlen osztály / tantárgy")
    return g


def _students(prov, g):
    return {s["id"]: s for s in prov.students(group_id=g["id"])}


def _lesson(prov, g, date, nr):
    l = next((l for l in prov.lessons(date, date) if l["groupId"] == g["id"] and l["nr"] == nr), None)
    if not l:
        raise OpError(f"{_hu(date)} {nr}. órában nincs {g['name']} órád")
    return l


def _type_weight(prov, p):
    """Jegytípus és súly. Ha a súlyt a KRÉTA a típusból számolja (fixed_weights), nem küldünk súlyt."""
    typ = p.get("type")
    if typ not in prov.grade_types():
        raise OpError("Válassz jegytípust")
    if prov.fixed_weights:
        return typ, None
    weight = _int(p.get("weight"), "súly", 1, 1000)
    if weight not in WEIGHTS:
        raise OpError("Érvénytelen súly")
    return typ, weight


_w = lambda w: f"{w}%" if w else "súly a KRÉTA szerint"  # noqa: E731


# ---- validátorok: (prov, nyers adat) -> (tiszta adat, cím, sorok) ----
def v_grade_add(prov, p):
    g = _group(prov, p.get("groupId"))
    date = _date(p.get("date"))
    if date > dt.date.today().isoformat():
        raise OpError("Jövőbeli dátumra nem lehet jegyet beírni")
    typ, weight = _type_weight(prov, p)
    topic = _text(p.get("topic"), "téma", 120, required=False)
    studs = _students(prov, g)
    entries, seen = [], set()
    for e in p.get("entries") or []:
        sid = e.get("studentId")
        if e.get("value") in (None, ""):
            continue
        if sid not in studs:
            raise OpError("Ismeretlen diák a listában")
        if sid in seen:
            raise OpError(f"{studs[sid]['name']} kétszer szerepel")
        seen.add(sid)
        entries.append({"studentId": sid, "value": _int(e.get("value"), "jegy", 1, 5)})
    if not entries:
        raise OpError("Legalább egy diáknak adj jegyet")
    if len(entries) > C.MAX_ENTRIES:
        raise OpError("Túl sok bejegyzés egyszerre")
    clean = {"groupId": g["id"], "date": date, "type": typ, "weight": weight, "topic": topic, "entries": entries}
    title = f"Jegybeírás: {g['name']} · {typ} · {_w(weight)} · {_hu(date)}" + (f" · {topic}" if topic else "")
    lines = [{"k": studs[e["studentId"]]["name"], "v": str(e["value"]), "grade": e["value"]} for e in sorted(entries, key=lambda e: studs[e["studentId"]]["name"])]
    return clean, title, lines


def _find_grade(prov, gid, group_id=None):
    gs = prov.grades(group_id=group_id) if group_id and any(g["id"] == group_id for g in prov.groups()) else prov.grades()
    gr = next((x for x in gs if x["id"] == gid), None)
    if not gr:
        raise OpError("Ez a jegy nem található")
    g = _group(prov, gr["groupId"])
    return gr, g, _students(prov, g).get(gr["studentId"], {"name": "?"})


def v_grade_edit(prov, p):
    gr, g, s = _find_grade(prov, p.get("gradeId"), p.get("groupId"))
    typ, weight = _type_weight(prov, p)
    clean = {"gradeId": gr["id"], "groupId": g["id"], "studentId": gr["studentId"], "value": _int(p.get("value"), "jegy", 1, 5), "weight": weight, "type": typ,
             "topic": _text(p.get("topic"), "téma", 120, required=False)}
    old = f"{gr['value']} · {gr['type']} · {_w(gr['weight'])}"
    new = f"{clean['value']} · {typ} · {_w(weight) if weight else _w(None)}"
    return clean, f"Jegy módosítása: {s['name']} · {g['name']} · {_hu(gr['date'])}", [{"k": "Eddig", "v": old}, {"k": "Új", "v": new, "grade": clean["value"]}]


def v_grade_delete(prov, p):
    gr, g, s = _find_grade(prov, p.get("gradeId"), p.get("groupId"))
    return {"gradeId": gr["id"], "groupId": g["id"], "studentId": gr["studentId"]}, f"Jegy törlése: {g['name']}", [{"k": s["name"], "v": f"{gr['value']} · {gr['type']} · {_hu(gr['date'])}", "grade": gr["value"]}]


def v_hw_add(prov, p):
    g = _group(prov, p.get("groupId"))
    due = _date(p.get("due"), "határidő")
    if due < dt.date.today().isoformat():
        raise OpError("A határidő nem lehet a múltban")
    text = _text(p.get("text"), "feladat szövege", 2000)
    return {"groupId": g["id"], "due": due, "text": text}, f"Házi feladat kiadása: {g['name']}", [{"k": "Határidő", "v": _hu(due)}, {"k": "Feladat", "v": text}]


def v_hw_delete(prov, p):
    h = next((h for h in prov.homework() if h["id"] == p.get("homeworkId")), None)
    if not h:
        raise OpError("Ez a házi feladat nem található")
    g = _group(prov, h["groupId"])
    return {"homeworkId": h["id"]}, f"Házi feladat törlése: {g['name']}", [{"k": "Határidő", "v": _hu(h["due"])}, {"k": "Feladat", "v": h["text"]}]


def v_test_add(prov, p):
    g = _group(prov, p.get("groupId"))
    date = _date(p.get("date"))
    if date < dt.date.today().isoformat():
        raise OpError("Múltbeli dátumra nem lehet számonkérést bejelenteni")
    nr = _int(p.get("nr"), "óraszám", 0, 8)
    _lesson(prov, g, date, nr)
    kind = p.get("kind")
    if kind not in prov.test_kinds():
        raise OpError("Válaszd ki a számonkérés módját")
    topic = _text(p.get("topic"), "téma", 120)
    if any(t["groupId"] == g["id"] and t["date"] == date and t["nr"] == nr for t in prov.tests()):
        raise OpError("Erre az órára már van bejelentett számonkérés")
    return ({"groupId": g["id"], "date": date, "nr": nr, "kind": kind, "topic": topic}, f"Számonkérés bejelentése: {g['name']}",
            [{"k": "Időpont", "v": f"{_hu(date)}, {nr}. óra"}, {"k": "Mód", "v": kind}, {"k": "Téma", "v": topic}])


def v_test_delete(prov, p):
    t = next((t for t in prov.tests() if t["id"] == p.get("testId")), None)
    if not t:
        raise OpError("Ez a számonkérés nem található")
    g = _group(prov, t["groupId"])
    return {"testId": t["id"]}, f"Számonkérés törlése: {g['name']}", [{"k": "Időpont", "v": f"{_hu(t['date'])}, {t['nr']}. óra"}, {"k": t["kind"], "v": t["topic"]}]


def _attendance(prov, p):
    g = _group(prov, p.get("groupId"))
    date = _date(p.get("date"))
    if date > dt.date.today().isoformat():
        raise OpError("Jövőbeli órára nem lehet mulasztást rögzíteni")
    nr = _int(p.get("nr"), "óraszám", 0, 8)
    l = _lesson(prov, g, date, nr)
    studs = _students(prov, g)
    entries, seen = [], set()
    for e in p.get("entries") or []:
        sid = e.get("studentId")
        if sid not in studs:
            raise OpError("Ismeretlen diák a listában")
        if sid in seen:
            continue
        seen.add(sid)
        kind = e.get("kind")
        if kind not in ("absent", "late"):
            raise OpError("Érvénytelen mulasztástípus")
        minutes = _int(e.get("minutes"), "késés perce", 1, 45) if kind == "late" else 0
        entries.append({"studentId": sid, "kind": kind, "minutes": minutes})
    lines = [{"k": studs[e["studentId"]]["name"], "v": "hiányzik" if e["kind"] == "absent" else f"késett {e['minutes']} percet"}
             for e in sorted(entries, key=lambda e: studs[e["studentId"]]["name"])]
    if not lines:
        lines = [{"k": "Mindenki jelen van", "v": f"{len(studs)} fő"}]
    return g, date, nr, l, entries, lines


def v_absence(prov, p):
    g, date, nr, _, entries, lines = _attendance(prov, p)
    return {"groupId": g["id"], "date": date, "nr": nr, "entries": entries}, f"Mulasztások rögzítése: {g['name']} · {_hu(date)}, {nr}. óra", lines


def v_lesson_log(prov, p):
    """Óranaplózás: téma és mulasztások egyszerre (a KRÉTA is egy kérésben kéri)."""
    g, date, nr, l, entries, lines = _attendance(prov, p)
    topic = _text(p.get("topic"), "az óra témája", 200)
    head = ([{"k": "Téma eddig", "v": l["topic"]}] if l.get("topic") and l["topic"] != topic else []) + [{"k": "Téma", "v": topic}]
    return {"groupId": g["id"], "date": date, "nr": nr, "topic": topic, "entries": entries}, f"Óra naplózása: {g['name']} · {_hu(date)}, {nr}. óra", head + lines


def v_topic(prov, p):
    g = _group(prov, p.get("groupId"))
    date = _date(p.get("date"))
    if date > dt.date.today().isoformat():
        raise OpError("Jövőbeli órához még nem írható be a téma")
    nr = _int(p.get("nr"), "óraszám", 0, 8)
    l = _lesson(prov, g, date, nr)
    topic = _text(p.get("topic"), "az óra témája", 200)
    lines = ([{"k": "Eddig", "v": l["topic"]}] if l.get("topic") else []) + [{"k": "Téma", "v": topic}]
    return {"groupId": g["id"], "date": date, "nr": nr, "topic": topic}, f"Haladási napló: {g['name']} · {_hu(date)}, {nr}. óra", lines


def v_note_add(prov, p):
    kind = p.get("kind")
    if kind not in prov.note_kinds():
        raise OpError("Válaszd ki a feljegyzés típusát")
    date = _date(p.get("date"))
    if date > dt.date.today().isoformat():
        raise OpError("Jövőbeli dátummal nem írható feljegyzés")
    title = _text(p.get("title"), "cím", 80)
    text = _text(p.get("text"), "szöveg", 1000)
    studs = {s["id"]: s for g in prov.groups() for s in prov.students(group_id=g["id"])}  # csak a saját diákjaid
    head = {c["id"] for c in prov.classes() if c["head"]}
    ids = list(dict.fromkeys(p.get("studentIds") or []))
    if not ids:
        raise OpError("Válassz legalább egy diákot")
    if len(ids) > C.MAX_ENTRIES:
        raise OpError("Túl sok diák egyszerre")
    for sid in ids:
        if sid not in studs:
            raise OpError("Ismeretlen diák a listában")
        if kind in HEAD_ONLY and studs[sid]["classId"] not in head:
            raise OpError(f"{kind} csak a saját osztályod diákjainak adható ({studs[sid]['name']} nem az)")
    lines = [{"k": "Típus", "v": kind}, {"k": "Cím", "v": title}, {"k": "Szöveg", "v": text}] + [{"k": "Diák", "v": studs[s]["name"]} for s in sorted(ids, key=lambda s: studs[s]["name"])]
    return {"studentIds": ids, "kind": kind, "title": title, "text": text, "date": date}, f"Feljegyzés: {kind} · {len(ids)} diák · {_hu(date)}", lines


def v_note_delete(prov, p):
    n = next((n for n in prov.notes() if n["id"] == p.get("noteId")), None)
    if not n:
        raise OpError("Ez a feljegyzés nem található")
    s = next((s for s in prov.students() if s["id"] == n["studentId"]), {"name": "?"})
    return {"noteId": n["id"]}, f"Feljegyzés törlése: {s['name']}", [{"k": n["kind"], "v": n["title"]}, {"k": "Dátum", "v": _hu(n["date"])}]


OPS = {
    "grade.add": v_grade_add,
    "grade.edit": v_grade_edit,
    "grade.delete": v_grade_delete,
    "homework.add": v_hw_add,
    "homework.delete": v_hw_delete,
    "test.add": v_test_add,
    "test.delete": v_test_delete,
    "absence.record": v_absence,
    "lesson.topic": v_topic,
    "lesson.log": v_lesson_log,
    "note.add": v_note_add,
    "note.delete": v_note_delete,
}
DANGER = {"grade.delete", "homework.delete", "test.delete", "note.delete"}


def preview(uid, prov, op, payload):
    if op not in OPS:
        raise OpError("Ismeretlen művelet")
    if op not in prov.capabilities():
        raise OpError("Ez a művelet ezzel a fiókkal nem érhető el.", 501)
    try:
        clean, title, lines = OPS[op](prov, payload if isinstance(payload, dict) else {})
        request = prov.describe(op, clean)  # valódi KRÉTA: a pontos kérés, ami kimenne
    except NotSupported as e:
        raise OpError(e.msg, 501)
    except KretaError as e:
        raise OpError(e.msg, e.status if e.status in (401, 429) else 502)
    token = secrets.token_urlsafe(24)
    now = time.time()
    db.run("DELETE FROM pending_ops WHERE user_id=? AND created<?", (uid, now - C.PENDING_TTL))
    db.run("INSERT INTO pending_ops(token,user_id,op,payload,created) VALUES(?,?,?,?,?)",
           (token, uid, op, json.dumps({"data": clean, "title": title, "request": request}, ensure_ascii=False), now))
    return {"token": token, "op": op, "title": title, "lines": lines, "danger": op in DANGER, "simulated": prov.demo,
            "request": request, "enabled": prov.enabled(op)}


def commit(uid, prov, token):
    row = db.one("SELECT * FROM pending_ops WHERE token=? AND user_id=?", (str(token or ""), uid))
    if row and not prov.enabled(row["op"]):
        raise OpError("Ez a művelet nincs bekapcsolva éles írásra, ezért nem küldtem el. (KT_LIVE_WRITE=1 és KT_LIVE_OPS a szerveren.)", 403)
    # a token azonnal elhasználódik: ha két kérés jön, csak az egyik törli ténylegesen
    if not row or db.run("DELETE FROM pending_ops WHERE token=?", (row["token"],)).rowcount != 1:
        raise OpError("Ez a művelet már el lett küldve vagy lejárt. Kezdd újra.", 409)
    if time.time() - row["created"] > C.PENDING_TTL:
        raise OpError("A jóváhagyás lejárt (10 perc). Kezdd újra.", 409)
    op, body = row["op"], json.loads(row["payload"])
    data, title, request = body["data"], body["title"], body.get("request")

    def log(status, detail=None):
        return db.run("INSERT INTO audit(user_id,ts,op,title,payload,status,detail,simulated) VALUES(?,?,?,?,?,?,?,?)",
                      (uid, time.time(), op, title, json.dumps(data, ensure_ascii=False), status, detail, int(prov.demo))).lastrowid

    try:
        result = prov.apply(op, data, request)
    except NotSupported as e:
        log("error", e.msg)
        raise OpError(e.msg, 501)
    except KretaError as e:
        log("error", e.msg)
        raise OpError(e.msg + " Nézd meg a KRÉTA-ban, mielőtt újra próbálod.", 502)
    except Exception as e:  # noqa: BLE001 – a naplóba minden hiba bekerül, újrapróbálás nincs
        log("error", str(e)[:300])
        raise OpError("A művelet nem sikerült. Nézd meg a KRÉTA-ban, mielőtt újra próbálod.", 502)
    try:
        ok = bool(prov.verify(op, data, result))
    except Exception:  # noqa: BLE001
        ok = False
    log_id = log("ok" if ok else "unverified", None if ok else "A visszaolvasás nem erősítette meg, ellenőrizd a KRÉTA-ban.")
    return {"ok": True, "verified": ok, "logId": log_id, "simulated": prov.demo}


def audit(uid, limit=200):
    rows = db.all_("SELECT id,ts,op,title,payload,status,detail,simulated FROM audit WHERE user_id=? ORDER BY ts DESC LIMIT ?", (uid, limit))
    return [{"id": r["id"], "ts": r["ts"], "op": r["op"], "title": r["title"], "status": r["status"], "detail": r["detail"],
             "simulated": bool(r["simulated"]), "count": len((lambda d: d.get("entries") or d.get("studentIds") or [])(json.loads(r["payload"]))) or None} for r in rows]


def bells():
    return {str(k): v for k, v in BELLS.items()}
