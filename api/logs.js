'use strict';

const { isValidToken } = require('./_auth');

module.exports = async function handler(req, res) {
  if (!isValidToken(req)) return res.status(401).json({ error: 'Non autorisé' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Variables Supabase manquantes' });

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/records?table_name=eq.logs&order=id.desc&select=data&limit=500`,
      { headers }
    );
    const rows = await r.json();
    return res.status(200).json(Array.isArray(rows) ? rows.map(r => r.data) : []);
  } catch {
    return res.status(500).json([]);
  }
};
