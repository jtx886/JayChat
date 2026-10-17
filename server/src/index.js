const express = require('express');
const http = require('http');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const axios = require('axios');
const { db, hashPassword, makeUser, seed } = require('./db');
const { sendCode } = require('./mailer');
const ai = require('./ai');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'jaychat-official-secret-2026';
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// copy bundled assets
const BUNDLED = ['official-avatar.svg', 'official-group.svg', 'jay-ai.svg'];
for (const f of BUNDLED) {
  const src = path.join(__dirname, 'assets', f);
  const dst = path.join(UPLOAD_DIR, f);
  if (fs.existsSync(src) && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }));
const WWW_DIR = path.join(__dirname, '..', '..', 'app', 'www');
if (fs.existsSync(WWW_DIR)) app.use(express.static(WWW_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.bin').toLowerCase();
    cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

// ---------- helpers ----------
function sign(uid) { return jwt.sign({ uid }, JWT_SECRET, { expiresIn: '30d' }); }
function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '') || req.query.token;
  try { req.uid = jwt.verify(t, JWT_SECRET).uid; next(); }
  catch { res.status(401).json({ error: '未登录或登录已过期' }); }
}
function pubUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, avatar: u.avatar || '', isBot: !!u.isBot, isOfficial: !!u.isOfficial };
}
function getUser(id) { return db.prepare('SELECT * FROM users WHERE id=?').get(id); }
function pubUserById(id) { return pubUser(getUser(id)); }
function areFriends(a, b) {
  return !!db.prepare('SELECT 1 FROM friends WHERE user_id=? AND friend_id=?').get(a, b);
}
function inGroup(gid, uid) {
  return db.prepare('SELECT * FROM group_members WHERE group_id=? AND user_id=?').get(gid, uid);
}
function officialGroup() { return db.prepare('SELECT * FROM groups WHERE is_official=1').get(); }
function notify(userId, type, actorId, refType, refId, content) {
  const info = db.prepare('INSERT INTO notifications (user_id,type,actor_id,ref_type,ref_id,content,is_read,created_at) VALUES (?,?,?,?,?,?,0,?)')
    .run(userId, type, actorId, refType, refId || 0, content || '', Date.now());
  const unread = db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND is_read=0').get(userId).c;
  io.to('user:' + userId).emit('notification:new', { id: info.lastInsertRowid, type, actorId, refType, refId: refId || 0, content, unread });
}

// ---------- AUTH ----------
const EMAIL_RE = /^[\w.+-]+@qq\.com$|^[\w.+-]+@163\.com$/i;

app.post('/api/auth/send-code', async (req, res) => {
  const { email, purpose } = req.body || {};
  if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: '仅支持 @qq.com 和 @163.com 邮箱' });
  if (purpose === 'register') {
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(400).json({ error: '该邮箱已注册' });
  } else if (purpose === 'reset') {
    if (!db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(400).json({ error: '该邮箱未注册' });
  }
  const recent = db.prepare('SELECT * FROM codes WHERE email=? AND purpose=? ORDER BY id DESC LIMIT 1').get(email, purpose || 'register');
  if (recent && Date.now() - recent.created_at < 60000) return res.status(429).json({ error: '发送太频繁，请 1 分钟后再试' });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.prepare('INSERT INTO codes (email,code,purpose,expires_at,created_at) VALUES (?,?,?,?,?)')
    .run(email, code, purpose || 'register', Date.now() + 5 * 60 * 1000, Date.now());
  try {
    await sendCode(email, code);
    res.json({ ok: true });
  } catch (e) {
    console.error('mail error', e.message);
    res.status(500).json({ error: '验证码邮件发送失败，请稍后重试' });
  }
});

app.post('/api/auth/register', (req, res) => {
  const { username, email, password, code } = req.body || {};
  const name = String(username || '').trim();
  if (![...name].length || [...name].length > 6) return res.status(400).json({ error: '昵称需为 1-6 个字符' });
  if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: '仅支持 @qq.com 和 @163.com 邮箱' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  const c = db.prepare('SELECT * FROM codes WHERE email=? AND purpose=? AND code=? AND expires_at>? ORDER BY id DESC LIMIT 1')
    .get(email, 'register', String(code).trim(), Date.now());
  if (!c) return res.status(400).json({ error: '验证码错误或已过期' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(400).json({ error: '该邮箱已注册' });
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(name)) return res.status(400).json({ error: '昵称已被占用' });
  const uid = makeUser(name, email, password);
  const g = officialGroup();
  if (g && !inGroup(g.id, uid)) db.prepare('INSERT INTO group_members (group_id,user_id,role,joined_at) VALUES (?,?,?,?)').run(g.id, uid, 'member', Date.now());
  res.json({ ok: true, token: sign(uid), user: pubUserById(uid) });
});

app.post('/api/auth/login', (req, res) => {
  const { account, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE (username=? OR email=?) AND isBot=0').get(String(account || '').trim(), String(account || '').trim().toLowerCase());
  if (!u) return res.status(400).json({ error: '用户不存在' });
  if (hashPassword(password, u.salt) !== u.password_hash) return res.status(400).json({ error: '密码错误' });
  res.json({ ok: true, token: sign(u.id), user: pubUser(u) });
});

app.post('/api/auth/reset-password', (req, res) => {
  const { email, code, password } = req.body || {};
  if (!password || String(password).length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  const c = db.prepare('SELECT * FROM codes WHERE email=? AND purpose=? AND code=? AND expires_at>? ORDER BY id DESC LIMIT 1')
    .get(email, 'reset', String(code).trim(), Date.now());
  if (!c) return res.status(400).json({ error: '验证码错误或已过期' });
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u) return res.status(400).json({ error: '该邮箱未注册' });
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE users SET password_hash=?, salt=? WHERE id=?').run(hashPassword(password, salt), salt, u.id);
  res.json({ ok: true });
});

app.get('/api/auth/me', auth, (req, res) => {
  res.json({ user: pubUserById(req.uid) });
});

// ---------- USERS ----------
app.get('/api/users/search', auth, (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ users: [] });
  const list = db.prepare('SELECT * FROM users WHERE username LIKE ? AND isBot=0 AND id != ? LIMIT 20').all(`%${q}%`, req.uid).map(pubUser);
  res.json({ users: list });
});

