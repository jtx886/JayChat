/* Jay Chat — SVG 图标库（纯 CSS/SVG 绘制，取代 emoji 图标） */
(function () {
  // 每个图标 = svg viewBox 0 0 24 24 内部标记（stroke 继承 currentColor）
  window.Icons = {
    // tabbar
    chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    contacts: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2.2"/><path d="M6 16.5c.8-1.6 2-2.2 3-2.2s2.2.6 3 2.2M15 9h4M15 13h4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="8" r="3.4"/><path d="M21 21v-2a4 4 0 0 0-2.6-3.7M15.5 3.6a3.4 3.4 0 0 1 0 6.6"/>',
    // 导航 / 通用
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>',
    'bell-off': '<path d="M8.7 5.2A6 6 0 0 1 18 8c0 5 1.6 6.6 2.4 7.4M6.3 6.3C6.1 6.8 6 7.4 6 8c0 7-3 8-3 8h14"/><path d="M13.7 20a2 2 0 0 1-3.4 0M2 2l20 20"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    'plus-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    more: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    // 聊天输入区
    emoji: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8"/><circle cx="9" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r=".9" fill="currentColor" stroke="none"/>',
    'emoji-big': '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8.5 14c.9 1.2 2.1 1.9 3.5 1.9s2.6-.7 3.5-1.9"/><circle cx="9" cy="9.5" r=".9" fill="currentColor" stroke="none"/><circle cx="15" cy="9.5" r=".9" fill="currentColor" stroke="none"/>',
    send: '<path d="M3 11l18-8-8 18-2.5-7.5L3 11z"/>',
    mic: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    trash: '<path d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6M19 6l-.8 13a2 2 0 0 1-2 1.9H7.8a2 2 0 0 1-2-1.9L5 6M10 10.5v6M14 10.5v6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    undo: '<path d="M3 7v6h6M3.5 13a9 9 0 1 0 2.6-7.4L3 8.5"/>',
    forward: '<path d="M15 17l5-5-5-5M20 12H9a6 6 0 0 0-6 6v2"/>',
    reply: '<path d="M9 17l-6-6 6-6M3 11h11a6 6 0 0 1 6 6v2"/>',
    play: '<path d="M7 4.5l12 7.5-12 7.5z"/>',
    pause: '<path d="M8 4.5v15M16 4.5v15"/>',
    // 媒体
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="9.5" r="1.6"/><path d="M4 17.5l5-5 3 3 4-4 4 4"/>',
    camera: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l2-3h6l2 3h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13.5" r="3.6"/>',
    video: '<path d="M22 8.5l-6 4 6 4z"/><rect x="2" y="6" width="14" height="12" rx="2.5"/>',
    file: '<path d="M13 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M13 2v6h6"/>',
    fire: '<path d="M12 2.5c.6 3.6-4.4 5.6-4.4 10a4.4 4.4 0 0 0 8.8 0c0-1.5-.7-2.6-1.3-3.3 2 .8 3.9 2.8 3.9 5.8a7 7 0 0 1-14 0c0-6.5 5.5-8.5 7-12.5z"/>',
    'wave-voice': '<path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"/>',
    // 功能入口
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    sparkle: '<path d="M12 3l2 5.2L19 10l-5 1.8L12 17l-2-5.2L5 10l5-1.8z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.3h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="2.8"/>',
    handshake: '<path d="M11 17l-1.6-1.6a2 2 0 0 1 0-2.8 2 2 0 0 1 2.8 0l1.3 1.3 3.6-3.6a2 2 0 0 1 2.8 0l1.6 1.6M3 8l4-4 4 2M8 4l4 4"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M12 8s-1.5-5-4.5-5A2.5 2.5 0 0 0 5 5.5C5 7 7 8 12 8zM12 8s1.5-5 4.5-5A2.5 2.5 0 0 1 19 5.5C19 7 17 8 12 8z"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
    'heart-fill': '<path fill="currentColor" stroke="none" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
    comment: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11v5"/>',
    server: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    sticker: '<path d="M15.5 3H7a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h5l9-9V7z"/><path d="M14 21v-4a2 2 0 0 1 2-2h5"/><path d="M8.5 10h.01M13 9.5c.4.5 1 .8 1.7.8"/>'
  };

  window.UI = window.UI || {};

  UI.Icon = {
    props: { name: String, size: { default: 20 }, sw: { default: 2 } },
    computed: { markup() { return (window.Icons[this.name] || window.Icons.info); } },
    template: `<svg class="ic" viewBox="0 0 24 24" :width="size" :height="size" fill="none" stroke="currentColor" :stroke-width="sw" stroke-linecap="round" stroke-linejoin="round" v-html="markup"></svg>`
  };
})();
