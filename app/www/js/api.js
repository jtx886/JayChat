/* Jay Chat — API client + global store + helpers */
(function () {
  const { reactive } = Vue;

  function serverUrl() {
    const saved = localStorage.getItem('jc_server_url');
    if (saved) return saved.replace(/\/+$/, '');
    if (window.JAY_CONFIG && window.JAY_CONFIG.SERVER_URL) return window.JAY_CONFIG.SERVER_URL.replace(/\/+$/, '');
    return location.origin;
  }

  const store = reactive({
    booted: false,
    token: localStorage.getItem('jc_token') || '',
    me: null,
    tab: 'home',
    stack: [],           // pushed pages: {view, props}
    conversations: [],
    friends: [],
    presence: {},        // userId -> bool
    unreadNotifs: 0,
    friendReqCount: 0,
    toasts: [],
    typing: {},
  });

  function toast(msg, ms = 2200) {
    const id = Date.now() + Math.random();
    store.toasts.push({ id, msg });
    setTimeout(() => { const i = store.toasts.findIndex(t => t.id === id); if (i > -1) store.toasts.splice(i, 1); }, ms);
  }

  async function api(method, path, body) {
    const res = await fetch(serverUrl() + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(store.token ? { Authorization: 'Bearer ' + store.token } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    let json = null;
    try { json = await res.json(); } catch (e) { json = {}; }
    if (res.status === 401 && store.token) {
      logout();
      throw new Error(json.error || '登录已过期');
    }
    if (!res.ok) throw new Error(json.error || '请求失败 ' + res.status);
    return json;
  }

  function mediaUrl(url) {
    if (!url) return '';
    if (/^https?:/i.test(url)) return url;
    return serverUrl() + url;
  }

  function upload(file, onProgress) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', serverUrl() + '/api/upload');
      xhr.setRequestHeader('Authorization', 'Bearer ' + store.token);
      xhr.upload.onprogress = e => { if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText);
          if (xhr.status === 200) resolve(json); else reject(new Error(json.error || '上传失败'));
        } catch (e) { reject(new Error('上传失败')); }
      };
      xhr.onerror = () => reject(new Error('上传失败，请检查网络'));
      xhr.send(form);
    });
  }

  // ---- image compression ----
  function compressImage(file, maxDim = 1280, quality = 0.82) {
    return new Promise((resolve) => {
      if (!/^image\//i.test(file.type) || file.type === 'image/gif') return resolve(file);
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let { width, height } = img;
        if (Math.max(width, height) > maxDim) {
          const r = maxDim / Math.max(width, height);
          width = Math.round(width * r); height = Math.round(height * r);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(b => { URL.revokeObjectURL(url); resolve(b ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  // ---- time format: 2026年10月17日 14:30:25 (24h, with seconds everywhere) ----
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtFull(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  function fmtChat(ts) { // for message bubbles divider (still full per requirement)
    return fmtFull(ts);
  }

  // ---- pinyin first letter via localeCompare boundaries ----
  const _coll = (typeof Intl !== 'undefined') ? new Intl.Collator('zh-CN') : null;
  const BOUND = ['阿', '八', '擦', '搭', '蛾', '发', '噶', '哈', '击', '喀', '垃', '妈', '拿', '哦', '啪', '期', '然', '撒', '塌', '挖', '昔', '压', '匝'];
  function pinyinLetter(str) {
    const ch = String(str || '').trim().charAt(0);
    if (!ch) return '#';
    if (/[a-z]/i.test(ch)) return ch.toUpperCase();
    if (!/[\u4e00-\u9fa5]/.test(ch)) return '#';
    if (!_coll) return '#';
    let letter = 'A';
    for (let i = 0; i < BOUND.length; i++) {
      if (_coll.compare(ch, BOUND[i]) >= 0) letter = String.fromCharCode(65 + i);
    }
    // beyond '匝' → Z
    if (_coll.compare(ch, '匝') >= 0) letter = 'Z';
    return letter;
  }
  function groupByLetter(list, nameFn) {
    const map = {};
    for (const item of list) {
      const L = pinyinLetter(nameFn(item));
      (map[L] = map[L] || []).push(item);
    }
    return Object.keys(map).sort().map(L => ({ letter: L, items: map[L].sort((a, b) => _coll ? _coll.compare(nameFn(a), nameFn(b)) : 0) }));
  }

  // ---- server type & realtime transport ----
  let socket = null;
  let pollTimer = null;
  let serverType = 'node';
  let lastMsgId = 0, lastNotifId = 0, lastReads = {};

  async function detectServerType() {
    try {
      const r = await fetch(serverUrl() + '/api/server-info', { method: 'GET' });
      const j = await r.json();
      if (j.type === 'php') serverType = 'php';
      else serverType = 'node';
    } catch (e) { serverType = 'node'; }
    return serverType;
  }

  function connectSocket() {
    stopRealtime();
    if (!store.token) return;
    if (serverType === 'php') { startPoller(); return; }
    socket = io(serverUrl(), { auth: { token: store.token }, transports: ['websocket', 'polling'], reconnectionDelayMax: 5000 });
    socket.on('connect', () => {
      window.__socketReady = true;
    });
    socket.on('presence:snapshot', d => {
      store.presence = {};
      for (const id of d.online || []) store.presence[id] = true;
    });
    socket.on('presence:update', d => {
      if (d.online) store.presence[d.userId] = true;
      else delete store.presence[d.userId];
      emitBus('presence', d);
    });
    socket.on('message:new', msg => onIncomingMessage(msg));
    socket.on('message:update', msg => emitBus('msg-update', msg));
    socket.on('read:update', d => emitBus('read-update', d));
    socket.on('notification:new', d => {
      store.unreadNotifs = d.unread || (store.unreadNotifs + 1);
      emitBus('notification', d);
      localNotify('Jay Chat', '你有新的通知');
    });
    socket.on('friendreq:new', d => {
      store.friendReqCount = d.count;
      emitBus('friendreq', d);
      toast(d.from.username + ' 请求添加你为好友');
    });
    socket.on('typing', d => emitBus('typing', d));
    socket.io.on('reconnect', () => { refreshAll(); });
  }
  function disconnectSocket() { stopRealtime(); }
  function getSocket() { return socket; }

  // ---- PHP polling mode (InfinityFree 等不支持 WebSocket 的主机) ----
  function startPoller() {
    lastMsgId = 0; lastNotifId = 0; lastReads = {};
    const tick = async () => {
      try {
        const chat = window.__chatPage;
        const activeType = chat ? chat.convType : '';
        const activeId = chat ? chat.id : 0;
        const q = new URLSearchParams({
          activeType, activeId: String(activeId),
          lastMsgId: String(lastMsgId), lastNotifId: String(lastNotifId)
        });
        const d = await api('GET', '/api/sync?' + q.toString());
        // presence
        const pres = {};
        for (const id of d.presence || []) pres[id] = true;
        const changedPresence = JSON.stringify(pres) !== JSON.stringify(store.presence);
        store.presence = pres;
        if (changedPresence) emitBus('presence', {});
        // conversations
        if (Array.isArray(d.conversations)) store.conversations = d.conversations;
        // badges
        store.unreadNotifs = d.unreadNotifs || 0;
        store.friendReqCount = d.friendReqCount || 0;
        // new notifications
        for (const n of d.newNotifications || []) {
          lastNotifId = Math.max(lastNotifId, n.id);
          if (n.type === 'friend_accepted') JC.localNotify('Jay Chat', n.actor.username + ' ' + n.content);
          else if (n.type === 'like' || n.type === 'comment' || n.type === 'comment_reply') JC.localNotify('Jay Chat', n.actor.username + ' ' + n.content);
          emitBus('notification', n);
        }
        // active conversation messages
        if (d.active && Array.isArray(d.active.messages)) {
          for (const m of d.active.messages) {
            lastMsgId = Math.max(lastMsgId, m.id);
            emitBus('msg-new', m);
            if (document.hidden && m.sender && m.sender.id !== store.me?.id) {
              JC.localNotify(m.sender.username, m.type === 'text' ? m.content : (m.type === 'image' ? '[图片]' : '[视频]'));
            }
          }
          // read updates
          const reads = d.active.reads || {};
          for (const [uid, rid] of Object.entries(reads)) {
            const u = Number(uid);
            if (d.active.convType === 'group') {
              if (lastReads[u] !== rid) emitBus('read-update', { convType: 'group', convId: d.active.convId, userId: u, lastReadMsgId: rid });
            } else {
              if (lastReads[u] !== rid && u === d.active.convId) emitBus('read-update', { convType: 'private', convId: d.active.convId, userId: u, lastReadMsgId: rid });
            }
            lastReads[u] = rid;
          }
        }
      } catch (e) { /* silent retry */ }
      pollTimer = setTimeout(tick, document.hidden ? 4000 : 2000);
    };
    tick();
  }
  function stopRealtime() {
    if (socket) { socket.disconnect(); socket = null; }
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  }

  // ---- send message (transport agnostic) ----
  async function sendMessage(payload, ack) {
    if (serverType === 'php') {
      try {
        const r = await api('POST', '/api/messages', payload);
        // 本地即时回显（chat 页有去重），轮询也会带来
        emitBus('msg-new', r.message);
        if (lastMsgId < r.message.id) lastMsgId = r.message.id;
        ack && ack({ id: r.message.id, createdAt: r.message.createdAt });
      } catch (e) { ack && ack({ error: e.message }); }
      return;
    }
    getSocket()?.emit('message:send', payload, ack);
  }

  // ---- mark read (transport agnostic) ----
  function markRead(convType, convId, lastReadMsgId) {
    if (serverType === 'php') {
      api('POST', '/api/read', { convType, convId, lastReadMsgId }).catch(() => { });
      return;
    }
    getSocket()?.emit('read', { convType, convId, lastReadMsgId });
  }

  // tiny event bus
  const bus = {};
  function onBus(evt, fn) { (bus[evt] = bus[evt] || []).push(fn); }
  function emitBus(evt, data) { (bus[evt] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }

  function onIncomingMessage(msg) {
    emitBus('msg-new', msg);
    // local notification when page hidden
    if (document.hidden && msg.sender && msg.sender.id !== store.me?.id) {
      localNotify(msg.sender.username, msg.type === 'text' ? msg.content : (msg.type === 'image' ? '[图片]' : '[视频]'));
    }
    // refresh conversations list badge
    refreshConversations();
  }

  function localNotify(title, body) {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
        window.Capacitor.Plugins.LocalNotifications.schedule({
          notifications: [{ id: Math.floor(Math.random() * 1e9), title, body, smallIcon: 'ic_stat_notify' }]
        });
      }
    } catch (e) { }
  }

  async function refreshConversations() {
    try { store.conversations = (await api('GET', '/api/conversations')).conversations; } catch (e) { }
  }
  async function refreshFriends() {
    try { store.friends = (await api('GET', '/api/friends')).friends; } catch (e) { }
  }
  async function refreshBadges() {
    try {
      const [n, r] = await Promise.all([
        api('GET', '/api/notifications/unread-count'),
        api('GET', '/api/friends/requests/count')
      ]);
      store.unreadNotifs = n.count; store.friendReqCount = r.count;
    } catch (e) { }
  }
  async function refreshAll() { refreshConversations(); refreshFriends(); refreshBadges(); }

  function logout() {
    localStorage.removeItem('jc_token');
    store.token = ''; store.me = null; store.conversations = []; store.friends = [];
    store.stack = []; store.unreadNotifs = 0; store.friendReqCount = 0; store.presence = {};
    disconnectSocket();
  }

  async function requestNotifPermission() {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
        await window.Capacitor.Plugins.LocalNotifications.requestPermissions();
      } else if (window.Notification && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch (e) { }
  }

  window.JC = {
    store, api, toast, upload, compressImage, mediaUrl, serverUrl,
    fmtFull, fmtChat, pinyinLetter, groupByLetter,
    connectSocket, disconnectSocket, getSocket, onBus, emitBus,
    detectServerType, sendMessage, markRead,
    refreshConversations, refreshFriends, refreshBadges, refreshAll,
    logout, requestNotifPermission, localNotify
  };
})();