app.post('/api/users/avatar', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择图片' });
  const url = '/uploads/' + req.file.filename;
  db.prepare('UPDATE users SET avatar=? WHERE id=?').run(url, req.uid);
  res.json({ ok: true, avatar: url });
});

app.post('/api/users/name', auth, (req, res) => {
  const name = String(req.body?.username || '').trim();
  if (![...name].length || [...name].length > 6) return res.status(400).json({ error: '昵称需为 1-6 个字符' });
  if (db.prepare('SELECT 1 FROM users WHERE username=? AND id != ?').get(name, req.uid)) return res.status(400).json({ error: '昵称已被占用' });
  const u = getUser(req.uid);
  const changes = JSON.parse(u.name_changes || '[]');
  const weekAgo = Date.now() - 7 * 86400 * 1000;
  const recent = changes.filter(t => t > weekAgo);
  if (recent.length >= 2) return res.status(400).json({ error: '一周内只能修改 2 次昵称' });
  recent.push(Date.now());
  db.prepare('UPDATE users SET username=?, name_changes=? WHERE id=?').run(name, JSON.stringify(recent), req.uid);
  res.json({ ok: true, username: name, remaining: 2 - recent.length });
});

app.get('/api/users/name-quota', auth, (req, res) => {
  const u = getUser(req.uid);
  const changes = JSON.parse(u.name_changes || '[]');
  const weekAgo = Date.now() - 7 * 86400 * 1000;
  res.json({ remaining: Math.max(0, 2 - changes.filter(t => t > weekAgo).length) });
});

app.get('/api/users/online', auth, (req, res) => {
  res.json({ online: [...onlineUsers.keys()] });
});

// ---------- FRIENDS ----------
app.post('/api/friends/request', auth, (req, res) => {
  const toId = Number(req.body?.userId);
  if (toId === req.uid) return res.status(400).json({ error: '不能添加自己' });
  if (!getUser(toId) || getUser(toId).isBot) return res.status(400).json({ error: '用户不存在' });
  if (areFriends(req.uid, toId)) return res.status(400).json({ error: '已经是好友了' });
  const dup = db.prepare("SELECT * FROM friend_requests WHERE from_id=? AND to_id=? AND status='pending'").get(req.uid, toId);
  if (dup) return res.status(400).json({ error: '已发送过申请，等待对方通过' });
  db.prepare('INSERT INTO friend_requests (from_id,to_id,status,created_at) VALUES (?,?,?,?)').run(req.uid, toId, 'pending', Date.now());
  const count = db.prepare("SELECT COUNT(*) c FROM friend_requests WHERE to_id=? AND status='pending'").get(toId).c;
  io.to('user:' + toId).emit('friendreq:new', { count, from: pubUserById(req.uid) });
  res.json({ ok: true });
});

app.get('/api/friends/requests', auth, (req, res) => {
  const incoming = db.prepare("SELECT r.*, u.username, u.avatar FROM friend_requests r JOIN users u ON u.id=r.from_id WHERE r.to_id=? AND r.status='pending' ORDER BY r.id DESC").all(req.uid)
    .map(r => ({ id: r.id, user: { id: r.from_id, username: r.username, avatar: r.avatar }, createdAt: r.created_at }));
  const outgoing = db.prepare("SELECT r.*, u.username, u.avatar FROM friend_requests r JOIN users u ON u.id=r.to_id WHERE r.from_id=? AND r.status='pending' ORDER BY r.id DESC").all(req.uid)
    .map(r => ({ id: r.id, user: { id: r.to_id, username: r.username, avatar: r.avatar }, createdAt: r.created_at }));
  res.json({ incoming, outgoing });
});

app.post('/api/friends/requests/:id/accept', auth, (req, res) => {
  const r = db.prepare('SELECT * FROM friend_requests WHERE id=?').get(req.params.id);
  if (!r || r.to_id !== req.uid || r.status !== 'pending') return res.status(400).json({ error: '申请不存在' });
  db.prepare("UPDATE friend_requests SET status='accepted' WHERE id=?").run(r.id);
  const now = Date.now();
  db.prepare('INSERT OR IGNORE INTO friends (user_id,friend_id,created_at) VALUES (?,?,?)').run(r.to_id, r.from_id, now);
  db.prepare('INSERT OR IGNORE INTO friends (user_id,friend_id,created_at) VALUES (?,?,?)').run(r.from_id, r.to_id, now);
  notify(r.from_id, 'friend_accepted', req.uid, 'user', req.uid, '通过了你的好友申请');
  res.json({ ok: true });
});

app.post('/api/friends/requests/:id/reject', auth, (req, res) => {
  const r = db.prepare('SELECT * FROM friend_requests WHERE id=?').get(req.params.id);
  if (!r || r.to_id !== req.uid || r.status !== 'pending') return res.status(400).json({ error: '申请不存在' });
  db.prepare("UPDATE friend_requests SET status='rejected' WHERE id=?").run(r.id);
  res.json({ ok: true });
});

