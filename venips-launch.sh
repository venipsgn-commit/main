#!/bin/bash
# Script de lancement VENIPS
APP_DIR="/home/user/main"
PORT=3000
NODE="/opt/node22/bin/node"
URL="http://localhost:$PORT"

# Vérifier si le serveur tourne déjà
if ! curl -s "$URL" > /dev/null 2>&1; then
  echo "Démarrage du serveur VENIPS..."
  cd "$APP_DIR"
  nohup "$NODE" server.js > "$APP_DIR/venips.log" 2>&1 &
  SERVER_PID=$!
  echo "Serveur démarré (PID: $SERVER_PID)"

  # Attendre que le serveur soit prêt (max 10 secondes)
  for i in $(seq 1 20); do
    sleep 0.5
    if curl -s "$URL" > /dev/null 2>&1; then
      echo "Serveur prêt !"
      break
    fi
  done
else
  echo "Serveur déjà en cours d'exécution."
fi

# Ouvrir le navigateur
sensible-browser "$URL" 2>/dev/null || \
  xdg-open "$URL" 2>/dev/null || \
  x-www-browser "$URL" 2>/dev/null || \
  echo "Ouvre manuellement : $URL"
