/**
 * 日常点検（一覧・入力・閲覧）
 * 点検項目はサイトの種類ごとのテンプレート（設定画面で編集可）から作られる。
 * 点検記録には項目名をそのまま保存するため、テンプレートを変更しても過去の記録は変わらない。
 */
import { api } from '../api.js';
import { state, siteById, siteOptions, staffOptions, allSitesSorted } from '../state.js';
import { html, raw, todayStr, addDays, formatDate, matchesQuery, debounce } from '../utils.js';
import * as L from '../labels.js';
import { countResults } from '../status.js';
import { pageHeader, badge, resultBadge, table, openFormModal, openViewModal, toast, confirmDialog, multiline } from '../ui.js';
import { renderFields, readFields, detectSecrets } from '../form.js';
import { notifyChanged, deleteRecord, siteLink, createTodo } from '../editors.js';

/** 結果の件数をバッジで表示 */
export function inspectionSummary(r) {
  const c = countResults(r.items);
  const order = ['check', 'progress', 'unchecked', 'ok', 'done', 'na'];
  const parts = order.filter((k) => c[k]).map((k) => html`<span class="badge badge--${L.RESULT_TONE[k]}">${L.RESULTS[k]} ${c[k]}</span>`);
  return parts.length ? html`<span class="badge-row">${parts}</span>` : html`<span class="text-muted">項目なし</span>`;
}

/* =========================================================
   入力フォーム
   ========================================================= */
let customSeq = 0;

const resultSelect = (value) => html`<select class="input input--select input--sm insp-item__result" data-tone="${L.RESULT_TONE[value]}" aria-label="点検結果">
  ${Object.entries(L.RESULTS).map(([v, l]) => html`<option value="${v}"${v === value ? raw(' selected') : ''}>${l}</option>`)}
</select>`;

function itemRow(item, hint = '') {
  const custom = item.itemId.startsWith('custom-');
  return html`<li class="insp-item" data-item-id="${item.itemId}" data-category="${item.category || 'other'}">
    <div class="insp-item__label">
      ${custom
        ? html`<input class="input input--sm insp-item__label-input" type="text" value="${item.label}" maxlength="200" required placeholder="点検項目名を入力" aria-label="追加した点検項目名">`
        : html`<span class="insp-item__name" data-label="${item.label}">${item.label}</span>${hint ? html`<span class="insp-item__hint">${hint}</span>` : ''}`}
    </div>
    ${resultSelect(item.result || 'unchecked')}
    <input class="input input--sm insp-item__comment" type="text" value="${item.comment || ''}" maxlength="1000" placeholder="コメント（任意）" aria-label="${item.label} のコメント">
    ${custom ? html`<button type="button" class="btn btn--ghost btn--sm insp-item__remove" aria-label="この項目を削除">削除</button>` : ''}
  </li>`;
}

/** サイト種類のテンプレートから点検項目を作る（初期値は必ず「未確認」） */
function templateItems(siteType) {
  return (state.db.checklists[siteType] || []).map((t) => ({ itemId: t.id, category: t.category || 'other', label: t.label, result: 'unchecked', comment: '', hint: t.hint }));
}

/** 分類ごとに見出しを付けて並べる */
function groupByCategory(items) {
  return Object.keys(L.CHECK_CATEGORIES)
    .map((key) => ({ key, label: L.CHECK_CATEGORIES[key], items: items.filter((it) => (it.category || 'other') === key) }))
    .filter((g) => g.items.length);
}

function renderItems(items) {
  return html`${groupByCategory(items).map((g) => html`
    <li class="insp-group" data-group="${g.key}"><span class="insp-group__title">${g.label}</span><span class="insp-group__count">${g.items.length}項目</span></li>
    ${g.items.map((it) => itemRow(it, it.hint))}`)}`;
}

/** 確認済みの項目数を表示 */
function updateProgress(form) {
  const all = [...form.querySelectorAll('.insp-item__result')];
  const checked = all.filter((s) => s.value !== 'unchecked').length;
  const box = form.querySelector('#insp-progress');
  if (!box) return;
  box.textContent = all.length ? `確認済み ${checked} / ${all.length} 項目` : '';
  const bar = form.querySelector('#insp-progress-bar');
  if (bar) {
    bar.max = all.length || 1;
    bar.value = checked;
  }
}

