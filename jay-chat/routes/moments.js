// 动态：发布 / 社区流 / 用户动态 / 点赞 / 评论 / 删除
const express = require('express');
const router = express.Router();
const { db, markDirty } = require('../lib/db');
const { uid, now } = require('../lib/utils');
const { authMiddleware } = require('../lib/auth');
const { publicUser } = require('../socket');

function isFriend(a, b) {
  return db.friendships.some((f) => (f.userId === a && f.friendId === b) || (f.userId === b && f.friendId === a));
}

function visibleToMe(m, meId) {
  if (m.deleted) return false;
  if (m.userId === meId) return true;
  switch (m.visibility) {
    case 'public': return !m.hiddenFrom.includes(meId);
    case 'private': return isFriend(m.userId, meId); // 好友动态页可见私密
    case 'friends': return m.visibleTo.includes(meId) && isFriend(m.userId, meId);
    case 'exclude': return !m.hiddenFrom.includes(meId);
    default: return false;
  }
}

function serializeMoment(m, meId) {
  const u = db.users.find((x) => x.id === m.userId);
  const myLike = m.likes.includes(meId);
  return {
    id: m.id, userId: m.userId,
    user: publicUser(u),
    text: m.text,
    media: m.media,
    visibility: m.visibility,
    likeCount: m.likes.length, liked: myLike,
    commentCount: m.comments.length,
    comments: m.comments.slice(-5).map((c) => {
      const cu = db.users.find((x) => x.id === c.userId);
      return { ...c, user: publicUser(cu) };
    }),
    createdAt: m.createdAt,
  };
}

// 发布动态
router.post('/', authMiddleware, (req, res) => {
  const { text, media, visibility, visibleTo, hiddenFrom } = req.body || {};
  const t = String(text || '').trim();
  if (!t && (!media || media.length === 0)) {
    return res.status(400).json({ error: '请写点什么或添加图片/视频' });
  }
  if (t.length > 2000) return res.status(400).json({ error: '文字太长了' });
  const vis = ['public', 'private', 'friends', 'exclude'].includes(visibility) ? visibility : 'public';
  const validMedia = (media || []).slice(0, 9).filter((x) => x && (x.type === 'image' || x.type === 'video') && x.url);
  if (t.length === 0 && validMedia.length === 0) return res.status(400).json({ error: '内容不能为空' });
  const moment = {
    id: uid(),
    userId: req.user.id,
    text: t,
    media: validMedia,
    visibility: vis,
    visibleTo: Array.isArray(visibleTo) ? visibleTo.slice(0, 100) : [],
    hiddenFrom: Array.isArray(hiddenFrom) ? hiddenFrom.slice(0, 100) : [],
    likes: [],
    comments: [],
    deleted: false,
    createdAt: now(),
  };
  db.moments.push(moment);
  markDirty();
  res.json({ ok: true, moment: serializeMoment(moment, req.user.id) });
});

// 社区流：所有人可见的动态（大社区）
router.get('/feed', authMiddleware, (req, res) => {
  const list = db.moments
    .filter((m) => visibleToMe(m, req.user.id))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 100)
    .map((m) => serializeMoment(m, req.user.id));
  res.json({ moments: list });
});

// 某用户的所有动态（好友可看私密；非好友只看公开）
router.get('/user/:userId', authMiddleware, (req, res) => {
  const target = db.users.find((u) => u.id === req.params.userId);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  const isMe = target.id === req.user.id;
  const friend = isFriend(req.user.id, target.id);
  const list = db.moments
    .filter((m) => {
      if (m.deleted || m.userId !== target.id) return false;
      if (isMe) return true;
      if (friend) return true; // 好友可见所有动态（含私密）
      // 非好友：仅公开类
      if (m.visibility === 'public' || m.visibility === 'exclude') return !m.hiddenFrom.includes(req.user.id);
      if (m.visibility === 'friends') return m.visibleTo.includes(req.user.id);
      return false;
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((m) => serializeMoment(m, req.user.id));
  res.json({ moments: list, user: publicUser(target) });
});

// 动态详情（含全部评论）
router.get('/:id', authMiddleware, (req, res) => {
  const m = db.moments.find((x) => x.id === req.params.id);
  if (!m || !visibleToMe(m, req.user.id)) return res.status(404).json({ error: '动态不存在' });
  const detail = serializeMoment(m, req.user.id);
  detail.comments = m.comments.map((c) => {
    const cu = db.users.find((x) => x.id === c.userId);
    return { ...c, user: publicUser(cu) };
  });
  res.json({ moment: detail });
});

// 点赞 / 取消点赞
router.post('/:id/like', authMiddleware, (req, res) => {
  const m = db.moments.find((x) => x.id === req.params.id);
  if (!m || !visibleToMe(m, req.user.id)) return res.status(404).json({ error: '动态不存在' });
  const idx = m.likes.indexOf(req.user.id);
  if (idx >= 0) m.likes.splice(idx, 1);
  else m.likes.push(req.user.id);
  markDirty();
  res.json({ ok: true, liked: idx < 0, likeCount: m.likes.length });
});

// 评论
router.post('/:id/comment', authMiddleware, (req, res) => {
  const m = db.moments.find((x) => x.id === req.params.id);
  if (!m || !visibleToMe(m, req.user.id)) return res.status(404).json({ error: '动态不存在' });
  const text = String((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: '评论不能为空' });
  if (text.length > 500) return res.status(400).json({ error: '评论太长了' });
  const comment = { id: uid(), userId: req.user.id, text, createdAt: now() };
  m.comments.push(comment);
  markDirty();
  res.json({ ok: true, comment: { ...comment, user: publicUser(req.user) }, commentCount: m.comments.length });
});

// 删除动态（仅本人）
router.delete('/:id', authMiddleware, (req, res) => {
  const m = db.moments.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: '动态不存在' });
  if (m.userId !== req.user.id) return res.status(403).json({ error: '只能删除自己的动态' });
  m.deleted = true;
  markDirty();
  res.json({ ok: true });
});

module.exports = router;
