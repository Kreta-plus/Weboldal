# ZsírKréta

    pip install -r requirements.txt
    python run.py      # http://localhost:3000

Szerkezet: `zsirkreta/` (config, db, security, kreta kliens, blueprints: auth / data / prefs), `public/` (css, js modulok, nézetek).
Adatok: `data/` (SQLite + titkosítókulcs). A belépés (a KRÉTA-tokenekkel együtt) nem az adatbázisban van, hanem titkosítva és aláírva a böngésző `kp_sid` sütijében; a lejáratot belépéskor a felhasználó választja (1 óra … soha). A `data/secret.key` titkosítja és írja alá ezeket a sütiket: ne oszd meg. Ha kiszivárgott, töröld (újraindításkor új készül), ezzel mindenki kilép.
Belépni csak az Általános Szerződési Feltételek (`public/aszf.html`, címe `/aszf`) elfogadásával lehet; a szerver is ellenőrzi.
Ha a belépés nem megy: a terminál [KRÉTA] sorai mutatják a hibás lépést; a KRETA_CLIENT_ID, KRETA_REDIRECT_URI stb. környezeti változókkal javítható.

Dockerrel: `docker compose up -d --build` (http://127.0.0.1:3000). A tanári verzió: `docker compose up -d --build tanar` (http://127.0.0.1:3100), lásd `tanar/README.md`. Az adatok a `zsirkreta-data` kötetben vannak, ezt mentsd. Kifelé HTTPS-es proxy (nginx, Caddy) mögé tedd; proxy nélkül állítsd `KP_TRUST_PROXY=0`-ra.

Hibakövetés: a szerverhibák és a felhasználók hibabejelentései és ötletei (📣 Hiba / ötlet a menüben) a GlitchTipbe mennek; a `kind` címke szerint szűrhetők (`bugreport` / `idea`). Más projekthez `KP_GLITCHTIP_DSN=...`, kikapcsolni `KP_GLITCHTIP_DSN=` (üres), fejlesztéskor `KP_ENV=development`. A jelszó, a kérés törzse és a sütik nem kerülnek a jelentésbe.

Discord: a Kapcsolatok oldalon a szerver meghívója élő létszámmal (`KP_DISCORD_INVITE`), és egy űrlap, amivel üzenni lehet a csapatnak. Az üzenetek és a hibabejelentések/ötletek értesítései a `KP_DISCORD_WEBHOOK` webhookra mennek. A webhook titok (vele bárki írhatna a csatornába), ezért nincs a kódban: a gitből és a Docker-képből kimaradó `.env` fájlban van (`KP_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...`), a compose is innen adja át. Üresen hagyva a Discord-küldés kikapcsol. A hibákról és ötletekről szóló értesítésben egy link egyből a GlitchTip-bejelentésre visz; ehhez a GlitchTip-szervezet rövid neve kell (`KP_GLITCHTIP_ORG`, alapból `zsirkreta`).

E-mailes belépés: KRÉTA-belépés után a Beállítások › Fiók és adatok részben e-mail cím és jelszó csatolható a fiókhoz, utána azzal is be lehet lépni (visszaigazoló levél nincs, a jelszó scrypttel tárolva). A `KP_ADMIN_EMAILS` címek (alapból `d-kreta@kopaszhegy.hu`, `b-kreta@kopaszhegy.hu`) fejlesztői fiókok: velük belépve a Fejlesztő oldal nyílik meg, ahol az egész oldal beállításai szerkeszthetők (közlemény, karbantartás mettől–meddig időzítve, teszt fiók, üzenetküldés, Discord-meghívó) és egy kis statisztika látszik. Mivel visszaigazolás nincs, ezeket a címeket csak a `KP_DEV_CODE` fejlesztői kóddal lehet csatolni (a `.env` fájlban van); e nélkül bárki fejlesztő lehetne.

Telefonos (Android, Java) változat: `phone/` – Android Studióban nyisd meg a mappát, lásd `phone/README.md`.
