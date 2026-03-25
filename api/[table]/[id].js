'use strict';

// PUT    /api/:table/:id  → mettre à jour un enregistrement
// DELETE /api/:table/:id  → supprimer un enregistrement

module.exports = async function handler(req, res) {
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
    return res.status(200).json(merged);
  }

  // ── DELETE : supprimer ────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    await fetch(
      `${SUPABASE_URL}/rest/v1/records?table_name=eq.${table}&id=eq.${id}`,
      { method: 'DELETE', headers }
    );
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Méthode non autorisée' });
}
