'use strict';

const express  = require('express');
const Database = require('better-sqlite3');
const path     = require('path');
const crypto   = require('crypto');

const app = express();
const db  = new Database(path.join(__dirname, 'venips.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Whitelist et colonnes par table ───────────────────────────────────────────
const ALLOWED_TABLES = new Set(['stock', 'ventes', 'vendeurs', 'charges', 'dettes']);

const TABLE_COLS = {
  stock:    ['nom', 'pa', 'pv', 'qtyInitial', 'createdAt', 'updatedAt'],
  ventes:   ['date', 'produit', 'qty', 'pa', 'pv', 'gain', 'vendeur', 'stockAvant', 'stockApres', 'createdAt', 'updatedAt'],
  vendeurs: ['nom', 'createdAt', 'updatedAt'],
  charges:  ['date', 'type', 'montant', 'desc', 'createdAt', 'updatedAt'],
  dettes:   ['nom', 'type', 'montant', 'date', 'statut', 'createdAt', 'updatedAt'],
};

// ── Schéma des vraies tables ──────────────────────────────────────────────────
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
`);

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

    const migrate = db.transaction(() => {
      rows.forEach(row => {
        try {
          const rec = { ...JSON.parse(row.data), id: row.id };
          insert.run(rec);
        } catch (_) {}
      });
    });
    migrate();
    console.log(`  ↳ Migration : ${rows.length} enregistrement(s) → ${t}`);
    total += rows.length;
  }
  if (total > 0) console.log(`✅  Migration terminée (${total} enregistrements)`);
})();

// ── Auth ──────────────────────────────────────────────────────────────────────
const USERS = [
  { username: 'VENIPS', password: 'venips224@' },
  { username: 'JACOB',  password: 'compilateur787' }
];

function makeToken(username) {
  const secret = process.env.VENIPS_API_SECRET || 'venips-default-secret';
  return crypto.createHmac('sha256', secret).update(username).digest('hex');
}

const VALID_TOKENS = new Set(USERS.map(u => makeToken(u.username)));

function requireAuth(req, res, next) {
  const token = req.headers['x-venips-token'];
  if (!token || !VALID_TOKENS.has(token)) return res.status(401).json({ error: 'Non autorisé' });
  next();
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(__dirname));

// ── POST /api/auth ────────────────────────────────────────────────────────────
app.post('/api/auth', (req, res) => {
  const { username, password } = req.body || {};
  const user = USERS.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });
  res.json({ token: makeToken(username) });
});

// ── GET /api/:table ───────────────────────────────────────────────────────────
app.get('/api/:table', requireAuth, (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(404).json({ error: 'Table inconnue' });

  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id ASC`).all();
  res.json(rows);
});

// ── POST /api/:table ──────────────────────────────────────────────────────────
app.post('/api/:table', requireAuth, (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(404).json({ error: 'Table inconnue' });

  const record = req.body;
  const cols   = TABLE_COLS[table];
  const fields = ['id', ...cols.filter(c => record[c] !== undefined)];

  try {
    db.prepare(
      `INSERT OR REPLACE INTO ${table} (${fields.join(', ')})
       VALUES (${fields.map(f => '@' + f).join(', ')})`
    ).run(record);
    res.status(201).json(record);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── PUT /api/:table/:id ───────────────────────────────────────────────────────
app.put('/api/:table/:id', requireAuth, (req, res) => {
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
    res.json(updated || {});
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── DELETE /api/:table/:id ────────────────────────────────────────────────────
app.delete('/api/:table/:id', requireAuth, (req, res) => {
  const { table, id } = req.params;
  if (!ALLOWED_TABLES.has(table)) return res.status(404).json({ error: 'Table inconnue' });

  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(Number(id));
  res.json({ ok: true });
});

// ── Démarrage ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅  VENIPS – serveur démarré sur http://localhost:${PORT}`);
});
