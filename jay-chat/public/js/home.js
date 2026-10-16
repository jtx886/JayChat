// 首页：会话列表 + 右上角+（添加好友/创建群聊）
const HomeView = {
  convos: [],

  render() {
    const page = $('#page-home');
    page.innerHTML = `
      <div class="page-head">
        <div class="page-title">Jay Chat</div>
        <div style="display:flex;gap:8px">
          <button class="head-btn" id="home-add" title="更多功能">
            <svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" fill="currentColor"/></svg>
          </button>
        </div>
      </div>
      <div class="list" id="home-list"></div>`;
    $('#home-add').onclick = (e) => this.showPlusMenu(e);
    this.refresh();
  },

  async refresh() {
    if (!App.state.me) return;
    try {
      const { convos } = await API.get('/api/convos');
      this.convos = convos;
      this.renderList();
    } catch (e) { /* ignore */ }
    App.refreshBadges();
  },

  renderList() {
    const wrap = $('#home-list');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!this.convos.length) {
      wrap.innerHTML = `<div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
        <p>暂无会话，点击右上角 + 开始聊天吧</p></div>`;
      return;
    }
    this.convos.forEach((c, i) => {
      const item = el('div', 'list-item');
      item.style.animationDelay = Math.min(i * 0.03, 0.3) + 's';
      // 头像
      if (c.type === 'group') {
        item.appendChild(renderGroupAvatar(c));
      } else {
        item.appendChild(renderAvatar({
          username: c.name, rawName: c.rawName, avatar: c.avatar,
          isOfficial: c.isOfficial, online: c.online, showOnline: true,
        }));
      }
      // 内容
      const main = el('div', 'item-main');
      let titleHtml = esc(c.name);
      if (c.type === 'group') titleHtml += ` <span class="group-tag">群聊</span>`;
      if (c.type === 'group' && c.onlineCount) titleHtml += ` <span class="online-tag">${c.onlineCount}人在线</span>`;
      main.innerHTML = `<div class="item-title">${titleHtml}</div>`;
      const sub = el('div', 'item-sub');
      if (c.lastMsg) {
        let preview = c.lastMsg.recalled ? '撤回了一条消息' : c.lastMsg.preview;
        if (c.type === 'group' && !c.lastMsg.recalled) {
          const sender = this.convSenderName(c, c.lastMsg.senderId);
          if (sender && c.lastMsg.type === 'text') preview = sender + ': ' + preview;
        }
        sub.textContent = preview || '';
      } else {
        sub.textContent = c.type === 'group' ? `群聊 · ${c.memberCount}人` : '和TA开始聊天吧';
      }
      main.appendChild(sub);
      item.appendChild(main);
      // 时间+未读
      const end = el('div', 'item-end');
      end.innerHTML = `<div class="item-time">${c.lastMsgAt ? fmtFull(c.lastMsgAt).split(' ')[0].slice(5) : ''}</div>`;
      if (c.unread) end.appendChild(el('div', 'unread-badge', c.unread > 99 ? '99+' : c.unread));
      item.appendChild(end);

      item.onclick = () => {
        if (c.type === 'group') ChatView.openGroup(c.groupId);
        else ChatView.openDM(c.userId);
      };
      wrap.appendChild(item);
    });
  },

  convSenderName(conv, senderId) {
    if (senderId === App.state.me.id) return '我';
    const f = App.state.friends.find((x) => x.id === senderId);
    return f ? (f.remark || f.username) : null;
  },

  // ===== 右上角 + 菜单 =====
  showPlusMenu(e) {
    e.stopPropagation();
    const menu = $('#ctx-menu');
    menu.innerHTML = '';
    menu.classList.remove('hidden');
    const items = [
      { icon: '<svg viewBox="0 0 24 24"><path d="M15 12a4 4 0 100-8 4 4 0 000 8zm-9-2a3 3 0 100-6 3 3 0 000 6zm0 2c-2.7 0-6 1.3-6 3.5V19h8v-2.5c0-1.1.5-2.1 1.3-3C8 13.2 7 12 6 12zm9 0c-.5 0-1.1.1-1.7.2 1 1 1.7 2.2 1.7 3.3V19h7v-2.5c0-2.2-3.3-4.5-7-4.5z" fill="currentColor"/></svg>', text: '添加好友', fn: () => this.showAddFriend() },
      { icon: '<svg viewBox="0 0 24 24"><path d="M16 11a4 4 0 100-8 4 4 0 000 8zm-8 0a4 4 0 100-8 4 4 0 000 8zm0 2c-3 0-8 1.5-8 4.5V20h16v-2.5C16 14.5 11 13 8 13zm8 0c-.5 0-1 .1-1.6.2 1.7 1.2 3.6 2.1 3.6 4.3V20h6v-2.5c0-3-4.5-4.5-8-4.5z" fill="currentColor"/></svg>', text: '创建群聊', fn: () => this.showCreateGroup() },
    ];
    for (const it of items) {
      const b = el('button', 'ctx-item', `${it.icon}<span>${it.text}</span>`);
      b.onclick = (ev) => { ev.stopPropagation(); hideCtxMenu(); it.fn(); };
      menu.appendChild(b);
    }
    const btn = $('#home-add').getBoundingClientRect();
    menu.style.left = Math.min(btn.left - 100, window.innerWidth - 150) + 'px';
    menu.style.top = (btn.bottom + 8) + 'px';
  },

  // ===== 添加好友 =====
  showAddFriend() {
    const box = el('div');
    box.innerHTML = `<div class="modal-title">添加好友<button class="modal-close">✕</button></div>
      <p style="font-size:13px;color:var(--text-2);margin-bottom:12px">通过昵称搜索用户，发送好友申请</p>`;
    const search = el('div', 'search-bar', '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z" fill="currentColor"/></svg>');
    const inp = el('input'); inp.placeholder = '输入用户昵称搜索';
    inp.maxLength = 6;
    search.appendChild(inp);
    box.appendChild(search);
    const result = el('div', 'pick-list');
    box.appendChild(result);

    let timer = null;
    inp.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => doSearch(inp.value.trim()), 350);
    };
    async function doSearch(q) {
      result.innerHTML = '';
      if (!q) return;
      result.appendChild(el('p', '', '<p style="padding:14px;color:var(--text-3);font-size:13px">搜索中…</p>'));
      try {
        const { users } = await API.get('/api/users/search?q=' + encodeURIComponent(q));
        result.innerHTML = '';
        if (!users.length) {
          result.innerHTML = '<p style="padding:14px;color:var(--text-3);font-size:13px;text-align:center">未找到该用户</p>';
          return;
        }
        for (const u of users) {
          const row = el('div', 'pick-item');
          row.appendChild(renderAvatar(u));
          row.appendChild(el('div', 'item-main', `
            <div class="item-title">${esc(u.username)}${u.isOfficial ? '<span class="role-tag owner">官方</span>' : ''}</div>
            <div class="item-sub">${u.online ? '🟢 在线' : '⚪ 离线'}</div>`));
          const add = el('button', 'btn-ghost', '添加');
          add.style.padding = '7px 16px';
          add.onclick = async () => {
            try {
              await API.post('/api/friends/request', { userId: u.id });
              toast('好友申请已发送', 'success');
              m.close();
            } catch (err) { toast(err.message, 'error'); }
          };
          row.appendChild(add);
          result.appendChild(row);
        }
      } catch (err) {
        result.innerHTML = `<p style="padding:14px;color:#ff8a97;font-size:13px">${esc(err.message)}</p>`;
      }
    }
    const m = openModal(box);
    box.querySelector('.modal-close').onclick = () => m.close();
    setTimeout(() => inp.focus(), 100);
  },

  // ===== 创建群聊 =====
  showCreateGroup() {
    const box = el('div');
    box.innerHTML = `<div class="modal-title">创建群聊<button class="modal-close">✕</button></div>`;
    const nameRow = el('div', 'field', '<svg viewBox="0 0 24 24" class="field-icon"><path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2z" fill="currentColor"/></svg>');
    const nameInput = el('input');
    nameInput.placeholder = '群聊名称（1-20字）';
    nameInput.maxLength = 20;
    nameRow.appendChild(nameInput);
    box.appendChild(nameRow);
    const label = el('p', '', '选择群成员：');
    label.style.cssText = 'font-size:13px;color:var(--text-2);margin:14px 0 4px';
    box.appendChild(label);
    const membersWrap = el('div', 'pick-list');
    box.appendChild(membersWrap);
    let picked = new Set();

    API.get('/api/friends').then(({ friends }) => {
      App.state.friends = friends;
      if (!friends.length) {
        membersWrap.innerHTML = '<p style="padding:14px;color:var(--text-3);font-size:13px;text-align:center">暂无好友，先去添加好友吧</p>';
        return;
      }
      for (const f of friends) {
        const item = el('div', 'pick-item');
        item.appendChild(renderAvatar(f));
        item.appendChild(el('div', 'item-main', `<div class="item-title">${esc(f.remark || f.username)}</div>`));
        const check = el('div', 'pick-check', '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>');
        item.appendChild(check);
        item.onclick = () => {
          if (picked.has(f.id)) picked.delete(f.id); else picked.add(f.id);
          item.classList.toggle('picked', picked.has(f.id));
          btn.textContent = `创建群聊${picked.size ? ` (${picked.size}人)` : ''}`;
        };
        membersWrap.appendChild(item);
      }
    });

    const actions = el('div', 'modal-actions');
    const btn = el('button', 'btn-primary', '创建群聊');
    btn.onclick = async () => {
      if (!nameInput.value.trim()) return toast('请输入群聊名称', 'error');
      if (!picked.size) return toast('请至少选择1位好友', 'error');
      btn.disabled = true;
      try {
        const { groupId } = await API.post('/api/groups', {
          name: nameInput.value.trim(), memberIds: [...picked],
        });
        toast('群聊创建成功', 'success');
        m.close();
        HomeView.refresh();
        ChatView.openGroup(groupId);
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    };
    actions.appendChild(btn);
    box.appendChild(actions);
    const m = openModal(box);
    box.querySelector('.modal-close').onclick = () => m.close();
  },
};

