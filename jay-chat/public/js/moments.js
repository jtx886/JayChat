// 动态：社区流 / 发布 / 详情（点赞评论）
const MomentsView = {
  async open() {
    const page = el('div', 'stack-page');
    page.innerHTML = `
      <div class="sub-head">
        <button class="back-btn"><svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="sub-head-main"><div class="sub-head-title">动态社区</div><div class="sub-head-sub">所有人的公开动态 · 大社区</div></div>
        <button class="head-btn" id="mom-refresh"><svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 11-5 5H5a7 7 0 107-7z" fill="currentColor"/></svg></button>
      </div>
      <div style="flex:1;overflow-y:auto" id="moments-body"></div>`;
    page.querySelector('.back-btn').onclick = () => App.popPage();
    App.pushPage(page);
    const body = $('#moments-body', page);
    body.innerHTML = '<div class="empty"><p>加载中…</p></div>';
    $('#mom-refresh', page).onclick = () => this.load(body);
    await this.load(body);
  },

  async load(body) {
    try {
      const { moments } = await API.get('/api/moments/feed');
      body.innerHTML = '';
      if (!moments.length) {
        body.innerHTML = '<div class="empty"><p>还没有动态，去发布第一条吧！</p></div>';
        return;
      }
      moments.forEach((mt, i) => body.appendChild(this.renderCard(mt, i)));
    } catch (e) {
      body.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`;
    }
  },

  renderCard(mt, i) {
    const card = el('div', 'moment-card glass');
    card.style.animationDelay = Math.min(i * 0.04, 0.4) + 's';
    const isMe = mt.userId === App.state.me.id;
    const friend = App.state.friends.find((f) => f.id === mt.userId);
    const displayName = isMe ? App.state.me.username : (friend ? (friend.remark || friend.username) : mt.user.username);
    card.appendChild(renderAvatar({ ...mt.user, username: displayName }));

    const mainEl = el('div', 'moment-body');
    const head = el('div', 'moment-head');
    head.innerHTML = `
      <span class="moment-user">${esc(displayName)}</span>
      ${mt.user.isOfficial ? '<span class="role-tag owner">官方</span>' : ''}
      <span class="moment-vis">${this.visLabel(mt.visibility)}</span>
      ${isMe ? '<span class="moment-vis" style="cursor:pointer" data-del>删除</span>' : ''}`;
    mainEl.appendChild(head);
    mainEl.appendChild(el('div', 'moment-time', fmtFull(mt.createdAt)));
    if (mt.text) mainEl.appendChild(el('div', 'moment-text', esc(mt.text)));

    if (mt.media && mt.media.length) {
      const g = el('div', 'moment-media g' + Math.min(mt.media.length, 3));
      for (const m of mt.media) {
        const item = el('div', 'm-item');
        if (m.type === 'video') {
          item.innerHTML = `<video src="${m.url}" preload="metadata"></video><span class="video-mark"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#fff"/></svg></span>`;
        } else {
          item.innerHTML = `<img src="${m.url}" loading="lazy" alt="">`;
        }
        item.onclick = () => viewMedia(m.url, m.type === 'video');
        g.appendChild(item);
      }
      mainEl.appendChild(g);
    }

    const actions = el('div', 'moment-actions');
    const likeBtn = el('button', 'moment-action' + (mt.liked ? ' liked' : ''), `
      <svg viewBox="0 0 24 24">${mt.liked
        ? '<path d="M12 21s-7.5-4.7-10-9.3C.6 8.3 2.5 4.5 6 4.5c2.1 0 3.9 1.2 5 3 1-1.8 2.9-3 5-3 3.5 0 5.4 3.8 4 7.2C17.5 16.3 12 21 12 21z" fill="currentColor"/>'
        : '<path d="M12 21s-7.5-4.7-10-9.3C.6 8.3 2.5 4.5 6 4.5c2.1 0 3.9 1.2 5 3 1-1.8 2.9-3 5-3 3.5 0 5.4 3.8 4 7.2C17.5 16.3 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="1.6"/>'}</svg>
      <span>${mt.likeCount || 0}</span>`);
    likeBtn.onclick = async () => {
      try {
        const res = await API.post(`/api/moments/${mt.id}/like`);
        mt.liked = res.liked; mt.likeCount = res.likeCount;
        likeBtn.classList.toggle('liked', mt.liked);
        likeBtn.querySelector('span').textContent = mt.likeCount;
      } catch (e) { toast(e.message, 'error'); }
    };
    const cmtBtn = el('button', 'moment-action', `
      <svg viewBox="0 0 24 24"><path d="M4 4h16a1 1 0 011 1v11a1 1 0 01-1 1H8l-4 3.5V5a1 1 0 011-1z" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>
      <span>${mt.commentCount || 0}</span>`);
    cmtBtn.onclick = () => MomentDetail.open(mt.id);
    actions.append(likeBtn, cmtBtn);
    mainEl.appendChild(actions);

    // 最新评论预览
    if (mt.comments && mt.comments.length) {
      const preview = el('div', 'comment-list');
      for (const c of mt.comments.slice(-2)) {
        preview.appendChild(this.renderComment(c));
      }
      mainEl.appendChild(preview);
    }

    const del = head.querySelector('[data-del]');
    if (del) {
      del.onclick = async () => {
        if (await confirmDialog('删除动态', '确定删除这条动态吗？删除后无法恢复。', true)) {
          try {
            await API.del('/api/moments/' + mt.id);
            toast('动态已删除');
            card.style.transition = 'all .3s';
            card.style.opacity = '0';
            setTimeout(() => card.remove(), 300);
          } catch (e) { toast(e.message, 'error'); }
        }
      };
    }

    card.appendChild(mainEl);
    return card;
  },

  renderComment(c) {
    const item = el('div', 'comment-item');
    const friend = App.state.friends.find((f) => f.id === c.userId);
    const isMe = c.userId === App.state.me.id;
    const name = isMe ? App.state.me.username : (friend ? (friend.remark || friend.username) : (c.user ? c.user.username : '用户'));
    item.appendChild(renderAvatar({ username: name, avatar: c.user ? c.user.avatar : null }, 'sm'));
    item.appendChild(el('div', 'comment-main', `
      <div class="comment-user">${esc(name)}${c.user && c.user.isOfficial ? ' <span class="role-tag owner">官方</span>' : ''}</div>
      <div class="comment-text">${esc(c.text)}</div>
      <div class="comment-time">${fmtFull(c.createdAt)}</div>`));
    return item;
  },

  visLabel(v) {
    return { public: '公开', private: '私密', friends: '指定好友可见', exclude: '不给谁看' }[v] || v;
  },

  // ===== 发布动态 =====
  openPublish() {
    const page = el('div', 'stack-page');
    page.innerHTML = `
      <div class="sub-head">
        <button class="back-btn"><svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="sub-head-main"><div class="sub-head-title">发布动态</div><div class="setting-sub">图文 / 视频 · 配文</div></div>
        <button class="send-btn" id="pub-submit" style="height:36px;padding:0 16px">发布</button>
      </div>
      <div class="publish-body">
        <textarea class="publish-textarea" id="pub-text" placeholder="这一刻的想法…（支持图文/视频配文）" maxlength="2000"></textarea>
        <div class="pub-media-grid" id="pub-media"></div>
        <p style="font-size:13px;color:var(--text-2);margin:16px 0 2px;font-weight:600">谁可以看</p>
        <div class="vis-options" id="pub-vis">
          <button class="vis-opt active" data-v="public">公开（所有人可见）</button>
          <button class="vis-opt" data-v="private">私密（仅好友可见）</button>
          <button class="vis-opt" data-v="friends">指定好友可见</button>
          <button class="vis-opt" data-v="exclude">不给谁看</button>
        </div>
        <div id="pub-custom"></div>
      </div>`;
    page.querySelector('.back-btn').onclick = () => App.popPage();

    const state = { media: [], visibility: 'public', visibleTo: [], hiddenFrom: [] };
    const mediaGrid = $('#pub-media', page);
    const custom = $('#pub-custom', page);

    const renderMedia = () => {
      mediaGrid.innerHTML = '';
      state.media.forEach((m, i) => {
        const item = el('div', 'pub-media-item');
        item.innerHTML = m.type === 'video' ? `<video src="${m.data}" preload="metadata"></video>` : `<img src="${m.data}">`;
        const del = el('button', 'pub-media-del', '✕');
        del.onclick = () => { state.media.splice(i, 1); renderMedia(); };
        item.appendChild(del);
        mediaGrid.appendChild(item);
      });
      if (state.media.length < 9) {
        const add = el('div', 'pub-media-add', '<svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" fill="currentColor"/></svg>');
        add.onclick = async () => {
          const files = await pickFiles('image/*,video/*', true);
          for (const f of files) {
            if (state.media.length >= 9) break;
            if (f.type.startsWith('video/')) {
              if (f.size > 60 * 1024 * 1024) { toast('视频不能超过60MB', 'error'); continue; }
              state.media.push({ type: 'video', data: await fileToDataURL(f) });
            } else {
              state.media.push({ type: 'image', data: await compressImage(f) });
            }
          }
          renderMedia();
        };
        mediaGrid.appendChild(add);
      }
    };
    renderMedia();

    $$('.vis-opt', page).forEach((b) => b.onclick = () => {
      $$('.vis-opt', page).forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state.visibility = b.dataset.v;
      renderCustom();
    });

    function renderCustom() {
      custom.innerHTML = '';
      if (state.visibility === 'friends' || state.visibility === 'exclude') {
        const isInclude = state.visibility === 'friends';
        const label = isInclude ? '选择可见的好友' : '选择不可见的好友';
        const btn = el('button', 'btn-ghost', `${label}${(isInclude ? state.visibleTo : state.hiddenFrom).length ? `（已选${(isInclude ? state.visibleTo : state.hiddenFrom).length}人）` : ''}`);
        btn.style.marginTop = '10px';
        btn.onclick = () => {
          pickFriendsModal({
            title: label,
            onDone: (ids) => {
              if (isInclude) state.visibleTo = ids; else state.hiddenFrom = ids;
              renderCustom();
            },
          });
        };
        custom.appendChild(btn);
      }
    }

    $('#pub-submit', page).onclick = async () => {
      const text = $('#pub-text', page).value.trim();
      if (!text && !state.media.length) return toast('请写点什么或添加图片/视频', 'error');
      if ((state.visibility === 'friends' && !state.visibleTo.length) || (state.visibility === 'exclude' && !state.hiddenFrom.length)) {
        return toast('请选择好友名单', 'error');
      }
      const btn = $('#pub-submit', page);
      btn.disabled = true; btn.textContent = '发布中…';
      try {
        // 上传媒体
        const media = [];
        for (const m of state.media) {
          const { url } = await API.post('/api/users/upload', { type: m.type, data: m.data });
          media.push({ type: m.type, url });
        }
        await API.post('/api/moments', {
          text, media, visibility: state.visibility,
          visibleTo: state.visibleTo, hiddenFrom: state.hiddenFrom,
        });
        toast('动态发布成功', 'success');
        App.popPage();
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false; btn.textContent = '发布';
      }
    };

    App.pushPage(page);
  },
};

