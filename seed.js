/* ============================================
   BOUTIQUE PRO – SEED DATA
   Initialisation de la base de données
   ============================================ */

(function () {
  'use strict';

  // Ne pas réinitialiser si des données existent déjà
  const existingVentes = localStorage.getItem('bp_ventes');
  if (existingVentes && JSON.parse(existingVentes).length > 0) return;

  /* ------ Helper ------ */
  function makeId() {
    return Date.now() + Math.floor(Math.random() * 100000);
  }
  function iso(ddmmyyyy) {
    const [d, m, y] = ddmmyyyy.split('/');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  /* ==========================================
     VENDEURS
  ========================================== */
  const vendeurs = [
    { id: makeId(), nom: 'Propriétaire', createdAt: new Date().toISOString() }
  ];
  localStorage.setItem('bp_vendeurs', JSON.stringify(vendeurs));

  /* ==========================================
     STOCK  (produits avec prix habituels)
  ========================================== */
  const stockProduits = [
    { nom: 'Notebook Boom',           qty: 0, pa: 950000,   pv: 1000000  },
    { nom: 'Projecteur',              qty: 0, pa: 700000,   pv: 800000   },
    { nom: 'Modio M40',               qty: 0, pa: 950000,   pv: 1000000  },
    { nom: 'modio sm3',               qty: 0, pa: 280000,   pv: 380000   },
    { nom: 'NOTEBOOK GALAXY',         qty: 0, pa: 850000,   pv: 1000000  },
    { nom: 'NOTEBOOK CORE',           qty: 0, pa: 850000,   pv: 950000   },
    { nom: 'NOTEBOOK ACTION',         qty: 0, pa: 850000,   pv: 1000000  },
    { nom: 'HP 840 G3',               qty: 0, pa: 1800000,  pv: 2000000  },
    { nom: 'HP 840 G4',               qty: 0, pa: 2000000,  pv: 2200000  },
    { nom: 'HP 840 G5',               qty: 0, pa: 2300000,  pv: 2500000  },
    { nom: 'LENOVO T470',             qty: 0, pa: 1800000,  pv: 2000000  },
    { nom: 'LENOVO YOGA X1',          qty: 0, pa: 2200000,  pv: 2400000  },
    { nom: 'LENOVO 11e I5',           qty: 0, pa: 1700000,  pv: 1800000  },
    { nom: 'LENOVO 11e 1',            qty: 0, pa: 1300000,  pv: 1500000  },
    { nom: 'LENOVO I7',               qty: 0, pa: 2200000,  pv: 2400000  },
    { nom: 'LENOVO L13',              qty: 0, pa: 1900000,  pv: 2100000  },
    { nom: 'DELL 3190',               qty: 0, pa: 1200000,  pv: 1300000  },
    { nom: 'Dell 3190 2 in 1 i7',     qty: 0, pa: 2350000,  pv: 2500000  },
    { nom: 'DELL 5400',               qty: 0, pa: 2000000,  pv: 2200000  },
    { nom: 'DELL 5480',               qty: 0, pa: 1800000,  pv: 2000000  },
    { nom: 'DELL 7390 2 IN 1',        qty: 0, pa: 2200000,  pv: 2400000  },
    { nom: 'DELL 7450 i5',            qty: 0, pa: 1650000,  pv: 1800000  },
    { nom: 'DELL 3380',               qty: 0, pa: 1800000,  pv: 2000000  },
    { nom: 'Dell 3150',               qty: 0, pa: 1550000,  pv: 1700000  },
    { nom: 'HPX360',                  qty: 0, pa: 1300000,  pv: 1400000  },
    { nom: 'HP RAZYN 5',              qty: 0, pa: 2200000,  pv: 2400000  },
    { nom: 'HP 1040 i7',              qty: 0, pa: 2200000,  pv: 2400000  },
    { nom: 'HP 430 i7',               qty: 0, pa: 1700000,  pv: 1900000  },
    { nom: 'hp 840 G3 i7',            qty: 0, pa: 2200000,  pv: 2400000  },
    { nom: 'Surface I5',              qty: 0, pa: 2500000,  pv: 2700000  },
    { nom: 'Surface dual',            qty: 0, pa: 1700000,  pv: 1900000  },
    { nom: 'NOTEBOOK MAC',            qty: 0, pa: 850000,   pv: 1000000  },
    { nom: 'SUPPORT PC',              qty: 0, pa: 90000,    pv: 100000   },
    { nom: 'SAC PC',                  qty: 0, pa: 80000,    pv: 100000   },
    { nom: 'cle USB',                 qty: 0, pa: 90000,    pv: 100000   },
    { nom: 'TYPE HDMI',               qty: 0, pa: 160000,   pv: 200000   },
    { nom: 'SOURIS SANS FIL',         qty: 0, pa: 90000,    pv: 100000   },
    { nom: 'HP 840 G3 - Stock',       qty: 0, pa: 1800000,  pv: 2000000  },
    { nom: 'MICRO CRAVATE',           qty: 0, pa: 200000,   pv: 250000   },
    { nom: 'TAPIS PC',                qty: 0, pa: 60000,    pv: 70000    },
    { nom: 'HP RAZYN 5 - i5',        qty: 0, pa: 1800000,  pv: 2100000  },
    { nom: 'HP 430 i7 - alt',         qty: 0, pa: 1700000,  pv: 1900000  },
  ];

  const stock = stockProduits.map((p, i) => ({
    id: makeId() + i,
    ...p,
    createdAt: new Date().toISOString()
  }));
  localStorage.setItem('bp_stock', JSON.stringify(stock));

  /* ==========================================
     VENTES  – ajoutées une par une
     Format : { date:'DD/MM/YYYY', produit, qty, pv, pa, gain, vendeur }
  ========================================== */
  const rawVentes = [
    // ── JUILLET 2025 ──────────────────────────
    { date:'01/07/2025', produit:'HP 840 G3',        qty:1, pa:1800000, pv:2000000 },
    { date:'02/07/2025', produit:'LENOVO T470',       qty:1, pa:1800000, pv:2000000 },
    { date:'03/07/2025', produit:'DELL 3190',         qty:2, pa:1200000, pv:1300000 },
    { date:'04/07/2025', produit:'SAC PC',            qty:3, pa:80000,   pv:100000  },
    { date:'05/07/2025', produit:'SOURIS SANS FIL',   qty:2, pa:90000,   pv:100000  },
    { date:'07/07/2025', produit:'HP 840 G4',         qty:1, pa:2000000, pv:2200000 },
    { date:'08/07/2025', produit:'NOTEBOOK GALAXY',   qty:1, pa:850000,  pv:1000000 },
    { date:'09/07/2025', produit:'cle USB',           qty:5, pa:90000,   pv:100000  },
    { date:'10/07/2025', produit:'DELL 5400',         qty:1, pa:2000000, pv:2200000 },
    { date:'11/07/2025', produit:'TYPE HDMI',         qty:3, pa:160000,  pv:200000  },
    { date:'12/07/2025', produit:'LENOVO YOGA X1',    qty:1, pa:2200000, pv:2400000 },
    { date:'14/07/2025', produit:'HP 840 G3',         qty:1, pa:1800000, pv:2000000 },
    { date:'15/07/2025', produit:'SUPPORT PC',        qty:4, pa:90000,   pv:100000  },
    { date:'16/07/2025', produit:'DELL 7390 2 IN 1',  qty:1, pa:2200000, pv:2400000 },
    { date:'17/07/2025', produit:'SAC PC',            qty:2, pa:80000,   pv:100000  },
    { date:'18/07/2025', produit:'Notebook Boom',     qty:1, pa:950000,  pv:1000000 },
    { date:'19/07/2025', produit:'HP 840 G5',         qty:1, pa:2300000, pv:2500000 },
    { date:'21/07/2025', produit:'LENOVO 11e 1',      qty:1, pa:1300000, pv:1500000 },
    { date:'22/07/2025', produit:'TAPIS PC',          qty:6, pa:60000,   pv:70000   },
    { date:'23/07/2025', produit:'DELL 5480',         qty:1, pa:1800000, pv:2000000 },
    { date:'24/07/2025', produit:'NOTEBOOK CORE',     qty:1, pa:850000,  pv:950000  },
    { date:'25/07/2025', produit:'HP 1040 i7',        qty:1, pa:2200000, pv:2400000 },
    { date:'26/07/2025', produit:'SOURIS SANS FIL',   qty:3, pa:90000,   pv:100000  },
    { date:'28/07/2025', produit:'HPX360',            qty:1, pa:1300000, pv:1400000 },
    { date:'29/07/2025', produit:'cle USB',           qty:4, pa:90000,   pv:100000  },
    { date:'30/07/2025', produit:'Surface I5',        qty:1, pa:2500000, pv:2700000 },
    { date:'31/07/2025', produit:'TYPE HDMI',         qty:2, pa:160000,  pv:200000  },

    // ── AOÛT 2025 ──────────────────────────────
    { date:'01/08/2025', produit:'HP 840 G3',         qty:1, pa:1800000, pv:2000000 },
    { date:'02/08/2025', produit:'DELL 3190',         qty:1, pa:1200000, pv:1300000 },
    { date:'04/08/2025', produit:'Projecteur',        qty:1, pa:700000,  pv:800000  },
    { date:'05/08/2025', produit:'LENOVO T470',       qty:1, pa:1800000, pv:2000000 },
    { date:'06/08/2025', produit:'SAC PC',            qty:4, pa:80000,   pv:100000  },
    { date:'07/08/2025', produit:'NOTEBOOK ACTION',   qty:1, pa:850000,  pv:1000000 },
    { date:'08/08/2025', produit:'HP 430 i7',         qty:1, pa:1700000, pv:1900000 },
    { date:'09/08/2025', produit:'SOURIS SANS FIL',   qty:2, pa:90000,   pv:100000  },
    { date:'11/08/2025', produit:'DELL 7450 i5',      qty:1, pa:1650000, pv:1800000 },
    { date:'12/08/2025', produit:'cle USB',           qty:3, pa:90000,   pv:100000  },
    { date:'13/08/2025', produit:'LENOVO L13',        qty:1, pa:1900000, pv:2100000 },
    { date:'14/08/2025', produit:'TYPE HDMI',         qty:2, pa:160000,  pv:200000  },
    { date:'15/08/2025', produit:'hp 840 G3 i7',      qty:1, pa:2200000, pv:2400000 },
    { date:'16/08/2025', produit:'TAPIS PC',          qty:5, pa:60000,   pv:70000   },
    { date:'18/08/2025', produit:'Surface dual',      qty:1, pa:1700000, pv:1900000 },
    { date:'19/08/2025', produit:'NOTEBOOK GALAXY',   qty:1, pa:850000,  pv:1000000 },
    { date:'20/08/2025', produit:'SUPPORT PC',        qty:3, pa:90000,   pv:100000  },
    { date:'21/08/2025', produit:'HP 840 G4',         qty:1, pa:2000000, pv:2200000 },
    { date:'22/08/2025', produit:'DELL 3380',         qty:1, pa:1800000, pv:2000000 },
    { date:'23/08/2025', produit:'SAC PC',            qty:2, pa:80000,   pv:100000  },
    { date:'25/08/2025', produit:'LENOVO I7',         qty:1, pa:2200000, pv:2400000 },
    { date:'26/08/2025', produit:'cle USB',           qty:6, pa:90000,   pv:100000  },
    { date:'27/08/2025', produit:'HP 840 G5',         qty:1, pa:2300000, pv:2500000 },
    { date:'28/08/2025', produit:'MICRO CRAVATE',     qty:1, pa:200000,  pv:250000  },
    { date:'29/08/2025', produit:'DELL 3150',         qty:1, pa:1550000, pv:1700000 },
    { date:'30/08/2025', produit:'SOURIS SANS FIL',   qty:4, pa:90000,   pv:100000  },

    // ── SEPTEMBRE 2025 ─────────────────────────
    { date:'01/09/2025', produit:'LENOVO 11e I5',     qty:1, pa:1700000, pv:1800000 },
    { date:'02/09/2025', produit:'HP 840 G3',         qty:1, pa:1800000, pv:2000000 },
    { date:'03/09/2025', produit:'TYPE HDMI',         qty:3, pa:160000,  pv:200000  },
    { date:'04/09/2025', produit:'SAC PC',            qty:2, pa:80000,   pv:100000  },
    { date:'05/09/2025', produit:'DELL 5400',         qty:1, pa:2000000, pv:2200000 },
    { date:'06/09/2025', produit:'Notebook Boom',     qty:2, pa:950000,  pv:1000000 },
    { date:'08/09/2025', produit:'LENOVO T470',       qty:1, pa:1800000, pv:2000000 },
    { date:'09/09/2025', produit:'cle USB',           qty:4, pa:90000,   pv:100000  },
    { date:'10/09/2025', produit:'HP 840 G4',         qty:1, pa:2000000, pv:2200000 },
    { date:'11/09/2025', produit:'TAPIS PC',          qty:3, pa:60000,   pv:70000   },
    { date:'12/09/2025', produit:'HPX360',            qty:1, pa:1300000, pv:1400000 },
    { date:'13/09/2025', produit:'SOURIS SANS FIL',   qty:2, pa:90000,   pv:100000  },
    { date:'15/09/2025', produit:'Dell 3190 2 in 1 i7', qty:1, pa:2350000, pv:2500000 },
    { date:'16/09/2025', produit:'SUPPORT PC',        qty:2, pa:90000,   pv:100000  },
    { date:'17/09/2025', produit:'NOTEBOOK CORE',     qty:1, pa:850000,  pv:950000  },
    { date:'18/09/2025', produit:'HP 1040 i7',        qty:1, pa:2200000, pv:2400000 },
    { date:'19/09/2025', produit:'TYPE HDMI',         qty:2, pa:160000,  pv:200000  },
    { date:'20/09/2025', produit:'DELL 3190',         qty:1, pa:1200000, pv:1300000 },
    { date:'22/09/2025', produit:'LENOVO YOGA X1',    qty:1, pa:2200000, pv:2400000 },
    { date:'23/09/2025', produit:'SAC PC',            qty:3, pa:80000,   pv:100000  },
    { date:'24/09/2025', produit:'HP 430 i7',         qty:1, pa:1700000, pv:1900000 },
    { date:'25/09/2025', produit:'cle USB',           qty:5, pa:90000,   pv:100000  },
    { date:'26/09/2025', produit:'MICRO CRAVATE',     qty:2, pa:200000,  pv:250000  },
    { date:'27/09/2025', produit:'HP 840 G5',         qty:1, pa:2300000, pv:2500000 },
    { date:'29/09/2025', produit:'NOTEBOOK MAC',      qty:1, pa:850000,  pv:1000000 },
    { date:'30/09/2025', produit:'LENOVO 11e 1',      qty:1, pa:1300000, pv:1500000 },

    // ── OCTOBRE 2025 ───────────────────────────
    { date:'01/10/2025', produit:'HP 840 G3',         qty:2, pa:1800000, pv:2000000 },
    { date:'02/10/2025', produit:'DELL 7390 2 IN 1',  qty:1, pa:2200000, pv:2400000 },
    { date:'03/10/2025', produit:'SAC PC',            qty:3, pa:80000,   pv:100000  },
    { date:'04/10/2025', produit:'LENOVO T470',       qty:1, pa:1800000, pv:2000000 },
    { date:'06/10/2025', produit:'TYPE HDMI',         qty:4, pa:160000,  pv:200000  },
    { date:'07/10/2025', produit:'NOTEBOOK GALAXY',   qty:1, pa:850000,  pv:1000000 },
    { date:'08/10/2025', produit:'SOURIS SANS FIL',   qty:3, pa:90000,   pv:100000  },
    { date:'09/10/2025', produit:'HP 840 G4',         qty:1, pa:2000000, pv:2200000 },
    { date:'10/10/2025', produit:'cle USB',           qty:6, pa:90000,   pv:100000  },
    { date:'11/10/2025', produit:'DELL 5480',         qty:1, pa:1800000, pv:2000000 },
    { date:'13/10/2025', produit:'TAPIS PC',          qty:4, pa:60000,   pv:70000   },
    { date:'14/10/2025', produit:'Surface I5',        qty:1, pa:2500000, pv:2700000 },
    { date:'15/10/2025', produit:'HP 840 G3 - Stock', qty:1, pa:1800000, pv:2000000 },
    { date:'16/10/2025', produit:'LENOVO I7',         qty:1, pa:2200000, pv:2400000 },
    { date:'17/10/2025', produit:'SAC PC',            qty:2, pa:80000,   pv:100000  },
    { date:'18/10/2025', produit:'HP RAZYN 5',        qty:1, pa:2200000, pv:2400000 },
    { date:'20/10/2025', produit:'DELL 3150',         qty:1, pa:1550000, pv:1700000 },
    { date:'21/10/2025', produit:'cle USB',           qty:3, pa:90000,   pv:100000  },
    { date:'22/10/2025', produit:'NOTEBOOK ACTION',   qty:1, pa:850000,  pv:1000000 },
    { date:'23/10/2025', produit:'SUPPORT PC',        qty:3, pa:90000,   pv:100000  },
    { date:'24/10/2025', produit:'HP 840 G5',         qty:1, pa:2300000, pv:2500000 },
    { date:'25/10/2025', produit:'MICRO CRAVATE',     qty:1, pa:200000,  pv:250000  },
    { date:'27/10/2025', produit:'DELL 7450 i5',      qty:1, pa:1650000, pv:1800000 },
    { date:'28/10/2025', produit:'TYPE HDMI',         qty:2, pa:160000,  pv:200000  },
    { date:'29/10/2025', produit:'LENOVO L13',        qty:1, pa:1900000, pv:2100000 },
    { date:'30/10/2025', produit:'SOURIS SANS FIL',   qty:2, pa:90000,   pv:100000  },
    { date:'31/10/2025', produit:'Notebook Boom',     qty:1, pa:950000,  pv:1000000 },

    // ── NOVEMBRE 2025 ──────────────────────────
    { date:'01/11/2025', produit:'HP 840 G3',         qty:1, pa:1800000, pv:2000000 },
    { date:'03/11/2025', produit:'DELL 3190',         qty:1, pa:1200000, pv:1300000 },
    { date:'04/11/2025', produit:'SAC PC',            qty:4, pa:80000,   pv:100000  },
    { date:'05/11/2025', produit:'LENOVO YOGA X1',    qty:1, pa:2200000, pv:2400000 },
    { date:'06/11/2025', produit:'cle USB',           qty:5, pa:90000,   pv:100000  },
    { date:'07/11/2025', produit:'HP 840 G4',         qty:1, pa:2000000, pv:2200000 },
    { date:'08/11/2025', produit:'TYPE HDMI',         qty:3, pa:160000,  pv:200000  },
    { date:'10/11/2025', produit:'NOTEBOOK CORE',     qty:1, pa:850000,  pv:950000  },
    { date:'11/11/2025', produit:'TAPIS PC',          qty:5, pa:60000,   pv:70000   },
    { date:'12/11/2025', produit:'hp 840 G3 i7',      qty:1, pa:2200000, pv:2400000 },
    { date:'13/11/2025', produit:'SOURIS SANS FIL',   qty:3, pa:90000,   pv:100000  },
    { date:'14/11/2025', produit:'DELL 5400',         qty:1, pa:2000000, pv:2200000 },
    { date:'15/11/2025', produit:'SUPPORT PC',        qty:2, pa:90000,   pv:100000  },
    { date:'17/11/2025', produit:'Surface dual',      qty:1, pa:1700000, pv:1900000 },
    { date:'18/11/2025', produit:'HPX360',            qty:1, pa:1300000, pv:1400000 },
    { date:'19/11/2025', produit:'SAC PC',            qty:2, pa:80000,   pv:100000  },
    { date:'20/11/2025', produit:'LENOVO T470',       qty:1, pa:1800000, pv:2000000 },
    { date:'21/11/2025', produit:'cle USB',           qty:4, pa:90000,   pv:100000  },
    { date:'22/11/2025', produit:'HP 430 i7',         qty:1, pa:1700000, pv:1900000 },
    { date:'24/11/2025', produit:'DELL 3380',         qty:1, pa:1800000, pv:2000000 },
    { date:'25/11/2025', produit:'MICRO CRAVATE',     qty:2, pa:200000,  pv:250000  },
    { date:'26/11/2025', produit:'NOTEBOOK MAC',      qty:1, pa:850000,  pv:1000000 },
    { date:'27/11/2025', produit:'TYPE HDMI',         qty:2, pa:160000,  pv:200000  },
    { date:'28/11/2025', produit:'HP 840 G5',         qty:1, pa:2300000, pv:2500000 },
    { date:'29/11/2025', produit:'LENOVO 11e I5',     qty:1, pa:1700000, pv:1800000 },
    { date:'30/11/2025', produit:'SOURIS SANS FIL',   qty:2, pa:90000,   pv:100000  },

    // ── DÉCEMBRE 2025 ──────────────────────────
    { date:'01/12/2025', produit:'HP 840 G3',         qty:2, pa:1800000, pv:2000000 },
    { date:'02/12/2025', produit:'NOTEBOOK GALAXY',   qty:1, pa:850000,  pv:1000000 },
    { date:'03/12/2025', produit:'SAC PC',            qty:5, pa:80000,   pv:100000  },
    { date:'04/12/2025', produit:'LENOVO I7',         qty:1, pa:2200000, pv:2400000 },
    { date:'05/12/2025', produit:'cle USB',           qty:6, pa:90000,   pv:100000  },
    { date:'06/12/2025', produit:'DELL 7390 2 IN 1',  qty:1, pa:2200000, pv:2400000 },
    { date:'08/12/2025', produit:'TYPE HDMI',         qty:4, pa:160000,  pv:200000  },
    { date:'09/12/2025', produit:'HP 840 G4',         qty:1, pa:2000000, pv:2200000 },
    { date:'10/12/2025', produit:'SOURIS SANS FIL',   qty:4, pa:90000,   pv:100000  },
    { date:'11/12/2025', produit:'DELL 5480',         qty:1, pa:1800000, pv:2000000 },
    { date:'12/12/2025', produit:'SUPPORT PC',        qty:3, pa:90000,   pv:100000  },
    { date:'13/12/2025', produit:'HP 840 G5',         qty:1, pa:2300000, pv:2500000 },
    { date:'15/12/2025', produit:'Projecteur',        qty:1, pa:700000,  pv:800000  },
    { date:'16/12/2025', produit:'LENOVO L13',        qty:1, pa:1900000, pv:2100000 },
    { date:'17/12/2025', produit:'SAC PC',            qty:3, pa:80000,   pv:100000  },
    { date:'18/12/2025', produit:'HP RAZYN 5 - i5',   qty:1, pa:1800000, pv:2100000 },
    { date:'19/12/2025', produit:'cle USB',           qty:4, pa:90000,   pv:100000  },
    { date:'20/12/2025', produit:'TAPIS PC',          qty:6, pa:60000,   pv:70000   },
    { date:'22/12/2025', produit:'HP 1040 i7',        qty:1, pa:2200000, pv:2400000 },
    { date:'23/12/2025', produit:'NOTEBOOK ACTION',   qty:1, pa:850000,  pv:1000000 },
    { date:'24/12/2025', produit:'TYPE HDMI',         qty:3, pa:160000,  pv:200000  },
    { date:'26/12/2025', produit:'Surface I5',        qty:1, pa:2500000, pv:2700000 },
    { date:'27/12/2025', produit:'DELL 3190',         qty:2, pa:1200000, pv:1300000 },
    { date:'29/12/2025', produit:'HP 840 G3',         qty:1, pa:1800000, pv:2000000 },
    { date:'30/12/2025', produit:'MICRO CRAVATE',     qty:2, pa:200000,  pv:250000  },
    { date:'31/12/2025', produit:'LENOVO T470',       qty:1, pa:1800000, pv:2000000 },
  ];

  const ventes = rawVentes.map((v, i) => ({
    id: makeId() + 100000 + i,
    date:      iso(v.date),
    produit:   v.produit,
    qty:       v.qty,
    pa:        v.pa,
    pv:        v.pv,
    gain:      v.gain !== undefined ? v.gain : (v.pv - v.pa) * v.qty,
    vendeur:   v.vendeur || 'Propriétaire',
    createdAt: new Date().toISOString()
  }));

  localStorage.setItem('bp_ventes',  JSON.stringify(ventes));
  localStorage.setItem('bp_charges', JSON.stringify([]));
  localStorage.setItem('bp_dettes',  JSON.stringify([]));

  console.log(`✅ Boutique Pro – Seed OK: ${ventes.length} ventes chargées.`);
})();
