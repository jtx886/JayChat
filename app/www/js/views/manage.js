/* Jay Chat — group info & management */
(function () {
  const { JC } = window;
  const store = JC.store;

  const GroupInfo = {
    props: ['groupId'],
    data: () => ({ group: null, members: [], myRole: 'member', showName: false, newName: '', showInvite: false, inviteSel: {}, viewer: { src: '', type: '' } }),
    computed: {
      isOwner() { return this.myRole === 'owner'; },
      isAdmin() { return ['owner', 'admin'].includes(this.myRole); },
      canLeave() { return this.group && !this.group.isOfficial; },
      groups() { return JC.groupByLetter(this.members, m => m.username); },
      onlineCount() { return this.members.filter(m => m.online).length; }
    },
    async mounted() { await this.load(); },
    methods: {
      async load() {
        try {
          const r = await JC.api('GET', '/api/groups/' + this.groupId);
          this.group = r.group; this.members = r.members; this.myRole = r.myRole;
        } catch (e) { JC.toast(e.message); }
      },
      editName() {
        JC.api('POST', `/api/groups/${this.groupId}/name`, { name: this.newName.trim() })
          .then(() => { JC.toast('群名称已修改'); this.showName = false; this.load(); })
          .catch(e => JC.toast(e.message));
      },
      editAvatar() {
        if (!this.isAdmin) return JC.toast('仅群主/管理员可修改');
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = async () => {
          const f = await JC.compressImage(inp.files[0]);
          const fd = new FormData(); fd.append('file', f);
          try {
            const res = await fetch(`${JC.serverUrl()}/api/groups/${this.groupId}/avatar`, { method: 'POST', headers: { Authorization: 'Bearer ' + store.token }, body: fd });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);
            JC.toast('群头像已更新'); this.load();
          } catch (e) { JC.toast(e.message); }
        };
        inp.click();
      },
      memberMenu(m) {
        if (m.id === store.me.id) return;
        const actions = [];
        if (this.isOwner) {
          if (m.role === 'admin') actions.push({ label: '取消管理员', act: 'unadmin' });
          else if (m.role === 'member') actions.push({ label: '设为管理员', act: 'admin' });
          if (!this.group.isOfficial) actions.push({ label: '转让群主', act: 'transfer' });
        }
        if (this.isAdmin && m.role !== 'owner') {
          actions.push({ label: m.mutedUntil > Date.now() ? '解除禁言' : '禁言', act: m.mutedUntil > Date.now() ? 'unmute' : 'mute' });
          if (!this.group.isOfficial) actions.push({ label: '移出群聊', act: 'kick', danger: true });
        }
        if (!actions.length) return JC.toast('暂无可用操作');
        this.$root.sheet(m.username + (m.role === 'owner' ? '（群主）' : m.role === 'admin' ? '（管理员）' : ''), actions, a => this.memberAction(m, a));
      },
      async memberAction(m, a) {
        try {
          if (a.act === 'admin' || a.act === 'unadmin') { await JC.api('POST', `/api/groups/${this.groupId}/admin`, { userId: m.id, set: a.act === 'admin' }); JC.toast('已更新管理员'); }
          else if (a.act === 'transfer') {
            await this.$root.confirmAsync('转让群主', `确定将群主转让给 ${m.username} 吗？`);
            await JC.api('POST', `/api/groups/${this.groupId}/transfer`, { userId: m.id });
            JC.toast('已转让群主');
          }
          else if (a.act === 'kick') {
            await this.$root.confirmAsync('移出群聊', `确定将 ${m.username} 移出群聊吗？`);
            await JC.api('POST', `/api/groups/${this.groupId}/kick`, { userId: m.id });
            JC.toast('已移出');
          }
          else if (a.act === 'mute') return this.mutePicker(m);
          else if (a.act === 'unmute') { await JC.api('POST', `/api/groups/${this.groupId}/mute`, { userId: m.id, minutes: 0 }); JC.toast('已解除禁言'); }
          this.load();
        } catch (e) { if (e && e.message) JC.toast(e.message); }
      },
      mutePicker(m) {
        this.$root.sheet(`禁言 ${m.username}`, [
          { label: '5 分钟', act: 5 }, { label: '1 小时', act: 60 }, { label: '12 小时', act: 720 },
          { label: '24 小时', act: 1440 }, { label: '3 天', act: 4320 }, { label: '⌨️ 自定义时长', act: 'custom' }
        ], async a => {
          if (a.act === 'custom') {
            this.$root.promptCustom('自定义禁言（分钟）', async mins => {
              try { await JC.api('POST', `/api/groups/${this.groupId}/mute`, { userId: m.id, minutes: mins }); JC.toast(`已禁言 ${mins} 分钟`); this.load(); }
              catch (e) { JC.toast(e.message); }
            });
            return;
          }
          try { await JC.api('POST', `/api/groups/${this.groupId}/mute`, { userId: m.id, minutes: a.act }); JC.toast(`已禁言 ${a.act} 分钟`); this.load(); }
          catch (e) { JC.toast(e.message); }
        });
      },
      async doInvite() {
        const ids = Object.keys(this.inviteSel).filter(k => this.inviteSel[k]).map(Number);
        if (!ids.length) return JC.toast('请选择好友');
        try { await JC.api('POST', `/api/groups/${this.groupId}/invite`, { userIds: ids }); JC.toast('邀请成功'); this.showInvite = false; this.inviteSel = {}; this.load(); }
        catch (e) { JC.toast(e.message); }
      },
      async toggleMute(v) {
        try { await JC.api('POST', '/api/conversations/mute', { convType: 'group', convId: Number(this.groupId), muted: v }); JC.toast(v ? '已开启免打扰' : '已关闭免打扰'); }
        catch (e) { JC.toast(e.message); }
      },
      leave() {
        this.$root.confirm('退出群聊', this.isOwner ? '你是群主，退出后将自动转让给最早加入的成员。确定退出吗？' : '确定退出该群聊吗？', async () => {
          try { await JC.api('POST', `/api/groups/${this.groupId}/leave`); JC.toast('已退出群聊'); JC.refreshAll(); this.$root.back(); }
          catch (e) { JC.toast(e.message); }
        });
      },
      mutedText(m) {
        if (m.mutedUntil > Date.now()) {
          const mins = Math.ceil((m.mutedUntil - Date.now()) / 60000);
          return mins >= 1440 ? `禁言 ${Math.ceil(mins / 1440)} 天` : mins >= 60 ? `禁言 ${Math.ceil(mins / 60)} 小时` : `禁言 ${mins} 分钟`;
        }
        return '';
      }
    },
    template: `
      <div class="page" v-if="group">
        <UI.NavHeader title="群聊信息" @back="$root.back()"></UI.NavHeader>
        <div class="page-inner safe-bottom">
          <div class="card" style="margin:10px 12px;padding:16px;display:flex;align-items:center;gap:14px;">
            <div style="cursor:pointer;" @click="editAvatar">
              <UI.Avatar :src="group.avatar" :name="group.name" :size="64" :radius="18"/>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:18px;font-weight:800;display:flex;align-items:center;gap:6px;">{{group.name}}
                <span v-if="group.isOfficial" class="badge-verify"><svg viewBox="0 0 24 24" fill="#fff"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg></span>
              </div>
              <div style="font-size:12px;color:#8e8e93;margin-top:4px;">{{onlineCount}} 人在线 · {{group.memberCount}} 位成员</div>
              <div style="font-size:11px;color:#a9abb2;margin-top:2px;">我的身份：{{isOwner?'群主':myRole==='admin'?'管理员':'普通成员'}}</div>
            </div>
          </div>

          <div class="list-card">
            <div class="row" @click="isAdmin && (showName=true)">
              <div class="row-title" style="font-size:15px;">群聊名称</div>
              <span style="font-size:13px;color:#8e8e93;">{{group.name}}</span>
              <svg class="chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
            </div>
            <div class="row" @click="showInvite=true">
              <div class="row-title" style="font-size:15px;">邀请好友</div>
              <svg class="chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
            </div>
          </div>

          <div class="section-label">群成员（{{group.memberCount}}）</div>
          <template v-for="g in groups" :key="g.letter">
            <div class="idx-letter">{{g.letter}}</div>
            <div class="list-card">
              <div class="row" v-for="m in g.items" :key="m.id" @click="memberMenu(m)">
                <UI.Avatar :src="m.avatar" :name="m.username" :online="m.online" :size="40"/>
                <div style="flex:1;min-width:0;">
                  <div class="row-title">{{m.username}}
                    <span v-if="m.role==='owner'" class="role-badge owner" style="position:static;">群主</span>
                    <span v-else-if="m.role==='admin'" class="role-badge admin" style="position:static;">管理员</span>
                    <span v-if="m.isBot" class="bot-tag">机器人</span>
                  </div>
                  <div style="font-size:11px;color:#a9abb2;" v-if="mutedText(m)">{{mutedText(m)}}</div>
                </div>
                <span class="tag-online" style="font-size:11px;">{{m.online?'在线':'离线'}}</span>
                <svg class="chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
              </div>
            </div>
          </template>

          <div class="list-card" style="margin-top:12px;">
            <div class="row" style="cursor:default;">
              <div class="row-title" style="font-size:15px;">消息免打扰</div>
              <UI.Switch :modelValue="!!(store.conversations.find(c=>c.convType==='group'&&c.convId==groupId)||{}).muted" @update:modelValue="toggleMute"/>
            </div>
          </div>

          <div v-if="canLeave" style="padding:14px 12px;">
            <button class="btn danger" @click="leave">退出群聊</button>
          </div>
          <div v-else class="hint">Jay Chat官方群为官方群聊，不支持退出</div>
        </div>

        <UI.Modal :show="showName" title="修改群名称" @close="showName=false">
          <div class="field" style="margin:0;"><input v-model="newName" placeholder="新的群名称" maxlength="20"/></div>
          <div class="modal-btns"><button class="btn plain" @click="showName=false">取消</button><button class="btn" @click="editName">保存</button></div>
        </UI.Modal>

        <UI.Modal :show="showInvite" title="邀请好友进群" @close="showInvite=false">
          <div style="max-height:46vh;overflow-y:auto;margin:0 -8px;">
            <div class="row" v-for="f in store.friends" :key="f.id" @click="inviteSel[f.id]=!inviteSel[f.id]">
              <UI.Avatar :src="f.avatar" :name="f.remark||f.username" :size="36"/>
              <div class="row-title">{{f.remark||f.username}}</div>
              <div :style="{width:'20px',height:'20px',borderRadius:'50%',border:inviteSel[f.id]?'none':'2px solid #c7c9cf',background:inviteSel[f.id]?'#0a84ff':'transparent',display:'flex',alignItems:'center',justifyContent:'center'}">
                <svg v-if="inviteSel[f.id]" viewBox="0 0 24 24" width="12" height="12" fill="#fff"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
              </div>
            </div>
            <div v-if="!store.friends.length" class="empty"><span>暂无好友可邀请</span></div>
          </div>
          <div class="modal-btns"><button class="btn plain" @click="showInvite=false">取消</button><button class="btn" @click="doInvite">邀请</button></div>
        </UI.Modal>
      </div>`
  };

  window.Views = window.Views || {};
  window.Views.groupInfo = GroupInfo;
})();
