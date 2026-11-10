"""Valódi KRÉTA, tanári fiók („Napló” API, V3).

A végpontok és a mezőnevek nem hivatalos, nyílt forráskódú kliensekből származnak (kreta.js NaploApiV3,
Coware Napló+), ÉLŐBEN NINCSENEK KIPRÓBÁLVA. Ezért:
  - minden írás előnézetében látszik a pontos kérés (módszer, útvonal, JSON), ami kimenne;
  - alapból minden támogatott művelet kimegy a megerősítés után; KT_LIVE_WRITE=0 vagy KT_LIVE_OPS szűkíti;
  - nincs automatikus újrapróbálás, és írás után a verify() mindig a KRÉTA-tól olvas vissza.

Megbízhatóság műveletenként (a forrásokban látott kérésforma alapján):
  lesson.log / lesson.topic  Orarend/OraNaplozas – V3 kérésforma ismert
  homework.add / .delete     HaziFeladat – V3 kérésforma ismert
  test.add / .delete         Orarend/BejelentettSzamonkeres – V3 kérésforma ismert
  grade.edit / .delete       OsztalyCsoport/Tanulok/Ertekeles/{id} – V3 kérésforma ismert
  grade.add                  OsztalyCsoport/Ertekeles – KÍSÉRLETI: a kreta.js V3 kérésmodellje (a v2 forma 500-at adott)
  note.add / .delete         nem támogatott (a V3 API-ban nincs szabad szöveges feljegyzés)
"""
import datetime as dt
import re
import time
from zoneinfo import ZoneInfo

from .. import config as C
from .. import kreta_client as K
from .base import GRADE_TYPES, NotSupported, Provider

TZ = ZoneInfo("Europe/Budapest")
MARKS = {"elégtelen": 1, "elégséges": 2, "közepes": 3, "jó": 4, "jeles": 5}
IMPLEMENTED = {"lesson.log", "lesson.topic", "grade.add", "grade.edit", "grade.delete", "homework.add", "homework.delete", "test.add", "test.delete"}
EXPERIMENTAL = {"grade.add": "Kísérleti: a kérés formája a kreta.js V3 kérésmodelljéből (ClassGroupEvaluationRequestDto) származik, élőben még nem ment át. Beküldés után nézd meg a KRÉTA-ban."}

# A KRÉTA szótárazonosítói (Adatszotar) intézményfüggetlenek. A V3 Napló API a MulasztasTipusEnum-ot nem adja ki
# („Nem engedélyezett vagy nem létező enum!”), ezért a jelenlét-típusok fixek. Forrás: a diák API válaszai
# („1498,Jelenlet”, „1500,hianyzas”); a késés 1499-e következtetés (a kettő között), de minden naplózás után a Jelenlet visszaolvasása ellenőrzi.
PRESENCE = {"present": 1498, "late": 1499, "absent": 1500}
# Élőben kipróbált műveletek: beküldés után a program teljesen visszaellenőrzi őket (téma, állapot, minden diák jelenléte),
# ezért a felület nem kéri, hogy a tanár a KRÉTA-ban is megnézze.
PROVEN = {"lesson.log", "lesson.topic"}
# Tartalék, ha az ErtekelesModEnum lekérése sem megy (azonosítók a diák API jegyeiből).
KNOWN_MODES = [{"Id": 1507, "Nev": "irasbeli_temazaro_dolgozat", "Leiras": "Írásbeli témazáró dolgozat"},
               {"Id": 1508, "Nev": "irasbeli_ropdolgozat", "Leiras": "Írásbeli röpdolgozat"},
               {"Id": 1509, "Nev": "szobeli_felelet", "Leiras": "Szóbeli felelet"},
               {"Id": 1511, "Nev": "gyakorlati_feladat", "Leiras": "Gyakorlati feladat"},
               {"Id": 1516, "Nev": "orai_munka", "Leiras": "Órai munka"}]
# Az óra állapota (Allapot) a KRÉTA szótárából: 1 naplózott, 2 nem naplózott, 3 elmaradt, 4 tanév rendje esemény
# (a diák API „1,Naplozott” … „4,TanevRendjeEsemeny” értékei). A „Naplozart” NEM ezt jelenti, hanem hogy a napló le van zárva.
LOGGED, CANCELLED = 1, (3, 4)
_ENUM_FAIL = {}  # enumnév -> eddig nem kérdezzük újra


