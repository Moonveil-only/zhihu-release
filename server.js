/* =========================================================
 * 智护随行 · 软件更新托管平台（server.js）
 * 零外部依赖（Node 内置模块），单文件后端
 *
 * 能力：
 *   - 静态站点（public/）+ SPA 路由
 *   - 公开 API：软件信息 / 版本列表 / 免登录下载（自动计数）
 *   - 鉴权 API：登录（scrypt 哈希 + timingSafeEqual + 失败锁定）
 *               会话 Cookie（HttpOnly + SameSite=Strict）
 *   - 管理 API：上传新版本（multipart 流式接收，自动保留旧版）
 *               修改更新说明 / 删除版本 / 编辑软件信息 / 修改密码
 *   - 安全：CSP / XFO / nosniff / Referrer / HSTS(HTTPS) /
 *           全局限流 + 登录专用限流 / 上传白名单 / 路径穿越防护
 *   - 首次运行自动播种（admin / admin@2026，请登录后修改）
 *
 * 运行：node server.js        （默认端口 8200，可用环境变量 PORT 覆盖）
 * ========================================================= */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = parseInt(process.env.PORT, 10) || 8200;
const UPLOAD_LIMIT = 100 * 1024 * 1024;            // 单包上限 100MB（可在部署指南中调整）
const SESSION_TTL = 7 * 24 * 3600 * 1000;          // 会话 7 天
const ALLOWED_EXT = ['.apk', '.zip', '.exe', '.msi', '.dmg', '.pkg', '.gz', '.bz2', '.xz', '.rar', '.7z', '.deb', '.rpm', '.AppImage', '.jar'];

/* ---------- 云平台/容器冷启动：挂载卷为空时自动创建数据与上传目录 ---------- */
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) {}

