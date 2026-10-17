/* Jay Chat — shared UI components */
(function () {
  const { JC } = window;
  const store = JC.store;

  window.UI = {};

  UI.Avatar = {
    props: { src: String, name: String, size: { default: 46 }, online: Boolean, radius: { default: 14 } },
    data: () => ({ broken: false }),
    computed: {
      hue() { let h = 0; const s = this.name || '?'; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; },
      initial() { return (this.name || '?').charAt(0).toUpperCase(); },
      fallbackStyle() {
        const h = this.hue;
        return {
          width: this.size + 'px', height: this.size + 'px', borderRadius: this.radius + 'px',
          fontSize: this.size * 0.42 + 'px',
          background: 'linear-gradient(135deg, hsl(' + h + ',80%,62%), hsl(' + ((h + 40) % 360) + ',80%,52%))'
        };
      },
      imgStyle() { return { width: this.size + 'px', height: this.size + 'px', borderRadius: this.radius + 'px' }; },
      wrapStyle() { return { width: this.size + 'px', height: this.size + 'px' }; }
    },
    template: `
      <div class="avatar-wrap" :style="wrapStyle">
        <img v-if="src && !broken" class="avatar" :src="JC.mediaUrl(src)" :style="imgStyle" @error="broken=true"/>
        <div v-else class="avatar-fallback" :style="fallbackStyle">{{initial}}</div>
        <div v-if="online" class="online-dot"></div>
      </div>`
  };

  UI.NavHeader = {
    props: { title: String, subtitle: String, back: { default: true }, transparent: Boolean },
    emits: ['back'],
    methods: { goBack() { this.$emit('back'); } },
    template: `
      <div class="navbar" :class="{glassy: !transparent}">
        <div class="nav-side">
          <button v-if="back" class="nav-btn" @click="goBack">
            <svg viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
        </div>
        <div class="nav-title">
          <div class="title-wrap"><div style="display:flex;align-items:center;gap:5px;max-width:56vw;"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{title}}</span><slot name="title-extra"></slot></div><small v-if="subtitle">{{subtitle}}</small></div>
        </div>
        <div class="nav-side"><slot name="right"></slot></div>
      </div>`
  };

  UI.ActionSheet = {
    props: { show: Boolean, title: String, actions: Array },
    emits: ['close', 'action'],
    template: `
      <div v-if="show">
        <transition name="mask" appear><div class="mask" @click="$emit('close')"></div></transition>
        <transition name="sheet" appear>
          <div class="sheet">
            <div v-if="title" class="sheet-title">{{title}}</div>
            <div v-for="(a,i) in actions" :key="i" class="sheet-item" :class="{danger:a.danger}" @click="$emit('action',a); if(!a.stay) $emit('close')">{{a.label}}</div>
            <div class="sheet-item sheet-cancel" @click="$emit('close')">取消</div>
          </div>
        </transition>
      </div>`
  };

  UI.Modal = {
    props: { show: Boolean, title: String },
    emits: ['close'],
    template: `
      <div v-if="show">
        <transition name="mask" appear><div class="mask" @click="$emit('close')"></div></transition>
        <div class="modal-wrap" @click.self="$emit('close')">
          <div class="modal"><h3>{{title}}</h3><slot></slot></div>
        </div>
      </div>`
  };

  UI.Switch = {
    props: { modelValue: Boolean },
    emits: ['update:modelValue'],
    template: `<button class="switch" :class="{on:modelValue}" @click="$emit('update:modelValue', !modelValue)"><i></i></button>`
  };

  UI.MediaViewer = {
    props: { src: String, type: String, burnTip: String },
    emits: ['close'],
    template: `
      <transition name="fade" appear>
        <div class="viewer" v-if="src" @click="$emit('close')">
          <img v-if="type!=='video'" :src="src" @click.stop/>
          <video v-else :src="src" controls autoplay @click.stop/>
          <button class="viewer-close" @click="$emit('close')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
          <div v-if="burnTip" class="viewer-burn">{{burnTip}}</div>
        </div>
      </transition>`
  };

  UI.Toasts = {
    computed: { toasts() { return store.toasts; } },
    template: `<div><transition-group name="fade"><div class="toast" v-for="t in toasts" :key="t.id">{{t.msg}}</div></transition-group></div>`
  };
})();
