'use strict';

const { isValidToken } = require('./_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!isValidToken(req)) return res.status(401).json({ error: 'Non autorisé' });

  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Message manquant' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Variables Supabase manquantes' });

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  async function fetchTable(table) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/records?table_name=eq.${table}&select=data`, { headers });
      const rows = await r.json();
      return Array.isArray(rows) ? rows.map(r => r.data) : [];
    } catch { return []; }
  }

  const [stock, ventes, vendeurs, charges, dettes, defectueux, retours, creances, fournisseurs, clients, commandes, objectifs, inventaires] = await Promise.all([
    fetchTable('stock'), fetchTable('ventes'), fetchTable('vendeurs'),
    fetchTable('charges'), fetchTable('dettes'), fetchTable('defectueux'),
    fetchTable('retours'), fetchTable('creances'), fetchTable('fournisseurs'),
    fetchTable('clients'), fetchTable('commandes'), fetchTable('objectifs'),
    fetchTable('inventaires')
  ]);

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const moisActuel = today.slice(0, 7);
  const moisPrecedent = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const fmt = n => Number(n || 0).toLocaleString('fr') + ' GNF';
  const fmtNum = n => Number(n || 0).toLocaleString('fr');

  // ── Stock réel (initial - vendu - défectueux) ──────────────────────────────
  function getRestant(p) {
    const vendu = ventes.filter(v => v.produit === p.nom).reduce((s, v) => s + (v.qty || 0), 0);
    const def   = defectueux.filter(d => d.produit === p.nom && d.statut !== 'Résolu').reduce((s, d) => s + (d.qty || 0), 0);
    return Math.max(0, (p.qtyInitial ?? p.qty ?? 0) - vendu - def);
  }

  // ── Calculs globaux ────────────────────────────────────────────────────────
  const totalCA      = ventes.reduce((s, v) => s + (v.pv || 0) * (v.qty || 1), 0);
  const totalGain    = ventes.reduce((s, v) => s + ((v.pv || 0) - (v.pa || 0)) * (v.qty || 1), 0);
  const totalCharges = charges.reduce((s, c) => s + (c.montant || 0), 0);
  const beneficeNet  = totalGain - totalCharges;

  const ventesAujourdhui = ventes.filter(v => (v.date || '') === today);
  const caAujourdhui     = ventesAujourdhui.reduce((s, v) => s + (v.pv || 0) * (v.qty || 1), 0);
  const gainAujourdhui   = ventesAujourdhui.reduce((s, v) => s + ((v.pv || 0) - (v.pa || 0)) * (v.qty || 1), 0);

  const ventesMois   = ventes.filter(v => (v.date || '').startsWith(moisActuel));
  const caMois       = ventesMois.reduce((s, v) => s + (v.pv || 0) * (v.qty || 1), 0);
  const gainMois     = ventesMois.reduce((s, v) => s + ((v.pv || 0) - (v.pa || 0)) * (v.qty || 1), 0);
  const chargesMois  = charges.filter(c => (c.date || '').startsWith(moisActuel)).reduce((s, c) => s + (c.montant || 0), 0);

  const ventesMoisPrec  = ventes.filter(v => (v.date || '').startsWith(moisPrecedent));
  const caMoisPrec      = ventesMoisPrec.reduce((s, v) => s + (v.pv || 0) * (v.qty || 1), 0);
  const gainMoisPrec    = ventesMoisPrec.reduce((s, v) => s + ((v.pv || 0) - (v.pa || 0)) * (v.qty || 1), 0);

  const stockAvecRestant = stock.map(p => ({ ...p, restant: getRestant(p) }));
  const stockDispo   = stockAvecRestant.filter(p => p.restant > (p.seuilAlerte ?? 5));
  const stockFaible  = stockAvecRestant.filter(p => p.restant > 0 && p.restant <= (p.seuilAlerte ?? 5));
  const stockRupture = stockAvecRestant.filter(p => p.restant === 0);
  const valeurStock  = stockAvecRestant.reduce((s, p) => s + (p.pa || 0) * p.restant, 0);

  const dettesNP        = dettes.filter(d => d.statut === 'Non payé');
  const clientDoivent   = dettesNP.filter(d => d.type === 'Client doit').reduce((s, d) => s + (d.montant || 0), 0);
  const boutiqueDoivent = dettesNP.filter(d => d.type === 'Boutique doit').reduce((s, d) => s + (d.montant || 0), 0);

  const creancesEnAttente = creances.filter(c => c.statut === 'En attente');
  const montantCreances   = creancesEnAttente.reduce((s, c) => s + (c.qty || 1) * (c.prix || 0), 0);
  const limit30 = new Date(now - 30 * 86400000);
  const creancesRetard = creancesEnAttente.filter(c => c.date && new Date(c.date) < limit30);

  const venteParProduit = {};
  ventes.forEach(v => {
    const nom = v.produit || 'Inconnu';
    if (!venteParProduit[nom]) venteParProduit[nom] = { qty: 0, gain: 0, ca: 0 };
    venteParProduit[nom].qty  += (v.qty || 1);
    venteParProduit[nom].gain += ((v.pv || 0) - (v.pa || 0)) * (v.qty || 1);
    venteParProduit[nom].ca   += (v.pv || 0) * (v.qty || 1);
  });
  const topProduits = Object.entries(venteParProduit).sort((a, b) => b[1].gain - a[1].gain).slice(0, 5);

  const venteParVendeur = {};
  ventes.forEach(v => {
    const nom = v.vendeur || 'Inconnu';
    if (!venteParVendeur[nom]) venteParVendeur[nom] = { qty: 0, ca: 0, gain: 0 };
    venteParVendeur[nom].qty  += (v.qty || 1);
    venteParVendeur[nom].ca   += (v.pv || 0) * (v.qty || 1);
    venteParVendeur[nom].gain += ((v.pv || 0) - (v.pa || 0)) * (v.qty || 1);
  });

  // Meilleure journée
  const caParJour = {};
  ventes.forEach(v => {
    caParJour[v.date] = (caParJour[v.date] || 0) + (v.pv || 0) * (v.qty || 1);
  });
  const meilleurJour = Object.entries(caParJour).sort((a, b) => b[1] - a[1])[0];

  const q = message.toLowerCase();

  // ── Intents ────────────────────────────────────────────────────────────────

  // Aide / que peux-tu faire
  if (q.includes('aide') || q.includes('peux-tu') || q.includes('que peux') || q.includes('commandes') && q.includes('faire')) {
    return res.json({ reply: `**🤖 Je peux répondre à ces questions :**

