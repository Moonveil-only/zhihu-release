/* =========================================================
 * 智护随行 · 软件更新托管平台 — 页面路由与渲染（views.js）
 * 路由：#/ 首页 · #/download 下载 · #/about 关于
 *       #/login 登录 · #/admin 管理（发布/版本/设置）
 * ========================================================= */
'use strict';

/* ---------- 极简路由 ---------- */
var Router = {
  routes: [],
  add(re, fn) { this.routes.push({ re, fn }); },
  async go() {
    const hash = location.hash || '#/';
    const path = hash.slice(1) || '/';
    const app = $('#app');
    for (const r of this.routes) {
      const m = path.match(r.re);
      if (m) {
        app.className = 'page-enter';
        try { await r.fn(m, app); }
        catch (e) { app.innerHTML = '<div class="wrap"><div class="empty"><div class="e-ico">⚠️</div><div>页面加载出现问题，请刷新重试</div></div></div>'; }
        try { bindReveal(app); initMagnet(); animateCounters(app); } catch (e) {}
        scrollTo(0, 0);
        return;
      }
    }
    location.hash = '#/';
  }
};
addEventListener('hashchange', () => Router.go());

/* ---------- 公共片段 ---------- */
function versionNoteShort(n) { return String(n || '').split('\n')[0].slice(0, 60) || '（无更新说明）'; }

/* ---------- 首页 ---------- */
Router.add(/^\/$/, async (m, app) => {
  await refreshPublic();
  const A = State.app || { name: '智护随行', icon: '🩺', tagline: '', desc: '', features: [] };
  const vs = State.versions;
  const latest = vs[0] || null;
  const features = (A.features || []).slice(0, 6);
  app.innerHTML = `
  <section class="hero">
    <div class="wrap hero-inner">
      <div class="hero-copy">
        <div class="hero-pill reveal"><span class="dot"></span>${esc(A.name)} · 最新版已发布</div>
        <h1 class="hero-title">
          爸妈的健康<br>装进<span class="grad-text">一部手机</span>
        </h1>
        <p class="hero-sub">${esc(A.tagline || '')}</p>
        <div class="hero-cta">
          <a class="btn btn-primary btn-lg magnet" href="${latest ? '#/download' : '#/admin'}" id="hero-dl">
            <span>⬇ 免费下载</span>${latest ? '<small>v' + esc(latest.version) + ' · 免登录直下</small>' : '<small>管理员登录后发布</small>'}
          </a>
          <a class="btn btn-ghost btn-lg" href="#/download"><span>查看全部版本</span><small>${State.stats.versions} 个历史版本</small></a>
        </div>
        <div class="hero-stats">
          <div class="hstat"><div class="v"><span class="counter" data-target="${State.stats.versions}">0</span></div><div class="l">发布版本</div></div>
          <div class="hstat"><div class="v"><span class="counter" data-target="${State.stats.downloads}">0</span></div><div class="l">累计下载</div></div>
          <div class="hstat"><div class="v">7×24</div><div class="l">在线托管</div></div>
        </div>
      </div>
      <div class="hero-visual reveal">
        <div class="ver-float">
          <div class="ver-card" id="hero-ver-card">
            <img class="vc-logo" src="logo.svg" alt="${esc(A.name)}">
            <div class="vc-badge">LATEST · v${latest ? esc(latest.version) : '—'}</div>
            <div class="vc-ver">${latest ? 'v' + esc(latest.version) : '等待发布'}</div>
            <div class="vc-meta"><span>📅 ${latest ? fmtDate(latest.createdAt) : '—'}</span><span>⬇ ${latest ? latest.downloads : 0} 次</span><span>📦 ${latest ? fmtSize(latest.size) : ''}</span></div>
            <div class="vc-note">${latest ? esc(versionNoteShort(latest.notes)) : '登录管理后台，上传第一个软件包'}</div>
          </div>
          <div class="float-chip chip-1"><span class="ci">📦</span><div><b>自动保留旧版</b><small>历史版本完整存档</small></div></div>
          <div class="float-chip chip-2"><span class="ci">🔓</span><div><b>免登录下载</b><small>访客一键直下</small></div></div>
          <div class="float-chip chip-3"><span class="ci">📴</span><div><b>离线可用</b><small>断网也能正常使用</small></div></div>
        </div>
      </div>
    </div>
  </section>

  <section class="sec sec-alt">
    <div class="wrap">
      <div class="sec-head reveal">
        <div class="sec-tag">FEATURES</div>
        <h2>${esc(A.name)} <span style="color:var(--ink-3);font-weight:600">核心功能</span></h2>
      </div>
      <div class="f-grid">
        ${features.map(f => `
        <div class="fcard reveal">
          <i class="fx-glow" aria-hidden="true"></i>
          <div class="fi">${esc(f.icon)}</div>
          <h3>${esc(f.title)}</h3><p>${esc(f.desc)}</p>
        </div>`).join('')}
      </div>
    </div>
  </section>

  <section class="sec">
    <div class="wrap">
      <div class="sec-head reveal">
        <div class="sec-tag">VERSIONS</div>
        <h2>版本动态 <span style="color:var(--ink-3);font-weight:600">最近更新</span></h2>
      </div>
      <div class="v-list">
        ${vs.slice(0, 3).map((v, i) => `
        <div class="vitem ${i === 0 ? 'latest' : ''} reveal">
          <i class="fx-glow" aria-hidden="true"></i>
          <div class="vi-head">
            <span class="vi-ver">v${esc(v.version)}</span>
            ${i === 0 ? '<span class="vi-latest">最新版</span>' : ''}
            <span class="vi-date">${fmtDate(v.createdAt)}</span>
          </div>
          <div class="vi-notes">${esc(versionNoteShort(v.notes))}</div>
          <div class="vi-foot">
            <span class="vi-meta">📦 ${fmtSize(v.size)}</span>
            <span class="vi-meta">⬇ ${v.downloads} 次</span>
            <span class="vi-dl"><a class="btn btn-primary btn-sm" href="/api/dl/${esc(v.id)}">下载</a></span>
          </div>
        </div>`).join('') || '<div class="empty reveal"><div class="e-ico">📭</div><div>暂无版本，等待发布</div></div>'}
      </div>
      ${vs.length > 3 ? '<div class="center" style="margin-top:26px"><a class="btn btn-ghost" href="#/download">查看全部 ' + State.stats.versions + ' 个版本 →</a></div>' : ''}
    </div>
  </section>`;
});

