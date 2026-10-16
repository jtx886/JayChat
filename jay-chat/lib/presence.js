// 在线状态管理（支持多端同账号）
const sockets = new Map();   // userId -> Set<socketId>
const online = new Map();    // userId -> true

function isOnline(userId) { return online.has(userId); }
function onlineIds() { return [...online.keys()]; }
function connect(userId, socketId) {
  let set = sockets.get(userId);
  const first = !set || set.size === 0;
  if (!set) { set = new Set(); sockets.set(userId, set); }
  set.add(socketId);
  if (first) online.set(userId, true);
  return first; // 是否首次上线（需要广播）
}
function disconnect(userId, socketId) {
  const set = sockets.get(userId);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    sockets.delete(userId);
    online.delete(userId);
    return true; // 完全离线（需要广播）
  }
  return false;
}

module.exports = { isOnline, onlineIds, connect, disconnect };
