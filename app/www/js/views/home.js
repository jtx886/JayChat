/* Jay Chat — home tab, bell, add friend, create group */
(function () {
  const { JC, Stickers } = window;
  const store = JC.store;

  function lastPreview(m) {
    if (!m) return '';
    if (m.recalled) return (m.sender.id === store.me.id ? '你' : m.sender.username) + ' 撤回了一条消息';
    if (m.expired && m.sender.id !== store.me.id) return '[已销毁]';
    if (m.type === 'image') return '[图片]';
    if (m.type === 'video') return '[视频]';
    if (m.type === 'voice') return '[语音]';
    if (m.type === 'quote') return '[引用] ' + (JC.quoteText(m).text || '');
    return m.content;
  }

  // ================= Home =================
  const Home = {
    data: () => ({ store }),
    computed: {
      conversations() {
        return store.conversations.map(c => ({ ...c, preview: lastPreview(c.last), time: c.last ? JC.fmtFull(c.last.createdAt) : '' }));
      }
    },
    async mounted() { await JC.refreshAll(); },
    methods: {
      open(c) {
        this.$root.go('chat', { convType: c.convType, convId: c.convId, name: c.name, avatar: c.avatar });
      },
      addMenu() {
        this.$root.sheet('添加', [
          { label: '添加好友', act: 'addfriend', ico: 'user' },
          { label: '创建群聊', act: 'creategroup', ico: 'users' }
        ], a => {
          if (a.act === 'addfriend') this.$root.go('addfriend');
          if (a.act === 'creategroup') this.$root.go('creategroup');
        });
      },
      openBell() { this.$root.go('bell'); }
    },
    template: `
      <div class="page">
        <div class="navbar glassy">
          <div class="nav-side">
            <button class="nav-btn" @click="openBell" style="position:relative;">
              <svg viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" stroke-width="2"><path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 20a2 2 0 01-3.4 0"/></svg>
              <span v-if="store.unreadNotifs>0" class="tab-badge" style="top:-4px;right:-4px;">{{store.unreadNotifs>99?'99+':store.unreadNotifs}}</span>
            </button>
          </div>
          <div class="nav-title">Jay Chat</div>
          <div class="nav-side">
            <button class="nav-btn" @click="addMenu">
              <svg viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
        </div>
        <div class="page-inner safe-bottom">
          <div v-if="!conversations.length" class="empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 12a8 8 0 01-8 8H4l2.5-3A8 8 0 1121 12z"/></svg>
            <span>还没有聊天，快去添加好友吧</span>
          </div>
          <div class="list-card" v-else>
            <div class="row" v-for="c in conversations" :key="c.convType+c.convId" @click="open(c)">
              <UI.Avatar :src="c.avatar" :name="c.name" :online="c.convType==='private' && store.presence[c.convId]" :size="48"/>
              <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">
                <div class="row-title">
                  {{c.name}}
                  <span v-if="c.isOfficial" class="badge-verify"><svg viewBox="0 0 24 24" fill="#fff"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg></span>
                  <UI.Icon v-if="c.muted" name="bell-off" :size="13" style="color:#a9abb2;"/>
                </div>
                <div class="row-sub" :style="{color: c.unread>0 ? '#1c1c1e' : ''}">{{c.preview}}</div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
                <div class="row-time" style="font-size:10px;max-width:110px;text-align:right;">{{c.time}}</div>
                <span v-if="c.convType==='group'" class="tag-online" style="font-size:10px;">{{c.onlineCount}}/{{c.memberCount}} 在线</span>
                <span v-if="c.unread>0" class="row-dot" :class="{'mute-dot':c.muted}">{{c.unread>99?'99+':c.unread}}</span>
              </div>
            </div>
          </div>
        </div>
      </div>`
  };

  // ================= Bell (notifications) =================
  const Bell = {
    data: () => ({ list: null }),
    computed: {
      icoStyle() {
        return {
          friend_accepted: { background: 'rgba(48,209,88,.15)', ico: 'check' },
          like: { background: 'rgba(255,59,48,.12)', ico: 'heart' },
          comment: { background: 'rgba(10,132,255,.12)', ico: 'comment' },
          comment_reply: { background: 'rgba(94,92,230,.12)', ico: 'reply' },
          group_invite: { background: 'rgba(255,159,10,.12)', ico: 'users' }
        };
      }
    },
    async mounted() {
      try { this.list = (await JC.api('GET', '/api/notifications')).notifications; } catch (e) { this.list = []; }
      if (store.unreadNotifs > 0) {
        JC.api('POST', '/api/notifications/read');
        store.unreadNotifs = 0;
      }
    },
    methods: {
      open(n) {
        if (n.refType === 'moment') this.$root.go('momentDetail', { id: n.refId });
        else if (n.refType === 'group') this.$root.go('chat', { convType: 'group', convId: n.refId });
        else this.$root.go('chat', { convType: 'private', convId: n.actor.id, name: n.actor.username, avatar: n.actor.avatar });
      }
    },
    template: `
      <div class="page">
        <UI.NavHeader title="通知中心" @back="$root.back()"></UI.NavHeader>
        <div class="page-inner safe-bottom">
          <div v-if="list===null" style="padding:20px;"><div class="skeleton" style="height:70px;margin-bottom:10px;"></div><div class="skeleton" style="height:70px;margin-bottom:10px;"></div></div>
          <div v-else-if="!list.length" class="empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8"/></svg>
            <span>暂无通知</span>
          </div>
          <div class="list-card" v-else>
            <div class="notif-item" :class="{unread:!n.isRead}" v-for="n in list" :key="n.id" @click="open(n)">
              <div class="notif-ico" :style="{background: (icoStyle[n.type]||{}).background, color: '#0a84ff'}">
                <UI.Icon :name="(icoStyle[n.type]||{}).ico || 'bell'" :size="18"/>
              </div>
              <div class="notif-content">
                <b style="color:#1c1c1e;">{{n.actor.username}}</b> {{n.content}}
                <div class="notif-time">{{JC.fmtFull(n.createdAt)}}</div>
              </div>
            </div>
          </div>
        </div>
      </div>`
  };

  // ================= Add friend =================
  const AddFriend = {
    data: () => ({ q: '', results: null, sent: {} }),
    methods: {
      async search() {
        if (!this.q.trim()) { this.results = null; return; }
        try { this.results = (await JC.api('GET', '/api/users/search?q=' + encodeURIComponent(this.q.trim()))).users; }
        catch (e) { JC.toast(e.message); }
      },
      async add(u) {
        try {
          await JC.api('POST', '/api/friends/request', { userId: u.id });
          this.sent[u.id] = true;
          JC.toast('好友申请已发送');
        } catch (e) { JC.toast(e.message); }
      }
    },
    template: `
      <div class="page">
        <UI.NavHeader title="添加好友" @back="$root.back()"></UI.NavHeader>
        <div class="field"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#8e8e93" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input v-model="q" placeholder="搜索用户昵称" @input="search" @keyup.enter="search"/></div>
        <div class="page-inner safe-bottom" style="flex:1;">
          <div v-if="results===null" class="empty"><span>输入昵称搜索用户</span></div>
          <div v-else-if="!results.length" class="empty"><span>未找到该用户</span></div>
          <div class="list-card" v-else>
            <div class="row" v-for="u in results" :key="u.id">
              <UI.Avatar :src="u.avatar" :name="u.username" :online="store.presence[u.id]"/>
              <div class="row-title">{{u.username}}</div>
              <button class="btn mini" v-if="sent[u.id]" disabled>已申请</button>
              <button class="btn mini" v-else @click="add(u)">添加</button>
            </div>
          </div>
        </div>
      </div>`
  };

  // ================= Create group =================
  const CreateGroup = {
    data: () => ({ name: '', avatar: '', selected: {}, creating: false }),
    computed: { friends() { return store.friends; }, count() { return Object.values(this.selected).filter(Boolean).length; } },
    methods: {
      pickAvatar() {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = async () => {
          const f = await JC.compressImage(inp.files[0]);
          try {
            const r = await JC.upload(f);
            this.avatar = r.url;
            JC.toast('群头像已设置');
          } catch (e) { JC.toast(e.message); }
        };
        inp.click();
      },
      async create() {
        if (!this.name.trim()) return JC.toast('请输入群名称');
        if (this.creating) return;
        this.creating = true;
        try {
          const r = await JC.api('POST', '/api/groups', { name: this.name.trim(), avatar: this.avatar });
          const ids = Object.keys(this.selected).filter(k => this.selected[k]).map(Number);
          if (ids.length) await JC.api('POST', `/api/groups/${r.groupId}/invite`, { userIds: ids });
          JC.toast('群聊创建成功');
          this.$root.back();
          await JC.refreshAll();
          setTimeout(() => this.$root.go('chat', { convType: 'group', convId: r.groupId, name: this.name.trim(), avatar: this.avatar }), 100);
        } catch (e) { JC.toast(e.message); }
        this.creating = false;
      }
    },
    template: `
      <div class="page">
        <UI.NavHeader title="创建群聊" @back="$root.back()"></UI.NavHeader>
        <div class="page-inner safe-bottom">
          <div class="row" style="margin:0 12px;border-radius:16px 16px 0 0;overflow:hidden;" >
            <div style="width:56px;height:56px;border-radius:14px;background:#dfe3ea;overflow:hidden;flex-shrink:0;cursor:pointer;" @click="pickAvatar">
              <img v-if="avatar" :src="JC.mediaUrl(avatar)" style="width:100%;height:100%;object-fit:cover;"/>
              <div v-else style="display:flex;align-items:center;justify-content:center;height:100%;color:#8e8e93;"><UI.Icon name="camera" :size="22"/></div>
            </div>
            <input v-model="name" placeholder="群名称" style="flex:1;border:none;outline:none;background:transparent;font-size:16px;font-weight:600;"/>
          </div>
          <div class="section-label">选择好友加入（已选 {{count}} 人）</div>
          <div class="list-card">
            <div class="row" v-for="f in friends" :key="f.id" @click="selected[f.id]=!selected[f.id]">
              <UI.Avatar :src="f.avatar" :name="f.remark||f.username" :online="f.online"/>
              <div class="row-title">{{f.remark||f.username}}</div>
              <div :style="{width:'22px',height:'22px',borderRadius:'50%',border:selected[f.id]?'none':'2px solid #c7c9cf',background:selected[f.id]?'#0a84ff':'transparent',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s'}">
                <svg v-if="selected[f.id]" viewBox="0 0 24 24" width="14" height="14" fill="#fff"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
              </div>
            </div>
            <div v-if="!friends.length" class="empty"><span>还没有好友，先去添加好友吧</span></div>
          </div>
          <div style="padding:16px 12px;"><button class="btn" :disabled="creating" @click="create">{{creating?'创建中…':'创建群聊（'+(count+1)+' 人）'}}</button></div>
        </div>
      </div>`
  };

  window.Views = window.Views || {};
  window.Views.home = Home;
  window.Views.bell = Bell;
  window.Views.addfriend = AddFriend;
  window.Views.creategroup = CreateGroup;
})();
