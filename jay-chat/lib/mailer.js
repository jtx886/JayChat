// SMTP 邮件发送（163邮箱，支持代理回退）
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.163.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || 'jtxnb886@163.com';
const SMTP_PASS = process.env.SMTP_PASS || 'FLLRDtadYAfGXp9Y';
const SMTP_FROM = process.env.SMTP_FROM || 'jtxnb886@163.com';
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || 'Jay Chat';

let transport = null;
let usingProxy = false;

function getTransport() {
  if (transport) return transport;
  const base = {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 12000,
  };
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (proxy) {
    // 优先走代理（沙箱/容器网络环境），失败则回退直连
    base.proxy = proxy;
    usingProxy = true;
  }
  transport = nodemailer.createTransport(base);
  return transport;
}

function resetTransport(useProxy) {
  const base = {
    host: SMTP_HOST, port: SMTP_PORT, secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 12000,
  };
  if (useProxy) {
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
    if (proxy) base.proxy = proxy;
  }
  usingProxy = !!useProxy;
  transport = nodemailer.createTransport(base);
  return transport;
}

async function sendMail({ to, subject, html, text }) {
  const from = `"${SMTP_FROM_NAME}" <${SMTP_FROM}>`;
  // 第一次尝试
  try {
    await getTransport().sendMail({ from, to, subject, html, text });
    return { ok: true };
  } catch (e1) {
    console.log('[mailer] first attempt failed:', e1.message);
  }
  // 回退：换一种方式重试
  try {
    resetTransport(!usingProxy);
    await transport.sendMail({ from, to, subject, html, text });
    console.log('[mailer] fallback worked, usingProxy =', usingProxy);
    return { ok: true };
  } catch (e2) {
    console.error('[mailer] send failed:', e2.message);
    return { ok: false, error: e2.message };
  }
}

async function sendCodeEmail(to, code, purpose) {
  const purposeText = purpose === 'reset' ? '重置密码' : '注册账号';
  const html = `
  <div style="max-width:480px;margin:0 auto;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;">
    <div style="background:linear-gradient(135deg,#4f7cff,#8a5cff);border-radius:16px 16px 0 0;padding:32px;text-align:center;">
      <div style="font-size:28px;font-weight:700;color:#fff;">Jay Chat</div>
      <div style="font-size:14px;color:rgba(255,255,255,.8);margin-top:6px;">让沟通更简单</div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:32px;">
      <h2 style="margin:0 0 12px;font-size:18px;color:#1a1d26;">${purposeText}验证码</h2>
      <p style="color:#5a5f6e;font-size:14px;margin:0 0 20px;">您正在进行${purposeText}操作，验证码为：</p>
      <div style="background:#f2f4fa;border-radius:12px;padding:16px;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;color:#4f7cff;">${code}</div>
      <p style="color:#9aa0ae;font-size:12px;margin:20px 0 0;">验证码10分钟内有效，请勿泄露给他人。若非本人操作请忽略本邮件。</p>
    </div>
  </div>`;
  return sendMail({ to, subject: `【Jay Chat】${purposeText}验证码 ${code}`, html, text: `您的验证码是 ${code}，10分钟内有效。` });
}

module.exports = { sendCodeEmail, sendMail };
