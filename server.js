'use strict';

require('dotenv').config();

const express      = require('express');
const Database     = require('better-sqlite3');
const path         = require('path');
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
  stock:       ['nom', 'pa', 'pv', 'qtyInitial', 'createdAt', 'updatedAt'],
  ventes:      ['date', 'produit', 'qty', 'pa', 'pv', 'gain', 'vendeur', 'stockAvant', 'stockApres', 'createdAt', 'updatedAt'],
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
  const cols = db.prepare("PRAGMA table_info(charges)").all().map(r => r.name);
  if (!cols.includes('categorie')) {
    db.prepare("ALTER TABLE charges ADD COLUMN categorie TEXT NOT NULL DEFAULT 'Boutique'").run();
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
function loadUsers() {
  const raw = process.env.VENIPS_USERS || 'VENIPS:venips224@,JACOB:compilateur787';
  return raw.split(',').map(entry => {
    const [username, ...rest] = entry.trim().split(':');
    return { username, password: rest.join(':') };
  }).filter(u => u.username && u.password);
}

const USERS = loadUsers();

function makeToken(username) {
  const secret = process.env.VENIPS_API_SECRET || 'venips-default-secret';
  return crypto.createHmac('sha256', secret).update(username).digest('hex');
}

const VALID_TOKENS = new Map(USERS.map(u => [makeToken(u.username), u.username]));

function requireAuth(req, res, next) {
  const token = req.headers['x-venips-token'];
  if (!token || !VALID_TOKENS.has(token)) return res.status(401).json({ error: 'Non autorisé' });
  req.username = VALID_TOKENS.get(token);
  next();
}

function requireAdmin(req, res, next) {
  // Le premier utilisateur dans VENIPS_USERS est admin
  if (req.username !== USERS[0].username) return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
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
  const user = USERS.find(u => u.username === username && u.password === password);
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
  } catch {}
}

// ── POST /api/:table ──────────────────────────────────────────────────────────
app.post('/api/:table', apiLimiter, requireAuth, (req, res) => {
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
app.put('/api/:table/:id', apiLimiter, requireAuth, (req, res) => {
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
app.delete('/api/:table/:id', apiLimiter, requireAuth, (req, res) => {
  const { table, id } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(404).json({ error: 'Table inconnue' });
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(Number(id));
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(Number(id));
  addLog(req.username, 'SUPPRESSION', table, Number(id), row ? JSON.stringify(row).slice(0, 200) : null);
  res.json({ ok: true });
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

// ── Démarrage ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅  VENIPS – serveur démarré sur http://localhost:${PORT}`);
});
