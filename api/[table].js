'use strict';

const crypto = require('crypto');

// GET  /api/:table  → tous les enregistrements
// POST /api/:table  → insérer un enregistrement

const USERS = ['VENIPS', 'JACOB'];

function isValidToken(req) {
  const token = req.headers['x-venips-token'];
  if (!token) return false;
  const secret = process.env.VENIPS_API_SECRET || 'venips-default-secret';
  return USERS.some(u => crypto.createHmac('sha256', secret).update(u).digest('hex') === token);
}

module.exports = async function handler(req, res) {
  if (!isValidToken(req)) return res.status(401).json({ error: 'Non autorisé' });

  const { table } = req.query;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Variables SUPABASE_URL et SUPABASE_KEY manquantes' });
  }

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  // ── GET : récupérer tous les enregistrements d'une table ──────────────────
  if (req.method === 'GET') {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/records?table_name=eq.${table}&order=id.asc&select=data`,
      { headers }
    );
    const rows = await resp.json();
    return res.status(200).json(Array.isArray(rows) ? rows.map(r => r.data) : []);
  }

  // ── POST : insérer un enregistrement ─────────────────────────────────────
  if (req.method === 'POST') {
    const record = req.body;
    await fetch(`${SUPABASE_URL}/rest/v1/records`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ table_name: table, id: record.id, data: record })
    });
    return res.status(201).json(record);
  }

  res.status(405).json({ error: 'Méthode non autorisée' });
}