app.get('/api/friends', auth, (req, res) => {
  const rows = db.prepare('SELECT f.remark, u.* FROM friends f JOIN users u ON u.id=f.friend_id WHERE f.user_id=? AND u.isBot=0 ORDER BY u.username').all(req.uid);
  res.json({
    friends: rows.map(u => ({
      id: u.id, username: u.username, avatar: u.avatar, remark: u.remark || '',
      online: onlineUsers.has(u.id), createdAt: u.created_at
    }))
  });
});

app.post('/api/friends/:id/remark', auth, (req, res) => {
  db.prepare('UPDATE friends SET remark=? WHERE user_id=? AND friend_id=?').run(String(req.body?.remark || '').slice(0, 20), req.uid, Number(req.params.id));
  res.json({ ok: true });
});

app.delete('/api/friends/:id', auth, (req, res) => {
  const fid = Number(req.params.id);
  db.prepare('DELETE FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)').run(req.uid, fid, fid, req.uid);
  res.json({ ok: true });
});

app.get('/api/friends/:id/moments', auth, (req, res) => {
  const fid = Number(req.params.id);
  if (!areFriends(req.uid, fid)) return res.status(403).json({ error: '不是好友' });
  res.json({ moments: queryMoments(m => m.user_id === fid, req.uid) });
});

// ---------- GROUPS ----------
app.post('/api/groups', auth, upload.single('avatar'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: '请输入群名称' });
  const gid = db.prepare('INSERT INTO groups (name,avatar,owner_id,created_at) VALUES (?,?,?,?)')
    .run(name, req.file ? '/uploads/' + req.file.filename : '', req.uid, Date.now()).lastInsertRowid;
  db.prepare('INSERT INTO group_members (group_id,user_id,role,joined_at) VALUES (?,?,?,?)').run(gid, req.uid, 'owner', Date.now());
  res.json({ ok: true, groupId: gid });
});

app.get('/api/groups', auth, (req, res) => {
  const rows = db.prepare('SELECT g.*, m.role FROM groups g JOIN group_members m ON m.group_id=g.id AND m.user_id=? ORDER BY g.id').all(req.uid);
  res.json({ groups: rows.map(g => groupSummary(g, req.uid)) });
});

function groupSummary(g, uid) {
  const memberCount = db.prepare('SELECT COUNT(*) c FROM group_members WHERE group_id=?').get(g.id).c;
  const cnt = db.prepare('SELECT COUNT(*) c FROM group_members gm WHERE gm.group_id=? AND (?) - gm.muted_until > 0')
    .get(g.id, 0);
  const onlineCount = db.prepare('SELECT COUNT(*) c FROM group_members gm WHERE gm.group_id=?').get(g.id).c;
  const members = db.prepare('SELECT user_id FROM group_members WHERE group_id=?').all(g.id).map(r => r.user_id);
  const onlineCnt = members.filter(id => onlineUsers.has(id)).length;
  return { id: g.id, name: g.name, avatar: g.avatar, isOfficial: !!g.is_official, role: g.role, memberCount, onlineCount: onlineCnt };
}

app.get('/api/groups/:id', auth, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  if (!g) return res.status(404).json({ error: '群不存在' });
  const me = inGroup(g.id, req.uid);
  if (!me) return res.status(403).json({ error: '不是群成员' });
  const members = db.prepare('SELECT gm.role, gm.muted_until, gm.joined_at, u.* FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=? ORDER BY gm.joined_at').all(g.id)
    .map(m => ({ ...pubUser(m), role: m.role, mutedUntil: m.muted_until, online: onlineUsers.has(m.id), lastReadMsgId: lastReadMsg('group', g.id, m.id) }));
  res.json({ group: { id: g.id, name: g.name, avatar: g.avatar, isOfficial: !!g.is_official, ownerId: g.owner_id, createdAt: g.created_at, memberCount: members.length, onlineCount: members.filter(m => m.online).length }, myRole: me.role, members });
});

function lastReadMsg(convType, convId, uid) {
  const r = db.prepare('SELECT last_read_msg_id FROM conv_reads WHERE conv_type=? AND conv_id=? AND user_id=?').get(convType, convId, uid);
  return r ? r.last_read_msg_id : 0;
}

app.post('/api/groups/:id/name', auth, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  const me = g && inGroup(g.id, req.uid);
  if (!g || !me || !['owner', 'admin'].includes(me.role)) return res.status(403).json({ error: '无权限' });
  db.prepare('UPDATE groups SET name=? WHERE id=?').run(String(req.body?.name || '').trim().slice(0, 20), g.id);
  res.json({ ok: true });
});

app.post('/api/groups/:id/avatar', auth, upload.single('file'), (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  const me = g && inGroup(g.id, req.uid);
  if (!g || !me || !['owner', 'admin'].includes(me.role)) return res.status(403).json({ error: '无权限' });
  if (!req.file) return res.status(400).json({ error: '请选择图片' });
  db.prepare('UPDATE groups SET avatar=? WHERE id=?').run('/uploads/' + req.file.filename, g.id);
  res.json({ ok: true, avatar: '/uploads/' + req.file.filename });
});

app.post('/api/groups/:id/invite', auth, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  if (!g || !inGroup(g.id, req.uid)) return res.status(403).json({ error: '不是群成员' });
  const ids = (req.body?.userIds || []).map(Number);
  for (const id of ids) {
    if (getUser(id) && !getUser(id).isBot && !inGroup(g.id, id)) {
      db.prepare('INSERT OR IGNORE INTO group_members (group_id,user_id,role,joined_at) VALUES (?,?,?,?)').run(g.id, id, 'member', Date.now());
      notify(id, 'group_invite', req.uid, 'group', g.id, `邀请你加入了群聊「${g.name}」`);
    }
  }
  res.json({ ok: true });
});