function readItems(form) {
  return [...form.querySelectorAll('.insp-item')].map((li) => ({
    itemId: li.dataset.itemId,
    category: li.dataset.category || 'other',
    label: li.querySelector('.insp-item__label-input')?.value.trim() || li.querySelector('.insp-item__name')?.dataset.label || '',
    result: li.querySelector('.insp-item__result').value,
    comment: li.querySelector('.insp-item__comment').value.trim()
  }));
}

const baseFields = () => [
  { name: 'siteId', label: '対象サイト', type: 'select', required: true, emptyLabel: '選択してください', options: siteOptions() },
  { name: 'date', label: '点検日', type: 'date', required: true, max: todayStr() },
  { name: 'inspector', label: '担当者', type: 'text', required: true, maxlength: 100, list: staffOptions(), placeholder: '例）山田' }
];

const summaryField = [{ name: 'summary', label: '全体コメント', type: 'textarea', maxlength: 3000, placeholder: '気づいた点・申し送り事項など' }];

/**
 * 点検の入力フォームを開く
 * @param {object|null} record 既存の点検記録（編集時）
 */
export function openInspectionEditor(record = null, presets = {}) {
  if (!state.db.sites.length) {
    toast('先にサイトを登録してください', 'error');
    return;
  }
  const values = record ? { ...record } : { date: todayStr(), inspector: state.me?.displayName || '', ...presets };
  const site = siteById(values.siteId);
  const items = record ? record.items : site ? templateItems(site.siteType) : [];
  const interval = state.db.settings.inspectionIntervalDays;

  openFormModal({
    title: record ? '点検記録を編集' : 'セキュリティ点検',
    wide: true,
    submitLabel: '点検記録を保存',
    body: html`
      <p class="form-note">結果は初期状態で「未確認」です。実際に確認した項目だけ結果を選んでください。未確認のまま保存しても「問題なし」にはなりません。</p>
      ${renderFields(baseFields(), values)}
      <div class="insp-head">
        <h3 class="form-section-title">点検項目</h3>
        <p class="insp-head__type" id="insp-type">${site ? `${L.SITE_TYPES[site.siteType]}の点検項目` : 'サイトを選ぶと点検項目が表示されます'}</p>
      </div>
      <div class="insp-progress">
        <progress class="insp-progress__bar" id="insp-progress-bar" value="0" max="1"></progress>
        <span class="insp-progress__text" id="insp-progress" aria-live="polite"></span>
      </div>
      <div class="insp-legend" aria-hidden="true">
        <span>項目</span><span>結果</span><span>コメント</span>
      </div>
      <ul class="insp-items" id="insp-items">${renderItems(items)}</ul>
      <button type="button" class="btn btn--ghost btn--sm" id="add-custom-item">＋ 項目を追加（今回のみ）</button>
      ${renderFields(summaryField, values)}
      ${record ? '' : html`<div class="form-grid">
        <div class="field">
          <span class="field__label">ToDoへの登録</span>
          <label class="check"><input class="check__input" type="checkbox" name="createTodos" checked><span class="check__label">「要確認」「対応中」の項目をToDoに登録する</span></label>
          <p class="field__help">同じ内容の未完了ToDoが既にある場合は重複登録しません</p>
        </div>
        <div class="field">
          <label class="field__label" for="next-insp">サイトの次回点検予定日を更新</label>
          <input class="input" type="date" id="next-insp" name="nextInspectionDate" value="${addDays(values.date, interval)}">
          <p class="field__help">空欄にすると更新しません（初期値は点検日の${interval}日後）</p>
        </div>
      </div>`}`,
    onOpen: (form) => {
      const list = form.querySelector('#insp-items');
      // サイト変更で点検項目を入れ替え（新規時のみ）
      form.siteId.addEventListener('change', async () => {
        const s = siteById(form.siteId.value);
        if (record) return;
        if (list.querySelector('.insp-item__result:not([data-tone="grey"])')) {
          const ok = await confirmDialog('サイトを変更すると入力中の結果がリセットされます。よろしいですか？');
          if (!ok) return;
        }
        list.innerHTML = s ? String(renderItems(templateItems(s.siteType))) : '';
        form.querySelector('#insp-type').textContent = s ? `${L.SITE_TYPES[s.siteType]}の点検項目` : 'サイトを選ぶと点検項目が表示されます';
        updateProgress(form);
      });
      updateProgress(form);
      form.date.addEventListener('change', () => {
        const next = form.querySelector('#next-insp');
        if (next && form.date.value) next.value = addDays(form.date.value, interval);
      });
      // 結果の色を更新
      list.addEventListener('change', (e) => {
        if (e.target.classList.contains('insp-item__result')) {
          e.target.dataset.tone = L.RESULT_TONE[e.target.value];
          updateProgress(form);
        }
      });
      list.addEventListener('click', (e) => {
        if (e.target.classList.contains('insp-item__remove')) {
          e.target.closest('.insp-item').remove();
          updateProgress(form);
        }
      });
      form.querySelector('#add-custom-item').addEventListener('click', () => {
        customSeq += 1;
        list.insertAdjacentHTML('beforeend', String(itemRow({ itemId: `custom-${Date.now()}-${customSeq}`, label: '', result: 'unchecked', comment: '' })));
        list.querySelector('.insp-item:last-child .insp-item__label-input').focus();
        updateProgress(form);
      });
    },
    onSubmit: async (form) => {
      const data = { ...(record || {}), ...readFields(form, [...baseFields(), ...summaryField]), items: readItems(form) };
      if (!data.items.length) throw new Error('点検項目がありません。設定画面で点検項目を登録してください。');
      const secrets = detectSecrets({ summary: data.summary, comments: data.items.map((i) => i.comment).join('\n') },
        [{ name: 'summary', label: '全体コメント' }, { name: 'comments', label: '項目コメント' }]);
      if (secrets.length && !(await confirmDialog('秘密情報（パスワード等）らしき記述があります。このまま保存しますか？', { detail: `対象：${secrets.join('、')}`, okLabel: 'このまま保存' }))) return false;

      const unchecked = data.items.filter((i) => i.result === 'unchecked').length;
      if (unchecked && !(await confirmDialog(`「未確認」の項目が${unchecked}件あります。このまま保存しますか？`, { detail: '未確認の項目はダッシュボードで「未確認」として表示されます。', okLabel: '保存する' }))) return false;

      if (record) await api('PUT', `/api/c/inspections/${record.id}`, data);
      else await api('POST', '/api/c/inspections', data);

      // 次回点検予定日をサイトに反映
      const next = form.querySelector('#next-insp')?.value;
      if (!record && next) {
        const s = siteById(data.siteId);
        await api('PUT', `/api/c/sites/${s.id}`, { ...s, nextInspectionDate: next });
      }
      // 要確認・対応中の項目をToDoに登録（同じ内容の未完了ToDoがあれば登録しない）
      let created = 0;
      if (!record && form.createTodos?.checked) {
        for (const it of data.items.filter((i) => i.result === 'check' || i.result === 'progress')) {
          const title = `${it.label}（点検で${L.RESULTS[it.result]}）`;
          const exists = state.db.todos.some((t) => t.siteId === data.siteId && t.status !== 'done' && t.title.startsWith(it.label));
          if (exists) continue;
          await createTodo({ title, siteId: data.siteId, category: it.category, status: it.result === 'progress' ? 'progress' : 'open', detail: it.comment, source: `セキュリティ点検 ${formatDate(data.date)}`, assignee: data.inspector });
          created += 1;
        }
      }
      toast(created ? `点検記録を保存し、ToDoを${created}件登録しました` : '点検記録を保存しました');
      await notifyChanged();
      return true;
    }
  });
}

