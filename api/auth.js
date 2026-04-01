'use strict';

const { makeToken } = require('./_auth');

const USERS = [
  { username: 'VENIPS', password: 'venips224@' },
  { username: 'JACOB',  password: 'compilateur787' }
];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { username, password } = req.body || {};
  const user = USERS.find(u => u.username === username && u.password === password);

  if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });

  const token   = makeToken(username);
  const expires = Date.now() + 24 * 60 * 60 * 1000; // expiry timestamp for client
  return res.status(200).json({ token, expires });
};
