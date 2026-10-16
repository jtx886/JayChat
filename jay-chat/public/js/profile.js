// 我的：头像 / 昵称（一周2次）/ 动态入口 / 后台管理 / 退出登录
const ProfileView = {
  render() {
    const me = App.state.me;
    if (!me) return;
    const page = $('#page-profile');
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const renamesLeft = 2 - (me.renameLog || []).filter((t) => t > weekAgo).length;

    page.innerHTML = `
      <div class="page-head"><div class="page-title">我的</div></div>
      <div class="profile-hero">
        <div class="profile-card glass" id="profile-card">
          <div id="profile-avatar"></div>
          <div class="profile-info">
            <div class="profile-name">${esc(me.username)}${me.isOfficial ? '<span class="role-tag owner">官方</span>' : ''}</div>
            <div class="profile-email">${esc(me.email)}</div>
            <div class="profile-hint">注册于 ${fmtFull(me.createdAt)}</div>
          </div>
        </div>
      </div>
      <div class="menu-list glass" id="profile-menu"></div>`;

    const avatarWrap = renderAvatar(me, 'xl');
    $('#profile-avatar', page).appendChild(avatarWrap);

    // 点击头像更换
    $('#profile-card', page).onclick = (e) => {
      if (e.target.closest('.profile-info')) this.editName(renamesLeft);
      else this.editAvatar();
    };

    const menu = $('#profile-menu', page);
    const items = [
      {
        icon: '<svg viewBox="0 0 24 24"><path d="M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H9l-4 3v-3H4a1 1 0 01-1-1V5a1 1 0 011-1zm5 8a1.7 1.7 0 100-3.4A1.7 1.7 0 009 12zm6 0a1.7 1.7 0 100-3.4A1.7 1.7 0 0015 12z" fill="#fff"/></svg>',
        bg: 'linear-gradient(135deg,#2fd57c,#2fa8d5)',
        title: '发布动态', sub: '图文/视频配文 · 可选谁可以看',
        fn: () => MomentsView.openPublish(),
      },
      {
        icon: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 5h-2v6l5 3 1-1.7-4-2.3V7z" fill="#fff"/></svg>',
        bg: 'linear-gradient(135deg,#5b8cff,#8a5cff)',
        title: '动态', sub: '所有用户的大社区动态',
        fn: () => MomentsView.open(),
      },
    ];
    if (me.role === 'admin') {
      items.push({
        icon: '<svg viewBox="0 0 24 24"><path d="M12 2l3 2h4v4l3 2-3 2v4h-4l-3 2-3-2H5v-4l-3-2 3-2V4h4l3-2zm0 5a5 5 0 100 10 5 5 0 000-10zm0 2.2a2.8 2.8 0 110 5.6 2.8 2.8 0 010-5.6z" fill="#fff"/></svg>',
        bg: 'linear-gradient(135deg,#ff9a5b,#ff5b6e)',
        title: '后台管理', sub: '管理所有用户 · 封禁/禁言',
        fn: () => AdminView.open(),
      });
    }
    items.push({
      icon: '<svg viewBox="0 0 24 24"><path d="M10 3h4a1 1 0 011 1v1h4v2h-1v13a2 2 0 01-2 2H8a2 2 0 01-2-2V7H5V5h4V4a1 1 0 011-1zm1 2v1h2V5h-2zM9 9v10h2V9H9zm4 0v10h2V9h-2z" fill="#fff"/></svg>',
      bg: 'linear-gradient(135deg,#8a5cff,#d05cff)',
      title: '退出登录', sub: '清除自动登录状态',
      danger: true,
      fn: async () => {
        if (await confirmDialog('退出登录', '确定退出当前账号吗？', true)) {
          App.forceLogout();
        }
      },
    });

    items.forEach((it, i) => {
      const row = el('div', 'menu-item');
      row.style.animationDelay = i * 0.05 + 's';
      row.innerHTML = `
        <div class="menu-icon" style="background:${it.bg}">${it.icon}</div>
        <div class="item-main">
          <div class="menu-item-title" ${it.danger ? 'style="color:#ff8a97"' : ''}>${it.title}</div>
          <div class="menu-item-sub">${it.sub}</div>
        </div>
        <span class="menu-arrow"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></span>`;
      row.onclick = it.fn;
      menu.appendChild(row);
    });

    // 修改昵称入口（在名字下方点击）
    const nameHint = el('p', 'profile-hint', `点击昵称可修改（本周剩余${Math.max(renamesLeft, 0)}次）`);
    nameHint.style.cursor = 'pointer';
    nameHint.onclick = () => this.editName(renamesLeft);
    $('.profile-info', page).appendChild(nameHint);
  },

  async editAvatar() {
    const files = await pickFiles('image/*', false);
    if (!files.length) return;
    try {
      const data = await compressImage(files[0], 400, 0.82);
      const res = await API.post('/api/users/avatar', { data });
      App.state.me.avatar = res.avatar;
      toast('头像已更新', 'success');
      this.render();
    } catch (e) { toast(e.message, 'error'); }
  },

  editName(left) {
    if (left <= 0) return toast('一周只能修改2次昵称，请下次再来', 'error');
    const me = App.state.me;
    const box = el('div');
    box.innerHTML = `<div class="modal-title">修改昵称<button class="modal-close">✕</button></div>
      <p style="font-size:13px;color:var(--text-2);margin-bottom:12px">昵称1-6个字符，本周剩余 <b style="color:#9db4ff">${left}</b> 次修改机会</p>`;
    const input = el('input', 'inline-input');
    input.value = me.username;
    input.maxLength = 6;
    input.style.width = '100%';
    box.appendChild(input);
    const actions = el('div', 'modal-actions');
    const save = el('button', 'btn-primary', '保存');
    save.onclick = async () => {
      try {
        const res = await API.post('/api/users/rename', { username: input.value.trim() });
        me.username = res.username;
        toast('昵称已更新', 'success');
        m.close();
        this.render();
      } catch (e) { toast(e.message, 'error'); }
    };
    actions.appendChild(save);
    box.appendChild(actions);
    const m = openModal(box);
    box.querySelector('.modal-close').onclick = () => m.close();
    setTimeout(() => { input.focus(); input.select(); }, 100);
  },
};

Bus.on('profile:refresh', () => {
  if (App.state.tab === 'profile') ProfileView.render();
});
