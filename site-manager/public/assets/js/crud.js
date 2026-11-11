/**
 * 一覧画面の共通部品（検索・絞り込み・テーブル・編集/削除ボタン）
 * 作業履歴・ToDo・バックアップ・セキュリティなど、同じ形の画面で再利用する。
 */
import { state } from './state.js';
import { html, raw, matchesQuery, debounce } from './utils.js';
import { table } from './ui.js';
import { openRecordEditor, deleteRecord } from './editors.js';

const filterStore = new Map();

/**
 * @param {HTMLElement} container 描画先
 * @param {object} cfg
 * @param {string} cfg.key 絞り込み条件の保存キー
 * @param {string} cfg.collection
 * @param {Array} cfg.filters [{ name, label, type: 'select'|'month', options: () => [{value,label}] }]
 * @param {(rec, f) => boolean} [cfg.match] 絞り込み判定
 * @param {(rec) => string[]} cfg.searchText 検索対象の文字列
 * @param {(a, b) => number} cfg.sort
 * @param {Array} cfg.columns テーブル列
 * @param {(rec) => string} cfg.label 削除確認で表示する名前
 * @param {object} [cfg.initial] 絞り込みの初期値
 */
export function mountCrudList(container, cfg) {
  if (!filterStore.has(cfg.key)) filterStore.set(cfg.key, { q: '', ...(cfg.initial || {}) });
  const f = filterStore.get(cfg.key);

  const rows = () => state.db[cfg.collection]
    .filter((r) => (!cfg.match || cfg.match(r, f)) && matchesQuery(f.q, ...cfg.searchText(r)))
    .sort(cfg.sort);

  const columns = [
    ...cfg.columns,
    {
      label: '操作',
      className: 'col-actions',
      render: (r) => html`<span class="btn-row">
        <button type="button" class="btn btn--ghost btn--sm" data-edit="${r.id}">編集</button>
        <button type="button" class="btn btn--danger-ghost btn--sm" data-delete="${r.id}">削除</button>
      </span>`
    }
  ];

  const renderTable = () => {
    const list = rows();
    return html`<p class="result-count">${list.length}件 / 全${state.db[cfg.collection].length}件</p>
      ${table(columns, list, { empty: cfg.empty || '条件に一致するデータはありません' })}`;
  };

  container.innerHTML = String(html`
    <form class="toolbar" role="search">
      <div class="toolbar__search">
        <label class="visually-hidden" for="${cfg.key}-q">キーワード検索</label>
        <input class="input" type="search" id="${cfg.key}-q" name="q" value="${f.q}" placeholder="${cfg.searchPlaceholder || 'キーワードで検索'}">
      </div>
      ${(cfg.filters || []).map((flt) => html`
        <label class="toolbar__select"><span class="toolbar__label">${flt.label}</span>
          ${flt.type === 'month'
            ? html`<input class="input" type="month" name="${flt.name}" value="${f[flt.name] || ''}">`
            : html`<select class="input input--select" name="${flt.name}">
                <option value="">すべて</option>
                ${flt.options().map((o) => html`<option value="${o.value}"${f[flt.name] === o.value ? raw(' selected') : ''}>${o.label}</option>`)}
              </select>`}
        </label>`)}
    </form>
    <div class="crud-table">${renderTable()}</div>`);

  const form = container.querySelector('form');
  const box = container.querySelector('.crud-table');
  const update = () => {
    f.q = form.q.value;
    (cfg.filters || []).forEach((flt) => { f[flt.name] = form.elements[flt.name].value; });
    box.innerHTML = String(renderTable());
  };
  form.addEventListener('input', debounce(update, 150));
  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => e.preventDefault());

  box.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const find = (id) => state.db[cfg.collection].find((r) => r.id === id);
    if (t.dataset.edit) openRecordEditor(cfg.collection, find(t.dataset.edit));
    if (t.dataset.delete) {
      const rec = find(t.dataset.delete);
      deleteRecord(cfg.collection, rec, cfg.label(rec));
    }
    if (t.dataset.view && cfg.onView) cfg.onView(find(t.dataset.view));
  });
}

/** 絞り込み条件を外部から設定（例：サイト詳細から遷移したとき） */
export function setCrudFilter(key, values) {
  filterStore.set(key, { q: '', ...(filterStore.get(key) || {}), ...values });
}

/** サイトの絞り込み選択肢 */
export const siteFilterOptions = () => state.db.sites
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  .map((s) => ({ value: s.id, label: s.name }));

/** { key: label } 形式を選択肢に変換 */
export const mapOptions = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));