app.post('/api/groups/:id/kick', auth, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  const me = g && inGroup(g.id, req.uid);
  if (!g || !me || !['owner', 'admin'].includes(me.role)) return res.status(403).json({ error: '无权限' });
  const target = inGroup(g.id, Number(req.body?.userId));
  if (!target) return res.status(400).json({ error: '成员不存在' });
  if (g.is_official) return res.status(400).json({ error: '官方群不允许移除成员' });
  if (target.role === 'owner' || (me.role === 'admin' && target.role !== 'member')) return res.status(403).json({ error: '无权限操作该成员' });
  db.prepare('DELETE FROM group_members WHERE group_id=? AND user_id=?').run(g.id, target.user_id);
  res.json({ ok: true });
});

app.post('/api/groups/:id/admin', auth, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  const me = g && inGroup(g.id, req.uid);
  if (!g || !me || me.role !== 'owner') return res.status(403).json({ error: '仅群主可设置管理员' });
  const target = inGroup(g.id, Number(req.body?.userId));
  if (!target || target.role === 'owner') return res.status(400).json({ error: '成员不存在' });
  const role = req.body?.set ? 'admin' : 'member';
  db.prepare('UPDATE group_members SET role=? WHERE group_id=? AND user_id=?').run(role, g.id, target.user_id);
  res.json({ ok: true });
});

app.post('/api/groups/:id/mute', auth, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  const me = g && inGroup(g.id, req.uid);
  if (!g || !me || !['owner', 'admin'].includes(me.role)) return res.status(403).json({ error: '无权限' });
  const target = inGroup(g.id, Number(req.body?.userId));
  if (!target || target.role === 'owner') return res.status(400).json({ error: '成员不存在' });
  if (me.role === 'admin' && target.role === 'admin') return res.status(403).json({ error: '管理员不能禁言管理员' });
  const minutes = Number(req.body?.minutes || 0);
  const until = minutes > 0 ? Date.now() + minutes * 60000 : 0;
  db.prepare('UPDATE group_members SET muted_until=? WHERE group_id=? AND user_id=?').run(until, g.id, target.user_id);
  res.json({ ok: true, mutedUntil: until });
});

app.post('/api/groups/:id/transfer', auth, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  const me = g && inGroup(g.id, req.uid);
  if (!g || !me || me.role !== 'owner') return res.status(403).json({ error: '仅群主可转让' });
  const target = inGroup(g.id, Number(req.body?.userId));
  if (!target || target.user_id === req.uid) return res.status(400).json({ error: '成员不存在' });
  if (g.is_official) return res.status(400).json({ error: '官方群不能转让' });
  db.prepare("UPDATE group_members SET role='member' WHERE group_id=? AND user_id=?").run(g.id, req.uid);
  db.prepare("UPDATE group_members SET role='owner' WHERE group_id=? AND user_id=?").run(g.id, target.user_id);
  db.prepare('UPDATE groups SET owner_id=? WHERE id=?').run(target.user_id, g.id);
  res.json({ ok: true });
});

app.post('/api/groups/:id/leave', auth, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  const me = g && inGroup(g.id, req.uid);
  if (!g || !me) return res.status(400).json({ error: '不是群成员' });
  if (g.is_official) return res.status(400).json({ error: 'Jay Chat官方群不能退出' });
  db.prepare('DELETE FROM group_members WHERE group_id=? AND user_id=?').run(g.id, req.uid);
  res.json({ ok: true });
});

app.get('/api/groups/:id/online', auth, (req, res) => {
  const ids = db.prepare('SELECT user_id FROM group_members WHERE group_id=?').all(req.params.id).map(r => r.user_id);
  res.json({ online: ids.filter(id => onlineUsers.has(id)) });
});

// ---------- CONVERSATIONS ----------
// private messages are stored with conv_id = peer (sender's view).
// thread for (me, peer) = messages I sent to peer + messages peer sent to me.
const PRIV_THREAD = `((sender_id=? AND conv_id=?) OR (sender_id=? AND conv_id=?))`;
function privParams(me, peer) { return [me, peer, peer, me]; }

app.post('/api/conversations/mute', auth, (req, res) => {
  const { convType, convId, muted } = req.body || {};
  ensureReadRow(convType, Number(convId), req.uid);
  db.prepare('UPDATE conv_reads SET muted=? WHERE conv_type=? AND conv_id=? AND user_id=?').run(muted ? 1 : 0, convType, Number(convId), req.uid);
  res.json({ ok: true });
});

function ensureReadRow(convType, convId, uid) {
  db.prepare('INSERT OR IGNORE INTO conv_reads (conv_type,conv_id,user_id,last_read_at,last_read_msg_id) VALUES (?,?,?,0,0)').run(convType, convId, uid);
}

