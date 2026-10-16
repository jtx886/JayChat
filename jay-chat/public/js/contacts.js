// 联系人：好友申请（通过/拒绝）+ 好友列表（首字母分组 + 在线状态）
const ContactsView = {
  requests: [],

  async render() {
    if (!App.state.me) return;
    const page = $('#page-contacts');
    page.innerHTML = `
      <div class="page-head"><div class="page-title">联系人</div></div>
      <div class="list" id="contacts-list"></div>`;
    try {
      const [{ friends }, { requests }] = await Promise.all([
        API.get('/api/friends'),
        API.get('/api/friends/requests'),
      ]);
      App.state.friends = friends;
      this.requests = requests;
      App.state.friendReqCount = requests.length;
      App.refreshBadges();
      this.renderList(friends, requests);
    } catch (e) { /* ignore */ }
  },

  renderList(friends, requests) {
    const wrap = $('#contacts-list');
    if (!wrap) return;
    wrap.innerHTML = '';

    // ===== 好友申请模块 =====
    const reqSection = el('div', 'letter-block');
    const reqHead = el('div', 'letter-head', `好友申请 ${requests.length ? `<span style="color:#ff8a97">(${requests.length}条待处理)</span>` : '<span style="color:var(--text-3);font-weight:400">（暂无）</span>'}`);
    reqSection.appendChild(reqHead);
    if (requests.length) {
      for (const r of requests) {
        const item = el('div', 'list-item');
        item.appendChild(renderAvatar(r.fromUser));
        item.appendChild(el('div', 'item-main', `
          <div class="item-title">${esc(r.fromUser.username)}${r.fromUser.isOfficial ? '<span class="role-tag owner">官方</span>' : ''}</div>
          <div class="item-sub">请求添加你为好友 · ${fmtFull(r.createdAt)}</div>`));
        const btns = el('div', '');
        btns.style.cssText = 'display:flex;gap:7px;flex-shrink:0';
        const ok = el('button', 'mini-btn good', '通过');
        const no = el('button', 'mini-btn warn', '拒绝');
        ok.onclick = async (e) => {
          e.stopPropagation();
          try {
            await API.post(`/api/friends/requests/${r.id}`, { action: 'accept' });
            toast('已通过好友申请', 'success');
            this.render();
          } catch (err) { toast(err.message, 'error'); }
        };
        no.onclick = async (e) => {
          e.stopPropagation();
          try {
            await API.post(`/api/friends/requests/${r.id}`, { action: 'reject' });
            toast('已拒绝');
            this.render();
          } catch (err) { toast(err.message, 'error'); }
        };
        btns.append(ok, no);
        item.appendChild(btns);
        reqSection.appendChild(item);
      }
    }
    wrap.appendChild(reqSection);

    // ===== 好友列表（首字母分组） =====
    const head = el('div', 'letter-head', `我的好友 <span style="color:var(--text-3);font-weight:400">（${friends.length}位）</span>`);
    wrap.appendChild(head);
    if (!friends.length) {
      wrap.appendChild(el('div', 'empty', '<p>还没有好友，去首页右上角 + 添加好友吧</p>'));
      return;
    }
    const groups = groupByInitial(friends, (f) => f.remark || f.username);
    for (const { letter, items } of groups) {
      const block = el('div', 'letter-block');
      block.appendChild(el('div', 'letter-head', letter));
      for (const f of items) {
        const item = el('div', 'list-item');
        item.appendChild(renderAvatar({ ...f, username: f.remark || f.username, showOnline: true, online: App.isOnline(f.id) }));
        const main = el('div', 'item-main', `
          <div class="item-title">${esc(f.remark || f.username)}${f.isOfficial ? '<span class="role-tag owner">官方</span>' : ''}</div>
          <div class="item-sub ${App.isOnline(f.id) ? 'online-tag' : ''}" style="${App.isOnline(f.id) ? '' : 'color:var(--text-3)'}">${App.isOnline(f.id) ? '● 在线' : '○ 离线'}</div>`);
        item.appendChild(main);
        item.onclick = () => ChatView.openDM(f.id);
        block.appendChild(item);
      }
      wrap.appendChild(block);
    }
  },

  async refreshRequests() {
    try {
      const { requests } = await API.get('/api/friends/requests');
      this.requests = requests;
      App.state.friendReqCount = requests.length;
      App.refreshBadges();
      if (App.state.tab === 'contacts') this.render();
    } catch (e) { /* ignore */ }
  },
};

// 好友在线状态变化 → 刷新联系人页（若在当前tab）
Bus.on('presence:change', ({ userId }) => {
  if (App.state.tab === 'contacts' && App.state.friends.some((f) => f.id === userId)) {
    // 局部更新在线文字
    $$('#contacts-list .list-item').forEach(() => { /* 重渲染简化处理 */ });
    ContactsView.render();
  }
});
Bus.on('online:sync', () => {
  if (App.state.tab === 'contacts') ContactsView.render();
});
