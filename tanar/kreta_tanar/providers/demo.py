"""Teszt fiók: generált iskola (osztályok, diákok, órarend, jegyek, házik, számonkérések, mulasztások).

Az egész egy JSON-ban él a demo_state táblában; a műveletek ezt módosítják, a KRÉTA-hoz semmi nem megy ki.
"""
import datetime as dt
import json
import random
import threading
import time

from .. import db
from .base import BELLS, GRADE_TYPES, NotSupported, Provider

SURN = ["Kovács", "Szabó", "Tóth", "Nagy", "Horváth", "Varga", "Kiss", "Molnár", "Németh", "Farkas", "Balogh", "Papp",
        "Takács", "Juhász", "Lakatos", "Mészáros", "Oláh", "Simon", "Rácz", "Fekete", "Szilágyi", "Török", "Fehér",
        "Balázs", "Gál", "Szűcs", "Kocsis", "Pintér", "Vincze", "Hegedűs", "Bodnár", "Sipos"]
GIVEN = ["Anna", "Bence", "Dóra", "Levente", "Zsófia", "Máté", "Luca", "Dávid", "Hanna", "Ádám", "Lili", "Marcell",
         "Emma", "Botond", "Réka", "Gergő", "Flóra", "Olivér", "Boglárka", "Zalán", "Nóra", "Kristóf", "Viktória",
         "Áron", "Petra", "Milán", "Jázmin", "Barnabás", "Kitti", "Dominik", "Laura", "Benedek"]
TEACHERS = [("Németh Katalin", ("Matematika", "Fizika")), ("Dr. Kertész Gábor", ("Történelem", "Magyar nyelv és irodalom")),
            ("Varga Judit", ("Biológia", "Kémia")), ("Horváth Péter", ("Angol nyelv", "Német nyelv"))]
TOPICS = {
    "Matematika": ["Halmazok", "Másodfokú egyenletek", "Függvények", "Hasonlóság", "Trigonometria", "Vektorok", "Valószínűség"],
    "Fizika": ["Egyenes vonalú mozgás", "Newton törvényei", "Munka és energia", "Hőtan", "Elektrosztatika"],
    "Történelem": ["Az ókori Egyiptom", "A görög poliszok", "Róma", "A középkor", "Az Árpád-kor", "A reformkor"],
    "Magyar nyelv és irodalom": ["Mitológia", "A Biblia", "Antik dráma", "Petőfi Sándor", "Szófajok", "Mondatelemzés"],
    "Biológia": ["A sejt", "Genetika", "Az emberi szervezet", "Ökológia", "Növénytan"],
    "Kémia": ["Az atom szerkezete", "Kémiai kötések", "Savak és bázisok", "Redoxireakciók", "Szerves kémia"],
    "Angol nyelv": ["Present Perfect", "Unit 3 vocabulary", "Conditionals", "Reading comprehension", "Essay writing"],
    "Német nyelv": ["Perfekt", "Wortschatz Lektion 4", "Modalverben", "Hörverstehen", "Präpositionen"],
}
HW_TEXTS = ["Tankönyv {p}. oldal {n}. feladat", "Munkafüzet {p}. oldal, az összes feladat", "Készülj a következő órára: {t}",
            "Olvasd el a {p}–{q}. oldalt és írj róla fél oldalt", "Gyakorló feladatlap a Classroomban: {t}",
            "Nézd meg a videót: https://www.youtube.com/watch?v=dQw4w9WgXcQ és jegyzetelj"]
STEPS = ["bevezetés", "új anyag", "gyakorlás", "feladatmegoldás", "csoportmunka", "ismétlés", "összefoglalás"]
NOTES = [("Szaktanári dicséret", "Kiemelkedő órai munka", "Az órán kiemelkedően aktív volt, minden feladatot elsőként oldott meg."),
         ("Szaktanári dicséret", "Versenyeredmény", "Az iskolai tantárgyi versenyen 2. helyezést ért el."),
         ("Szaktanári figyelmeztetés", "Hiányzó felszerelés", "Harmadszor nem hozta el a tankönyvét és a füzetét."),
         ("Szaktanári figyelmeztetés", "Órai magatartás", "Többszöri figyelmeztetés ellenére zavarta az órát."),
         ("Értesítés", "Pótdolgozat", "A pótdolgozat időpontja a következő óra, kérem, készüljön rá."),
         ("Osztályfőnöki dicséret", "Közösségi munka", "Az osztály szalagavatós előkészületeinek szervezésében végzett munkájáért.")]
