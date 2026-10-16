// 认证：验证码 / 注册 / 登录 / 忘记密码 / 自动登录
const express = require('express');
const router = express.Router();
const { db, markDirty } = require('../lib/db');
const { uid, now, EMAIL_RE, fmtFull } = require('../lib/utils');
const { hashPassword, verifyPassword, createToken, authMiddleware } = require('../lib/auth');
const { sendCodeEmail } = require('../lib/mailer');
const { joinOfficialGroup } = require('../lib/seed');

// 发送验证码
router.post('/send-code', async (req, res) => {
  const { email, purpose } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: '邮箱只支持 @qq.com 或 @163.com' });
  }
  const purposeValid = ['register', 'reset'].includes(purpose);
  if (!purposeValid) return res.status(400).json({ error: '无效的验证码用途' });

  const existUser = db.users.find((u) => u.email === email);
  if (purpose === 'register' && existUser) {
    return res.status(400).json({ error: '该邮箱已注册，请直接登录' });
  }
  if (purpose === 'reset' && !existUser) {
    return res.status(400).json({ error: '该邮箱未注册' });
  }

  // 60秒内不可重复发送
  const recent = db.codes.find((c) => c.email === email && c.purpose === purpose && Date.now() - c.createdAt < 60000);
  if (recent) return res.status(429).json({ error: '发送太频繁，请60秒后再试' });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.codes = db.codes.filter((c) => !(c.email === email && c.purpose === purpose));
  db.codes.push({ email, code, purpose, createdAt: now(), expiresAt: now() + 10 * 60 * 1000, used: false });
  markDirty();

  const result = await sendCodeEmail(email, code, purpose);
  if (result.ok) return res.json({ ok: true });
  // 邮件失败也不阻塞流程（返回验证码供演示），并记录日志
  console.log(`[auth] 邮件发送失败，验证码 ${email}: ${code}`);
  return res.json({ ok: true, mailFailed: true, devCode: code });
});

function checkCode(email, code, purpose) {
  const rec = db.codes.find((c) => c.email === email && c.purpose === purpose && !c.used);
  if (!rec) return '请先获取验证码';
  if (rec.expiresAt < Date.now()) return '验证码已过期，请重新获取';
  if (rec.code !== String(code).trim()) return '验证码错误';
  return null;
}

// 注册
router.post('/register', (req, res) => {
  const { username, email, password, code } = req.body || {};
  const name = String(username || '').trim();
  if (!name || name.length < 1 || name.length > 6) {
    return res.status(400).json({ error: '昵称只能是1到6个字符' });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: '邮箱只支持 @qq.com 或 @163.com' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: '密码至少6位' });
  }
  if (db.users.some((u) => u.email === email)) {
    return res.status(400).json({ error: '该邮箱已注册' });
  }
  if (db.users.some((u) => u.username === name)) {
    return res.status(400).json({ error: '该昵称已被使用' });
  }
  const err = checkCode(email, code, 'register');
  if (err) return res.status(400).json({ error: err });
  db.codes.find((c) => c.email === email && c.purpose === 'register').used = true;

  const user = {
    id: uid(),
    username: name,
    email,
    passwordHash: hashPassword(password),
    avatar: null,
    role: 'user',
    isOfficial: false,
    bannedUntil: null,
    globalMutedUntil: null,
    renameLog: [],
    createdAt: now(),
    lastSeenAt: now(),
  };
  db.users.push(user);
  joinOfficialGroup(user.id); // 自动加入官方群
  markDirty();

  res.json({ ok: true, token: createToken(user.id), user: publicUserSafe(user) });
});

// 登录（用户名或邮箱 + 密码）
router.post('/login', (req, res) => {
  const { account, password } = req.body || {};
  const acc = String(account || '').trim();
  if (!acc || !password) return res.status(400).json({ error: '请输入账号和密码' });
  const user = db.users.find((u) => u.username === acc || u.email === acc);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(400).json({ error: '账号或密码错误' });
  }
  if (user.bannedUntil && user.bannedUntil > Date.now()) {
    return res.status(403).json({ error: `账号已被封禁至 ${fmtFull(user.bannedUntil)}` });
  }
  res.json({ ok: true, token: createToken(user.id), user: publicUserSafe(user) });
});

// 忘记密码：邮箱 + 验证码 + 新密码
router.post('/reset', (req, res) => {
  const { email, code, password, confirm } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: '邮箱只支持 @qq.com 或 @163.com' });
  const user = db.users.find((u) => u.email === email);
  if (!user) return res.status(400).json({ error: '该邮箱未注册' });
  const err = checkCode(email, code, 'reset');
  if (err) return res.status(400).json({ error: err });
  if (!password || String(password).length < 6) return res.status(400).json({ error: '新密码至少6位' });
  if (password !== confirm) return res.status(400).json({ error: '两次输入的密码不一致' });
  db.codes.find((c) => c.email === email && c.purpose === 'reset').used = true;
  user.passwordHash = hashPassword(password);
  markDirty();
  res.json({ ok: true });
});

// 自动登录：校验 token
router.get('/me', authMiddleware, (req, res) => {
  res.json({ ok: true, user: publicUserSafe(req.user) });
});

function publicUserSafe(u) {
  return {
    id: u.id, username: u.username, email: u.email, avatar: u.avatar,
    role: u.role, isOfficial: !!u.isOfficial, createdAt: u.createdAt,
    bannedUntil: u.bannedUntil, globalMutedUntil: u.globalMutedUntil,
  };
}

module.exports = router;
