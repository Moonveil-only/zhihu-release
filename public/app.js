/* =========================================================
 * 星轨发布 ORBIT · 平台交互核心（app.js）
 * API 封装 / 全局状态 / 鼠标动效（光晕跟随·磁吸按钮·卡片聚光·3D 倾斜）
 * Toast / 滚动渐入 / 顶栏交互
 * 全程容错：任何一步失败不影响页面内容与下载可用
 * ========================================================= */
'use strict';

/* ---------- 工具 ---------- */
function $(s) { return document.querySelector(s); }
function $all(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
  return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
function fmtDate(ts) {
  try { return new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }); } catch (e) { return '—'; }
}
function cmpVer(a, b) {
  const pa = String(a).split('.').map(x => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map(x => parseInt(x, 10) || 0);
  for (let i = 0; i < 4; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x - y; }
  return 0;
}

/* ---------- API ---------- */
var API = {
  base: '',
  async call(path, opts) {
    const res = await fetch(this.base + path, Object.assign({ credentials: 'same-origin' }, opts || {}));
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
    return data;
  },
  getPublic() { return this.call('/api/public'); },
  getMe() { return this.call('/api/me'); },
  login(username, password) {
    return this.call('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }) });
  },
  logout() { return this.call('/api/logout', { method: 'POST' }); },
  delVersion(id) { return this.call('/api/version/' + id, { method: 'DELETE' }); },
  setNotes(id, notes) {
    return this.call('/api/version/' + id + '/notes', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) });
  },
  saveApp(app) {
    return this.call('/api/app', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(app) });
  },
  changePassword(oldP, newP) {
    return this.call('/api/password', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old: oldP, next: newP }) });
  },
  /* 上传（XHR 以支持进度条） */
  upload(file, version, notes, onProgress) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file, file.name);
      fd.append('version', version);
      fd.append('notes', notes);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', this.base + '/api/upload');
      xhr.withCredentials = true;
      if (xhr.upload && onProgress) xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100));
      }, false);
      xhr.addEventListener('load', () => {
        let d = null; try { d = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(d);
        else reject(new Error((d && d.error) || 'HTTP ' + xhr.status));
      });
      xhr.addEventListener('error', () => reject(new Error('网络错误，上传失败')));
      xhr.send(fd);
    });
  }
};

/* ---------- 全局状态 ---------- */
var State = { user: null, app: null, versions: [], stats: { versions: 0, downloads: 0 } };

/* ---------- Toast ---------- */
var Toast = {
  show(msg, type, ms) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'show ' + (type || '');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => { t.className = ''; }, ms || 2600);
  }
};

/* ---------- 鼠标动效 ---------- */
function initCursor() { /* 已并入统一动效引擎 initFx */ }

/* ---------- 统一动效引擎（单一 RAF 循环，鼠标事件零样式写入 → 丝滑关键） ---------- */
var LOWEND = false;
function detectLowEnd() {
  try {
    var mem = navigator.deviceMemory;
    var cores = navigator.hardwareConcurrency;
    var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    return (mem && mem <= 2) || (cores && cores <= 2) || !!reduced;
  } catch (e) { return false; }
}

var FX = {
  mouse: { x: 0, y: 0 },
  glow: { el: null, x: 0, y: 0, on: false },
  cards: [],
  ver: { el: null, rx: 0, ry: 0, tRx: 0, tRy: 0 }
};

function initFx() {
  LOWEND = detectLowEnd();
  if (LOWEND) { try { document.body.classList.add('low-end'); } catch (e) {} }
  var fine = !!(window.matchMedia && matchMedia('(pointer: fine)').matches);
  FX.glow.el = $('#cursor-glow');
  if (!('addEventListener' in document)) return;

  /* 鼠标事件只记录目标值，绝不直写样式（避免高频重绘抖动） */
  document.addEventListener('mousemove', function (e) {
    FX.mouse.x = e.clientX; FX.mouse.y = e.clientY;
    if (!FX.glow.on) { FX.glow.on = true; document.body.classList.add('cursor-on'); }
    var card = e.target.closest ? e.target.closest('.fcard, .vitem, .about-card') : null;
    if (card) {
      if (!card._fxTracked) { card._fxTracked = true; card._fxGlow = card.querySelector('.fx-glow'); FX.cards.push(card); }
      var r = card.getBoundingClientRect();
      card._fxX = e.clientX - r.left; card._fxY = e.clientY - r.top;
    }
    var ver = e.target.closest ? e.target.closest('.ver-card') : null;
    if (ver) {
      var rv = ver.getBoundingClientRect();
      FX.ver.el = ver;
      FX.ver.tRx = ((e.clientY - rv.top) / rv.height - .5) * -6;
      FX.ver.tRy = ((e.clientX - rv.left) / rv.width - .5) * 8;
    } else { FX.ver.tRx = 0; FX.ver.tRy = 0; }
  }, { passive: true });

  /* 离开卡片：从活动集合移除（避免循环空转） */
  document.addEventListener('mouseout', function (e) {
    var card = e.target.closest ? e.target.closest('.fcard, .vitem, .about-card') : null;
    if (card) {
      var to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('.fcard, .vitem, .about-card') : null;
      if (to !== card) {
        card._fxTracked = false;
        var i = FX.cards.indexOf(card);
        if (i > -1) FX.cards.splice(i, 1);
      }
    }
    if (!e.relatedTarget) { FX.ver.tRx = 0; FX.ver.tRy = 0; }
  }, { passive: true });

  if (!window.requestAnimationFrame) return;
  var glowOk = fine && !LOWEND && FX.glow.el;

  (function fxLoop() {
    /* 光晕 lerp（合成层 transform） */
    if (FX.glow.on && glowOk) {
      FX.glow.x += (FX.mouse.x - FX.glow.x) * 0.09;
      FX.glow.y += (FX.mouse.y - FX.glow.y) * 0.09;
      FX.glow.el.style.transform = 'translate3d(' + FX.glow.x.toFixed(1) + 'px,' + FX.glow.y.toFixed(1) + 'px,0) translate(-50%,-50%)';
    }
    /* 活动卡片聚光：只动 transform，零重绘 */
    for (var i = FX.cards.length - 1; i >= 0; i--) {
      var c = FX.cards[i];
      if (!c.isConnected) { c._fxTracked = false; FX.cards.splice(i, 1); continue; }
      if (c._fxGlow) c._fxGlow.style.transform = 'translate3d(' + c._fxX + 'px,' + c._fxY + 'px,0)';
    }
    /* 版本卡 3D 倾斜 lerp 平滑 */
    var v = FX.ver;
    if (v.el && v.el.isConnected && !LOWEND) {
      v.rx += (v.tRx - v.rx) * 0.12;
      v.ry += (v.tRy - v.ry) * 0.12;
      v.el.style.transform = 'perspective(860px) rotateX(' + v.rx.toFixed(2) + 'deg) rotateY(' + v.ry.toFixed(2) + 'deg)';
    }
    requestAnimationFrame(fxLoop);
  })();
}

