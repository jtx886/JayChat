// API 封装 + Socket.IO 实时事件
const API = {
  token: localStorage.getItem('jaychat_token') || '',

  async request(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (this.token) opts.headers.Authorization = 'Bearer ' + this.token;
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    let data = {};
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) {
      if (res.status === 401 && App.state.me) { App.forceLogout('登录已失效，请重新登录'); }
      throw new Error(data.error || '请求失败');
    }
    return data;
  },
  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  del(path) { return this.request('DELETE', path); },
};

// 实时事件总线
const Bus = {
  map: {},
  on(ev, fn) { (this.map[ev] = this.map[ev] || []).push(fn); },
  emit(ev, data) { (this.map[ev] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); },
};

// Socket 管理
const Socket = {
  io: null,
  connect() {
    if (this.io) { this.io.disconnect(); this.io = null; }
    this.io = io('/', { auth: { token: API.token }, transports: ['websocket', 'polling'] });
    const s = this.io;
    s.on('connect', () => Bus.emit('socket:connected'));
    s.on('connect_error', (e) => {
      if (String(e.message).includes('banned') || String(e.message).includes('unauthorized')) {
        App.forceLogout('账号状态异常，请重新登录');
      }
    });
    s.on('presence', (d) => Bus.emit('presence', d));
    s.on('msg:new', (d) => Bus.emit('msg:new', d));
    s.on('msg:read', (d) => Bus.emit('msg:read', d));
    s.on('msg:recalled', (d) => Bus.emit('msg:recalled', d));
    s.on('conv:update', (d) => Bus.emit('conv:update', d));
    s.on('friend:request', (d) => Bus.emit('friend:request', d));
    s.on('friend:updated', (d) => Bus.emit('friend:updated', d));
    s.on('group:event', (d) => Bus.emit('group:event', d));
    s.on('admin:event', (d) => Bus.emit('admin:event', d));
    s.on('profile:update', (d) => Bus.emit('profile:update', d));
    s.on('typing', (d) => Bus.emit('typing', d));
    s.on('force:logout', (d) => App.forceLogout(d.reason || '你已被强制下线'));
    return s;
  },
  emit(ev, data, ack) { if (this.io && this.io.connected) this.io.emit(ev, data, ack); },
};
