// 聊天页：私聊 + 群聊（表情/龙图/相册/拍摄/一次性查看/撤回/已读/在线状态）
const ChatView = {
  current: null, // {convId, type, target, myRole, mutedUntil, messages, refs:{}}

  async openDM(userId) {
    try {
      const data = await API.get('/api/dm/' + userId);
      this.open({
        convId: data.convId, type: 'dm', target: data.user,
      });
    } catch (e) { toast(e.message, 'error'); }
  },

  async openGroup(groupId) {
    try {
      const { group } = await API.get('/api/groups/' + groupId);
      this.open({
        convId: 'g_' + groupId, type: 'group', target: group,
        myRole: group.myRole,
      });
    } catch (e) { toast(e.message, 'error'); }
  },

  async open({ convId, type, target }) {
    // 关闭已有页面（刷新聊天页场景）
    if (App.pages.length) App.popToMain();
    const cur = {
      convId, type, target, messages: [], hasMore: true, loading: false,
    };
    this.current = cur;
    Socket.emit('join:conv', convId);

    // ===== 构建页面 =====
    const page = el('div', 'stack-page');
    page.innerHTML = `
      <div class="sub-head">
        <button class="back-btn"><svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="sub-head-main" id="chat-head-main"></div>
        <button class="head-btn" id="chat-more"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="chat-body" id="chat-body"></div>
      <div class="chat-panel hidden" id="chat-panel"></div>
      <div class="chat-input-bar">
        <button class="icon-btn" id="btn-emoji"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-3.5 7a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm7 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM12 18c-2.9 0-5.4-1.8-6.3-4.4a1 1 0 011.9-.7c.7 1.9 2.4 3.1 4.4 3.1s3.7-1.2 4.4-3.1a1 1 0 011.9.7C17.4 16.2 14.9 18 12 18z" fill="currentColor"/></svg></button>
        <textarea id="chat-textarea" rows="1" placeholder="说点什么…"></textarea>
        <button class="icon-btn" id="btn-plus"><svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" fill="currentColor"/></svg></button>
        <button class="send-btn hidden" id="btn-send">发送</button>
      </div>`;
    cur.page = page;
    cur.bodyEl = $('#chat-body', page);
    cur.panelEl = $('#chat-panel', page);
    cur.inputEl = $('#chat-textarea', page);

    page.querySelector('.back-btn').onclick = () => { App.popPage(); this.current = null; HomeView.refresh(); };
    $('#chat-head-main', page).onclick = () => {
      if (cur.type === 'group') GroupSettings.open(cur.target.id);
    };
    $('#chat-more', page).onclick = () => {
      if (cur.type === 'group') GroupSettings.open(cur.target.id);
      else FriendSettings.open(cur.target.id, cur.convId);
    };

    // 输入框逻辑
    const ta = cur.inputEl;
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 110) + 'px';
      $('#btn-send', page).classList.toggle('hidden', !ta.value.trim());
      $('#btn-plus', page).classList.toggle('hidden', !!ta.value.trim());
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendText(); }
    });
    $('#btn-send', page).onclick = () => this.sendText();
    $('#btn-emoji', page).onclick = () => this.togglePanel('emoji');
    $('#btn-plus', page).onclick = () => this.togglePanel('plus');

    this.renderHead();
    App.pushPage(page);
    await this.loadHistory();
    this.markRead();
    this.scrollToBottom();
  },

  // ===== 头部 =====
  renderHead() {
    const { type, target } = this.current;
    const main = $('#chat-head-main', this.current.page);
    main.innerHTML = '';
    if (type === 'group') {
      main.appendChild(renderGroupAvatar(target, 'sm'));
      const info = el('div', '');
      info.innerHTML = `<div class="sub-head-title">${esc(target.name)}${target.isOfficial ? '<span class="role-tag owner">官方</span>' : ''}<span style="font-weight:400;color:var(--text-3);font-size:12px">（${target.memberCount}人）</span></div><div class="sub-head-sub"></div>`;
      main.appendChild(info);
      this.updateGroupOnline();
    } else {
      const online = App.isOnline(target.id);
      main.appendChild(renderAvatar({ ...target, showOnline: true, online }, 'sm'));
      const info = el('div', '');
      const name = target.remark || target.username;
      info.innerHTML = `<div class="sub-head-title">${esc(name)}${target.isOfficial ? '<span class="role-tag owner">官方</span>' : ''}</div><div class="sub-head-sub ${online ? 'online-tag' : ''}">${online ? '● 在线' : '○ 离线'}</div>`;
      main.appendChild(info);
    }
  },

  async updateGroupOnline() {
    const cur = this.current;
    if (!cur || cur.type !== 'group') return;
    try {
      const { online, count } = await API.get(`/api/groups/${cur.target.id}/online`);
      if (this.current !== cur) return;
      cur.onlineMembers = online;
      cur.onlineCount = count;
      const sub = $('.sub-head-sub', cur.page);
      if (sub) sub.innerHTML = `<span class="online-tag">● ${count}人在线</span> <span style="color:var(--text-3)">· ${cur.target.memberCount}人</span>`;
    } catch (e) { /* ignore */ }
  },

  // ===== 历史 =====
  async loadHistory() {
    const cur = this.current;
    if (!cur) return;
    cur.loading = true;
    try {
      const { messages, hasMore } = await API.get(`/api/conv/${cur.convId}/messages`);
      cur.messages = messages;
      cur.hasMore = hasMore;
      this.renderAll();
    } catch (e) {
      toast(e.message, 'error');
    }
    cur.loading = false;
  },

  renderAll() {
    const { bodyEl, messages } = this.current;
    bodyEl.innerHTML = '';
    let lastTs = 0;
    for (const m of messages) {
      if (m.createdAt - lastTs > 5 * 60 * 1000) {
        bodyEl.appendChild(el('div', 'chat-day', fmtFull(m.createdAt)));
      }
      lastTs = m.createdAt;
      bodyEl.appendChild(this.renderMsg(m));
    }
  },

  senderName(userId) {
    if (userId === App.state.me.id) return '我';
    const f = App.state.friends.find((x) => x.id === userId);
    if (f) return f.remark || f.username;
    const t = this.current.target;
    if (this.current.type === 'dm' && t.id === userId) return t.remark || t.username;
    return '成员';
  },

  renderMsg(m) {
    const cur = this.current;
    const mine = m.senderId === App.state.me.id;
    const row = el('div', 'msg-row' + (mine ? ' me' : ''));
    row.dataset.id = m.id;

    // 头像
    let avatarUser;
    if (mine) avatarUser = App.state.me;
    else if (cur.type === 'dm') avatarUser = cur.target;
    else {
      const f = App.state.friends.find((x) => x.id === m.senderId);
      avatarUser = f || { username: this.senderName(m.senderId) };
    }
    const av = renderAvatar({ ...avatarUser, showOnline: false });
    av.firstChild.className = 'avatar';
    av.className = 'msg-avatar';
    row.appendChild(av);

    const col = el('div', 'msg-col');
    // 群聊显示发送者名称
    if (cur.type === 'group' && !mine) {
      col.appendChild(el('div', 'msg-name', esc(this.senderName(m.senderId))));
    }

    if (m.recalled) {
      col.appendChild(el('div', 'msg-recalled', `${mine ? '你' : esc(this.senderName(m.senderId))} 撤回了一条消息`));
      row.appendChild(col);
      return row;
    }

    const bubble = el('div', 'bubble');
    if (m.type === 'text') {
      bubble.textContent = m.content;
    } else if (m.type === 'sticker') {
      bubble.classList.add('sticker-bubble');
      const img = el('img', 'sticker-img');
      img.src = m.content;
      img.onclick = () => viewMedia(m.content, false);
      bubble.appendChild(img);
    } else if (m.viewOnce && !mine) {
      // 一次性查看（接收方）
      const box = el('div', 'viewonce-box' + (m.destroyed ? ' destroyed' : ''));
      const icon = '<svg viewBox="0 0 24 24"><path d="M12 7c2.8 0 5.3 1.5 6.7 4-1.4 2.5-3.9 4-6.7 4s-5.3-1.5-6.7-4C6.7 8.5 9.2 7 12 7zm0-3C7.5 4 3.7 6.5 2 10c1.7 3.5 5.5 6 10 6s8.3-2.5 10-6c-1.7-3.5-5.5-6-10-6zm0 7.5a2.5 2.5 0 100 1 0 0 0z" fill="currentColor"/></svg>';
      box.innerHTML = `
        <div class="viewonce-icon">${icon}</div>
        <div class="viewonce-text">${m.destroyed
          ? '<b>内容已销毁</b><span>一次性消息仅可查看一次</span>'
          : `<b>查看${m.type === 'video' ? '视频' : '图片'}</b><span>仅可查看一次，查看后自动销毁</span>`}</div>`;
      if (!m.destroyed) {
        box.onclick = async () => {
          try {
            const data = await API.post(`/api/msg/${m.id}/view`);
            const v = viewMedia(data.url, m.type === 'video', '⚠️ 查看后该内容将销毁，只能查看一次');
            $('#media-viewer')._onclose = () => {
              m.destroyed = true;
              m.needView = false;
              const newRow = this.renderMsg(m);
              row.replaceWith(newRow);
            };
          } catch (e) {
            toast(e.message, 'error');
            m.destroyed = true;
            const newRow = this.renderMsg(m);
            row.replaceWith(newRow);
          }
        };
      }
      bubble.appendChild(box);
    } else if (m.type === 'image') {
      const img = el('img', 'media-img');
      img.src = m.content;
      img.onclick = () => viewMedia(m.content, false, m.viewOnce ? '一次性消息 · 对方查看后将销毁' : '');
      bubble.appendChild(img);
    } else if (m.type === 'video') {
      const video = el('video');
      video.src = m.content;
      video.controls = true;
      video.playsInline = true;
      bubble.appendChild(video);
    }
    if (m.viewOnce && mine) {
      const tag = el('span', 'mute-tag');
      tag.style.cssText = 'position:absolute;top:-9px;right:8px;background:rgba(255,91,110,.9);color:#fff;font-size:9.5px;padding:2px 7px;border-radius:7px;z-index:1';
      tag.textContent = '一次性';
      bubble.style.position = 'relative';
      bubble.appendChild(tag);
    }
    col.appendChild(bubble);

    // 已读状态（自己发的）
    if (mine && !m.recalled) {
      let statusText = '';
      let cls = 'msg-status';
      if (cur.type === 'dm') {
        const read = (m.readBy || []).includes(cur.target.id);
        statusText = read ? '已读' : '未读';
        if (read) cls += ' read';
      } else {
        const n = (m.readBy || []).filter((u) => u !== App.state.me.id).length;
        statusText = n > 0 ? `${n}人已读` : '未读';
        if (n > 0) cls += ' read';
      }
      const st = el('div', cls, statusText);
      st.dataset.role = 'status';
      col.appendChild(st);
    }

    row.appendChild(col);

    // 长按菜单
    onLongPress(bubble, (e) => this.showMsgMenu(e, m, row, bubble));
    return row;
  },

  showMsgMenu(e, m, row, bubble) {
    if (m.recalled) return;
    const mine = m.senderId === App.state.me.id;
    const menu = $('#ctx-menu');
    menu.innerHTML = '';
    menu.classList.remove('hidden');

    const items = [];
    if (m.type === 'text') {
      items.push({ icon: '<svg viewBox="0 0 24 24"><path d="M8 5h12v2H8V5zm0 6h12v2H8v-2zm0 6h8v2H8v-2zM4 4h2v2H4V4zm0 6h2v2H4v-2zm0 6h2v2H4v-2z" fill="currentColor"/></svg>', text: '复制', fn: async () => {
      try { await navigator.clipboard.writeText(m.content); toast('已复制', 'success'); }
      catch (err) {
        const t = el('textarea'); t.value = m.content; document.body.appendChild(t); t.select();
        document.execCommand('copy'); t.remove(); toast('已复制', 'success');
      }
    } });
    }
    if (mine && Date.now() - m.createdAt <= 3 * 60 * 1000) {
      items.push({ icon: '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 108 8h-2a6 6 0 11-6-6v3l5-4-5-4v3z" fill="currentColor"/></svg>', text: '撤回', fn: () => {
        Socket.emit('msg:recall', { msgId: m.id }, (res) => {
          if (res && res.error) toast(res.error, 'error');
        });
      } });
    }
    items.push({ icon: '<svg viewBox="0 0 24 24"><path d="M6 7h12v10H6V7zm2-4h8v2H8V3zM4 7v12a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2z" fill="currentColor"/></svg>', text: '删除', fn: () => {
      Socket.emit('msg:delete', { msgId: m.id }, () => {
        row.style.transition = 'all .25s'; row.style.opacity = '0'; row.style.transform = 'scale(.8)';
        setTimeout(() => row.remove(), 250);
        if (this.current) this.current.messages = this.current.messages.filter((x) => x.id !== m.id);
      });
    } });

    for (const it of items) {
      const b = el('button', 'ctx-item' + (it.text === '删除' ? ' danger' : ''), `${it.icon}<span>${it.text}</span>`);
      b.onclick = (ev) => { ev.stopPropagation(); hideCtxMenu(); it.fn(); };
      menu.appendChild(b);
    }
    const x = Math.min((e.clientX || e.touches?.[0]?.clientX) || 40, window.innerWidth - 150);
    const y = Math.min((e.clientY || e.touches?.[0]?.clientY) || 100, window.innerHeight - items.length * 44 - 30);
    menu.style.left = Math.max(10, x - 60) + 'px';
    menu.style.top = Math.max(10, y - 10) + 'px';
  },

  // ===== 发送 =====
  sendText() {
    const cur = this.current;
    const ta = cur.inputEl;
    const text = ta.value.trim();
    if (!text) return;
    ta.value = '';
    ta.style.height = 'auto';
    $('#btn-send', cur.page).classList.add('hidden');
    $('#btn-plus', cur.page).classList.remove('hidden');
    this.send({ type: 'text', content: text });
  },

  sendSticker(url) {
    this.send({ type: 'sticker', content: url });
    this.closePanel();
  },

  sendMedia(type, url, viewOnce) {
    this.send({ type, content: url, viewOnce: !!viewOnce });
  },

  send(payload) {
    const cur = this.current;
    Socket.emit('msg:send', { convId: cur.convId, ...payload }, (res) => {
      if (res && res.error) {
        toast(res.error, 'error');
        if (payload.type === 'text') { cur.inputEl.value = payload.content; }
        return;
      }
      if (res && res.ok && res.msg) {
        if (!cur.messages.some((m) => m.id === res.msg.id)) {
          cur.messages.push(res.msg);
          this.appendMsg(res.msg);
        }
      }
    });
  },

  appendMsg(m) {
    const cur = this.current;
    const bodyEl = cur.bodyEl;
    const last = cur.messages[cur.messages.length - 2];
    if (!last || m.createdAt - last.createdAt > 5 * 60 * 1000) {
      bodyEl.appendChild(el('div', 'chat-day', fmtFull(m.createdAt)));
    }
    const row = this.renderMsg(m);
    bodyEl.appendChild(row);
    this.scrollToBottom();
    if (m.senderId !== App.state.me.id) this.markRead();
  },

  markRead() {
    const cur = this.current;
    if (cur) Socket.emit('msg:read', { convId: cur.convId });
  },

  scrollToBottom() {
    const bodyEl = this.current?.bodyEl;
    if (bodyEl) requestAnimationFrame(() => { bodyEl.scrollTop = bodyEl.scrollHeight; });
  },

  // ===== 面板 =====
  togglePanel(kind) {
    const cur = this.current;
    const panel = cur.panelEl;
    const emojiBtn = $('#btn-emoji', cur.page);
    const plusBtn = $('#btn-plus', cur.page);
    const isOpen = !panel.classList.contains('hidden');
    const curKind = panel.dataset.kind;
    if (isOpen && curKind === kind) return this.closePanel();
    panel.classList.remove('hidden');
    panel.dataset.kind = kind;
    emojiBtn.classList.toggle('active', kind === 'emoji');
    plusBtn.classList.toggle('active', kind === 'plus');
    if (kind === 'emoji') {
      // 输入框有关键词 → 直接弹出匹配的龙图
      const kw = cur.inputEl.value.trim();
      this.renderEmojiPanel(kw || null);
    } else {
      this.renderPlusPanel();
    }
  },

  closePanel() {
    const cur = this.current;
    if (!cur) return;
    cur.panelEl.classList.add('hidden');
    delete cur.panelEl.dataset.kind;
    $('#btn-emoji', cur.page).classList.remove('active');
    $('#btn-plus', cur.page).classList.remove('active');
  },

  renderEmojiPanel(initialKeyword) {
    const cur = this.current;
    const panel = cur.panelEl;
    panel.innerHTML = '';
    const wrap = el('div', 'emoji-panel');

    // Tabs: emoji分类 + 龙图
    const tabs = el('div', 'emoji-tabs');
    let activeTab = initialKeyword ? 'sticker' : 0;
    const tabBtns = [];
    EMOJI_CATEGORIES.forEach((cat, i) => {
      const b = el('button', 'emoji-tab' + (activeTab === i ? ' active' : ''), cat.name);
      b.onclick = () => { activeTab = i; tabBtns.forEach((x, j) => x.classList.toggle('active', j === i)); renderTab(); };
      tabBtns.push(b); tabs.appendChild(b);
    });
    const stBtn = el('button', 'emoji-tab' + (activeTab === 'sticker' ? ' active' : ''), '🐉 龙图');
    stBtn.onclick = () => { activeTab = 'sticker'; tabBtns.forEach((x, j) => x.classList.toggle('active', j === 'sticker')); renderTab(); };
    tabBtns.push(stBtn);
    tabs.appendChild(stBtn);
    wrap.appendChild(tabs);

    const content = el('div', '');
    content.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column';
    wrap.appendChild(content);
    panel.appendChild(wrap);

    const renderTab = () => {
      content.innerHTML = '';
      if (activeTab === 'sticker') {
        const sp = el('div', 'sticker-panel');
        const search = el('div', 'sticker-search');
        const inp = el('input');
        inp.placeholder = '输入关键词搜索龙图，如：开心 / 哭 / 生气 / 晚安…';
        inp.value = initialKeyword || '';
        search.appendChild(inp);
        sp.appendChild(search);
        const grid = el('div', 'sticker-grid');
        sp.appendChild(grid);
        content.appendChild(sp);
        const renderStickers = (kw) => {
          grid.innerHTML = '';
          const list = searchStickers(kw);
          if (!list.length) {
            grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-3);font-size:13px;padding:20px 0">没有找到相关龙图，试试其他关键词</p>';
            return;
          }
          for (const s of list) {
            const cell = el('div', 'sticker-cell');
            cell.innerHTML = `<img src="${s.url}" loading="lazy" alt="龙图">`;
            cell.onclick = () => this.sendSticker(s.url);
            grid.appendChild(cell);
          }
        };
        renderStickers(inp.value);
        inp.oninput = () => renderStickers(inp.value);
      } else {
        const eg = el('div', 'emoji-grid');
        content.appendChild(eg);
        for (const em of [...EMOJI_CATEGORIES[activeTab].list]) {
          const b = el('button', 'emoji-cell', em);
          b.onclick = () => {
            const ta = cur.inputEl;
            ta.value += em;
            ta.dispatchEvent(new Event('input'));
            ta.focus();
          };
          eg.appendChild(b);
        }
      }
    };
    renderTab();
  },

  renderPlusPanel() {
    const cur = this.current;
    const panel = cur.panelEl;
    panel.innerHTML = '';
    const grid = el('div', 'plus-panel');
    const items = [
      { icon: '<svg viewBox="0 0 24 24"><path d="M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z" fill="currentColor"/></svg>', label: '相册', fn: () => this.pickAlbum() },
      { icon: '<svg viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z" fill="currentColor"/></svg>', label: '拍摄', fn: () => this.openCamera() },
    ];
    for (const it of items) {
      const b = el('button', 'plus-item', `<span class="plus-icon">${it.icon}</span><span>${it.label}</span>`);
      b.onclick = () => { this.closePanel(); it.fn(); };
      grid.appendChild(b);
    }
    panel.appendChild(grid);
  },

  // ===== 相册选择 =====
  async pickAlbum() {
    const files = await pickFiles('image/*,video/*', false);
    if (!files.length) return;
    const file = files[0];
    if (file.type.startsWith('video/')) {
      if (file.size > 60 * 1024 * 1024) return toast('视频不能超过60MB', 'error');
      const data = await fileToDataURL(file);
      this.previewSend('video', data);
    } else {
      const data = await compressImage(file);
      this.previewSend('image', data);
    }
  },

  // ===== 拍摄 =====
  async openCamera() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
    } catch (e) {
      return toast('无法访问摄像头，请检查浏览器权限', 'error');
    }
    const box = el('div');
    box.innerHTML = `<div class="modal-title">拍摄<button class="modal-close">✕</button></div>`;
    const stage = el('div', 'camera-stage');
    const video = el('video');
    video.srcObject = stream; video.autoplay = true; video.muted = true; video.playsInline = true;
    stage.appendChild(video);
    box.appendChild(stage);

    let mode = 'photo';
    let recorder = null; let chunks = []; let recTimer = null;
    const recDot = el('div', 'rec-dot hidden', '<i></i><span>00:00 / 最多15秒</span>');
    stage.appendChild(recDot);

    const modeRow = el('div', 'cam-mode');
    const photoBtn = el('button', 'dur-opt active', '📷 拍照');
    const videoBtn = el('button', 'dur-opt', '🎬 录视频');
    modeRow.append(photoBtn, videoBtn);
    photoBtn.onclick = () => { mode = 'photo'; photoBtn.classList.add('active'); videoBtn.classList.remove('active'); };
    videoBtn.onclick = () => { mode = 'video'; videoBtn.classList.add('active'); photoBtn.classList.remove('active'); };
    box.appendChild(modeRow);

    const controls = el('div', 'camera-controls');
    const capBtn = el('button', 'btn-primary', '📷 拍摄');
    capBtn.style.cssText = 'width:140px;height:48px;border-radius:24px;font-size:16px';
    controls.appendChild(capBtn);
    box.appendChild(controls);

    let sec = 0;
    capBtn.onclick = async () => {
      if (mode === 'photo') {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width, 0); ctx.scale(-1, 1); // 镜像还原
        ctx.drawImage(video, 0, 0);
        const data = canvas.toDataURL('image/jpeg', 0.85);
        cleanup(); m.close();
        this.previewSend('image', data);
      } else {
        if (recorder) { recorder.stop(); return; }
        if (!window.MediaRecorder) return toast('当前浏览器不支持录像', 'error');
        try {
          recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
        } catch (e) { return toast('录像启动失败', 'error'); }
        chunks = [];
        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = () => {
          clearInterval(recTimer);
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: 'video/webm' });
          if (blob.size < 1000) { toast('录制太短', 'error'); return; }
          const fr = new FileReader();
          fr.onload = () => { m.close(); this.previewSend('video', fr.result); };
          fr.readAsDataURL(blob);
        };
        recorder.start();
        sec = 0;
        recDot.classList.remove('hidden');
        capBtn.textContent = '⏹ 停止';
        recTimer = setInterval(() => {
          sec++;
          recDot.querySelector('span').textContent = `00:${String(sec).padStart(2, '0')} / 最多15秒`;
          if (sec >= 15 && recorder) recorder.stop();
        }, 1000);
      }
    };
    function cleanup() { if (recTimer) clearInterval(recTimer); stream.getTracks().forEach((t) => t.stop()); }
    const m = openModal(box, { onClose: cleanup });
    box.querySelector('.modal-close').onclick = () => { cleanup(); m.close(); };
  },

  // ===== 发送预览（含一次性查看选项） =====
  previewSend(type, dataURL) {
    const box = el('div');
    box.innerHTML = `<div class="modal-title">发送${type === 'video' ? '视频' : '图片'}<button class="modal-close">✕</button></div>`;
    const preview = el('div', '');
    preview.style.cssText = 'border-radius:14px;overflow:hidden;background:rgba(0,0,0,.3);max-height:260px;display:flex;align-items:center;justify-content:center';
    if (type === 'video') {
      const v = el('video'); v.src = dataURL; v.controls = true; v.style.maxHeight = '260px';
      preview.appendChild(v);
    } else {
      const img = el('img'); img.src = dataURL; img.style.cssText = 'max-width:100%;max-height:260px;object-fit:contain';
      preview.appendChild(img);
    }
    box.appendChild(preview);

    let once = false;
    const onceBar = el('div', 'send-preview-bar');
    const check = el('div', 'once-check' + (once ? ' checked' : ''), '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    const label = el('div', '');
    label.style.flex = '1';
    label.innerHTML = '<b style="font-size:13.5px">一次性查看</b><div style="font-size:11px;color:var(--text-3);margin-top:2px">对方查看一次后自动销毁，你这边不会销毁</div>';
    onceBar.append(check, label);
    onceBar.onclick = () => { once = !once; check.classList.toggle('checked', once); };
    box.appendChild(onceBar);

    const actions = el('div', 'modal-actions');
    const send = el('button', 'btn-primary', '发送');
    send.onclick = async () => {
      send.disabled = true; send.textContent = '发送中…';
      try {
        const { url } = await API.post('/api/users/upload', { type, data: dataURL, once });
        this.sendMedia(type, url, once);
        m.close();
      } catch (err) {
        toast(err.message, 'error');
        send.disabled = false; send.textContent = '发送';
      }
    };
    actions.appendChild(send);
    box.appendChild(actions);
    const m = openModal(box);
    box.querySelector('.modal-close').onclick = () => m.close();
  },
};