**💰 Finances**
• Analyse générale de la boutique
• Bénéfice net (total et ce mois)
• Chiffre d'affaires (total, du jour, du mois)
• Comparaison mois actuel vs mois précédent
• Résumé des charges par type

**📦 Stock**
• État du stock (disponibles, faibles, ruptures)
• Valeur totale du stock
• Produits les plus rentables
• Produits défectueux en cours
• Derniers inventaires

**🛒 Ventes**
• Ventes du jour
• Ventes du mois
• Meilleure journée de ventes
• Retours produits

**👨‍💼 Équipe**
• Performance des vendeurs
• Meilleur vendeur
• Liste des fournisseurs
• Clients enregistrés

**📒 Créances Vendeurs**
• Créances en attente
• Montant total dû
• Créances en retard

Posez votre question librement !` });
  }

  // Analyse générale / rapport complet
  if (q.includes('général') || q.includes('generale') || q.includes('analyse') || q.includes('rapport') || q.includes('résumé') || q.includes('resume')) {
    return res.json({ reply: `**📊 RAPPORT GÉNÉRAL — VENIPS**

**💰 Finances globales**
• CA total : ${fmt(totalCA)}
• Gain total : ${fmt(totalGain)}
• Charges totales : ${fmt(totalCharges)}
• **Bénéfice net : ${fmt(beneficeNet)} ${beneficeNet >= 0 ? '✅' : '⚠️'}**

