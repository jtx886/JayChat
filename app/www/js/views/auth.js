/* Jay Chat — auth views */
(function () {
  const { JC } = window;
  const store = JC.store;
  const EMAIL_RE = /^[\w.+-]+@qq\.com$|^[\w.+-]+@163\.com$/i;

  // 纯 CSS/SVG 品牌 Logo（气泡 + J）
  const Logo = {
    props: { size: { default: 76 } },
    template: `
      <svg :width="size" :height="size" viewBox="0 0 120 120" fill="none">
        <defs>
          <linearGradient id="jcg1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#0a84ff"/><stop offset="1" stop-color="#5e5ce6"/>
          </linearGradient>
          <linearGradient id="jcg2" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stop-color="rgba(255,255,255,.45)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/>
          </linearGradient>
        </defs>
        <rect x="6" y="6" width="108" height="108" rx="30" fill="url(#jcg1)"/>
        <rect x="6" y="6" width="108" height="108" rx="30" fill="url(#jcg2)"/>
        <path d="M30 38a14 14 0 0 1 14-14h32a14 14 0 0 1 14 14v26a14 14 0 0 1-14 14H52l-14 12V78a14 14 0 0 1-8-12.6z" fill="rgba(255,255,255,.22)"/>
        <text x="60" y="76" font-size="52" font-weight="800" fill="#fff" text-anchor="middle" font-family="-apple-system,'PingFang SC',sans-serif">J</text>
        <circle cx="88" cy="34" r="7" fill="#30d158"/>
        <circle cx="88" cy="34" r="3" fill="#fff"/>
      </svg>`
  };

  const AuthShell = {
    components: { Logo },
    template: `
      <div class="page">
        <div class="aurora"><i></i><i></i><i></i></div>
        <div class="page-inner" style="display:flex;flex-direction:column;justify-content:center;padding:30px 8px;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:12px;margin-bottom:26px;">
            <Logo :size="80"/>
            <div class="splash-name" style="font-size:26px;">Jay Chat</div>
            <div style="font-size:12.5px;color:#8e8e93;">跨网络 · 实时通讯 · 遇见有趣的人</div>
          </div>
          <slot></slot>
        </div>
      </div>`
  };

  // ---------- Login ----------
  const Login = {
    components: { AuthShell, Logo },
    data: () => ({
      account: '', password: '', loading: false,
      showServer: false, serverUrl: localStorage.getItem('jc_server_url') || '',
      connErr: false, serverHint: ''
    }),
    methods: {
      async login() {
        if (!this.account.trim()) return JC.toast('请输入用户名或邮箱');
        if (!this.password) return JC.toast('请输入密码');
        this.loading = true;
        this.connErr = false;
        try {
          const r = await JC.api('POST', '/api/auth/login', { account: this.account.trim(), password: this.password });
          localStorage.setItem('jc_token', r.token);
          store.token = r.token;
          store.me = r.user;
          if (r.tim) store.timCred = r.tim;
          await JC.detectServerType();
          JC.connectSocket();
          await JC.refreshAll();
          JC.requestNotifPermission();
          JC.toast('欢迎回来，' + r.user.username);
        } catch (e) {
          JC.toast(e.message);
          if (/fetch|network|服务器|请求失败/i.test(e.message)) {
            this.connErr = true;
            this.serverHint = '当前服务器：' + JC.serverUrl();
          }
        }
        this.loading = false;
      },
      saveServer() {
        const v = this.serverUrl.trim().replace(/\/+$/, '');
        if (v) localStorage.setItem('jc_server_url', v);
        else localStorage.removeItem('jc_server_url');
        this.showServer = false;
        JC.detectServerType();
        JC.toast('服务器已保存，正在重试登录…');
      }
    },
    template: `
      <AuthShell>
        <div class="field"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#8e8e93" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/></svg><input v-model="account" placeholder="用户名或邮箱" @keyup.enter="login"/></div>
        <div class="field"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#8e8e93" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg><input v-model="password" type="password" placeholder="密码" @keyup.enter="login"/></div>
        <div style="margin:4px 16px 16px;"><button class="btn" :disabled="loading" @click="login"><span v-if="loading" class="spinner" style="border-color:rgba(255,255,255,.35);border-top-color:#fff;"></span>{{loading?'登录中…':'登 录'}}</button></div>
        <div style="display:flex;justify-content:space-between;padding:0 16px;font-size:13.5px;">
          <span class="link" @click="$root.go('register')">注册新账号</span>
          <span class="link" style="color:#8e8e93;" @click="$root.go('forgot')">忘记密码？</span>
        </div>
        <div v-if="connErr" class="conn-error" @click="showServer=true">
          <UI.Icon name="server" :size="14"/> 连接服务器失败 · 点击检查服务器设置
          <div style="font-size:10px;color:#a9abb2;margin-top:2px;">{{serverHint}}</div>
        </div>
        <UI.Modal :show="showServer" title="服务器设置" @close="showServer=false">
          <div class="hint" style="text-align:left;padding:0 0 8px;">默认使用官方服务器（已内置），一般无需修改。留空恢复默认。</div>
          <div class="field" style="margin:0;"><input v-model="serverUrl" placeholder="http://jaychat.ct.ws"/></div>
          <div class="modal-btns"><button class="btn plain" @click="serverUrl=''; saveServer()">恢复默认</button><button class="btn" @click="saveServer">保存</button></div>
        </UI.Modal>
      </AuthShell>`
  };

  // ---------- Register ----------
  const Register = {
    components: { AuthShell },
    data: () => ({ username: '', email: '', password: '', code: '', sending: false, countdown: 0, loading: false }),
    methods: {
      validEmail() {
        if (!EMAIL_RE.test(this.email.trim())) { JC.toast('仅支持 @qq.com 和 @163.com 邮箱'); return false; }
        return true;
      },
      async sendCode() {
        if (this.countdown > 0) return;
        if (!this.username.trim() || [...this.username.trim()].length > 6) return JC.toast('昵称需为 1-6 个字符');
        if (!this.validEmail()) return;
        if (this.password.length < 6) return JC.toast('密码至少 6 位');
        this.sending = true;
        try {
          await JC.api('POST', '/api/auth/send-code', { email: this.email.trim(), purpose: 'register' });
          JC.toast('验证码已发送至邮箱，请查收');
          this.countdown = 60;
          const timer = setInterval(() => { this.countdown--; if (this.countdown <= 0) clearInterval(timer); }, 1000);
        } catch (e) { JC.toast(e.message); }
        this.sending = false;
      },
      async register() {
        if (!this.username.trim() || [...this.username.trim()].length > 6) return JC.toast('昵称需为 1-6 个字符');
        if (!this.validEmail()) return;
        if (this.password.length < 6) return JC.toast('密码至少 6 位');
        if (!this.code.trim()) return JC.toast('请输入验证码');
        this.loading = true;
        try {
          const r = await JC.api('POST', '/api/auth/register', { username: this.username.trim(), email: this.email.trim(), password: this.password, code: this.code.trim() });
          localStorage.setItem('jc_token', r.token);
          store.token = r.token;
          store.me = r.user;
          if (r.tim) store.timCred = r.tim;
          await JC.detectServerType();
          JC.connectSocket();
          await JC.refreshAll();
          JC.requestNotifPermission();
          JC.toast('注册成功，已自动加入 Jay Chat官方群');
        } catch (e) { JC.toast(e.message); }
        this.loading = false;
      }
    },
    template: `
      <AuthShell>
        <div class="field"><input v-model="username" placeholder="昵称（1-6 个字符）" maxlength="6"/></div>
        <div class="field"><input v-model="email" placeholder="邮箱（@qq.com / @163.com）" @keyup.enter="register"/></div>
        <div class="field"><input v-model="password" type="password" placeholder="密码（至少 6 位）"/></div>
        <div class="field"><input v-model="code" placeholder="邮箱验证码" maxlength="6" style="flex:1;" @keyup.enter="register"/><button class="btn-code" :disabled="countdown>0||sending" @click="sendCode">{{countdown>0?countdown+'s':(sending?'发送中':'发送验证码')}}</button></div>
        <div style="margin:6px 16px 14px;"><button class="btn" :disabled="loading" @click="register">{{loading?'注册中…':'注 册'}}</button></div>
        <div style="text-align:center;font-size:13.5px;"><span class="link" @click="$root.back()">已有账号？去登录</span></div>
      </AuthShell>`
  };

  // ---------- Forgot ----------
  const Forgot = {
    components: { AuthShell },
    data: () => ({ email: '', code: '', password: '', password2: '', countdown: 0, sending: false, loading: false }),
    methods: {
      validEmail() {
        if (!EMAIL_RE.test(this.email.trim())) { JC.toast('仅支持 @qq.com 和 @163.com 邮箱'); return false; }
        return true;
      },
      async sendCode() {
        if (this.countdown > 0) return;
        if (!this.validEmail()) return;
        this.sending = true;
        try {
          await JC.api('POST', '/api/auth/send-code', { email: this.email.trim(), purpose: 'reset' });
          JC.toast('验证码已发送，请查收邮箱');
          this.countdown = 60;
          const timer = setInterval(() => { this.countdown--; if (this.countdown <= 0) clearInterval(timer); }, 1000);
        } catch (e) { JC.toast(e.message); }
        this.sending = false;
      },
      async reset() {
        if (!this.validEmail()) return;
        if (!this.code.trim()) return JC.toast('请输入验证码');
        if (this.password.length < 6) return JC.toast('密码至少 6 位');
        if (this.password !== this.password2) return JC.toast('两次输入的密码不一致');
        this.loading = true;
        try {
          await JC.api('POST', '/api/auth/reset-password', { email: this.email.trim(), code: this.code.trim(), password: this.password });
          JC.toast('密码重置成功，请使用新密码登录');
          this.$root.back();
        } catch (e) { JC.toast(e.message); }
        this.loading = false;
      }
    },
    template: `
      <AuthShell>
        <div class="field"><input v-model="email" placeholder="注册时使用的邮箱" @keyup.enter="reset"/></div>
        <div class="field"><input v-model="code" placeholder="验证码" maxlength="6"/><button class="btn-code" :disabled="countdown>0||sending" @click="sendCode">{{countdown>0?countdown+'s':(sending?'发送中':'发送验证码')}}</button></div>
        <div class="field"><input v-model="password" type="password" placeholder="新的密码（至少 6 位）"/></div>
        <div class="field"><input v-model="password2" type="password" placeholder="确认新密码" @keyup.enter="reset"/></div>
        <div style="margin:6px 16px 14px;"><button class="btn" :disabled="loading" @click="reset">{{loading?'提交中…':'重置密码'}}</button></div>
        <div style="text-align:center;font-size:13.5px;"><span class="link" @click="$root.back()">返回登录</span></div>
      </AuthShell>`
  };

  window.Views = window.Views || {};
  window.Views.login = Login;
  window.Views.register = Register;
  window.Views.forgot = Forgot;
})();