/* ---------- 下载页（免登录） ---------- */
Router.add(/^\/download$/, async (m, app) => {
  await refreshPublic();
  const vs = State.versions;
  app.innerHTML = `
  <section class="sec">
    <div class="wrap">
      <div class="sec-head reveal">
        <div class="sec-tag">DOWNLOAD</div>
        <h2>下载中心 <span style="color:var(--ink-3);font-weight:600">全部历史版本</span></h2>
      </div>
      <div class="v-list">
        ${vs.map((v, i) => `
        <div class="vitem ${i === 0 ? 'latest' : ''} reveal">
          <i class="fx-glow" aria-hidden="true"></i>
          <div class="vi-head">
            <span class="vi-ver">v${esc(v.version)}</span>
            ${i === 0 ? '<span class="vi-latest">最新版</span>' : ''}
            <span class="vi-date">${fmtDate(v.createdAt)}</span>
          </div>
          <div class="vi-notes">${esc(v.notes)}</div>
          <div class="vi-foot">
            <span class="vi-meta">📦 ${fmtSize(v.size)}</span>
            <span class="vi-meta">⬇ ${v.downloads} 次下载</span>
            <span class="vi-dl"><a class="btn ${i === 0 ? 'btn-primary' : 'btn-ghost'} btn-sm magnet" href="/api/dl/${esc(v.id)}" ${i === 0 ? '' : 'download'}>${i === 0 ? '⬇ 下载最新版' : '下载此版本'}</a></span>
          </div>
        </div>`).join('') || '<div class="empty reveal"><div class="e-ico">📭</div><div>暂无版本发布</div></div>'}
      </div>
    </div>
  </section>`;
});

/* ---------- 关于页（仅软件功能介绍与产品简介） ---------- */
Router.add(/^\/about$/, async (m, app) => {
  await refreshPublic();
  const A = State.app || {};
  const features = (A.features || []).slice(0, 6);
  app.innerHTML = `
  <section class="sec">
    <div class="wrap">
      <div class="about-brand reveal">
        <img class="ab-logo" src="logo.svg" alt="${esc(A.name || '智护随行')}">
        <h2>${esc(A.name || '智护随行')}</h2>
        <p>${esc(A.tagline || '')}</p>
      </div>
      <div class="about-grid">
        ${features.map(f => `
        <div class="about-card reveal"><i class="fx-glow" aria-hidden="true"></i><div class="ai">${esc(f.icon)}</div><h3>${esc(f.title)}</h3><p>${esc(f.desc)}</p></div>`).join('')}
        <div class="about-card reveal"><i class="fx-glow" aria-hidden="true"></i><div class="ai">🗂️</div><h3>版本历史</h3><p>发布新版自动接续，旧版完整存档，随时可回溯。</p></div>
        <div class="about-card reveal"><i class="fx-glow" aria-hidden="true"></i><div class="ai">🔓</div><h3>免登录下载</h3><p>下载完全开放，一键直下。</p></div>
        <div class="about-card reveal"><i class="fx-glow" aria-hidden="true"></i><div class="ai">⚡</div><h3>稳定运行</h3><p>普通配置设备即可 7×24 小时在线，兼容主流浏览器。</p></div>
      </div>
    </div>
  </section>`;
});

