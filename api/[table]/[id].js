'use strict';

const crypto = require('crypto');

// PUT    /api/:table/:id  → mettre à jour un enregistrement
// DELETE /api/:table/:id  → supprimer un enregistrement

const USERS = ['VENIPS', 'JACOB'];

function isValidToken(req) {
  const token = req.headers['x-venips-token'];
  if (!token) return false;
  const secret = process.env.VENIPS_API_SECRET || 'venips-default-secret';
  return USERS.some(u => crypto.createHmac('sha256', secret).update(u).digest('hex') === token);
}

function getUsername(req) {
  const token = req.headers['x-venips-token'];
  if (!token) return 'Inconnu';
  const secret = process.env.VENIPS_API_SECRET || 'venips-default-secret';
  for (const u of USERS) {
    if (crypto.createHmac('sha256', secret).update(u).digest('hex') === token) return u;
  }
  return 'Inconnu';
}

async function writeLog(supabaseUrl, headers, username, action, tableName, recordId, details) {
  try {
    const logId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    const logData = {
      id: logId,
      timestamp: new Date().toISOString(),
      username,
      action,
      tableName,
      recordId: String(recordId || ''),
      details: typeof details === 'string' ? details : JSON.stringify(details)
    };
    await fetch(`${supabaseUrl}/rest/v1/records`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ table_name: 'logs', id: logId, data: logData })
    });
  } catch { /* ne pas bloquer l'opération principale */ }
}

module.exports = async function handler(req, res) {
  if (!isValidToken(req)) return res.status(401).json({ error: 'Non autorisé' });

  const { table, id } = req.query;
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

  // ── PUT : mettre à jour ───────────────────────────────────────────────────
  if (req.method === 'PUT') {
    // Récupérer l'enregistrement actuel
    const getResp = await fetch(
      `${SUPABASE_URL}/rest/v1/records?table_name=eq.${table}&id=eq.${id}&select=data`,
      { headers }
    );
    const rows = await getResp.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'Enregistrement non trouvé' });
    }
    const merged = { ...rows[0].data, ...req.body, updatedAt: new Date().toISOString() };
    await fetch(
      `${SUPABASE_URL}/rest/v1/records?table_name=eq.${table}&id=eq.${id}`,
      { method: 'PATCH', headers, body: JSON.stringify({ data: merged }) }
    );

    if (table !== 'logs') {
      const username = getUsername(req);
      writeLog(SUPABASE_URL, headers, username, 'MODIFICATION', table, id, merged);
    }

    return res.status(200).json(merged);
  }

  // ── DELETE : supprimer ────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    // Récupérer le record avant suppression pour le logguer
    let deletedData = { id };
    try {
      const getResp = await fetch(
        `${SUPABASE_URL}/rest/v1/records?table_name=eq.${table}&id=eq.${id}&select=data`,
        { headers }
      );
      const rows = await getResp.json();
      if (Array.isArray(rows) && rows.length > 0) deletedData = rows[0].data;
    } catch { /* ok */ }

    await fetch(
      `${SUPABASE_URL}/rest/v1/records?table_name=eq.${table}&id=eq.${id}`,
      { method: 'DELETE', headers }
    );

    if (table !== 'logs') {
      const username = getUsername(req);
      writeLog(SUPABASE_URL, headers, username, 'SUPPRESSION', table, id, deletedData);
    }

    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Méthode non autorisée' });
}
