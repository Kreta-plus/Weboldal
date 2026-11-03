#!/bin/bash
set -e

echo "=== Telepítési fázis indítása ==="
./install.sh

echo -e "\n=== Indítási fázis indítása ==="
./run.sh