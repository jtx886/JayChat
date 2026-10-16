// 启动种子：官方账号 + 官方群聊
const { db, markDirty } = require('./db');
const { uid, now } = require('./utils');
const { hashPassword } = require('./auth');

const OFFICIAL_EMAIL = 'xujszjjzjzjxhxhh@qq.com';
const OFFICIAL_USERNAME = '杰同学';
const OFFICIAL_PASSWORD = '101113';
const OFFICIAL_GROUP_NAME = 'Jay Chat官方群';

function ensureOfficial() {
  let official = db.users.find((u) => u.email === OFFICIAL_EMAIL);
  if (!official) {
    official = {
      id: uid(),
      username: OFFICIAL_USERNAME,
      email: OFFICIAL_EMAIL,
      passwordHash: hashPassword(OFFICIAL_PASSWORD),
      avatar: null,
      role: 'admin',
      isOfficial: true,
      bannedUntil: null,
      globalMutedUntil: null,
      renameLog: [],
      createdAt: now(),
      lastSeenAt: now(),
    };
    db.users.push(official);
    console.log('[seed] 官方账号已创建: 杰同学');
  } else {
    official.role = 'admin';
    official.isOfficial = true;
  }

  let group = db.groups.find((g) => g.isOfficial);
  if (!group) {
    group = {
      id: uid(),
      name: OFFICIAL_GROUP_NAME,
      avatar: null, // 前端渲染官方蓝色✔专属logo
      isOfficial: true,
      ownerId: official.id,
      createdAt: now(),
    };
    db.groups.push(group);
    db.groupMembers.push({
      groupId: group.id, userId: official.id, role: 'owner', mutedUntil: null, joinedAt: now(),
    });
    console.log('[seed] 官方群聊已创建: Jay Chat官方群');
  }

  markDirty();
  return { official, group };
}

function joinOfficialGroup(userId) {
  const group = db.groups.find((g) => g.isOfficial);
  if (!group) return;
  const exists = db.groupMembers.find((m) => m.groupId === group.id && m.userId === userId);
  if (exists) return;
  db.groupMembers.push({ groupId: group.id, userId, role: 'member', mutedUntil: null, joinedAt: now() });
  // 官方欢迎消息
  const convId = 'g_' + group.id;
  let conv = db.conversations.find((c) => c.id === convId);
  if (!conv) {
    conv = { id: convId, type: 'group', groupId: group.id, users: null, lastMsgAt: now(), lastMsg: null, createdAt: now() };
    db.conversations.push(conv);
  }
  const user = db.users.find((u) => u.id === userId);
  const msg = {
    id: uid(),
    convId,
    senderId: group.ownerId,
    type: 'text',
    content: `欢迎 ${user ? user.username : '新朋友'} 加入 Jay Chat官方群！在这里可以和所有小伙伴畅聊，有任何问题都可以找我哦～`,
    viewOnce: false,
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
}

function summarizeMsg(msg) {
  let preview = msg.content || '';
  if (msg.type === 'image') preview = '[图片]';
  else if (msg.type === 'video') preview = '[视频]';
  else if (msg.type === 'sticker') preview = '[表情]';
  if (msg.viewOnce) preview = '[一次性查看] ' + preview;
  if (msg.recalled) preview = '撤回了一条消息';
  return { senderId: msg.senderId, type: msg.type, preview, viewOnce: msg.viewOnce, recalled: msg.recalled, createdAt: msg.createdAt };
}

module.exports = { ensureOfficial, joinOfficialGroup, summarizeMsg, OFFICIAL_GROUP_NAME };
