'use strict';

const crypto = require('crypto');

const USERS = [
  { username: 'VENIPS', password: 'venips224@' },
  { username: 'JACOB',  password: 'compilateur787' }
];

function makeToken(username) {
  const secret = process.env.VENIPS_API_SECRET || 'venips-default-secret';
  return crypto.createHmac('sha256', secret).update(username).digest('hex');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { username, password } = req.body || {};
  const user = USERS.find(u => u.username === username && u.password === password);

  if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });

  return res.status(200).json({ token: makeToken(username) });
};
