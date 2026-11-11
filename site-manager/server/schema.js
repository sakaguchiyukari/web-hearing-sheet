/**
 * 入力検証（スキーマ定義）
 * クライアントから送られた値は必ずここを通し、定義外の項目は保存しない。
 */
import * as L from '../public/assets/js/labels.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https?:\/\/[^\s<>"']+$/i;
const ID_RE = /^[a-z0-9-]{1,64}$/i;

/* ---------- フィールド定義のヘルパー ---------- */
const str = (label, max = 200, opt = {}) => ({ kind: 'string', label, max, ...opt });
const text = (label, max = 5000, opt = {}) => ({ kind: 'string', label, max, multiline: true, ...opt });
const date = (label, opt = {}) => ({ kind: 'date', label, ...opt });
const oneOf = (label, map, def, opt = {}) => ({ kind: 'enum', label, values: Object.keys(map), default: def, ...opt });
const num = (label, min, max, opt = {}) => ({ kind: 'number', label, min, max, ...opt });
const ref = (label, collection, opt = {}) => ({ kind: 'ref', label, collection, ...opt });
const refs = (label, collection, opt = {}) => ({ kind: 'refs', label, collection, ...opt });
const url = (label, opt = {}) => ({ kind: 'url', label, max: 500, ...opt });

/* ---------- コレクション定義 ---------- */
export const COLLECTIONS = {
  sites: {
    label: 'サイト',
    fields: {
      name: str('サイト名', 100, { required: true }),
      domain: str('ドメイン', 253),
      url: url('サイトのURL'),
      siteType: oneOf('サイトの種類', L.SITE_TYPES, 'wordpress', { required: true }),
      cmsName: str('CMSの種類', 100),
      wpTheme: str('WordPressテーマ', 100),
      active: oneOf('運用状況', L.SITE_ACTIVE, 'active'),
      serverCompany: str('レンタルサーバー会社', 100),
      serverContract: text('サーバー情報', 1000),
      domainRegistrar: str('ドメイン管理会社', 100),
      domainExpiry: date('ドメインの有効期限'),
      domainContract: text('ドメイン情報', 1000),
      sslStatus: oneOf('SSL証明書の確認状況', L.SSL_STATUS, 'unchecked'),
      sslExpiry: date('SSL証明書の有効期限'),
      sslCheckedDate: date('SSL確認日'),
      manager: str('サイトの管理担当者', 100),
      vendor: str('制作会社・保守会社', 200),
      vendorScope: text('制作会社の担当範囲', 2000),
      ownScope: text('自社担当者の担当範囲', 2000),
      lastInspectionManual: date('最終点検日（システム導入前の記録）'),
      nextInspectionDate: date('次回点検予定日'),
      notes: text('備考')
    }
  },
  inspections: {
    label: '点検記録',
    fields: {
      siteId: ref('対象サイト', 'sites', { required: true }),
      date: date('点検日', { required: true }),
      inspector: str('担当者', 100, { required: true }),
      items: { kind: 'items', label: '点検項目' },
      summary: text('全体コメント', 3000)
    }
  },
  worklogs: {
    label: '作業履歴',
    fields: {
      siteId: ref('対象サイト', 'sites', { required: true }),
      occurredDate: date('発生日', { required: true }),
      kind: oneOf('区分', L.WORK_KIND, 'work'),
      workContent: text('作業内容', 3000),
      troubleContent: text('トラブル内容', 3000),
      cause: text('原因', 3000),
      action: text('対応内容', 3000),
      assignee: str('対応担当者', 100),
      status: oneOf('対応状況', L.WORK_STATUS, 'open'),
      priority: oneOf('優先度', L.PRIORITY, 'normal'),
      completedDate: date('完了日'),
      notes: text('備考', 3000)
    }
  },
  securityServices: {
    label: 'セキュリティ診断サービス',
    fields: {
      name: str('診断サービス名', 200, { required: true }),
      provider: str('提供会社', 200),
      contractInfo: text('契約内容', 2000),
      targetSiteIds: refs('診断対象サイト', 'sites'),
      targetDomains: text('その他の対象ドメイン', 2000),
      scope: text('診断内容・範囲', 2000),
      notes: text('備考', 3000)
    }
  },
  securityReports: {
    label: 'セキュリティ診断結果',
    fields: {
      serviceId: ref('診断サービス', 'securityServices', { required: true }),
      siteId: ref('対象サイト', 'sites', { required: true }),
      diagnosisDate: date('最終診断日'),
      receivedDate: date('レポート受領日'),
      result: oneOf('診断結果', L.SEC_RESULT, 'unchecked'),
      findings: text('指摘事項', 5000),
      severity: oneOf('重要度', L.SEVERITY, 'none'),
      responseStatus: oneOf('対応状況', L.RESPONSE_STATUS, 'unchecked'),
      responseDetail: text('対応内容', 5000),
      nextCheckDate: date('次回確認日'),
      attachments: { kind: 'attachments', label: '添付ファイル' },
      notes: text('備考', 3000)
    }
  },
  serverScans: {
    label: '不正ファイル検査',
    fields: {
      siteId: ref('対象サイト', 'sites', { required: true }),
      scanDate: date('検査日', { required: true }),
      method: str('検査方法・ツール', 200),
      scope: text('検査範囲', 2000),
      result: oneOf('検査結果', L.SCAN_RESULT, 'unchecked'),
      detail: text('検出内容', 3000),
      action: text('対応内容', 3000),
      status: oneOf('対応状況', L.SCAN_STATUS, 'na'),
      inspector: str('担当者', 100),
      nextDate: date('次回検査予定日'),
      notes: text('備考', 3000)
    }
  },
  backups: {
    label: 'バックアップ記録',
    fields: {
      siteId: ref('対象サイト', 'sites', { required: true }),
      kind: oneOf('バックアップの種類', L.BACKUP_KIND, 'wordpress', { required: true }),
      backupDate: date('最終バックアップ日'),
      method: str('バックアップ方法', 200),
      location: str('保存場所', 300),
      fileName: str('保存ファイル名', 300),
      target: text('バックアップ対象', 1000),
      restoreVerified: oneOf('復元方法の確認', L.RESTORE_VERIFIED, 'unknown'),
      restoreTestDate: date('復元テスト実施日'),
      notes: text('備考', 3000)
    }
  },
  todos: {
    label: 'ToDo',
    fields: {
      title: str('やること', 200, { required: true }),
      siteId: ref('対象サイト', 'sites'),
      category: oneOf('分類', L.CHECK_CATEGORIES, 'other'),
      priority: oneOf('優先度', L.PRIORITY, 'normal'),
      status: oneOf('状況', L.TODO_STATUS, 'open'),
      dueDate: date('期限'),
      assignee: str('担当者', 100),
      detail: text('詳細・手順', 3000),
      source: str('登録元', 100),
      completedDate: date('完了日'),
      notes: text('対応メモ', 3000)
    }
  }
};

