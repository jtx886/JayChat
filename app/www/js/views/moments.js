/* Jay Chat — moments feed + detail */
(function () {
  const { JC } = window;
  const store = JC.store;

  const MomentCard = {
    props: { m: Object },
    emits: ['refresh', 'reply'],
    data: () => ({ viewer: { src: '', type: '' } }),
    computed: {
      gridCls() { const n = this.m.media.length; return n === 1 ? 'g1' : (n === 2 || n === 4 ? 'g2' : 'g3'); },
      visText() { return { public: '公开', private: '私密', visible: '指定好友', hide: '不给谁看' }[this.m.visibility] || ''; },
      commentList() {
        const byId = {}; this.m.comments.forEach(c => byId[c.id] = c);
        return this.m.comments.map(c => ({ ...c, target: byId[c.targetCommentId]?.user?.username || '' }));
      }
    },
    methods: {
      url(u) { return JC.mediaUrl(u); },
      openMedia(i) {
        const m = this.m.media[i];
        this.viewer = { src: this.url(m.url), type: m.type };
      },
      async like() {
        try {
          const r = await JC.api('POST', `/api/moments/${this.m.id}/like`);
          this.m.liked = r.liked;
          if (r.liked) this.m.likes.push({ id: store.me.id, username: store.me.username, avatar: store.me.avatar });
          else this.m.likes = this.m.likes.filter(l => l.id !== store.me.id);
        } catch (e) { JC.toast(e.message); }
      },
      commentClick(c) {
        const actions = [{ label: `回复 @${c.user.username}`, act: 'reply', ico: 'reply' }];
        if (c.canDelete) actions.push({ label: '删除评论', act: 'del', ico: 'trash', danger: true });
        this.$root.sheet('评论', actions, a => {
          if (a.act === 'reply') this.$emit('reply', { momentId: this.m.id, targetId: c.id, name: c.user.username });
          else if (a.act === 'del') {
            JC.api('DELETE', `/api/moments/comments/${c.id}`)
              .then(() => { this.m.comments = this.m.comments.filter(x => x.id !== c.id); JC.toast('评论已删除'); })
              .catch(e => JC.toast(e.message));
          }
        });
      },
      delMoment() {
        this.$root.confirm('删除动态', '确定删除这条动态吗？删除后不可恢复。', async () => {
          try { await JC.api('DELETE', '/api/moments/' + this.m.id); JC.toast('已删除'); this.$emit('refresh'); }
          catch (e) { JC.toast(e.message); }
        });
      }
    },
    template: `
      <div class="card moment-card">
        <div class="moment-head">
          <UI.Avatar :src="m.user.avatar" :name="m.user.username" :size="42"/>
          <div style="flex:1;min-width:0;">
            <div class="moment-name">{{m.user.username}}<span class="bot-tag" v-if="m.user.isBot" style="margin-left:6px;">机器人</span></div>
            <div class="moment-time">{{JC.fmtFull(m.createdAt)}}</div>
          </div>
          <span class="vis-tag">{{visText}}</span>
          <button v-if="m.isMine" class="moment-act" @click="delMoment" style="color:#ff3b30;"><UI.Icon name="trash" :size="16"/></button>
        </div>
        <div class="moment-text" v-if="m.content">{{m.content}}</div>
        <div class="moment-grid" :class="gridCls" v-if="m.media.length">
          <div class="cell" v-for="(md,i) in m.media" :key="i" @click="openMedia(i)">
            <img v-if="md.type==='image'" :src="url(md.url)" loading="lazy"/>
            <video v-else :src="url(md.url)"></video>
          </div>
        </div>
        <div class="moment-foot">
          <button class="moment-act" :class="{on:m.liked}" @click="like">
            <UI.Icon :name="m.liked?'heart-fill':'heart'" :size="16"/> {{m.likes.length||''}} 赞
          </button>
          <button class="moment-act" @click="$emit('reply',{momentId:m.id,targetId:0,name:m.user.username})">
            <UI.Icon name="comment" :size="16"/> {{m.comments.length||''}} 评论
          </button>
        </div>
        <div class="like-list" v-if="m.likes.length">
          <UI.Icon name="heart-fill" :size="13" style="color:#ff3b30;"/>
          <span v-for="l in m.likes" :key="l.id" style="color:#0a84ff;font-weight:600;">{{l.username}}</span>
        </div>
        <div class="comment-box" v-if="m.comments.length">
          <div class="comment-row" v-for="c in commentList" :key="c.id" @click="commentClick(c)">
            <b>{{c.user.username}}</b><span class="reply-to" v-if="c.target"> 回复 <b style="color:#5e5ce6;">@{{c.target}}</b></span>：{{c.content}}
          </div>
        </div>
        <UI.MediaViewer :src="viewer.src" :type="viewer.type" @close="viewer={src:'',type:''}"/>
      </div>`
  };

  // ================= Feed =================
  const Moments = {
    props: ['scope'],
    components: { MomentCard },
    data: () => ({ list: null, replying: null, replyText: '' }),
    computed: { title() { return { all: '动态', friends: '好友动态', mine: '我的动态' }[this.scope] || '动态'; } },
    async mounted() { await this.load(); this._off = JC.onBus('moments-refresh', () => this.load()); },
    unmounted() { if (this._off) JC.offBus('moments-refresh', this._off); },
    methods: {
      async load() {
        try {
          if (this.scope === 'mine') this.list = (await JC.api('GET', '/api/moments/user/' + store.me.id)).moments;
          else this.list = (await JC.api('GET', '/api/moments/feed?scope=' + this.scope)).moments;
        } catch (e) { JC.toast(e.message); this.list = []; }
      },
      onReply(p) {
        // p.momentId 由卡片显式传入，确保评论到正确的动态
        const mid = p.momentId || (p.targetId ? this.list.find(m => m.comments.some(c => c.id === p.targetId))?.id : this.list[0]?.id);
        this.replying = { momentId: mid, targetId: p.targetId, name: p.name };
        this.$nextTick(() => this.$refs.replyInput?.focus());
      },
      async sendReply() {
        if (!this.replyText.trim() || !this.replying) return;
        try {
          const r = await JC.api('POST', `/api/moments/${this.replying.momentId}/comments`, { content: this.replyText.trim(), targetCommentId: this.replying.targetId });
          const m = this.list.find(x => x.id === this.replying.momentId);
          if (m) m.comments.push(r.comment);
          this.replyText = ''; this.replying = null;
          JC.toast('评论成功');
        } catch (e) { JC.toast(e.message); }
      }
    },
    template: `
      <div class="page">
        <UI.NavHeader :title="title" @back="$root.back()"></UI.NavHeader>
        <div class="page-inner safe-bottom">
          <div v-if="list===null" style="padding:12px;"><div class="skeleton" style="height:150px;margin-bottom:12px;"></div><div class="skeleton" style="height:150px;"></div></div>
          <div v-else-if="!list.length" class="empty"><span>暂无动态，快来发布第一条吧</span></div>
          <MomentCard v-for="m in list" :key="m.id" :m="m" @refresh="load" @reply="onReply"/>
        </div>
        <transition name="sheet" appear>
          <div v-if="replying" style="position:absolute;left:0;right:0;bottom:0;z-index:20;display:flex;gap:8px;padding:10px;background:rgba(255,255,255,.85);backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,.7);">
            <input ref="replyInput" v-model="replyText" :placeholder="'回复 @'+replying.name+'：'" style="flex:1;border:none;outline:none;background:rgba(120,120,128,.1);border-radius:12px;padding:10px 14px;font-size:14px;" @keyup.enter="sendReply"/>
            <button class="btn mini" @click="sendReply">发送</button>
            <button class="btn mini plain" @click="replying=null;replyText=''">取消</button>
          </div>
        </transition>
      </div>`
  };

  // ================= Friend moments (single author) =================
  const FriendMoments = {
    props: ['friendId', 'name', 'avatar'],
    components: { MomentCard },
    data: () => ({ list: null, replying: null, replyText: '' }),
    async mounted() {
      try { this.list = (await JC.api('GET', '/api/friends/' + this.friendId + '/moments')).moments; }
      catch (e) { JC.toast(e.message); this.list = []; }
    },
    methods: {
      onReply(p) {
        const mid = p.momentId || (p.targetId ? this.list.find(m => m.comments.some(c => c.id === p.targetId))?.id : this.list[0]?.id);
        this.replying = { momentId: mid, targetId: p.targetId, name: p.name };
        this.$nextTick(() => this.$refs.replyInput?.focus());
      },
      async sendReply() {
        if (!this.replyText.trim() || !this.replying) return;
        try {
          const r = await JC.api('POST', `/api/moments/${this.replying.momentId}/comments`, { content: this.replyText.trim(), targetCommentId: this.replying.targetId });
          const m = this.list.find(x => x.id === this.replying.momentId);
          if (m) m.comments.push(r.comment);
          this.replyText = ''; this.replying = null;
          JC.toast('评论成功');
        } catch (e) { JC.toast(e.message); }
      }
    },
    template: `
      <div class="page">
        <UI.NavHeader :title="(name||'好友')+' 的动态'" @back="$root.back()"></UI.NavHeader>
        <div class="page-inner safe-bottom">
          <div class="card" style="margin:10px 12px;padding:18px;display:flex;align-items:center;gap:14px;">
            <UI.Avatar :src="avatar" :name="name" :size="56" :radius="18"/>
            <div><div style="font-size:17px;font-weight:800;">{{name}}</div><div style="font-size:12px;color:#8e8e93;">共 {{list?.length||0}} 条动态</div></div>
          </div>
          <div v-if="list===null" style="padding:12px;"><div class="skeleton" style="height:150px;"></div></div>
          <div v-else-if="!list.length" class="empty"><span>该用户暂无公开动态</span></div>
          <MomentCard v-for="m in list" :key="m.id" :m="m" @refresh="load" @reply="onReply"/>
        </div>
        <transition name="sheet" appear>
          <div v-if="replying" style="position:absolute;left:0;right:0;bottom:0;z-index:20;display:flex;gap:8px;padding:10px;background:rgba(255,255,255,.85);backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,.7);">
            <input ref="replyInput" v-model="replyText" :placeholder="'回复 @'+replying.name+'：'" style="flex:1;border:none;outline:none;background:rgba(120,120,128,.1);border-radius:12px;padding:10px 14px;font-size:14px;" @keyup.enter="sendReply"/>
            <button class="btn mini" @click="sendReply">发送</button>
            <button class="btn mini plain" @click="replying=null;replyText=''">取消</button>
          </div>
        </transition>
      </div>`
  };

  // ================= Moment detail (from notification) =================
  const MomentDetail = {
    props: ['id'],
    components: { MomentCard },
    data: () => ({ m: null, replying: null, replyText: '' }),
    async mounted() {
      try { this.m = (await JC.api('GET', '/api/moments/' + this.id)).moment; }
      catch (e) { JC.toast(e.message); }
    },
    methods: {
      onReply(p) {
        this.replying = { momentId: this.m.id, targetId: p.targetId, name: p.name };
        this.$nextTick(() => this.$refs.replyInput?.focus());
      },
      async sendReply() {
        if (!this.replyText.trim()) return;
        try {
          const r = await JC.api('POST', `/api/moments/${this.m.id}/comments`, { content: this.replyText.trim(), targetCommentId: this.replying.targetId });
          this.m.comments.push(r.comment);
          this.replyText = ''; this.replying = null;
        } catch (e) { JC.toast(e.message); }
      }
    },
    template: `
      <div class="page">
        <UI.NavHeader title="动态详情" @back="$root.back()"></UI.NavHeader>
        <div class="page-inner safe-bottom">
          <div v-if="!m" class="empty"><div class="spinner"></div><span>加载中…</span></div>
          <MomentCard v-else :m="m" @reply="onReply"/>
        </div>
        <transition name="sheet" appear>
          <div v-if="replying" style="position:absolute;left:0;right:0;bottom:0;z-index:20;display:flex;gap:8px;padding:10px;background:rgba(255,255,255,.85);backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,.7);">
            <input ref="replyInput" v-model="replyText" :placeholder="'回复 @'+replying.name+'：'" style="flex:1;border:none;outline:none;background:rgba(120,120,128,.1);border-radius:12px;padding:10px 14px;font-size:14px;" @keyup.enter="sendReply"/>
            <button class="btn mini" @click="sendReply">发送</button>
            <button class="btn mini plain" @click="replying=null;replyText=''">取消</button>
          </div>
        </transition>
      </div>`
  };

  window.Views = window.Views || {};
  window.Views.moments = Moments;
  window.Views.friendMoments = FriendMoments;
  window.Views.momentDetail = MomentDetail;
})();