app.get('/api/conversations', auth, (req, res) => {
  const list = [];
  const friends = db.prepare('SELECT f.remark, u.* FROM friends f JOIN users u ON u.id=f.friend_id WHERE f.user_id=? AND u.isBot=0').all(req.uid);
  for (const f of friends) {
    const last = db.prepare(`SELECT * FROM messages WHERE conv_type='private' AND ${PRIV_THREAD} ORDER BY id DESC LIMIT 1`).get(...privParams(req.uid, f.id));
    const read = db.prepare('SELECT * FROM conv_reads WHERE conv_type=? AND conv_id=? AND user_id=?').get('private', Math.min(f.id, req.uid), req.uid);
    const unread = last && last.sender_id !== req.uid ? db.prepare(`SELECT COUNT(*) c FROM messages WHERE conv_type='private' AND ${PRIV_THREAD} AND id>? AND sender_id != ?`).get(...privParams(req.uid, f.id), read?.last_read_msg_id || 0, req.uid).c : 0;
    if (!last) continue; // no conversation yet
    list.push({
      convType: 'private', convId: f.id, name: f.remark || f.username, avatar: f.avatar,
      online: onlineUsers.has(f.id), unread, muted: !!read?.muted, lastReadMsgId: read?.last_read_msg_id || 0,
      last: last ? msgOut(last, req.uid) : null
    });
  }
  const groups = db.prepare('SELECT g.*, m.role FROM groups g JOIN group_members m ON m.group_id=g.id AND m.user_id=?').all(req.uid);
  for (const g of groups) {
    const last = db.prepare('SELECT * FROM messages WHERE conv_type=? AND conv_id=? ORDER BY id DESC LIMIT 1').get('group', g.id);
    if (!last) continue;
    const read = db.prepare('SELECT * FROM conv_reads WHERE conv_type=? AND conv_id=? AND user_id=?').get('group', g.id, req.uid);
    const unread = last && last.sender_id !== req.uid ? db.prepare('SELECT COUNT(*) c FROM messages WHERE conv_type=? AND conv_id=? AND id>? AND sender_id != ?').get('group', g.id, read?.last_read_msg_id || 0, req.uid).c : 0;
    const memberIds = db.prepare('SELECT user_id FROM group_members WHERE group_id=?').all(g.id).map(r => r.user_id);
    list.push({
      convType: 'group', convId: g.id, name: g.name, avatar: g.avatar || '/uploads/official-group.svg',
      isOfficial: !!g.is_official, unread, muted: !!read?.muted, lastReadMsgId: read?.last_read_msg_id || 0,
      memberCount: memberIds.length, onlineCount: memberIds.filter(id => onlineUsers.has(id)).length,
      last: msgOut(last, req.uid)
    });
  }
  list.sort((a, b) => (b.last?.createdAt || 0) - (a.last?.createdAt || 0));
  res.json({ conversations: list });
});

function msgOut(m, viewerId) {
  const expired = m.one_time && m.sender_id !== viewerId && JSON.parse(m.expired_for || '[]').includes(viewerId);
  return {
    id: m.id, convType: m.conv_type, convId: m.conv_id, sender: pubUserById(m.sender_id),
    type: m.type, content: m.recalled ? '' : (expired ? '[内容已销毁]' : m.content),
    mediaUrl: m.recalled || expired ? '' : m.media_url,
    oneTime: !!m.one_time, expired, recalled: !!m.recalled, createdAt: m.created_at
  };
}

// ---------- MESSAGES ----------
app.get('/api/messages', auth, (req, res) => {
  const convType = req.query.convType, convId = Number(req.query.convId);
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const before = Number(req.query.before) || 0;
  if (convType === 'group' && !inGroup(convId, req.uid)) return res.status(403).json({ error: '不是群成员' });
  if (convType === 'private' && !areFriends(req.uid, convId)) return res.status(403).json({ error: '不是好友' });
  let rows;
  if (convType === 'private') {
    rows = before
      ? db.prepare(`SELECT * FROM messages WHERE conv_type='private' AND ${PRIV_THREAD} AND id<? ORDER BY id DESC LIMIT ?`).all(...privParams(req.uid, convId), before, limit)
      : db.prepare(`SELECT * FROM messages WHERE conv_type='private' AND ${PRIV_THREAD} ORDER BY id DESC LIMIT ?`).all(...privParams(req.uid, convId), limit);
  } else {
    rows = before
      ? db.prepare('SELECT * FROM messages WHERE conv_type=? AND conv_id=? AND id<? ORDER BY id DESC LIMIT ?').all(convType, convId, before, limit)
      : db.prepare('SELECT * FROM messages WHERE conv_type=? AND conv_id=? ORDER BY id DESC LIMIT ?').all(convType, convId, limit);
  }
  const msgs = rows.reverse().map(m => msgOut(m, req.uid));
  const reads = {};
  if (convType === 'group') {
    for (const r of db.prepare('SELECT user_id, last_read_msg_id FROM conv_reads WHERE conv_type=? AND conv_id=?').all('group', convId)) reads[r.user_id] = r.last_read_msg_id;
  } else {
    const canon = Math.min(convId, req.uid);
    reads[convId] = lastReadMsg('private', canon, convId);
  }
  res.json({ messages: msgs, reads, myLastRead: lastReadMsg(convType, Math.min(convId, req.uid), req.uid) });
});

app.post('/api/messages', auth, (req, res) => {
  const { convType, convId, type, content, mediaUrl, oneTime } = req.body || {};
  const result = handleMessageSend(req.uid, convType, Number(convId), type, String(content || ''), String(mediaUrl || ''), !!oneTime);
  if (result.error) return res.status(result.code || 400).json({ error: result.error });
  res.json({ message: result.message });
});