/* ---------- 登录页 ---------- */
Router.add(/^\/login$/, async (m, app) => {
  if (State.user === null) await refreshMe();
  if (State.user) { location.hash = '#/admin'; return; }
  app.innerHTML = `
  <div class="form-card">
    <h1>管理登录</h1>
    <div class="sub">登录后可发布新版本、管理历史版本与平台设置</div>
    <div class="f-item"><label>用户名</label><input id="l-user" placeholder="admin" autocomplete="username"></div>
    <div class="f-item"><label>密码</label><input id="l-pwd" type="password" placeholder="••••••••" autocomplete="current-password"><div class="f-err"></div></div>
    <button class="btn btn-primary btn-block" id="l-go">登 录</button>
    <div class="form-foot">下载无需登录 · <a href="#/download">前往下载中心</a></div>
  </div>`;
  const go = async () => {
    const u = $('#l-user').value.trim(), p = $('#l-pwd').value;
    if (!u || !p) { Toast.show('请填写用户名和密码', 'err'); return; }
    const btn = $('#l-go');
    btn.disabled = true; btn.textContent = '登录中…';
    try {
      await API.login(u, p);
      State.user = u;
      renderAuthArea();
      Toast.show('欢迎回来，' + u, 'ok');
      location.hash = '#/admin';
    } catch (e) {
      const err = $('#l-go').closest('.form-card').querySelector('.f-err');
      if (err) err.textContent = e.message;
      Toast.show(e.message, 'err');
    }
    btn.disabled = false; btn.textContent = '登 录';
  };
  $('#l-go').onclick = go;
  $('#l-pwd').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
});