// ===== 动态详情（全部评论 + 评论输入） =====
const MomentDetail = {
  async open(id) {
    const page = el('div', 'stack-page');
    page.innerHTML = `
      <div class="sub-head">
        <button class="back-btn"><svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="sub-head-main"><div class="sub-head-title">动态详情</div></div>
      </div>
      <div style="flex:1;overflow-y:auto" id="md-body"></div>`;
    page.querySelector('.back-btn').onclick = () => App.popPage();
    App.pushPage(page);
    const body = $('#md-body', page);
    body.innerHTML = '<div class="empty"><p>加载中…</p></div>';
    try {
      const { moment: mt } = await API.get('/api/moments/' + id);
      body.innerHTML = '';
      body.appendChild(MomentsView.renderCard(mt, 0));
      const cmtSection = el('div', '');
      cmtSection.style.padding = '4px 12px 30px';
      cmtSection.appendChild(el('div', 'member-section-title', `全部评论（${mt.comments.length}）`));
      const list = el('div', 'comment-list');
      for (const c of mt.comments) list.appendChild(MomentsView.renderComment(c));
      cmtSection.appendChild(list);

      // 评论输入
      const inputBar = el('div', 'chat-input-bar');
      inputBar.style.cssText += 'position:sticky;bottom:0';
      const inp = el('textarea');
      inp.rows = 1; inp.placeholder = '写下你的评论…'; inp.maxLength = 500;
      const send = el('button', 'send-btn', '评论');
      send.onclick = async () => {
        const text = inp.value.trim();
        if (!text) return;
        try {
          const res = await API.post(`/api/moments/${id}/comment`, { text });
          inp.value = '';
          list.appendChild(MomentsView.renderComment(res.comment));
          toast('评论成功', 'success');
        } catch (e) { toast(e.message, 'error'); }
      };
      inputBar.append(inp, send);
      cmtSection.appendChild(inputBar);
      body.appendChild(cmtSection);
    } catch (e) {
      body.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`;
    }
  },
};
