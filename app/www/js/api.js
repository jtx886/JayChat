/* Jay Chat — API client + global store + helpers */
(function () {
  const { reactive } = Vue;

  // 内置默认服务器（APK 打包后无需手动配置）
  const DEFAULT_SERVER = 'http://jaychat.ct.ws';

  function isNative() {
    try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
    catch (e) { return false; }
  }

  function serverUrl() {
    const saved = localStorage.getItem('jc_server_url');
    if (saved) return saved.replace(/\/+$/, '');
    // 网页模式（站点本身）→ 当前地址优先；APK 模式 → 内置服务器
    if (!isNative() && /^https?:/.test(location.origin) && location.origin !== 'null') return location.origin;
    if (window.JAY_CONFIG && window.JAY_CONFIG.SERVER_URL) return window.JAY_CONFIG.SERVER_URL.replace(/\/+$/, '');
    return DEFAULT_SERVER;
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
    serverType: '',      // 'node' | 'php'
    timReady: false,     // 腾讯 IM 实时通道是否已连接
    timCred: null,       // 腾讯 IM 登录凭证缓存
  });

  function toast(msg, ms = 2200) {
    const id = Date.now() + Math.random();
    store.toasts.push({ id, msg });
    setTimeout(() => { const i = store.toasts.findIndex(t => t.id === id); if (i > -1) store.toasts.splice(i, 1); }, ms);
  }

  /* ============ InfinityFree 防火墙（AES 挑战）自动求解 ============ */
  // 免费主机首个请求会返回一段 JS 挑战页：__test = toHex(slowAES.decrypt(c, 2, a, b))
  // 这里在 JS 内完成相同计算（纯 JS AES-128-CBC 解密），随后自动携带 Cookie 重试。
  let __testCookie = localStorage.getItem('jc_test_cookie') || '';

  const _SBOX = [99,124,119,123,242,107,111,197,48,1,103,43,254,215,171,118,202,130,201,125,250,89,71,240,173,212,162,175,156,164,114,192,183,253,147,38,54,63,247,204,52,165,229,241,113,216,49,21,4,199,35,195,24,150,5,154,7,18,128,226,235,39,178,117,9,131,44,26,27,110,90,160,82,59,214,179,41,227,47,132,83,209,0,237,32,252,177,91,106,203,190,57,74,76,88,207,208,239,170,251,67,77,51,133,69,249,2,127,80,60,159,168,81,163,64,143,146,157,56,245,188,182,218,33,16,255,243,210,205,12,19,236,95,151,68,23,196,167,126,61,100,93,25,115,96,129,79,220,34,42,144,136,70,238,184,20,222,94,11,219,224,50,58,10,73,6,36,92,194,211,172,98,145,149,228,121,231,200,55,109,141,213,78,169,108,86,244,234,101,122,174,8,186,120,37,46,28,166,180,198,232,221,116,31,75,189,139,138,112,62,181,102,72,3,246,14,97,53,87,185,134,193,29,158,225,248,152,17,105,217,142,148,155,30,135,233,206,85,40,223,140,161,137,13,191,230,66,104,65,153,45,15,176,84,187,22];
  const _RSBOX = [82,9,106,213,48,54,165,56,191,64,163,158,129,243,215,251,124,227,57,130,155,47,255,135,52,142,67,68,196,222,233,203,84,123,148,50,166,194,35,61,238,76,149,11,66,250,195,78,8,46,161,102,40,217,36,178,118,91,162,73,109,139,209,37,114,248,246,100,134,104,152,22,212,164,92,204,93,101,182,146,108,112,72,80,253,237,185,218,94,21,70,87,167,141,157,132,144,216,171,0,140,188,211,10,247,228,88,5,184,179,69,6,208,44,30,143,202,63,15,2,193,175,189,3,1,19,138,107,58,145,17,65,79,103,220,234,151,242,207,206,240,180,230,115,150,172,116,34,231,173,53,133,226,249,55,232,28,117,223,110,71,241,26,113,29,41,197,137,111,183,98,14,170,24,190,27,252,86,62,75,198,210,121,32,154,219,192,254,120,205,90,244,31,221,168,51,136,7,199,49,177,18,16,89,39,128,236,95,96,81,127,169,25,181,74,13,45,229,122,159,147,201,156,239,160,224,59,77,174,42,245,176,200,235,187,60,131,83,153,97,23,43,4,126,186,119,214,38,225,105,20,99,85,33,12,125];
  const _RCON = [0,1,2,4,8,16,32,64,128,27,54];
  function _xt(a) { return ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 255; }
  function _mul(a, b) { let r = 0; while (b) { if (b & 1) r ^= a; a = _xt(a); b >>= 1; } return r & 255; }
  function _expandKey(key) { // key: 16 bytes → 44 words
    const w = [];
    for (let i = 0; i < 4; i++) w.push([key[4*i], key[4*i+1], key[4*i+2], key[4*i+3]]);
    for (let i = 4; i < 44; i++) {
      let t = w[i-1].slice();
      if (i % 4 === 0) t = [_SBOX[t[1]] ^ _RCON[i/4], _SBOX[t[2]], _SBOX[t[3]], _SBOX[t[0]]];
      w.push([w[i-4][0]^t[0], w[i-4][1]^t[1], w[i-4][2]^t[2], w[i-4][3]^t[3]]);
    }
    return w;
  }
  function _decBlock(w, b) { // b: 16 bytes (state column-major) → 16 bytes
    const s = new Array(16);
    for (let i = 0; i < 16; i++) s[i] = b[i];
    const addRK = (r) => { for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) s[c*4+k] ^= w[4*r+c][k]; };
    const invShift = () => { // row r rotate right by r
      for (let r = 1; r < 4; r++) {
        const row = [s[r], s[4+r], s[8+r], s[12+r]];
        for (let c = 0; c < 4; c++) s[(c+r)%4*4+r] = row[c];
      }
    };
    const invSub = () => { for (let i = 0; i < 16; i++) s[i] = _RSBOX[s[i]]; };
    const invMix = () => { // per column
      for (let c = 0; c < 4; c++) {
        const o = c*4, a = [s[o], s[o+1], s[o+2], s[o+3]];
        s[o]   = _mul(a[0],14)^_mul(a[1],11)^_mul(a[2],13)^_mul(a[3],9);
        s[o+1] = _mul(a[0],9)^_mul(a[1],14)^_mul(a[2],11)^_mul(a[3],13);
        s[o+2] = _mul(a[0],13)^_mul(a[1],9)^_mul(a[2],14)^_mul(a[3],11);
        s[o+3] = _mul(a[0],11)^_mul(a[1],13)^_mul(a[2],9)^_mul(a[3],14);
      }
    };
    addRK(10);
    for (let r = 9; r >= 1; r--) { invShift(); invSub(); addRK(r); invMix(); }
    invShift(); invSub(); addRK(0);
    return s;
  }
  function aesCbcDecrypt(keyBytes, ivBytes, dataBytes) {
    const w = _expandKey(keyBytes);
    const out = [];
    let prev = ivBytes.slice();
    for (let off = 0; off + 16 <= dataBytes.length; off += 16) {
      const blk = dataBytes.slice(off, off + 16);
      const dec = _decBlock(w, blk);
      for (let i = 0; i < 16; i++) out.push(dec[i] ^ prev[i]);
      prev = blk;
    }
    return out;
  }
  function solveChallenge(html) {
    try {
      if (!/slowAES\.decrypt/.test(html)) return '';
      const vals = [];
      const re = /toNumbers\("([0-9a-fA-F]+)"\)/g;
      let m; while ((m = re.exec(html)) && vals.length < 3) vals.push(m[1]);
      if (vals.length < 3) return '';
      const key = vals[0].match(/../g).map(h => parseInt(h, 16));
      const iv = vals[1].match(/../g).map(h => parseInt(h, 16));
      const ct = vals[2].match(/../g).map(h => parseInt(h, 16));
      const pt = aesCbcDecrypt(key, iv, ct);
      return pt.map(b => (b < 16 ? '0' : '') + b.toString(16)).join('');
    } catch (e) { return ''; }
  }

  // 判断响应是否为防火墙挑战页
  async function isChallenge(res) {
    try {
      const ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
      if (ct.includes('text/html')) return true;
      // CapacitorHttp shim 拿不到可靠 content-type，读文本判断
      const t = await res.clone().text();
      return t.length < 2048 && /slowAES\.decrypt|aes\.js/.test(t);
    } catch (e) { return false; }
  }

  // 带挑战求解的 fetch
  async function rawFetch(url, opts = {}, retried = false) {
    const headers = { ...(opts.headers || {}) };
    if (__testCookie && isNative()) headers['Cookie'] = '__test=' + __testCookie; // 浏览器忽略，CapacitorHttp 原生生效
    const res = await fetch(url, { ...opts, headers });
    if (!retried && await isChallenge(res)) {
      const html = await res.clone().text();
      const val = solveChallenge(html);
      if (val) {
        __testCookie = val;
        localStorage.setItem('jc_test_cookie', val);
        return rawFetch(url, opts, true);
      }
    }
    return res;
  }

  async function api(method, path, body) {
    const res = await rawFetch(serverUrl() + path, {
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
    if (/^(data|blob):/i.test(url)) return url;
    return serverUrl() + url;
  }

  function upload(file, onProgress) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', serverUrl() + '/api/upload');
      xhr.setRequestHeader('Authorization', 'Bearer ' + store.token);
      try { if (__testCookie && isNative()) xhr.setRequestHeader('Cookie', '__test=' + __testCookie); } catch (e) { }
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
  function fmtChat(ts) { return fmtFull(ts); }

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

  // ---- 腾讯云 IM 实时通道（PHP 模式的主通道；轮询作为兜底）----
  let tim = null;                 // TIM SDK 实例
  let timReady = false;           // 是否已成功登录 TIM
  let heartbeatTimer = null;      // 在线心跳
  let convRefreshTimer = null;    // 在线状态引起的会话刷新（去抖）
  const seenMsgIds = new Set();   // 消息去重（TIM 与轮询双通道）
  function markSeen(id) {
    if (!id) return true;
    if (seenMsgIds.has(id)) return false;
    seenMsgIds.add(id);
    if (seenMsgIds.size > 3000) {
      const keep = [...seenMsgIds].slice(-1500);
      seenMsgIds.clear();
      for (const x of keep) seenMsgIds.add(x);
    }
    return true;
  }

  async function detectServerType() {
    try {
      const r = await rawFetch(serverUrl() + '/api/server-info');
      const j = await r.json();
      if (j.type === 'php') serverType = 'php';
      else if (j.type === 'node') serverType = 'node';
      else serverType = 'node';
    } catch (e) { serverType = 'node'; }
    store.serverType = serverType;
    return serverType;
  }

  function connectSocket() {
    stopRealtime();
    if (!store.token) return;
    if (serverType === 'php') { startPoller(); startHeartbeat(); connectTim(); return; }
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
  function disconnectSocket() { stopRealtime(); disconnectTim(); }
  function getSocket() { return socket; }

  /* ============ 腾讯云 IM 实时通道 ============ */
  async function connectTim(creds) {
    if (!window.TIM || !TIM.create) { timReady = false; store.timReady = false; return; }
    try {
      creds = creds || store.timCred || (await api('GET', '/api/tim/credentials'));
      if (!creds || !creds.usersig) throw new Error('缺少 TIM 登录凭证');
      store.timCred = creds;
      if (tim) { try { await tim.logout(); } catch (e) { } try { tim.destroy(); } catch (e) { } tim = null; }
      tim = TIM.create({ SDKAppID: Number(creds.sdkappid) });
      try { tim.setLogLevel(0); } catch (e) { }
      tim.on(TIM.EVENT.MESSAGE_RECEIVED, onTimMessage);
      tim.on(TIM.EVENT.KICKED_OUT, () => { timReady = false; store.timReady = false; });
      tim.on(TIM.EVENT.ERROR, e => console.warn('[TIM] error', e));
      await tim.login({ userID: creds.identifier, userSig: creds.usersig });
      timReady = true; store.timReady = true;
    } catch (e) {
      console.warn('[TIM] 连接失败，回退轮询模式', e);
      timReady = false; store.timReady = false;
    }
  }

  function disconnectTim() {
    stopHeartbeat();
    if (tim) { try { tim.logout(); } catch (e) { } try { tim.destroy(); } catch (e) { } tim = null; }
    timReady = false; store.timReady = false;
  }

  // 收到腾讯 IM 自定义消息 → 解析为业务信号
  function onTimMessage(event) {
    for (const m of (event && event.data) || []) {
      if (!m || m.type !== TIM.TYPES.MSG_CUSTOM) continue;
      let sig = null;
      try { sig = JSON.parse((m.payload && m.payload.data) || ''); } catch (e) { continue; }
      if (!sig || !sig.e) continue;
      handleSignal(sig.e, sig.d);
    }
  }

  function handleSignal(evt, d) {
    switch (evt) {
      case 'msg':
        deliverIncoming(d, true);
        break;
      case 'msg-update':
        emitBus('msg-update', d);
        break;
      case 'read-update':
        emitBus('read-update', d);
        break;
      case 'notification':
        store.unreadNotifs = (d && typeof d.unread === 'number') ? d.unread : store.unreadNotifs + 1;
        emitBus('notification', d);
        if (d && d.actor) localNotify('Jay Chat', d.actor.username + ' ' + d.content);
        if (d && d.type === 'friend_accepted') refreshFriends(); // 新好友即时出现在联系人
        break;
      case 'friendreq':
        store.friendReqCount = (d && typeof d.count === 'number') ? d.count : store.friendReqCount + 1;
        emitBus('friendreq', d);
        if (d && d.from) toast(d.from.username + ' 请求添加你为好友');
        break;
      case 'presence':
        if (d && d.userId) applyPresence(d.userId, !!d.online);
        break;
      case 'group-update':
        emitBus('group-update', d);
        refreshConversations();
        break;
      case 'moment-new':
        emitBus('moments-refresh');
        break;
    }
  }

  // 新消息统一入口：去重 + 派发 + 通知
  function deliverIncoming(msg, refresh) {
    if (!msg || !msg.id) return;
    if (!markSeen(msg.id)) return;
    emitBus('msg-new', msg);
    const mine = store.me && store.me.id;
    if (document.hidden && msg.sender && msg.sender.id !== mine && !isMuted(msg)) {
      localNotify(msg.sender.username, previewText(msg));
    }
    if (refresh) refreshConversations();
  }

  function isMuted(msg) {
    if (!msg) return false;
    const partner = msg.convType === 'group' ? msg.convId : (msg.sender ? msg.sender.id : msg.convId);
    const c = store.conversations.find(x => x.convType === msg.convType && Number(x.convId) === Number(partner));
    return !!(c && c.muted);
  }

  /* ---- 在线状态：单点更新 + 全量覆盖 ---- */
  function applyPresence(uid, online) {
    const id = Number(uid);
    if (!id) return;
    if (online) store.presence[id] = true; else delete store.presence[id];
    const f = store.friends.find(x => Number(x.id) === id);
    if (f) f.online = !!online;
    const c = store.conversations.find(x => x.convType === 'private' && Number(x.convId) === id);
    if (c) c.online = !!online;
    const cp = window.__chatPage;
    if (cp && Array.isArray(cp.members)) {
      const mem = cp.members.find(x => Number(x.id) === id);
      if (mem) mem.online = !!online;
    }
    emitBus('presence', { userId: id, online: !!online });
    scheduleConvRefresh();
  }

  function applyPresenceList(ids) {
    const set = new Set((ids || []).map(Number));
    const cur = Object.keys(store.presence).map(Number);
    let same = cur.length === set.size;
    if (same) for (const id of cur) if (!set.has(id)) { same = false; break; }
    if (same) return; // 无变化 → 跳过重渲染
    store.presence = {};
    for (const id of set) store.presence[id] = true;
    for (const f of store.friends) f.online = set.has(Number(f.id));
    for (const c of store.conversations) if (c.convType === 'private') c.online = set.has(Number(c.convId));
    const cp = window.__chatPage;
    if (cp && Array.isArray(cp.members)) for (const m of cp.members) m.online = set.has(Number(m.id));
    emitBus('presence', {});
  }

  // 在线人数变化后，延迟刷新会话列表（含群在线人数），去抖避免请求风暴
  function scheduleConvRefresh() {
    if (convRefreshTimer) return;
    convRefreshTimer = setTimeout(() => { convRefreshTimer = null; refreshConversations(); }, 4000);
  }

  /* ---- 心跳：维持在线状态（服务端据此广播在线） ---- */
  function startHeartbeat() {
    stopHeartbeat();
    const beat = async () => {
      try {
        const r = await api('POST', '/api/heartbeat');
        if (r && Array.isArray(r.online)) applyPresenceList(r.online);
      } catch (e) { }
      heartbeatTimer = setTimeout(beat, document.hidden ? 25000 : 12000);
    };
    beat();
  }
  function stopHeartbeat() { if (heartbeatTimer) { clearTimeout(heartbeatTimer); heartbeatTimer = null; } }

  // 回到前台时立即补一次心跳并恢复实时
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !store.token || serverType !== 'php') return;
    startHeartbeat();
    if (!timReady) connectTim();
  });

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
        // presence（全量覆盖，用于剔除已下线用户）
        if (Array.isArray(d.presence)) applyPresenceList(d.presence);
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
        // active conversation messages（去重，避免与 TIM 实时通道重复）
        if (d.active && Array.isArray(d.active.messages)) {
          for (const m of d.active.messages) {
            lastMsgId = Math.max(lastMsgId, m.id);
            deliverIncoming(m, false);
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
      // TIM 实时通道可用时，轮询仅作兜底 → 降低频率，减轻服务器压力
      const base = timReady
        ? (document.hidden ? 25000 : 12000)
        : (document.hidden ? 5000 : 2500);
      pollTimer = setTimeout(tick, base);
    };
    tick();
  }
  function previewText(m) {
    if (!m) return '';
    if (m.type === 'image') return '[图片]';
    if (m.type === 'video') return '[视频]';
    if (m.type === 'voice') return '[语音]';
    if (m.type === 'quote') return '[引用] ' + quoteText(m).text;
    return m.content || '';
  }
  function quoteText(m) {
    if (m.type !== 'quote') return { text: m.content || '' };
    try {
      const j = JSON.parse(m.content);
      return { text: j.text || '', quoteSender: j.quoteSender || '', quotePreview: j.quotePreview || '', quoteId: j.quoteId || 0 };
    } catch (e) { return { text: m.content || '' }; }
  }
  function stopRealtime() {
    if (socket) { socket.disconnect(); socket = null; }
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    stopHeartbeat();
  }

  // ---- send message (transport agnostic) ----
  async function sendMessage(payload, ack) {
    if (serverType === 'php') {
      try {
        const r = await api('POST', '/api/messages', payload);
        if (r.message && r.message.id) markSeen(r.message.id); // 自己的消息已去重
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

  // tiny event bus (支持退订，避免页面销毁后残留监听)
  const bus = {};
  function onBus(evt, fn) { (bus[evt] = bus[evt] || []).push(fn); return fn; }
  function offBus(evt, fn) {
    const arr = bus[evt]; if (!arr) return;
    const i = arr.indexOf(fn); if (i > -1) arr.splice(i, 1);
  }
  function emitBus(evt, data) { (bus[evt] || []).slice().forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }

  function onIncomingMessage(msg) {
    deliverIncoming(msg, true);
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
    store.timReady = false; store.timCred = null;
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
    fmtFull, fmtChat, pinyinLetter, groupByLetter, quoteText, previewText,
    connectSocket, disconnectSocket, getSocket, onBus, offBus, emitBus,
    connectTim, disconnectTim, applyPresence, applyPresenceList,
    detectServerType, sendMessage, markRead,
    refreshConversations, refreshFriends, refreshBadges, refreshAll,
    logout, requestNotifPermission, localNotify,
    isNative, DEFAULT_SERVER
  };
})();
