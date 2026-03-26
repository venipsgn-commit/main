'use strict';

require('dotenv').config();

const express      = require('express');
const Database     = require('better-sqlite3');
const path         = require('path');
const fs           = require('fs');
const crypto       = require('crypto');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');

const app = express();
const db  = new Database(path.join(__dirname, 'venips.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Whitelist et colonnes par table ───────────────────────────────────────────
const ALLOWED_TABLES = new Set(['stock', 'ventes', 'vendeurs', 'charges', 'dettes', 'defectueux']);

const TABLE_COLS = {
  stock:       ['nom', 'pa', 'pv', 'qtyInitial', 'categorie', 'seuilAlerte', 'createdAt', 'updatedAt'],
  ventes:      ['date', 'produit', 'qty', 'pa', 'pv', 'remise', 'gain', 'vendeur', 'stockAvant', 'stockApres', 'stockId', 'createdAt', 'updatedAt'],
  vendeurs:    ['nom', 'createdAt', 'updatedAt'],
  charges:     ['date', 'type', 'montant', 'desc', 'categorie', 'createdAt', 'updatedAt'],
  dettes:      ['nom', 'type', 'montant', 'date', 'statut', 'createdAt', 'updatedAt'],
  defectueux:  ['date', 'produit', 'qty', 'probleme', 'solution', 'statut', 'createdAt', 'updatedAt'],
};

// Règles de validation par table
const VALIDATORS = {
  stock: (b) => {
    if (!b.nom || typeof b.nom !== 'string' || b.nom.trim().length === 0) return 'Nom requis';
    if (b.nom.length > 100) return 'Nom trop long (max 100 caractères)';
    if (b.pa !== undefined && (isNaN(b.pa) || b.pa < 0)) return 'Prix achat invalide';
    if (b.pv !== undefined && (isNaN(b.pv) || b.pv < 0)) return 'Prix vente invalide';
    if (b.qtyInitial !== undefined && (isNaN(b.qtyInitial) || b.qtyInitial < 0)) return 'Quantité invalide';
    if (b.seuilAlerte !== undefined && (isNaN(b.seuilAlerte) || b.seuilAlerte < 0)) return 'Seuil alerte invalide';
    return null;
  },
  ventes: (b) => {
    if (!b.date || !/^\d{4}-\d{2}-\d{2}/.test(b.date)) return 'Date invalide';
    if (!b.produit || typeof b.produit !== 'string' || b.produit.trim().length === 0) return 'Produit requis';
    if (b.qty !== undefined && (isNaN(b.qty) || b.qty <= 0)) return 'Quantité invalide';
    if (b.pa !== undefined && (isNaN(b.pa) || b.pa < 0)) return 'Prix achat invalide';
    if (b.pv !== undefined && (isNaN(b.pv) || b.pv < 0)) return 'Prix vente invalide';
    return null;
  },
  vendeurs: (b) => {
    if (!b.nom || typeof b.nom !== 'string' || b.nom.trim().length === 0) return 'Nom requis';
    if (b.nom.length > 100) return 'Nom trop long (max 100 caractères)';
    return null;
  },
  charges: (b) => {
    if (!b.date || !/^\d{4}-\d{2}-\d{2}/.test(b.date)) return 'Date invalide';
    if (b.montant !== undefined && (isNaN(b.montant) || b.montant < 0)) return 'Montant invalide';
    return null;
  },
  dettes: (b) => {
    if (!b.nom || typeof b.nom !== 'string' || b.nom.trim().length === 0) return 'Nom requis';
    if (b.montant !== undefined && (isNaN(b.montant) || b.montant < 0)) return 'Montant invalide';
    if (b.statut && !['En cours', 'Payé'].includes(b.statut)) return 'Statut invalide';
    return null;
  },
  defectueux: (b) => {
    if (!b.date || !/^\d{4}-\d{2}-\d{2}/.test(b.date)) return 'Date invalide';
    if (!b.produit || typeof b.produit !== 'string' || b.produit.trim().length === 0) return 'Produit requis';
    if (b.qty !== undefined && (isNaN(b.qty) || b.qty <= 0)) return 'Quantité invalide';
    if (!b.probleme || typeof b.probleme !== 'string' || b.probleme.trim().length === 0) return 'Description du problème requise';
    if (b.statut && !['En attente', 'Résolu', 'Irréparable'].includes(b.statut)) return 'Statut invalide';
    return null;
  },
};

// ── Schéma des tables ─────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS stock (
    id         INTEGER PRIMARY KEY,
    nom        TEXT    NOT NULL,
    pa         REAL    NOT NULL DEFAULT 0,
    pv         REAL    NOT NULL DEFAULT 0,
    qtyInitial INTEGER NOT NULL DEFAULT 0,
    createdAt  TEXT,
    updatedAt  TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_nom ON stock(nom);

  CREATE TABLE IF NOT EXISTS ventes (
    id         INTEGER PRIMARY KEY,
    date       TEXT    NOT NULL,
    produit    TEXT    NOT NULL,
    qty        INTEGER NOT NULL DEFAULT 0,
    pa         REAL    NOT NULL DEFAULT 0,
    pv         REAL    NOT NULL DEFAULT 0,
    gain       REAL    NOT NULL DEFAULT 0,
    vendeur    TEXT,
    stockAvant INTEGER,
    stockApres INTEGER,
    createdAt  TEXT,
    updatedAt  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_ventes_date    ON ventes(date);
  CREATE INDEX IF NOT EXISTS idx_ventes_produit ON ventes(produit);

  CREATE TABLE IF NOT EXISTS vendeurs (
    id        INTEGER PRIMARY KEY,
    nom       TEXT    NOT NULL,
    createdAt TEXT,
    updatedAt TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_vendeurs_nom ON vendeurs(nom);

  CREATE TABLE IF NOT EXISTS charges (
    id        INTEGER PRIMARY KEY,
    date      TEXT    NOT NULL,
    type      TEXT,
    montant   REAL    NOT NULL DEFAULT 0,
    desc      TEXT,
    categorie TEXT    NOT NULL DEFAULT 'Boutique',
    createdAt TEXT,
    updatedAt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_charges_date ON charges(date);

  CREATE TABLE IF NOT EXISTS dettes (
    id        INTEGER PRIMARY KEY,
    nom       TEXT    NOT NULL,
    type      TEXT,
    montant   REAL    NOT NULL DEFAULT 0,
    date      TEXT,
    statut    TEXT    NOT NULL DEFAULT 'En cours',
    createdAt TEXT,
    updatedAt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_dettes_statut ON dettes(statut);

  CREATE TABLE IF NOT EXISTS defectueux (
    id        INTEGER PRIMARY KEY,
    date      TEXT    NOT NULL,
    produit   TEXT    NOT NULL,
    qty       INTEGER NOT NULL DEFAULT 1,
    probleme  TEXT    NOT NULL,
    solution  TEXT,
    statut    TEXT    NOT NULL DEFAULT 'En attente',
    createdAt TEXT,
    updatedAt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_defectueux_produit ON defectueux(produit);
  CREATE INDEX IF NOT EXISTS idx_defectueux_statut  ON defectueux(statut);

  CREATE TABLE IF NOT EXISTS logs (
    id        INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    username  TEXT NOT NULL,
    action    TEXT NOT NULL,
    tableName TEXT NOT NULL,
    recordId  INTEGER,
    details   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
  CREATE INDEX IF NOT EXISTS idx_logs_username  ON logs(username);
`);

// ── Migration colonnes ajoutées ───────────────────────────────────────────────
(function migrateColumns() {
  const chargesCols = db.prepare("PRAGMA table_info(charges)").all().map(r => r.name);
  if (!chargesCols.includes('categorie')) {
    db.prepare("ALTER TABLE charges ADD COLUMN categorie TEXT NOT NULL DEFAULT 'Boutique'").run();
  }
  const ventesCols = db.prepare("PRAGMA table_info(ventes)").all().map(r => r.name);
  if (!ventesCols.includes('stockId')) {
    db.prepare("ALTER TABLE ventes ADD COLUMN stockId INTEGER").run();
  }
  if (!ventesCols.includes('remise')) {
    db.prepare("ALTER TABLE ventes ADD COLUMN remise REAL NOT NULL DEFAULT 0").run();
  }
  const stockCols = db.prepare("PRAGMA table_info(stock)").all().map(r => r.name);
  if (!stockCols.includes('categorie')) {
    db.prepare("ALTER TABLE stock ADD COLUMN categorie TEXT NOT NULL DEFAULT ''").run();
  }
  if (!stockCols.includes('seuilAlerte')) {
    db.prepare("ALTER TABLE stock ADD COLUMN seuilAlerte INTEGER NOT NULL DEFAULT 5").run();
  }
})();

// ── Migration unique : records → vraies tables ────────────────────────────────
(function migrateFromRecords() {
  const hasRecords = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='records'"
  ).get();
  if (!hasRecords) return;

  let total = 0;
  for (const t of ALLOWED_TABLES) {
    const rows = db.prepare('SELECT id, data FROM records WHERE table_name = ?').all(t);
    if (rows.length === 0) continue;
    const cols = TABLE_COLS[t];
    const insert = db.prepare(
      `INSERT OR IGNORE INTO ${t} (id, ${cols.join(', ')})
       VALUES (@id, ${cols.map(c => '@' + c).join(', ')})`
    );
    db.transaction(() => rows.forEach(row => {
      try { insert.run({ ...JSON.parse(row.data), id: row.id }); } catch (_) {}
    }))();
    console.log(`  ↳ Migration : ${rows.length} enregistrement(s) → ${t}`);
    total += rows.length;
  }
  if (total > 0) console.log(`✅  Migration terminée (${total} enregistrements)`);
})();

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Vérifie un mot de passe contre un hash stocké.
 * Formats supportés :
 *   - "scrypt:HASH_HEX:SALT_HEX"  → comparaison sécurisée scrypt
 *   - plaintext                    → comparaison constante (legacy)
 */
function verifyPassword(input, stored) {
  if (stored.startsWith('scrypt:')) {
    const parts = stored.split(':');
    if (parts.length !== 3) return false;
    const hashBuf = Buffer.from(parts[1], 'hex');
    const saltBuf = Buffer.from(parts[2], 'hex');
    try {
      const derived = crypto.scryptSync(input, saltBuf, 64);
      return crypto.timingSafeEqual(derived, hashBuf);
    } catch { return false; }
  }
  // Legacy plaintext : comparaison en temps constant pour éviter timing attacks
  try {
    const a = Buffer.alloc(128); const b = Buffer.alloc(128);
    Buffer.from(input).copy(a);
    Buffer.from(stored).copy(b);
    return crypto.timingSafeEqual(a, b) && input.length === stored.length;
  } catch { return false; }
}

function loadUsers() {
  const raw = process.env.VENIPS_USERS || 'VENIPS:venips224@,JACOB:compilateur787';
  return raw.split(',').map(entry => {
    const [username, ...rest] = entry.trim().split(':');
    return { username, password: rest.join(':') };
  }).filter(u => u.username && u.password);
}

const USERS = loadUsers();

const TOKEN_TTL = 8 * 60 * 60 * 1000; // 8 heures

function makeToken(username) {
  const secret = process.env.VENIPS_API_SECRET || 'venips-default-secret';
  const expiresAt = Date.now() + TOKEN_TTL;
  const payload = Buffer.from(`${username}:${expiresAt}`).toString('base64');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const secret = process.env.VENIPS_API_SECRET || 'venips-default-secret';
  const dotIdx = token.lastIndexOf('.');
  const payload = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (sig !== expected) return null;
  const decoded = Buffer.from(payload, 'base64').toString();
  const colonIdx = decoded.indexOf(':');
  const username = decoded.slice(0, colonIdx);
  const expiresAt = Number(decoded.slice(colonIdx + 1));
  if (!username || isNaN(expiresAt) || Date.now() > expiresAt) return null;
  return username;
}

function requireAuth(req, res, next) {
  const token = req.headers['x-venips-token'];
  const username = verifyToken(token);
  if (!username) return res.status(401).json({ error: 'Non autorisé' });
  req.username = username;
  // Déterminer le rôle (premier user = admin)
  req.role = (username === USERS[0].username) ? 'admin' : 'vendeur';
  next();
}

function requireAdmin(req, res, next) {
  if (req.role !== 'admin') return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
  next();
}

// Tables accessibles en écriture pour le vendeur
const VENDEUR_POST_ALLOWED   = new Set(['ventes', 'vendeurs']);
const VENDEUR_MUTATE_ALLOWED = new Set(['ventes']);

function requireWriteAccess(req, res, next) {
  if (req.role === 'admin') return next();
  const { table } = req.params;
  if (req.method === 'POST' && !VENDEUR_POST_ALLOWED.has(table))
    return res.status(403).json({ error: 'Action réservée à l\'administrateur' });
  if ((req.method === 'PUT' || req.method === 'DELETE') && !VENDEUR_MUTATE_ALLOWED.has(table))
    return res.status(403).json({ error: 'Action réservée à l\'administrateur' });
  next();
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// Headers de sécurité
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", 'data:'],
      connectSrc:  ["'self'"],
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      frameSrc:    ["'none'"],
    }
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(express.static(__dirname));

// Rate limiting : authentification (strict)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting : API données (souple)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 200,
  message: { error: 'Trop de requêtes. Réessayez dans une minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── POST /api/auth ────────────────────────────────────────────────────────────
app.post('/api/auth', authLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Champs requis' });
  const user = USERS.find(u => u.username === username && verifyPassword(password, u.password));
  if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });
  res.json({ token: makeToken(username) });
});

// ── GET /api/:table ───────────────────────────────────────────────────────────
app.get('/api/:table', apiLimiter, requireAuth, (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(404).json({ error: 'Table inconnue' });
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id ASC`).all();
  res.json(rows);
});

// ── Helper log ────────────────────────────────────────────────────────────────
function addLog(username, action, tableName, recordId, details) {
  try {
    db.prepare(
      `INSERT INTO logs (timestamp, username, action, tableName, recordId, details)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(new Date().toISOString(), username, action, tableName, recordId || null, details || null);
    // Rotation : garder seulement les 1000 dernières entrées
    const { n } = db.prepare('SELECT COUNT(*) as n FROM logs').get();
    if (n > 1000) {
      db.prepare('DELETE FROM logs WHERE id IN (SELECT id FROM logs ORDER BY id ASC LIMIT ?)').run(n - 1000);
    }
  } catch {}
}

// ── POST /api/ventes (transaction atomique, calcul serveur) ──────────────────
app.post('/api/ventes', apiLimiter, requireAuth, requireWriteAccess, (req, res) => {
  const body = req.body;
  const err = VALIDATORS.ventes(body);
  if (err) return res.status(400).json({ error: err });

  const id     = body.id || (Date.now() * 1000 + Math.floor(Math.random() * 999));
  const qty    = Number(body.qty);
  const pv     = Number(body.pv);
  const pa     = body.pa !== undefined ? Number(body.pa) : null;
  const remise = body.remise !== undefined ? Math.min(100, Math.max(0, Number(body.remise))) : 0;
  const { date, produit, vendeur } = body;

  const doInsert = db.transaction(() => {
    // Lire le stock et calculer le disponible de façon atomique
    const stockItem   = db.prepare('SELECT * FROM stock WHERE nom = ?').get(produit);
    const qtyInitial  = stockItem ? (stockItem.qtyInitial || 0) : 0;
    const totalVendu  = db.prepare(
      'SELECT COALESCE(SUM(qty), 0) AS s FROM ventes WHERE produit = ?'
    ).get(produit).s;
    const totalDefect = db.prepare(
      "SELECT COALESCE(SUM(qty), 0) AS s FROM defectueux WHERE produit = ? AND statut != 'Résolu'"
    ).get(produit).s;

    const stockAvant = qtyInitial - totalVendu - totalDefect;
    const stockApres = stockAvant - qty;

    if (stockApres < 0) {
      const e = new Error(`Stock insuffisant. Disponible : ${stockAvant}`);
      e.statusCode = 400;
      throw e;
    }

    const realPa    = pa !== null ? pa : (stockItem ? stockItem.pa : 0);
    const pvApres   = pv * (1 - remise / 100);
    const gain      = Math.round(((pvApres - realPa) * qty) * 100) / 100;
    const stockId   = stockItem ? stockItem.id : null;
    const createdAt = body.createdAt || new Date().toISOString();

    const record = { id, date, produit, qty, pa: realPa, pv, remise, gain,
                     vendeur: vendeur || null, stockAvant, stockApres, stockId, createdAt };

    db.prepare(`INSERT OR REPLACE INTO ventes
      (id, date, produit, qty, pa, pv, remise, gain, vendeur, stockAvant, stockApres, stockId, createdAt)
      VALUES (@id, @date, @produit, @qty, @pa, @pv, @remise, @gain, @vendeur, @stockAvant, @stockApres, @stockId, @createdAt)
    `).run(record);

    return record;
  });

  try {
    const record = doInsert();
    addLog(req.username, 'AJOUT', 'ventes', record.id, JSON.stringify(record).slice(0, 200));
    res.status(201).json(record);
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message });
  }
});

// ── POST /api/:table ──────────────────────────────────────────────────────────
app.post('/api/:table', apiLimiter, requireAuth, requireWriteAccess, (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(404).json({ error: 'Table inconnue' });

  const record = req.body;
  const err = VALIDATORS[table]?.(record);
  if (err) return res.status(400).json({ error: err });

  const cols   = TABLE_COLS[table];
  const fields = ['id', ...cols.filter(c => record[c] !== undefined)];
  try {
    db.prepare(
      `INSERT OR REPLACE INTO ${table} (${fields.join(', ')})
       VALUES (${fields.map(f => '@' + f).join(', ')})`
    ).run(record);
    addLog(req.username, 'AJOUT', table, record.id, JSON.stringify(record).slice(0, 200));
    res.status(201).json(record);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── PUT /api/:table/:id ───────────────────────────────────────────────────────
app.put('/api/:table/:id', apiLimiter, requireAuth, requireWriteAccess, (req, res) => {
  const { table, id } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(404).json({ error: 'Table inconnue' });

  const updates = req.body;
  const cols    = TABLE_COLS[table];
  const setCols = cols.filter(c => updates[c] !== undefined);
  if (setCols.length === 0) return res.status(400).json({ error: 'Rien à mettre à jour' });

  try {
    db.prepare(
      `UPDATE ${table} SET ${setCols.map(c => `${c} = @${c}`).join(', ')} WHERE id = @_id`
    ).run({ ...updates, _id: Number(id) });
    const updated = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(Number(id));
    addLog(req.username, 'MODIFICATION', table, Number(id), JSON.stringify(updates).slice(0, 200));
    res.json(updated || {});
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── DELETE /api/:table/:id ────────────────────────────────────────────────────
app.delete('/api/:table/:id', apiLimiter, requireAuth, requireWriteAccess, (req, res) => {
  const { table, id } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(404).json({ error: 'Table inconnue' });
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(Number(id));
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(Number(id));
  addLog(req.username, 'SUPPRESSION', table, Number(id), row ? JSON.stringify(row).slice(0, 200) : null);
  res.json({ ok: true });
});

// ── POST /api/chat ────────────────────────────────────────────────────────────
app.post('/api/chat', apiLimiter, requireAuth, (req, res) => {
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Message requis' });
  const q = message.toLowerCase();

  // Données en temps réel
  const ventes     = db.prepare('SELECT * FROM ventes').all();
  const stock      = db.prepare('SELECT * FROM stock').all();
  const charges    = db.prepare('SELECT * FROM charges').all();
  const dettes     = db.prepare('SELECT * FROM dettes').all();
  const defectueux = db.prepare('SELECT * FROM defectueux').all();

  const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' GNF';
  const curYM = new Date().toISOString().slice(0, 7);

  // KPIs globaux
  const totalCA    = ventes.reduce((s, v) => s + (v.pv * v.qty), 0);
  const totalGain  = ventes.reduce((s, v) => s + (v.gain || 0), 0);
  const totalCharges = charges.reduce((s, c) => s + (c.montant || 0), 0);
  const beneficeNet  = totalGain - totalCharges;
  const venteMois    = ventes.filter(v => v.date && v.date.startsWith(curYM));
  const caMois       = venteMois.reduce((s, v) => s + (v.pv * v.qty), 0);
  const gainMois     = venteMois.reduce((s, v) => s + (v.gain || 0), 0);

  // Top produits
  const prodMap = {};
  ventes.forEach(v => { prodMap[v.produit] = (prodMap[v.produit] || 0) + (v.pv * v.qty); });
  const topProduits = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Stock faible
  const stockFaible = stock.filter(p => {
    const vendu = ventes.filter(v => v.produit === p.nom).reduce((s, v) => s + (v.qty || 0), 0);
    return Math.max(0, (p.qtyInitial || 0) - vendu) <= 5;
  });

  // Dettes impayées
  const dettesImpayees = dettes.filter(d => d.statut === 'Non payé');
  const totalDettes    = dettesImpayees.reduce((s, d) => s + (d.montant || 0), 0);

  let reply = '';

  if (q.includes('résumé') || q.includes('général') || q.includes('analyse') || q.includes('aperçu')) {
    reply = `📊 Résumé de votre boutique :\n\n` +
      `💰 CA total : ${fmt(totalCA)}\n` +
      `📈 Gain total : ${fmt(totalGain)}\n` +
      `💸 Charges totales : ${fmt(totalCharges)}\n` +
      `✅ Bénéfice net : ${fmt(beneficeNet)}\n` +
      `📅 CA ce mois : ${fmt(caMois)}\n` +
      `📦 Produits en stock faible : ${stockFaible.length}\n` +
      `🤝 Dettes impayées : ${fmt(totalDettes)}`;

  } else if (q.includes('chiffre') || q.includes('ca') || q.includes("c'affaires")) {
    reply = `💰 Chiffre d'affaires :\n• Total : ${fmt(totalCA)}\n• Ce mois (${curYM}) : ${fmt(caMois)}`;

  } else if (q.includes('gain') || q.includes('bénéfice') || q.includes('profit')) {
    reply = `📈 Gains :\n• Gain total : ${fmt(totalGain)}\n• Gain ce mois : ${fmt(gainMois)}\n• Charges : ${fmt(totalCharges)}\n• Bénéfice net : ${fmt(beneficeNet)}`;

  } else if (q.includes('stock') || q.includes('rupture') || q.includes('produit')) {
    const ruptures = stockFaible.filter(p => {
      const vendu = ventes.filter(v => v.produit === p.nom).reduce((s, v) => s + (v.qty || 0), 0);
      return Math.max(0, (p.qtyInitial || 0) - vendu) === 0;
    });
    reply = `📦 Stock :\n• Produits totaux : ${stock.length}\n• En rupture : ${ruptures.length}\n• Stock faible (≤5) : ${stockFaible.length}`;
    if (stockFaible.length > 0) reply += `\n\n⚠️ À réapprovisionner :\n` + stockFaible.slice(0, 5).map(p => `• ${p.nom}`).join('\n');

  } else if (q.includes('top') || q.includes('meilleur') || q.includes('rentable') || q.includes('populaire')) {
    reply = `🏆 Top 5 produits par CA :\n` + topProduits.map((p, i) => `${i + 1}. ${p[0]} — ${fmt(p[1])}`).join('\n');

  } else if (q.includes('dette') || q.includes('crédit')) {
    reply = `🤝 Dettes :\n• Impayées : ${dettesImpayees.length} (${fmt(totalDettes)})\n• Payées : ${dettes.length - dettesImpayees.length}`;

  } else if (q.includes('charge') || q.includes('dépense')) {
    const chargesMois = charges.filter(c => c.date && c.date.startsWith(curYM)).reduce((s, c) => s + (c.montant || 0), 0);
    reply = `💸 Charges :\n• Total : ${fmt(totalCharges)}\n• Ce mois : ${fmt(chargesMois)}`;

  } else if (q.includes('défectueux') || q.includes('defectueux') || q.includes('problème')) {
    const enCours = defectueux.filter(d => d.statut !== 'Résolu');
    reply = `⚠️ Produits défectueux :\n• Total signalés : ${defectueux.length}\n• En cours : ${enCours.length}\n• Résolus : ${defectueux.length - enCours.length}`;

  } else if (q.includes('vente') || q.includes('vendu')) {
    const totalQty = ventes.reduce((s, v) => s + (v.qty || 0), 0);
    reply = `🛒 Ventes :\n• Nombre total : ${ventes.length}\n• Quantité vendue : ${totalQty}\n• CA total : ${fmt(totalCA)}\n• Ce mois : ${venteMois.length} ventes (${fmt(caMois)})`;

  } else {
    reply = `Je peux vous aider sur :\n• 📊 "Résumé général"\n• 💰 "Chiffre d'affaires"\n• 📈 "Gains et bénéfices"\n• 📦 "État du stock"\n• 🏆 "Top produits rentables"\n• 💸 "Charges"\n• 🤝 "Dettes"\n• ⚠️ "Produits défectueux"`;
  }

  res.json({ reply });
});

// ── GET /api/logs ─────────────────────────────────────────────────────────────
app.get('/api/logs', apiLimiter, requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT 500').all();
  res.json(rows);
});

// ── GET /api/backup/download ──────────────────────────────────────────────────
app.get('/api/backup/download', apiLimiter, requireAuth, requireAdmin, (req, res) => {
  const backup = {};
  for (const t of ALLOWED_TABLES) {
    backup[t] = db.prepare(`SELECT * FROM ${t} ORDER BY id ASC`).all();
  }
  const json     = JSON.stringify(backup, null, 2);
  const filename = `venips-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(json);
});

// ── Sauvegarde automatique ────────────────────────────────────────────────────
const BACKUP_DIR = path.join(__dirname, 'backups');
const BACKUP_MAX = parseInt(process.env.BACKUP_KEEP || '7');

function runBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const dest = path.join(BACKUP_DIR, `venips-${date}.db`);
    db.backup(dest).then(() => {
      console.log(`💾  Backup : ${dest}`);
      // Garder seulement les N derniers backups
      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.match(/^venips-\d{4}-\d{2}-\d{2}\.db$/))
        .sort();
      files.slice(0, Math.max(0, files.length - BACKUP_MAX))
        .forEach(f => { try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch {} });
    }).catch(e => console.error('Backup failed:', e.message));
  } catch (e) {
    console.error('Backup error:', e.message);
  }
}

// ── Route rapport mensuel ─────────────────────────────────────────────────────
app.get('/api/rapport/:year/:month', apiLimiter, requireAuth, requireAdmin, (req, res) => {
  const { year, month } = req.params;
  const ym = `${year}-${month.padStart(2, '0')}`;
  const ymPrev = (() => {
    const d = new Date(`${year}-${month}-01`);
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();

  const ventes     = db.prepare('SELECT * FROM ventes').all();
  const stock      = db.prepare('SELECT * FROM stock').all();
  const charges    = db.prepare('SELECT * FROM charges').all();
  const dettes     = db.prepare('SELECT * FROM dettes').all();
  const defectueux = db.prepare('SELECT * FROM defectueux').all();

  const ventesMois = ventes.filter(v => v.date && v.date.startsWith(ym));
  const ventesPrev = ventes.filter(v => v.date && v.date.startsWith(ymPrev));
  const chargesMois = charges.filter(c => c.date && c.date.startsWith(ym));

  const ca    = ventesMois.reduce((s, v) => s + (v.pv * v.qty), 0);
  const gain  = ventesMois.reduce((s, v) => s + (v.gain || 0), 0);
  const caPrev  = ventesPrev.reduce((s, v) => s + (v.pv * v.qty), 0);
  const gainPrev = ventesPrev.reduce((s, v) => s + (v.gain || 0), 0);
  const chargesTotal = chargesMois.reduce((s, c) => s + (c.montant || 0), 0);
  const benefice = gain - chargesTotal;

  // Top produits
  const prodMap = {};
  ventesMois.forEach(v => {
    if (!prodMap[v.produit]) prodMap[v.produit] = { qty: 0, ca: 0, gain: 0 };
    prodMap[v.produit].qty  += v.qty || 0;
    prodMap[v.produit].ca   += (v.pv * v.qty) || 0;
    prodMap[v.produit].gain += v.gain || 0;
  });
  const topProduits = Object.entries(prodMap)
    .sort((a, b) => b[1].ca - a[1].ca).slice(0, 5);

  // Vendeurs
  const vendMap = {};
  ventesMois.forEach(v => {
    const k = v.vendeur || 'Inconnu';
    if (!vendMap[k]) vendMap[k] = { qty: 0, ca: 0 };
    vendMap[k].qty += v.qty || 0;
    vendMap[k].ca  += (v.pv * v.qty) || 0;
  });

  // Ruptures
  const ruptures = stock.filter(p => {
    const vendu = ventes.filter(v => v.produit === p.nom).reduce((s, v) => s + (v.qty || 0), 0);
    const def   = defectueux.filter(d => d.produit === p.nom && d.statut !== 'Résolu').reduce((s, d) => s + (d.qty || 0), 0);
    return Math.max(0, (p.qtyInitial || 0) - vendu - def) === 0;
  });

  res.json({
    periode: ym, ca, gain, caPrev, gainPrev, chargesTotal, benefice,
    nbVentes: ventesMois.length, topProduits, vendeurs: Object.entries(vendMap),
    ruptures: ruptures.map(p => p.nom),
    dettesImpayees: dettes.filter(d => d.statut === 'Non payé').length,
    defEnAttente: defectueux.filter(d => d.statut === 'En attente').length,
  });
});

// ── Démarrage ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅  VENIPS – serveur démarré sur http://localhost:${PORT}`);
  // Backup au démarrage puis toutes les 24h
  runBackup();
  setInterval(runBackup, 24 * 60 * 60 * 1000);
});
