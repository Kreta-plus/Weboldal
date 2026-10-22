#!/bin/bash
set -e

REPO_URL="https://github.com/Kreta-plus/Weboldal.git"
PROJECT_DIR="Weboldal"

echo "--- 1. Repozitórium ellenőrzése és klónozása ---"
if [ ! -d "$PROJECT_DIR" ]; then
    git clone "$REPO_URL"
else
    echo "A(z) $PROJECT_DIR mappa már létezik, frissítés (pull)..."
    cd "$PROJECT_DIR" && git pull && cd ..
fi

cd "$PROJECT_DIR"

echo "--- 2. Python virtuális környezet beállítása ---"
# Ellenőrizzük, hogy a uv fent van-e a gépen
HAS_UV=false
if command -v uv &> /dev/null; then
    HAS_UV=true
    echo "> UV detektálva! A virtuális környezetet UV-val hozzuk létre."
else
    echo "> UV nem található, a hagyományos python3 -m venv lesz használva."
fi

# Virtuális környezet és csomagok telepítése
if [ "$HAS_UV" = true ]; then
    uv venv .venv
    if [ -f "pyproject.toml" ]; then
        uv sync
    elif [ -f "requirements.txt" ]; then
        uv pip install -r requirements.txt
    fi
else
    python3 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip
    if [ -f "requirements.txt" ]; then
        pip install -r requirements.txt
    elif [ -f "pyproject.toml" ]; then
        pip install .
    fi
    deactivate
fi

echo "--- A telepítés sikeresen lefutott! ---"