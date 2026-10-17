/* Jay Chat — root app bootstrap */
(function () {
  const { JC } = window;
  const store = JC.store;

  const App = {
    data: () => ({ store, sheetData: null, confirmData: null, authView: 'login', customData: null }),
    computed: {
      top() { return store.stack[store.stack.length - 1] || null; },
      currentView() {
        if (!store.me) return this.authView;
        return this.top ? this.top.view : store.tab;
      },
      currentProps() { return this.top ? this.top.props : {}; },
      isStack() { return !!store.me && !!this.top; }
    },
    async mounted() {
      // boot
      if (store.token) {
        try {
          const r = await JC.api('GET', '/api/auth/me');
          store.me = r.user;
          await JC.detectServerType();
          JC.connectSocket();
          await JC.refreshAll();
          JC.requestNotifPermission();
        } catch (e) { JC.logout(); }
      }
      store.booted = true;
      // global presence change → rerender online states
      JC.onBus('presence-update', () => { });
    },
    methods: {
      go(view, props = {}) { store.stack.push({ view, props }); },
      back() { store.stack.pop(); if (!store.stack.length && window.__chatPage) window.__chatPage = null; },
      switchTab(tab) {
        store.stack = [];
        store.tab = tab;
        if (tab === 'home') JC.refreshConversations();
        if (tab === 'contacts') JC.refreshFriends();
      },
      sheet(title, actions, cb) { this.sheetData = { title, actions, cb }; },
      sheetAction(a) {
        const cb = this.sheetData?.cb;
        this.sheetData = null;
        cb && cb(a);
      },
      confirm(title, text, onOk) {
        this.confirmData = { title, text, onOk };
      },
      confirmAsync(title, text) {
        return new Promise((resolve, reject) => {
          this.confirmData = { title, text, onOk: resolve, onCancel: reject };
        });
      },
      confirmOk() {
        const d = this.confirmData;
        this.confirmData = null;
        d?.onOk && d.onOk();
      },
      confirmCancel() {
        const d = this.confirmData;
        this.confirmData = null;
        d?.onCancel && d.onCancel();
      },
      promptCustom(title, cb) {
        this.customData = { title, val: '', cb };
      },
      customOk() {
        const mins = parseInt(this.customData.val, 10);
        if (!mins || mins <= 0) return JC.toast('请输入有效分钟数');
        const d = this.customData;
        this.customData = null;
        d.cb(mins);
      }
    },
    template: `
      <div style="height:100%;position:relative;">
        <div class="aurora"><i></i><i></i><i></i></div>

        <!-- splash -->
        <transition name="fade">
          <div class="splash" v-if="!store.booted">
            <svg width="96" height="96" viewBox="0 0 120 120" fill="none" style="animation:splashPop .7s cubic-bezier(.3,1.4,.4,1), floaty 3s ease-in-out 1s infinite;filter:drop-shadow(0 20px 40px rgba(10,100,255,.35));">
              <defs>
                <linearGradient id="scg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a84ff"/><stop offset="1" stop-color="#5e5ce6"/></linearGradient>
                <linearGradient id="scg2" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="rgba(255,255,255,.45)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/></linearGradient>
              </defs>
              <rect x="6" y="6" width="108" height="108" rx="30" fill="url(#scg1)"/>
              <rect x="6" y="6" width="108" height="108" rx="30" fill="url(#scg2)"/>
              <path d="M30 38a14 14 0 0 1 14-14h32a14 14 0 0 1 14 14v26a14 14 0 0 1-14 14H52l-14 12V78a14 14 0 0 1-8-12.6z" fill="rgba(255,255,255,.22)"/>
              <text x="60" y="76" font-size="52" font-weight="800" fill="#fff" text-anchor="middle" font-family="-apple-system,'PingFang SC',sans-serif">J</text>
              <circle cx="88" cy="34" r="7" fill="#30d158"/><circle cx="88" cy="34" r="3" fill="#fff"/>
            </svg>
            <div class="splash-name">Jay Chat</div>
            <div class="splash-dot"></div>
          </div>
        </transition>

        <template v-if="store.booted">
          <!-- MAIN (logged in) -->
          <template v-if="store.me">
            <!-- tab pages (bottom of stack) -->
            <transition name="fade">
              <component :is="'Views.'+currentView" v-if="!isStack" v-bind="currentProps" :key="'tab-'+store.tab" style="position:absolute;inset:0;display:flex;flex-direction:column;"/>
            </transition>
            <!-- stacked pages -->
            <template v-if="isStack">
              <div v-for="(p,i) in store.stack" :key="'pg'+i+'-'+p.view" :style="{position:'absolute',inset:0,zIndex:1+i,display: i===store.stack.length-1?'flex':'none',flexDirection:'column'}" class="page-anim">
                <component :is="'Views.'+p.view" v-bind="p.props" :key="p.view+i"/>
              </div>
            </template>
            <!-- tabbar -->
            <div class="tabbar" v-if="!isStack">
              <div class="tab-item" :class="{on:store.tab==='home'}" @click="switchTab('home')">
                <svg class="tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M21 12a8 8 0 01-8 8H4l2.4-2.9A8 8 0 1121 12z"/><circle cx="9" cy="12" r=".8" fill="currentColor"/><circle cx="13" cy="12" r=".8" fill="currentColor"/><circle cx="17" cy="12" r=".8" fill="currentColor"/></svg>
                <span>首页</span>
                <span v-if="store.conversations.reduce((a,c)=>a+(c.muted?0:c.unread),0)>0" class="tab-badge">{{store.conversations.reduce((a,c)=>a+(c.muted?0:c.unread),0)>99?'99+':store.conversations.reduce((a,c)=>a+(c.muted?0:c.unread),0)}}</span>
              </div>
              <div class="tab-item" :class="{on:store.tab==='contacts'}" @click="switchTab('contacts')">
                <svg class="tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2.2"/><path d="M6 16.5c.8-1.6 2-2.2 3-2.2s2.2.6 3 2.2M15 9h4M15 13h4"/></svg>
                <span>联系人</span>
                <span v-if="store.friendReqCount>0" class="tab-badge">{{store.friendReqCount>99?'99+':store.friendReqCount}}</span>
              </div>
              <div class="tab-item" :class="{on:store.tab==='me'}" @click="switchTab('me')">
                <svg class="tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/></svg>
                <span>我的</span>
              </div>
            </div>
          </template>

          <!-- AUTH -->
          <template v-else>
            <component :is="'Views.'+currentView" :key="'auth-'+currentView"/>
          </template>
        </template>

        <!-- global action sheet -->
        <div v-if="sheetData">
          <transition name="mask" appear><div class="mask" style="position:fixed;z-index:80;" @click="sheetData=null"></div></transition>
          <transition name="sheet" appear>
            <div class="sheet" style="position:fixed;z-index:81;">
              <div v-if="sheetData.title" class="sheet-title">{{sheetData.title}}</div>
              <div v-for="(a,i) in sheetData.actions" :key="i" class="sheet-item" :class="{danger:a.danger}" @click="sheetAction(a)">{{a.label}}</div>
              <div class="sheet-item sheet-cancel" @click="sheetData=null">取消</div>
            </div>
          </transition>
        </div>

        <!-- global confirm modal -->
        <div v-if="confirmData">
          <transition name="mask" appear><div class="mask" style="position:fixed;z-index:82;"></div></transition>
          <div class="modal-wrap" style="position:fixed;z-index:83;">
            <div class="modal">
              <h3>{{confirmData.title}}</h3>
              <div style="font-size:14px;color:#7d7f86;text-align:center;line-height:1.5;">{{confirmData.text}}</div>
              <div class="modal-btns">
                <button class="btn plain" @click="confirmCancel">取消</button>
                <button class="btn" @click="confirmOk">确定</button>
              </div>
            </div>
          </div>
        </div>

        <!-- custom prompt -->
        <div v-if="customData">
          <transition name="mask" appear><div class="mask" style="position:fixed;z-index:82;"></div></transition>
          <div class="modal-wrap" style="position:fixed;z-index:83;">
            <div class="modal">
              <h3>{{customData.title}}</h3>
              <div class="field" style="margin:0;"><input v-model="customData.val" type="number" placeholder="输入分钟数"/></div>
              <div class="modal-btns">
                <button class="btn plain" @click="customData=null">取消</button>
                <button class="btn" @click="customOk">确定</button>
              </div>
            </div>
          </div>
        </div>

        <UI.Toasts/>
      </div>`,
    watch: {
      'store.me'(v) { if (!v) this.authView = 'login'; }
    }
  };

  const app = Vue.createApp(App);
  // expose globals to all templates
  app.config.globalProperties.JC = JC;
  app.config.globalProperties.store = store;
  app.config.globalProperties.Stickers = window.Stickers;
  app.config.errorHandler = (err, vm, info) => console.error('VueError:', err && err.message, info);
  app.component('UI.Avatar', window.UI.Avatar);
  app.component('UI.Icon', window.UI.Icon);
  app.component('UI.NavHeader', window.UI.NavHeader);
  app.component('UI.ActionSheet', window.UI.ActionSheet);
  app.component('UI.Modal', window.UI.Modal);
  app.component('UI.Switch', window.UI.Switch);
  app.component('UI.MediaViewer', window.UI.MediaViewer);
  app.component('UI.Toasts', window.UI.Toasts);
  app.directive('long-press', {
    mounted(el, binding) {
      let timer = null, moved = false;
      const start = (e) => { moved = false; timer = setTimeout(() => { if (!moved) binding.value(e); }, 500); };
      const cancel = () => clearTimeout(timer);
      const move = () => { moved = true; clearTimeout(timer); };
      el.addEventListener('touchstart', start, { passive: true });
      el.addEventListener('touchend', cancel);
      el.addEventListener('touchmove', move);
      el.addEventListener('mousedown', start);
      el.addEventListener('mouseup', cancel);
      el.addEventListener('mouseleave', cancel);
    }
  });
  // register views
  for (const [name, comp] of Object.entries(window.Views || {})) {
    app.component('Views.' + name, comp);
  }
  app.mount('#app');
})();