function handleMessageSend(uid, convType, convId, type, content, mediaUrl, oneTime) {
  if (!['text', 'image', 'video'].includes(type)) return { error: '不支持的消息类型' };
  let memberIds;
  if (convType === 'private') {
    if (!areFriends(uid, convId)) return { error: '对方不是你的好友' };
    memberIds = [uid, convId];
  } else {
    const me = inGroup(convId, uid);
    if (!me) return { error: '不是群成员' };
    if (me.muted_until > Date.now()) return { code: 403, error: `你已被禁言，剩余 ${Math.ceil((me.muted_until - Date.now()) / 60000)} 分钟` };
    memberIds = db.prepare('SELECT user_id FROM group_members WHERE group_id=?').all(convId).map(r => r.user_id);
  }
  const info = db.prepare('INSERT INTO messages (conv_type,conv_id,sender_id,type,content,media_url,one_time,expired_for,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(convType, convId, uid, type, content, mediaUrl, oneTime ? 1 : 0, '[]', Date.now());
  const m = db.prepare('SELECT * FROM messages WHERE id=?').get(info.lastInsertRowid);
  const message = msgOut(m, uid);
  broadcastMessage(message, memberIds);
  // AI in official group
  if (convType === 'group') {
    const g = db.prepare('SELECT * FROM groups WHERE id=?').get(convId);
    if (g?.is_official && type === 'text' && /@Jay\s?AI/i.test(content)) {
      handleAIReply(g, m);
    }
  }
  return { message };
}

async function handleAIReply(group, userMsg) {
  try {
    const sender = getUser(userMsg.sender_id);
    const rows = db.prepare('SELECT * FROM messages WHERE conv_type=? AND conv_id=? ORDER BY id DESC LIMIT 10').all('group', group.id).reverse();
    const history = rows.filter(r => !r.recalled).map(r => {
      const u = getUser(r.sender_id);
      return { role: u?.isBot ? 'assistant' : 'user', content: `${u ? u.username : '用户'}: ${r.content}` };
    });
    const reply = await ai.chat(history);
    const bot = db.prepare('SELECT * FROM users WHERE isBot=1').get();
    const info = db.prepare("INSERT INTO messages (conv_type,conv_id,sender_id,type,content,media_url,one_time,expired_for,created_at) VALUES (?,?,?,?,?,?,0,'[]',?)")
      .run('group', group.id, bot.id, 'text', `@${sender.username} ${reply}`, '', Date.now());
    const m = db.prepare('SELECT * FROM messages WHERE id=?').get(info.lastInsertRowid);
    const memberIds = db.prepare('SELECT user_id FROM group_members WHERE group_id=?').all(group.id).map(r => r.user_id);
    broadcastMessage(msgOut(m, 0), memberIds);
  } catch (e) {
    console.error('AI reply error:', e.message);
  }
}

app.post('/api/messages/:id/recall', auth, (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id=?').get(req.params.id);
  if (!m || m.sender_id !== req.uid) return res.status(403).json({ error: '只能撤回自己的消息' });
  if (Date.now() - m.created_at > 3 * 60 * 1000) return res.status(400).json({ error: '超过 3 分钟，无法撤回' });
  db.prepare("UPDATE messages SET recalled=1, content='', media_url='' WHERE id=?").run(m.id);
  const updated = msgOut(db.prepare('SELECT * FROM messages WHERE id=?').get(m.id), req.uid);
  let memberIds;
  if (m.conv_type === 'group') memberIds = db.prepare('SELECT user_id FROM group_members WHERE group_id=?').all(m.conv_id).map(r => r.user_id);
  else memberIds = [m.conv_id, m.sender_id];
  io.to(memberIds.map(id => 'user:' + id)).emit('message:update', updated);
  res.json({ ok: true });
});

app.post('/api/messages/:id/seen-once', auth, (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id=?').get(req.params.id);
  if (!m || !m.one_time || m.sender_id === req.uid) return res.json({ ok: true });
  const expired = JSON.parse(m.expired_for || '[]');
  if (!expired.includes(req.uid)) {
    expired.push(req.uid);
    db.prepare('UPDATE messages SET expired_for=? WHERE id=?').run(JSON.stringify(expired), m.id);
  }
  res.json({ ok: true });
});

app.get('/api/messages/:id/media', auth, (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id=?').get(req.params.id);
  if (!m || !m.media_url) return res.status(404).json({ error: '不存在' });
  const expired = JSON.parse(m.expired_for || '[]');
  const isSender = m.sender_id === req.uid;
  if (!isSender && expired.includes(req.uid)) return res.status(410).json({ error: '内容已销毁' });
  const file = path.join(UPLOAD_DIR, path.basename(m.media_url));
  if (!fs.existsSync(file)) return res.status(404).json({ error: '文件不存在' });
  if (!isSender && m.one_time && !expired.includes(req.uid)) {
    expired.push(req.uid);
    db.prepare('UPDATE messages SET expired_for=? WHERE id=?').run(JSON.stringify(expired), m.id);
  }
  res.sendFile(file);
});

// ---------- UPLOAD ----------
app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '上传失败' });
  res.json({ url: '/uploads/' + req.file.filename, name: req.file.originalname, size: req.file.size });
});

// ---------- STICKERS (Tenor proxy) ----------
const TENOR_KEY = 'LIVDSRZULELA';
app.get('/api/stickers/search', async (req, res) => {
  try {
    const q = req.query.q || 'trending';
    const r = await axios.get(`https://g.tenor.com/v1/search?q=${encodeURIComponent(q)}&key=${TENOR_KEY}&limit=30&media_filter=minimal`, { timeout: 10000 });
    const list = (r.data.results || []).map(x => ({
      id: x.id,
      preview: x.media?.[0]?.tinygif?.url || x.media?.[0]?.gif?.url,
      url: x.media?.[0]?.gif?.url || x.media?.[0]?.tinygif?.url
    })).filter(x => x.url);
    res.json({ stickers: list });
  } catch (e) {
    res.status(500).json({ error: '表情包服务暂时不可用' });
  }
});