ROOMS = ["12", "14", "21", "23", "105", "Fizika-előadó", "Könyvtár", "Tornaterem", "B2", "C3"]

_locks = {}
_locks_guard = threading.Lock()


def _lock(uid):
    with _locks_guard:
        return _locks.setdefault(uid, threading.Lock())


def _school_start(today):
    return dt.date(today.year if today.month >= 9 else today.year - 1, 9, 1)


def _days(a, b):
    d = a
    while d <= b:
        if d.weekday() < 5:
            yield d
        d += dt.timedelta(days=1)


def generate(seed=None):
    rnd = random.Random(seed)
    today = dt.date.today()
    start = _school_start(today)
    tname, (s1, s2) = rnd.choice(TEACHERS)
    st = {"teacher": {"name": tname, "subjects": [s1, s2]}, "classes": [], "groups": [], "students": [], "slots": [],
          "grades": [], "homework": [], "tests": [], "absences": [], "recorded": [], "topics": {}, "notes": [], "seq": 0}

    def nid(p):
        st["seq"] += 1
        return f"{p}{st['seq']}"

    used_names = set()
    for i, cname in enumerate(["9.A", "10.B", "11.C"]):
        cid = nid("c")
        st["classes"].append({"id": cid, "name": cname, "head": i == 0})
        for _ in range(rnd.randint(22, 28)):
            while True:
                name = f"{rnd.choice(SURN)} {rnd.choice(GIVEN)}"
                if name not in used_names:
                    used_names.add(name)
                    break
            st["students"].append({"id": nid("s"), "name": name, "classId": cid, "skill": round(rnd.gauss(3.6, 0.75), 2)})
        for subj in ([s1, s2] if i else [s1]):
            st["groups"].append({"id": nid("g"), "classId": cid, "subject": subj})

    # órarend: tantárgyanként heti 3 / 2 óra, ütközés nélkül
    free = [(d, n) for d in range(5) for n in range(1, 8)]
    rnd.shuffle(free)
    for g in st["groups"]:
        per = 3 if g["subject"] == s1 else 2
        days_used = set()
        for _ in range(per):
            k = next(i for i, (d, n) in enumerate(free) if d not in days_used)
            d, n = free.pop(k)
            days_used.add(d)
            st["slots"].append({"day": d, "nr": n, "groupId": g["id"], "room": rnd.choice(ROOMS)})

    def group_dates(gid, a, b):
        sl = [s for s in st["slots"] if s["groupId"] == gid]
        return [(d, s["nr"]) for d in _days(a, b) for s in sl if s["day"] == d.weekday()]

    yesterday = today - dt.timedelta(days=1)
    for g in st["groups"]:
        studs = [s for s in st["students"] if s["classId"] == g["classId"]]
        topics = TOPICS.get(g["subject"], ["Témakör"])
        past = group_dates(g["id"], start, yesterday)
        # jegyek: időnként dolgozat mindenkinek, közben feleletek és órai munkák néhány diáknak
        for idx, (d, nr) in enumerate(past):
            if idx and idx % 9 == 0:
                kind, who = ("Témazáró" if idx % 18 == 0 else "Dolgozat"), studs
            elif rnd.random() < 0.55:
                kind, who = rnd.choice(["Felelet", "Órai munka", "Házi feladat", "Röpdolgozat"]), rnd.sample(studs, rnd.randint(1, 4))
            else:
                continue
            topic = topics[min(len(topics) - 1, idx // 8)]
            for s in who:
                if kind in ("Témazáró", "Dolgozat") and rnd.random() < 0.06:
                    continue  # hiányzott
                v = max(1, min(5, round(rnd.gauss(s["skill"], 0.85))))
                st["grades"].append({"id": nid("j"), "studentId": s["id"], "groupId": g["id"], "value": v,
                                     "weight": GRADE_TYPES[kind], "type": kind, "topic": topic, "date": d.isoformat(), "created": 0})
        # mulasztások és haladási napló: minden lezajlott óra be van írva
        for idx, (d, nr) in enumerate(past):
            st["recorded"].append(f"{g['id']}|{d.isoformat()}|{nr}")
            st["topics"][f"{g['id']}|{d.isoformat()}|{nr}"] = f"{topics[min(len(topics) - 1, idx // 8)]}: {rnd.choice(STEPS) if idx % 8 != 7 else 'dolgozat'}"
            for s in studs:
                r = rnd.random()
                if r < 0.035:
                    st["absences"].append({"id": nid("m"), "studentId": s["id"], "groupId": g["id"], "date": d.isoformat(), "nr": nr, "kind": "absent", "minutes": 0})
                elif r < 0.05:
                    st["absences"].append({"id": nid("m"), "studentId": s["id"], "groupId": g["id"], "date": d.isoformat(), "nr": nr, "kind": "late", "minutes": rnd.choice([3, 5, 8, 12])})
        # házik: múltbeliek és a következő órára
        upcoming = group_dates(g["id"], today, today + dt.timedelta(days=28))
        for d, _ in past[-4:] + upcoming[:1]:
            p = rnd.randint(20, 180)
            text = rnd.choice(HW_TEXTS).format(p=p, q=p + 6, n=rnd.randint(1, 9), t=rnd.choice(topics))
            given = d - dt.timedelta(days=rnd.choice([2, 3, 7]))
            st["homework"].append({"id": nid("h"), "groupId": g["id"], "text": text, "given": max(given, start).isoformat(), "due": d.isoformat(), "created": 0})
        # számonkérés: egy a következő hetekben
        if len(upcoming) > 3:
            d, nr = upcoming[rnd.randint(2, len(upcoming) - 1)]
            st["tests"].append({"id": nid("d"), "groupId": g["id"], "date": d.isoformat(), "nr": nr,
                                "kind": rnd.choice(["Témazáró", "Dolgozat"]), "topic": rnd.choice(topics), "created": 0})
    # feljegyzések: néhány dicséret és figyelmeztetés
    head = next(c["id"] for c in st["classes"] if c["head"])
    for kind, title, text in NOTES:
        pool = [x for x in st["students"] if x["classId"] == head] if kind.startswith("Osztályfőnöki") else st["students"]
        s = rnd.choice(pool)
        d = start + dt.timedelta(days=rnd.randint(7, max(8, (today - start).days - 1)))
        st["notes"].append({"id": nid("f"), "studentId": s["id"], "kind": kind, "title": title, "text": text, "date": min(d, today).isoformat(), "created": 0})
    return st


class DemoProvider(Provider):
    demo = True

    def __init__(self, uid):
        self.uid = uid
        row = db.one("SELECT body FROM demo_state WHERE user_id=?", (uid,))
        if row:
            self.st = json.loads(row["body"])
            self.st.setdefault("topics", {})  # régebbi teszt fiókok
            self.st.setdefault("notes", [])
        else:
            self.st = generate(uid * 7919 + int(time.time()))
            self._save()

    def _save(self):
        db.run("INSERT INTO demo_state(user_id,body,updated) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET body=excluded.body, updated=excluded.updated",
               (self.uid, json.dumps(self.st, ensure_ascii=False), time.time()))

    def _id(self, p):
        self.st["seq"] += 1
        return f"{p}{self.st['seq']}"

    def _cls(self, cid):
        return next((c for c in self.st["classes"] if c["id"] == cid), None)

    def _grp(self, gid):
        return next((g for g in self.st["groups"] if g["id"] == gid), None)

    # --- olvasás ---
    def teacher(self):
        return self.st["teacher"]

    def classes(self):
        return [{"id": c["id"], "name": c["name"], "head": c["head"], "count": sum(1 for s in self.st["students"] if s["classId"] == c["id"])}
                for c in self.st["classes"]]

    def groups(self):
        out = []
        for g in self.st["groups"]:
            c = self._cls(g["classId"])
            out.append({"id": g["id"], "classId": g["classId"], "className": c["name"], "subject": g["subject"], "name": f"{c['name']} · {g['subject']}"})
        return out

    def students(self, class_id=None, group_id=None):
        if group_id:
            g = self._grp(group_id)
            class_id = g and g["classId"]
            if not class_id:
                return []
        ss = [s for s in self.st["students"] if class_id is None or s["classId"] == class_id]
        return sorted(({"id": s["id"], "name": s["name"], "classId": s["classId"]} for s in ss), key=lambda s: s["name"])

    def grades(self, group_id=None, student_id=None):
        return [g for g in self.st["grades"] if (group_id is None or g["groupId"] == group_id) and (student_id is None or g["studentId"] == student_id)]

    def lessons(self, date_from, date_to):
        a, b = dt.date.fromisoformat(date_from), dt.date.fromisoformat(date_to)
        if (b - a).days > 62:
            b = a + dt.timedelta(days=62)
        rec = set(self.st["recorded"])
        out = []
        for d in _days(a, b):
            ds = d.isoformat()
            for s in sorted((s for s in self.st["slots"] if s["day"] == d.weekday()), key=lambda s: s["nr"]):
                g = self._grp(s["groupId"])
                ab = [x for x in self.st["absences"] if x["groupId"] == g["id"] and x["date"] == ds and x["nr"] == s["nr"]]
                t = next((t for t in self.st["tests"] if t["groupId"] == g["id"] and t["date"] == ds and t["nr"] == s["nr"]), None)
                bell = BELLS.get(s["nr"], ("", ""))
                out.append({"id": f"{g['id']}|{ds}|{s['nr']}", "date": ds, "nr": s["nr"], "start": bell[0], "end": bell[1],
                            "groupId": g["id"], "classId": g["classId"], "subject": g["subject"], "room": s["room"],
                            "recorded": f"{g['id']}|{ds}|{s['nr']}" in rec, "topic": self.st["topics"].get(f"{g['id']}|{ds}|{s['nr']}", ""),
                            "absent": sum(1 for x in ab if x["kind"] == "absent"), "late": sum(1 for x in ab if x["kind"] == "late"),
                            "testId": t and t["id"], "hwCount": sum(1 for h in self.st["homework"] if h["groupId"] == g["id"] and h["due"] == ds)})
        return out

    def homework(self):
        return sorted(self.st["homework"], key=lambda h: h["due"])

    def tests(self):
        return sorted(self.st["tests"], key=lambda t: (t["date"], t["nr"]))

    def notes(self, student_id=None):
        return sorted((n for n in self.st["notes"] if student_id is None or n["studentId"] == student_id), key=lambda n: (n["date"], n["created"]), reverse=True)

    def absences(self, group_id=None, date=None, nr=None, student_id=None):
        return [x for x in self.st["absences"] if (group_id is None or x["groupId"] == group_id) and (date is None or x["date"] == date)
                and (nr is None or x["nr"] == nr) and (student_id is None or x["studentId"] == student_id)]

    # --- írás (szimulált) ---
    def capabilities(self):
        return {"grade.add", "grade.edit", "grade.delete", "homework.add", "homework.delete", "test.add", "test.delete", "absence.record",
                "lesson.topic", "lesson.log", "note.add", "note.delete"}

    def apply(self, op, data, request=None):
        with _lock(self.uid):
            self.__init__(self.uid)  # friss állapot, ha közben másik lapon is írtak
            res = self._apply(op, data)
            self._save()
            return res

    def _apply(self, op, d):
        now = time.time()
        if op == "grade.add":
            ids = []
            for e in d["entries"]:
                gid = self._id("j")
                self.st["grades"].append({"id": gid, "studentId": e["studentId"], "groupId": d["groupId"], "value": e["value"], "weight": d["weight"],
                                          "type": d["type"], "topic": d["topic"], "date": d["date"], "created": now})
                ids.append(gid)
            return {"ids": ids}
        if op == "grade.edit":
            g = next((g for g in self.st["grades"] if g["id"] == d["gradeId"]), None)
            if not g:
                raise NotSupported("Ez a jegy már nem létezik.")
            g.update(value=d["value"], weight=d["weight"], type=d["type"], topic=d["topic"])
            return {"ids": [g["id"]]}
        if op == "grade.delete":
            self.st["grades"] = [g for g in self.st["grades"] if g["id"] != d["gradeId"]]
            return {"ids": [d["gradeId"]]}
        if op == "homework.add":
            hid = self._id("h")
            self.st["homework"].append({"id": hid, "groupId": d["groupId"], "text": d["text"], "given": dt.date.today().isoformat(), "due": d["due"], "created": now})
            return {"ids": [hid]}
        if op == "homework.delete":
            self.st["homework"] = [h for h in self.st["homework"] if h["id"] != d["homeworkId"]]
            return {"ids": [d["homeworkId"]]}
        if op == "test.add":
            tid = self._id("d")
            self.st["tests"].append({"id": tid, "groupId": d["groupId"], "date": d["date"], "nr": d["nr"], "kind": d["kind"], "topic": d["topic"], "created": now})
            return {"ids": [tid]}
        if op == "test.delete":
            self.st["tests"] = [t for t in self.st["tests"] if t["id"] != d["testId"]]
            return {"ids": [d["testId"]]}
        if op == "lesson.log":
            self.st["topics"][f"{d['groupId']}|{d['date']}|{d['nr']}"] = d["topic"]
            return self._apply("absence.record", d)
        if op == "absence.record":
            key = f"{d['groupId']}|{d['date']}|{d['nr']}"
            self.st["absences"] = [x for x in self.st["absences"] if not (x["groupId"] == d["groupId"] and x["date"] == d["date"] and x["nr"] == d["nr"])]
            ids = []
            for e in d["entries"]:
                mid = self._id("m")
                self.st["absences"].append({"id": mid, "studentId": e["studentId"], "groupId": d["groupId"], "date": d["date"], "nr": d["nr"], "kind": e["kind"], "minutes": e["minutes"]})
                ids.append(mid)
            if key not in self.st["recorded"]:
                self.st["recorded"].append(key)
            return {"ids": ids}
        if op == "lesson.topic":
            self.st["topics"][f"{d['groupId']}|{d['date']}|{d['nr']}"] = d["topic"]
            return {"key": f"{d['groupId']}|{d['date']}|{d['nr']}"}
        if op == "note.add":
            ids = []
            for sid in d["studentIds"]:
                nid_ = self._id("f")
                self.st["notes"].append({"id": nid_, "studentId": sid, "kind": d["kind"], "title": d["title"], "text": d["text"], "date": d["date"], "created": now})
                ids.append(nid_)
            return {"ids": ids}
        if op == "note.delete":
            self.st["notes"] = [n for n in self.st["notes"] if n["id"] != d["noteId"]]
            return {"ids": [d["noteId"]]}
        raise NotSupported()

    def verify(self, op, d, result):
        fresh = DemoProvider(self.uid).st
        ids = set(result.get("ids", []))
        if op in ("grade.add", "grade.edit"):
            found = [g for g in fresh["grades"] if g["id"] in ids]
            return len(found) == len(ids) and (op != "grade.edit" or found[0]["value"] == d["value"])
        if op == "grade.delete":
            return not any(g["id"] in ids for g in fresh["grades"])
        if op == "homework.add":
            return any(h["id"] in ids for h in fresh["homework"])
        if op == "homework.delete":
            return not any(h["id"] in ids for h in fresh["homework"])
        if op == "test.add":
            return any(t["id"] in ids for t in fresh["tests"])
        if op == "test.delete":
            return not any(t["id"] in ids for t in fresh["tests"])
        if op == "lesson.topic":
            return fresh.get("topics", {}).get(result.get("key")) == d["topic"]
        if op == "note.add":
            return sum(1 for n in fresh.get("notes", []) if n["id"] in ids) == len(ids)
        if op == "note.delete":
            return not any(n["id"] in ids for n in fresh.get("notes", []))
        if op == "lesson.log":
            ok_topic = fresh.get("topics", {}).get(f"{d['groupId']}|{d['date']}|{d['nr']}") == d["topic"]
            return ok_topic and sum(1 for x in fresh["absences"] if x["id"] in ids) == len(ids)
        if op == "absence.record":
            return sum(1 for x in fresh["absences"] if x["id"] in ids) == len(ids)
        return False
