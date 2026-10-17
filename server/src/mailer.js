const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.163.com',
  port: 465,
  secure: true,
  auth: { user: 'jtxnb886@163.com', pass: 'FLLRDtadYAfGXp9Y' }
});

function codeEmailHtml(code) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f2f4f8;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="max-width:420px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(20,40,90,.12);">
    <div style="background:linear-gradient(135deg,#0a84ff,#5e5ce6);padding:28px 32px;color:#fff;">
      <h1 style="margin:0;font-size:22px;">Jay Chat</h1>
      <p style="margin:6px 0 0;opacity:.9;font-size:13px;">邮箱验证码</p>
    </div>
    <div style="padding:32px;text-align:center;">
      <p style="color:#555;font-size:14px;margin:0 0 16px;">你的验证码是（5 分钟内有效）：</p>
      <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#0a84ff;background:#eef4ff;border-radius:12px;padding:14px 0;">${code}</div>
      <p style="color:#999;font-size:12px;margin:20px 0 0;">如果这不是你本人的操作，请忽略此邮件。</p>
    </div>
  </div></body></html>`;
}

async function sendCode(email, code) {
  return transporter.sendMail({
    from: '"Jay Chat" <jtxnb886@163.com>',
    to: email,
    subject: `【Jay Chat】你的验证码：${code}`,
    html: codeEmailHtml(code)
  });
}

module.exports = { sendCode };
