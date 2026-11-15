"""Közösen felírt házik és dolgozatok: osztálynak vagy csoportnak (a „csak magamnak” a beállításokban marad).

Csak az iskolán belül, csak azok látják, akik a KRÉTA-órarendjük szerint abba az osztályba / csoportba járnak,
és csak a saját osztályodba / csoportodba írhatsz. Törölni a felíró és a fejlesztő tud.
"""
import datetime as dt
import json
import re
import time

from flask import Blueprint, g, jsonify, request

from .. import db, demo, security, shared

bp = Blueprint("shared", __name__, url_prefix="/api/shared")

MAX_POSTS, WINDOW = 30, 3600   # felírás felhasználónként óránként
KEEP_DAYS = 30                 # a lejárt bejegyzések ennyi napig látszanak még
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


def _out(r, uid, admin):
    return {"id": r["id"], "scope": r["scope"], "target": r["target"], "kind": r["kind"], "subject": r["subject"],
            "date": r["date"], "text": r["text"], "author": r["author_name"] or "", "mine": r["author_id"] == uid,
            "canDelete": r["author_id"] == uid or admin, "created": r["created"]}


@bp.get("")
@security.login_required
def items():
    u = g.user
    admin = security.is_admin(u)
    m = {**shared.membership(u, admin), "schoolLink": shared.school_link_allowed(u, admin)}
    targets = [("class", m["cls"])] if m["cls"] else []
    targets += [("group", x) for x in m["groups"]]
    if not targets:
        return jsonify(items=[], membership=m)
    since = (dt.date.today() - dt.timedelta(days=KEEP_DAYS)).isoformat()
    cond = " OR ".join("(scope=? AND target=?)" for _ in targets)
    rows = db.all_(f"SELECT * FROM shared_items WHERE inst=? AND date>=? AND ({cond}) ORDER BY date, id",
                   (m["inst"], since, *[x for t in targets for x in t]))
    return jsonify(items=[_out(r, u["id"], admin) for r in rows], membership=m)


@bp.post("")
@security.login_required
def add():
    u, d = g.user, request.get_json(silent=True) or {}
    kind, scope = d.get("kind"), d.get("scope")
    target = d.get("target").strip() if isinstance(d.get("target"), str) else ""
    subject = d.get("subject").strip()[:80] if isinstance(d.get("subject"), str) else ""
    text = d.get("text").strip()[:500] if isinstance(d.get("text"), str) else ""
    date = d.get("date") if isinstance(d.get("date"), str) and DATE_RE.fullmatch(d.get("date")) else ""
    if kind not in ("hw", "test") or scope not in ("class", "group"):
        return jsonify(error="Hibás kérés"), 400
    if not (subject and text and date):
        return jsonify(error="Add meg a tantárgyat, a dátumot és a szöveget"), 400
    m = shared.membership(u, security.is_admin(u))
    if not (scope == "class" and target and target == m["cls"]) and not (scope == "group" and target in m["groups"]):
        return jsonify(error="Csak a saját osztályodnak vagy csoportodnak írhatsz fel"), 403
    key = f"share:{u['id']}"
    if security.too_many_attempts(key, limit=MAX_POSTS, window=WINDOW):
        return jsonify(error="Túl sok felírás, próbáld később", code="throttle"), 429
    security.record_attempt(key)
    name = u["name"] or ("Teszt diák" if u["inst"] == demo.DEMO_INST else "")
    rid = db.run("INSERT INTO shared_items(inst,scope,target,kind,subject,date,text,author_id,author_name,created) VALUES(?,?,?,?,?,?,?,?,?,?)",
                 (m["inst"], scope, target, kind, subject, date, text, u["id"], name, time.time())).lastrowid
    return jsonify(ok=True, item=_out(db.one("SELECT * FROM shared_items WHERE id=?", (rid,)), u["id"], security.is_admin(u)))


@bp.delete("/<int:iid>")
@security.login_required
def remove(iid):
    u = g.user
    r = db.one("SELECT author_id, inst FROM shared_items WHERE id=?", (iid,))
    if not r or r["inst"] != shared.membership(u, security.is_admin(u))["inst"]:
        return jsonify(error="Nincs ilyen bejegyzés"), 404
    if r["author_id"] != u["id"] and not security.is_admin(u):
        return jsonify(error="Csak a felíró törölheti"), 403
    db.run("DELETE FROM shared_items WHERE id=?", (iid,))
    return jsonify(ok=True)


@bp.put("/membership")
@security.login_required
def set_membership():
    """Csak teszt fióknál: az osztály és a csoportok kézzel, hogy a megosztást ki lehessen próbálni."""
    u, d = g.user, request.get_json(silent=True) or {}
    if u["inst"] != demo.DEMO_INST:
        return jsonify(error="Az osztály és a csoport a KRÉTA-órarendből jön, kézzel csak teszt fióknál állítható"), 403
    admin = security.is_admin(u)
    if not shared.school_link_allowed(u, admin):
        return jsonify(error="A teszt osztály és csoport váltása most ki van kapcsolva (fejlesztői oldal)"), 403
    cls, groups = shared.clean_groups(d.get("cls"), d.get("groups"))
    inst = shared.clean_inst(d.get("inst"))
    if d.get("inst") and not inst:
        return jsonify(error="Az iskola KRÉTA-azonosítója kisbetűkből, számokból és kötőjelből áll (pl. klik035046001)"), 400
    body = {"cls": cls, "groups": groups, **({"inst": inst} if inst else {})}
    db.run("UPDATE users SET test_groups=? WHERE id=?", (json.dumps(body, ensure_ascii=False) if cls or groups or inst else None, u["id"]))
    m = shared.membership(db.one("SELECT * FROM users WHERE id=?", (u["id"],)), admin)
    return jsonify(ok=True, membership={**m, "schoolLink": shared.school_link_allowed(u, admin)})
