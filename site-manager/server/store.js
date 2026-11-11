/**
 * データ保存（JSONファイル）
 * - 書き込みは一時ファイル → リネームで行い、途中で落ちてもファイルが壊れにくくする
 * - 1日1回＋重要操作の前に data/backups/ へ自動スナップショット
 */
import { mkdir, readFile, writeFile, rename, readdir, copyFile, unlink, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { COLLECTIONS } from './schema.js';
import { DEFAULT_SETTINGS, DEFAULT_CHECKLISTS, initialSites } from './seed.js';

export const DB_VERSION = 2;
const SNAPSHOT_KEEP = 30;

export const newId = () => randomUUID();
export const nowIso = () => new Date().toISOString();

/** 空のDB構造（欠けている項目を補うのにも使う） */
export function emptyDb() {
  const db = { version: DB_VERSION, settings: { ...DEFAULT_SETTINGS }, checklists: structuredClone(DEFAULT_CHECKLISTS), reportNotes: {}, attachments: [] };
  for (const name of Object.keys(COLLECTIONS)) db[name] = [];
  return db;
}

/* v1 の標準チェック項目ID（v2 の標準項目に置き換える対象） */
const V1_ITEM_IDS = [
  'wp-core', 'wp-theme', 'wp-plugins', 'wp-unused-plugins', 'wp-admin-accounts', 'wp-2fa', 'wp-login-history', 'wp-display', 'wp-form', 'wp-backup', 'wp-security-report',
  'st-display', 'st-links', 'st-form', 'st-ssl', 'st-server-contract', 'st-backup', 'st-security-report',
  'bc-display', 'bc-login', 'bc-form', 'bc-server-payment', 'bc-vendor-maintenance', 'bc-vendor-questions', 'bc-backup-restore', 'bc-security-report',
  'ot-display', 'ot-form', 'ot-ssl', 'ot-backup', 'ot-security-report'
];

/**
 * 旧バージョンのデータを現在の形に変換する
 * v1 → v2：契約・支払い管理を廃止、チェック項目に分類を追加してセキュリティ特化の項目へ入れ替え
 */
export function migrateDb(input) {
  const version = Number(input.version) || 1;
  if (version >= DB_VERSION) return input;
  const db = { ...input };
  delete db.contracts;
  if (db.settings && db.settings.domainAlertDays === undefined) {
    db.settings = { ...db.settings, domainAlertDays: db.settings.contractAlertDays ?? DEFAULT_SETTINGS.domainAlertDays };
    delete db.settings.contractAlertDays;
  }
  // 新しい標準項目を使い、利用者が独自に追加していた項目（IDが標準にないもの）は末尾に残す
  const old = db.checklists || {};
  db.checklists = Object.fromEntries(Object.entries(DEFAULT_CHECKLISTS).map(([type, defaults]) => {
    const known = new Set([...V1_ITEM_IDS, ...defaults.map((it) => it.id)]);
    const custom = (old[type] || []).filter((it) => it && it.id && !known.has(it.id)).map((it) => ({ category: 'other', ...it }));
    return [type, [...structuredClone(defaults), ...custom]];
  }));
  return db;
}

/** 読み込んだDBに不足している項目を補う（将来の項目追加にも対応） */
export function normalizeDb(input) {
  const base = emptyDb();
  const db = { ...base, ...input };
  db.version = DB_VERSION;
  db.settings = { ...base.settings, ...(input.settings || {}) };
  db.checklists = { ...base.checklists, ...(input.checklists || {}) };
  db.reportNotes = input.reportNotes && typeof input.reportNotes === 'object' ? input.reportNotes : {};
  for (const name of [...Object.keys(COLLECTIONS), 'attachments']) {
    db[name] = Array.isArray(input[name]) ? input[name] : [];
  }
  return db;
}

export class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.dbPath = path.join(dataDir, 'db.json');
    this.attachmentsDir = path.join(dataDir, 'attachments');
    this.backupsDir = path.join(dataDir, 'backups');
    this.db = null;
    this.writeChain = Promise.resolve();
    this.lastDailySnapshot = '';
  }

  async init() {
    await mkdir(this.attachmentsDir, { recursive: true });
    await mkdir(this.backupsDir, { recursive: true });
    if (existsSync(this.dbPath)) {
      const raw = JSON.parse(await readFile(this.dbPath, 'utf8'));
      const needsMigration = (Number(raw.version) || 1) < DB_VERSION;
      if (needsMigration) await this.snapshot(`before-v${DB_VERSION}`);
      this.db = normalizeDb(migrateDb(raw));
      if (needsMigration) await this.save();
    } else {
      this.db = emptyDb();
      const now = nowIso();
      this.db.sites = initialSites().map((s) => ({
        ...Object.fromEntries(Object.keys(COLLECTIONS.sites.fields).map((k) => [k, ''])),
        active: 'active',
        sslStatus: 'unchecked',
        ...s,
        id: newId(),
        createdAt: now,
        updatedAt: now
      }));
      await this.save();
    }
    await this.cleanupOrphanAttachments(24 * 60 * 60 * 1000);
  }

  /** 現在のDBをファイルへ保存（直列化して競合を防ぐ） */
  save() {
    this.writeChain = this.writeChain.then(async () => {
      await this.dailySnapshot();
      const tmp = `${this.dbPath}.tmp`;
      await writeFile(tmp, JSON.stringify(this.db, null, 2), 'utf8');
      await rename(tmp, this.dbPath);
    });
    return this.writeChain;
  }

  async dailySnapshot() {
    const day = new Date().toISOString().slice(0, 10);
    if (this.lastDailySnapshot === day) return;
    this.lastDailySnapshot = day;
    const files = await readdir(this.backupsDir).catch(() => []);
    if (!files.some((f) => f.startsWith(`db-${day}`))) await this.snapshot('daily');
  }

  /** db.json を data/backups/ に複製する */
  async snapshot(label) {
    if (!existsSync(this.dbPath)) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = `db-${stamp}-${label}.json`;
    await copyFile(this.dbPath, path.join(this.backupsDir, name));
    await this.pruneSnapshots();
    return name;
  }

  async pruneSnapshots() {
    const files = (await readdir(this.backupsDir)).filter((f) => f.startsWith('db-') && f.endsWith('.json')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - SNAPSHOT_KEEP))) {
      await unlink(path.join(this.backupsDir, f)).catch(() => {});
    }
  }

  async listSnapshots() {
    const files = (await readdir(this.backupsDir).catch(() => [])).filter((f) => f.endsWith('.json')).sort().reverse();
    return Promise.all(files.map(async (f) => ({ name: f, size: (await stat(path.join(this.backupsDir, f))).size })));
  }

  /* ---------- 添付ファイル ---------- */
  attachmentPath(id) {
    return path.join(this.attachmentsDir, `${id}.bin`);
  }

  referencedAttachmentIds() {
    return new Set(this.db.securityReports.flatMap((r) => r.attachments || []));
  }

  async deleteAttachment(id) {
    this.db.attachments = this.db.attachments.filter((a) => a.id !== id);
    await unlink(this.attachmentPath(id)).catch(() => {});
  }

  /** どの記録からも参照されていない古い添付を削除 */
  async cleanupOrphanAttachments(olderThanMs) {
    const used = this.referencedAttachmentIds();
    const limit = Date.now() - olderThanMs;
    const orphans = this.db.attachments.filter((a) => !used.has(a.id) && Date.parse(a.createdAt) < limit);
    for (const a of orphans) await this.deleteAttachment(a.id);
    if (orphans.length) await this.save();
  }
}
