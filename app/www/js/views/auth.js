/* Jay Chat — auth views */
(function () {
  const { JC } = window;
  const store = JC.store;
  const EMAIL_RE = /^[\w.+-]+@qq\.com$|^[\w.+-]+@163\.com$/i;

  const AuthShell = {
    template: `
      <div class="page">
        <div class="aurora"><i></i><i></i><i></i></div>
        <div class="page-inner" style="display:flex;flex-direction:column;justify-content:center;padding:30px 8px;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:12px;margin-bottom:26px;">
            <div class="splash-logo" style="width:76px;height:76px;font-size:40px;border-radius:22px;">J</div>
            <div class="splash-name" style="font-size:26px;">Jay Chat</div>
            <div style="font-size:12.5px;color:#8e8e93;">跨网络 · 实时通讯 · 遇见有趣的人</div>
          </div>
          <slot></slot>
        </div>
      </div>`
  };

  // ---------- Login ----------
  const Login = {
    components: { AuthShell },
    data: () => ({ account: '', password: '', loading: false, showServer: false, serverUrl: localStorage.getItem('jc_server_url') || '' }),
    methods: {
      async login() {
        if (!this.account.trim()) return JC.toast('请输入用户名或邮箱');
        if (!this.password) return JC.toast('请输入密码');
        this.loading = true;
        try {
          const r = await JC.api('POST', '/api/auth/login', { account: this.account.trim(), password: this.password });
          localStorage.setItem('jc_token', r.token);
          store.token = r.token;
          store.me = r.user;
          JC.connectSocket();
          await JC.refreshAll();
          JC.requestNotifPermission();
          JC.toast('欢迎回来，' + r.user.username);
        } catch (e) {
          JC.toast(e.message);
          if (/fetch|network|服务器/i.test(e.message)) this.showServer = true;
        }
        this.loading = false;
      },
      saveServer() {
        localStorage.setItem('jc_server_url', this.serverUrl.trim().replace(/\/+$/, ''));
        this.showServer = false;
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
        <div style="text-align:center;margin-top:26px;font-size:12px;color:#a9abb2;" @click="showServer=true">⚙️ 服务器设置</div>
        <UI.Modal :show="showServer" title="服务器地址" @close="showServer=false">
          <div class="field" style="margin:0;"><input v-model="serverUrl" placeholder="http://服务器IP:3000"/></div>
          <div class="modal-btns"><button class="btn plain" @click="showServer=false">取消</button><button class="btn" @click="saveServer">保存</button></div>
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
          JC.connectSocket();
          await JC.refreshAll();
          JC.requestNotifPermission();
          JC.toast('注册成功，已自动加入 Jay Chat官方群 🎉');
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
