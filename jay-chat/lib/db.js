// JSON 文件数据库（内存 + 防抖落盘）
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(path.join(UPLOAD_DIR, 'once'))) fs.mkdirSync(path.join(UPLOAD_DIR, 'once'), { recursive: true });
}

const empty = () => ({
  users: [],
  codes: [],          // {email, code, purpose, expiresAt, used}
  friendRequests: [], // {id, from, to, status, createdAt}
  friendships: [],    // {userId, friendId, remark}
  groups: [],         // {id, name, avatar, isOfficial, ownerId, createdAt}
  groupMembers: [],   // {groupId, userId, role, mutedUntil, joinedAt}
  conversations: [],  // {id, type, users, groupId, lastMsgAt, lastMsg, createdAt}
  messages: [],       // {id, convId, senderId, type, content, viewOnce, recalled, recalledAt, readBy, destroyedBy, deletedBy, createdAt}
  moments: [],        // {id, userId, text, media, visibility, visibleTo, hiddenFrom, likes, comments, deleted, createdAt}
  secret: null,
});

let db = empty();
let dirty = false;
let saveTimer = null;

function load() {
  ensureDirs();
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      const defaults = empty();
      for (const key of Object.keys(defaults)) {
        if (raw[key] !== undefined) db[key] = raw[key];
      }
    }
  } catch (e) {
    console.error('DB load failed, starting fresh:', e.message);
  }
  if (!db.secret) {
    db.secret = require('crypto').randomBytes(32).toString('hex');
    markDirty();
  }
}

function markDirty() {
  dirty = true;
  if (!saveTimer) {
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveNow();
    }, 1000);
  }
}

function saveNow() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
    dirty = false;
  } catch (e) {
    console.error('DB save failed:', e.message);
  }
}

// 定期落盘兜底
setInterval(() => { if (dirty) saveNow(); }, 5000);
process.on('exit', () => saveNow());

module.exports = { db, load, markDirty, saveNow, UPLOAD_DIR, DB_FILE };
