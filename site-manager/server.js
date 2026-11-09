/**
 * Webサイト管理システム - ローカルサーバー
 * Node.js 標準モジュールのみで動作（追加インストール不要）
 *
 *   起動: node server.js
 *   既定: http://127.0.0.1:3800 （このPCからのみアクセス可能）
 */
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, newId, nowIso, normalizeDb } from './server/store.js';
import { Auth } from './server/auth.js';
import {
  COLLECTIONS, HttpError, validateRecord, validateSettings, validateChecklists, validateReportNote
} from './server/schema.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 3800;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PUBLIC_DIR = path.join(ROOT, 'public');
const COOKIE = 'wsm_sid';

const LIMIT_JSON = 1024 * 1024; // 通常の入力: 1MB
const LIMIT_ATTACHMENT = 15 * 1024 * 1024; // 添付ファイル1件: 15MB

/* 添付できるファイル形式（HTML・SVG・実行ファイル等は不可） */
const ATTACHMENT_TYPES = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  csv: 'text/csv',
  txt: 'text/plain',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  zip: 'application/zip'
};

const store = new Store(DATA_DIR);
const auth = new Auth(path.join(DATA_DIR, 'auth.json'));

/* =========================================================
   共通処理
   ========================================================= */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin'
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

const sendJson = (res, status, data) => send(res, status, JSON.stringify(data), { 'Content-Type': MIME['.json'] });

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'データサイズが大きすぎます'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req, limit = LIMIT_JSON) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSONの形式が正しくありません');
  }
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const sessionCookie = (token, maxAge) => `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;

/** 業務データを返す（添付ファイルの中身は含めない） */
const publicDb = () => store.db;

/* =========================================================
   静的ファイル配信
   ========================================================= */
async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');
  const rel = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
  try {
    const body = await readFile(filePath);
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    send(res, 200, req.method === 'HEAD' ? '' : body, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  } catch {
    send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
}

/* =========================================================
   API
   ========================================================= */

/** サイト削除時に関連データも削除・参照解除する */
function cascadeDeleteSite(siteId) {
  const db = store.db;
  for (const name of ['inspections', 'worklogs', 'backups', 'serverScans']) {
    db[name] = db[name].filter((r) => r.siteId !== siteId);
  }
  const removedReports = db.securityReports.filter((r) => r.siteId === siteId);
  db.securityReports = db.securityReports.filter((r) => r.siteId !== siteId);
  db.contracts.forEach((c) => { c.siteIds = c.siteIds.filter((id) => id !== siteId); });
  db.securityServices.forEach((s) => { s.targetSiteIds = s.targetSiteIds.filter((id) => id !== siteId); });
  return removedReports.flatMap((r) => r.attachments || []);
}

async function handleCollection(req, res, collection, id, user) {
  if (!COLLECTIONS[collection]) throw new HttpError(404, '対象のデータ種別が存在しません');
  const db = store.db;
  const list = db[collection];

  // 新規作成
  if (req.method === 'POST' && !id) {
    const data = validateRecord(collection, await readJson(req), db);
    const now = nowIso();
    const record = { id: newId(), ...data, createdAt: now, createdBy: user.displayName, updatedAt: now, updatedBy: user.displayName };
    list.push(record);
    await store.save();
    return sendJson(res, 201, { record });
  }

  const index = list.findIndex((r) => r.id === id);
  if (index < 0) throw new HttpError(404, 'データが見つかりません（他の担当者が削除した可能性があります）');

  // 更新
  if (req.method === 'PUT') {
    const data = validateRecord(collection, await readJson(req), db);
    const before = list[index];
    list[index] = { ...before, ...data, updatedAt: nowIso(), updatedBy: user.displayName };
    // 外された添付ファイルは削除
    if (collection === 'securityReports') {
      for (const aid of before.attachments || []) {
        if (!list[index].attachments.includes(aid)) await store.deleteAttachment(aid);
      }
    }
    await store.save();
    return sendJson(res, 200, { record: list[index] });
  }

  // 削除
  if (req.method === 'DELETE') {
    const record = list[index];
    let orphanAttachments = [];
    if (collection === 'sites') {
      await store.snapshot('before-delete-site');
      orphanAttachments = cascadeDeleteSite(id);
    }
    if (collection === 'securityServices') {
      const count = db.securityReports.filter((r) => r.serviceId === id).length;
      if (count) throw new HttpError(400, `このサービスに紐づく診断結果が${count}件あります。先に診断結果を削除してください。`);
    }
    if (collection === 'securityReports') orphanAttachments = record.attachments || [];
    db[collection] = db[collection].filter((r) => r.id !== id);
    for (const aid of orphanAttachments) await store.deleteAttachment(aid);
    await store.save();
    return sendJson(res, 200, { ok: true });
  }

  throw new HttpError(405, '許可されていない操作です');
}

async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method;
  const ip = req.socket.remoteAddress || 'unknown';

  // 更新系リクエストはカスタムヘッダー必須（CSRF対策）
  if (method !== 'GET' && req.headers['x-wsm-request'] !== '1') {
    throw new HttpError(403, '不正なリクエストです');
  }

  /* ---- 認証不要 ---- */
  if (pathname === '/api/status' && method === 'GET') {
    const token = parseCookies(req)[COOKIE];
    return sendJson(res, 200, { setupRequired: !auth.hasUsers(), authenticated: !!auth.getUserBySession(token) });
  }

  if (pathname === '/api/setup' && method === 'POST') {
    if (auth.hasUsers()) throw new HttpError(403, '初期設定は完了しています');
    const body = await readJson(req);
    const user = await auth.createUser(body);
    const full = auth.data.users.find((u) => u.id === user.id);
    const token = auth.createSession(full);
    return send(res, 200, JSON.stringify({ user }), { 'Content-Type': MIME['.json'], 'Set-Cookie': sessionCookie(token, 43200) });
  }

  if (pathname === '/api/login' && method === 'POST') {
    const body = await readJson(req);
    const user = await auth.verify(body.username, body.password, ip);
    const token = auth.createSession(user);
    return send(res, 200, JSON.stringify({ user: auth.publicUser(user) }), { 'Content-Type': MIME['.json'], 'Set-Cookie': sessionCookie(token, 43200) });
  }

  /* ---- ここから認証必須 ---- */
  const token = parseCookies(req)[COOKIE];
  const user = auth.getUserBySession(token);
  if (!user) throw new HttpError(401, 'ログインが必要です');

  if (pathname === '/api/logout' && method === 'POST') {
    auth.destroySession(token);
    return send(res, 200, '{"ok":true}', { 'Content-Type': MIME['.json'], 'Set-Cookie': sessionCookie('', 0) });
  }

  if (pathname === '/api/me' && method === 'GET') return sendJson(res, 200, { user: auth.publicUser(user) });
  if (pathname === '/api/db' && method === 'GET') return sendJson(res, 200, publicDb());

  // コレクション（sites / inspections / worklogs ...）の作成・更新・削除
  const m = pathname.match(/^\/api\/c\/([a-zA-Z]+)(?:\/([a-z0-9-]+))?$/i);
  if (m) return handleCollection(req, res, m[1], m[2], user);

  if (pathname === '/api/settings' && method === 'PUT') {
    store.db.settings = validateSettings(await readJson(req));
    await store.save();
    return sendJson(res, 200, { settings: store.db.settings });
  }

  if (pathname === '/api/checklists' && method === 'PUT') {
    store.db.checklists = validateChecklists(await readJson(req));
    await store.save();
    return sendJson(res, 200, { checklists: store.db.checklists });
  }

  const note = pathname.match(/^\/api\/report-notes\/(\d{4}-\d{2})$/);
  if (note && method === 'PUT') {
    store.db.reportNotes[note[1]] = { ...validateReportNote(await readJson(req)), updatedAt: nowIso(), updatedBy: user.displayName };
    await store.save();
    return sendJson(res, 200, { note: store.db.reportNotes[note[1]] });
  }

  /* ---- 添付ファイル（セキュリティ診断レポート等） ---- */
  if (pathname === '/api/attachments' && method === 'POST') {
    const body = await readJson(req, Math.ceil(LIMIT_ATTACHMENT * 1.4) + 4096);
    const name = String(body.name || '').replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').trim().slice(0, 150);
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    if (!name || !ATTACHMENT_TYPES[ext]) {
      throw new HttpError(400, `添付できるファイル形式は ${Object.keys(ATTACHMENT_TYPES).join(' / ')} です`);
    }
    if (typeof body.data !== 'string' || !/^[A-Za-z0-9+/=]*$/.test(body.data)) throw new HttpError(400, 'ファイルデータが正しくありません');
    const buf = Buffer.from(body.data, 'base64');
    if (!buf.length) throw new HttpError(400, '空のファイルは添付できません');
    if (buf.length > LIMIT_ATTACHMENT) throw new HttpError(413, '添付ファイルは15MBまでです');
    const meta = { id: newId(), name, size: buf.length, mime: ATTACHMENT_TYPES[ext], createdAt: nowIso(), createdBy: user.displayName };
    await writeFile(store.attachmentPath(meta.id), buf);
    store.db.attachments.push(meta);
    await store.save();
    return sendJson(res, 201, { attachment: meta });
  }

  const am = pathname.match(/^\/api\/attachments\/([a-z0-9-]+)$/);
  if (am && method === 'GET') {
    const meta = store.db.attachments.find((a) => a.id === am[1]);
    if (!meta) throw new HttpError(404, '添付ファイルが見つかりません');
    const buf = await readFile(store.attachmentPath(meta.id)).catch(() => null);
    if (!buf) throw new HttpError(404, '添付ファイルの実体が見つかりません');
    return send(res, 200, buf, {
      'Content-Type': meta.mime,
      'Content-Length': buf.length,
      // 常にダウンロード扱い（ブラウザ内で実行させない）
      'Content-Disposition': `attachment; filename="file.${meta.name.split('.').pop()}"; filename*=UTF-8''${encodeURIComponent(meta.name)}`
    });
  }

  /* ---- ユーザー管理 ---- */
  if (pathname === '/api/users' && method === 'GET') return sendJson(res, 200, { users: auth.listUsers() });
  if (pathname === '/api/users' && method === 'POST') {
    const created = await auth.createUser(await readJson(req));
    return sendJson(res, 201, { user: created });
  }
  const um = pathname.match(/^\/api\/users\/([a-z0-9-]+)$/);
  if (um && method === 'DELETE') {
    await auth.deleteUser(um[1], user.id);
    return sendJson(res, 200, { ok: true });
  }
  if (pathname === '/api/password' && method === 'POST') {
    const body = await readJson(req);
    await auth.changePassword(user.id, body.current, body.next);
    return sendJson(res, 200, { ok: true });
  }

  throw new HttpError(404, 'APIが見つかりません');
}

/* =========================================================
   サーバー起動
   ========================================================= */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await serveStatic(req, res, url.pathname);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'サーバー内部でエラーが発生しました' : err.message });
  }
});

await store.init();
await auth.init();

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log('============================================');
  console.log(' Webサイト管理システム を起動しました');
  console.log(` ブラウザで開く: http://${shown}:${PORT}/`);
  console.log(` データ保存先  : ${DATA_DIR}`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.log(' ※ 注意: このPC以外からも接続できる設定です。社内ネットワーク内でのみ使用してください。');
  }
  console.log(' 終了するには Ctrl + C を押してください');
  console.log('============================================');
});