// 首页实时更新
Bus.on('home:msg', ({ convId, msg }) => {
  const idx = HomeView.convos.findIndex((c) => c.convId === convId);
  if (idx >= 0) {
    const c = HomeView.convos[idx];
    if (msg.senderId !== App.state.me.id && !msg.readBy.includes(App.state.me.id)) c.unread = (c.unread || 0) + 1;
    c.lastMsg = { senderId: msg.senderId, type: msg.type, preview: msgPreview(msg), viewOnce: msg.viewOnce, recalled: false, createdAt: msg.createdAt };
    c.lastMsgAt = msg.createdAt;
    const list = HomeView.convos.splice(idx, 1);
    HomeView.convos.unshift(list[0]);
    if (App.state.tab === 'home') HomeView.renderList();
  } else {
    HomeView.refresh();
  }
  App.refreshBadges();
});
Bus.on('home:read', () => { /* 已读更新由chat页处理，列表无需变 */ });

function msgPreview(msg) {
  if (msg.recalled) return '撤回了一条消息';
  if (msg.type === 'image') return '[图片]';
  if (msg.type === 'video') return '[视频]';
  if (msg.type === 'sticker') return '[表情]';
  return (msg.viewOnce ? '[一次性查看] ' : '') + (msg.content || '');
}
