/**
 * VENIPS – Utilitaire de hachage de mot de passe
 *
 * Usage :
 *   node hash-password.js monMotDePasse
 *
 * Copiez le hash généré dans votre .env :
 *   VENIPS_USERS=VENIPS:scrypt:HASH:SALT,JACOB:scrypt:HASH:SALT
 */

'use strict';

const crypto = require('crypto');

const plaintext = process.argv[2];
if (!plaintext) {
  console.error('Usage : node hash-password.js <mot_de_passe>');
  process.exit(1);
}

const salt    = crypto.randomBytes(32);
const hash    = crypto.scryptSync(plaintext, salt, 64);
const encoded = `scrypt:${hash.toString('hex')}:${salt.toString('hex')}`;

console.log('\n✅ Hash généré :');
console.log(encoded);
console.log('\nUtilisation dans .env :');
console.log(`VENIPS_USERS=VENIPS:${encoded},JACOB:scrypt:...`);
console.log('\nVérification (doit afficher true) :');

// Vérification immédiate
const [, hashHex, saltHex] = encoded.split(':');
const verify = crypto.timingSafeEqual(
  crypto.scryptSync(plaintext, Buffer.from(saltHex, 'hex'), 64),
  Buffer.from(hashHex, 'hex')
);
console.log('Résultat vérification :', verify);
