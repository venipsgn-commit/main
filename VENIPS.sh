#!/bin/bash
# Lanceur VENIPS pour Linux / Mac
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=3000
URL="http://localhost:$PORT"

cd "$APP_DIR"

# Verifier Node.js
if ! command -v node &> /dev/null; then
    echo "[!] Node.js non trouve. Installe-le sur https://nodejs.org"
    exit 1
fi

# Installer les dependances si besoin
if [ ! -d "node_modules" ]; then
    echo "Installation des dependances..."
    npm install --production
fi

# Demarrer le serveur si pas deja en cours
if ! curl -s "$URL" > /dev/null 2>&1; then
    echo "Demarrage du serveur VENIPS..."
    nohup node server.js > venips.log 2>&1 &
    # Attendre que le serveur soit pret
    for i in $(seq 1 20); do
        sleep 0.5
        if curl -s "$URL" > /dev/null 2>&1; then break; fi
    done
fi

# Ouvrir le navigateur
xdg-open "$URL" 2>/dev/null || open "$URL" 2>/dev/null || sensible-browser "$URL" 2>/dev/null
echo "VENIPS ouvert sur $URL"
