/* Jay Chat — emoji + animated stickers */
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

  // ---- animated SVG stickers (offline, always available) ----
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

  const CATS = [
    { name: '热门', keys: ['😂', '🥰', '😎', '🤩', '🎉', '🔥'] },
    { name: '开心', keys: ['😀', '😄', '😊', '🤗', '🥳', '😇'] },
    { name: '爱心', keys: ['❤️', '💖', '😘', '💕', '🥺', '💝'] },
    { name: '搞笑', keys: ['🤣', '🤪', '🙈', '💩', '🤡', '😹'] },
    { name: '伤心', keys: ['😭', '😢', '💔', '😔', '😪', '🥲'] },
    { name: '加油', keys: ['👋', '💪', '👍', '🤝', '🙌', '✊'] },
  ];
  const MOTION_LIST = ['bounce', 'jelly', 'spin', 'shake', 'pulse', 'wiggle'];

  const STICKER_CATS = CATS.map((c, ci) => ({
    name: c.name,
    stickers: c.keys.map((emoji, si) => {
      const id = `s${ci}_${si}`;
      return { id, url: 'data:image/svg+xml;utf8,' + encodeURIComponent(stickerSvg(emoji, MOTION_LIST[si % MOTION_LIST.length], BGS[(ci + si) % BGS.length])) };
    })
  }));

  function resolveSticker(url) {
    // sticker:<id> → local animated svg; else return as-is (http url / data uri)
    if (!url) return '';
    if (url.startsWith('sticker:')) {
      const id = url.slice(8);
      const ci = +id.charAt(1), si = +id.charAt(3);
      const cat = STICKER_CATS[ci];
      return cat && cat.stickers[si] ? cat.stickers[si].url : url;
    }
    return url;
  }
  function isLocalSticker(url) { return url && url.startsWith('sticker:'); }

  // online GIF search (Tenor → Doutula fallback), called from client
  async function searchOnline(q) {
    const out = [];
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 7000);
      const r = await fetch(`https://g.tenor.com/v1/search?q=${encodeURIComponent(q)}&key=LIVDSRZULELA&limit=30&media_filter=minimal`, { signal: ctl.signal });
      clearTimeout(t);
      if (r.ok) {
        const d = await r.json();
        for (const x of d.results || []) {
          const url = x.media?.[0]?.gif?.url || x.media?.[0]?.tinygif?.url;
          if (url) out.push(url);
        }
      }
    } catch (e) { }
    if (!out.length) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 7000);
        const r = await fetch(`https://www.doutula.com/api/search?keyword=${encodeURIComponent(q)}&min=0&limit=30`, { signal: ctl.signal });
        clearTimeout(t);
        if (r.ok) {
          const d = await r.json();
          for (const x of d.data || d.list || []) { if (x.image || x.img || x.url) out.push(x.image || x.img || x.url); }
        }
      } catch (e) { }
    }
    return out;
  }

  window.Stickers = { EMOJI_CATS, STICKER_CATS, resolveSticker, isLocalSticker, searchOnline };
})();
