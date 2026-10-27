"""Teszt fiók: véletlen (de felhasználónként stabil) adatok a KRÉTA válaszaival megegyező szerkezetben."""
import datetime as dt
import random

DEMO_INST = "demo"

SUBJECTS = [
    ("Matematika", "Kovács Éva"), ("Magyar nyelv és irodalom", "Szabó Katalin"), ("Történelem", "Tóth Gábor"),
    ("Angol nyelv", "Nagy Anna"), ("Fizika", "Horváth Péter"), ("Kémia", "Varga Zsuzsa"),
    ("Biológia", "Molnár Ildikó"), ("Földrajz", "Kiss László"), ("Informatika", "Farkas Dávid"),
    ("Testnevelés", "Balogh Tamás"), ("Ének-zene", "Papp Mária"), ("Német nyelv", "Simon Judit"),
]
GRADE_KINDS = [("Dolgozat", 200), ("Témazáró dolgozat", 300), ("Felelet", 100), ("Röpdolgozat", 100), ("Házi feladat", 50), ("Órai munka", 100)]
TOPICS = ["Másodfokú egyenletek", "Az első világháború", "Present perfect", "Newton törvényei", "Sav-bázis reakciók", "A sejt felépítése",
          "Európa éghajlata", "Függvények", "Programozási alapok", "Verselemzés", "Állóképesség", "Mozgások"]
HW_TEXTS = ["Tankönyv {n}. oldal 3–5. feladat", "Szószedet tanulása a következő órára", "Munkafüzet {n}. oldal kitöltése",
            "Készíts vázlatot a tanult anyagból", "Gyakorló feladatok a {n}. oldalról", "Olvasd el a leckét, és jegyzetelj"]


def _iso(d):
    return d.strftime("%Y-%m-%dT%H:%M:%S")


def _today():
    return dt.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)


def _rng(uid, salt=""):
    return random.Random(f"{uid}:{salt}")


def _timetable(uid):
    r = _rng(uid, "tt")
    return [[SUBJECTS[r.randrange(len(SUBJECTS))] for _ in range(r.choice((5, 6, 7)))] for _ in range(5)]


def tanulo(uid):
    return {"Nev": "Teszt Elek", "IntezmenyNev": "Teszt Gimnázium", "Oktatasi_Azonosito": "00000000000"}


def jegyek(uid):
    r, today, out = _rng(uid, "gr"), _today(), []
    for si, (subj, teacher) in enumerate(SUBJECTS):
        for i in range(r.randint(7, 12)):
            kind, weight = r.choice(GRADE_KINDS)
            day = today - dt.timedelta(days=r.randint(0, 120))
            out.append({
                "Uid": f"g{si}_{i}", "KeszitesDatuma": _iso(day), "RogzitesDatuma": _iso(day), "Tantargy": {"Nev": subj},
                "SzamErtek": r.choices([1, 2, 3, 4, 5], [1, 4, 8, 12, 14])[0], "Tema": r.choice(TOPICS), "ErtekeloTanarNeve": teacher,
                "SulySzazalekErteke": weight, "Tipus": {"Nev": "evkozi_jegy_ertekeles"}, "ErtekFajta": {"Nev": "Osztalyzat"}, "Mod": {"Leiras": kind},
            })
    return out


