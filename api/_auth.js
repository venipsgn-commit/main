'use strict';
// api/_auth.js — module partagé (préfixe _ = pas un endpoint Vercel)

const crypto = require('crypto');

const USERS = ['VENIPS', 'JACOB'];
const TOKEN_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 heures

/**
 * Génère un token valable pour la fenêtre de 24h courante.
 * Le token change automatiquement toutes les 24h.
 */
function makeToken(username) {
  const secret  = process.env.VENIPS_API_SECRET || 'venips-default-secret';
  const window  = Math.floor(Date.now() / TOKEN_WINDOW_MS);
  return crypto.createHmac('sha256', secret).update(`${username}:${window}`).digest('hex');
}

/**
 * Vérifie le token : accepte la fenêtre courante ET la précédente
 * (période de grâce pour éviter une déconnexion en plein travail).
 */
function isValidToken(req) {
  const token = req.headers['x-venips-token'];
  if (!token || token === 'offline') return false;
  const secret = process.env.VENIPS_API_SECRET || 'venips-default-secret';
  const now    = Math.floor(Date.now() / TOKEN_WINDOW_MS);
  return USERS.some(u =>
    [now, now - 1].some(w =>
      crypto.createHmac('sha256', secret).update(`${u}:${w}`).digest('hex') === token
    )
  );
}

/**
 * Extrait le nom d'utilisateur depuis le token.
 */
function getUsername(req) {
  const token = req.headers['x-venips-token'];
  if (!token || token === 'offline') return 'Inconnu';
  const secret = process.env.VENIPS_API_SECRET || 'venips-default-secret';
  const now    = Math.floor(Date.now() / TOKEN_WINDOW_MS);
  for (const u of USERS) {
    for (const w of [now, now - 1]) {
      if (crypto.createHmac('sha256', secret).update(`${u}:${w}`).digest('hex') === token) return u;
    }
  }
  return 'Inconnu';
}

module.exports = { makeToken, isValidToken, getUsername, TOKEN_WINDOW_MS };
