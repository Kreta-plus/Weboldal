"""Olvasás: minden a szolgáltatón (teszt fiók vagy KRÉTA) keresztül, a base.py-ban leírt formában."""
import datetime as dt
from functools import wraps

from flask import Blueprint, g, jsonify, request

from .. import config as C
from .. import ops, providers, security
from .. import kreta_client
from ..kreta_client import KretaError
from ..providers import NotSupported

bp = Blueprint("data", __name__, url_prefix="/api/t")


def with_provider(fn):
    @wraps(fn)
    @security.login_required
    def wrapper(*a, **kw):
        try:
            return fn(providers.for_user(g.user), *a, **kw)
        except NotSupported as e:
            return jsonify(error=e.msg, code="todo"), 501
        except KretaError as e:
            return jsonify(error=e.msg, code=e.code), e.status

    return wrapper


def _avg(gs):
    w = sum(x["weight"] for x in gs)
    return round(sum(x["value"] * x["weight"] for x in gs) / w, 2) if w else None


def _date_arg(name, default):
    try:
        return dt.date.fromisoformat(request.args.get(name, "")).isoformat()
    except ValueError:
        return default.isoformat()


@bp.post("/refresh")
@with_provider
def refresh(p):
    """Kézi frissítés. A teszt fiók adatai helyben vannak, ott nincs mit újra lekérni."""
    if p.demo:
        return jsonify(ok=True, wait=0)
    wait = kreta_client.refresh(g.user["id"])
    if wait:
        return jsonify(error=f"Túl gyakran frissítenél, {wait} mp múlva lehet újra", code="throttle", wait=wait), 429
    return jsonify(ok=True, wait=kreta_client.REFRESH_GAP)


@bp.get("/overview")
@with_provider
def overview(p):
    caps = p.capabilities()
    return jsonify(teacher=p.teacher(), classes=p.classes(), groups=[{k: v for k, v in g.items() if k not in ("ocs", "tid")} for g in p.groups()],
                   capabilities=sorted(caps), enabledOps=sorted(o for o in caps if p.enabled(o)), demo=p.demo, liveWrite=C.LIVE_WRITE,
                   gradeTypes=p.grade_types(), testKinds=p.test_kinds(), noteKinds=p.note_kinds(),
                   fixedWeights=p.fixed_weights, absenceTotals=p.absence_totals, bells=ops.bells())


@bp.get("/lessons")
@with_provider
def lessons(p):
    today = dt.date.today()
    mon = today - dt.timedelta(days=today.weekday())
    return jsonify(p.lessons(_date_arg("from", mon), _date_arg("to", mon + dt.timedelta(days=6))))


@bp.get("/group/<gid>")
@with_provider
def group(p, gid):
    grp = next((x for x in p.groups() if x["id"] == gid), None)
    if not grp:
        return jsonify(error="Nem található"), 404
    grp = {k: v for k, v in grp.items() if k not in ("ocs", "tid")}
    studs = p.students(group_id=gid)
    if request.args.get("summary") == "1":  # csak átlag és jegyszám (a KRÉTA-ban csoportonként egy hívás)
        sm = p.summary(gid)
        out = [{**s, "avg": sm.get(s["id"], {}).get("avg"), "count": sm.get(s["id"], {}).get("count", 0)} for s in studs]
        return jsonify(group=grp, students=out)
    gs = p.grades(group_id=gid)
    ab = p.absences(group_id=gid) if p.absence_totals else []
    out = []
    for s in studs:
        mine = sorted((x for x in gs if x["studentId"] == s["id"]), key=lambda x: (x["date"], x["created"]))
        out.append({**s, "grades": mine, "avg": _avg(mine),
                    "absent": sum(1 for x in ab if x["studentId"] == s["id"] and x["kind"] == "absent") if p.absence_totals else None,
                    "late": sum(1 for x in ab if x["studentId"] == s["id"] and x["kind"] == "late") if p.absence_totals else None})
    return jsonify(group=grp, students=out, avg=_avg(gs), count=len(gs))


@bp.get("/class/<cid>")
@with_provider
def klass(p, cid):
    cls = next((c for c in p.classes() if c["id"] == cid), None)
    if not cls:
        return jsonify(error="Nem található"), 404
    grps = [{k: v for k, v in x.items() if k not in ("ocs", "tid")} for x in p.groups() if x["classId"] == cid]
    sums = {g["id"]: p.summary(g["id"]) for g in grps}
    out = []
    for s in p.students(class_id=cid):
        per = {gid: sm.get(s["id"], {}) for gid, sm in sums.items()}
        n = sum(x.get("count") or 0 for x in per.values())
        tot = sum((x.get("avg") or 0) * (x.get("count") or 0) for x in per.values() if x.get("avg"))
        ab = p.absences(student_id=s["id"]) if p.absence_totals else []
        out.append({**s, "avg": round(tot / n, 2) if n and tot else None, "count": n, "bySubject": {gid: x.get("avg") for gid, x in per.items()},
                    "absent": sum(1 for x in ab if x["kind"] == "absent") if p.absence_totals else None,
                    "late": sum(1 for x in ab if x["kind"] == "late") if p.absence_totals else None})
    return jsonify(cls=cls, groups=grps, students=out)


@bp.get("/student/<sid>")
@with_provider
def student(p, sid):
    s = next((x for x in p.students() if x["id"] == sid), None)
    if not s:
        return jsonify(error="Nem található"), 404
    return jsonify(student=s, grades=sorted(p.grades(student_id=sid), key=lambda x: x["date"], reverse=True),
                   absences=sorted(p.absences(student_id=sid), key=lambda x: (x["date"], x["nr"]), reverse=True),
                   notes=p.notes(student_id=sid))


@bp.get("/homework")
@with_provider
def homework(p):
    return jsonify(p.homework())


@bp.get("/tests")
@with_provider
def tests(p):
    return jsonify(p.tests())


@bp.get("/notes")
@with_provider
def notes(p):
    names = {s["id"]: s for s in p.students()}
    return jsonify([{**n, "studentName": names.get(n["studentId"], {}).get("name", "?"), "classId": names.get(n["studentId"], {}).get("classId")} for n in p.notes()])


@bp.get("/attendance")
@with_provider
def attendance(p):
    """Egy óra névsora a már rögzített mulasztásokkal."""
    gid, date = request.args.get("groupId", ""), _date_arg("date", dt.date.today())
    try:
        nr = int(request.args.get("nr", ""))
    except ValueError:
        return jsonify(error="Hiányzó óraszám"), 400
    lesson = next((l for l in p.lessons(date, date) if l["groupId"] == gid and l["nr"] == nr), None)
    if not lesson:
        return jsonify(error="Ilyen órád nincs"), 404
    ab = {x["studentId"]: x for x in p.absences(group_id=gid, date=date, nr=nr)}
    return jsonify(lesson=lesson, students=[{**s, "mark": ab.get(s["id"])} for s in p.students(group_id=gid)])


@bp.get("/log")
@security.login_required
def log():
    return jsonify(ops.audit(g.user["id"]))
