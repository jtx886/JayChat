// Socket.IO 实时通信：消息收发/已读/撤回/在线状态/事件推送
const { db, markDirty } = require('./lib/db');
const { uid, now, fmtFull } = require('./lib/utils');
const { getUserFromToken, isBanned, isGlobalMuted } = require('./lib/auth');
const { summarizeMsg, joinOfficialGroup } = require('./lib/seed');
const presence = require('./lib/presence');

function userRoom(userId) { return 'user:' + userId; }
function convRoom(convId) { return 'conv:' + convId; }

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, username: u.username, avatar: u.avatar, isOfficial: !!u.isOfficial,
    role: u.role, lastSeenAt: u.lastSeenAt || null,
  };
}

function getMyConvs(userId) {
  const groupIds = db.groupMembers.filter((m) => m.userId === userId).map((m) => m.groupId);
  return db.conversations.filter((c) =>
    (c.type === 'dm' && c.users && c.users.includes(userId)) ||
    (c.type === 'group' && groupIds.includes(c.groupId))
  );
}

function initSocket(io) {
  // 连接鉴权
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    const user = token ? getUserFromToken(token) : null;
    if (!user) return next(new Error('unauthorized'));
    if (isBanned(user)) return next(new Error('banned'));
    socket.userId = user.id;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    const user = db.users.find((u) => u.id === userId);
    user.lastSeenAt = now();

    // 加入个人房间 + 所有会话房间
    socket.join(userRoom(userId));
    for (const c of getMyConvs(userId)) socket.join(convRoom(c.id));

    const firstOnline = presence.connect(userId, socket.id);
    if (firstOnline) {
      io.emit('presence', { userId, online: true, lastSeenAt: user.lastSeenAt });
      markDirty();
    }

    socket.on('join:conv', (convId) => {
      const c = db.conversations.find((x) => x.id === convId);
      if (c && getMyConvs(userId).some((m) => m.id === convId)) socket.join(convRoom(convId));
    });

    // ---------- 发送消息 ----------
    socket.on('msg:send', (data, ack) => {
      const me = db.users.find((u) => u.id === userId);
      const { convId, type, content, viewOnce } = data || {};
      if (isBanned(me)) return ack && ack({ error: '账号已被封禁' });
      const conv = db.conversations.find((c) => c.id === convId);
      if (!conv) return ack && ack({ error: '会话不存在' });
      const myConvs = getMyConvs(userId);
      if (!myConvs.some((c) => c.id === convId)) return ack && ack({ error: '你不在此会话中' });

      // 禁言检查
      if (isGlobalMuted(me)) {
        return ack && ack({ error: `你已被管理员禁言至 ${fmtFull(me.globalMutedUntil)}` });
      }
      if (conv.type === 'group') {
        const member = db.groupMembers.find((m) => m.groupId === conv.groupId && m.userId === userId);
        if (member && member.mutedUntil && member.mutedUntil > Date.now()) {
          return ack && ack({ error: `你已被群主/管理员禁言至 ${fmtFull(member.mutedUntil)}` });
        }
      }

      const validTypes = ['text', 'image', 'video', 'sticker'];
      if (!validTypes.includes(type)) return ack && ack({ error: '不支持的消息类型' });
      if (type === 'text' && (!content || !String(content).trim())) return ack && ack({ error: '消息不能为空' });
      if ((type === 'image' || type === 'video' || type === 'sticker') && !content) {
        return ack && ack({ error: '媒体内容缺失' });
      }
      if (String(content || '').length > 60000) return ack && ack({ error: '内容过长' });

      const msg = {
        id: uid(),
        convId,
        senderId: userId,
        type,
        content: String(content || '').slice(0, 60000),
        viewOnce: !!viewOnce && (type === 'image' || type === 'video'),
        recalled: false,
        readBy: [],
        destroyedBy: [],
        deletedBy: [],
        createdAt: now(),
      };
      db.messages.push(msg);
      conv.lastMsgAt = msg.createdAt;
      conv.lastMsg = summarizeMsg(msg);
      markDirty();

      // 推送给会话所有成员（按成员身份分发，viewOnce 内容控制）
      const memberIds = convMemberIds(conv);
      for (const mid of memberIds) {
        const m = serializeMsg(msg, mid);
        io.to(userRoom(mid)).emit('msg:new', { convId, msg: m });
      }
      // 会话列表摘要更新
      const summary = {
        convId,
        lastMsgAt: conv.lastMsgAt,
        lastMsg: conv.lastMsg,
      };
      for (const mid of memberIds) io.to(userRoom(mid)).emit('conv:update', summary);
      if (ack) ack({ ok: true, msg: safeMsg });
    });

    // ---------- 已读 ----------
    socket.on('msg:read', ({ convId }) => {
      const conv = db.conversations.find((c) => c.id === convId);
      if (!conv) return;
      const myConvs = getMyConvs(userId);
      if (!myConvs.some((c) => c.id === convId)) return;
      const updated = [];
      for (const m of db.messages) {
        if (m.convId === convId && m.senderId !== userId && !m.readBy.includes(userId)) {
          m.readBy.push(userId);
          updated.push(m.id);
        }
      }
      if (updated.length) {
        markDirty();
        const memberIds = convMemberIds(conv);
        for (const mid of memberIds) {
          io.to(userRoom(mid)).emit('msg:read', { convId, userId, msgIds: updated });
        }
      }
    });

    // ---------- 撤回（3分钟内） ----------
    socket.on('msg:recall', ({ msgId }, ack) => {
      const msg = db.messages.find((m) => m.id === msgId);
      if (!msg) return ack && ack({ error: '消息不存在' });
      if (msg.senderId !== userId) return ack && ack({ error: '只能撤回自己的消息' });
      if (msg.recalled) return ack && ack({ error: '消息已撤回' });
      if (Date.now() - msg.createdAt > 3 * 60 * 1000) {
        return ack && ack({ error: '发送超过3分钟的消息不能撤回' });
      }
      msg.recalled = true;
      msg.recalledAt = now();
      const conv = db.conversations.find((c) => c.id === msg.convId);
      if (conv) {
        conv.lastMsg = summarizeMsg(msg);
        const memberIds = convMemberIds(conv);
        for (const mid of memberIds) io.to(userRoom(mid)).emit('msg:recalled', { convId: msg.convId, msgId });
      }
      markDirty();
      if (ack) ack({ ok: true });
    });

    // ---------- 删除（仅自己可见移除） ----------
    socket.on('msg:delete', ({ msgId }, ack) => {
      const msg = db.messages.find((m) => m.id === msgId);
      if (!msg) return ack && ack({ error: '消息不存在' });
      if (!msg.deletedBy.includes(userId)) msg.deletedBy.push(userId);
      markDirty();
      if (ack) ack({ ok: true });
    });

    // ---------- 打字状态（可选） ----------
    socket.on('typing', ({ convId, typing }) => {
      const conv = db.conversations.find((c) => c.id === convId);
      if (!conv) return;
      socket.to(convRoom(convId)).emit('typing', { convId, userId, typing: !!typing });
    });

    socket.on('disconnect', () => {
      const fullyOffline = presence.disconnect(userId, socket.id);
      if (fullyOffline) {
        const u = db.users.find((x) => x.id === userId);
        const lastSeenAt = now();
        if (u) u.lastSeenAt = lastSeenAt;
        io.emit('presence', { userId, online: false, lastSeenAt });
        markDirty();
      }
    });
  });

  console.log('[socket] 实时通信已就绪');
}

function convMemberIds(conv) {
  if (conv.type === 'dm') return conv.users;
  return db.groupMembers.filter((m) => m.groupId === conv.groupId).map((m) => m.userId);
}

// 按查看者身份序列化消息（一次性查看内容控制）
function serializeMsg(msg, viewerId) {
  const isSender = msg.senderId === viewerId;
  const deleted = msg.deletedBy.includes(viewerId);
  const base = {
    id: msg.id, convId: msg.convId, senderId: msg.senderId, type: msg.type,
    viewOnce: msg.viewOnce, recalled: msg.recalled, createdAt: msg.createdAt,
    readBy: msg.readBy, deleted,
  };
  if (msg.recalled) return { ...base, content: '' };
  if (msg.viewOnce) {
    // 发送者可反复查看；接收者需走一次性查看接口
    if (isSender) return { ...base, content: '/api/media/' + msg.id, destroyed: false };
    const destroyed = msg.destroyedBy.includes(viewerId);
    return { ...base, content: null, destroyed, needView: !destroyed };
  }
  return { ...base, content: msg.content, destroyed: false };
}

module.exports = { initSocket, serializeMsg, convMemberIds, publicUser, userRoom, convRoom };
