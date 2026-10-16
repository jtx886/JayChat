// 后台管理：所有用户 / 封禁 / 禁言（自定义时间）
const AdminView = {
  async open() {
    const page = el('div', 'stack-page');
    page.innerHTML = `
      <div class="sub-head">
        <button class="back-btn"><svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="sub-head-main"><div class="sub-head-title">后台管理</div><div class="setting-sub" id="admin-sub">加载中…</div></div>
        <button class="head-btn" id="admin-refresh"><svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 11-5 5H5a7 7 0 107-7z" fill="currentColor"/></svg></button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:8px 0 30px">
        <div style="padding:0 14px 6px" class="search-bar">
          <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z" fill="currentColor"/></svg>
          <input id="admin-search" placeholder="搜索昵称 / 邮箱">
        </div>
        <div id="admin-list"></div>
      </div>`;
    page.querySelector('.back-btn').onclick = () => App.popPage();
    App.pushPage(page);
    this.body = $('#admin-list', page);
    $('#admin-search', page).oninput = (e) => this.load(e.target.value.trim());
    $('#admin-refresh', page).onclick = () => this.load($('#admin-search', page).value.trim());
    await this.load('');
  },

  async load(q) {
    try {
      const { users } = await API.get('/api/admin/users?q=' + encodeURIComponent(q));
      $('#admin-sub').textContent = `共 ${users.length} 位用户`;
      this.body.innerHTML = '';
      if (!users.length) {
        this.body.innerHTML = '<div class="empty"><p>未找到用户</p></div>';
        return;
      }
      users.forEach((u, i) => this.body.appendChild(this.renderUser(u, i)));
    } catch (e) {
      this.body.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`;
    }
  },

  renderUser(u, i) {
    const me = App.state.me;
    const card = el('div', 'admin-user-card glass');
    card.style.animationDelay = Math.min(i * 0.03, 0.3) + 's';
    card.appendChild(renderAvatar({ ...u, showOnline: true, online: u.online }));

    const main = el('div', 'item-main');
    const statusHtml = u.bannedUntil
      ? `<span class="status-chip banned">已封禁</span>`
      : u.globalMutedUntil
        ? `<span class="status-chip muted">已禁言</span>`
        : `<span class="status-chip ok">正常</span>`;
    main.innerHTML = `
      <div class="item-title">${esc(u.username)}
        ${u.isOfficial ? '<span class="role-tag owner">官方</span>' : ''}
        ${u.role === 'admin' ? '<span class="role-tag">管理员</span>' : ''}
        ${statusHtml}
      </div>
      <div class="item-sub">${esc(u.email)}</div>
      <div class="item-sub">注册于 ${fmtFull(u.createdAt)} · ${u.online ? '<span class="online-tag">在线</span>' : '离线'}</div>
      ${u.bannedUntil ? `<div class="item-sub" style="color:#ff8a97">封禁至 ${fmtFull(u.bannedUntil)}</div>` : ''}
      ${u.globalMutedUntil ? `<div class="item-sub" style="color:#ffcd7a">禁言至 ${fmtFull(u.globalMutedUntil)}</div>` : ''}`;
    card.appendChild(main);

    if (u.id !== me.id && u.role !== 'admin') {
      const actions = el('div', 'admin-actions');
      actions.style.gridColumn = '1/-1';
      if (u.bannedUntil) {
        const unban = el('button', 'mini-btn good', '解封');
        unban.onclick = () => this.act('unban', { userId: u.id }, '已解封');
        actions.appendChild(unban);
      } else {
        const ban = el('button', 'mini-btn warn', '封禁');
        ban.onclick = async () => {
          const mins = await durationModal(`封禁 ${u.username}`, '封禁');
          if (mins) this.act('ban', { userId: u.id, minutes: mins }, `已封禁${mins}分钟`);
        };
        actions.appendChild(ban);
      }
      if (u.globalMutedUntil) {
        const unmute = el('button', 'mini-btn good', '解除禁言');
        unmute.onclick = () => this.act('unmute', { userId: u.id }, '已解除禁言');
        actions.appendChild(unmute);
      } else {
        const mute = el('button', 'mini-btn', '禁言');
        mute.onclick = async () => {
          const mins = await durationModal(`禁言 ${u.username}`, '禁言');
          if (mins) this.act('mute', { userId: u.id, minutes: mins }, `已禁言${mins}分钟`);
        };
        actions.appendChild(mute);
      }
      card.appendChild(actions);
    }
    return card;
  },

  async act(action, body, okMsg) {
    try {
      await API.post('/api/admin/' + action, body);
      toast(okMsg, 'success');
      this.load($('#admin-search') ? $('#admin-search').value.trim() : '');
    } catch (e) { toast(e.message, 'error'); }
  },
};
