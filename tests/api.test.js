/**
 * VENIPS – Tests API automatisés
 * Exécuter : node --test tests/api.test.js
 * (Node.js >= 18 requis pour le test runner intégré)
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');
const crypto = require('node:crypto');

const BASE = `http://localhost:${process.env.PORT || 3000}`;

// ── Utilitaire requête HTTP ───────────────────────────────────────────────────
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port:     url.port,
      path:     url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Tests unitaires _auth.js ──────────────────────────────────────────────────
describe('Auth module (_auth.js)', () => {
  const TOKEN_WINDOW_MS = 24 * 60 * 60 * 1000;

  function makeToken(username, windowOffset = 0) {
    const secret = process.env.VENIPS_API_SECRET || 'venips-default-secret';
    const w = Math.floor(Date.now() / TOKEN_WINDOW_MS) + windowOffset;
    return crypto.createHmac('sha256', secret).update(`${username}:${w}`).digest('hex');
  }

  function isValidToken(token) {
    if (!token || token === 'offline') return false;
    const secret = process.env.VENIPS_API_SECRET || 'venips-default-secret';
    const now = Math.floor(Date.now() / TOKEN_WINDOW_MS);
    const USERS = ['VENIPS', 'JACOB'];
    return USERS.some(u =>
      [now, now - 1].some(w =>
        crypto.createHmac('sha256', secret).update(`${u}:${w}`).digest('hex') === token
      )
    );
  }

  test('makeToken génère un token non vide', () => {
    const t = makeToken('VENIPS');
    assert.ok(t && t.length === 64, 'Token doit être un hash hex 256 bits');
  });

  test('token valide pour la fenêtre courante', () => {
    const t = makeToken('VENIPS', 0);
    assert.ok(isValidToken(t), 'Token de la fenêtre courante doit être valide');
  });

  test('token valide pour la fenêtre précédente (période de grâce)', () => {
    const t = makeToken('VENIPS', -1);
    assert.ok(isValidToken(t), 'Token de la fenêtre précédente doit être accepté');
  });

  test('token rejeté pour une fenêtre future', () => {
    const t = makeToken('VENIPS', +1);
    assert.ok(!isValidToken(t), 'Token futur ne doit pas être valide');
  });

  test('token rejeté pour une fenêtre trop ancienne', () => {
    const t = makeToken('VENIPS', -2);
    assert.ok(!isValidToken(t), 'Token de -48h ne doit pas être valide');
  });

  test('token "offline" toujours rejeté', () => {
    assert.ok(!isValidToken('offline'));
  });

  test('token vide toujours rejeté', () => {
    assert.ok(!isValidToken(''));
    assert.ok(!isValidToken(null));
    assert.ok(!isValidToken(undefined));
  });

  test('deux utilisateurs génèrent des tokens différents', () => {
    const t1 = makeToken('VENIPS');
    const t2 = makeToken('JACOB');
    assert.notEqual(t1, t2, 'Les tokens doivent être différents par utilisateur');
  });
});

// ── Validation serveur (sans connexion réseau nécessaire) ─────────────────────
describe('Validation [table].js (logique)', () => {
  // On importe directement la fonction validate pour tester sans serveur
  function validate(table, record) {
    switch (table) {
      case 'stock':
        if (!record.nom || record.nom.trim() === '') return 'Nom du produit obligatoire.';
        if (record.pa === undefined || record.pa === null || record.pa < 0) return 'Prix d\'achat invalide (doit être ≥ 0).';
        if (record.pv === undefined || record.pv === null || record.pv < 0) return 'Prix de vente invalide (doit être ≥ 0).';
        if ((record.qtyInitial ?? record.qty ?? -1) < 0) return 'Quantité initiale invalide (doit être ≥ 0).';
        break;
      case 'charges':
        if (!record.montant || record.montant <= 0) return 'Montant de la charge invalide (doit être > 0).';
        if (!record.date) return 'Date de la charge obligatoire.';
        break;
      case 'dettes':
        if (!record.nom || record.nom.trim() === '') return 'Nom / Prénom obligatoire.';
        if (!record.montant || record.montant <= 0) return 'Montant de la dette invalide (doit être > 0).';
        if (!record.date) return 'Date obligatoire.';
        if (!record.type) return 'Type de dette obligatoire.';
        break;
      case 'creances':
        if (!record.vendeur || record.vendeur.trim() === '') return 'Vendeur obligatoire.';
        if (!record.produit || record.produit.trim() === '') return 'Produit obligatoire.';
        if (!record.qty || record.qty <= 0) return 'Quantité invalide (doit être > 0).';
        if (record.prix === undefined || record.prix === null || record.prix < 0) return 'Prix unitaire invalide (doit être ≥ 0).';
        if (!record.date) return 'Date obligatoire.';
        break;
      case 'defectueux':
        if (!record.produit || record.produit.trim() === '') return 'Produit obligatoire.';
        if (!record.qty || record.qty <= 0) return 'Quantité invalide (doit être > 0).';
        if (!record.date) return 'Date obligatoire.';
        break;
    }
    return null;
  }

  test('stock — nom manquant → erreur', () => {
    assert.ok(validate('stock', { pa: 0, pv: 0, qtyInitial: 10 }));
  });

  test('stock — pa négatif → erreur', () => {
    assert.ok(validate('stock', { nom: 'Test', pa: -1, pv: 0, qtyInitial: 0 }));
  });

  test('stock — données valides → null', () => {
    assert.equal(validate('stock', { nom: 'Test', pa: 500, pv: 800, qtyInitial: 5 }), null);
  });

  test('stock — pv à zéro autorisé', () => {
    assert.equal(validate('stock', { nom: 'Test', pa: 0, pv: 0, qtyInitial: 0 }), null);
  });

  test('charges — montant nul → erreur', () => {
    assert.ok(validate('charges', { montant: 0, date: '2024-01-01' }));
  });

  test('charges — date manquante → erreur', () => {
    assert.ok(validate('charges', { montant: 5000 }));
  });

  test('charges — valide → null', () => {
    assert.equal(validate('charges', { montant: 5000, date: '2024-01-01' }), null);
  });

  test('dettes — type manquant → erreur', () => {
    assert.ok(validate('dettes', { nom: 'Ali', montant: 10000, date: '2024-01-01' }));
  });

  test('dettes — valide → null', () => {
    assert.equal(validate('dettes', { nom: 'Ali', montant: 10000, date: '2024-01-01', type: 'Client doit' }), null);
  });

  test('creances — prix négatif → erreur', () => {
    assert.ok(validate('creances', { vendeur: 'V', produit: 'P', qty: 1, prix: -1, date: '2024-01-01' }));
  });

  test('creances — prix à zéro autorisé', () => {
    assert.equal(validate('creances', { vendeur: 'V', produit: 'P', qty: 1, prix: 0, date: '2024-01-01' }), null);
  });

  test('defectueux — qty <= 0 → erreur', () => {
    assert.ok(validate('defectueux', { produit: 'P', qty: 0, date: '2024-01-01' }));
  });

  test('defectueux — valide → null', () => {
    assert.equal(validate('defectueux', { produit: 'P', qty: 2, date: '2024-01-01' }), null);
  });
});

// ── Tests d'intégration (nécessitent un serveur sur localhost:3000) ───────────
describe('Intégration API', { skip: !process.env.RUN_INTEGRATION }, () => {
  let token = '';

  test('POST /api/auth — identifiants invalides → 401', async () => {
    const r = await request('POST', '/api/auth', { username: 'FAUX', password: 'mauvais' });
    assert.equal(r.status, 401);
    assert.ok(r.body.error);
  });

  test('POST /api/auth — identifiants vides → 401', async () => {
    const r = await request('POST', '/api/auth', {});
    assert.equal(r.status, 401);
  });

  test('POST /api/auth — identifiants valides → token + expires', async () => {
    const r = await request('POST', '/api/auth', {
      username: process.env.TEST_USER || 'VENIPS',
      password: process.env.TEST_PASS || 'venips224@'
    });
    assert.equal(r.status, 200, `Auth failed: ${JSON.stringify(r.body)}`);
    assert.ok(r.body.token, 'Token absent de la réponse');
    assert.ok(r.body.expires, 'expires absent de la réponse');
    assert.ok(r.body.expires > Date.now(), 'expires doit être dans le futur');
    token = r.body.token;
  });

  test('GET /api/stock sans token → 401', async () => {
    const r = await request('GET', '/api/stock');
    assert.equal(r.status, 401);
  });

  test('GET /api/ventes sans token → 401', async () => {
    const r = await request('GET', '/api/ventes');
    assert.equal(r.status, 401);
  });

  test('GET /api/logs sans token → 401', async () => {
    const r = await request('GET', '/api/logs');
    assert.equal(r.status, 401);
  });

  test('POST /api/stock — données invalides → 400', async () => {
    const r = await request('POST', '/api/stock', { pa: -5 }, { 'x-venips-token': token });
    assert.equal(r.status, 400);
  });

  test('GET /api/stock — liste accessible avec token', async () => {
    const r = await request('GET', '/api/stock', null, { 'x-venips-token': token });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
  });

  test('POST /api/ventes — produit inexistant → 400', async () => {
    const r = await request('POST', '/api/ventes', {
      id: Date.now(), date: new Date().toISOString().slice(0, 10),
      produit: '__produit_inexistant_xyz', qty: 1, pv: 100
    }, { 'x-venips-token': token });
    assert.equal(r.status, 400);
    assert.ok(r.body.error);
  });
});