**📅 Ce mois (${moisActuel})**
• CA du mois : ${fmt(caMois)} ${caMois >= caMoisPrec ? '📈' : '📉'}
• Gain du mois : ${fmt(gainMois)}
• Charges du mois : ${fmt(chargesMois)}
• Bénéfice ce mois : ${fmt(gainMois - chargesMois)} ${gainMois >= chargesMois ? '✅' : '⚠️'}

**📦 Stock**
• ${stockDispo.length} disponibles | ${stockFaible.length} faibles | ${stockRupture.length} ruptures
• Valeur du stock : ${fmt(valeurStock)}

**🤝 Dettes & Créances**
• Clients doivent : ${fmt(clientDoivent)}
• Boutique doit : ${fmt(boutiqueDoivent)}
• Créances vendeurs en attente : ${fmt(montantCreances)}

**👨‍💼 Équipe**
• ${vendeurs.length} vendeurs | ${fournisseurs.length} fournisseurs | ${clients.length} clients` });
  }

  // Alertes importantes
  if (q.includes('alerte') || q.includes('urgent') || q.includes('important') || q.includes('problème') || q.includes('probleme')) {
    const alertes = [];
    if (stockRupture.length > 0) alertes.push(`🔴 ${stockRupture.length} produit(s) en rupture : ${stockRupture.slice(0,3).map(p=>p.nom).join(', ')}${stockRupture.length>3?'…':''}`);
    if (stockFaible.length > 0) alertes.push(`🟡 ${stockFaible.length} produit(s) avec stock faible`);
    const dettesRetard = dettesNP.filter(d => d.date && new Date(d.date) < limit30);
    if (dettesRetard.length > 0) alertes.push(`⏰ ${dettesRetard.length} dette(s) non réglée(s) depuis +30 jours`);
    const defEnAttente = defectueux.filter(d => d.statut === 'En attente');
    if (defEnAttente.length > 0) alertes.push(`⚠️ ${defEnAttente.length} produit(s) défectueux en attente`);
    if (creancesRetard.length > 0) alertes.push(`📒 ${creancesRetard.length} créance(s) vendeur en retard (+30j)`);
    if (beneficeNet < 0) alertes.push(`📉 Bénéfice net négatif : ${fmt(beneficeNet)}`);
    const reply = alertes.length === 0
      ? '✅ **Aucune alerte critique.** Votre boutique est en bonne santé !'
      : `**⚠️ ALERTES IMPORTANTES (${alertes.length})**\n\n` + alertes.map(a => `• ${a}`).join('\n');
    return res.json({ reply });
  }

  // Conseils
  if (q.includes('conseil') || q.includes('améliorer') || q.includes('ameliorer') || q.includes('recommand')) {
    const conseils = [];
    if (stockRupture.length > 0) conseils.push(`📦 Réapprovisionner ${stockRupture.length} produit(s) en rupture : ${stockRupture.slice(0,3).map(p=>p.nom).join(', ')}`);
    if (stockFaible.length > 0) conseils.push(`🟡 Surveiller le stock faible de ${stockFaible.length} produit(s)`);
    if (dettesNP.length > 0) conseils.push(`🤝 Relancer ${dettesNP.length} dette(s) non réglée(s) — ${fmt(clientDoivent)} à récupérer`);
    if (creancesRetard.length > 0) conseils.push(`📒 Relancer les vendeurs pour ${creancesRetard.length} créance(s) en retard`);
    const defEnAttente = defectueux.filter(d => d.statut === 'En attente');
    if (defEnAttente.length > 0) conseils.push(`⚠️ Traiter ${defEnAttente.length} produit(s) défectueux en attente`);
    if (topProduits.length > 0) conseils.push(`💰 Maximiser le stock de "${topProduits[0][0]}", votre produit le plus rentable`);
    if (caMois < caMoisPrec) conseils.push(`📉 Le CA de ce mois est inférieur au mois précédent — analysez les causes`);
    return res.json({ reply: conseils.length
      ? `**💡 CONSEILS POUR VOTRE BOUTIQUE**\n\n` + conseils.map((c,i) => `${i+1}. ${c}`).join('\n')
      : '✅ Tout semble bien géré ! Continuez ainsi.' });
  }

  // Ventes du jour
  if (q.includes("aujourd'hui") || q.includes('aujourd hui') || q.includes('du jour') || q.includes('journée') || q.includes('journee')) {
    return res.json({ reply: `**🛒 VENTES DU JOUR (${today})**

