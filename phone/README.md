# ZsírKréta – telefonos (Android) alkalmazás

A `Weboldal/` mappában lévő ZsírKréta webes alkalmazás natív, **Java** nyelvű Android változata.
Android Studióban nyisd meg ezt a mappát (`File → Open… → phone`), a Gradle-szinkron után futtatható.

* minSdk 26 (Android 8.0), targetSdk/compileSdk 37, Java 17, AGP 9.4, Gradle 9.6
* Függőségek: AppCompat, Material Components, SwipeRefreshLayout – semmi más (diagramok, HTTP, JSON saját/beépített)
* Parancssorból: `./gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`

## Más felépítés, mint a webnél: nincs szerver

A webes változatban egy Flask szerver intézte a KRÉTA-belépést, a gyorsítótárat és a beállítások tárolását.
A telefonon ez mind az appban fut:

| Web (Flask)                     | Telefon                                                                        |
|---------------------------------|--------------------------------------------------------------------------------|
| `kreta.py` (belépés, lekérdezés)| `data/Kreta.java`, `data/Http.java` – ugyanaz a lánc (OAuth2 + PKCE, űrlapkitöltés, token-megújítás, „udvarias” gyorsítótár: TTL, percenkénti frissítés, 429/403 utáni szünet, régi adat hiba esetén) |
| Fernet-titkosított token        | `data/SecureBox.java` – Android Keystore (AES-GCM)                             |
| SQLite (`cache`, `prefs`, …)    | `data/Store.java` – fájlok az app privát tárhelyén                             |
| `prefs.py` (beállítások)        | `data/Prefs.java` – ugyanazok a JSON-kulcsok és tisztítás: a **beállítások exportja a webes és a telefonos app között cserélhető** |
| `demo.py` (teszt fiók)          | `data/Demo.java`                                                               |
| `state.js`, `util.js`           | `data/St.java`, `data/Norm.java`, `util/`                                      |
| `views/*.js`, `story.js`, `charts.js` | `ui/*Screen.java`, `ui/StoryDialog.java`, `ui/Charts.java`               |

## Funkciók (mind megvan)

Kezdőlap (widgetek, mai órák, vicces mondat, story) · Jegyek (félév-szűrő, keresés, jegyszámoló, célok, „hány 5-ös kell”) ·
Statisztika (11 diagram) · Órarend (nap/hét nézet, húzás) · Házi + számonkérések (helyi pipálás) · Hiányzások ·
Feljegyzések · Nevek (saját tanár-/tantárgynevek, becenév) · Tervező (saját házik, dolgozatok) ·
Táska (felszerelés tantárgyanként + teljes képernyős holnapi táska 4 elrendezéssel) ·
Beállítások (téma: auto/sötét/világos/AMOLED, a weboldal 12 színtémája, kiemelő szín, háttér- és kártyastílus, sűrűség, betűméret, lekerekítés, kezdőoldal, súlyozott átlag, célátlag,
widgetek, elrejtett tantárgyak, egyedi stílus, jótanuló mód, developer mód, export/import, kilépés, fiók törlése) ·
Story kép (1080×1920, mentés a Képek közé vagy megosztás) · Belépés, mint a weben: a KRÉTA saját oldalán (beépített böngésző), cím beillesztésével, teszt fiók ·
Frissítés, mint a weben: percenként automatikusan (csak amíg az app előtérben van), belépés után azonnal friss adat, a gomb és az
automatikus frissítés együtt is legfeljebb percenként kér a KRÉTA-tól, új adatnál „Frissítve, új adat: …” üzenet.

## Ami szándékosan másképp van

* **Egyedi CSS → egyedi stílus.** Natív alkalmazásban nincs CSS. Helyette a téma változóit (`--accent`, `--bg`, `--surface`, `--g1…--g5`,
  `--radius`, `--card-alpha`, `--border-width`, `--kpi-scale` …) lehet CSS-szerű `--név: érték;` sorokkal állítani; az előbeállítások és a
  „Változó beszúrása” lista megvan. A szelektorokat (`.card { … }`) nem értelmezi.
* **Munkamenetek.** Nincs szerver, így nincs „Kilépés mindenhonnan” és eszközlista; a kilépés a készüléken törli a tokent és a gyorsítótárat
  (a beállítások fiókonként megmaradnak).
* **KRÉTA-végpontok.** A webes README környezeti változói helyett a belépő képernyő „Haladó beállítások” részén szerkeszthetők.
  Ha a belépés nem sikerül, a hibaüzenet „Részletek” része megmutatja a KRÉTA válaszát.
* Új: húzásra frissítés, élő témaváltás újraindítás nélkül, beépített böngészős belépés (a kódot automatikusan elfogja).

## Fontos

A belépés a KRÉTA saját oldalán történik (a jelszó az appba nem kerül), a kódot a beépített böngésző fogja el. Teszt fiókkal
emulátoron kipróbálva, **valódi KRÉTA-fiókkal nem**. Ha a belépés elutasít, a „Részletek” rész és a Haladó beállítások segít;
ha a beépített böngésző nem megy, a „Belépés a cím beillesztésével” a tartalék.
