"""Adatforrás-felület. A nézetek és a műveletek csak ezen keresztül érik el az adatokat,
így a teszt fiók (demo.py) és a valódi KRÉTA (kreta.py) felcserélhető.

Az adatok saját, egyszerű formában jönnek (nem a KRÉTA mezőneveivel); a KRÉTA-szolgáltató
feladata, hogy a KRÉTA válaszait erre alakítsa. Dátumok: "YYYY-MM-DD" szöveg.

  teacher   {"name", "subjects": [..]}
  class     {"id", "name", "head": bool, "count"}
  group     {"id", "classId", "className", "subject", "name"}      # egy osztály egy tantárgya, amit a tanár tanít
  student   {"id", "name", "classId"}
  grade     {"id", "studentId", "groupId", "value": 1-5, "weight": %, "type", "topic", "date", "created": ts}
  lesson    {"id", "date", "nr", "start": "HH:MM", "end", "groupId", "classId", "subject", "room",
             "recorded": bool, "cancelled": bool (elmaradt, nem kell naplózni), "topic": "" (haladási napló), "absent": n, "late": n, "testId", "hwCount"}
  homework  {"id", "groupId", "text", "given", "due", "created"}
  test      {"id", "groupId", "date", "nr", "kind", "topic", "created"}
  note      {"id", "studentId", "kind", "title", "text", "date", "created"}   # feljegyzés, dicséret, figyelmeztetés
  absence   {"id", "studentId", "groupId", "date", "nr", "kind": "absent"|"late", "minutes"}

Írási műveletek (ops.py hívja őket, előtte ellenőrzött, megtisztított adattal):
  grade.add      {"groupId", "date", "type", "weight", "topic", "entries": [{"studentId", "value"}]}
  grade.edit     {"gradeId", "value", "weight", "type", "topic"}
  grade.delete   {"gradeId"}
  homework.add   {"groupId", "due", "text"}
  homework.delete {"homeworkId"}
  test.add       {"groupId", "date", "nr", "kind", "topic"}
  test.delete    {"testId"}
  absence.record {"groupId", "date", "nr", "entries": [{"studentId", "kind", "minutes"}]}  # az óra teljes listája
  lesson.topic   {"groupId", "date", "nr", "topic"}                  # haladási napló: az óra témája
  lesson.log     {"groupId", "date", "nr", "topic", "entries": [...]}  # óranaplózás: téma + mulasztások egyszerre
  note.add       {"studentIds": [..], "kind", "title", "text", "date"}  # ugyanaz a feljegyzés több diáknak
  note.delete    {"noteId"}
"""

GRADE_TYPES = {  # típus -> alapértelmezett súly (%)
    "Témazáró": 200,
    "Dolgozat": 100,
    "Röpdolgozat": 100,
    "Felelet": 100,
    "Órai munka": 50,
    "Házi feladat": 50,
    "Projektmunka": 100,
}
WEIGHTS = (50, 100, 150, 200, 300)
TEST_KINDS = ("Témazáró", "Dolgozat", "Röpdolgozat", "Szóbeli felelet", "Projekt bemutatása")
NOTE_KINDS = ("Szaktanári dicséret", "Szaktanári figyelmeztetés", "Értesítés", "Osztályfőnöki dicséret", "Osztályfőnöki figyelmeztetés")
HEAD_ONLY = ("Osztályfőnöki dicséret", "Osztályfőnöki figyelmeztetés")  # csak a saját osztály diákjainak
BELLS = {  # óraszám -> (kezdet, vég)
    0: ("07:15", "08:00"), 1: ("08:00", "08:45"), 2: ("08:55", "09:40"), 3: ("09:50", "10:35"),
    4: ("10:50", "11:35"), 5: ("11:45", "12:30"), 6: ("12:40", "13:25"), 7: ("13:35", "14:20"), 8: ("14:30", "15:15"),
}


class NotSupported(Exception):
    """A szolgáltató ezt (még) nem tudja; a felület érthető üzenetet mutat."""

    def __init__(self, msg="Ez a funkció ezzel a fiókkal még nem érhető el."):
        super().__init__(msg)
        self.msg = msg


class Provider:
    demo = False
    fixed_weights = False   # True: a súlyt a KRÉTA a típusból (módból) számolja, nem küldhető
    absence_totals = True   # False: diákonkénti összesített mulasztás nem kérdezhető le

    def grade_types(self):
        """Jegytípus -> alapértelmezett súly (%), vagy None, ha a súlyt nem mi adjuk meg."""
        return dict(GRADE_TYPES)

    def test_kinds(self):
        return list(TEST_KINDS)

    def note_kinds(self):
        return list(NOTE_KINDS)

    def summary(self, group_id):
        """Diákonkénti átlag és jegyszám egy csoportban: {studentId: {"avg", "count"}}."""
        out = {}
        for s in self.students(group_id=group_id):
            gs = self.grades(group_id=group_id, student_id=s["id"])
            w = sum(g["weight"] or 100 for g in gs)
            out[s["id"]] = {"avg": round(sum(g["value"] * (g["weight"] or 100) for g in gs) / w, 2) if w else None, "count": len(gs)}
        return out

    # --- olvasás ---
    def teacher(self): raise NotSupported()
    def classes(self): raise NotSupported()
    def groups(self): raise NotSupported()
    def students(self, class_id=None, group_id=None): raise NotSupported()
    def grades(self, group_id=None, student_id=None): raise NotSupported()
    def lessons(self, date_from, date_to): raise NotSupported()
    def homework(self): raise NotSupported()
    def tests(self): raise NotSupported()
    def absences(self, group_id=None, date=None, nr=None, student_id=None): raise NotSupported()
    def notes(self, student_id=None): raise NotSupported()

    # --- írás ---
    def capabilities(self):
        """Azon műveletek neve, amelyeket ez a szolgáltató ténylegesen végre tud hajtani."""
        return set()

    def enabled(self, op):
        """Elküldhető-e most ténylegesen (a capabilities() közül). Ha nem, az előnézet csak megmutatja a kérést."""
        return op in self.capabilities()

    def describe(self, op, data):
        """A pontos kérés, ami kimenne ({"method", "path", "params", "body"}), vagy None (teszt fiók)."""
        return None

    def apply(self, op, data, request=None):
        """Végrehajtja a műveletet (request: az előnézetben megmutatott kérés, változatlanul).
        Visszaad: {"ids": [...]} vagy amit a verify vár. Nem ismételhet automatikusan."""
        raise NotSupported()

    def verify(self, op, data, result):
        """Írás után visszaolvasás: tényleg úgy került-e be. True/False."""
        return False
