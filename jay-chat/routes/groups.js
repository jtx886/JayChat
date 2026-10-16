// 群聊：创建 / 详情 / 编辑 / 邀请 / 踢人 / 角色 / 禁言 / 转让 / 退出 / 消息 / 在线
const express = require('express');
const router = express.Router();
const { db, markDirty } = require('../lib/db');
const { uid, now, fmtFull } = require('../lib/utils');
const { authMiddleware } = require('../lib/auth');
const presence = require('../lib/presence');
const { publicUser, userRoom, serializeMsg } = require('../socket');

function memberRole(groupId, userId) {
  const m = db.groupMembers.find((x) => x.groupId === groupId && x.userId === userId);
  return m ? m.role : null;
}
function isAdminLevel(groupId, userId) {
  const r = memberRole(groupId, userId);
  return r === 'owner' || r === 'admin';
}
function groupMemberUsers(groupId) {
  return db.groupMembers
    .filter((m) => m.groupId === groupId)
    .map((m) => {
      const u = db.users.find((x) => x.id === m.userId);
      return u ? {
        ...publicUser(u),
        role: m.role,
        mutedUntil: m.mutedUntil && m.mutedUntil > Date.now() ? m.mutedUntil : null,
        online: presence.isOnline(u.id),
        joinedAt: m.joinedAt,
      } : null;
    })
    .filter(Boolean);
}
function emitGroup(io, groupId, event, payload) {
  for (const m of db.groupMembers.filter((x) => x.groupId === groupId)) {
    io.to(userRoom(m.userId)).emit(event, payload);
  }
}
function ensureConv(group) {
  const convId = 'g_' + group.id;
  let conv = db.conversations.find((c) => c.id === convId);
  if (!conv) {
    conv = { id: convId, type: 'group', groupId: group.id, users: null, lastMsgAt: now(), lastMsg: null, createdAt: now() };
    db.conversations.push(conv);
  }
  return conv;
}

// 我的群列表
router.get('/', authMiddleware, (req, res) => {
  const groups = db.groupMembers
    .filter((m) => m.userId === req.user.id)
    .map((m) => {
      const g = db.groups.find((x) => x.id === m.groupId);
      if (!g) return null;
      return {
        id: g.id, name: g.name, avatar: g.avatar, isOfficial: !!g.isOfficial,
        ownerId: g.ownerId, memberCount: db.groupMembers.filter((x) => x.groupId === g.id).length,
        myRole: m.role, createdAt: g.createdAt,
      };
    })
    .filter(Boolean);
  res.json({ groups });
});

// 创建群聊
router.post('/', authMiddleware, (req, res) => {
  const { name, memberIds } = req.body || {};
  const gname = String(name || '').trim();
  if (!gname || gname.length > 20) return res.status(400).json({ error: '群名称为1-20个字符' });
  const validMembers = [...new Set((memberIds || []).filter((id) => id !== req.user.id && db.users.find((u) => u.id === id)))];
  if (validMembers.length === 0) return res.status(400).json({ error: '请至少选择1位好友' });

  const group = { id: uid(), name: gname, avatar: null, isOfficial: false, ownerId: req.user.id, createdAt: now() };
  db.groups.push(group);
  db.groupMembers.push({ groupId: group.id, userId: req.user.id, role: 'owner', mutedUntil: null, joinedAt: now() });
  for (const mid of validMembers) {
    db.groupMembers.push({ groupId: group.id, userId: mid, role: 'member', mutedUntil: null, joinedAt: now() });
  }
  ensureConv(group);
  markDirty();

  const io = req.app.get('io');
  if (io) {
    for (const mid of [req.user.id, ...validMembers]) {
      io.to(userRoom(mid)).emit('group:event', { type: 'created', groupId: group.id });
      io.in(userRoom(mid)).socketsJoin('conv:g_' + group.id);
    }
  }
  res.json({ ok: true, groupId: group.id });
});

// 群详情（成员列表按 首字母 排序：群主→管理员→成员）
router.get('/:id', authMiddleware, (req, res) => {
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: '群不存在' });
  if (!memberRole(group.id, req.user.id)) return res.status(403).json({ error: '你不在此群聊中' });
  const members = groupMemberUsers(group.id);
  const roleOrder = { owner: 0, admin: 1, member: 2 };
  members.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
  const onlineCount = members.filter((m) => m.online).length;
  res.json({
    group: {
      id: group.id, name: group.name, avatar: group.avatar, isOfficial: !!group.isOfficial,
      ownerId: group.ownerId, createdAt: group.createdAt,
      myRole: memberRole(group.id, req.user.id),
      members, memberCount: members.length, onlineCount,
    },
  });
});

