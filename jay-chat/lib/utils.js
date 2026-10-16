const crypto = require('crypto');

// GB2312 拼音首字母边界表（用于中文姓名首字母分组）
const BOUNDARY = [
  [0xB0A1, 0xB0C4, 'A'], [0xB0C5, 0xB2C0, 'B'], [0xB2C1, 0xB4ED, 'C'],
  [0xB4EE, 0xB6E9, 'D'], [0xB6EA, 0xB7A1, 'E'], [0xB7A2, 0xB8C0, 'F'],
  [0xB8C1, 0xB9FD, 'G'], [0xB9FE, 0xBBF6, 'H'], [0xBBF7, 0xBFA5, 'J'],
  [0xBFA6, 0xC0AB, 'K'], [0xC0AC, 0xC2E7, 'L'], [0xC2E8, 0xC4C2, 'M'],
  [0xC4C3, 0xC5B5, 'N'], [0xC5B6, 0xC5BD, 'O'], [0xC5BE, 0xC6D9, 'P'],
  [0xC6DA, 0xC8BA, 'Q'], [0xC8BB, 0xC8F5, 'R'], [0xC8F6, 0xCBF9, 'S'],
  [0xCBFA, 0xCDD9, 'T'], [0xCDDA, 0xCEF3, 'W'], [0xCEF4, 0xD1B8, 'X'],
  [0xD1B9, 0xD4D0, 'Y'], [0xD4D1, 0xD7F9, 'Z'],
];

let gbkDecoder = null;
try { gbkDecoder = new TextDecoder('gbk'); } catch (e) { gbkDecoder = null; }

function charPinyinInitial(ch) {
  if (/[a-zA-Z]/.test(ch)) return ch.toUpperCase();
  if (gbkDecoder) {
    const buf = Buffer.from(ch, 'utf8');
    const gbk = Buffer.from(gbkDecoder.decode(buf), 'latin1');
    if (gbk.length === 2) {
      const code = (gbk[0] << 8) | gbk[1];
      for (const [lo, hi, letter] of BOUNDARY) {
        if (code >= lo && code <= hi) return letter;
      }
    }
  }
  return '#';
}

// 取名称首字母（用于联系人/群成员首字母分组）
function pinyinInitial(name) {
  if (!name) return '#';
  const ch = String(name).trim()[0];
  if (!ch) return '#';
  if (/[0-9]/.test(ch)) return '#';
  return charPinyinInitial(ch);
}

function uid() {
  return crypto.randomUUID();
}

function now() {
  return Date.now();
}

// 完整时间：YYYY年MM月DD日 HH:mm:ss（24小时制）
function fmtFull(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${p(d.getMonth() + 1)}月${p(d.getDate())}日 ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@(qq|163)\.com$/;

module.exports = { pinyinInitial, uid, now, fmtFull, EMAIL_RE };