/* ---------- 管理页（登录后） ---------- */
Router.add(/^\/admin$/, async (m, app) => {
  if (State.user === null) await refreshMe();
  if (!State.user) { location.hash = '#/login'; return; }
  await refreshPublic();
  let tab = 'publish';
  app.innerHTML = `
  <div class="wrap">
    <div class="admin-tabs" id="admin-tabs">
      <button data-t="publish" class="on">📦 发布新版本</button>
      <button data-t="versions">🗂 版本管理</button>
      <button data-t="settings">⚙️ 平台设置</button>
    </div>
    <div id="admin-body"></div>
  </div>`;
  const body = $('#admin-body');

  function renderTab() {
    if (tab === 'publish') renderPublish();
    else if (tab === 'versions') renderVersions();
    else renderSettings();
    bindReveal(body); initMagnet();
  }
  $all('#admin-tabs button').forEach(b => b.onclick = () => {
    tab = b.getAttribute('data-t');
    $all('#admin-tabs button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    renderTab();
  });

  /* --- Tab 1：发布新版本 --- */
  function renderPublish() {
    body.innerHTML = `
    <div class="form-card wide">
      <h1>📦 发布新版本</h1>
      <div class="sub">上传软件包后自动归档为新的版本轨道，旧版本完整保留（当前 ${State.versions.length} 个版本）</div>
      <div class="f-item"><label>软件包（支持 apk / zip / exe / msi / dmg / deb 等，≤100MB）</label>
        <input type="file" id="p-file">
        <div class="f-err" id="p-file-err"></div>
      </div>
      <div class="f-item"><label>版本号（如 1.1.0，需大于当前版本且不重复）</label>
        <input id="p-ver" placeholder="${nextVersionSuggest()}">
        <div class="f-err" id="p-ver-err"></div>
      </div>
      <div class="f-item"><label>更新说明（发布后展示在版本列表，≤2000 字）</label>
        <textarea id="p-notes" placeholder="本次更新内容：&#10;1. 新增…&#10;2. 修复…&#10;3. 优化…"></textarea>
        <div class="f-err" id="p-notes-err"></div>
      </div>
      <button class="btn btn-primary btn-block" id="p-go">🚀 发布新版本</button>
      <div class="up-bar" id="up-bar"><i></i></div>
      <div class="up-txt" id="up-txt"></div>
    </div>`;
    $('#p-go').onclick = async () => {
      const file = ($('#p-file').files || [])[0];
      const ver = $('#p-ver').value.trim();
      const notes = $('#p-notes').value;
      $all('.f-err', body).forEach ? null : null;
      body.querySelectorAll('.f-err').forEach(e => e.textContent = '');
      body.querySelectorAll('.f-item').forEach(e => e.classList.remove('err'));
      const fail = (id, msg) => { const el = body.querySelector(id); if (el) { el.textContent = msg; el.closest('.f-item').classList.add('err'); } };
      if (!file) return fail('#p-file-err', '请选择软件包文件');
      if (!/^\d+(\.\d+){0,3}$/.test(ver)) return fail('#p-ver-err', '版本号格式：X.Y.Z（纯数字）');
      if (State.versions.some(v => v.version === ver)) return fail('#p-ver-err', '版本 v' + ver + ' 已存在，请递增');
      const btn = $('#p-go');
      const bar = $('#up-bar'), barIn = bar.querySelector('i'), txt = $('#up-txt');
      btn.disabled = true; btn.textContent = '发布中…';
      bar.classList.add('show'); txt.classList.add('show');
      try {
        const r = await API.upload(file, ver, notes, pct => {
          barIn.style.width = pct + '%';
          txt.textContent = '上传中 ' + pct + '% …';
        });
        txt.textContent = '✅ v' + r.version + ' 发布成功（' + r.file + '）';
        Toast.show('v' + r.version + ' 发布成功，已自动归档', 'ok', 3200);
        await refreshPublic();
        setTimeout(() => { tab = 'versions'; $all('#admin-tabs button').forEach(x => x.classList.toggle('on', x.getAttribute('data-t') === 'versions')); renderTab(); }, 900);
      } catch (e) {
        txt.textContent = '❌ ' + e.message;
        Toast.show(e.message, 'err', 3400);
        bar.classList.remove('show'); txt.classList.remove('show');
      }
      btn.disabled = false; btn.textContent = '🚀 发布新版本';
    };
  }
  function nextVersionSuggest() {
    const cur = (State.versions[0] || {}).version || '1.0.0';
    const p = cur.split('.').map(x => parseInt(x, 10) || 0);
    p[p.length - 1] = (p[p.length - 1] || 0) + 1;
    return p.join('.');
  }

  /* --- Tab 2：版本管理 --- */
  function renderVersions() {
    body.innerHTML = `
    <div class="form-card wide">
      <h1>🗂 版本管理 <span style="font-size:13px;color:var(--ink-3);font-weight:600">${State.versions.length} 个版本 · 旧版自动保留</span></h1>
      <div class="sub">可编辑更新说明或删除版本；删除会同时移除服务器上的安装包文件（不可恢复）</div>
      <div class="v-list" id="vm-list">
        ${State.versions.map((v, i) => `
        <div class="vitem ${i === 0 ? 'latest' : ''}">
          <i class="fx-glow" aria-hidden="true"></i>
          <div class="vi-head"><span class="vi-ver">v${esc(v.version)}</span>${i === 0 ? '<span class="vi-latest">最新版</span>' : ''}<span class="vi-date">${fmtDate(v.createdAt)}</span></div>
          <div class="vi-notes" id="vn-${esc(v.id)}">${esc(v.notes)}</div>
          <div class="vi-foot">
            <span class="vi-meta">📦 ${fmtSize(v.size)}</span><span class="vi-meta">⬇ ${v.downloads}</span>
            <span class="vi-admin">
              <button class="btn btn-ghost btn-sm" data-edit="${esc(v.id)}">编辑说明</button>
              <button class="btn btn-danger btn-sm" data-del="${esc(v.id)}" data-ver="${esc(v.version)}">删除</button>
            </span>
          </div>
        </div>`).join('') || '<div class="empty"><div class="e-ico">📭</div><div>暂无版本，去「发布新版本」上传第一个包</div></div>'}
      </div>
    </div>`;
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const id = b.getAttribute('data-edit');
      const noteEl = body.querySelector('#vn-' + id);
      const v = State.versions.find(x => x.id === id);
      if (!v || !noteEl) return;
      if (noteEl.querySelector('textarea')) return;
      noteEl.innerHTML = '<textarea style="width:100%;min-height:88px;background:rgba(0,0,0,.3);border:1px solid var(--line-2);border-radius:10px;padding:10px;color:var(--ink);font-family:inherit;font-size:13.5px;line-height:1.6">' + esc(v.notes) + '</textarea>';
      b.textContent = '保存';
      b.onclick = async () => {
        const val = noteEl.querySelector('textarea').value;
        b.disabled = true;
        try {
          await API.setNotes(id, val);
          v.notes = val;
          noteEl.textContent = val;
          b.textContent = '编辑说明';
          Toast.show('更新说明已保存', 'ok');
        } catch (e) { Toast.show(e.message, 'err'); b.textContent = '编辑说明'; }
        b.disabled = false;
      };
    });
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const id = b.getAttribute('data-del'), ver = b.getAttribute('data-ver');
      if (!confirm('确认删除 v' + ver + '？该版本的安装包文件将一并移除，不可恢复。')) return;
      b.disabled = true;
      try {
        await API.delVersion(id);
        Toast.show('v' + ver + ' 已删除', 'ok');
        await refreshPublic();
        renderVersions();
      } catch (e) { Toast.show(e.message, 'err'); b.disabled = false; }
    });
  }

  /* --- Tab 3：平台设置 --- */
  function renderSettings() {
    const A = State.app || {};
    body.innerHTML = `
    <div class="form-card wide">
      <h1>⚙️ 平台设置</h1>
      <div class="sub">软件信息展示在首页与关于页；功能卡用「图标|标题|描述」格式，每行一个</div>
      <div class="f-item"><label>软件名称</label><input id="s-name" value="${esc(A.name || '')}" maxlength="40"></div>
      <div class="f-item"><label>图标（emoji）</label><input id="s-icon" value="${esc(A.icon || '🛰️')}" maxlength="4"></div>
      <div class="f-item"><label>一句话标语</label><input id="s-tagline" value="${esc(A.tagline || '')}" maxlength="80"></div>
      <div class="f-item"><label>软件介绍</label><textarea id="s-desc" maxlength="800">${esc(A.desc || '')}</textarea></div>
      <div class="f-item"><label>功能卡列表（每行：图标|标题|描述）</label>
        <textarea id="s-feats" style="min-height:150px">${esc((A.features || []).map(f => f.icon + '|' + f.title + '|' + f.desc).join('\n'))}</textarea></div>
      <button class="btn btn-primary btn-block" id="s-save">💾 保存软件信息</button>
    </div>
    <div class="form-card wide" style="margin-top:22px">
      <h1>🔐 修改密码</h1>
      <div class="sub">当前账号：${esc(State.user)} · 新密码至少 8 位且含字母和数字</div>
      <div class="f-item"><label>原密码</label><input id="pw-old" type="password" autocomplete="current-password"></div>
      <div class="f-item"><label>新密码</label><input id="pw-new" type="password" autocomplete="new-password"><div class="f-err" id="pw-err"></div></div>
      <div style="display:flex;gap:12px">
        <button class="btn btn-primary" style="flex:1" id="pw-go">修改密码</button>
        <button class="btn btn-danger" id="lg-out">退出登录</button>
      </div>
    </div>`;
    $('#s-save').onclick = async () => {
      const feats = $('#s-feats').value.split('\n').map(l => {
        const p = l.split('|');
        return { icon: (p[0] || '✦').trim(), title: (p[1] || '').trim(), desc: (p[2] || '').trim() };
      }).filter(f => f.title);
      try {
        await API.saveApp({ name: $('#s-name').value, icon: $('#s-icon').value, tagline: $('#s-tagline').value, desc: $('#s-desc').value, features: feats });
        Toast.show('软件信息已保存', 'ok');
        await refreshPublic();
      } catch (e) { Toast.show(e.message, 'err'); }
    };
    $('#pw-go').onclick = async () => {
      $('#pw-err').textContent = '';
      try {
        await API.changePassword($('#pw-old').value, $('#pw-new').value);
        Toast.show('密码修改成功，下次登录请使用新密码', 'ok', 3400);
        $('#pw-old').value = ''; $('#pw-new').value = '';
      } catch (e) { $('#pw-err').textContent = e.message; Toast.show(e.message, 'err'); }
    };
    $('#lg-out').onclick = async () => {
      try { await API.logout(); } catch (e) {}
      State.user = null;
      renderAuthArea();
      Toast.show('已退出登录', 'ok');
      location.hash = '#/';
    };
  }

  renderTab();
});

/* ---------- 启动路由 ---------- */
Router.go();
