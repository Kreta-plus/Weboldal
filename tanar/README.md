# ZsírKréta – tanári verzió

    pip install -r ../requirements.txt
    python run.py      # http://localhost:3100

Dockerrel (a projekt gyökeréből): `docker compose up -d --build tanar`, aztán http://127.0.0.1:3100. Az adatok a `zsirkreta-tanar-data` kötetben vannak. A `KT_...` beállítások a `docker-compose.yml` `tanar` részében adhatók meg.

Ugyanaz a kinézet, mint a diák verzióé (a `public/css/app.css` másolata + `tanar.css`), de külön szerver, külön adatbázis (`tanar/data/`).

**Teszt fiók:** a belépőoldalon „Kipróbálom teszt fiókkal”. Generál egy iskolát (3 osztály, 5 csoport, ~75 diák, órarend, jegyek, házik, számonkérések, mulasztások, haladási napló, feljegyzések). Minden művelet kipróbálható, de csak szimulált; a KRÉTA-hoz semmi nem megy ki. `KT_DEMO=0` kikapcsolja.

## Szerkezet

- `kreta_tanar/providers/` – adatforrás-réteg. A `base.py` írja le az adatformát és a műveleteket.
  - `demo.py` – teszt fiók (generált iskola egy JSON-ban, a műveletek ezt módosítják)
  - `kreta.py` – valódi KRÉTA (tanári Napló V3 API, nem hivatalos, élőben nem kipróbált), a `kreta_client.py`-val
- `kreta_tanar/ops.py` – minden írás itt megy át: ellenőrzés → előnézet → egyszer használható token → végrehajtás → visszaolvasás → műveletnapló. Nincs automatikus újrapróbálás.
- `blueprints/` – `auth` (KRÉTA- és teszt belépés), `data` (olvasás, `/api/t/...`), `ops` (`/api/ops/preview`, `/api/ops/commit`), `prefs`
- `public/js/ops.js` – a megerősítő ablak; a nézetek csak a `runOp(op, adat)` hívást használják

## Műveletek

`lesson.log` (téma + mulasztás egyszerre), `grade.add` (egy vagy több diák), `grade.edit`, `grade.delete`, `homework.add`, `homework.delete`, `test.add`, `test.delete`, `absence.record`, `lesson.topic` (haladási napló), `note.add` (feljegyzés, dicséret, figyelmeztetés egy vagy több diáknak; az osztályfőnöki csak a saját osztálynak), `note.delete`.

Új művelet: validátor az `ops.py`-ba (`OPS`), `apply`/`verify` ág a szolgáltatóba, felület a `runOp`-pal.

## Valódi KRÉTA (tanári fiók)

A belépőoldalon kétféleképpen lehet belépni (lásd lent). A program a KRÉTA tanári „Napló” API-ját (V3) használja: `providers/kreta.py`, `kreta_client.py`.

