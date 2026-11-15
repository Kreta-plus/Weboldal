"""Osztály- és csoporttagság a közösen felírt házikhoz és dolgozatokhoz.

A KRÉTA adatlapján nincs osztály, ezért az órarendből jön (OsztalyCsoport.Nev): a leggyakoribb „11.I”-szerű név
az osztály, a többi a csoport (az egyszeri, eseti csoport kimarad, ha van gyakoribb). Ugyanez a szabály van a
felületen is (state.js profile()). Teszt fióknál az osztály és a csoportok kézzel is megadhatók.
"""
import json
import re
from collections import Counter

from . import db, demo, site

INST_RE = re.compile(r"[a-z0-9-]{2,40}")
# Teszt fiók kézi osztálya, csoportja és iskolája: a fejlesztői oldalon kapcsolható (alapból ki), fejlesztői fióknak mindig.
# Bekapcsolva bármelyik teszt fiók bármelyik iskola osztályának közös házijait láthatja, ezért élesben csak rövid tesztre.
def school_link_allowed(user, admin=False):
    return user["inst"] == demo.DEMO_INST and (admin or site.get()["testGroupsEnabled"])


CLASS_RE = re.compile(r"^\d{1,2}\.\s?[A-Za-zÁ-Űá-ű]{1,3}$")
NAME_MAX, GROUPS_MAX = 40, 6


def _from_lessons(lessons):
    cnt = Counter()
    for l in lessons or []:
        n = ((l or {}).get("OsztalyCsoport") or {}).get("Nev")
        if isinstance(n, str) and n.strip():
            cnt[n.strip()] += 1
    names = cnt.most_common()
    cls = next((n for n, _ in names if CLASS_RE.match(n)), "")
    groups = [(n, c) for n, c in names if n != cls]
    if any(c > 1 for _, c in groups):
        groups = [(n, c) for n, c in groups if c > 1]
    return {"cls": cls, "groups": [n for n, _ in groups]}


def membership(user, admin=False):
    """{inst, cls, groups, manual}: a felhasználó iskolája, osztálya és csoportjai."""
    if user["inst"] == demo.DEMO_INST:
        if user["test_groups"] and school_link_allowed(user, admin):
            try:
                m = json.loads(user["test_groups"])
                inst = m.get("inst") or demo.DEMO_INST
                return {"inst": inst, "cls": m.get("cls", ""), "groups": m.get("groups", []), "manual": True}
            except ValueError:
                pass
        return {"inst": demo.DEMO_INST, **_from_lessons(demo.data(user["id"], "orarend", {})), "manual": False}
    lessons = []
    for row in db.all_("SELECT body FROM cache WHERE user_id=? AND ckey LIKE 'orarend%'", (user["id"],)):
        try:
            body = json.loads(row["body"])
        except ValueError:
            continue
        lessons += body if isinstance(body, list) else []
    return {"inst": user["inst"], **_from_lessons(lessons), "manual": False}


def clean_inst(v):
    v = v.strip().lower() if isinstance(v, str) else ""
    return v if INST_RE.fullmatch(v) else ""


def clean_groups(cls, groups):
    """A teszt fióknál kézzel megadott értékek ellenőrzése."""
    cls = cls.strip()[:NAME_MAX] if isinstance(cls, str) else ""
    out = []
    for g in groups if isinstance(groups, list) else []:
        g = g.strip()[:NAME_MAX] if isinstance(g, str) else ""
        if g and g != cls and g not in out:
            out.append(g)
    return cls, out[:GROUPS_MAX]
