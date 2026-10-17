/* Jay Chat — contacts tab + friend profile */
(function () {
  const { JC } = window;
  const store = JC.store;

  // ================= Contacts tab =================
  const Contacts = {
    data: () => ({ store }),
    computed: {
      groups() { return JC.groupByLetter(store.friends, f => f.remark || f.username); }
    },
    async mounted() { await JC.refreshFriends(); },
    methods: {
      openChat(f) { this.$root.go('chat', { convType: 'private', convId: f.id, name: f.remark || f.username, avatar: f.avatar }); },
      openProfile(f) { this.$root.go('friendProfile', { friendId: f.id }); },
      openReq() { this.$root.go('friendRequests'); },
      openAllMoments() { this.$root.go('moments', { scope: 'all' }); },
      openFriendMoments() { this.$root.go('moments', { scope: 'friends' }); }
    },
    template: `
      <div class="page">
        <div class="navbar glassy"><div class="nav-side"></div><div class="nav-title">联系人</div><div class="nav-side"></div></div>
        <div class="page-inner safe-bottom">
          <div class="list-card" style="margin-top:6px;">
            <div class="row" @click="openReq">
              <div class="notif-ico" style="background:rgba(10,132,255,.14);">👋</div>
              <div class="row-title">好友申请<span v-if="store.friendReqCount>0" class="row-dot" style="margin-left:6px;">{{store.friendReqCount}}</span></div>
              <svg class="chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
            </div>
            <div class="row" @click="openAllMoments">
              <div class="notif-ico" style="background:rgba(255,159,10,.14);">🌐</div>
              <div class="row-title">动态<span style="font-size:11px;color:#a9abb2;font-weight:400;margin-left:6px;">所有人的动态</span></div>
              <svg class="chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
            </div>
            <div class="row" @click="openFriendMoments">
              <div class="notif-ico" style="background:rgba(48,209,88,.14);">🧑‍🤝‍🧑</div>
              <div class="row-title">好友动态<span style="font-size:11px;color:#a9abb2;font-weight:400;margin-left:6px;">仅好友可见的动态</span></div>
              <svg class="chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
            </div>
          </div>
          <template v-for="g in groups" :key="g.letter">
            <div class="idx-letter">{{g.letter}}</div>
            <div class="list-card">
              <div class="row" v-for="f in g.items" :key="f.id" @click="openProfile(f)">
                <UI.Avatar :src="f.avatar" :name="f.remark||f.username" :online="f.online" :size="42"/>
                <div style="flex:1;min-width:0;">
                  <div class="row-title">{{f.remark||f.username}}<span v-if="f.online" class="tag-online" style="font-size:11px;">在线</span></div>
                </div>
                <button class="btn mini" @click.stop="openChat(f)">发消息</button>
              </div>
            </div>
          </template>
          <div v-if="!store.friends.length" class="empty"><span>还没有好友</span></div>
        </div>
      </div>`
  };

  // ================= Friend requests =================
  const FriendRequests = {
    data: () => ({ incoming: [], outgoing: [] }),
    async mounted() {
      await this.load();
      store.friendReqCount = 0;
    },
    methods: {
      async load() {
        try {
          const r = await JC.api('GET', '/api/friends/requests');
          this.incoming = r.incoming; this.outgoing = r.outgoing;
        } catch (e) { JC.toast(e.message); }
      },
      async accept(r) {
        try { await JC.api('POST', `/api/friends/requests/${r.id}/accept`); JC.toast('已通过 ' + r.user.username + ' 的好友申请'); this.load(); JC.refreshFriends(); }
        catch (e) { JC.toast(e.message); }
      },
      async reject(r) {
        try { await JC.api('POST', `/api/friends/requests/${r.id}/reject`); this.load(); }
        catch (e) { JC.toast(e.message); }
      }
    },
    template: `
      <div class="page">
        <UI.NavHeader title="好友申请" @back="$root.back()"></UI.NavHeader>
        <div class="page-inner safe-bottom">
          <div class="section-label">收到的申请</div>
          <div class="list-card">
            <div class="row" v-for="r in incoming" :key="r.id">
              <UI.Avatar :src="r.user.avatar" :name="r.user.username"/>
              <div style="flex:1;min-width:0;">
                <div class="row-title">{{r.user.username}}</div>
                <div style="font-size:11px;color:#a9abb2;">{{JC.fmtFull(r.createdAt)}}</div>
              </div>
              <button class="btn mini" @click="accept(r)">通过</button>
              <button class="btn mini plain" style="color:#ff3b30;" @click="reject(r)">拒绝</button>
            </div>
            <div v-if="!incoming.length" class="empty"><span>暂无好友申请</span></div>
          </div>
          <div class="section-label">我发出的申请</div>
          <div class="list-card" style="margin-bottom:20px;">
            <div class="row" v-for="r in outgoing" :key="r.id">
              <UI.Avatar :src="r.user.avatar" :name="r.user.username"/>
              <div class="row-title">{{r.user.username}}</div>
              <span style="font-size:12px;color:#a9abb2;">等待对方通过</span>
            </div>
            <div v-if="!outgoing.length" class="empty"><span>暂无发出的申请</span></div>
          </div>
        </div>
      </div>`
  };

  // ================= Friend profile =================
  const FriendProfile = {
    props: ['friendId'],
    data: () => ({ f: null, showRemark: false, remark: '' }),
    async mounted() { await this.load(); },
    methods: {
      async load() {
        if (!store.friends.length) await JC.refreshFriends();
        this.f = store.friends.find(x => x.id === Number(this.friendId)) || null;
        if (this.f) this.remark = this.f.remark || '';
      },
      chat() { this.$root.go('chat', { convType: 'private', convId: this.f.id, name: this.f.remark || this.f.username, avatar: this.f.avatar }); },
      moments() { this.$root.go('friendMoments', { friendId: this.f.id, name: this.f.remark || this.f.username, avatar: this.f.avatar }); },
      saveRemark() {
        JC.api('POST', `/api/friends/${this.f.id}/remark`, { remark: this.remark.trim() })
          .then(() => { JC.toast('备注已保存'); this.showRemark = false; JC.refreshFriends().then(() => this.load()); })
          .catch(e => JC.toast(e.message));
      },
      del() {
        this.$root.confirm('删除好友', `删除后将同时清空聊天记录，确定删除 ${this.f.remark || this.f.username} 吗？`, async () => {
          try {
            await JC.api('DELETE', '/api/friends/' + this.f.id);
            JC.toast('已删除好友');
            await JC.refreshFriends();
            this.$root.back();
          } catch (e) { JC.toast(e.message); }
        });
      }
    },
    template: `
      <div class="page" v-if="f">
        <UI.NavHeader title="好友资料" @back="$root.back()"></UI.NavHeader>
        <div class="page-inner safe-bottom">
          <div class="card" style="margin:10px 12px;padding:20px;display:flex;flex-direction:column;align-items:center;gap:10px;">
            <UI.Avatar :src="f.avatar" :name="f.remark||f.username" :online="store.presence[f.id]" :size="84" :radius="24"/>
            <div style="font-size:20px;font-weight:800;">{{f.remark||f.username}}</div>
            <div style="font-size:12.5px;color:#8e8e93;">{{f.online?'🟢 在线':'⚪ 离线'}} · 昵称 {{f.username}}</div>
          </div>
          <div class="list-card">
            <div class="row" @click="showRemark=true">
              <div class="notif-ico" style="background:rgba(10,132,255,.12);">✏️</div>
              <div class="row-title">设置备注和资料</div>
              <span style="font-size:13px;color:#8e8e93;">{{f.remark||'未设置'}}</span>
              <svg class="chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
            </div>
            <div class="row" @click="moments">
              <div class="notif-ico" style="background:rgba(255,159,10,.12);">🖼</div>
              <div class="row-title">查看好友动态</div>
              <svg class="chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
            </div>
          </div>
          <div style="padding:14px 12px;display:flex;flex-direction:column;gap:10px;">
            <button class="btn" @click="chat">💬 发消息</button>
            <button class="btn danger" @click="del">删除好友</button>
          </div>
        </div>
        <UI.Modal :show="showRemark" title="设置备注" @close="showRemark=false">
          <div class="field" style="margin:0;"><input v-model="remark" placeholder="备注名（最多 20 字）" maxlength="20"/></div>
          <div class="modal-btns"><button class="btn plain" @click="showRemark=false">取消</button><button class="btn" @click="saveRemark">保存</button></div>
        </UI.Modal>
      </div>`
  };

  window.Views = window.Views || {};
  window.Views.contacts = Contacts;
  window.Views.friendRequests = FriendRequests;
  window.Views.friendProfile = FriendProfile;
})();
