const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, markDirty } = require('./db');

const TOKEN_TTL = 1000 * 60 * 60 * 24 * 30; // 30天自动登录

function hashPassword(pw) {
  return bcrypt.hashSync(String(pw), 10);
}
function verifyPassword(pw, hash) {
  try { return bcrypt.compareSync(String(pw), hash); } catch (e) { return false; }
}

function sign(payload) {
  const secret = db.secret;
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function createToken(userId) {
  return sign({ uid: userId, exp: Date.now() + TOKEN_TTL });
}

function verifyToken(token) {
  try {
    const [body, sig] = String(token).split('.');
    if (!body || !sig) return null;
    const expect = crypto.createHmac('sha256', db.secret).update(body).digest('base64url');
    if (sig !== expect) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) { return null; }
}

function getUserFromToken(token) {
  const payload = verifyToken(token);
  if (!payload) return null;
  return db.users.find((u) => u.id === payload.uid) || null;
}

// Express 中间件：解析 Authorization: Bearer xxx
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token);
  const user = token ? getUserFromToken(token) : null;
  if (!user) return res.status(401).json({ error: '请先登录' });
  if (user.bannedUntil && user.bannedUntil > Date.now()) {
    return res.status(403).json({ error: `账号已被封禁至 ${require('./utils').fmtFull(user.bannedUntil)}` });
  }
  req.user = user;
  next();
}

function isBanned(user) {
  return user.bannedUntil && user.bannedUntil > Date.now();
}
function isGlobalMuted(user) {
  return user.globalMutedUntil && user.globalMutedUntil > Date.now();
}

module.exports = {
  hashPassword, verifyPassword, createToken, verifyToken,
  getUserFromToken, authMiddleware, isBanned, isGlobalMuted,
};