**Fontos:** ez nem hivatalos kapcsolat. A végpontok és a mezőnevek nyílt forráskódú projektekből származnak ([kreta.js](https://github.com/blazsmaster/kreta.js) `NaploApiV3`, MIT; [Coware Napló+](https://github.com/Coware-Apps/naplo), archivált). **Valódi KRÉTA-val nincs kipróbálva.** A Napló+ alkalmazást az eKréta Zrt. szerzői jogi panasszal eltávolíttatta az alkalmazásboltokból, és a nem hivatalos programmal végzett módosításért a tanár felel. Éles használat előtt egyeztess az iskolával.

- **Belépés a KRÉTA saját oldalán (ajánlott):** a „Belépés a KRÉTA-ban” gomb új lapon megnyitja az `idp.e-kreta.hu` belépőoldalát. Belépés után a KRÉTA egy `https://mobil.e-kreta.hu/naplo/prod/oauthredirect?code=…` címre visz (hibaoldal vagy üres lap, ez így jó). Ezt a címet kell kimásolni és visszahozni: visszatéréskor a program magától kiolvassa a vágólapról, vagy be lehet illeszteni a mezőbe. A kódot a szerver váltja be tokenre (`/api/auth/link/start`, `/api/auth/link/finish`, PKCE). A jelszó így a programhoz el sem jut.
  - Kliens: `kreta-naplo-mobile-ios`, scope: `openid email offline_access kreta-naplo-webapi.public`. Ezeket és az átirányítási címet az IdP authorize és token végpontján ellenőriztem (2026.11.03.): helyes értékekkel a belépőoldalt adja, a token végpont pedig ismeri a klienst. Valódi tanári fiókkal még nincs végigpróbálva.
- **Belépés jelszóval:** lenyíló rész a belépőoldalon. A program maga tölti ki a KRÉTA belépőoldalát ugyanezzel a klienssel, végül a régi jelszavas tokenkérést próbálja. Captchánál vagy kétlépcsős azonosításnál nem működik.
- Csak tanári szerepkörű fiók léphet be. A régi `kreta-naplo-mobile` klienst a KRÉTA már nem ismeri.
- **Olvasás:** gyorsítótárral és szünetekkel, mint a diák verzióban.
- **Írás alapból BE**, minden támogatott műveletre. Minden művelet előtt megjelenik a megerősítő ablak a pontos kéréssel (módszer, útvonal, JSON), és csak a jóváhagyás után megy ki. Szűkítés a szerver indításakor:

      KT_LIVE_WRITE=0 python run.py                            # semmi nem megy ki, csak az előnézet
      KT_LIVE_OPS=lesson.log,homework.add python run.py        # csak a felsoroltak mennek ki

  Javaslat: az első alkalommal ártalmatlan adattal próbáld ki (pl. egy teszt házi, amit utána törölsz).

| Művelet | KRÉTA-végpont | Megbízhatóság |
|---|---|---|
| `lesson.log`, `lesson.topic` (naplózás: téma + mulasztás) | `POST Orarend/OraNaplozas` | V3 kérésforma ismert |
| `homework.add` / `.delete` | `POST HaziFeladat`, `DELETE HaziFeladat/{id}` | V3 kérésforma ismert |
| `test.add` / `.delete` | `POST/DELETE Orarend/BejelentettSzamonkeres` | V3 kérésforma ismert |
| `grade.edit` / `.delete` | `PUT/DELETE OsztalyCsoport/Tanulok/Ertekeles/{id}` | V3 kérésforma ismert |
| `grade.add` | `POST OsztalyCsoport/Ertekeles` | **kísérleti**: a kreta.js V3 kérésmodellje (`ClassGroupEvaluationRequestDto`); a régi v2 forma élőben 500-at adott |
| `note.add` | – | nem támogatott (a V3-ban nincs szabad szöveges feljegyzés) |

Ha valami nem megy, a szerver terminálja `[KRÉTA]` sorokban mutatja a kéréseket és a válaszokat. Minden érték felülírható: `KT_CLIENT_ID`, `KT_UA`, `KT_REDIRECT_URI`, `KT_SCOPE`, `KT_NAPLO_PATH`, `KT_MIN_GAP`. `KT_KRETA=0` kikapcsolja a valódi belépést.

## Az óra oldala

Az órarendben bármelyik órára kattintva megnyílik az óra oldala: **Naplózás** (téma + jelen / hiányzik / késik, egy mentéssel) és **Jegyek** (jegybeírás erre az órára, az óra napjával és alapból az óra témájával).

Csak a saját gépen futtasd (`127.0.0.1`), ne tedd ki az internetre: a tanári fiók sok diák adatához ad hozzáférést.

## Hiba / ötlet bejelentése (GlitchTip)

Mint a diák verzióban: az oldalsávban (telefonon a „Továbbiak” lapon) és a belépőoldalon a „📣 Hiba / ötlet” gombbal lehet írni.
Ha egy oldal nem jelenik meg, a hibaüzenet alatti „🐞 Hiba bejelentése” gomb a hiba szövegével kitöltve nyitja meg az űrlapot.

- A hiba és az ötlet a GlitchTip „Tanári” projektjébe kerül (`app: tanari` címkével), a szerverhibák pedig maguktól.
- Nem kerül bele: a kérések törzse (jegyek, mulasztások, jelszó), sütik, lekérdezési paraméterek (diákazonosítók), tokenek. A technikai adatok (oldal, böngésző, képernyő, legutóbbi JS-hibák) csak bepipálva mennek.
- IP-nként óránként legfeljebb 5 bejelentés.
- Beállítás: `KT_GLITCHTIP_DSN` (üresen kikapcsolja), `KT_ENV=development` a próbákhoz, `KT_DISCORD_WEBHOOK` a Discord-értesítéshez (ezzel az „Üzenet” fajta is elérhető), `KT_FEEDBACK=0` az egészet kikapcsolja.
