# KRÉTA Plusz

    pip install -r requirements.txt
    python run.py      # http://localhost:3000

Szerkezet: `kreta_plusz/` (config, db, security, kreta kliens, blueprints: auth / data / prefs), `public/` (css, js modulok, nézetek).
Adatok: `data/` (SQLite + titkosítókulcs). A `data/secret.key` fájlt ne oszd meg, az védi a tárolt tokent.
Ha a belépés nem megy: a terminál [KRÉTA] sorai mutatják a hibás lépést; a KRETA_CLIENT_ID, KRETA_REDIRECT_URI stb. környezeti változókkal javítható.