// ===== 全局实时事件分发到当前聊天页 =====
Bus.on('msg:new', ({ convId, msg }) => {
  const cur = ChatView.current;
  if (!cur || cur.convId !== convId) return;
  if (msg.senderId === App.state.me.id && cur.messages.some((m) => m.id === msg.id)) return;
  if (!cur.messages.some((m) => m.id === msg.id)) {
    cur.messages.push(msg);
    ChatView.appendMsg(msg);
  }
});

Bus.on('msg:read', ({ convId, userId, msgIds }) => {
  const cur = ChatView.current;
  if (!cur || cur.convId !== convId) return;
  let changed = false;
  for (const m of cur.messages) {
    if (msgIds.includes(m.id) && !m.readBy.includes(userId)) {
      m.readBy.push(userId);
      changed = true;
      // 更新DOM状态
      const row = cur.bodyEl.querySelector(`[data-id="${m.id}"]`);
      if (row) {
        const st = row.querySelector('[data-role="status"]');
        if (st) {
          if (cur.type === 'dm') { st.textContent = '已读'; st.classList.add('read'); }
          else {
            const n = m.readBy.filter((u) => u !== App.state.me.id).length;
            st.textContent = n > 0 ? `${n}人已读` : '未读';
            st.classList.toggle('read', n > 0);
          }
        }
      }
    }
  }
  if (changed) HomeView.refresh();
});

Bus.on('msg:recalled', ({ convId, msgId }) => {
  const cur = ChatView.current;
  if (!cur || cur.convId !== convId) return;
  const m = cur.messages.find((x) => x.id === msgId);
  if (!m) return;
  m.recalled = true;
  const row = cur.bodyEl.querySelector(`[data-id="${msgId}"]`);
  if (row) {
    const newRow = ChatView.renderMsg(m);
    row.replaceWith(newRow);
  }
});

// 在线状态实时刷新（聊天页头部）
Bus.on('presence:change', ({ userId }) => {
  const cur = ChatView.current;
  if (!cur) return;
  if (cur.type === 'dm' && cur.target.id === userId) ChatView.renderHead();
  if (cur.type === 'group') ChatView.updateGroupOnline();
});

Bus.on('group:event', (d) => {
  const cur = ChatView.current;
  if (cur && cur.type === 'group' && cur.target.id === d.groupId && ['members', 'updated', 'transferred'].includes(d.type)) {
    ChatView.openGroup(d.groupId).then(() => {});
  }
});