/* 卡片聚光与 3D 倾斜已并入 initFx */
function initCardFx() { /* 保留空实现以兼容旧调用 */ }

/* 磁吸按钮：合成层 translate3d，直写成本极低 */
function initMagnet() {
  if (!window.matchMedia || !matchMedia('(pointer: fine)').matches) return;
  $all('.btn-primary').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      try {
        const r = btn.getBoundingClientRect();
        const dx = (e.clientX - r.left - r.width / 2) * 0.14;
        const dy = (e.clientY - r.top - r.height / 2) * 0.2;
        btn.style.transform = 'translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0)';
      } catch (err) {}
    }, { passive: true });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; }, { passive: true });
  });
}

/* ---------- 滚动渐入 ---------- */
var _io = null;
function bindReveal(root) {
  const els = (root || document).querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    els.forEach(el => el.classList.add('visible'));
    return;
  }
  if (_io) _io.disconnect();
  try {
    _io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('visible'); _io.unobserve(en.target); } });
    }, { threshold: .12, rootMargin: '0px 0px -6% 0px' });
    els.forEach(el => _io.observe(el));
  } catch (e) { els.forEach(el => el.classList.add('visible')); }
}

/* ---------- 数字滚动 ---------- */
function animateCounters(root) {
  const els = (root || document).querySelectorAll('.counter');
  const showFinal = el => { el.textContent = el.getAttribute('data-target') || '0'; };
  if (!('IntersectionObserver' in window) || !window.requestAnimationFrame) { els.forEach(showFinal); return; }
  const cio = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const el = en.target;
      cio.unobserve(el);
      const target = parseInt(el.getAttribute('data-target'), 10) || 0;
      if (target < 10) { showFinal(el); return; }
      const dur = 1000; let t0 = null;
      const tick = now => {
        if (t0 === null) t0 = now;
        const p = Math.min(1, (now - t0) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: .5 });
  els.forEach(el => cio.observe(el));
}

/* ---------- 顶栏（滚动 RAF 节流，滚动丝滑） ---------- */
function bindNav(onRoute) {
  const bar = $('#topbar');
  const burger = $('#burger');
  const links = $('#nav-links');
  var pending = false;
  addEventListener('scroll', () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      try {
        if (bar) bar.classList.toggle('scrolled', window.scrollY > 24);
        const top = $('#back-top');
        if (top) top.classList.toggle('show', window.scrollY > 500);
      } catch (e) {}
    });
  }, { passive: true });
  if (burger && links) {
    burger.addEventListener('click', () => links.classList.toggle('open'));
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
  }
  const top = $('#back-top');
  if (top) top.addEventListener('click', () => {
    try { scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { scrollTo(0, 0); }
  });
}

/* ---------- 顶栏登录态渲染 ---------- */
function renderAuthArea() {
  const box = $('#tb-actions');
  if (!box) return;
  if (State.user) {
    box.innerHTML = '<a href="#/admin" title="管理后台"><span class="avatar">' + esc(State.user.charAt(0).toUpperCase()) + '</span></a>';
  } else {
    box.innerHTML = '<a class="btn btn-primary btn-sm" href="#/login">登录</a>';
  }
}

/* ---------- 页脚统计 ---------- */
function renderFooterStats() {
  const el = $('#ft-versions');
  if (el) el.textContent = State.stats.versions + ' 个版本 · 累计 ' + State.stats.downloads + ' 次下载';
}

/* ---------- 数据加载（容错） ---------- */
async function refreshPublic() {
  try {
    const d = await API.getPublic();
    State.app = d.app;
    State.versions = d.versions || [];
    State.stats = d.stats || { versions: 0, downloads: 0 };
  } catch (e) { /* 静默：页面用占位 */ }
  renderFooterStats();
}
async function refreshMe() {
  try {
    const d = await API.getMe();
    State.user = d.user || null;
  } catch (e) { State.user = null; }
  renderAuthArea();
}

/* ---------- 启动 ---------- */
(function boot() {
  try { document.documentElement.classList.remove('no-js'); } catch (e) {}
  window.addEventListener('error', function () {});
  try { initFx(); } catch (e) {}
  try { bindNav(); } catch (e) {}
  try { initMagnet(); } catch (e) {}
  if (!$('#back-top')) {
    const b = document.createElement('button');
    b.id = 'back-top'; b.setAttribute('aria-label', '返回顶部'); b.textContent = '↑';
    document.body.appendChild(b);
  }
  refreshMe();
})();
