// 消息：会话列表 / 私聊会话 / 历史消息 / 一次性查看
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { db, markDirty, UPLOAD_DIR } = require('../lib/db');
const { uid, now } = require('../lib/utils');
const { authMiddleware } = require('../lib/auth');
const presence = require('../lib/presence');
const { publicUser, serializeMsg } = require('../socket');

function dmConvId(a, b) {
  return 'dm_' + [a, b].sort().join('_');
}
function myConvs(userId) {
  const groupIds = db.groupMembers.filter((m) => m.userId === userId).map((m) => m.groupId);
  return db.conversations.filter((c) =>
    (c.type === 'dm' && c.users && c.users.includes(userId)) ||
    (c.type === 'group' && groupIds.includes(c.groupId))
  );
}
function unreadCount(convId, userId) {
  return db.messages.filter(
    (m) => m.convId === convId && m.senderId !== userId && !m.readBy.includes(userId) && !m.deletedBy.includes(userId)
  ).length;
}
function friendRemark(userId, friendId) {
  const f = db.friendships.find((x) => x.userId === userId && x.friendId === friendId);
  return f ? f.remark || '' : '';
}

// 首页会话列表
router.get('/convos', authMiddleware, (req, res) => {
  const me = req.user.id;
  const convs = myConvs(me)
    .sort((a, b) => (b.lastMsgAt || 0) - (a.lastMsgAt || 0))
    .map((c) => {
      if (c.type === 'group') {
        const g = db.groups.find((x) => x.id === c.groupId);
        if (!g) return null;
        const members = db.groupMembers.filter((m) => m.groupId === g.id);
        const onlineCount = members.filter((m) => presence.isOnline(m.userId)).length;
        return {
          convId: c.id, type: 'group', groupId: g.id,
          name: g.name, avatar: g.avatar, isOfficial: !!g.isOfficial,
          memberCount: members.length, onlineCount,
          lastMsg: c.lastMsg, lastMsgAt: c.lastMsgAt, unread: unreadCount(c.id, me),
        };
      }
      const otherId = c.users.find((u) => u !== me);
      const other = db.users.find((u) => u.id === otherId);
      if (!other) return null;
      return {
        convId: c.id, type: 'dm', userId: other.id,
        name: friendRemark(me, other.id) || other.username,
        rawName: other.username,
        avatar: other.avatar, isOfficial: !!other.isOfficial,
        online: presence.isOnline(other.id), lastSeenAt: other.lastSeenAt,
        lastMsg: c.lastMsg, lastMsgAt: c.lastMsgAt, unread: unreadCount(c.id, me),
      };
    })
    .filter(Boolean);
  res.json({ convos });
});

// 获取或创建与某用户的私聊会话
router.get('/dm/:userId', authMiddleware, (req, res) => {
  const other = db.users.find((u) => u.id === req.params.userId);
  if (!other) return res.status(404).json({ error: '用户不存在' });
  const id = dmConvId(req.user.id, other.id);
  let conv = db.conversations.find((c) => c.id === id);
  if (!conv) {
    conv = { id, type: 'dm', users: [req.user.id, other.id].sort(), groupId: null, lastMsgAt: now(), lastMsg: null, createdAt: now() };
    db.conversations.push(conv);
    markDirty();
  }
  res.json({
    convId: id,
    user: {
      ...publicUser(other),
      online: presence.isOnline(other.id),
      lastSeenAt: other.lastSeenAt,
      remark: friendRemark(req.user.id, other.id),
      isFriend: db.friendships.some((f) => f.userId === req.user.id && f.friendId === other.id),
    },
  });
});

// 历史消息（私聊与群聊通用）
router.get('/conv/:convId/messages', authMiddleware, (req, res) => {
  const conv = db.conversations.find((c) => c.id === req.params.convId);
  if (!conv) return res.status(404).json({ error: '会话不存在' });
  const mine = myConvs(req.user.id);
  if (!mine.some((c) => c.id === conv.id)) return res.status(403).json({ error: '无权访问该会话' });
  const before = Number(req.query.before || 0);
  let list = db.messages.filter((m) => m.convId === conv.id);
  if (before) list = list.filter((m) => m.createdAt < before);
  list = list.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
  const messages = list
    .filter((m) => !m.deletedBy.includes(req.user.id))
    .map((m) => serializeMsg(m, req.user.id))
    .reverse();
  res.json({ messages, hasMore: list.length === 50 });
});

// 一次性查看
router.post('/msg/:msgId/view', authMiddleware, (req, res) => {
  const msg = db.messages.find((m) => m.id === req.params.msgId);
  if (!msg) return res.status(404).json({ error: '消息不存在' });
  const conv = db.conversations.find((c) => c.id === msg.convId);
  if (!conv || !myConvs(req.user.id).some((c) => c.id === conv.id)) {
    return res.status(403).json({ error: '无权查看' });
  }
  if (msg.senderId === req.user.id) {
    return res.json({ ok: true, url: '/api/media/' + msg.id, type: msg.type });
  }
  if (!msg.viewOnce) return res.status(400).json({ error: '该消息无需一次性查看' });
  if (msg.destroyedBy.includes(req.user.id)) {
    return res.status(410).json({ error: '该内容已销毁，只能查看一次' });
  }
  msg.destroyedBy.push(req.user.id);
  markDirty();
  res.json({ ok: true, url: '/api/media/' + msg.id, type: msg.type });
});

// 一次性媒体内容（需登录且为会话成员）
router.get('/media/:msgId', authMiddleware, (req, res) => {
  const msg = db.messages.find((m) => m.id === req.params.msgId);
  if (!msg || !msg.viewOnce) return res.status(404).end();
  const conv = db.conversations.find((c) => c.id === msg.convId);
  if (!conv || !myConvs(req.user.id).some((c) => c.id === conv.id)) {
    return res.status(403).end();
  }
  const file = String(msg.content || '').replace(/^once:/, '');
  const safe = path.basename(file);
  const fp = path.join(UPLOAD_DIR, 'once', safe);
  if (!fs.existsSync(fp)) return res.status(404).end();
  const mime = safe.endsWith('.mp4') ? 'video/mp4' : safe.endsWith('.webm') ? 'video/webm'
    : safe.endsWith('.png') ? 'image/png' : safe.endsWith('.webp') ? 'image/webp'
    : safe.endsWith('.gif') ? 'image/gif' : 'image/jpeg';
  res.setHeader('Content-Type', mime);
  fs.createReadStream(fp).pipe(res);
});

module.exports = router;