// ---------- MOMENTS ----------
function momentVisible(m, viewerId) {
  if (m.deleted) return false;
  if (m.user_id === viewerId) return true;
  if (m.visibility === 'private') return false;
  const visibleTo = JSON.parse(m.visible_to || '[]');
  const hideFrom = JSON.parse(m.hide_from || '[]');
  if (hideFrom.includes(viewerId)) return false;
  if (m.visibility === 'visible') return visibleTo.includes(viewerId);
  return true;
}
function queryMoments(filterFn, viewerId) {
  const rows = db.prepare('SELECT * FROM moments ORDER BY id DESC LIMIT 200').all().filter(m => filterFn(m) && momentVisible(m, viewerId));
  return rows.map(m => momentOut(m, viewerId));
}
function momentOut(m, viewerId) {
  const likes = db.prepare('SELECT u.id, u.username, u.avatar FROM moment_likes l JOIN users u ON u.id=l.user_id WHERE l.moment_id=? ORDER BY l.id').all(m.id);
  const comments = db.prepare('SELECT * FROM moment_comments WHERE moment_id=? AND deleted=0 ORDER BY id').all(m.id)
    .map(c => ({ id: c.id, user: pubUserById(c.user_id), targetCommentId: c.target_comment_id, content: c.content, createdAt: c.created_at, canDelete: c.user_id === viewerId || m.user_id === viewerId }));
  return {
    id: m.id, user: pubUserById(m.user_id), content: m.content, media: JSON.parse(m.media || '[]'),
    visibility: m.visibility, createdAt: m.created_at,
    liked: likes.some(l => l.id === viewerId), likes, comments, isMine: m.user_id === viewerId
  };
}

app.post('/api/moments', auth, (req, res) => {
  const { content, media, visibility, visibleTo, hideFrom } = req.body || {};
  const med = Array.isArray(media) ? media.slice(0, 9) : [];
  if (!String(content || '').trim() && !med.length) return res.status(400).json({ error: '说点什么吧' });
  const id = db.prepare('INSERT INTO moments (user_id,content,media,visibility,visible_to,hide_from,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(req.uid, String(content || '').slice(0, 2000), JSON.stringify(med),
      ['public', 'private', 'visible', 'hide'].includes(visibility) ? visibility : 'public',
      JSON.stringify((visibleTo || []).map(Number)), JSON.stringify((hideFrom || []).map(Number)), Date.now()).lastInsertRowid;
  res.json({ ok: true, moment: momentOut(db.prepare('SELECT * FROM moments WHERE id=?').get(id), req.uid) });
});

app.get('/api/moments/feed', auth, (req, res) => {
  const scope = req.query.scope || 'all';
  if (scope === 'friends') {
    const friendIds = db.prepare('SELECT friend_id FROM friends WHERE user_id=?').all(req.uid).map(r => r.friend_id);
    res.json({ moments: queryMoments(m => friendIds.includes(m.user_id), req.uid) });
  } else {
    res.json({ moments: queryMoments(m => true, req.uid) });
  }
});

app.get('/api/moments/user/:id', auth, (req, res) => {
  const uid = Number(req.params.id);
  res.json({ moments: queryMoments(m => m.user_id === uid, req.uid) });
});

app.get('/api/moments/:id', auth, (req, res) => {
  const m = db.prepare('SELECT * FROM moments WHERE id=?').get(req.params.id);
  if (!m || !momentVisible(m, req.uid)) return res.status(404).json({ error: '动态不存在或不可见' });
  res.json({ moment: momentOut(m, req.uid) });
});

app.post('/api/moments/:id/like', auth, (req, res) => {
  const m = db.prepare('SELECT * FROM moments WHERE id=?').get(req.params.id);
  if (!m || m.deleted) return res.status(404).json({ error: '动态不存在' });
  const exist = db.prepare('SELECT * FROM moment_likes WHERE moment_id=? AND user_id=?').get(m.id, req.uid);
  if (exist) {
    db.prepare('DELETE FROM moment_likes WHERE id=?').run(exist.id);
    return res.json({ ok: true, liked: false });
  }
  db.prepare('INSERT INTO moment_likes (moment_id,user_id,created_at) VALUES (?,?,?)').run(m.id, req.uid, Date.now());
  if (m.user_id !== req.uid) notify(m.user_id, 'like', req.uid, 'moment', m.id, '赞了你的动态');
  res.json({ ok: true, liked: true });
});

app.delete('/api/moments/:id', auth, (req, res) => {
  const m = db.prepare('SELECT * FROM moments WHERE id=?').get(req.params.id);
  if (!m || m.user_id !== req.uid) return res.status(403).json({ error: '无权限' });
  db.prepare('UPDATE moments SET deleted=1 WHERE id=?').run(m.id);
  res.json({ ok: true });
});

app.post('/api/moments/:id/comments', auth, (req, res) => {
  const m = db.prepare('SELECT * FROM moments WHERE id=?').get(req.params.id);
  if (!m || m.deleted) return res.status(404).json({ error: '动态不存在' });
  const content = String(req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: '请输入评论内容' });
  let target = Number(req.body?.targetCommentId) || 0;
  if (target) {
    const t = db.prepare('SELECT * FROM moment_comments WHERE id=? AND moment_id=?').get(target, m.id);
    if (!t) target = 0;
  }
  const id = db.prepare('INSERT INTO moment_comments (moment_id,user_id,target_comment_id,content,created_at) VALUES (?,?,?,?,?)')
    .run(m.id, req.uid, target, content.slice(0, 500), Date.now()).lastInsertRowid;
  if (target) {
    const t = db.prepare('SELECT * FROM moment_comments WHERE id=?').get(target);
    if (t && t.user_id !== req.uid) notify(t.user_id, 'comment_reply', req.uid, 'moment', m.id, `回复了你的评论：${content.slice(0, 30)}`);
  } else if (m.user_id !== req.uid) {
    notify(m.user_id, 'comment', req.uid, 'moment', m.id, `评论了你的动态：${content.slice(0, 30)}`);
  }
  res.json({ ok: true, comment: { id, user: pubUserById(req.uid), targetCommentId: target, content, createdAt: Date.now(), canDelete: true } });
});

