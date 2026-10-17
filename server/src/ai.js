const axios = require('axios');

const ZHIPU_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const ZHIPU_KEY = 'd63d18de6bcf4a92a13a78696e401e83.0MIXAf8ANp2tG9BD';
const MODEL = 'GLM-4-Flash';

async function chat(history) {
  const messages = [
    { role: 'system', content: '你是 Jay Chat 官方群里的智能助手 Jay AI，回答用中文，简洁友好，有帮助。你在一个群聊里，回复会以 @用户名 的形式展示给提问者。' },
    ...history
  ];
  const res = await axios.post(ZHIPU_URL, {
    model: MODEL,
    messages,
    max_tokens: 800,
    temperature: 0.7
  }, {
    headers: { 'Authorization': `Bearer ${ZHIPU_KEY}`, 'Content-Type': 'application/json' },
    timeout: 30000
  });
  return res.data.choices?.[0]?.message?.content || '抱歉，我暂时无法回答。';
}

module.exports = { chat };
