// 好友：申请 / 列表 / 通过拒绝 / 备注 / 删除
const express = require('express');
const router = express.Router();
const { db, markDirty } = require('../lib/db');
const { uid, now } = require('../lib/utils');
const { authMiddleware } = require('../lib/auth');
const presence = require('../lib/presence');
const { publicUser, userRoom } = require('../socket');

function areFriends(a, b) {
  return db.friendships.some((f) => (f.userId === a && f.friendId === b) || (f.userId === b && f.friendId === a));
}

// 我的好友列表
router.get('/', authMiddleware, (req, res) => {
  const list = db.friendships
    .filter((f) => f.userId === req.user.id)
    .map((f) => {
      const u = db.users.find((x) => x.id === f.friendId);
      if (!u) return null;
      return {
        ...publicUser(u),
        remark: f.remark || '',
        online: presence.isOnline(u.id),
        muted: false,
      };
    })
    .filter(Boolean);
  res.json({ friends: list });
});

// 发送好友申请
router.post('/request', authMiddleware, (req, res) => {
  const { userId } = req.body || {};
  const target = db.users.find((u) => u.id === userId);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (target.id === req.user.id) return res.status(400).json({ error: '不能添加自己为好友' });
  if (areFriends(req.user.id, target.id)) return res.status(400).json({ error: '你们已经是好友了' });
  const pending = db.friendRequests.find(
    (r) => ((r.from === req.user.id && r.to === target.id) || (r.from === target.id && r.to === req.user.id)) && r.status === 'pending'
  );
  if (pending) return res.status(400).json({ error: '已有待处理的好友申请' });

  const request = { id: uid(), from: req.user.id, to: target.id, status: 'pending', createdAt: now() };
  db.friendRequests.push(request);
  markDirty();

  const io = req.app.get('io');
  if (io) io.to(userRoom(target.id)).emit('friend:request', { request: { ...request, fromUser: publicUser(req.user) } });
  res.json({ ok: true });
});

// 收到的好友申请列表
router.get('/requests', authMiddleware, (req, res) => {
  const list = db.friendRequests
    .filter((r) => r.to === req.user.id && r.status === 'pending')
    .map((r) => {
      const from = db.users.find((u) => u.id === r.from);
      return { ...r, fromUser: from ? publicUser(from) : null };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json({ requests: list });
});

// 通过 / 拒绝好友申请
router.post('/requests/:id', authMiddleware, (req, res) => {
  const { action } = req.body || {};
  const request = db.friendRequests.find((r) => r.id === req.params.id && r.to === req.user.id && r.status === 'pending');
  if (!request) return res.status(404).json({ error: '申请不存在或已处理' });
  if (!['accept', 'reject'].includes(action)) return res.status(400).json({ error: '无效操作' });
  request.status = action === 'accept' ? 'accepted' : 'rejected';

  if (action === 'accept') {
    // 双向好友关系（各自可设置备注）
    if (!db.friendships.some((f) => f.userId === request.to && f.friendId === request.from)) {
      db.friendships.push({ userId: request.to, friendId: request.from, remark: '' });
    }
    if (!db.friendships.some((f) => f.userId === request.from && f.friendId === request.to)) {
      db.friendships.push({ userId: request.from, friendId: request.to, remark: '' });
    }
  }
  markDirty();

  const io = req.app.get('io');
  if (io) {
    const from = db.users.find((u) => u.id === request.from);
    const to = db.users.find((u) => u.id === request.to);
    io.to(userRoom(request.from)).emit('friend:updated', {
      type: action === 'accept' ? 'accepted' : 'rejected',
      friend: publicUser(to),
      online: presence.isOnline(to.id),
    });
    if (action === 'accept') {
      io.to(userRoom(request.to)).emit('friend:updated', {
        type: 'accepted', friend: publicUser(from), online: presence.isOnline(from.id),
      });
    }
  }
  res.json({ ok: true });
});

// 设置好友备注
router.post('/remark', authMiddleware, (req, res) => {
  const { friendId, remark } = req.body || {};
  const f = db.friendships.find((x) => x.userId === req.user.id && x.friendId === friendId);
  if (!f) return res.status(404).json({ error: '对方不是你的好友' });
  f.remark = String(remark || '').slice(0, 20);
  markDirty();
  res.json({ ok: true, remark: f.remark });
});

// 删除好友
router.delete('/:friendId', authMiddleware, (req, res) => {
  const friendId = req.params.friendId;
  if (!areFriends(req.user.id, friendId)) return res.status(404).json({ error: '对方不是你的好友' });
  db.friendships = db.friendships.filter(
    (f) => !((f.userId === req.user.id && f.friendId === friendId) || (f.userId === friendId && f.friendId === req.user.id))
  );
  markDirty();
  const io = req.app.get('io');
  if (io) io.to(userRoom(friendId)).emit('friend:updated', { type: 'deleted', friend: publicUser(req.user) });
  res.json({ ok: true });
});

module.exports = router;