// 编辑群名称/头像（群主、管理员）
router.post('/:id/info', authMiddleware, (req, res) => {
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: '群不存在' });
  if (!isAdminLevel(group.id, req.user.id)) return res.status(403).json({ error: '只有群主或管理员可以编辑群信息' });
  const { name, avatar } = req.body || {};
  if (name !== undefined) {
    const n = String(name).trim();
    if (!n || n.length > 20) return res.status(400).json({ error: '群名称为1-20个字符' });
    group.name = n;
  }
  if (avatar !== undefined) group.avatar = avatar || null;
  markDirty();
  const io = req.app.get('io');
  if (io) emitGroup(io, group.id, 'group:event', { type: 'updated', groupId: group.id, name: group.name, avatar: group.avatar });
  res.json({ ok: true });
});

// 邀请好友入群
router.post('/:id/invite', authMiddleware, (req, res) => {
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: '群不存在' });
  if (!memberRole(group.id, req.user.id)) return res.status(403).json({ error: '你不在此群聊中' });
  const { userIds } = req.body || {};
  const added = [];
  for (const mid of [...new Set(userIds || [])]) {
    if (!db.users.find((u) => u.id === mid)) continue;
    if (db.groupMembers.some((m) => m.groupId === group.id && m.userId === mid)) continue;
    db.groupMembers.push({ groupId: group.id, userId: mid, role: 'member', mutedUntil: null, joinedAt: now() });
    added.push(mid);
  }
  markDirty();
  const io = req.app.get('io');
  if (io) {
    for (const mid of added) {
      io.in(userRoom(mid)).socketsJoin('conv:g_' + group.id);
      io.to(userRoom(mid)).emit('group:event', { type: 'joined', groupId: group.id, by: publicUser(req.user) });
    }
    if (added.length) emitGroup(io, group.id, 'group:event', { type: 'members', groupId: group.id });
  }
  res.json({ ok: true, added });
});

// 踢人（群主/管理员；管理员不能踢管理员和群主）
router.post('/:id/kick', authMiddleware, (req, res) => {
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: '群不存在' });
  const myRole = memberRole(group.id, req.user.id);
  if (!isAdminLevel(group.id, req.user.id)) return res.status(403).json({ error: '只有群主或管理员可以移除成员' });
  const { userId } = req.body || {};
  const targetRole = memberRole(group.id, userId);
  if (!targetRole) return res.status(404).json({ error: '该用户不在群中' });
  if (targetRole === 'owner') return res.status(403).json({ error: '不能移除群主' });
  if (myRole === 'admin' && targetRole === 'admin') return res.status(403).json({ error: '管理员不能移除其他管理员' });
  db.groupMembers = db.groupMembers.filter((m) => !(m.groupId === group.id && m.userId === userId));
  markDirty();
  const io = req.app.get('io');
  if (io) {
    io.in(userRoom(userId)).socketsLeave('conv:g_' + group.id);
    io.to(userRoom(userId)).emit('group:event', { type: 'kicked', groupId: group.id, groupName: group.name });
    emitGroup(io, group.id, 'group:event', { type: 'members', groupId: group.id });
  }
  res.json({ ok: true });
});

// 设置/取消管理员（仅群主）
router.post('/:id/role', authMiddleware, (req, res) => {
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: '群不存在' });
  if (memberRole(group.id, req.user.id) !== 'owner') return res.status(403).json({ error: '只有群主可以设置管理员' });
  const { userId, role } = req.body || {};
  const m = db.groupMembers.find((x) => x.groupId === group.id && x.userId === userId);
  if (!m) return res.status(404).json({ error: '该用户不在群中' });
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: '无效角色' });
  if (m.role === 'owner') return res.status(403).json({ error: '不能变更群主角色' });
  m.role = role;
  markDirty();
  const io = req.app.get('io');
  if (io) {
    io.to(userRoom(userId)).emit('group:event', { type: role === 'admin' ? 'promoted' : 'demoted', groupId: group.id, groupName: group.name });
    emitGroup(io, group.id, 'group:event', { type: 'members', groupId: group.id });
  }
  res.json({ ok: true });
});