/* ---------- 値の正規化・検証 ---------- */

// 制御文字（改行・タブ以外）を除去
const cleanText = (s, multiline) => {
  const v = s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return multiline ? v.trim() : v.replace(/\n/g, ' ').trim();
};

export const isValidDate = (s) => {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

function validateField(name, spec, value, db, opts) {
  const fail = (msg) => { throw new HttpError(400, `「${spec.label}」${msg}`); };

  switch (spec.kind) {
    case 'string': {
      if (value === undefined || value === null) value = '';
      if (typeof value !== 'string') fail('の形式が正しくありません');
      const v = cleanText(value, spec.multiline);
      if (v.length > spec.max) fail(`は${spec.max}文字以内で入力してください`);
      if (spec.required && !v) fail('は必須です');
      return v;
    }
    case 'url': {
      const v = typeof value === 'string' ? value.trim() : '';
      if (!v) { if (spec.required) fail('は必須です'); return ''; }
      if (v.length > spec.max || !URL_RE.test(v)) fail('は http:// または https:// から始まるURLで入力してください');
      return v;
    }
    case 'date': {
      const v = typeof value === 'string' ? value.trim() : '';
      if (!v) { if (spec.required) fail('は必須です'); return ''; }
      if (!isValidDate(v)) fail('の日付が正しくありません');
      return v;
    }
    case 'enum': {
      if (value === undefined || value === null || value === '') return spec.default;
      if (!spec.values.includes(value)) fail('の選択値が正しくありません');
      return value;
    }
    case 'number': {
      if (value === undefined || value === null || value === '') return null;
      const n = Number(value);
      if (!Number.isFinite(n) || n < spec.min || n > spec.max) fail('の数値が正しくありません');
      return n;
    }
    case 'ref': {
      if (typeof value !== 'string' || !value) { if (spec.required) fail('を選択してください'); return ''; }
      if (!ID_RE.test(value)) fail('の値が正しくありません');
      if (!opts.skipRefs && !db[spec.collection].some((r) => r.id === value)) fail('が見つかりません');
      return value;
    }
    case 'refs': {
      if (value === undefined || value === null) return [];
      if (!Array.isArray(value) || value.length > 500) fail('の形式が正しくありません');
      const ids = [...new Set(value.filter((v) => typeof v === 'string' && ID_RE.test(v)))];
      return opts.skipRefs ? ids : ids.filter((id) => db[spec.collection].some((r) => r.id === id));
    }
    case 'items': {
      if (value === undefined || value === null) return [];
      if (!Array.isArray(value) || value.length > 100) fail('の形式が正しくありません');
      return value.map((it) => {
        if (!it || typeof it !== 'object') fail('の形式が正しくありません');
        const label = cleanText(String(it.label ?? ''), false).slice(0, 200);
        if (!label) fail('の項目名が空です');
        const result = Object.hasOwn(L.RESULTS, it.result) ? it.result : 'unchecked';
        return {
          itemId: String(it.itemId ?? '').replace(/[^a-z0-9-]/gi, '').slice(0, 64),
          category: Object.hasOwn(L.CHECK_CATEGORIES, it.category) ? it.category : 'other',
          label,
          result,
          comment: cleanText(String(it.comment ?? ''), true).slice(0, 1000)
        };
      });
    }
    case 'attachments': {
      if (value === undefined || value === null) return [];
      if (!Array.isArray(value) || value.length > 30) fail('の形式が正しくありません');
      const ids = [...new Set(value.filter((v) => typeof v === 'string' && ID_RE.test(v)))];
      return opts.skipRefs ? ids : ids.filter((id) => db.attachments.some((a) => a.id === id));
    }
    default:
      throw new HttpError(500, `未定義のフィールド種別: ${name}`);
  }
}

/** レコードを検証し、定義済みの項目だけを持つオブジェクトを返す */
export function validateRecord(collection, input, db, opts = {}) {
  const def = COLLECTIONS[collection];
  if (!def) throw new HttpError(404, '対象のデータ種別が存在しません');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, '入力データが正しくありません');
  const out = {};
  for (const [name, spec] of Object.entries(def.fields)) {
    out[name] = validateField(name, spec, input[name], db, opts);
  }
  return out;
}