def _local(s):
    """KRÉTA időpont (ISO, általában UTC „Z”) → helyi (budapesti) idő."""
    if not s:
        return None
    s = str(s).replace("Z", "+00:00")
    try:
        d = dt.datetime.fromisoformat(s)
    except ValueError:
        try:
            d = dt.datetime.fromisoformat(s[:19])
        except ValueError:
            return None
    return d.astimezone(TZ) if d.tzinfo else d.replace(tzinfo=TZ)


def _day(s):
    d = _local(s)
    return d.date().isoformat() if d else None


def _utc_midnight(date):
    """Helyi éjfél UTC-ben, ahogy a mobilkliensek (JavaScript Date) küldik: 2026-11-02T23:00:00.000Z."""
    d = dt.datetime.fromisoformat(date).replace(tzinfo=TZ).astimezone(dt.timezone.utc)
    return d.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _strip_html(s):
    return re.sub(r"\s+\n", "\n", re.sub(r"<[^>]+>", " ", re.sub(r"<br\s*/?>|</p>", "\n", str(s or ""), flags=re.I))).strip()


def _value(e):
    oid = e.get("ErtekelesOsztalyzatId")
    if isinstance(oid, int) and 1501 <= oid <= 1505:
        return oid - 1500
    for k in ("Ertekeles", "ErtekelesOsztalyzatNev"):
        v = str(e.get(k) or "").strip().lower()
        if re.fullmatch(r"[1-5]", v):
            return int(v)
        if v in MARKS:
            return MARKS[v]
    return None