/** 点検記録の閲覧 */
export function openInspectionView(id) {
  const r = state.db.inspections.find((x) => x.id === id);
  if (!r) return;
  openViewModal(`点検記録：${formatDate(r.date)}`, html`
    <dl class="info-list info-list--inline">
      <div class="info-list__row"><dt class="info-list__term">対象サイト</dt><dd class="info-list__desc">${siteById(r.siteId)?.name || '—'}</dd></div>
      <div class="info-list__row"><dt class="info-list__term">点検日</dt><dd class="info-list__desc">${formatDate(r.date)}</dd></div>
      <div class="info-list__row"><dt class="info-list__term">担当者</dt><dd class="info-list__desc">${r.inspector}</dd></div>
    </dl>
    ${table([
      { label: '分類', render: (it) => L.CHECK_CATEGORIES[it.category] || 'その他' },
      { label: '点検項目', render: (it) => it.label },
      { label: '結果', render: (it) => resultBadge(it.result) },
      { label: 'コメント', render: (it) => it.comment || '—' }
    ], r.items)}
    <h3 class="form-section-title">全体コメント</h3>
    <p>${multiline(r.summary)}</p>`);
}

/* =========================================================
   一覧
   ========================================================= */
const filters = { siteId: '', month: '', result: '', q: '' };

