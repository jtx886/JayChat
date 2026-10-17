const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'jaychat.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  avatar TEXT DEFAULT '',
  isBot INTEGER DEFAULT 0,
  isOfficial INTEGER DEFAULT 0,
  name_changes TEXT DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS friend_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS friends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  remark TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, friend_id)
);
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  avatar TEXT DEFAULT '',
  owner_id INTEGER NOT NULL,
  is_official INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT DEFAULT 'member',
  muted_until INTEGER DEFAULT 0,
  joined_at INTEGER NOT NULL,
  UNIQUE(group_id, user_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conv_type TEXT NOT NULL,
  conv_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  content TEXT DEFAULT '',
  media_url TEXT DEFAULT '',
  one_time INTEGER DEFAULT 0,
  expired_for TEXT DEFAULT '[]',
  recalled INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conv_type, conv_id, id);
CREATE TABLE IF NOT EXISTS conv_reads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conv_type TEXT NOT NULL,
  conv_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  last_read_at INTEGER DEFAULT 0,
  last_read_msg_id INTEGER DEFAULT 0,
  UNIQUE(conv_type, conv_id, user_id)
);
CREATE TABLE IF NOT EXISTS moments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  content TEXT DEFAULT '',
  media TEXT DEFAULT '[]',
  visibility TEXT DEFAULT 'public',
  visible_to TEXT DEFAULT '[]',
  hide_from TEXT DEFAULT '[]',
  deleted INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS moment_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  moment_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(moment_id, user_id)
);
CREATE TABLE IF NOT EXISTS moment_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  moment_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  target_comment_id INTEGER DEFAULT 0,
  content TEXT NOT NULL,
  deleted INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  actor_id INTEGER NOT NULL,
  ref_type TEXT DEFAULT '',
  ref_id INTEGER DEFAULT 0,
  content TEXT DEFAULT '',
  is_read INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
`);

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}
function makeUser(username, email, password, opts = {}) {
  const salt = crypto.randomBytes(16).toString('hex');
  const info = db.prepare(
    `INSERT INTO users (username,email,password_hash,salt,avatar,isBot,isOfficial,created_at) VALUES (?,?,?,?,?,?,?,?)`
  ).run(username, email, hashPassword(password, salt), salt, opts.avatar || '', opts.isBot ? 1 : 0, opts.isOfficial ? 1 : 0, Date.now());
  return info.lastInsertRowid;
}

// ---- Seed official account & official group ----
function seed() {
  const OFFICIAL_EMAIL = 'xujszjjzjzjxhxhh@qq.com';
  let official = db.prepare('SELECT * FROM users WHERE email=?').get(OFFICIAL_EMAIL);
  if (!official) {
    const id = makeUser('杰同学', OFFICIAL_EMAIL, '101113', { isOfficial: 1, avatar: '/uploads/official-avatar.svg' });
    official = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  }
  let group = db.prepare('SELECT * FROM groups WHERE is_official=1').get();
  if (!group) {
    const gid = db.prepare('INSERT INTO groups (name,avatar,owner_id,is_official,created_at) VALUES (?,?,?,?,?)')
      .run('Jay Chat官方群', '/uploads/official-group.svg', official.id, 1, Date.now()).lastInsertRowid;
    db.prepare('INSERT INTO group_members (group_id,user_id,role,joined_at) VALUES (?,?,?,?)').run(gid, official.id, 'owner', Date.now());
    group = db.prepare('SELECT * FROM groups WHERE id=?').get(gid);
  }
  // AI bot user
  let bot = db.prepare('SELECT * FROM users WHERE isBot=1').get();
  if (!bot) {
    const id = makeUser('Jay AI', 'ai-bot@jaychat.local', crypto.randomBytes(16).toString('hex'), { isBot: 1, avatar: '/uploads/jay-ai.svg' });
    db.prepare('INSERT INTO group_members (group_id,user_id,role,joined_at) VALUES (?,?,?,?)').run(group.id, id, 'member', Date.now());
  }
  return { official, group };
}

module.exports = { db, hashPassword, makeUser, seed };
