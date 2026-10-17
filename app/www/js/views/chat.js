/* Jay Chat — chat page (private + group) */
(function () {
  const { JC, Stickers } = window;
  const store = JC.store;

  const Chat = {
    props: ['convType', 'convId', 'name', 'avatar'],
    data: () => ({
      store, list: [], peerRead: 0, groupReads: {}, members: [], group: null, myRole: 'member',
      text: '', panel: '', emojiCat: 0, stickerCat: 0, onlineGifs: [],
      loadingMore: false, noMore: false,
      selected: [], oneTime: false,
      viewer: { src: '', type: '', burnTip: '', msgId: 0 },
      aiPop: false, atAI: false,
      settingsSheet: false, muteVal: false,
      onlineSheet: false,
      typing: false, _typingTimer: null, _lastTyping: 0,
      sending: false, uploadPct: 0
    }),
    computed: {
      id() { return Number(this.convId); },
      isGroup() { return this.convType === 'group'; },
      title() {
        if (this.name) return this.name;
        if (this.isGroup) return this.group?.name || '群聊';
        return this.peer()?.username || '聊天';
      },
      peer() { return () => store.friends.find(f => f.id === this.id) || {}; },
      subtitle() {
        if (this.isGroup) return this.group ? `${this.onlineCount}人在线 · ${this.group.memberCount}人` : '';
        return store.presence[this.id] ? '在线' : (this.typing ? '对方正在输入…' : '离线');
      },
      onlineCount() { return this.members.filter(m => m.online).length; },
      onlineMembers() { return this.members.filter(m => m.online); },
      isOfficial() { return this.isGroup && this.group?.isOfficial; },
      emojiCats() { return Stickers.EMOJI_CATS; },
      stickerCats() { return Stickers.STICKER_CATS; },
      visibleList() {
        const hidden = JSON.parse(localStorage.getItem('jc_hidden_msgs') || '[]');
        return this.list.filter(m => !hidden.includes(m.id));
      }
    },
    async mounted() {
      await this.loadHistory();
      if (this.isGroup) await this.loadGroup();
      this.markRead();
      JC.onBus('msg-new', m => this.onNew(m));
      JC.onBus('msg-update', m => this.onUpdate(m));
      JC.onBus('read-update', d => this.onReadUpdate(d));
      JC.onBus('presence', () => { this.$forceUpdate(); });
      window.__chatPage = this;
    },
    unmounted() { window.__chatPage = null; },
    methods: {
      async loadHistory() {
        try {
          const r = await JC.api('GET', `/api/messages?convType=${this.convType}&convId=${this.id}&limit=50`);
          this.list = r.messages;
          if (this.isGroup) this.groupReads = r.reads || {};
          else this.peerRead = r.reads?.[this.id] || 0;
          this.$nextTick(() => this.scrollToBottom(false));
        } catch (e) { JC.toast(e.message); }
      },
      async loadGroup() {
        try {
          const r = await JC.api('GET', '/api/groups/' + this.id);
          this.group = r.group; this.members = r.members; this.myRole = r.myRole;
          const conv = store.conversations.find(c => c.convType === 'group' && c.convId === this.id);
          this.muteVal = !!conv?.muted;
        } catch (e) { JC.toast(e.message); }
      },
      async loadMore() {
        if (this.loadingMore || this.noMore || !this.list.length) return;
        this.loadingMore = true;
        try {
          const r = await JC.api('GET', `/api/messages?convType=${this.convType}&convId=${this.id}&before=${this.list[0].id}&limit=30`);
          if (!r.messages.length) this.noMore = true;
          this.list = [...r.messages, ...this.list];
          if (this.isGroup) Object.assign(this.groupReads, r.reads || {});
        } catch (e) { }
        this.loadingMore = false;
      },
      markRead() {
        const last = this.list[this.list.length - 1];
        if (last) JC.markRead(this.convType, this.id, last.id);
        // clear unread badge for this conv
        const c = store.conversations.find(c => c.convType === this.convType && c.convId === this.id);
        if (c) c.unread = 0;
      },
      onNew(m) {
        const inConv = this.isGroup ? (m.convType === 'group' && m.convId === this.id) : (m.convType === 'private' && (m.sender.id === this.id || m.convId === this.id));
        if (!inConv) return;
        const exists = this.list.some(x => x.id === m.id);
        if (!exists) this.list.push(m);
        this.$nextTick(() => this.scrollToBottom(true));
        this.markRead();
      },
      onUpdate(m) {
        const i = this.list.findIndex(x => x.id === m.id);
        if (i > -1) this.list[i] = m;
      },
      onReadUpdate(d) {
        if (this.isGroup) {
          if (d.convType === 'group' && d.convId === this.id) this.groupReads[d.userId] = d.lastReadMsgId;
        } else if (d.convType === 'private' && d.userId === this.id) {
          this.peerRead = Math.max(this.peerRead, d.lastReadMsgId);
        }
        this.$forceUpdate();
      },
      scrollToBottom(smooth) {
        const el = this.$refs.body;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
      },
      onScroll(e) {
        const el = e.target;
        if (el.scrollTop < 60) this.loadMore();
      },
      // ---- display helpers ----
      fmtTime(m, i) {
        const prev = this.visibleList[i - 1];
        if (!prev || m.createdAt - prev.createdAt > 5 * 60 * 1000) return JC.fmtFull(m.createdAt);
        return '';
      },
      senderName(m) { return m.sender.username; },
      mediaSrc(m) {
        if (m.expired) return '';
        const url = Stickers.resolveSticker(m.mediaUrl);
        if (/^https?:/i.test(url)) return url;
        if (url.startsWith('data:')) return url;
        return JC.serverUrl() + url;
      },
      isRead(m) { return this.peerRead >= m.id; },
      groupReadCount(m) {
        let n = 0;
        for (const [uid, rid] of Object.entries(this.groupReads)) {
          if (Number(uid) !== store.me.id && rid >= m.id) n++;
        }
        return n;
      },
      canRecall(m) { return m.sender.id === store.me.id && !m.recalled && Date.now() - m.createdAt < 180000; },
      // ---- one-time media ----
      async viewOnce(m) {
        try {
          const res = await fetch(`${JC.serverUrl()}/api/messages/${m.id}/media`, { headers: { Authorization: 'Bearer ' + store.token } });
          if (!res.ok) { JC.toast('内容已销毁'); this.onUpdate({ ...m, expired: true, mediaUrl: '' }); return; }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          let left = 5;
          this.viewer = { src: url, type: m.type, burnTip: `阅后即焚 · ${left}s 后销毁`, msgId: m.id };
          const timer = setInterval(() => {
            left--;
            if (left <= 0) {
              clearInterval(timer);
              this.viewer = { src: '', type: '', burnTip: '', msgId: 0 };
              this.burnOnce(m);
            } else this.viewer.burnTip = `阅后即焚 · ${left}s 后销毁`;
          }, 1000);
        } catch (e) { JC.toast('加载失败'); }
      },
      async burnOnce(m) {
        try { await JC.api('POST', `/api/messages/${m.id}/seen-once`); } catch (e) { }
        this.onUpdate({ ...m, expired: true, mediaUrl: '' });
      },
      openMedia(m) {
        if (m.oneTime && m.sender.id !== store.me.id) { this.viewOnce(m); return; }
        const src = this.mediaSrc(m);
        if (m.expired || !src) return;
        this.viewer = { src, type: m.type, burnTip: '', msgId: 0 };
      },
      closeViewer() {
        const msgId = this.viewer.msgId;
        this.viewer = { src: '', type: '', burnTip: '', msgId: 0 };
        if (msgId) {
          const m = this.list.find(x => x.id === msgId);
          if (m) this.burnOnce(m);
        }
      },
      // ---- long press ----
      longPress(m, evt) {
        if (navigator.vibrate) navigator.vibrate(10);
        const actions = [];
        if (this.canRecall(m)) actions.push({ label: '撤回', act: 'recall' });
        if (m.type === 'text' && !m.recalled) actions.push({ label: '复制', act: 'copy' });
        actions.push({ label: '删除', act: 'del', danger: true });
        this.$root.sheet('消息操作', actions, async a => {
          if (a.act === 'recall') {
            try { await JC.api('POST', `/api/messages/${m.id}/recall`); } catch (e) { JC.toast(e.message); }
          } else if (a.act === 'copy') {
            try { await navigator.clipboard.writeText(m.content); JC.toast('已复制'); } catch (e) { JC.toast('复制失败'); }
          } else if (a.act === 'del') {
            const hidden = JSON.parse(localStorage.getItem('jc_hidden_msgs') || '[]');
            hidden.push(m.id);
            localStorage.setItem('jc_hidden_msgs', JSON.stringify(hidden));
            this.$forceUpdate();
          }
        });
      },
      // ---- send ----
      onInput() {
        if (this.isOfficial && !this.atAI && /@[\s]*$/.test(this.text)) this.aiPop = true;
        // typing indicator
        const now = Date.now();
        if (now - this._lastTyping > 2000) {
          this._lastTyping = now;
          JC.getSocket()?.emit('typing', { convType: this.convType, convId: this.id });
        }
      },
      pickAI() {
        this.aiPop = false;
        this.atAI = true;
        this.text = this.text.replace(/@[\s]*$/, '') + '@Jay AI ';
        this.$refs.input.focus();
      },
      async send() {
        const content = this.text.trim();
        if (!content || this.sending) return;
        this.sending = true;
        this.text = '';
        this.atAI = false; this.aiPop = false;
        JC.sendMessage({ convType: this.convType, convId: this.id, type: 'text', content }, r => {
          if (r && r.error) JC.toast(r.error);
        });
        this.sending = false;
      },
      async pickMedia(capture) {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*,video/*';
        if (capture) inp.setAttribute('capture', 'environment');
        inp.multiple = !capture;
        inp.onchange = () => {
          const files = [...inp.files].slice(0, 9);
          for (const f of files) {
            const isVideo = /^video\//i.test(f.type);
            this.selected.push({ file: f, preview: URL.createObjectURL(f), type: isVideo ? 'video' : 'image' });
          }
        };
        inp.click();
      },
      removeSelected(i) { this.selected.splice(i, 1); },
      async sendSelected() {
        if (!this.selected.length || this.sending) return;
        this.sending = true;
        const items = [...this.selected];
        this.selected = [];
        for (const it of items) {
          try {
            const file = it.type === 'image' ? await JC.compressImage(it.file) : it.file;
            const r = await JC.upload(file, p => { this.uploadPct = Math.round(p * 100); });
            JC.sendMessage({
              convType: this.convType, convId: this.id, type: it.type,
              mediaUrl: r.url, oneTime: this.oneTime, content: ''
            }, resp => { if (resp && resp.error) JC.toast(resp.error); });
          } catch (e) { JC.toast(e.message); }
        }
        this.uploadPct = 0;
        this.oneTime = false;
        this.sending = false;
      },
      sendSticker(url) {
        this.panel = '';
        const mediaUrl = url.startsWith('data:') ? (Stickers.STICKER_CATS.flat ? url : url) : url;
        // resolve local sticker to sticker:<id> form if from local cats
        let final = url;
        for (const c of Stickers.STICKER_CATS) for (const s of c.stickers) if (s.url === url) final = 'sticker:' + s.id;
        JC.sendMessage({ convType: this.convType, convId: this.id, type: 'image', mediaUrl: final, content: '' }, r => { if (r && r.error) JC.toast(r.error); });
      },
      addEmoji(e) { this.text += e; },
      togglePanel(p) { this.panel = this.panel === p ? '' : p; },
      // ---- settings ----
      barsMenu() {
        if (this.isGroup) { this.$root.go('groupInfo', { groupId: this.id }); return; }
        this.$root.sheet('聊天设置', [
          { label: '👤 查看好友资料', act: 'profile' },
          { label: '✏️ 设置朋友资料', act: 'remark' },
          { label: '🖼 查看好友动态', act: 'moments' },
          { label: this.muteVal ? '🔔 关闭消息免打扰' : '🔕 消息免打扰', act: 'mute' },
          { label: '🗑 删除好友', act: 'del', danger: true }
        ], a => this.settingsAction(a));
      },
      async settingsAction(a) {
        if (a.act === 'profile') this.$root.go('friendProfile', { friendId: this.id });
        else if (a.act === 'remark') this.$root.go('friendProfile', { friendId: this.id });
        else if (a.act === 'moments') {
          const f = store.friends.find(f => f.id === this.id);
          this.$root.go('friendMoments', { friendId: this.id, name: f?.remark || f?.username || this.title, avatar: f?.avatar });
        }
        else if (a.act === 'mute') {
          this.muteVal = !this.muteVal;
          try { await JC.api('POST', '/api/conversations/mute', { convType: 'private', convId: this.id, muted: this.muteVal }); JC.toast(this.muteVal ? '已开启消息免打扰' : '已关闭消息免打扰'); }
          catch (e) { JC.toast(e.message); }
        }
        else if (a.act === 'del') {
          const f = store.friends.find(f => f.id === this.id);
          this.$root.confirm('删除好友', `确定删除好友 ${f?.remark || f?.username || ''} 吗？`, async () => {
            try { await JC.api('DELETE', '/api/friends/' + this.id); JC.toast('已删除'); this.$root.back(); JC.refreshFriends(); }
            catch (e) { JC.toast(e.message); }
          });
        }
      },
      async toggleMute() {
        this.muteVal = !this.muteVal;
        try { await JC.api('POST', '/api/conversations/mute', { convType: this.convType, convId: this.id, muted: this.muteVal }); }
        catch (e) { JC.toast(e.message); }
      },
      async searchOnlineStickers(q) {
        const res = await Stickers.searchOnline(q);
        this.onlineGifs = res;
      },
      msgClick(m, evt) {
        if (m.oneTime && !m.expired && !m.recalled && m.sender.id !== store.me.id && (m.type === 'image' || m.type === 'video')) this.openMedia(m);
      }
    },
    template: `
      <div class="page">
        <div class="navbar glassy">
          <div class="nav-side"><button class="nav-btn" @click="$root.back()"><svg viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" stroke-width="2.4" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg></button></div>
          <div class="nav-title">
            <div class="title-wrap">
              <div style="display:flex;align-items:center;gap:5px;"><span style="max-width:44vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{title}}</span>
                <span v-if="isOfficial" class="badge-verify"><svg viewBox="0 0 24 24" fill="#fff"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg></span>
              </div>
              <small>{{subtitle}}</small>
            </div>
          </div>
          <div class="nav-side" style="gap:6px;">
            <button v-if="isGroup" class="nav-btn" style="width:auto;padding:0 10px;font-size:11px;font-weight:700;color:#0a84ff;" @click="onlineSheet=true">在线 {{onlineCount}}</button>
            <button class="nav-btn" @click="barsMenu"><svg viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
          </div>
        </div>

        <div class="chat-body" ref="body" @scroll="onScroll">
          <div v-if="loadingMore" class="center-load"><div class="spinner"></div></div>
          <div v-for="(m,i) in visibleList" :key="m.id">
            <div class="msg-time-divider" v-if="fmtTime(m,i)">{{fmtTime(m,i)}}</div>
            <div v-if="m.recalled" class="msg-recalled">{{m.sender.id===store.me.id?'你':m.sender.username}}撤回了一条消息</div>
            <div v-else-if="m.type==='text' && m.sender.isBot" class="msg-system" style="background:rgba(48,209,88,.08);border-radius:12px;padding:8px 12px;display:inline-block;">
              <span style="color:#30d158;font-weight:800;">Jay AI</span><span class="bot-tag" style="margin:0 6px;">机器人</span>{{m.content}}
            </div>
            <div v-else class="msg-item" :class="{mine: m.sender.id===store.me.id}" @long-press="longPress(m, $event)" @contextmenu.prevent="longPress(m, $event)">
              <UI.Avatar :src="m.sender.avatar" :name="m.sender.username" :size="38" v-if="!isGroup || m.sender.id!==store.me.id"/>
              <div style="max-width:68%;min-width:0;">
                <div class="sender-name" v-if="isGroup && m.sender.id!==store.me.id">{{m.sender.username}}<span v-if="m.sender.isBot" class="bot-tag">机器人</span></div>
                <div class="bubble" v-if="m.type==='text'">{{m.content}}</div>
                <div class="bubble" v-else-if="m.type==='image'" style="padding:4px;background:rgba(255,255,255,.9);">
                  <template v-if="m.expired"><div class="destroyed">内容已销毁 🔥</div></template>
                  <template v-else-if="m.oneTime && m.sender.id!==store.me.id">
                    <div class="one-time-mask" @click="viewOnce(m)">
                      <img class="media blur-img" :src="mediaSrc(m)" style="width:160px;height:160px;object-fit:cover;"/>
                      <div class="one-time-cover"><span style="font-size:22px;">🔥</span><span>点击查看 · 阅后即焚</span></div>
                    </div>
                  </template>
                  <template v-else>
                    <img class="media" :src="mediaSrc(m)" @click="openMedia(m)" style="cursor:pointer;"/>
                  </template>
                  <div class="meta"><span v-if="m.oneTime && m.sender.id===store.me.id" style="color:#ff9f0a;">阅后即焚</span><span>{{JC.fmtFull(m.createdAt)}}</span></div>
                </div>
                <div class="bubble" v-else-if="m.type==='video'" style="padding:4px;background:rgba(255,255,255,.9);">
                  <template v-if="m.expired"><div class="destroyed">内容已销毁 🔥</div></template>
                  <template v-else-if="m.oneTime && m.sender.id!==store.me.id">
                    <div class="one-time-mask" @click="viewOnce(m)" style="width:200px;height:150px;background:linear-gradient(135deg,#333,#555);display:flex;align-items:center;justify-content:center;">
                      <div class="one-time-cover" style="position:static;"><span style="font-size:22px;">🔥</span><span>点击查看 · 阅后即焚</span></div>
                    </div>
                  </template>
                  <template v-else>
                    <video class="media" :src="mediaSrc(m)" controls @click.stop style="cursor:pointer;"/>
                  </template>
                  <div class="meta"><span v-if="m.oneTime && m.sender.id===store.me.id" style="color:#ff9f0a;">阅后即焚</span><span>{{JC.fmtFull(m.createdAt)}}</span></div>
                </div>
                <div class="meta" style="justify-content:flex-end;" v-if="m.type==='text'">
                  <span>{{JC.fmtFull(m.createdAt)}}</span>
                </div>
                <div v-if="m.sender.id===store.me.id" style="font-size:10px;text-align:right;margin-top:2px;color:#a9abb2;">
                  <template v-if="isGroup"><span :style="{color: groupReadCount(m)>0?'#30d158':''}">{{groupReadCount(m)}}人已读</span></template>
                  <template v-else><span :style="{color: isRead(m)?'#30d158':'#a9abb2'}">{{isRead(m)?'已读':'未读'}}</span></template>
                </div>
              </div>
              <UI.Avatar v-if="isGroup && m.sender.id===store.me.id" :src="m.sender.avatar" :name="m.sender.username" :size="38"/>
            </div>
          </div>
        </div>

        <!-- selected media preview -->
        <div v-if="selected.length" style="padding:10px;background:rgba(255,255,255,.85);backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,.7);">
          <div style="display:flex;gap:8px;overflow-x:auto;">
            <div v-for="(s,i) in selected" :key="i" style="position:relative;width:74px;height:74px;border-radius:12px;overflow:hidden;flex-shrink:0;">
              <img v-if="s.type==='image'" :src="s.preview" style="width:100%;height:100%;object-fit:cover;"/>
              <video v-else :src="s.preview" style="width:100%;height:100%;object-fit:cover;"></video>
              <span @click="removeSelected(i)" style="position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;">✕</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px 0;">
            <label style="display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600;color:#ff9f0a;">
              <input type="checkbox" v-model="oneTime" style="width:17px;height:17px;accent-color:#ff9f0a;"/> 🔥 一次性查看（阅后即焚）
            </label>
            <button class="btn mini" :disabled="sending" @click="sendSelected">{{sending?('上传中 '+uploadPct+'%'):'发送'}}</button>
          </div>
        </div>

        <div class="inputbar">
          <button class="icon-btn" :class="{on:panel==='emoji'}" @click="togglePanel('emoji')">
            <svg viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8"/><circle cx="9" cy="10" r="1" fill="#1c1c1e"/><circle cx="15" cy="10" r="1" fill="#1c1c1e"/></svg>
          </button>
          <textarea ref="input" v-model="text" rows="1" placeholder="输入消息…" @input="onInput" @keydown.enter.exact.prevent="send"></textarea>
          <button v-if="text.trim()" class="send-btn" @click="send"><svg viewBox="0 0 24 24" fill="#fff"><path d="M3 11l18-8-8 18-2.5-7.5L3 11z"/></svg></button>
          <button v-else class="icon-btn" :class="{on:panel==='plus'}" @click="togglePanel('plus')">
            <svg viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>
          </button>

          <!-- AI popup -->
          <transition name="pop" appear>
            <div v-if="aiPop" class="ai-pop" style="bottom:60px;left:50%;transform:translateX(-50%);" @click="pickAI">
              <img src="/uploads/jay-ai.svg"/> <span>@Jay AI</span><span style="font-size:11px;color:#30d158;font-weight:700;">机器人</span>
            </div>
          </transition>

          <!-- emoji panel -->
          <transition name="sheet" appear>
            <div v-if="panel==='emoji'" class="panel panel-emoji" style="position:fixed;">
              <div class="emoji-cats">
                <button v-for="(c,i) in emojiCats" :key="i" class="emoji-cat" :class="{on: i===emojiCat}" @click="emojiCat=i">{{c.icon}} {{c.name}}</button>
                <button class="emoji-cat" :class="{on: emojiCat===-1}" @click="emojiCat=-1">🎬 动画表情</button>
              </div>
              <div v-if="emojiCat>=0" class="emoji-grid">
                <div class="emoji-cell" v-for="e in emojiCats[emojiCat].list" :key="e" @click="addEmoji(e)">{{e}}</div>
              </div>
              <template v-else>
                <div class="emoji-cats">
                  <button v-for="(c,i) in stickerCats" :key="i" class="emoji-cat" :class="{on: stickerCat===i}" @click="stickerCat=i; onlineGifs=[]">{{c.name}}</button>
                  <button class="emoji-cat" :class="{on: stickerCat===-2}" @click="stickerCat=-2; if(!onlineGifs.length) searchOnlineStickers('热门表情包')">🔥 在线表情包</button>
                </div>
                <div v-if="stickerCat>=0" class="sticker-grid">
                  <div class="sticker-cell" v-for="s in stickerCats[stickerCat].stickers" :key="s.id" @click="sendSticker(s.url)"><img :src="s.url"/></div>
                </div>
                <div v-else class="sticker-grid">
                  <div class="sticker-cell" v-for="(g,i) in onlineGifs" :key="i" @click="sendSticker(g)"><img :src="g" loading="lazy"/></div>
                  <div v-if="!onlineGifs.length" class="empty" style="grid-column:1/-1;"><div class="spinner"></div><span>正在加载在线表情包…</span></div>
                </div>
              </template>
            </div>
          </transition>

          <!-- plus panel -->
          <transition name="sheet" appear>
            <div v-if="panel==='plus'" class="panel panel-plus" style="position:fixed;">
              <div class="plus-item" @click="pickMedia(false)"><div class="ico"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#0a84ff" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-5 3 3 4-4 4 4"/></svg></div><span>相册</span></div>
              <div class="plus-item" @click="pickMedia(true)"><div class="ico"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#30d158" stroke-width="1.8"><rect x="3" y="6" width="18" height="13" rx="3"/><circle cx="12" cy="12.5" r="3.5"/><path d="M9 6l1.2-2h3.6L15 6"/></svg></div><span>拍摄</span></div>
              <div class="plus-item" @click="panel='emoji'; emojiCat=-1;"><div class="ico"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#ff9f0a" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8.5 14c.9 1.2 2.1 1.9 3.5 1.9s2.6-.7 3.5-1.9"/><circle cx="9" cy="9.5" r="1" fill="#ff9f0a"/><circle cx="15" cy="9.5" r="1" fill="#ff9f0a"/></svg></div><span>动画表情</span></div>
              <div class="plus-item" v-if="isOfficial" @click="pickAI(); panel='';"><div class="ico"><img src="/uploads/jay-ai.svg" style="width:34px;height:34px;border-radius:9px;"/></div><span style="color:#30d158;font-weight:700;">Jay AI</span></div>
            </div>
          </transition>
        </div>

        <UI.MediaViewer :src="viewer.src" :type="viewer.type" :burn-tip="viewer.burnTip" @close="closeViewer"/>

        <transition name="mask" appear>
          <div class="mask" v-if="onlineSheet" @click="onlineSheet=false"></div>
        </transition>
        <transition name="sheet" appear>
          <div class="sheet" v-if="onlineSheet" style="max-height:60vh;">
            <div class="sheet-title">当前在线（{{onlineMembers.length}} 人）</div>
            <div style="overflow-y:auto;max-height:46vh;">
              <div class="row" v-for="m in onlineMembers" :key="m.id">
                <UI.Avatar :src="m.avatar" :name="m.username" :online="true" :size="38"/>
                <div class="row-title">{{m.username}}<span class="bot-tag" v-if="m.isBot">机器人</span></div>
                <span class="tag-online" style="font-size:11px;">在线</span>
              </div>
            </div>
            <div class="sheet-item sheet-cancel" @click="onlineSheet=false">关闭</div>
          </div>
        </transition>
      </div>`
  };

  window.Views = window.Views || {};
  window.Views.chat = Chat;
})();