/* ---------- 設定 ---------- */
const intIn = (v, min, max, label) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `「${label}」は${min}〜${max}の整数で入力してください`);
  return n;
};

export function validateSettings(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, '入力データが正しくありません');
  const staff = Array.isArray(input.staff) ? input.staff : [];
  return {
    orgName: cleanText(String(input.orgName ?? ''), false).slice(0, 100),
    staff: [...new Set(staff.map((s) => cleanText(String(s), false).slice(0, 100)).filter(Boolean))].slice(0, 100),
    inspectionIntervalDays: intIn(input.inspectionIntervalDays, 1, 366, '点検間隔'),
    backupStaleDays: intIn(input.backupStaleDays, 1, 366, 'バックアップ警告日数'),
    sslAlertDays: intIn(input.sslAlertDays, 1, 366, 'SSL期限の警告日数'),
    // 旧バージョンのデータ（contractAlertDays）からも読み込めるようにする
    domainAlertDays: intIn(input.domainAlertDays ?? input.contractAlertDays ?? 60, 1, 366, 'ドメイン期限の警告日数')
  };
}

export function validateChecklists(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, '入力データが正しくありません');
  const out = {};
  for (const type of Object.keys(L.SITE_TYPES)) {
    const list = Array.isArray(input[type]) ? input[type] : [];
    if (list.length > 60) throw new HttpError(400, '点検項目は1種類あたり60件までです');
    out[type] = list.map((it) => ({
      id: String(it?.id ?? '').replace(/[^a-z0-9-]/gi, '').slice(0, 64),
      category: Object.hasOwn(L.CHECK_CATEGORIES, it?.category) ? it.category : 'other',
      label: cleanText(String(it?.label ?? ''), false).slice(0, 200),
      hint: cleanText(String(it?.hint ?? ''), false).slice(0, 300)
    })).filter((it) => it.id && it.label);
  }
  return out;
}

export function validateReportNote(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, '入力データが正しくありません');
  const reportDate = typeof input.reportDate === 'string' && isValidDate(input.reportDate) ? input.reportDate : '';
  return {
    reportDate,
    author: cleanText(String(input.author ?? ''), false).slice(0, 100),
    plans: cleanText(String(input.plans ?? ''), true).slice(0, 5000),
    special: cleanText(String(input.special ?? ''), true).slice(0, 5000)
  };
}
