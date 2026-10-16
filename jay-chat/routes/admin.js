// 后台管理（仅管理员）：用户管理 / 封禁 / 禁言
const express = require('express');
const router = express.Router();
const { db, markDirty } = require('../lib/db');
const { now, fmtFull } = require('../lib/utils');
const { authMiddleware } = require('../lib/auth');
const presence = require('../lib/presence');
const { publicUser, userRoom } = require('../socket');

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '无权限，仅管理员可访问' });
  next();
}

// 所有用户列表（支持搜索）
router.get('/users', authMiddleware, requireAdmin, (req, res) => {
  const q = String(req.query.q || '').trim();
  const users = db.users
    .filter((u) => !q || u.username.includes(q) || u.email.includes(q))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((u) => ({
      ...publicUser(u),
      email: u.email,
      online: presence.isOnline(u.id),
      bannedUntil: u.bannedUntil && u.bannedUntil > Date.now() ? u.bannedUntil : null,
      globalMutedUntil: u.globalMutedUntil && u.globalMutedUntil > Date.now() ? u.globalMutedUntil : null,
      createdAt: u.createdAt,
    }));
  res.json({ users });
});

// 封禁（自定义分钟）
router.post('/ban', authMiddleware, requireAdmin, (req, res) => {
  const { userId, minutes } = req.body || {};
  const u = db.users.find((x) => x.id === userId);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  if (u.role === 'admin') return res.status(403).json({ error: '不能封禁管理员' });
  const mins = Number(minutes);
  if (!Number.isFinite(mins) || mins <= 0) return res.status(400).json({ error: '请输入有效的封禁时长（分钟）' });
  u.bannedUntil = now() + mins * 60 * 1000;
  markDirty();
  const io = req.app.get('io');
  if (io) {
    io.to(userRoom(userId)).emit('force:logout', { reason: `你已被管理员封禁至 ${fmtFull(u.bannedUntil)}` });
    io.to(userRoom(userId)).disconnectSockets(true);
  }
  res.json({ ok: true, bannedUntil: u.bannedUntil });
});

// 解除封禁
router.post('/unban', authMiddleware, requireAdmin, (req, res) => {
  const u = db.users.find((x) => x.id === (req.body || {}).userId);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  u.bannedUntil = null;
  markDirty();
  res.json({ ok: true });
});

// 全局禁言（自定义分钟）
router.post('/mute', authMiddleware, requireAdmin, (req, res) => {
  const { userId, minutes } = req.body || {};
  const u = db.users.find((x) => x.id === userId);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  if (u.role === 'admin') return res.status(403).json({ error: '不能禁言管理员' });
  const mins = Number(minutes);
  if (!Number.isFinite(mins) || mins <= 0) return res.status(400).json({ error: '请输入有效的禁言时长（分钟）' });
  u.globalMutedUntil = now() + mins * 60 * 1000;
  markDirty();
  const io = req.app.get('io');
  if (io) io.to(userRoom(userId)).emit('admin:event', { type: 'muted', until: u.globalMutedUntil, untilText: fmtFull(u.globalMutedUntil) });
  res.json({ ok: true, globalMutedUntil: u.globalMutedUntil });
});

// 解除禁言
router.post('/unmute', authMiddleware, requireAdmin, (req, res) => {
  const u = db.users.find((x) => x.id === (req.body || {}).userId);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  u.globalMutedUntil = null;
  markDirty();
  const io = req.app.get('io');
  if (io) io.to(userRoom(u.id)).emit('admin:event', { type: 'unmuted' });
  res.json({ ok: true });
});

module.exports = router;