class KretaProvider(Provider):
    fixed_weights = True      # a súlyt a KRÉTA a módból (Témazáró stb.) számolja
    absence_totals = False    # összesített mulasztás csak óránként kérdezhető le

    def __init__(self, user):
        self.uid, self.inst = user["id"], user["inst"]
        self._memo = {}

    def _get(self, path, params=None, fresh=False):
        return K.get(self.uid, self.inst, path, params, fresh)

    def _m(self, key, fn):
        if key not in self._memo:
            self._memo[key] = fn()
        return self._memo[key]

    def _enum(self, name):
        # A paraméter neve a Coware Napló+ szerint „engedelyezettEnumName” (a KRÉTA hibaüzenete is erre utal:
        # „Nem engedélyezett vagy nem létező enum”); a kreta.js „enumTipus”-a tartaléknak marad.
        def load():
            if _ENUM_FAIL.get(name, 0) > time.time():  # a KRÉTA nemrég elutasította: ne kérdezzük minden oldalbetöltésnél
                return []
            for params in ({"hash": "", "engedelyezettEnumName": name}, {"enumTipus": name}):
                try:
                    data = self._get("Enum/NaploEnum", params)
                except K.KretaError as e:
                    print(f"[KRÉTA] {name} {list(params)}: {e.msg}")
                    continue
                if isinstance(data, dict):  # ha a válasz enumnév szerint csoportosít
                    data = data.get(name) or next((v for v in data.values() if isinstance(v, list)), [])
                return [x for x in data or [] if isinstance(x, dict) and "Id" in x]
            _ENUM_FAIL[name] = time.time() + 6 * 3600
            return []
        return self._m("enum:" + name, load)

    def _window(self):
        """Az órarend −14…+35 napra (8 heti lekérés, utána gyorsítótárból) a házikhoz, számonkérésekhez és a tantárgynevekhez."""
        t = dt.date.today()
        return self._m("window", lambda: self._raw_lessons((t - dt.timedelta(days=14)).isoformat(), (t + dt.timedelta(days=35)).isoformat()))

    def _raw_lessons(self, a, b):
        """Az órarendet hetenként kérjük (hétfő–vasárnap), ahogy a mobilkliens: hosszabb időszakra a KRÉTA 400-at ad.
        Az egész heteket a gyorsítótár is újrahasznosítja, a napokra itt szűrünk."""
        d, end, out = dt.date.fromisoformat(a), dt.date.fromisoformat(b), []
        d -= dt.timedelta(days=d.weekday())
        while d <= end:
            week = self._get("Orarend", {"datumTol": d.isoformat(), "datumIg": (d + dt.timedelta(days=6)).isoformat()}) or []
            out += [e for e in week if e.get("OsztalyCsoportId") and e.get("TantargyId") and a <= (_day(e.get("Kezdete")) or "") <= b]
            d += dt.timedelta(days=7)
        return out

    # --- olvasás ---
    def teacher(self):
        p = self._get("Tanar/Profil") or {}
        return {"name": p.get("Nev") or "Tanár", "school": p.get("IntezmenyNev") or "", "subjects": sorted({g["subject"] for g in self.groups()})}

    def groups(self):
        def load():
            names = {e["TantargyId"]: e.get("Nev") for e in self._window()}
            out = {}
            for d in self._get("Tanar/Tantargyfelosztas") or []:
                ocs, tid = d.get("OsztalyCsoportId"), d.get("TantargyId")
                if ocs and tid:
                    out[f"{ocs}-{tid}"] = (ocs, d.get("OsztalyCsoportNev"), tid, d.get("TantargyNev") or names.get(tid))
            for e in self._window():  # helyettesítés vagy hiányzó tantárgyfelosztás: az órarendből
                out.setdefault(f"{e['OsztalyCsoportId']}-{e['TantargyId']}", (e["OsztalyCsoportId"], e.get("OsztalyCsoportNev"), e["TantargyId"], e.get("Nev")))
            return sorted(({"id": gid, "classId": str(ocs), "className": cn or "?", "subject": sn or f"Tantárgy {tid}", "name": f"{cn or '?'} · {sn or f'Tantárgy {tid}'}",
                            "ocs": ocs, "tid": tid} for gid, (ocs, cn, tid, sn) in out.items()), key=lambda g: g["name"])
        return self._m("groups", load)

    def _grp(self, gid):
        g = next((g for g in self.groups() if g["id"] == gid), None)
        if not g:
            raise NotSupported("Ismeretlen osztály / tantárgy")
        return g

    def classes(self):
        seen = {}
        for g in self.groups():
            seen.setdefault(g["classId"], g["className"])
        return [{"id": cid, "name": n, "head": False, "count": len(self.students(class_id=cid))} for cid, n in seen.items()]

    def students(self, class_id=None, group_id=None):
        if group_id:
            class_id = self._grp(group_id)["classId"]
        if class_id is None:
            out = {}
            for cid in {g["classId"] for g in self.groups()}:
                for s in self.students(class_id=cid):
                    out.setdefault(s["id"], s)
            return sorted(out.values(), key=lambda s: s["name"])
        rows = self._get("OsztalyCsoport/Tanulok", {"osztalyCsoportId": class_id}) or []
        return sorted(({"id": str(r["TanuloId"]), "name": r.get("TanuloNev") or "?", "classId": class_id} for r in rows if r.get("TanuloId")), key=lambda s: s["name"])

    def _student_grades(self, g, sid, fresh=False):
        rows = self._get("OsztalyCsoport/Tanulok/Ertekeles", {"tanuloId": sid, "tantargyId": g["tid"], "osztalyCsoportId": g["ocs"]}, fresh) or []
        out = []
        for e in rows:
            v = _value(e)
            if v is None:  # szöveges vagy százalékos értékelés
                continue
            w = e.get("ErtekelesSuly")
            w = (round(w * 100) if w <= 10 else round(w)) if isinstance(w, (int, float)) and w else 100
            out.append({"id": str(e.get("ErtekelesId")), "studentId": sid, "groupId": g["id"], "value": v, "weight": w,
                        "type": e.get("ErtekelesModNev") or e.get("ErtekelesTipusNev") or "", "topic": e.get("ErtekelesTema") or "",
                        "date": _day(e.get("ErtekelesDatum")) or "", "created": (_local(e.get("ErtekelesRogzitesDatum")) or dt.datetime.now(TZ)).timestamp(),
                        "modeId": e.get("ErtekelesModId")})
        return out

    def grades(self, group_id=None, student_id=None):
        if group_id:
            g = self._grp(group_id)
            ids = [student_id] if student_id else [s["id"] for s in self.students(group_id=group_id)]
            return [x for sid in ids for x in self._student_grades(g, sid)]
        out = []
        for g in self.groups():
            if student_id and not any(s["id"] == student_id for s in self.students(group_id=g["id"])):
                continue
            out += self.grades(group_id=g["id"], student_id=student_id)
        return out

    def summary(self, group_id):
        g = self._grp(group_id)
        rows = self._get("OsztalyCsoport/Ertekeles", {"tantargyId": g["tid"], "osztalyCsoportId": g["ocs"]}) or []
        return {str(r["TanuloId"]): {"avg": r.get("TanuloTantargyiAtlag") or None, "count": r.get("TanuloErtekelesSzam") or 0} for r in rows if r.get("TanuloId")}

    def _lesson_out(self, e):
        st, en = _local(e.get("Kezdete")), _local(e.get("Vege"))
        gid, nr = f"{e['OsztalyCsoportId']}-{e['TantargyId']}", e.get("Oraszam") if e.get("Oraszam") is not None else 0
        ds = st.date().isoformat() if st else ""
        test = e.get("BejelenetettSzamonkeresId") or e.get("BejelentettSzamonkeresId")  # a KRÉTA mezőneve így, elírva
        return {"id": f"{gid}|{ds}|{nr}", "uid": e.get("Uid"), "date": ds, "nr": nr, "start": st.strftime("%H:%M") if st else "", "end": en.strftime("%H:%M") if en else "",
                "groupId": gid, "classId": str(e["OsztalyCsoportId"]), "subject": e.get("Nev") or "", "room": e.get("Terem") or "",
                "recorded": e.get("Allapot") == LOGGED, "cancelled": e.get("Allapot") in CANCELLED, "locked": bool(e.get("Naplozart")), "topic": e.get("Tema") or "", "absent": None, "late": None,
                "testId": str(test) if test else None, "testKind": e.get("BejelentettSzamonkeresMod") or "", "testTopic": e.get("BejelentettSzamonkeresTema") or "",
                "hwCount": 1 if e.get("HaziFeladatId") else 0, "hwId": e.get("HaziFeladatId")}

    def lessons(self, date_from, date_to):
        return sorted((self._lesson_out(e) for e in self._raw_lessons(date_from, date_to)), key=lambda l: (l["date"], l["nr"]))

    def _find_lesson(self, gid, date, nr):
        l = next((l for l in self.lessons(date, date) if l["groupId"] == gid and l["nr"] == nr), None)
        if not l or not l["uid"]:
            raise NotSupported("Ez az óra nem található a KRÉTA órarendjében")
        return l

    def homework(self):
        def load():
            out = []
            for l in (self._lesson_out(e) for e in self._window()):
                if not l["hwId"] or any(h["id"] == str(l["hwId"]) for h in out):
                    continue
                try:
                    h = self._get(f"HaziFeladat/{l['hwId']}") or {}
                except K.KretaError:
                    continue
                out.append({"id": str(l["hwId"]), "groupId": l["groupId"], "text": _strip_html(h.get("Szoveg")), "given": l["date"],
                            "due": _day(h.get("HataridoDatuma")) or l["date"], "created": 0})
            return sorted(out, key=lambda h: h["due"])
        return self._m("homework", load)

    def tests(self):
        return sorted(({"id": l["testId"], "groupId": l["groupId"], "date": l["date"], "nr": l["nr"], "kind": l["testKind"], "topic": l["testTopic"], "created": 0}
                       for l in (self._lesson_out(e) for e in self._window()) if l["testId"]), key=lambda t: (t["date"], t["nr"]))

    def _presence_types(self):
        return PRESENCE

    def absences(self, group_id=None, date=None, nr=None, student_id=None):
        if not (group_id and date and nr is not None):
            return []  # összesítés diákonként nem kérdezhető le
        l = self._find_lesson(group_id, date, nr)
        types = self._presence_types()
        out = []
        for p in self._get("Orarend/Jelenlet", {"orarendElemUid": l["uid"]}) or []:
            t = p.get("MulasztasTipus")
            kind = "absent" if t == types["absent"] else "late" if t == types["late"] else None
            if kind and (student_id is None or str(p.get("TanuloId")) == student_id):
                out.append({"id": f"{l['uid']}:{p['TanuloId']}", "studentId": str(p["TanuloId"]), "groupId": group_id, "date": date, "nr": nr,
                            "kind": kind, "minutes": p.get("Keses") or 0})
        return out

    def notes(self, student_id=None):
        return []

    def _modes(self):
        return self._enum("ErtekelesModEnum") or KNOWN_MODES

    def grade_types(self):
        return {(m.get("Leiras") or m.get("Nev")): None for m in self._modes()} or dict.fromkeys(GRADE_TYPES)

    def test_kinds(self):
        return list(self.grade_types())

    def note_kinds(self):
        return []

    def _mode(self, name):
        m = next((m for m in self._modes() if name in (m.get("Leiras"), m.get("Nev"))), None)
        if not m:
            raise NotSupported(f"A(z) „{name}” értékelési módot nem találom a KRÉTA-ban")
        return m

    # --- írás ---
    def capabilities(self):
        return set(IMPLEMENTED)

    def enabled(self, op):
        return C.LIVE_WRITE and (C.LIVE_OPS is None or op in C.LIVE_OPS) and op in IMPLEMENTED

    def describe(self, op, d):
        req = self._build(op, d)
        if op in EXPERIMENTAL:
            req["note"] = EXPERIMENTAL[op]
        req["proven"] = op in PROVEN
        return req

    def _build(self, op, d):
        if op in ("lesson.log", "lesson.topic"):
            l = self._find_lesson(d["groupId"], d["date"], d["nr"])
            types = self._presence_types()
            entries = d["entries"] if op == "lesson.log" else self.absences(d["groupId"], d["date"], d["nr"])
            marks = {e["studentId"]: e for e in entries}
            lst = []
            for s in self.students(group_id=d["groupId"]):
                m = marks.get(s["id"])
                lst.append({"Id": int(s["id"]), "Mulasztas": {"Tipus": types[m["kind"]] if m else types["present"], "Keses": m["minutes"] if m and m["kind"] == "late" else 0},
                            "FeljegyzesTipusLista": []})
            return {"method": "POST", "path": "Orarend/OraNaplozas", "body": {"OrarendElemUid": l["uid"], "Tema": d["topic"], "IsElmaradt": False, "TanuloLista": lst}}
        if op == "grade.add":
            # a kreta.js V3 ClassGroupEvaluationRequestDto mezői: a mód és az osztályzat puszta azonosító
            g, mode = self._grp(d["groupId"]), self._mode(d["type"])
            return {"method": "POST", "path": "OsztalyCsoport/Ertekeles", "body": [{
                "OsztalyCsoportId": g["ocs"], "TantargyId": g["tid"], "Datum": _utc_midnight(d["date"]), "Mod": mode["Id"], "Tema": d["topic"] or None,
                "TanuloLista": [{"TanuloId": int(e["studentId"]), "Ertekeles": {"OsztalyzatTipus": 1500 + e["value"], "Szazalek": None, "Szoveg": None}}
                                for e in d["entries"]]}]}
        if op == "grade.edit":
            gr = self._grade(d)
            return {"method": "PUT", "path": f"OsztalyCsoport/Tanulok/Ertekeles/{gr['id']}", "body": {
                "ErtekelesDatum": _utc_midnight(gr["date"]), "ErtekelesOsztalyzatId": 1500 + d["value"], "ErtekelesModId": gr["modeId"] if gr.get("modeId") and d["type"] == gr["type"] else self._mode(d["type"])["Id"], "ErtekelesTema": d["topic"]}}
        if op == "grade.delete":
            return {"method": "DELETE", "path": f"OsztalyCsoport/Tanulok/Ertekeles/{self._grade(d)['id']}"}
        if op == "homework.add":
            g, today = self._grp(d["groupId"]), dt.date.today().isoformat()
            past = [l["date"] for l in (self._lesson_out(e) for e in self._window()) if l["groupId"] == g["id"] and l["date"] <= today]
            return {"method": "POST", "path": "HaziFeladat", "body": {"OsztalyCsoportId": g["ocs"], "TantargyId": g["tid"], "OraDatum": _utc_midnight(max(past) if past else today),
                                                                    "HataridoDatuma": _utc_midnight(d["due"]), "Szoveg": d["text"]}}
        if op == "homework.delete":
            return {"method": "DELETE", "path": f"HaziFeladat/{int(d['homeworkId'])}"}
        if op == "test.add":
            l = self._find_lesson(d["groupId"], d["date"], d["nr"])
            return {"method": "POST", "path": "Orarend/BejelentettSzamonkeres", "body": {"ErtekelesMod": self._mode(d["kind"])["Id"], "ForceSave": False, "OrarendElemUid": l["uid"], "Tema": d["topic"]}}
        if op == "test.delete":
            return {"method": "DELETE", "path": f"Orarend/BejelentettSzamonkeres/{int(d['testId'])}"}
        raise NotSupported("Ez a művelet a KRÉTA tanári API-jában nem érhető el.")

    def _grade(self, d):
        gr = next((x for x in self.grades(group_id=d.get("groupId")) if x["id"] == d["gradeId"]), None) if d.get("groupId") else None
        if not gr:
            raise NotSupported("Ez a jegy nem található a KRÉTA-ban")
        return gr

    def apply(self, op, d, request=None):
        if not self.enabled(op):
            raise NotSupported("Ez a művelet ki van kapcsolva a szerveren (KT_LIVE_WRITE=0 vagy KT_LIVE_OPS).")
        if not request:
            raise NotSupported("Hiányzik a jóváhagyott kérés")
        res = K.send(self.uid, self.inst, request["method"], request["path"], request.get("params"), request.get("body"))
        K.invalidate(self.uid, "Orarend", "OsztalyCsoport/Ertekeles", "OsztalyCsoport/Tanulok/Ertekeles", "HaziFeladat")
        return {"response": res, "request": request}

    def _verify_lesson(self, d, body):
        """Az óra visszaolvasása a KRÉTA-ból: naplózott-e, egyezik-e a téma, és minden diák jelenléte (típus, késés perce)."""
        uid = body.get("OrarendElemUid")
        # az írás után a gyorsítótár üres, így ez már a KRÉTA friss órarendje
        e = next((x for x in self._raw_lessons(d["date"], d["date"]) if x.get("Uid") == uid), None)
        if e is None:
            e = self._get("Orarend/OrarendElem", {"orarendElemUid": uid}, fresh=True) or {}
        if e.get("Allapot") != LOGGED or (e.get("Tema") or "").strip() != (d["topic"] or "").strip():
            print(f"[KRÉTA] naplózás visszaolvasás: Allapot={e.get('Allapot')} Tema={e.get('Tema')!r}")
            return False
        got = {p.get("TanuloId"): p for p in self._get("Orarend/Jelenlet", {"orarendElemUid": uid}, fresh=True) or []}
        for t in body.get("TanuloLista") or []:
            p, want = got.get(t["Id"]), t["Mulasztas"]
            if not p or p.get("MulasztasTipus") != want["Tipus"] or (want["Tipus"] == PRESENCE["late"] and (p.get("Keses") or 0) != want["Keses"]):
                print(f"[KRÉTA] naplózás visszaolvasás: diák {t['Id']} küldve {want}, KRÉTA-ban {p and {k: p.get(k) for k in ('MulasztasTipus', 'Keses')}}")
                return False
        return True

    def verify(self, op, d, result):
        req, res = result.get("request") or {}, result.get("response")
        body = req.get("body") or {}
        if op in ("lesson.log", "lesson.topic"):
            return self._verify_lesson(d, body)
        if op == "homework.add":
            return isinstance(res, int) and K.exists(self.uid, self.inst, f"HaziFeladat/{res}")
        if op == "test.add":
            return isinstance(res, dict) and bool(res.get("Id")) and K.exists(self.uid, self.inst, f"Orarend/BejelentettSzamonkeres/{res['Id']}")
        if op in ("homework.delete", "test.delete"):
            return not K.exists(self.uid, self.inst, req["path"])
        if op in ("grade.add", "grade.edit", "grade.delete"):
            g = self._grp(d["groupId"])
            if op == "grade.add":
                for e in d["entries"]:
                    if not any(x["date"] == d["date"] and x["value"] == e["value"] for x in self._student_grades(g, e["studentId"], fresh=True)):
                        return False
                return True
            sid = req["path"].rsplit("/", 1)[-1]
            student = d.get("studentId")
            fresh = self._student_grades(g, student, fresh=True) if student else []
            found = next((x for x in fresh if x["id"] == sid), None)
            return (found is not None and found["value"] == d["value"]) if op == "grade.edit" else found is None
        return False
