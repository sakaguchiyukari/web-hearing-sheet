/**
 * アプリの状態（サーバーから取得した業務データ）
 */
import { api } from './api.js';
import { SITE_TYPES } from './labels.js';

export const state = {
  db: null,
  me: null
};

export async function loadDb() {
  state.db = await api('GET', '/api/db');
  return state.db;
}

export const siteById = (id) => state.db.sites.find((s) => s.id === id);
export const siteName = (id) => siteById(id)?.name ?? '（削除されたサイト）';

/** 運用中のサイト（並び順：種類→名前） */
export function activeSites(db = state.db) {
  const order = Object.keys(SITE_TYPES);
  return db.sites
    .filter((s) => s.active !== 'archived')
    .sort((a, b) => order.indexOf(a.siteType) - order.indexOf(b.siteType) || a.name.localeCompare(b.name, 'ja'));
}

/** すべてのサイト（運用終了を後ろに） */
export function allSitesSorted(db = state.db) {
  const archived = db.sites.filter((s) => s.active === 'archived').sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  return [...activeSites(db), ...archived];
}

/** セレクトボックス用のサイト選択肢 */
export const siteOptions = () => allSitesSorted().map((s) => ({
  value: s.id,
  label: s.active === 'archived' ? `${s.name}（運用終了）` : s.name
}));

/** 担当者の候補（設定の担当者一覧＋ログインユーザー） */
export function staffOptions() {
  const names = new Set(state.db.settings.staff || []);
  if (state.me?.displayName) names.add(state.me.displayName);
  return [...names];
}