app.delete('/api/moments/comments/:id', auth, (req, res) => {
  const c = db.prepare('SELECT * FROM moment_comments WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: '评论不存在' });
  const m = db.prepare('SELECT * FROM moments WHERE id=?').get(c.moment_id);
  if (c.user_id !== req.uid && m.user_id !== req.uid) return res.status(403).json({ error: '无权限' });
  db.prepare('UPDATE moment_comments SET deleted=1 WHERE id=?').run(c.id);
  res.json({ ok: true });
});

// ---------- NOTIFICATIONS ----------
app.get('/api/notifications', auth, (req, res) => {
  const rows = db.prepare('SELECT n.*, u.username, u.avatar FROM notifications n JOIN users u ON u.id=n.actor_id WHERE n.user_id=? ORDER BY n.id DESC LIMIT 100').all(req.uid);
  res.json({
    notifications: rows.map(n => ({ id: n.id, type: n.type, actor: { id: n.actor_id, username: n.username, avatar: n.avatar }, refType: n.ref_type, refId: n.ref_id, content: n.content, isRead: !!n.is_read, createdAt: n.created_at }))
  });
});

app.get('/api/notifications/unread-count', auth, (req, res) => {
  res.json({ count: db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND is_read=0').get(req.uid).c });
});

app.post('/api/notifications/read', auth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.uid);
  res.json({ ok: true });
});

// friend request badge count
app.get('/api/friends/requests/count', auth, (req, res) => {
  res.json({ count: db.prepare("SELECT COUNT(*) c FROM friend_requests WHERE to_id=? AND status='pending'").get(req.uid).c });
});

// server info (client auto-detects node/php transport)
app.get('/api/server-info', (req, res) => {
  res.json({ type: 'node', version: '1.1.0', time: Date.now() });
});

// REST read receipt (parity with php mode)
app.post('/api/read', auth, (req, res) => {
  const { convType, convId, lastReadMsgId } = req.body || {};
  const type = convType === 'group' ? 'group' : 'private';
  const cid = Number(convId), last = Number(lastReadMsgId) || 0;
  const canon = type === 'private' ? Math.min(cid, req.uid) : cid;
  ensureReadRow(type, canon, req.uid);
  db.prepare('UPDATE conv_reads SET last_read_at=?, last_read_msg_id=? WHERE conv_type=? AND conv_id=? AND user_id=?')
    .run(Date.now(), last, type, canon, req.uid);
  res.json({ ok: true });
});

// ---------- SOCKET.IO ----------
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 10e6 });
const onlineUsers = new Map(); // uid -> Set(socketId)

function broadcastMessage(message, memberIds) {
  for (const id of memberIds) {
    io.to('user:' + id).emit('message:new', message);
  }
}

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    socket.uid = jwt.verify(token, JWT_SECRET).uid;
    next();
  } catch { next(new Error('unauthorized')); }
});

io.on('connection', (socket) => {
  const uid = socket.uid;
  if (!onlineUsers.has(uid)) {
    onlineUsers.set(uid, new Set());
    io.emit('presence:update', { userId: uid, online: true });
  }
  onlineUsers.get(uid).add(socket.id);
  socket.join('user:' + uid);
  const myGroups = db.prepare('SELECT group_id FROM group_members WHERE user_id=?').all(uid);
  for (const g of myGroups) socket.join('group:' + g.group_id);
  socket.emit('presence:snapshot', { online: [...onlineUsers.keys()] });

  socket.on('message:send', (data, ack) => {
    const { convType, convId, type, content, mediaUrl, oneTime } = data || {};
    const result = handleMessageSend(uid, convType, Number(convId), type, String(content || ''), String(mediaUrl || ''), !!oneTime);
    if (ack) ack(result.error ? { error: result.error } : { id: result.message.id, createdAt: result.message.createdAt });
  });

  socket.on('read', ({ convType, convId, lastReadMsgId }) => {
    convType = String(convType); convId = Number(convId); lastReadMsgId = Number(lastReadMsgId) || 0;
    const canonId = convType === 'private' ? Math.min(convId, uid) : convId;
    ensureReadRow(convType, canonId, uid);
    db.prepare('UPDATE conv_reads SET last_read_at=?, last_read_msg_id=? WHERE conv_type=? AND conv_id=? AND user_id=?')
      .run(Date.now(), lastReadMsgId, convType, canonId, uid);
    const payload = { convType, convId: canonId, userId: uid, lastReadMsgId, lastReadAt: Date.now() };
    if (convType === 'group') io.to('group:' + convId).emit('read:update', payload);
    else {
      io.to('user:' + convId).emit('read:update', payload);
      io.to('user:' + uid).emit('read:update', payload);
    }
  });

  socket.on('typing', ({ convType, convId }) => {
    if (convType === 'group') socket.to('group:' + convId).emit('typing', { userId: uid, convType, convId });
    else socket.to('user:' + convId).emit('typing', { userId: uid, convType, convId });
  });

  socket.on('disconnect', () => {
    const set = onlineUsers.get(uid);
    if (set) {
      set.delete(socket.id);
      if (!set.size) {
        onlineUsers.delete(uid);
        io.emit('presence:update', { userId: uid, online: false });
      }
    }
  });
});

seed();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Jay Chat server running on http://0.0.0.0:${PORT}`);
});
