// 认证视图：登录 / 注册 / 忘记密码
const AuthView = {
  show() {
    $('#auth-view').classList.remove('hidden');
    $('#main-view').classList.add('hidden');
    this.bind();
  },

  bind() {
    if (this._bound) return;
    this._bound = true;

    $$('.auth-tab').forEach((t) => t.onclick = () => {
      $$('.auth-tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      const tab = t.dataset.tab;
      $('#login-form').classList.toggle('hidden', tab !== 'login');
      $('#register-form').classList.toggle('hidden', tab !== 'register');
    });
    $('#goto-forgot').onclick = () => {
      $('#login-form').classList.add('hidden');
      $('#register-form').classList.add('hidden');
      $$('.auth-tab').forEach((x) => x.classList.remove('active'));
      $('#forgot-form').classList.remove('hidden');
    };
    $('#back-login').onclick = () => {
      $('#forgot-form').classList.add('hidden');
      $('#login-form').classList.remove('hidden');
      $$('.auth-tab')[0].classList.add('active');
    };

    // ===== 登录 =====
    $('#login-form').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#login-btn');
      btn.disabled = true; btn.textContent = '登录中…';
      try {
        const data = await API.post('/api/auth/login', {
          account: $('#login-account').value.trim(),
          password: $('#login-password').value,
        });
        toast('欢迎回来，' + data.user.username, 'success');
        await App.login(data.user, data.token);
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = '登 录';
      }
    };

    // ===== 注册 =====
    $('#send-reg-code').onclick = () => this.sendCode('reg', 'register');
    $('#send-forgot-code').onclick = () => this.sendCode('forgot', 'reset');
    $('#register-form').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#register-btn');
      btn.disabled = true; btn.textContent = '注册中…';
      try {
        const data = await API.post('/api/auth/register', {
          username: $('#reg-username').value.trim(),
          email: $('#reg-email').value.trim(),
          password: $('#reg-password').value,
          code: $('#reg-code').value.trim(),
        });
        toast('注册成功，欢迎加入 Jay Chat！', 'success');
        await App.login(data.user, data.token);
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = '注 册';
      }
    };

    // ===== 忘记密码 =====
    $('#forgot-form').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#forgot-btn');
      btn.disabled = true; btn.textContent = '提交中…';
      try {
        await API.post('/api/auth/reset', {
          email: $('#forgot-email').value.trim(),
          code: $('#forgot-code').value.trim(),
          password: $('#forgot-password').value,
          confirm: $('#forgot-confirm').value,
        });
        toast('密码重置成功，请使用新密码登录', 'success');
        $('#back-login').click();
        $('#forgot-form').reset();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = '重置密码';
      }
    };
  },

  async sendCode(prefix, purpose) {
    const email = $('#' + prefix + '-email').value.trim();
    const btn = $(prefix === 'reg' ? '#send-reg-code' : '#send-forgot-code');
    if (!/^[a-zA-Z0-9._%+-]+@(qq|163)\.com$/.test(email)) {
      return toast('邮箱只支持 @qq.com 或 @163.com', 'error');
    }
    btn.disabled = true;
    try {
      const data = await API.post('/api/auth/send-code', { email, purpose });
      if (data.devCode) {
        toast(`邮件发送失败，本次验证码：${data.devCode}`, 'error');
      } else {
        toast('验证码已发送至邮箱，请查收', 'success');
      }
      let left = 60;
      btn.textContent = `${left}s后重发`;
      const timer = setInterval(() => {
        left--;
        if (left <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = '发送验证码'; }
        else btn.textContent = `${left}s后重发`;
      }, 1000);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  },
};