function filtered() {
  return state.db.inspections
    .filter((r) => (!filters.siteId || r.siteId === filters.siteId)
      && (!filters.month || r.date.startsWith(filters.month))
      && (!filters.result || r.items.some((i) => i.result === filters.result))
      && matchesQuery(filters.q, siteById(r.siteId)?.name, r.inspector, r.summary, r.items.map((i) => `${i.label} ${i.comment}`).join(' ')))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function listTable() {
  const rows = filtered();
  return html`<p class="result-count">${rows.length}件</p>
  ${table([
    { label: '点検日', render: (r) => html`<button type="button" class="link link--button" data-view="${r.id}">${formatDate(r.date)}</button>` },
    { label: 'サイト', render: (r) => siteLink(r.siteId) },
    { label: '担当者', render: (r) => r.inspector },
    { label: '結果', render: (r) => inspectionSummary(r) },
    { label: '全体コメント', render: (r) => r.summary || '—' },
    { label: '操作', className: 'col-actions', render: (r) => html`<span class="btn-row">
      <button type="button" class="btn btn--ghost btn--sm" data-edit="${r.id}">編集</button>
      <button type="button" class="btn btn--danger-ghost btn--sm" data-delete="${r.id}">削除</button></span>` }
  ], rows, { empty: '条件に一致する点検記録はありません' })}`;
}

export function renderInspections(root, { query }) {
  if (query.site) filters.siteId = query.site;
  const types = Object.entries(L.SITE_TYPES);
  root.innerHTML = String(html`
    ${pageHeader('セキュリティ点検', 'サイトの種類ごとのチェックリストで、サイト本体・アカウント・サーバー・ドメイン・SSL・バックアップを確認して記録します。',
      html`<button type="button" class="btn btn--primary" id="add-insp">＋ 点検する</button>`)}

    <section class="card js-fade">
      <form class="toolbar" id="insp-filter" role="search">
        <div class="toolbar__search">
          <label class="visually-hidden" for="insp-q">キーワード検索</label>
          <input class="input" type="search" id="insp-q" name="q" value="${filters.q}" placeholder="項目名・コメント・担当者で検索">
        </div>
        <label class="toolbar__select"><span class="toolbar__label">サイト</span>
          <select class="input input--select" name="siteId"><option value="">すべて</option>
            ${allSitesSorted().map((s) => html`<option value="${s.id}"${filters.siteId === s.id ? raw(' selected') : ''}>${s.name}</option>`)}
          </select></label>
        <label class="toolbar__select"><span class="toolbar__label">点検月</span>
          <input class="input" type="month" name="month" value="${filters.month}"></label>
        <label class="toolbar__select"><span class="toolbar__label">結果を含む</span>
          <select class="input input--select" name="result"><option value="">すべて</option>
            ${Object.entries(L.RESULTS).map(([v, l]) => html`<option value="${v}"${filters.result === v ? raw(' selected') : ''}>${l}</option>`)}
          </select></label>
      </form>
      <div id="insp-table">${listTable()}</div>
    </section>

    <section class="card js-fade">
      <h2 class="card__title">サイトの種類ごとの点検項目</h2>
      <p class="card__lead">点検項目は「設定」画面で追加・変更できます。</p>
      <div class="checklist-columns">
        ${types.map(([k, label]) => html`<div class="checklist-col">
          <h3 class="checklist-col__title">${label}</h3>
          ${groupByCategory(state.db.checklists[k] || []).map((g) => html`<p class="checklist-col__group">${g.label}</p>
            <ul class="checklist-col__list">${g.items.map((i) => html`<li>${i.label}</li>`)}</ul>`)}
        </div>`)}
      </div>
    </section>`);

  const form = root.querySelector('#insp-filter');
  const box = root.querySelector('#insp-table');
  const update = () => {
    Object.assign(filters, { q: form.q.value, siteId: form.siteId.value, month: form.month.value, result: form.result.value });
    box.innerHTML = String(listTable());
  };
  form.addEventListener('input', debounce(update, 150));
  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => e.preventDefault());
  root.querySelector('#add-insp').addEventListener('click', () => openInspectionEditor(null, filters.siteId ? { siteId: filters.siteId } : {}));
  box.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const find = (id) => state.db.inspections.find((r) => r.id === id);
    if (t.dataset.view) openInspectionView(t.dataset.view);
    if (t.dataset.edit) openInspectionEditor(find(t.dataset.edit));
    if (t.dataset.delete) {
      const r = find(t.dataset.delete);
      deleteRecord('inspections', r, `${formatDate(r.date)} ${siteById(r.siteId)?.name || ''} の点検記録`);
    }
  });
}
