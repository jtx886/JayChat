/* Jay Chat — emoji + 第三方动画表情包 */
(function () {
  const EMOJI_CATS = [
    { name: '笑脸', icon: '😀', list: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 ☺️ 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 🤖'.split(' ') },
    { name: '动物', icon: '🐶', list: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🕷 🦂 🐢 🐍 🦎 🐙 🦑 🦐 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🐘 🦏 🐪 🐫 🦒 🐃 🐄 🐎 🐖 🐏 🐑 🐐 🦌 🐕 🐩 🐈 🐓 🦃 🕊 🐇 🦝 🦨 🦡 🦫 🦦 🦥 🐁 🐀 🐿 🦔'.split(' ') },
    { name: '食物', icon: '🍔', list: '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶 🌽 🥕 🧄 🧅 🥔 🍠 🥐 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🥙 🧆 🌮 🌯 🥗 🥘 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍙 🍚 🍘 🍥 🥠 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 🍼 ☕ 🍵 🧃 🥤 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾'.split(' ') },
    { name: '活动', icon: '⚽', list: '⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🥊 🥋 🎽 🛹 🛷 ⛸ 🥌 🎿 ⛷ 🏂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚵 🚴 🏆 🥇 🥈 🥉 🏅 🎖 🏵 🎗 🎫 🎪 🤹 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🪕 🎻 🎲 ♟ 🎯 🎳 🎮 🎰 🧩'.split(' ') },
    { name: '旅行', icon: '✈️', list: '🚗 🚕 🚙 🚌 🚎 🏎 🚓 🚑 🚒 🚐 🚚 🚛 🚜 🛴 🚲 🛵 🏍 🛺 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩 💺 🛰 🚀 🛸 🚁 🛶 ⛵ 🚤 🛥 🛳 ⛴ 🚢 ⚓ ⛽ 🚧 🚦 🚥 🗺 🗿 🗽 🗼 🏰 🏯 🏟 🎡 🎢 🎠 ⛲ ⛱ 🏖 🏝 🏜 🌋 ⛰ 🏔 🗻 🏕 🛖 🏠 🏡 🏘 🏚 🏗 🏭 🏢 🏬 🏣 🏤 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛 ⛪ 🕌 🕍 🛕 🕋 ⛩ 🛤 🛣 🎑 🏞 🌅 🌄 🌠 🎇 🎆 🌈 ☀️ 🌤 ⛅ 🌥 ☁️ 🌦 🌧 ⛈ 🌩 🌨 ❄️ ☃️ ⛄ 🌬 💨 🌪 🌫 🌊 💧 💦'.split(' ') },
    { name: '物件', icon: '💡', list: '⌚ 📱 💻 ⌨️ 🖥 🖨 🖱 💽 💾 💿 📀 🎥 📷 📸 📹 📼 🔍 🔎 🕯 💡 🔦 🏮 📔 📕 📖 📗 📘 📙 📚 📓 📒 📃 📜 📄 📰 🗞 📑 🔖 🏷 💰 🪙 💴 💵 💶 💷 💸 💳 🧾 ✉️ 📧 📨 📩 📤 📥 📦 📫 📪 📬 📭 📮 🗳 ✏️ ✒️ 🖋 🖊 🖌 🖍 📝 💼 📁 📂 🗂 📅 📆 🗒 🗓 📇 📈 📉 📊 📋 📌 📍 📎 🖇 📏 📐 ✂️ 🗃 🗄 🗑 🔒 🔓 🔏 🔐 🔑 🗝 🔨 🪓 ⛏ ⚒ 🛠 🗡 ⚔️ 🔫 🏹 🛡 🔧 🔩 ⚙️ 🗜 ⚖️ 🦯 🔗 ⛓ 🧰 🧲 ⚗️ 🧪 🧫 🧬 🔬 🔭 📡 💉 💊 🩹 🩺 🚪 🛏 🛋 🪑 🚽 🪠 🚿 🛁 🪒 🧴 🧷 🧹 🧺 🧻 🧼 🧽 🧯 🛒 🚬 ⚰️ 🪦 🗿'.split(' ') },
    { name: '符号', icon: '❤️', list: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉 ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐 ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 ⚛️ 🉑 ☢️ ☣️ 📴 📳 🈶 🈚 🈸 🈺 🈷️ ✴️ 🆚 💯 🔥 ✨ 🌟 💫 💥 💢 💦 💨 🕳 💬 💭 💤'.split(' ') },
  ];

  // 第三方动画表情包数据（由 stickers-data.js 提供，全部 GIF 来自 jsdelivr CDN 的开源表情包仓库）
  const PACKS = (window.STICKER_PACKS || []).map((p, pi) => ({
    name: p.cat,
    stickers: (p.stickers || []).map((s, si) => ({ id: `p${pi}_${si}`, name: s.name || '', url: s.url }))
  }));

  // ---- 本地动画表情（离线兜底，旧消息兼容） ----
  const MOTIONS = {
    bounce: '<animateTransform attributeName="transform" type="translate" values="0 4; 0 -8; 0 4" dur="0.9s" repeatCount="indefinite" calcMode="spline" keySplines=".4 0 .6 1;.4 0 .6 1"/>',
    spin: '<animateTransform attributeName="transform" type="rotate" values="0;360" dur="1.6s" repeatCount="indefinite"/>',
    pulse: '<animateTransform attributeName="transform" type="scale" values="1;1.22;1" dur="0.8s" repeatCount="indefinite" additive="sum"/>',
    shake: '<animateTransform attributeName="transform" type="rotate" values="-10 0 0;10 0 0;-10 0 0" dur="0.5s" repeatCount="indefinite"/>',
    wiggle: '<animateTransform attributeName="transform" type="skewX" values="-8;8;-8" dur="0.7s" repeatCount="indefinite"/>',
    jelly: '<animateTransform attributeName="transform" type="scale" values="1 1;1.15 .85;.95 1.1;1 1" dur="0.7s" repeatCount="indefinite" additive="sum"/>'
  };
  const BGS = ['#fff4d6', '#ffe3ec', '#e0f4ff', '#e7ffe3', '#f0e6ff', '#fff0e0'];
  function stickerSvg(emoji, motion, bg) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
<defs><radialGradient id="bg" cx="50%" cy="42%"><stop offset="0%" stop-color="${bg}"/><stop offset="100%" stop-color="#ffffff"/></radialGradient></defs>
<rect width="200" height="200" rx="44" fill="url(#bg)"/>
<g transform="translate(100 108)"><g>${MOTIONS[motion]}<text x="0" y="0" font-size="120" text-anchor="middle" dominant-baseline="central">${emoji}</text></g></g>
</svg>`;
  }
  const LOCAL_CATS = [
    { name: '热门', keys: ['😂', '🥰', '😎', '🤩', '🎉', '🔥'] },
    { name: '开心', keys: ['😀', '😄', '😊', '🤗', '🥳', '😇'] },
    { name: '爱心', keys: ['❤️', '💖', '😘', '💕', '🥺', '💝'] },
    { name: '搞笑', keys: ['🤣', '🤪', '🙈', '💩', '🤡', '😹'] },
    { name: '伤心', keys: ['😭', '😢', '💔', '😔', '😪', '🥲'] },
    { name: '加油', keys: ['👋', '💪', '👍', '🤝', '🙌', '✊'] },
  ];
  const MOTION_LIST = ['bounce', 'jelly', 'spin', 'shake', 'pulse', 'wiggle'];
  const LOCAL_STICKER_CATS = LOCAL_CATS.map((c, ci) => ({
    name: c.name,
    stickers: c.keys.map((emoji, si) => {
      const id = `s${ci}_${si}`;
      return { id, url: 'data:image/svg+xml;utf8,' + encodeURIComponent(stickerSvg(emoji, MOTION_LIST[si % MOTION_LIST.length], BGS[(ci + si) % BGS.length])) };
    })
  }));

  function resolveSticker(url) {
    if (!url) return '';
    if (url.startsWith('sticker:')) { // 旧版本地表情 id
      const id = url.slice(8);
      const ci = +id.charAt(1), si = +id.charAt(3);
      const cat = LOCAL_STICKER_CATS[ci];
      return cat && cat.stickers[si] ? cat.stickers[si].url : url;
    }
    // 新版第三方表情包 id → CDN GIF
    if (url.startsWith('pack:')) {
      const id = url.slice(5);
      const m = id.match(/^p(\d+)_(\d+)$/);
      if (m) {
        const pack = PACKS[+m[1]];
        const st = pack && pack.stickers[+m[2]];
        if (st) return st.url;
      }
    }
    return url;
  }
  function isLocalSticker(url) { return url && (url.startsWith('sticker:') || url.startsWith('pack:')); }

  // 仅允许 http(s) / pack: 形式发出，避免把超大 data: 塞进数据库
  function normalizeForSend(url) {
    if (!url) return '';
    for (const p of PACKS) for (const s of p.stickers) if (s.url === url) return 'pack:' + s.id;
    if (/^https?:\/\//i.test(url)) return url;
    return '';
  }

  window.Stickers = { EMOJI_CATS, STICKER_CATS: LOCAL_STICKER_CATS, PACKS, resolveSticker, isLocalSticker, normalizeForSend };
})();