• Nombre de ventes : ${ventesAujourdhui.length}
• CA du jour : ${fmt(caAujourdhui)}
• Gain du jour : ${fmt(gainAujourdhui)}
${ventesAujourdhui.length > 0
  ? '\n**Détail :**\n' + ventesAujourdhui.map(v => `• ${v.produit} ×${v.qty} — ${fmt((v.pv||0)*(v.qty||1))}`).join('\n')
  : '\nAucune vente enregistrée aujourd\'hui.'}` });
  }

  // Meilleure journée
  if (q.includes('meilleure') || q.includes('meilleur jour') || q.includes('record')) {
    if (!meilleurJour) return res.json({ reply: 'Aucune vente enregistrée.' });
    const [dateJ, caJ] = meilleurJour;
    const nbVentes = ventes.filter(v => v.date === dateJ).length;
    return res.json({ reply: `**🏆 MEILLEURE JOURNÉE DE VENTES**

• Date : ${dateJ}
• CA réalisé : ${fmt(caJ)}
• Nombre de ventes : ${nbVentes}` });
  }

  // Comparaison mois
  if (q.includes('compar') || q.includes('précédent') || q.includes('precedent') || q.includes('évolution') || q.includes('evolution')) {
    const diff = caMois - caMoisPrec;
    const pct  = caMoisPrec > 0 ? ((diff / caMoisPrec) * 100).toFixed(1) : null;
    return res.json({ reply: `**📅 COMPARAISON MOIS**

**${moisActuel} (actuel)**
• CA : ${fmt(caMois)} | Gain : ${fmt(gainMois)} | Ventes : ${ventesMois.length}

**${moisPrecedent} (précédent)**
• CA : ${fmt(caMoisPrec)} | Gain : ${fmt(gainMoisPrec)} | Ventes : ${ventesMoisPrec.length}

**Évolution CA : ${diff >= 0 ? '📈 +' : '📉 '}${fmt(diff)}${pct ? ` (${diff >= 0 ? '+' : ''}${pct}%)` : ''}`});
  }

  // Bénéfice / profit
  if (q.includes('bénéfice') || q.includes('benefice') || q.includes('profit') || q.includes('net')) {
    return res.json({ reply: `**📈 BÉNÉFICE NET**

• Gain total : ${fmt(totalGain)}
• Charges totales : ${fmt(totalCharges)}
• **Bénéfice net : ${fmt(beneficeNet)} ${beneficeNet >= 0 ? '✅' : '⚠️'}**

**Ce mois (${moisActuel})**
• Gain : ${fmt(gainMois)}
• Charges : ${fmt(chargesMois)}
• **Bénéfice ce mois : ${fmt(gainMois - chargesMois)} ${gainMois >= chargesMois ? '✅' : '⚠️'}**` });
  }

  // CA / ventes (général)
  if (q.includes("chiffre d'affaires") || q.includes('chiffre') || q.includes('revenu') || (q.includes('vente') && !q.includes('jour') && !q.includes('mois') && !q.includes('retour'))) {
    return res.json({ reply: `**💰 CHIFFRE D'AFFAIRES**

• CA total (toutes périodes) : ${fmt(totalCA)}
• CA ce mois (${moisActuel}) : ${fmt(caMois)}
• CA mois précédent : ${fmt(caMoisPrec)}
• CA aujourd'hui (${today}) : ${fmt(caAujourdhui)}