def orarend(uid, params):
    tt, out = _timetable(uid), []
    try:
        a = dt.datetime.fromisoformat(params["datumTol"])
        b = dt.datetime.fromisoformat(params["datumIg"])
    except (KeyError, ValueError):
        a = _today() - dt.timedelta(days=_today().weekday())
        b = a + dt.timedelta(days=6)
    day = a.replace(hour=0, minute=0, second=0, microsecond=0)
    while day <= b:
        if day.weekday() < 5:
            r = _rng(uid, "d" + day.strftime("%Y%m%d"))
            for n, (subj, teacher) in enumerate(tt[day.weekday()]):
                start = day.replace(hour=8) + dt.timedelta(minutes=55 * n)
                off, sub = r.random() < 0.04, r.random() < 0.05
                out.append({
                    "Uid": f"l{day:%Y%m%d}{n}", "KezdetIdopont": _iso(start), "VegIdopont": _iso(start + dt.timedelta(minutes=45)),
                    "Tantargy": {"Nev": subj}, "Nev": subj, "TanarNeve": teacher, "HelyettesitoTanarNeve": "Teszt Helyettes" if sub else "",
                    "TeremNeve": f"{r.choice('ABC')}{10 + sum(map(ord, subj)) % 20}", "Oraszam": n + 1,
                    "Allapot": {"Nev": "Elmaradt" if off else "Megtartott"}, "Tema": "",
                    "HaziFeladatUid": "x" if r.random() < 0.15 else None, "BejelentettSzamonkeresUid": "x" if r.random() < 0.06 else None,
                })
        day += dt.timedelta(days=1)
    return out


def hazi(uid):
    r, today, out = _rng(uid, "hw"), _today(), []
    for i in range(9):
        subj, teacher = r.choice(SUBJECTS)
        due = today + dt.timedelta(days=r.randint(-6, 7))
        out.append({
            "Uid": f"h{i}", "TantargyNeve": subj, "RogzitoTanarNeve": teacher, "Szoveg": r.choice(HW_TEXTS).format(n=r.randint(10, 150)),
            "FeladasDatuma": _iso(due - dt.timedelta(days=r.randint(1, 5))), "HataridoDatuma": _iso(due), "IsMegoldva": due < today and r.random() < 0.7,
        })
    return out


def szamonkeres(uid):
    r, today, out = _rng(uid, "ts"), _today(), []
    for i in range(7):
        subj, teacher = r.choice(SUBJECTS)
        out.append({
            "Uid": f"s{i}", "Datum": _iso(today + dt.timedelta(days=r.randint(-30, 14))), "TantargyNeve": subj, "RogzitoTanarNeve": teacher,
            "Temaja": r.choice(TOPICS), "Modja": {"Leiras": r.choice(["Dolgozat", "Témazáró dolgozat", "Röpdolgozat"])}, "OrarendiOraOraszama": r.randint(1, 6),
        })
    return out


def mulasztasok(uid):
    r, today, out = _rng(uid, "ab"), _today(), []
    for i in range(8):
        subj, teacher = r.choice(SUBJECTS)
        ok = r.random() < 0.75
        late = r.random() < 0.3
        out.append({
            "Uid": f"m{i}", "Datum": _iso(today - dt.timedelta(days=r.randint(1, 90))), "Tantargy": {"Nev": subj}, "Oraszam": r.randint(1, 7),
            "RogzitoTanarNeve": teacher, "IgazolasAllapota": "Igazolt" if ok else "Igazolatlan",
            "IgazolasTipusa": {"Nev": "Orvosi igazolás"} if ok else None, "KesesPercben": r.randint(3, 20) if late else 0,
            "Tipus": {"Nev": "keses" if late else "hianyzas"},
        })
    return out


def feljegyzesek(uid):
    r, today = _rng(uid, "nt"), _today()
    items = [("Dicséret", "Kiváló órai munkáért."), ("Figyelmeztetés", "Késés az első óráról."), ("Értesítés", "Szülői értekezlet jövő héten.")]
    return [{"Uid": f"n{i}", "Cim": t, "Tartalom": c, "FeljegyzesDatuma": _iso(today - dt.timedelta(days=r.randint(1, 40))),
             "KeszitoTanarNeve": r.choice(SUBJECTS)[1], "Tipus": {"Nev": t}} for i, (t, c) in enumerate(items)]


def data(uid, what, params):
    if what == "orarend":
        return orarend(uid, params)
    return {"tanulo": tanulo, "jegyek": jegyek, "mulasztasok": mulasztasok, "hazi": hazi, "szamonkeres": szamonkeres, "feljegyzesek": feljegyzesek}[what](uid)
