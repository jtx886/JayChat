// 好友聊天设置：备注 / 查看好友动态 / 删除好友 + 好友动态页
const FriendSettings = {
  friend: null,
  convId: null,

  async open(userId, convId) {
    try {
      const { user } = await API.get('/api/users/' + userId);
      this.friend = { ...user, remark: user.remark || '' };
      this.convId = convId;
      this.render();
    } catch (e) { toast(e.message, 'error'); }
  },

  render() {
    const f = this.friend;
    const page = el('div', 'stack-page');
    page.innerHTML = `
      <div class="sub-head">
        <button class="back-btn"><svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="sub-head-main"><div class="sub-head-title">聊天信息</div></div>
      </div>
      <div style="flex:1;overflow-y:auto;padding-bottom:40px" id="fs-body"></div>`;
    page.querySelector('.back-btn').onclick = () => App.popPage();
    const body = $('#fs-body', page);

    // 好友卡片
    const card = el('div', 'settings-card glass');
    const row = el('div', 'setting-row');
    row.appendChild(renderAvatar({ ...f, showOnline: true, online: App.isOnline(f.id) }, 'lg'));
    row.appendChild(el('div', 'item-main', `
      <div class="setting-label">${esc(f.remark || f.username)}${f.isOfficial ? ' <span class="role-tag owner">官方</span>' : ''}</div>
      <div class="setting-sub">昵称：${esc(f.username)}</div>
      <div class="setting-sub ${App.isOnline(f.id) ? 'online-tag' : ''}">${App.isOnline(f.id) ? '● 在线' : '○ 离线'}</div>`));
    card.appendChild(row);
    body.appendChild(card);

    // 设置朋友资料（备注）
    const card2 = el('div', 'settings-card glass');
    const remarkRow = el('div', 'setting-row');
    remarkRow.innerHTML = `
      <div class="menu-icon" style="background:linear-gradient(135deg,#5b8cff,#8a5cff)"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="#fff"/></svg></div>
      <div class="item-main"><div class="setting-label">设置朋友资料</div><div class="setting-sub">${f.remark ? '备注名：' + esc(f.remark) : '设置专属备注名'}</div></div>
      <span class="menu-arrow"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></span>`;
    remarkRow.onclick = () => this.editRemark();
    card2.appendChild(remarkRow);

    // 查看好友动态
    const momentRow = el('div', 'setting-row');
    momentRow.innerHTML = `
      <div class="menu-icon" style="background:linear-gradient(135deg,#2fd57c,#2fa8d5)"><svg viewBox="0 0 24 24"><path d="M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H9l-4 3v-3H4a1 1 0 01-1-1V5a1 1 0 011-1zm5 8a1.7 1.7 0 100-3.4A1.7 1.7 0 009 12zm6 0a1.7 1.7 0 100-3.4A1.7 1.7 0 0015 12z" fill="#fff"/></svg></div>
      <div class="item-main"><div class="setting-label">查看好友动态</div><div class="setting-sub">TA的所有动态（含私密，仅好友可见）</div></div>
      <span class="menu-arrow"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></span>`;
    momentRow.onclick = () => UserMoments.open(f.id, f.remark || f.username);
    card2.appendChild(momentRow);
    body.appendChild(card2);

    // 删除好友
    const card3 = el('div', 'settings-card glass');
    const delRow = el('div', 'setting-row');
    delRow.innerHTML = `
      <div class="menu-icon" style="background:linear-gradient(135deg,#ff5b6e,#ff8a5b)"><svg viewBox="0 0 24 24"><path d="M6 7h12v10H6V7zm2-4h8v2H8V3zM4 7v12a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2z" fill="#fff"/></svg></div>
      <div class="item-main"><div class="setting-label" style="color:#ff8a97">删除好友</div><div class="setting-sub">删除后双方好友关系解除，聊天记录保留</div></div>`;
    delRow.onclick = async () => {
      if (await confirmDialog('删除好友', `确定删除好友「${esc(f.remark || f.username)}」吗？`, true)) {
        try {
          await API.del('/api/friends/' + f.id);
          toast('好友已删除');
          App.popPage();
          if (ChatView.current && ChatView.current.type === 'dm' && ChatView.current.target.id === f.id) {
            App.popPage();
            ChatView.current = null;
          }
          const { friends } = await API.get('/api/friends');
          App.state.friends = friends;
          HomeView.refresh();
          ContactsView.render();
        } catch (e) { toast(e.message, 'error'); }
      }
    };
    card3.appendChild(delRow);
    body.appendChild(card3);

    App.pushPage(page);
  },

  editRemark() {
    const f = this.friend;
    const box = el('div');
    box.innerHTML = `<div class="modal-title">设置备注名<button class="modal-close">✕</button></div>`;
    const input = el('input', 'inline-input');
    input.value = f.remark || '';
    input.placeholder = '给「' + f.username + '」设置备注（最多20字）';
    input.maxLength = 20;
    input.style.width = '100%';
    box.appendChild(input);
    const actions = el('div', 'modal-actions');
    const save = el('button', 'btn-primary', '保存');
    save.onclick = async () => {
      try {
        await API.post('/api/friends/remark', { friendId: f.id, remark: input.value.trim() });
        toast('备注已保存', 'success');
        m.close();
        App.popPage();
        this.open(f.id, this.convId);
        const { friends } = await API.get('/api/friends');
        App.state.friends = friends;
      } catch (e) { toast(e.message, 'error'); }
    };
    actions.appendChild(save);
    box.appendChild(actions);
    const m = openModal(box);
    box.querySelector('.modal-close').onclick = () => m.close();
    setTimeout(() => input.focus(), 100);
  },
};

// ===== 用户动态页（好友所有动态，含私密） =====
const UserMoments = {
  async open(userId, name) {
    const page = el('div', 'stack-page');
    page.innerHTML = `
      <div class="sub-head">
        <button class="back-btn"><svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="sub-head-main"><div class="sub-head-title">${esc(name || 'TA')}的动态</div><div class="sub-head-sub"></div></div>
      </div>
      <div style="flex:1;overflow-y:auto" id="um-body"></div>`;
    page.querySelector('.back-btn').onclick = () => App.popPage();
    App.pushPage(page);
    const body = $('#um-body', page);
    body.innerHTML = '<div class="empty"><p>加载中…</p></div>';
    try {
      const { moments, user } = await API.get('/api/moments/user/' + userId);
      $('.sub-head-title', page).innerHTML = `${esc(user.username)}的动态${user.isOfficial ? ' <span class="role-tag owner">官方</span>' : ''}`;
      $('.sub-head-sub', page).textContent = `共 ${moments.length} 条动态`;
      if (!moments.length) {
        body.innerHTML = '<div class="empty"><p>TA还没有发布动态</p></div>';
        return;
      }
      body.innerHTML = '';
      moments.forEach((mt, i) => {
        const card = MomentsView.renderCard(mt, i);
        body.appendChild(card);
      });
    } catch (e) {
      body.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`;
    }
  },
};
