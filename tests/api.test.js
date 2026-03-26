/**
 * VENIPS – Tests API automatisés
 * Exécuter : node --test tests/api.test.js
 * (Node.js >= 18 requis pour le test runner intégré)
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');

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

let token = '';

// ── Authentification ──────────────────────────────────────────────────────────
describe('Auth', () => {
  test('POST /api/auth — identifiants invalides → 401', async () => {
    const r = await request('POST', '/api/auth', { username: 'FAUX', password: 'mauvais' });
    assert.equal(r.status, 401);
    assert.ok(r.body.error);
  });

  test('POST /api/auth — trop de champs manquants → 400', async () => {
    const r = await request('POST', '/api/auth', {});
    assert.equal(r.status, 400);
  });

  test('POST /api/auth — identifiants valides → token', async () => {
    const r = await request('POST', '/api/auth', {
      username: process.env.TEST_USER || 'VENIPS',
      password: process.env.TEST_PASS || 'venips224@'
    });
    assert.equal(r.status, 200, `Auth failed: ${JSON.stringify(r.body)}`);
    assert.ok(r.body.token, 'Token absent de la réponse');
    token = r.body.token;
  });
});

// ── Accès sans token ──────────────────────────────────────────────────────────
describe('Protection routes', () => {
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
});

// ── CRUD Stock ────────────────────────────────────────────────────────────────
describe('Stock CRUD', () => {
  let createdId;

  test('POST /api/stock — données invalides → 400', async () => {
    const r = await request('POST', '/api/stock', { pa: -5 }, { 'x-venips-token': token });
    assert.equal(r.status, 400);
  });

  test('POST /api/stock — création valide → 201', async () => {
    const r = await request('POST', '/api/stock', {
      id: Date.now(),
      nom: `__test_${Date.now()}`,
      pa: 1000, pv: 1500, qtyInitial: 10,
      createdAt: new Date().toISOString()
    }, { 'x-venips-token': token });
    assert.equal(r.status, 201);
    assert.ok(r.body.id);
    createdId = r.body.id;
  });

  test('GET /api/stock — liste accessible', async () => {
    const r = await request('GET', '/api/stock', null, { 'x-venips-token': token });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
  });

  test('PUT /api/stock/:id — mise à jour', async () => {
    if (!createdId) return;
    const r = await request('PUT', `/api/stock/${createdId}`, { pv: 2000 }, { 'x-venips-token': token });
    assert.equal(r.status, 200);
  });

  test('DELETE /api/stock/:id — suppression', async () => {
    if (!createdId) return;
    const r = await request('DELETE', `/api/stock/${createdId}`, null, { 'x-venips-token': token });
    assert.equal(r.status, 200);
    assert.ok(r.body.ok);
  });
});

// ── Validation ventes ─────────────────────────────────────────────────────────
describe('Ventes validation', () => {
  test('POST /api/ventes — date invalide → 400', async () => {
    const r = await request('POST', '/api/ventes', {
      id: Date.now(), date: 'not-a-date', produit: 'Test', qty: 1, pv: 100
    }, { 'x-venips-token': token });
    assert.equal(r.status, 400);
  });

  test('POST /api/ventes — produit inexistant → 400 ou 201 sans stock', async () => {
    const r = await request('POST', '/api/ventes', {
      id: Date.now(), date: new Date().toISOString().slice(0,10),
      produit: '__produit_inexistant_xyz', qty: 1, pv: 100
    }, { 'x-venips-token': token });
    // Soit rejeté (stock insuffisant) soit accepté sans stockItem
    assert.ok([201, 400].includes(r.status));
  });
});

// ── Sécurité injection ────────────────────────────────────────────────────────
describe('Sécurité', () => {
  test('GET /api/TABLE_INCONNUE → 404', async () => {
    const r = await request('GET', '/api/utilisateurs', null, { 'x-venips-token': token });
    assert.equal(r.status, 404);
  });

  test('POST /api/stock — nom SQL injection → refusé ou nettoyé', async () => {
    const r = await request('POST', '/api/stock', {
      id: Date.now(), nom: "'; DROP TABLE stock; --",
      pa: 0, pv: 0, qtyInitial: 0, createdAt: new Date().toISOString()
    }, { 'x-venips-token': token });
    // Doit être accepté (requête préparée) mais sans danger, ou refusé par validator
    assert.ok([201, 400].includes(r.status));
    // Vérifier que le stock existe toujours
    const check = await request('GET', '/api/stock', null, { 'x-venips-token': token });
    assert.equal(check.status, 200);
    assert.ok(Array.isArray(check.body), 'La table stock ne doit pas être droppée');
    // Nettoyer si créé
    if (r.status === 201 && r.body.id) {
      await request('DELETE', `/api/stock/${r.body.id}`, null, { 'x-venips-token': token });
    }
  });
});