/* ---------- 工具 ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.apk': 'application/vnd.android.package-archive', '.zip': 'application/zip', '.exe': 'application/octet-stream',
  '.msi': 'application/octet-stream', '.dmg': 'application/octet-stream', '.pkg': 'application/octet-stream',
  '.gz': 'application/gzip', '.bz2': 'application/x-bzip2', '.xz': 'application/x-xz', '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed', '.deb': 'application/vnd.debian.binary-package', '.rpm': 'application/x-rpm',
  '.AppImage': 'application/octet-stream', '.jar': 'application/java-archive'
};
function now() { return Date.now(); }
function json(res, code, obj, extra) {
  const headers = Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra || {});
  res.writeHead(code, headers);
  res.end(JSON.stringify(obj));
}
function randToken() { return crypto.randomBytes(32).toString('hex'); }

/* ---------- 数据层（db.json，原子写入） ---------- */
let DB = null;
function loadDB() {
  try { DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (e) { DB = null; }
  if (!DB || !Array.isArray(DB.users)) seed();
}
function saveDB() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(DB, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}
function hashPass(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}
function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
/* 首次运行播种：管理员 + 软件信息 + 预置 uploads 中的 APK 自动入库 */
function seed() {
  const salt = crypto.randomBytes(16).toString('hex');
  DB = {
    app: {
      name: '智护随行', icon: '🛰️', tagline: '乡村老年健康管理平台',
      desc: '吃药提醒、慢病随访、子女远程守护、适老商城，HTTPS 加密传输，断网可用，不会打字也能用。三端协同：老人端大字简单用，子女端远程守护，管理端高效运营，19+ 适老功能模块。',
      features: [
        { icon: '💊', title: '吃药提醒', desc: '闹钟式提醒，到点语音播报，打卡同步子女端' },
        { icon: '📊', title: '健康看板', desc: '血压血糖趋势图，异常自动预警不扰民' },
        { icon: '💌', title: '亲情信箱', desc: '离线互发消息、视频通话，乡野两地亲情互联' },
        { icon: '🛒', title: '适老商城', desc: '大字商品页、语音购物、货到付款送货到村' },
        { icon: '🆘', title: '安全急救', desc: '一键呼叫村医、走失求助卡、居家跌倒自查' },
        { icon: '🔒', title: '隐私安全', desc: '数据本机存储不上传，零外部依赖断网可用' }
      ]
    },
    versions: [],
    users: [{ username: 'admin', salt, pass: hashPass('admin@2026', salt), failedLogins: 0, lockUntil: 0 }],
    sessions: {}
  };
  /* 自动入库 uploads 中已存在的安装包（文件名需带版本号 vX.Y.Z） */
  try {
    for (const f of fs.readdirSync(UPLOAD_DIR)) {
      const m = f.match(/[-v]([\d]+(\.[\d]+){1,3})\.[A-Za-z0-9.]+$/);
      if (!m) continue;
      const st = fs.statSync(path.join(UPLOAD_DIR, f));
      DB.versions.push({
        id: randToken().slice(0, 12), version: m[1], notes: '初始版本：自动收录已有安装包。',
        file: f, size: st.size, downloads: 0, createdAt: now() - DB.versions.length * 1000
      });
    }
    DB.versions.sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {}
  saveDB();
}

/* ---------- 会话 ---------- */
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function currentUser(req) {
  const token = parseCookies(req).zhx_session;
  if (!token) return null;
  const s = DB.sessions[token];
  if (!s || s.expires < now()) { delete DB.sessions[token]; return null; }
  return s.user;
}
function grantSession(res, user) {
  const token = randToken();
  DB.sessions[token] = { user, expires: now() + SESSION_TTL };
  saveDB();
  res.setHeader('Set-Cookie', 'zhx_session=' + token + '; HttpOnly; Path=/; SameSite=Strict; Max-Age=' + (SESSION_TTL / 1000));
}
function revokeSession(req, res) {
  const token = parseCookies(req).zhx_session;
  if (token) { delete DB.sessions[token]; saveDB(); }
  res.setHeader('Set-Cookie', 'zhx_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0');
}

/* ---------- 限流（全局 + 登录专用） ---------- */
const RATE = { window: 60_000, max: 300, block: 120_000 };
const LOGIN_RATE = { window: 5 * 60_000, max: 10, block: 10 * 60_000 };
const hits = new Map();
const loginHits = new Map();
function limit(map, ip, rule) {
  const t = now();
  let h = map.get(ip);
  if (!h || t > h.resetAt) { h = { count: 0, resetAt: t + rule.window, blockedUntil: 0 }; map.set(ip, h); }
  if (h.blockedUntil > t) return false;
  if (++h.count > rule.max) { h.blockedUntil = t + rule.block; return false; }
  return true;
}
setInterval(() => {
  const t = now();
  for (const m of [hits, loginHits]) for (const [ip, h] of m) if (h.resetAt + RATE.block < t) m.delete(ip);
}, 90_000).unref();

/* ---------- 安全响应头 ---------- */
function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (res.socket && res.socket.encrypted) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

/* ---------- 静态文件（含路径穿越防护） ---------- */
function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not Found'); }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}
function safePath(base, rel) {
  const p = path.normalize(path.join(base, rel));
  return p.startsWith(base) ? p : null;
}

/* ---------- multipart/form-data 解析（零依赖手写） ---------- */
function parseMultipart(buf, boundary) {
  const out = { fields: {}, file: null };
  const sep = Buffer.from('--' + boundary);
  const crlf = Buffer.from('\r\n');
  /* 首个分界符位于请求体行首（前面没有 CRLF） */
  let start = buf.indexOf(sep);
  if (start === -1) return null;
  start += sep.length;
  while (start < buf.length) {
    /* 结束标记 --boundary-- */
    if (buf[start] === 0x2D && buf[start + 1] === 0x2D) break;
    /* 跳过分界符后的 CRLF */
    if (buf[start] === 0x0D && buf[start + 1] === 0x0A) start += 2;
    /* 定位下一个分界符（前带 CRLF） */
    let next = buf.indexOf(Buffer.concat([crlf, sep]), start);
    if (next === -1) next = buf.length;
    const part = buf.slice(start, next);
    const hEnd = part.indexOf('\r\n\r\n');
    if (hEnd !== -1) {
      const head = part.slice(0, hEnd).toString('utf8');
      const data = part.slice(hEnd + 4);
      const nm = head.match(/name="([^"]*)"/);
      const fm = head.match(/filename="([^"]*)"/);
      if (fm && fm[1]) out.file = { field: nm ? nm[1] : '', filename: fm[1], data };
      else if (nm) out.fields[nm[1]] = data.toString('utf8');
    }
    if (next >= buf.length) break;
    start = next + 2 + sep.length;
  }
  return out;
}
function cleanFilename(name) {
  return String(name || '').replace(/[\u0000-\u001f\/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', d => {
      size += d.length;
      if (size > limit) { req.destroy(); return reject(new Error('文件超出大小限制')); }
      chunks.push(d);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* ---------- 业务：版本排序（语义化） ---------- */
function cmpVer(a, b) {
  const pa = String(a).split('.').map(x => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map(x => parseInt(x, 10) || 0);
  for (let i = 0; i < 4; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x - y; }
  return 0;
}
function publicVersions() {
  return DB.versions.slice().sort((a, b) => cmpVer(b.version, a.version) || b.createdAt - a.createdAt)
    .map(v => ({ id: v.id, version: v.version, notes: v.notes, size: v.size, downloads: v.downloads, createdAt: v.createdAt }));
}

/* ---------- 请求处理 ---------- */
async function handle(req, res) {
  const ip = (req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
  securityHeaders(res);
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  /* 全局限流 */
  if (!limit(hits, ip, RATE)) return json(res, 429, { error: '请求过于频繁，请稍后再试' });

  /* ===== 公开 API ===== */
  if (urlPath === '/api/public' && req.method === 'GET') {
    return json(res, 200, {
      app: DB.app, versions: publicVersions(),
      stats: { versions: DB.versions.length, downloads: DB.versions.reduce((s, v) => s + v.downloads, 0) }
    });
  }
  if (urlPath === '/api/me' && req.method === 'GET') {
    const user = currentUser(req);
    return json(res, 200, user ? { user } : { user: null });
  }
  /* 免登录下载：计数 + 流式输出 */
  if (urlPath.startsWith('/api/dl/') && req.method === 'GET') {
    const id = urlPath.slice(8);
    const v = DB.versions.find(x => x.id === id);
    if (!v) return json(res, 404, { error: '版本不存在' });
    const fp = safePath(UPLOAD_DIR, v.file);
    if (!fp || !fs.existsSync(fp)) return json(res, 404, { error: '文件缺失' });
    v.downloads++;
    saveDB();
    const dn = encodeURIComponent(v.file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream',
      'Content-Disposition': "attachment; filename*=UTF-8''" + dn,
      'Cache-Control': 'no-store'
    });
    return fs.createReadStream(fp).pipe(res);
  }

  /* ===== 登录 / 登出 ===== */
  if (urlPath === '/api/login' && req.method === 'POST') {
    if (!limit(loginHits, ip, LOGIN_RATE)) return json(res, 429, { error: '尝试过于频繁，请 10 分钟后再试' });
    const body = await readBody(req, 8 * 1024).catch(() => null);
    let data = {};
    try { data = JSON.parse(body ? body.toString('utf8') : '{}'); } catch (e) {}
    const u = DB.users.find(x => x.username === String(data.username || '').trim());
    if (u && u.lockUntil > now()) return json(res, 423, { error: '账号已临时锁定，请 ' + Math.ceil((u.lockUntil - now()) / 60000) + ' 分钟后再试' });
    if (!u || !safeEqual(hashPass(data.password || '', u.salt), u.pass)) {
      if (u) {
        u.failedLogins++;
        if (u.failedLogins >= 5) { u.lockUntil = now() + 10 * 60_000; u.failedLogins = 0; }
        saveDB();
      }
      return json(res, 401, { error: '用户名或密码不正确' });
    }
    u.failedLogins = 0; u.lockUntil = 0;
    grantSession(res, u.username);
    saveDB();
    return json(res, 200, { ok: true, user: u.username });
  }
  if (urlPath === '/api/logout' && req.method === 'POST') {
    revokeSession(req, res);
    return json(res, 200, { ok: true });
  }

  /* ===== 以下全部需要登录 ===== */
  if (urlPath.startsWith('/api/admin') || urlPath.startsWith('/api/upload') || urlPath.startsWith('/api/version') || urlPath === '/api/app' || urlPath === '/api/password') {
    const user = currentUser(req);
    if (!user) return json(res, 401, { error: '请先登录' });

    /* 上传新版本（multipart：file + version + notes） */
    if (urlPath === '/api/upload' && req.method === 'POST') {
      const ct = req.headers['content-type'] || '';
      const bm = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/);
      if (!bm) return json(res, 400, { error: '请求格式错误' });
      const body = await readBody(req, UPLOAD_LIMIT).catch(e => { json(res, 413, { error: e.message }); return null; });
      if (!body) return;
      const parsed = parseMultipart(body, (bm[1] || bm[2]).trim());
      if (!parsed || !parsed.file || !parsed.file.data.length) return json(res, 400, { error: '未收到文件' });
      const version = String(parsed.fields.version || '').trim();
      const notes = String(parsed.fields.notes || '').trim().slice(0, 2000);
      if (!/^\d+(\.\d+){0,3}$/.test(version)) return json(res, 400, { error: '版本号格式：X.Y.Z（纯数字）' });
      if (DB.versions.some(v => v.version === version)) return json(res, 409, { error: '版本 v' + version + ' 已存在（旧版已保留，请递增版本号）' });
      const fname = cleanFilename(parsed.file.filename);
      const ext = path.extname(fname).toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) return json(res, 400, { error: '不支持的文件类型：' + (ext || '未知') });
      /* 文件名统一：原名保留，冲突时附加随机串 */
      let store = fname;
      if (fs.existsSync(path.join(UPLOAD_DIR, store))) store = path.parse(fname).name + '-' + randToken().slice(0, 6) + ext;
      fs.writeFileSync(path.join(UPLOAD_DIR, store), parsed.file.data);
      DB.versions.push({ id: randToken().slice(0, 12), version, notes: notes || '（无更新说明）', file: store, size: parsed.file.data.length, downloads: 0, createdAt: now() });
      saveDB();
      console.log('[upload] v' + version + ' ← ' + store + ' (' + (parsed.file.data.length / 1048576).toFixed(1) + 'MB) by ' + user);
      return json(res, 200, { ok: true, version, file: store });
    }

    /* 修改版本说明 */
    let m = urlPath.match(/^\/api\/version\/([a-f0-9]+)\/notes$/);
    if (m && req.method === 'POST') {
      const v = DB.versions.find(x => x.id === m[1]);
      if (!v) return json(res, 404, { error: '版本不存在' });
      const body = await readBody(req, 64 * 1024).catch(() => null);
      let data = {}; try { data = JSON.parse(body ? body.toString('utf8') : '{}'); } catch (e) {}
      v.notes = String(data.notes || '').trim().slice(0, 2000) || '（无更新说明）';
      saveDB();
      return json(res, 200, { ok: true });
    }

    /* 删除版本（记录 + 文件） */
    m = urlPath.match(/^\/api\/version\/([a-f0-9]+)$/);
    if (m && req.method === 'DELETE') {
      const i = DB.versions.findIndex(x => x.id === m[1]);
      if (i === -1) return json(res, 404, { error: '版本不存在' });
      const v = DB.versions[i];
      try { fs.unlinkSync(path.join(UPLOAD_DIR, v.file)); } catch (e) {}
      DB.versions.splice(i, 1);
      saveDB();
      console.log('[delete] v' + v.version + ' by ' + user);
      return json(res, 200, { ok: true });
    }

    /* 编辑软件信息 */
    if (urlPath === '/api/app' && req.method === 'POST') {
      const body = await readBody(req, 128 * 1024).catch(() => null);
      let data = {}; try { data = JSON.parse(body ? body.toString('utf8') : '{}'); } catch (e) {}
      if (String(data.name || '').trim().slice(0, 40)) DB.app.name = String(data.name).trim().slice(0, 40);
      if (String(data.tagline || '').trim().slice(0, 80)) DB.app.tagline = String(data.tagline).trim().slice(0, 80);
      if (typeof data.desc === 'string') DB.app.desc = data.desc.slice(0, 800);
      if (String(data.icon || '').trim().slice(0, 4)) DB.app.icon = String(data.icon).trim().slice(0, 4);
      if (Array.isArray(data.features)) {
        DB.app.features = data.features.slice(0, 12).map(f => ({
          icon: String(f.icon || '✦').slice(0, 4), title: String(f.title || '').slice(0, 30), desc: String(f.desc || '').slice(0, 120)
        })).filter(f => f.title);
      }
      saveDB();
      return json(res, 200, { ok: true });
    }

    /* 修改密码 */
    if (urlPath === '/api/password' && req.method === 'POST') {
      const body = await readBody(req, 8 * 1024).catch(() => null);
      let data = {}; try { data = JSON.parse(body ? body.toString('utf8') : '{}'); } catch (e) {}
      const u = DB.users.find(x => x.username === user);
      if (!u || !safeEqual(hashPass(data.old || '', u.salt), u.pass)) return json(res, 401, { error: '原密码不正确' });
      const np = String(data.next || '');
      if (np.length < 8 || !/[A-Za-z]/.test(np) || !/\d/.test(np)) return json(res, 400, { error: '新密码至少 8 位且含字母和数字' });
      u.salt = crypto.randomBytes(16).toString('hex');
      u.pass = hashPass(np, u.salt);
      saveDB();
      return json(res, 200, { ok: true });
    }
  }

  /* ===== 静态资源 / SPA ===== */
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method Not Allowed' });
  if (urlPath === '/') return serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
  if (urlPath.startsWith('/api/')) return json(res, 404, { error: 'Not Found' });
  /* 1) 前端静态资源：public/ 目录 */
  const pub = safePath(PUBLIC_DIR, urlPath);
  if (pub && fs.existsSync(pub)) {
    try { if (fs.statSync(pub).isFile()) return serveFile(res, pub); } catch (e) {}
  }
  /* 2) 其余路径：SPA 兜底回首页（hash 路由前端处理），资源类扩展名 404 */
  if (!/\.(html|css|js|json|svg|png|jpg|jpeg|webp|ico|txt|map)$/i.test(urlPath)) {
    return serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
  }
  return json(res, 404, { error: 'Not Found' });
}

/* ---------- 启动 ---------- */
loadDB();
http.createServer((req, res) => { handle(req, res).catch(e => { try { json(res, 500, { error: '服务器内部错误' }); } catch (e2) {} }); })
  .listen(PORT, () => {
    console.log('');
    console.log('  ╔════════════════════════════════════════════════╗');
    console.log('  ║   智护随行 · 软件更新托管平台已启动            ║');
    console.log('  ╠════════════════════════════════════════════════╣');
    console.log('  ║  访问地址   http://localhost:' + PORT + '              ║');
    console.log('  ║  管理入口   http://localhost:' + PORT + '/#/login        ║');
    console.log('  ║  默认账号   admin / admin@2026（请登录后修改） ║');
    console.log('  ║  当前版本   ' + (publicVersions()[0] ? 'v' + publicVersions()[0].version : '尚无版本') + '                  ║');
    console.log('  ╚════════════════════════════════════════════════╝');
    console.log('');
  })
  .on('error', e => { console.error('启动失败：' + e.message); process.exit(1); });
