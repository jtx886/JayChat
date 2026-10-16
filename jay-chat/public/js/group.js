// 群设置：群信息/成员管理（首字母分组）/邀请/踢人/管理员/禁言/转让/退出
const GroupSettings = {
  group: null,

  async open(groupId) {
    try {
      const { group } = await API.get('/api/groups/' + groupId);
      this.group = group;
      this.render();
    } catch (e) { toast(e.message, 'error'); }
  },

  canManage() {
    return this.group && ['owner', 'admin'].includes(this.group.myRole);
  },

  render() {
    const g = this.group;
    if (!g) return;
    const page = el('div', 'stack-page');
    page.innerHTML = `
      <div class="sub-head">
        <button class="back-btn"><svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="sub-head-main"><div class="sub-head-title">群聊信息</div></div>
      </div>
      <div style="flex:1;overflow-y:auto;padding-bottom:40px" id="gs-body"></div>`;
    page.querySelector('.back-btn').onclick = () => { App.popPage(); this.group = null; };
    const body = $('#gs-body', page);

    // ===== 群概览 =====
    const hero = el('div', 'settings-card glass');
    const heroRow = el('div', 'setting-row');
    heroRow.style.cursor = this.canManage() ? 'pointer' : 'default';
    heroRow.appendChild(renderGroupAvatar(g, 'lg'));
    const heroMain = el('div', 'item-main');
    heroMain.innerHTML = `
      <div class="setting-label">${esc(g.name)}${g.isOfficial ? ' <span class="role-tag owner">官方群</span>' : ''}</div>
      <div class="setting-sub">群号：${g.id.slice(0, 8)} · 创建于 ${fmtFull(g.createdAt)}</div>
      <div class="setting-sub">${g.memberCount}位成员 · <span class="online-tag">${g.onlineCount}人在线</span></div>`;
    heroRow.appendChild(heroMain);
    if (this.canManage() && !g.isOfficial) {
      heroRow.appendChild(el('span', 'menu-arrow', '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>'));
      heroRow.onclick = () => this.editGroupInfo();
    }
    hero.appendChild(heroRow);
    body.appendChild(hero);

    // ===== 成员列表（群主→管理员→成员，均按首字母） =====
    const roleOrder = { owner: 0, admin: 1, member: 2 };
    const sorted = [...g.members].sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
    const sections = [
      { title: '群主', filter: (m) => m.role === 'owner' },
      { title: '管理员', filter: (m) => m.role === 'admin' },
      { title: '群成员', filter: (m) => m.role === 'member' },
    ];
    for (const sec of sections) {
      const members = sorted.filter(sec.filter);
      if (!members.length) continue;
      body.appendChild(el('div', 'member-section-title', `${sec.title} <span class="member-count">${members.length}人</span>`));
      const card = el('div', 'settings-card glass');
      // 普通成员按首字母分组显示
      if (sec.title === '群成员') {
        const groups = groupByInitial(members, (m) => m.username);
        for (const { letter, items } of groups) {
          card.appendChild(el('div', 'letter-head', letter));
          for (const m of items) card.appendChild(this.memberRow(m));
        }
      } else {
        for (const m of members) card.appendChild(this.memberRow(m));
      }
      body.appendChild(card);
    }

    // ===== 管理操作 =====
    const opsCard = el('div', 'settings-card glass');
    const invite = el('div', 'setting-row');
    invite.innerHTML = `<div class="menu-icon" style="background:linear-gradient(135deg,#5b8cff,#8a5cff)"><svg viewBox="0 0 24 24"><path d="M15 12a4 4 0 100-8 4 4 0 000 8zm-9-2a3 3 0 100-6 3 3 0 000 6zm0 2c-2.7 0-6 1.3-6 3.5V19h8v-2.5c0-1.1.5-2.1 1.3-3C7.7 13.2 6.9 12 6 12zm9 0c-.5 0-1.1.1-1.7.2 1 1 1.7 2.2 1.7 3.3V19h7v-2.5c0-2.2-3.3-4.5-7-4.5z" fill="#fff"/></svg></div>
      <div class="item-main"><div class="setting-label">邀请好友入群</div><div class="setting-sub">添加你的好友进入群聊</div></div>`;
    invite.onclick = () => this.invite();
    opsCard.appendChild(invite);

    if (!g.isOfficial) {
      const quit = el('div', 'setting-row');
      const isOwner = g.myRole === 'owner';
      quit.innerHTML = `<div class="menu-icon" style="background:linear-gradient(135deg,#ff5b6e,#ff8a5b)"><svg viewBox="0 0 24 24"><path d="M10 3h4a1 1 0 011 1v1h4v2h-1v13a2 2 0 01-2 2H8a2 2 0 01-2-2V7H5V5h4V4a1 1 0 011-1zm1 2v1h2V5h-2zM9 9v10h2V9H9zm4 0v10h2V9h-2z" fill="#fff"/></svg></div>
        <div class="item-main"><div class="setting-label" style="color:#ff8a97">${isOwner ? '解散群聊' : '退出群聊'}</div>
        <div class="setting-sub">${isOwner ? '群主退出将解散该群聊' : '退出后不再接收该群消息'}</div></div>`;
      quit.onclick = () => this.quit(isOwner);
      opsCard.appendChild(quit);
    }
    body.appendChild(opsCard);

    App.pushPage(page);
  },

  memberRow(m) {
    const g = this.group;
    const me = App.state.me;
    const row = el('div', 'list-item');
    row.appendChild(renderAvatar({ ...m, showOnline: true, online: m.online }));
    const main = el('div', 'item-main');
    let tags = '';
    if (m.role === 'owner') tags += '<span class="role-tag owner">群主</span>';
    if (m.role === 'admin') tags += '<span class="role-tag">管理员</span>';
    if (m.mutedUntil) tags += '<span class="mute-tag">禁言中</span>';
    main.innerHTML = `<div class="item-title">${esc(m.username)}${m.isOfficial ? '<span class="role-tag owner">官方</span>' : ''} ${tags}</div>
      <div class="item-sub ${m.online ? 'online-tag' : ''}">${m.online ? '● 在线' : '○ 离线'} · 加入于 ${fmtFull(m.joinedAt)}</div>`;
    row.appendChild(main);

    // 操作按钮（不对自己，不对群主）
    const canManage = this.canManage();
    const isSelf = m.id === me.id;
    const isOwner = m.role === 'owner';
    if (canManage && !isSelf && !isOwner) {
      row.onclick = () => this.memberMenu(m);
    }
    return row;
  },

  memberMenu(m) {
    const g = this.group;
    const menu = $('#ctx-menu');
    menu.innerHTML = '';
    menu.classList.remove('hidden');
    const items = [];
    const myRole = g.myRole;

    // 禁言 / 解除禁言
    if (m.mutedUntil) {
      items.push({ text: '解除禁言', danger: false, fn: () => this.act('unmute', { userId: m.id }, '已解除禁言') });
    } else {
      items.push({ text: '禁言（自定义时长）', danger: true, fn: async () => {
        const mins = await durationModal(`禁言 ${m.username}`, '禁言');
        if (mins) this.act('mute', { userId: m.id, minutes: mins }, `已禁言${mins}分钟`);
      } });
    }
    // 管理员设置（仅群主）
    if (myRole === 'owner') {
      if (m.role === 'member') {
        items.push({ text: '设为管理员', fn: () => this.act('role', { userId: m.id, role: 'admin' }, '已设为管理员') });
      } else if (m.role === 'admin') {
        items.push({ text: '取消管理员', fn: () => this.act('role', { userId: m.id, role: 'member' }, '已取消管理员') });
        items.push({ text: '转让群主', fn: () => this.transfer(m) });
      } else if (m.role === 'member') {
        items.push({ text: '转让群主', fn: () => this.transfer(m) });
      }
    }
    // 踢人
    if (myRole === 'owner' || (myRole === 'admin' && m.role === 'member')) {
      items.push({ text: '移出群聊', danger: true, fn: async () => {
        if (await confirmDialog('移出群聊', `确定将「${esc(m.username)}」移出群聊吗？`, true)) {
          this.act('kick', { userId: m.id }, '已移出群聊');
        }
      } });
    }
    // 普通成员转让群主入口
    if (myRole === 'owner' && m.role === 'member' && !items.some((i) => i.text === '转让群主')) {
      items.push({ text: '转让群主', fn: () => this.transfer(m) });
    }

    if (!items.length) return;
    for (const it of items) {
      const b = el('button', 'ctx-item' + (it.danger ? ' danger' : ''), `<span>${it.text}</span>`);
      b.onclick = async (ev) => { ev.stopPropagation(); hideCtxMenu(); it.fn(); };
      menu.appendChild(b);
    }
    const x = window.innerWidth / 2, y = window.innerHeight / 3;
    menu.style.left = Math.max(10, x - 70) + 'px';
    menu.style.top = y + 'px';
  },

  async act(action, body, okMsg) {
    try {
      await API.post(`/api/groups/${this.group.id}/${action}`, body);
      toast(okMsg, 'success');
      App.popPage();
      this.open(this.group.id);
      HomeView.refresh();
    } catch (e) { toast(e.message, 'error'); }
  },

  async transfer(m) {
    if (await confirmDialog('转让群主', `确定将群主转让给「${esc(m.username)}」吗？转让后你将变为普通成员。`, true)) {
      this.act('transfer', { userId: m.id }, '群主已转让');
    }
  },

  editGroupInfo() {
    const g = this.group;
    const box = el('div');
    box.innerHTML = `<div class="modal-title">编辑群信息<button class="modal-close">✕</button></div>`;
    // 群头像
    const avatarRow = el('div', 'setting-row');
    const av = renderGroupAvatar(g, 'lg');
    avatarRow.appendChild(av);
    avatarRow.appendChild(el('div', 'item-main', '<div class="setting-label">群头像</div><div class="setting-sub">点击更换群头像</div>'));
    avatarRow.style.cursor = 'pointer';
    avatarRow.onclick = async () => {
      const files = await pickFiles('image/*', false);
      if (!files.length) return;
      const data = await compressImage(files[0], 400, 0.8);
      g._newAvatar = data;
      av.innerHTML = '';
      const newAv = renderGroupAvatar({ name: g.name, avatar: data }, 'lg');
      av.replaceWith(newAv);
    };
    box.appendChild(avatarRow);
    // 群名称
    const nameRow = el('div', 'field', '<svg viewBox="0 0 24 24" class="field-icon"><path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2z" fill="currentColor"/></svg>');
    const nameInput = el('input');
    nameInput.value = g.name; nameInput.maxLength = 20;
    nameRow.appendChild(nameInput);
    box.appendChild(nameRow);

    const actions = el('div', 'modal-actions');
    const save = el('button', 'btn-primary', '保存');
    save.onclick = async () => {
      const body = {};
      if (nameInput.value.trim() && nameInput.value.trim() !== g.name) body.name = nameInput.value.trim();
      if (g._newAvatar) body.avatar = g._newAvatar;
      if (!Object.keys(body).length) return m.close();
      try {
        await API.post(`/api/groups/${g.id}/info`, body);
        toast('群信息已更新', 'success');
        m.close();
        App.popPage();
        this.open(g.id);
        HomeView.refresh();
      } catch (e) { toast(e.message, 'error'); }
    };
    actions.appendChild(save);
    box.appendChild(actions);
    const m = openModal(box);
    box.querySelector('.modal-close').onclick = () => m.close();
  },

  invite() {
    const g = this.group;
    pickFriendsModal({
      title: '邀请好友入群',
      excludeIds: g.members.map((m) => m.id),
      onDone: async (ids) => {
        try {
          await API.post(`/api/groups/${g.id}/invite`, { userIds: ids });
          toast('邀请成功', 'success');
          App.popPage();
          this.open(g.id);
        } catch (e) { toast(e.message, 'error'); }
      },
      selectedTitle: '邀请入群',
    });
  },

  async quit(isOwner) {
    const g = this.group;
    const ok = await confirmDialog(
      isOwner ? '解散群聊' : '退出群聊',
      isOwner ? `你是群主，退出将解散「${esc(g.name)}」，所有成员将被移出。确定吗？`
        : `确定退出「${esc(g.name)}」吗？退出后将不再接收该群消息。`,
      true
    );
    if (!ok) return;
    try {
      await API.post(`/api/groups/${g.id}/quit`);
      toast(isOwner ? '群聊已解散' : '已退出群聊');
      // 关闭群设置页和聊天页
      App.popPage(); // 群设置
      if (ChatView.current && ChatView.current.convId === 'g_' + g.id) {
        App.popPage();
        ChatView.current = null;
      }
      HomeView.refresh();
    } catch (e) { toast(e.message, 'error'); }
  },
};
