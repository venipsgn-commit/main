/* ============================================
   BOUTIQUE PRO – RESET
   Efface toutes les données de la base
   ============================================ */

(function () {
  'use strict';

  localStorage.removeItem('bp_ventes');
  localStorage.removeItem('bp_stock');
  localStorage.removeItem('bp_vendeurs');
  localStorage.removeItem('bp_charges');
  localStorage.removeItem('bp_dettes');

  console.log('🗑️ Boutique Pro – Base de données effacée.');
})();
