# ZsírKréta

    pip install -r requirements.txt
    python run.py      # http://localhost:3000

Szerkezet: `zsirkreta/` (config, db, security, kreta kliens, blueprints: auth / data / prefs), `public/` (css, js modulok, nézetek).
Adatok: `data/` (SQLite + titkosítókulcs). A `data/secret.key` fájlt ne oszd meg, az védi a tárolt tokent.
Ha a belépés nem megy: a terminál [KRÉTA] sorai mutatják a hibás lépést; a KRETA_CLIENT_ID, KRETA_REDIRECT_URI stb. környezeti változókkal javítható.

Hibakövetés: a szerverhibák és a felhasználók hibabejelentései (🐞 gomb a menüben) a GlitchTipbe mennek. Más projekthez `KP_GLITCHTIP_DSN=...`, kikapcsolni `KP_GLITCHTIP_DSN=` (üres), fejlesztéskor `KP_ENV=development`. A jelszó, a kérés törzse és a sütik nem kerülnek a jelentésbe.

Telefonos (Android, Java) változat: `phone/` – Android Studióban nyisd meg a mappát, lásd `phone/README.md`.