• Nombre total de ventes : ${fmtNum(ventes.length)}
• Ventes ce mois : ${fmtNum(ventesMois.length)}
• Ventes aujourd'hui : ${fmtNum(ventesAujourdhui.length)}` });
  }

  // Ventes du mois
  if (q.includes('mois') && q.includes('vente')) {
    return res.json({ reply: `**🛒 VENTES DU MOIS (${moisActuel})**

• Nombre de ventes : ${fmtNum(ventesMois.length)}
• CA du mois : ${fmt(caMois)}
• Gain du mois : ${fmt(gainMois)}
• Charges du mois : ${fmt(chargesMois)}
• **Bénéfice ce mois : ${fmt(gainMois - chargesMois)} ${gainMois >= chargesMois ? '✅' : '⚠️'}**` });
  }

  // Stock
  if (q.includes('stock') && !q.includes('rupture') && !q.includes('faible')) {
    return res.json({ reply: `**📦 ÉTAT DU STOCK**

• Total produits : ${fmtNum(stock.length)}
• Disponibles : ${fmtNum(stockDispo.length)} ✅
• Stock faible : ${fmtNum(stockFaible.length)} 🟡
• Ruptures : ${fmtNum(stockRupture.length)} 🔴
• **Valeur totale : ${fmt(valeurStock)}**
${stockRupture.length > 0 ? '\n**⚠️ Ruptures :**\n' + stockRupture.map(p=>`• ${p.nom}`).join('\n') : ''}
${stockFaible.length > 0 ? '\n**🟡 Stock faible :**\n' + stockFaible.map(p=>`• ${p.nom} — restant: ${p.restant}`).join('\n') : ''}` });
  }

  // Ruptures
  if (q.includes('rupture')) {
    return res.json({ reply: stockRupture.length === 0
      ? '✅ **Aucun produit en rupture de stock !**'
      : `**🔴 PRODUITS EN RUPTURE (${stockRupture.length})**\n\n` + stockRupture.map(p => `• ${p.nom}`).join('\n') });
  }

  // Stock faible
  if (q.includes('faible') || q.includes('seuil') || q.includes('alerte stock')) {
    return res.json({ reply: stockFaible.length === 0
      ? '✅ **Aucun produit avec stock faible.**'
      : `**🟡 PRODUITS STOCK FAIBLE (${stockFaible.length})**\n\n` + stockFaible.map(p => `• ${p.nom} — restant: ${p.restant} / seuil: ${p.seuilAlerte ?? 5}`).join('\n') });
  }

  // Rentabilité / top produits
  if (q.includes('rentable') || q.includes('meilleur produit') || q.includes('top produit') || q.includes('performant')) {
    return res.json({ reply: topProduits.length === 0
      ? 'Aucune vente enregistrée pour le moment.'
      : `**💰 TOP 5 PRODUITS LES PLUS RENTABLES**\n\n` + topProduits.map(([nom, s], i) =>
          `${i+1}. **${nom}**\n   Gain : ${fmt(s.gain)} | Qté vendue : ${fmtNum(s.qty)} | CA : ${fmt(s.ca)}`
        ).join('\n') });
  }

  // Charges
  if (q.includes('charge') || q.includes('dépense') || q.includes('depense')) {
    const parType = {};
    charges.forEach(c => { parType[c.type || 'Autre'] = (parType[c.type || 'Autre'] || 0) + (c.montant || 0); });
    return res.json({ reply: `**💸 CHARGES**

• **Total charges : ${fmt(totalCharges)}**
• Charges ce mois : ${fmt(chargesMois)}
• Nombre d'entrées : ${fmtNum(charges.length)}

**Par type :**
${Object.entries(parType).sort((a,b)=>b[1]-a[1]).map(([t,m])=>`• ${t} : ${fmt(m)}`).join('\n') || '• Aucune charge'}` });
  }

  // Dettes
  if (q.includes('dette') && !q.includes('créance') && !q.includes('creance')) {
    return res.json({ reply: `**🤝 DETTES EN COURS**

• Clients doivent à la boutique : ${fmt(clientDoivent)}
• Boutique doit à d'autres : ${fmt(boutiqueDoivent)}
• Total non réglées : ${fmtNum(dettesNP.length)}

${dettesNP.length > 0
  ? '**Détail :**\n' + dettesNP.slice(0, 10).map(d => `• ${d.nom} — ${fmt(d.montant)} (${d.type})`).join('\n')
  : '✅ Aucune dette non réglée.'}` });
  }

  // Créances vendeurs
  if (q.includes('créance') || q.includes('creance') || q.includes('vendeur') && q.includes('doit') || q.includes('vendeur') && q.includes('montant')) {
    return res.json({ reply: `**📒 CRÉANCES VENDEURS**

• En attente : ${fmtNum(creancesEnAttente.length)}
• **Montant total dû : ${fmt(montantCreances)}**
• En retard (+30j) : ${fmtNum(creancesRetard.length)} ${creancesRetard.length > 0 ? '⏰' : '✅'}
• Réglées : ${fmtNum(creances.filter(c => c.statut === 'Payé').length)}

${creancesEnAttente.length > 0
  ? '**Détail en attente :**\n' + creancesEnAttente.slice(0, 10).map(c =>
      `• ${c.vendeur} — ${c.produit} ×${c.qty||1} → ${fmt((c.qty||1)*(c.prix||0))}${c.date && new Date(c.date)<limit30?' ⏰':''}`
    ).join('\n')
  : '✅ Aucune créance en attente.'}` });
  }

  // Défectueux
  if (q.includes('défectueux') || q.includes('defectueux') || q.includes('défaut') || q.includes('defaut') || q.includes('cassé') || q.includes('casse')) {
    const enAttente  = defectueux.filter(d => d.statut === 'En attente');
    const resolus    = defectueux.filter(d => d.statut === 'Résolu');
    const irreparable = defectueux.filter(d => d.statut === 'Irréparable');
    return res.json({ reply: `**⚠️ PRODUITS DÉFECTUEUX**

• En attente : ${fmtNum(enAttente.length)} ${enAttente.length > 0 ? '⚠️' : '✅'}
• Résolus : ${fmtNum(resolus.length)} ✅
• Irréparables : ${fmtNum(irreparable.length)}
• Total unités défectueuses : ${fmtNum(defectueux.reduce((s,d)=>s+(d.qty||0),0))}

${enAttente.length > 0
  ? '**En attente de traitement :**\n' + enAttente.slice(0,8).map(d=>`• ${d.produit} ×${d.qty||1} — ${d.probleme||'?'}`).join('\n')
  : ''}` });
  }

  // Retours
  if (q.includes('retour') && !q.includes('rapport')) {
    const enAttente = retours.filter(r => r.statut === 'En attente');
    const traites   = retours.filter(r => r.statut === 'Traité');
    return res.json({ reply: `**↩️ RETOURS PRODUITS**

• Total retours : ${fmtNum(retours.length)}
• En attente : ${fmtNum(enAttente.length)} ${enAttente.length > 0 ? '⚠️' : '✅'}
• Traités : ${fmtNum(traites.length)}

${enAttente.length > 0
  ? '**En attente :**\n' + enAttente.slice(0,8).map(r=>`• ${r.produit} ×${r.qte||1} — ${r.raison||r.type||'?'}`).join('\n')
  : ''}` });
  }

  // Inventaires
  if (q.includes('inventaire')) {
    const recents = [...inventaires].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
    const ecarts = inventaires.filter(i => Math.abs(i.ecart || 0) > 0);
    return res.json({ reply: `**🔍 INVENTAIRES**

• Total inventaires : ${fmtNum(inventaires.length)}
• Avec écart : ${fmtNum(ecarts.length)}

${recents.length > 0
  ? '**5 derniers :**\n' + recents.map(i=>`• ${i.date} — ${i.produit} : théo ${i.qteTheorique||0} / réel ${i.qteReelle||0} (écart: ${i.ecart>=0?'+':''}${i.ecart||0})`).join('\n')
  : 'Aucun inventaire enregistré.'}` });
  }

  // Vendeurs / équipe
  if (q.includes('vendeur') || q.includes('performance') || q.includes('équipe') || q.includes('equipe') || q.includes('meilleur vendeur')) {
    const classement = Object.entries(venteParVendeur).sort((a,b)=>b[1].ca-a[1].ca);
    return res.json({ reply: `**👨‍💼 PERFORMANCE DES VENDEURS**

${classement.length === 0 ? 'Aucune vente enregistrée.' :
  classement.map(([nom, s], i) =>
    `${i===0?'🥇':i===1?'🥈':i===2?'🥉':'  '} ${nom}\n   CA: ${fmt(s.ca)} | Gain: ${fmt(s.gain)} | Qté: ${fmtNum(s.qty)}`
  ).join('\n')}` });
  }

  // Fournisseurs
  if (q.includes('fournisseur')) {
    return res.json({ reply: `**🏭 FOURNISSEURS (${fmtNum(fournisseurs.length)})**

${fournisseurs.length === 0 ? 'Aucun fournisseur enregistré.'
  : fournisseurs.slice(0,15).map(f=>`• ${f.nom}${f.contact?' — '+f.contact:''}${f.telephone?' 📞'+f.telephone:''}`).join('\n')}` });
  }

  // Clients
  if (q.includes('client')) {
    return res.json({ reply: `**👥 CLIENTS (${fmtNum(clients.length)})**

${clients.length === 0 ? 'Aucun client enregistré.'
  : clients.slice(0,15).map(c=>`• ${c.nom}${c.telephone?' 📞'+c.telephone:''}`).join('\n')}` });
  }

  // Objectifs
  if (q.includes('objectif')) {
    return res.json({ reply: `**🎯 OBJECTIFS DE VENTES**

${objectifs.length === 0 ? 'Aucun objectif défini.'
  : objectifs.map(o => {
      const prog = caMois >= (o.cible || 0) ? '✅' : caMois >= (o.cible||0)*0.7 ? '🟡' : '🔴';
      const pct  = o.cible > 0 ? Math.min(100, Math.round(caMois/(o.cible)*100)) : 0;
      return `• ${o.mois||moisActuel} — Cible : ${fmt(o.cible)} | Atteint : ${fmt(caMois)} | Avancement : ${pct}% ${prog}`;
    }).join('\n')}` });
  }

  // Commandes fournisseurs
  if (q.includes('commande')) {
    const enCours   = commandes.filter(c => c.statut === 'En cours' || c.statut === 'En attente');
    const recues    = commandes.filter(c => c.statut === 'Reçue' || c.statut === 'Livrée');
    return res.json({ reply: `**📋 COMMANDES FOURNISSEURS**

• Total : ${fmtNum(commandes.length)}
• En cours : ${fmtNum(enCours.length)} ${enCours.length > 0 ? '⏳' : '✅'}
• Reçues / Livrées : ${fmtNum(recues.length)}

${enCours.length > 0
  ? '**En cours :**\n' + enCours.slice(0,5).map(c=>`• ${c.fournisseur||'?'} — ${c.date||'?'} (${c.statut})`).join('\n')
  : ''}` });
  }

  // Par défaut — aide abrégée
  return res.json({ reply: `Je n'ai pas compris votre question. Voici ce que je peux analyser :

💰 finances, bénéfice, chiffre d'affaires, charges, dettes
📦 stock, rupture, produits rentables, défectueux, inventaire
🛒 ventes du jour, ventes du mois, meilleure journée, retours
👨‍💼 vendeurs, fournisseurs, clients, objectifs, commandes
📒 créances vendeurs

**Conseil :** Utilisez les boutons de suggestions ci-dessus !` });
};
