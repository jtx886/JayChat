/* Jay Chat — chat page (private + group) 文本/图片/视频/语音/引用/转发/搜索 */
(function () {
  const { JC, Stickers, Icons } = window;
  const store = JC.store;

  function msgPreview(m) {
    if (!m) return '';
    if (m.type === 'image') return '[图片]';
    if (m.type === 'video') return '[视频]';
    if (m.type === 'voice') return '[语音]';
    if (m.type === 'quote') return '[引用] ' + (JC.quoteText(m).text || '');
    return m.content;
  }

  const Chat = {
    props: ['convType', 'convId', 'name', 'avatar'],
    data: () => ({
      store, list: [], peerRead: 0, groupReads: {}, members: [], group: null, myRole: 'member',
      text: '', panel: '', emojiCat: 0, packCat: 0,
      loadingMore: false, noMore: false,
      selected: [], oneTime: false,
      viewer: { src: '', type: '', burnTip: '', msgId: 0 },
      aiPop: false, atAI: false,
      settingsSheet: false, muteVal: false,
      onlineSheet: false,
      typing: false, _typingTimer: null, _lastTyping: 0,
      sending: false, uploadPct: 0,
      // 新功能
      replyTo: null,          // 引用回复 {id, sender, preview}
      searchOn: false, searchQ: '',
      playingId: 0,
      recording: false, recSeconds: 0, recCancel: false,
      forwardMsg: null,       // 待转发消息
      busHandlers: [],
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
        if (this.typing) return '对方正在输入…';
        return store.presence[this.id] ? '在线' : '离线';
      },
      onlineCount() { return this.members.filter(m => m.online).length; },
      onlineMembers() { return this.members.filter(m => m.online); },
      isOfficial() { return this.isGroup && this.group?.isOfficial; },
      emojiCats() { return Stickers.EMOJI_CATS; },
      packs() { return Stickers.PACKS; },
      filteredList() {
        const hidden = JSON.parse(localStorage.getItem('jc_hidden_msgs') || '[]');
        let arr = this.list.filter(m => !hidden.includes(m.id));
        if (this.searchOn && this.searchQ.trim()) {
          const q = this.searchQ.trim().toLowerCase();
          arr = arr.filter(m => (m.content || '').toLowerCase().includes(q) || (m.sender?.username || '').toLowerCase().includes(q));
        }
        return arr;
      },
      visibleList() { return this.filteredList; },
      forwardTargets() {
        const t = [];
        for (const f of store.friends) t.push({ convType: 'private', convId: f.id, name: f.remark || f.username, avatar: f.avatar });
        for (const c of store.conversations) if (c.convType === 'group') t.push({ convType: 'group', convId: c.convId, name: c.name, avatar: c.avatar });
        return t;
      }
    },
    async mounted() {
      await this.loadHistory();
      if (this.isGroup) await this.loadGroup();
      this.markRead();
      const h = this.busHandlers;
      h.push(['msg-new', JC.onBus('msg-new', m => this.onNew(m))]);
      h.push(['msg-update', JC.onBus('msg-update', m => this.onUpdate(m))]);
      h.push(['read-update', JC.onBus('read-update', d => this.onReadUpdate(d))]);
      h.push(['presence', JC.onBus('presence', () => { this.$forceUpdate(); })]);
      h.push(['typing', JC.onBus('typing', d => this.onTyping(d))]);
      window.__chatPage = this;
    },
    unmounted() {
      for (const [evt, fn] of this.busHandlers) JC.offBus(evt, fn);
      this.busHandlers = [];
      if (window.__chatPage === this) window.__chatPage = null;
      this.stopRecording(true);
      if (this._audio) { try { this._audio.pause(); } catch (e) { } }
    },
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
        const c = store.conversations.find(c => c.convType === this.convType && c.convId === this.id);
        if (c) c.unread = 0;
      },
      onNew(m) {
        const inConv = this.isGroup
          ? (m.convType === 'group' && m.convId === this.id)
          : (m.convType === 'private' && (m.sender.id === this.id || m.convId === this.id));
        if (!inConv) return;
        const exists = this.list.some(x => x.id === m.id);
        if (!exists) this.list.push(m);
        this.typing = false;
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
      onTyping(d) {
        let hit = false;
        if (d.convType === 'group' && d.convId === this.id && d.userId !== store.me?.id) hit = true;
        if (d.convType === 'private' && d.userId === this.id) hit = true;
        if (!hit) return;
        this.typing = true;
        clearTimeout(this._typingTimer);
        this._typingTimer = setTimeout(() => { this.typing = false; }, 3000);
      },
      scrollToBottom(smooth) {
        const el = this.$refs.body;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
      },
      onScroll(e) {
        const el = e.target;
        if (el.scrollTop < 60 && !this.searchOn) this.loadMore();
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
        return JC.mediaUrl(url);
      },
      quoteOf(m) { return JC.quoteText(m); },
      isRead(m) { return this.peerRead >= m.id; },
      groupReadCount(m) {
        let n = 0;
        for (const [uid, rid] of Object.entries(this.groupReads)) {
          if (Number(uid) !== store.me.id && rid >= m.id) n++;
        }
        return n;
      },
      canRecall(m) { return m.sender.id === store.me.id && !m.recalled && Date.now() - m.createdAt < 180000; },
      // ---- 语音 ----
      async playVoice(m) {
        if (this.playingId === m.id) { try { this._audio.pause(); } catch (e) { } this.playingId = 0; return; }
        try {
          if (this._audio) { try { this._audio.pause(); } catch (e) { } }
          const src = this.mediaSrc(m);
          if (!src) return;
          this._audio = new Audio(src);
          this._audio.onended = () => { this.playingId = 0; };
          this._audio.onerror = () => { this.playingId = 0; JC.toast('语音播放失败'); };
          this.playingId = m.id;
          await this._audio.play();
        } catch (e) { this.playingId = 0; }
      },
      async startRecording() {
        if (this.recording) return;
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          let mime = '';
          for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', '']) {
            if (!t || (window.MediaRecorder && MediaRecorder.isTypeSupported(t))) { mime = t; break; }
          }
          this._recStream = stream;
          this._recChunks = [];
          this._recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
          this._recorder.ondataavailable = e => { if (e.data && e.data.size) this._recChunks.push(e.data); };
          this._recorder.onstop = () => this.finishRecording();
          this._recorder.start();
          this.recording = true; this.recSeconds = 0; this.recCancel = false;
          this._recTimer = setInterval(() => {
            this.recSeconds++;
            if (this.recSeconds >= 60) this.stopRecording();
          }, 1000);
        } catch (e) {
          JC.toast('无法访问麦克风，请检查权限');
        }
      },
      stopRecording(cancel) {
        if (!this.recording) return;
        if (cancel !== undefined) this.recCancel = !!cancel;
        this.recording = false;
        clearInterval(this._recTimer);
        try { this._recorder.stop(); } catch (e) { this._cleanupRec(); }
      },
      async finishRecording() {
        const secs = Math.max(1, this.recSeconds);
        const chunks = this._recChunks || [];
        const mime = this._recorder?.mimeType || 'audio/webm';
        this._cleanupRec();
        if (this.recCancel) return;
        if (!chunks.length) return JC.toast('录音失败');
        const blob = new Blob(chunks, { type: mime.split(';')[0] });
        const ext = /mp4/.test(mime) ? 'm4a' : 'webm';
        try {
          const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mime.split(';')[0] });
          const r = await JC.upload(file);
          JC.sendMessage({ convType: this.convType, convId: this.id, type: 'voice', mediaUrl: r.url, content: String(secs) }, resp => { if (resp && resp.error) JC.toast(resp.error); });
        } catch (e) { JC.toast(e.message); }
      },
      _cleanupRec() {
        if (this._recStream) { for (const t of this._recStream.getTracks()) try { t.stop(); } catch (e) { } this._recStream = null; }
        this._recorder = null; this._recChunks = []; this.recSeconds = 0;
      },
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
        if (this.canRecall(m)) actions.push({ label: '撤回', act: 'recall', ico: 'undo' });
        if (m.type === 'text' || m.type === 'quote') actions.push({ label: '复制', act: 'copy', ico: 'copy' });
        actions.push({ label: '引用', act: 'quote', ico: 'reply' });
        actions.push({ label: '转发', act: 'forward', ico: 'forward' });
        actions.push({ label: '删除', act: 'del', ico: 'trash', danger: true });
        this.$root.sheet('消息操作', actions, async a => {
          if (a.act === 'recall') {
            try {
              await JC.api('POST', `/api/messages/${m.id}/recall`);
              // 本端立即生效（私聊的对方通过腾讯 IM 信号收到撤回）
              this.onUpdate({ ...m, recalled: true, content: '', mediaUrl: '' });
            } catch (e) { JC.toast(e.message); }
          } else if (a.act === 'copy') {
            try { await navigator.clipboard.writeText(m.type === 'quote' ? this.quoteOf(m).text : m.content); JC.toast('已复制'); } catch (e) { JC.toast('复制失败'); }
          } else if (a.act === 'quote') {
            this.replyTo = { id: m.id, sender: m.sender.username, preview: msgPreview(m) };
            this.$nextTick(() => this.$refs.input?.focus());
          } else if (a.act === 'forward') {
            this.forwardMsg = m;
          } else if (a.act === 'del') {
            const hidden = JSON.parse(localStorage.getItem('jc_hidden_msgs') || '[]');
            hidden.push(m.id);
            localStorage.setItem('jc_hidden_msgs', JSON.stringify(hidden));
            this.$forceUpdate();
          }
        });
      },
      async doForward(target) {
        const m = this.forwardMsg;
        this.forwardMsg = null;
        if (!m) return;
        if (m.type === 'text') {
          JC.sendMessage({ convType: target.convType, convId: target.convId, type: 'text', content: m.content }, r => { if (r && r.error) JC.toast(r.error); });
        } else if (m.type === 'quote') {
          JC.sendMessage({ convType: target.convType, convId: target.convId, type: 'quote', content: m.content }, r => { if (r && r.error) JC.toast(r.error); });
        } else if (m.type === 'image' || m.type === 'video' || m.type === 'voice') {
          JC.sendMessage({ convType: target.convType, convId: target.convId, type: m.type, mediaUrl: m.mediaUrl, content: m.content || '' }, r => { if (r && r.error) JC.toast(r.error); });
        } else {
          JC.toast('该类型暂不支持转发');
        }
      },
      // ---- send ----
      onInput() {
        if (this.isOfficial && !this.atAI && /@[\s]*$/.test(this.text)) this.aiPop = true;
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
        if (this.replyTo) {
          const q = JSON.stringify({
            text: content,
            quoteId: this.replyTo.id || 0,
            quoteSender: this.replyTo.sender || '',
            quotePreview: (this.replyTo.preview || '').slice(0, 60)
          });
          JC.sendMessage({ convType: this.convType, convId: this.id, type: 'quote', content: q }, r => { if (r && r.error) JC.toast(r.error); });
          this.replyTo = null;
        } else {
          JC.sendMessage({ convType: this.convType, convId: this.id, type: 'text', content }, r => { if (r && r.error) JC.toast(r.error); });
        }
        this.sending = false;
      },
      cancelReply() { this.replyTo = null; },
      // ---- media ----
      pickMedia(capture) {
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
        const final = Stickers.normalizeForSend(url);
        if (!final) return JC.toast('该表情暂不支持发送');
        JC.sendMessage({ convType: this.convType, convId: this.id, type: 'image', mediaUrl: final, content: '' }, r => { if (r && r.error) JC.toast(r.error); });
      },
      addEmoji(e) { this.text += e; },
      togglePanel(p) { this.panel = this.panel === p ? '' : p; },
      // ---- settings ----
      barsMenu() {
        if (this.isGroup) { this.$root.go('groupInfo', { groupId: this.id }); return; }
        this.$root.sheet('聊天设置', [
          { label: '查看好友资料', act: 'profile', ico: 'user' },
          { label: '设置朋友资料', act: 'remark', ico: 'edit' },
          { label: '查看好友动态', act: 'moments', ico: 'image' },
          { label: '聊天记录搜索', act: 'search', ico: 'search' },
          { label: this.muteVal ? '关闭消息免打扰' : '消息免打扰', act: 'mute', ico: this.muteVal ? 'bell' : 'bell-off' },
          { label: '删除好友', act: 'del', ico: 'trash', danger: true }
        ], a => this.settingsAction(a));
      },
      async settingsAction(a) {
        if (a.act === 'profile') this.$root.go('friendProfile', { friendId: this.id });
        else if (a.act === 'remark') this.$root.go('friendProfile', { friendId: this.id });
        else if (a.act === 'moments') {
          const f = store.friends.find(f => f.id === this.id);
          this.$root.go('friendMoments', { friendId: this.id, name: f?.remark || f?.username || this.title, avatar: f?.avatar });
        }
        else if (a.act === 'search') { this.searchOn = true; this.$nextTick(() => this.$refs.searchInput?.focus()); }
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
      closeSearch() { this.searchOn = false; this.searchQ = ''; },
      quoteJump(quoteId) {
        if (!quoteId) return;
        const m = this.list.find(x => x.id === quoteId);
        if (m) JC.toast('原消息：' + (msgPreview(m) || m.content || '').slice(0, 40));
      },
      onRecMove(e) { /* 预留：上滑取消手势 */ },
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
              <small :class="{typing: typing}">{{subtitle}}</small>
            </div>
          </div>
          <div class="nav-side" style="gap:6px;">
            <button v-if="isGroup" class="nav-btn" style="width:auto;padding:0 10px;font-size:11px;font-weight:700;color:#0a84ff;" @click="onlineSheet=true">在线 {{onlineCount}}</button>
            <button class="nav-btn" @click="barsMenu"><svg viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
          </div>
        </div>

        <!-- 聊天记录搜索栏 -->
        <transition name="fade">
          <div v-if="searchOn" class="chat-search glassy">
            <UI.Icon name="search" :size="16"/>
            <input ref="searchInput" v-model="searchQ" placeholder="搜索聊天记录…"/>
            <button class="search-close" @click="closeSearch"><UI.Icon name="close" :size="16"/></button>
          </div>
        </transition>

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

                <!-- 文本 -->
                <div class="bubble" v-if="m.type==='text'">{{m.content}}</div>

                <!-- 引用 -->
                <div class="bubble" v-else-if="m.type==='quote'">
                  <div class="quote-block" @click="quoteJump(quoteOf(m).quoteId)">
                    <b>{{quoteOf(m).quoteSender}}</b>
                    <span>{{quoteOf(m).quotePreview}}</span>
                  </div>
                  <div class="quote-text">{{quoteOf(m).text}}</div>
                </div>

                <!-- 语音 -->
                <div class="bubble voice-bubble" v-else-if="m.type==='voice'" @click="playVoice(m)">
                  <span class="voice-play" :class="{on: playingId===m.id}">
                    <UI.Icon :name="playingId===m.id?'pause':'play'" :size="16"/>
                  </span>
                  <span class="voice-bars" :class="{on: playingId===m.id}"><i v-for="n in 5" :key="n" :style="{animationDelay: (n*0.12)+'s'}"></i></span>
                  <span class="voice-dur">{{m.content||'语音'}}″</span>
                </div>

                <!-- 图片 -->
                <div class="bubble" v-else-if="m.type==='image'" style="padding:4px;background:rgba(255,255,255,.9);">
                  <template v-if="m.expired"><div class="destroyed"><UI.Icon name="fire" :size="14" style="vertical-align:-2px;"/> 内容已销毁</div></template>
                  <template v-else-if="m.oneTime && m.sender.id!==store.me.id">
                    <div class="one-time-mask" @click="viewOnce(m)">
                      <img class="media blur-img" :src="mediaSrc(m)" style="width:160px;height:160px;object-fit:cover;"/>
                      <div class="one-time-cover"><UI.Icon name="fire" :size="22"/><span>点击查看 · 阅后即焚</span></div>
                    </div>
                  </template>
                  <template v-else>
                    <img class="media" :src="mediaSrc(m)" @click="openMedia(m)" style="cursor:pointer;"/>
                  </template>
                  <div class="meta"><span v-if="m.oneTime && m.sender.id===store.me.id" style="color:#ff9f0a;">阅后即焚</span><span>{{JC.fmtFull(m.createdAt)}}</span></div>
                </div>

                <!-- 视频 -->
                <div class="bubble" v-else-if="m.type==='video'" style="padding:4px;background:rgba(255,255,255,.9);">
                  <template v-if="m.expired"><div class="destroyed"><UI.Icon name="fire" :size="14" style="vertical-align:-2px;"/> 内容已销毁</div></template>
                  <template v-else-if="m.oneTime && m.sender.id!==store.me.id">
                    <div class="one-time-mask" @click="viewOnce(m)" style="width:200px;height:150px;background:linear-gradient(135deg,#333,#555);display:flex;align-items:center;justify-content:center;">
                      <div class="one-time-cover" style="position:static;"><UI.Icon name="fire" :size="22"/><span>点击查看 · 阅后即焚</span></div>
                    </div>
                  </template>
                  <template v-else>
                    <video class="media" :src="mediaSrc(m)" controls @click.stop style="cursor:pointer;"/>
                  </template>
                  <div class="meta"><span v-if="m.oneTime && m.sender.id===store.me.id" style="color:#ff9f0a;">阅后即焚</span><span>{{JC.fmtFull(m.createdAt)}}</span></div>
                </div>

                <div class="meta" style="justify-content:flex-end;" v-if="m.type==='text' || m.type==='quote' || m.type==='voice'">
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
          <div v-if="!visibleList.length" class="empty" style="padding:40px 0;"><span>{{searchOn?'没有匹配的聊天记录':'还没有消息，打个招呼吧'}}</span></div>
        </div>

        <!-- 录音浮层 -->
        <transition name="fade">
          <div v-if="recording" class="recording-mask">
            <div class="rec-card">
              <div class="rec-wave"><i v-for="n in 7" :key="n" :style="{animationDelay:(n*0.1)+'s'}"></i></div>
              <div class="rec-time">{{recSeconds}}s</div>
              <div class="rec-tip">{{recSeconds<1?'松开发送 · 上滑取消':'松开发送'}}</div>
              <button class="rec-cancel" @touchstart.stop.prevent="recCancel=true; stopRecording()" @mousedown.stop.prevent="recCancel=true; stopRecording()">取消</button>
            </div>
          </div>
        </transition>

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
              <input type="checkbox" v-model="oneTime" style="width:17px;height:17px;accent-color:#ff9f0a;"/> <UI.Icon name="fire" :size="15"/> 一次性查看（阅后即焚）
            </label>
            <button class="btn mini" :disabled="sending" @click="sendSelected">{{sending?('上传中 '+uploadPct+'%'):'发送'}}</button>
          </div>
        </div>

        <!-- 引用回复条 -->
        <transition name="fade">
          <div v-if="replyTo" class="reply-bar glassy">
            <UI.Icon name="reply" :size="15"/>
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;font-weight:700;">回复 {{replyTo.sender}}</div>
              <div style="font-size:11.5px;color:#7d7f86;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{replyTo.preview}}</div>
            </div>
            <button class="search-close" @click="cancelReply"><UI.Icon name="close" :size="15"/></button>
          </div>
        </transition>

        <div class="inputbar">
          <button class="icon-btn" :class="{on:panel==='emoji'}" @click="togglePanel('emoji')">
            <svg viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8"/><circle cx="9" cy="10" r=".9" fill="#1c1c1e" stroke="none"/><circle cx="15" cy="10" r=".9" fill="#1c1c1e" stroke="none"/></svg>
          </button>
          <!-- 按住说话 -->
          <button class="icon-btn mic-btn" :class="{rec: recording}" @touchstart.prevent="startRecording" @touchend.prevent="stopRecording()" @touchmove.prevent="onRecMove" @mousedown.prevent="startRecording" @mouseup.prevent="stopRecording()" title="按住说话">
            <svg viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" stroke-width="2" stroke-linecap="round"><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>
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
                <button class="emoji-cat" :class="{on: emojiCat===-1}" @click="emojiCat=-1"><UI.Icon name="sticker" :size="13" style="vertical-align:-2px;"/> 动画表情</button>
              </div>
              <div v-if="emojiCat>=0" class="emoji-grid">
                <div class="emoji-cell" v-for="e in emojiCats[emojiCat].list" :key="e" @click="addEmoji(e)">{{e}}</div>
              </div>
              <template v-else>
                <div class="emoji-cats">
                  <button v-for="(p,i) in packs" :key="i" class="emoji-cat" :class="{on: packCat===i}" @click="packCat=i">{{p.name}}</button>
                </div>
                <div class="sticker-grid">
                  <div class="sticker-cell" v-for="s in packs[packCat]?.stickers || []" :key="s.id" @click="sendSticker(s.url)">
                    <img :src="s.url" loading="lazy"/>
                  </div>
                </div>
              </template>
            </div>
          </transition>

          <!-- plus panel -->
          <transition name="sheet" appear>
            <div v-if="panel==='plus'" class="panel panel-plus" style="position:fixed;">
              <div class="plus-item" @click="pickMedia(false)"><div class="ico"><UI.Icon name="image" :size="26" style="color:#0a84ff;"/></div><span>相册</span></div>
              <div class="plus-item" @click="pickMedia(true)"><div class="ico"><UI.Icon name="camera" :size="26" style="color:#30d158;"/></div><span>拍摄</span></div>
              <div class="plus-item" @click="panel='emoji'; emojiCat=-1;"><div class="ico"><UI.Icon name="sticker" :size="26" style="color:#ff9f0a;"/></div><span>动画表情</span></div>
              <div class="plus-item" v-if="isOfficial" @click="pickAI(); panel='';"><div class="ico"><img src="/uploads/jay-ai.svg" style="width:34px;height:34px;border-radius:9px;"/></div><span style="color:#30d158;font-weight:700;">Jay AI</span></div>
            </div>
          </transition>
        </div>

        <UI.MediaViewer :src="viewer.src" :type="viewer.type" :burn-tip="viewer.burnTip" @close="closeViewer"/>

        <!-- 转发选择 -->
        <transition name="mask" appear>
          <div class="mask" v-if="forwardMsg" @click="forwardMsg=null"></div>
        </transition>
        <transition name="sheet" appear>
          <div class="sheet" v-if="forwardMsg" style="max-height:64vh;">
            <div class="sheet-title">转发给</div>
            <div style="overflow-y:auto;max-height:50vh;">
              <div class="row" v-for="t in forwardTargets" :key="t.convType+t.convId" @click="doForward(t)">
                <UI.Avatar :src="t.avatar" :name="t.name" :size="40"/>
                <div class="row-title">{{t.name}}</div>
                <span class="tag-online" v-if="t.convType==='group'" style="font-size:11px;">群聊</span>
              </div>
            </div>
            <div class="sheet-item sheet-cancel" @click="forwardMsg=null">取消</div>
          </div>
        </transition>

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