// 禁言成员（群主/管理员，自定义分钟数；管理员不能禁言管理员）
router.post('/:id/mute', authMiddleware, (req, res) => {
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: '群不存在' });
  const myRole = memberRole(group.id, req.user.id);
  if (!isAdminLevel(group.id, req.user.id)) return res.status(403).json({ error: '只有群主或管理员可以禁言' });
  const { userId, minutes } = req.body || {};
  const m = db.groupMembers.find((x) => x.groupId === group.id && x.userId === userId);
  if (!m) return res.status(404).json({ error: '该用户不在群中' });
  if (m.role === 'owner') return res.status(403).json({ error: '不能禁言群主' });
  if (myRole === 'admin' && m.role === 'admin') return res.status(403).json({ error: '管理员不能禁言其他管理员' });
  const mins = Number(minutes);
  if (!Number.isFinite(mins) || mins <= 0) return res.status(400).json({ error: '请输入有效的禁言时长（分钟）' });
  m.mutedUntil = now() + mins * 60 * 1000;
  markDirty();
  const io = req.app.get('io');
  if (io) {
    io.to(userRoom(userId)).emit('group:event', { type: 'muted', groupId: group.id, until: m.mutedUntil, untilText: fmtFull(m.mutedUntil) });
    emitGroup(io, group.id, 'group:event', { type: 'members', groupId: group.id });
  }
  res.json({ ok: true, mutedUntil: m.mutedUntil });
});

// 解除禁言
router.post('/:id/unmute', authMiddleware, (req, res) => {
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: '群不存在' });
  if (!isAdminLevel(group.id, req.user.id)) return res.status(403).json({ error: '只有群主或管理员可以解除禁言' });
  const { userId } = req.body || {};
  const m = db.groupMembers.find((x) => x.groupId === group.id && x.userId === userId);
  if (!m) return res.status(404).json({ error: '该用户不在群中' });
  m.mutedUntil = null;
  markDirty();
  const io = req.app.get('io');
  if (io) emitGroup(io, group.id, 'group:event', { type: 'members', groupId: group.id });
  res.json({ ok: true });
});

// 转让群主（仅群主）
router.post('/:id/transfer', authMiddleware, (req, res) => {
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: '群不存在' });
  if (memberRole(group.id, req.user.id) !== 'owner') return res.status(403).json({ error: '只有群主可以转让群主' });
  const { userId } = req.body || {};
  const m = db.groupMembers.find((x) => x.groupId === group.id && x.userId === userId);
  if (!m) return res.status(404).json({ error: '该用户不在群中' });
  const oldOwner = db.groupMembers.find((x) => x.groupId === group.id && x.role === 'owner');
  if (oldOwner) oldOwner.role = 'member';
  m.role = 'owner';
  group.ownerId = userId;
  markDirty();
  const io = req.app.get('io');
  if (io) {
    io.to(userRoom(userId)).emit('group:event', { type: 'transferred', groupId: group.id, groupName: group.name });
    emitGroup(io, group.id, 'group:event', { type: 'members', groupId: group.id });
  }
  res.json({ ok: true });
});

// 退出群聊（群主退出 = 解散群聊）
router.post('/:id/quit', authMiddleware, (req, res) => {
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: '群不存在' });
  const myRole = memberRole(group.id, req.user.id);
  if (!myRole) return res.status(403).json({ error: '你不在此群聊中' });
  const io = req.app.get('io');
  const isOwner = myRole === 'owner';

  if (isOwner) {
    // 解散
    const memberIds = db.groupMembers.filter((m) => m.groupId === group.id).map((m) => m.userId);
    db.groupMembers = db.groupMembers.filter((m) => m.groupId !== group.id);
    db.groups = db.groups.filter((g) => g.id !== group.id);
    db.conversations = db.conversations.filter((c) => c.id !== 'g_' + group.id);
    // 保留消息记录但不再可见；群聊从首页移除
    if (io) {
      for (const mid of memberIds) {
        io.in(userRoom(mid)).socketsLeave('conv:g_' + group.id);
        io.to(userRoom(mid)).emit('group:event', { type: 'dissolved', groupId: group.id, groupName: group.name });
      }
    }
  } else {
    db.groupMembers = db.groupMembers.filter((m) => !(m.groupId === group.id && m.userId === req.user.id));
    if (io) {
      io.in(userRoom(req.user.id)).socketsLeave('conv:g_' + group.id);
      io.to(userRoom(req.user.id)).emit('group:event', { type: 'quit', groupId: group.id });
      emitGroup(io, group.id, 'group:event', { type: 'members', groupId: group.id });
    }
  }
  markDirty();
  res.json({ ok: true, dissolved: isOwner });
});

// 群在线成员列表
router.get('/:id/online', authMiddleware, (req, res) => {
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: '群不存在' });
  if (!memberRole(group.id, req.user.id)) return res.status(403).json({ error: '你不在此群聊中' });
  const onlineMembers = groupMemberUsers(group.id).filter((m) => m.online);
  res.json({ online: onlineMembers, count: onlineMembers.length });
});

module.exports = router;
