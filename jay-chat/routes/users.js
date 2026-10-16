// 用户：头像 / 改名（一周2次）/ 搜索 / 在线列表
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { db, markDirty, UPLOAD_DIR } = require('../lib/db');
const { uid, now } = require('../lib/utils');
const { authMiddleware } = require('../lib/auth');
const presence = require('../lib/presence');
const { publicUser } = require('../socket');

// 文件上传（图片/视频），once=true 存入一次性目录
router.post('/upload', authMiddleware, (req, res) => {
  const { type, data, once } = req.body || {};
  if (!['image', 'video'].includes(type)) return res.status(400).json({ error: '不支持的类型' });
  const m = /^data:(image\/(jpeg|png|gif|webp)|video\/(mp4|webm|quicktime));base64,(.+)$/.exec(data || '');
  if (!m) return res.status(400).json({ error: '无效的文件数据' });
  const mime = m[1];
  const buf = Buffer.from(m[4], 'base64');
  if (type === 'image' && buf.length > 10 * 1024 * 1024) return res.status(400).json({ error: '图片不能超过10MB' });
  if (type === 'video' && buf.length > 60 * 1024 * 1024) return res.status(400).json({ error: '视频不能超过60MB' });
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }[mime];
  const dir = once ? path.join(UPLOAD_DIR, 'once') : UPLOAD_DIR;
  const name = uid() + '.' + ext;
  fs.writeFileSync(path.join(dir, name), buf);
  // 一次性内容返回特殊标记，消息里不直接暴露公网URL
  const url = once ? 'once:' + name : '/uploads/' + name;
  res.json({ ok: true, url });
});

// 更换头像
router.post('/avatar', authMiddleware, (req, res) => {
  const { data } = req.body || {};
  const m = /^data:image\/(jpeg|png|gif|webp);base64,(.+)$/.exec(data || '');
  if (!m) return res.status(400).json({ error: '无效的图片' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) return res.status(400).json({ error: '头像图片过大' });
  req.user.avatar = data;
  markDirty();
  broadcastProfile(req, req.user);
  res.json({ ok: true, avatar: data });
});

// 更换昵称（一周最多2次）
router.post('/rename', authMiddleware, (req, res) => {
  const name = String((req.body || {}).username || '').trim();
  if (!name || name.length < 1 || name.length > 6) {
    return res.status(400).json({ error: '昵称只能是1到6个字符' });
  }
  if (db.users.some((u) => u.username === name && u.id !== req.user.id)) {
    return res.status(400).json({ error: '该昵称已被使用' });
  }
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = req.user.renameLog.filter((t) => t > weekAgo);
  if (recent.length >= 2) {
    return res.status(400).json({ error: '一周只能修改2次昵称，请下次再来' });
  }
  const oldName = req.user.username;
  req.user.username = name;
  req.user.renameLog.push(now());
  markDirty();
  broadcastProfile(req, req.user);
  res.json({ ok: true, username: name, remaining: 2 - (recent.length + 1) });
});

// 搜索用户（按昵称，添加好友用）
router.get('/search', authMiddleware, (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ users: [] });
  const users = db.users
    .filter((u) => u.id !== req.user.id && u.username.includes(q))
    .slice(0, 20)
    .map((u) => ({ ...publicUser(u), online: presence.isOnline(u.id) }));
  res.json({ users });
});

// 当前在线用户
router.get('/online', authMiddleware, (req, res) => {
  res.json({ onlineIds: presence.onlineIds() });
});

// 用户公开信息
router.get('/:id', authMiddleware, (req, res) => {
  const u = db.users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  res.json({ user: { ...publicUser(u), online: presence.isOnline(u.id) } });
});

// 资料变更通知（好友/群友刷新）
function broadcastProfile(req, user) {
  const io = req.app.get('io');
  if (!io) return;
  const p = publicUser(user);
  io.emit('profile:update', p);
}

module.exports = router;
