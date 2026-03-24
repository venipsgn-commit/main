'use strict';

const express  = require('express');
const Database = require('better-sqlite3');
const path     = require('path');

const app = express();
const db  = new Database(path.join(__dirname, 'venips.db'));

// ── Pragma pour meilleures performances ───────────────────────────────────────
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Initialisation de la table universelle ───────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    table_name TEXT    NOT NULL,
    id         INTEGER NOT NULL,
    data       TEXT    NOT NULL,
    PRIMARY KEY (table_name, id)
  )
`);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(__dirname));          // sert index.html, styles.css, app.js …

// ── API REST ─────────────────────────────────────────────────────────────────

// GET /api/:table  → tous les enregistrements
app.get('/api/:table', (req, res) => {
  const { table } = req.params;
  const rows = db
    .prepare('SELECT data FROM records WHERE table_name = ? ORDER BY id ASC')
    .all(table);
  res.json(rows.map(r => JSON.parse(r.data)));
});

// POST /api/:table  → insérer
app.post('/api/:table', (req, res) => {
  const { table } = req.params;
  const record = req.body;
  db.prepare(
    'INSERT OR REPLACE INTO records (table_name, id, data) VALUES (?, ?, ?)'
  ).run(table, record.id, JSON.stringify(record));
  res.status(201).json(record);
});

// PUT /api/:table/:id  → mettre à jour
app.put('/api/:table/:id', (req, res) => {
  const { table, id } = req.params;
  const row = db
    .prepare('SELECT data FROM records WHERE table_name = ? AND id = ?')
    .get(table, id);
  if (!row) return res.status(404).json({ error: 'Non trouvé' });
  const merged = { ...JSON.parse(row.data), ...req.body };
  db.prepare(
    'UPDATE records SET data = ? WHERE table_name = ? AND id = ?'
  ).run(JSON.stringify(merged), table, id);
  res.json(merged);
});

// DELETE /api/:table/:id  → supprimer
app.delete('/api/:table/:id', (req, res) => {
  const { table, id } = req.params;
  db.prepare(
    'DELETE FROM records WHERE table_name = ? AND id = ?'
  ).run(table, id);
  res.json({ ok: true });
});

// ── Démarrage ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅  VENIPS – serveur démarré sur http://localhost:${PORT}`);
});
