#!/bin/bash
set -e

PROJECT_DIR="Weboldal"

if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR"
fi

if [ ! -d ".venv" ]; then
    echo "Hiba: A virtuális környezet (.venv) nem található! Futtasd előbb az install.sh-t."
    exit 1
fi

echo "--- Alkalmazás indítása ---"
source .venv/bin/activate

# Belépési pont automatikus detektálása
if [ -f "main.py" ]; then
    python main.py
elif [ -f "app.py" ]; then
    python app.py
elif [ -f "manage.py" ]; then
    python manage.py runserver
else
    echo "Nem található ismert indítófájl (main.py, app.py, manage.py)."
    echo "Kérlek, indítsd el manuálisan a megfelelő parancstal!"
    exit 1
fi