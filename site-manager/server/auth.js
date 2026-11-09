/**
 * ログイン管理
 * - パスワードは scrypt でハッシュ化して保存（平文は保存しない）
 * - セッションはメモリ上で管理（サーバー再起動で再ログイン）
 */
import { scrypt as scryptCb, randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { HttpError } from './schema.js';

const scrypt = promisify(scryptCb);
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 最終操作から12時間
const MAX_FAILS = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const key = await scrypt(password, salt, 64);
  return { salt, hash: key.toString('hex') };
}

export function checkPasswordPolicy(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new HttpError(400, 'パスワードは8〜128文字で設定してください');
  }
}

export class Auth {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = { users: [] };
    this.sessions = new Map();
    this.fails = new Map();
  }

  async init() {
    if (existsSync(this.filePath)) this.data = JSON.parse(await readFile(this.filePath, 'utf8'));
    if (!Array.isArray(this.data.users)) this.data.users = [];
  }

  async persist() {
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(tmp, this.filePath);
  }

  hasUsers() {
    return this.data.users.length > 0;
  }

  publicUser(u) {
    return { id: u.id, username: u.username, displayName: u.displayName, createdAt: u.createdAt };
  }

  listUsers() {
    return this.data.users.map((u) => this.publicUser(u));
  }

  async createUser({ username, displayName, password }) {
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      throw new HttpError(400, 'ユーザー名は半角英数字と . _ - で3〜32文字にしてください');
    }
    if (this.data.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      throw new HttpError(400, 'そのユーザー名は既に使われています');
    }
    checkPasswordPolicy(password);
    const { salt, hash } = await hashPassword(password);
    const user = {
      id: randomUUID(),
      username,
      displayName: String(displayName || username).trim().slice(0, 50) || username,
      salt,
      hash,
      createdAt: new Date().toISOString()
    };
    this.data.users.push(user);
    await this.persist();
    return this.publicUser(user);
  }

  async deleteUser(id, currentUserId) {
    if (id === currentUserId) throw new HttpError(400, 'ログイン中のユーザーは削除できません');
    if (this.data.users.length <= 1) throw new HttpError(400, '最後のユーザーは削除できません');
    this.data.users = this.data.users.filter((u) => u.id !== id);
    for (const [token, s] of this.sessions) if (s.userId === id) this.sessions.delete(token);
    await this.persist();
  }

  /* ログイン失敗回数の制限（IP単位） */
  checkRateLimit(ip) {
    const rec = this.fails.get(ip);
    if (rec && Date.now() - rec.first < FAIL_WINDOW_MS && rec.count >= MAX_FAILS) {
      throw new HttpError(429, 'ログインの失敗が続いたため、しばらく時間をおいてから再度お試しください');
    }
  }

  recordFail(ip) {
    const rec = this.fails.get(ip);
    if (!rec || Date.now() - rec.first > FAIL_WINDOW_MS) this.fails.set(ip, { first: Date.now(), count: 1 });
    else rec.count += 1;
  }

  async verify(username, password, ip) {
    this.checkRateLimit(ip);
    const user = this.data.users.find((u) => u.username.toLowerCase() === String(username || '').toLowerCase());
    // ユーザーが存在しない場合も同程度の処理時間をかける
    const { hash } = await hashPassword(String(password || ''), user ? user.salt : 'dummy-salt-value');
    const ok = user && timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
    if (!ok) {
      this.recordFail(ip);
      throw new HttpError(401, 'ユーザー名またはパスワードが正しくありません');
    }
    this.fails.delete(ip);
    return user;
  }

  async changePassword(userId, current, next) {
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) throw new HttpError(404, 'ユーザーが見つかりません');
    const { hash } = await hashPassword(String(current || ''), user.salt);
    if (!timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'))) {
      throw new HttpError(400, '現在のパスワードが正しくありません');
    }
    checkPasswordPolicy(next);
    Object.assign(user, await hashPassword(next));
    await this.persist();
  }

  /* ---------- セッション ---------- */
  createSession(user) {
    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, { userId: user.id, expires: Date.now() + SESSION_TTL_MS });
    return token;
  }

  getUserBySession(token) {
    if (!token) return null;
    const s = this.sessions.get(token);
    if (!s) return null;
    if (s.expires < Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    const user = this.data.users.find((u) => u.id === s.userId);
    if (!user) return null;
    s.expires = Date.now() + SESSION_TTL_MS; // 操作のたびに延長
    return user;
  }

  destroySession(token) {
    this.sessions.delete(token);
  }
}
