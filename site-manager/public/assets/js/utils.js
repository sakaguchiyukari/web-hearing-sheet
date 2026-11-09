/**
 * 汎用ユーティリティ（日付・HTMLエスケープ・書式）
 */

/* ---------- HTMLエスケープ ---------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** エスケープ済みHTMLを表すラッパー */
class SafeHtml {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new SafeHtml(String(s));

const toHtml = (v) => {
  if (v instanceof SafeHtml) return v.s;
  if (Array.isArray(v)) return v.map(toHtml).join('');
  if (v === null || v === undefined || v === false) return '';
  return escapeHtml(v);
};

/**
 * タグ付きテンプレート：埋め込み値を自動エスケープする
 * 例) html`<p>${userInput}</p>`
 */
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += toHtml(values[i]);
  });
  return raw(out);
}

/* ---------- 日付（YYYY-MM-DD 文字列で扱う） ---------- */
const pad = (n) => String(n).padStart(2, '0');

export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => toDateStr(new Date());
export const currentMonth = () => todayStr().slice(0, 7);

const toUtc = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** a から b までの日数（b が後なら正） */
export const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000);

export const addDays = (s, n) => {
  const d = new Date(toUtc(s) + n * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

export const formatDate = (s) => (s ? s.replace(/-/g, '/') : '—');

export const formatDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${toDateStr(d).replace(/-/g, '/')} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const monthLabel = (ym) => {
  const [y, m] = ym.split('-');
  return `${y}年${Number(m)}月`;
};

export const monthStart = (ym) => `${ym}-01`;

export const monthEnd = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
};

export const shiftMonth = (ym, diff) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + diff, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

/** 残り日数の表示文 */
export const daysLeftText = (days) => {
  if (days < 0) return `${Math.abs(days)}日超過`;
  if (days === 0) return '本日';
  return `あと${days}日`;
};

/* ---------- その他 ---------- */
export const formatYen = (n) => (n === null || n === undefined || n === '' ? '—' : `${Number(n).toLocaleString('ja-JP')}円`);

/** 日付文字列の新しい順に並べる比較関数 */
export const byDateDesc = (key) => (a, b) => (b[key] || '').localeCompare(a[key] || '') || (b.createdAt || '').localeCompare(a.createdAt || '');

export const debounce = (fn, ms = 200) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

/** 検索用：全角半角・大文字小文字の揺れを吸収 */
export const normalizeSearch = (s) => String(s ?? '').normalize('NFKC').toLowerCase();

export const matchesQuery = (q, ...fields) => {
  const nq = normalizeSearch(q).trim();
  if (!nq) return true;
  const hay = normalizeSearch(fields.join(' '));
  return nq.split(/\s+/).every((w) => hay.includes(w));
};

/** ファイルサイズ表示 */
export const formatBytes = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};
