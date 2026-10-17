/* Jay Chat — me tab + publish moment */
(function () {
  const { JC } = window;
  const store = JC.store;

  const APP_VERSION = '1.2.0';

  const Me = {
    data: () => ({ nameQuota: 2, showName: false, newName: '', showAbout: false }),
    computed: { store() { return store; } },
    async mounted() {
      try { this.nameQuota = (await JC.api('GET', '/api/users/name-quota')).remaining; } catch (e) { }
    },
    methods: {
      async changeAvatar() {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = async () => {
          const f = await JC.compressImage(inp.files[0]);
          try {
            const r = await JC.upload(f);
            await JC.api('POST', '/api/users/avatar-url', { url: r.url });
            store.me.avatar = r.url;
            JC.toast('头像已更新');
          } catch (e) { JC.toast(e.message); }
        };
        inp.click();
      },
      saveName() {
        JC.api('POST', '/api/users/name', { username: this.newName.trim() })
          .then(r => { store.me.username = r.username; this.nameQuota = r.remaining; JC.toast('改名成功，本周还可修改 ' + r.remaining + ' 次'); this.showName = false; })
          .catch(e => JC.toast(e.message));
      },
      publish() { this.$root.go('publish'); },
      myMoments() { this.$root.go('moments', { scope: 'mine' }); },
      allMoments() { this.$root.go('moments', { scope: 'all' }); },
      async doLogout() {
        this.$root.confirm('退出登录', '确定要退出当前账号吗？', () => {
          JC.logout();
        });
      }
    },
    template: `
      <div class="page">
        <div class="navbar glassy"><div class="nav-side"></div><div class="nav-title">我的</div><div class="nav-side"></div></div>
        <div class="page-inner safe-bottom">
          <div class="card" style="margin:10px 12px;padding:20px;display:flex;align-items:center;gap:16px;">
            <div style="cursor:pointer;position:relative;" @click="changeAvatar">
              <UI.Avatar :src="store.me?.avatar" :name="store.me?.username" :size="72" :radius="22"/>
              <div style="position:absolute;bottom:-4px;right:-4px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center;color:#0a84ff;"><UI.Icon name="camera" :size="13"/></div>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:21px;font-weight:800;display:flex;align-items:center;gap:8px;">{{store.me?.username}}</div>
              <div style="font-size:12px;color:#8e8e93;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{store.me?.email || ''}}</div>
              <div style="font-size:11px;color:#a9abb2;margin-top:2px;">点击头像更换 · 剩余改名次数 {{nameQuota}}/周</div>
            </div>
          </div>

          <div class="list-card">
            <div class="row" @click="showName=true">
              <div class="notif-ico" style="background:rgba(10,132,255,.12);color:#0a84ff;"><UI.Icon name="edit" :size="17"/></div>
              <div class="row-title">修改名字</div>
              <span style="font-size:12px;color:#a9abb2;">一周限 2 次</span>
              <svg class="chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
            </div>
            <div class="row" @click="publish">
              <div class="notif-ico" style="background:rgba(255,159,10,.12);color:#ff9f0a;"><UI.Icon name="sparkle" :size="17"/></div>
              <div class="row-title">发布动态</div>
              <svg class="chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
            </div>
            <div class="row" @click="myMoments">
              <div class="notif-ico" style="background:rgba(94,92,230,.12);color:#5e5ce6;"><UI.Icon name="folder" :size="17"/></div>
              <div class="row-title">我的动态</div>
              <svg class="chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
            </div>
            <div class="row" @click="allMoments">
              <div class="notif-ico" style="background:rgba(48,209,88,.12);color:#30d158;"><UI.Icon name="globe" :size="17"/></div>
              <div class="row-title">动态广场</div>
              <svg class="chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
            </div>
          </div>

          <div class="list-card" style="margin-top:12px;">
            <div class="row" @click="showAbout=true">
              <div class="notif-ico" style="background:rgba(120,120,128,.12);color:#7d7f86;"><UI.Icon name="info" :size="17"/></div>
              <div class="row-title">关于 Jay Chat</div>
              <span style="font-size:12px;color:#a9abb2;">v{{APP_VERSION}}</span>
              <svg class="chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
            </div>
            <div class="row" @click="doLogout">
              <div class="notif-ico" style="background:rgba(255,59,48,.1);color:#ff3b30;"><UI.Icon name="logout" :size="17"/></div>
              <div class="row-title" style="color:#ff3b30;">退出登录</div>
            </div>
          </div>
          <div class="hint">Jay Chat · 跨网络实时聊天 · 全部时间均为 24 小时制</div>
        </div>

        <UI.Modal :show="showName" title="修改名字" @close="showName=false">
          <div class="field" style="margin:0;"><input v-model="newName" placeholder="新的昵称（1-6 个字符）" maxlength="6"/></div>
          <div class="hint" style="padding:8px 0 0;">本周剩余修改次数：{{nameQuota}}</div>
          <div class="modal-btns"><button class="btn plain" @click="showName=false">取消</button><button class="btn" @click="saveName">保存</button></div>
        </UI.Modal>

        <UI.Modal :show="showAbout" title="关于 Jay Chat" @close="showAbout=false">
          <div style="text-align:center;padding:6px 0 2px;">
            <div style="font-size:15px;font-weight:800;">Jay Chat v{{APP_VERSION}}</div>
            <div style="font-size:12.5px;color:#8e8e93;margin-top:8px;line-height:1.7;">
              跨网络实时聊天 · 毛玻璃 UI<br/>
              支持文本 / 图片 / 视频 / 语音 / 引用 / 转发<br/>
              动画表情包 · 阅后即焚 · 已读回执 · 动态社区<br/>
              双后端：Node 实时推送 / PHP 轮询
            </div>
          </div>
          <div class="modal-btns"><button class="btn" @click="showAbout=false">好的</button></div>
        </UI.Modal>
      </div>`
  };

  // ================= Publish moment =================
  const Publish = {
    data: () => ({ content: '', media: [], visibility: 'public', selected: {}, sending: false }),
    computed: {
      friends() { return store.friends; },
      visOptions() {
        return [
          { v: 'public', label: '公开', desc: '所有人可见', ico: 'globe', color: '#0a84ff' },
          { v: 'private', label: '私密', desc: '仅自己可见', ico: 'eye', color: '#7d7f86' },
          { v: 'visible', label: '指定好友可见', desc: '仅选中的好友可见', ico: 'users', color: '#30d158' },
          { v: 'hide', label: '不给谁看', desc: '选中的好友不可见', ico: 'close', color: '#ff3b30' }
        ];
      },
      pickedIds() { return Object.keys(this.selected).filter(k => this.selected[k]).map(Number); }
    },
    methods: {
      pick() {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*,video/*'; inp.multiple = true;
        inp.onchange = () => {
          for (const f of [...inp.files].slice(0, 9 - this.media.length)) {
            this.media.push({ file: f, preview: URL.createObjectURL(f), type: /^video\//i.test(f.type) ? 'video' : 'image' });
          }
        };
        inp.click();
      },
      rm(i) { this.media.splice(i, 1); },
      async publish() {
        if (this.sending) return;
        if (!this.content.trim() && !this.media.length) return JC.toast('说点什么吧');
        if ((this.visibility === 'visible' || this.visibility === 'hide') && !this.pickedIds.length) return JC.toast('请选择好友');
        this.sending = true;
        try {
          const urls = [];
          for (const m of this.media) {
            const f = m.type === 'image' ? await JC.compressImage(m.file) : m.file;
            const r = await JC.upload(f);
            urls.push({ type: m.type, url: r.url });
          }
          await JC.api('POST', '/api/moments', {
            content: this.content, media: urls, visibility: this.visibility,
            visibleTo: this.pickedIds, hideFrom: this.pickedIds
          });
          JC.toast('动态发布成功');
          this.$root.back();
          JC.emitBus('moments-refresh');
        } catch (e) { JC.toast(e.message); }
        this.sending = false;
      }
    },
    template: `
      <div class="page">
        <UI.NavHeader title="发布动态" @back="$root.back()"></UI.NavHeader>
        <div class="page-inner safe-bottom">
          <div class="card" style="margin:10px 12px;padding:14px;">
            <textarea v-model="content" placeholder="这一刻的想法…" style="width:100%;border:none;outline:none;background:transparent;font-size:15px;min-height:110px;resize:none;line-height:1.5;"></textarea>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">
              <div v-for="(m,i) in media" :key="i" style="position:relative;width:78px;height:78px;border-radius:12px;overflow:hidden;">
                <img v-if="m.type==='image'" :src="m.preview" style="width:100%;height:100%;object-fit:cover;"/>
                <video v-else :src="m.preview" style="width:100%;height:100%;object-fit:cover;"></video>
                <span @click="rm(i)" style="position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;">✕</span>
              </div>
              <div v-if="media.length<9" @click="pick" style="width:78px;height:78px;border-radius:12px;border:1.5px dashed #c7c9cf;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#a9abb2;">
                <UI.Icon name="plus" :size="22"/><span style="font-size:11px;">{{media.length}}/9</span>
              </div>
            </div>
          </div>

          <div class="section-label">谁可以看</div>
          <div class="list-card">
            <div class="row" v-for="o in visOptions" :key="o.v" @click="visibility=o.v">
              <div class="notif-ico" :style="{background:'rgba(120,120,128,.08)', color:o.color}"><UI.Icon :name="o.ico" :size="16"/></div>
              <div class="row-title" style="font-size:15px;">{{o.label}}<span style="font-size:11.5px;color:#a9abb2;font-weight:400;margin-left:8px;">{{o.desc}}</span></div>
              <div :style="{width:'21px',height:'21px',borderRadius:'50%',border:visibility===o.v?'none':'2px solid #c7c9cf',background:visibility===o.v?'#0a84ff':'transparent',display:'flex',alignItems:'center',justifyContent:'center'}">
                <svg v-if="visibility===o.v" viewBox="0 0 24 24" width="13" height="13" fill="#fff"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
              </div>
            </div>
          </div>

          <template v-if="visibility==='visible'||visibility==='hide'">
            <div class="section-label">选择好友（已选 {{pickedIds.length}} 人）</div>
            <div class="list-card">
              <div class="row" v-for="f in friends" :key="f.id" @click="selected[f.id]=!selected[f.id]">
                <UI.Avatar :src="f.avatar" :name="f.remark||f.username" :size="38"/>
                <div class="row-title">{{f.remark||f.username}}</div>
                <div :style="{width:'21px',height:'21px',borderRadius:'50%',border:selected[f.id]?'none':'2px solid #c7c9cf',background:selected[f.id]?'#0a84ff':'transparent',display:'flex',alignItems:'center',justifyContent:'center'}">
                  <svg v-if="selected[f.id]" viewBox="0 0 24 24" width="13" height="13" fill="#fff"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
                </div>
              </div>
            </div>
          </template>

          <div style="padding:16px 12px;"><button class="btn" :disabled="sending" @click="publish">{{sending?'发布中…':'发 布'}}</button></div>
        </div>
      </div>`
  };

  window.Views = window.Views || {};
  window.Views.me = Me;
  window.Views.publish = Publish;
})();
