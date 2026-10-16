// 应用主框架：路由 / 状态 / Socket事件分发
const App = {
  state: {
    me: null,
    tab: 'home',
    online: new Set(),
    friends: [],
    friendReqCount: 0,
    chat: null, // 当前聊天页状态
  },
  pages: [],

  // ===== 启动 =====
  async init() {
    if (API.token) {
      try {
        const { user } = await API.get('/api/auth/me');
        this.state.me = user;
        this.enterMain();
        return;
      } catch (e) { API.token = ''; localStorage.removeItem('jaychat_token'); }
    }
    AuthView.show();
  },

  async login(user, token) {
    API.token = token;
    localStorage.setItem('jaychat_token', token);
    this.state.me = user;
    this.enterMain();
  },

  async enterMain() {
    $('#auth-view').classList.add('hidden');
    $('#main-view').classList.remove('hidden');
    Socket.connect();
    this.bindSocketEvents();

    // 初始在线列表 + 数据
    try {
      const [{ onlineIds }, { friends }] = await Promise.all([
        API.get('/api/users/online'), API.get('/api/friends'),
      ]);
      this.state.online = new Set(onlineIds);
      this.state.friends = friends;
    } catch (e) { /* ignore */ }

    HomeView.render();
    ContactsView.render();
    ProfileView.render();
    this.switchTab('home');
    this.refreshBadges();
    this.watchOnline();
  },

  // 定时校准在线状态（保证实时准确）
  watchOnline() {
    if (this._watcher) return;
    this._watcher = setInterval(async () => {
      try {
        const { onlineIds } = await API.get('/api/users/online');
        const prev = [...this.state.online].sort().join(',');
        const now = onlineIds.slice().sort().join(',');
        if (prev !== now) {
          this.state.online = new Set(onlineIds);
          Bus.emit('online:sync', null);
        }
      } catch (e) { /* ignore */ }
    }, 15000);
  },

  isOnline(userId) { return this.state.online.has(userId); },

  bindSocketEvents() {
    if (this._bound) return;
    this._bound = true;

    Bus.on('presence', ({ userId, online }) => {
      if (online) this.state.online.add(userId);
      else this.state.online.delete(userId);
      Bus.emit('presence:change', { userId, online });
    });

    Bus.on('msg:new', ({ convId, msg }) => {
      Bus.emit('chat:msg:' + convId, msg);
      Bus.emit('home:msg', { convId, msg });
    });
    Bus.on('msg:read', (d) => {
      Bus.emit('chat:read:' + d.convId, d);
      Bus.emit('home:read', d);
    });
    Bus.on('msg:recalled', (d) => Bus.emit('chat:recall:' + d.convId, d));
    Bus.on('conv:update', () => HomeView.refresh());
    Bus.on('friend:request', () => { ContactsView.refreshRequests(); this.refreshBadges(); toast('收到新的好友申请'); });
    Bus.on('friend:updated', async () => {
      const { friends } = await API.get('/api/friends');
      this.state.friends = friends;
      ContactsView.render();
      this.refreshBadges();
    });
    Bus.on('group:event', (d) => {
      HomeView.refresh();
      Bus.emit('group:event:' + d.groupId, d);
      const map = {
        kicked: `你已被移出群聊「${d.groupName}」`,
        dissolved: `群聊「${d.groupName}」已解散`,
        muted: `你已被禁言至 ${d.untilText}`,
        promoted: `你已被设为「${d.groupName}」的管理员`,
        transferred: `「${d.groupName}」群主已转让给你`,
      };
      if (map[d.type]) toast(map[d.type], d.type === 'promoted' || d.type === 'transferred' ? 'success' : 'error');
    });
    Bus.on('admin:event', (d) => {
      if (d.type === 'muted') toast(`你已被管理员禁言至 ${d.untilText}`, 'error');
      if (d.type === 'unmuted') toast('你已被解除禁言', 'success');
    });
    Bus.on('profile:update', (u) => {
      if (this.state.me && u.id === this.state.me.id) {
        this.state.me.username = u.username;
        this.state.me.avatar = u.avatar;
      }
      Bus.emit('profile:refresh', u);
    });
  },

  // ===== Tab =====
  switchTab(name) {
    this.state.tab = name;
    $$('.tab-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('.tab-page').forEach((p) => p.classList.add('hidden'));
    const page = $('#page-' + name);
    page.classList.remove('hidden');
    if (name === 'home') HomeView.refresh();
    if (name === 'contacts') ContactsView.render();
    if (name === 'profile') ProfileView.render();
  },

  refreshBadges() {
    // 联系人tab角标（好友申请数）
    const reqBadge = $('#badge-contacts');
    API.get('/api/friends/requests').then(({ requests }) => {
      this.state.friendReqCount = requests.length;
      reqBadge.textContent = requests.length;
      reqBadge.classList.toggle('hidden', !requests.length);
    }).catch(() => {});
    // 首页tab角标（总未读）
    const homeBadge = $('#badge-home');
    API.get('/api/convos').then(({ convos }) => {
      const unread = convos.reduce((s, c) => s + c.unread, 0);
      homeBadge.textContent = unread > 99 ? '99+' : unread;
      homeBadge.classList.toggle('hidden', !unread);
    }).catch(() => {});
  },

  // ===== 页面栈 =====
  pushPage(pageEl) {
    $('#page-stack').appendChild(pageEl);
    this.pages.push(pageEl);
    return pageEl;
  },
  popPage() {
    const p = this.pages.pop();
    if (!p) return;
    p.classList.add('closing');
    setTimeout(() => p.remove(), 280);
  },
  popToMain() {
    while (this.pages.length) this.popPage();
  },

  forceLogout(reason) {
    localStorage.removeItem('jaychat_token');
    API.token = '';
    this.state.me = null;
    this.state.online = new Set();
    this.pages = [];
    $('#page-stack').innerHTML = '';
    $('#main-view').classList.add('hidden');
    AuthView.show();
    if (reason) toast(reason, 'error');
  },
};

// Tab点击
$$('.tab-item').forEach((b) => b.onclick = () => App.switchTab(b.dataset.tab));

// 启动
App.init();
