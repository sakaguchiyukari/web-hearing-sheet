/**
 * 作業履歴・トラブル管理
 */
import { state, siteName } from '../state.js';
import { html, formatDate, byDateDesc } from '../utils.js';
import * as L from '../labels.js';
import { pageHeader, badge, multiline } from '../ui.js';
import { openRecordEditor, siteLink } from '../editors.js';
import { mountCrudList, siteFilterOptions, mapOptions, setCrudFilter } from '../crud.js';
import { isOpenTrouble } from '../status.js';

const statusTone = (s) => ({ done: 'green', progress: 'yellow', open: 'red', hold: 'grey' }[s]);

export function renderWorklogs(root, { query }) {
  if (query.site) setCrudFilter('worklogs', { siteId: query.site });
  const openCount = state.db.worklogs.filter(isOpenTrouble).length;

  root.innerHTML = String(html`
    ${pageHeader('作業履歴・トラブル', '作業内容とトラブル対応を記録します。キーワード・期間・状態で過去の対応を検索できます。',
      html`<button type="button" class="btn btn--primary" id="add-worklog">＋ 作業・トラブルを記録</button>`)}
    ${openCount ? html`<div class="alert alert--warning js-fade">未解決のトラブルが <strong>${openCount}件</strong> あります。「区分：トラブル」「対応状況」で絞り込めます。</div>` : ''}
    <section class="card js-fade" id="worklog-list"></section>`);

  root.querySelector('#add-worklog').addEventListener('click', () => openRecordEditor('worklogs'));

  mountCrudList(root.querySelector('#worklog-list'), {
    key: 'worklogs',
    collection: 'worklogs',
    searchPlaceholder: '作業内容・トラブル・原因・対応内容で検索',
    filters: [
      { name: 'siteId', label: 'サイト', options: siteFilterOptions },
      { name: 'kind', label: '区分', options: () => mapOptions(L.WORK_KIND) },
      { name: 'status', label: '対応状況', options: () => [{ value: 'unresolved', label: '未完了すべて' }, ...mapOptions(L.WORK_STATUS)] },
      { name: 'month', label: '発生月', type: 'month' }
    ],
    match: (r, f) => (!f.siteId || r.siteId === f.siteId)
      && (!f.kind || r.kind === f.kind)
      && (!f.status || (f.status === 'unresolved' ? r.status !== 'done' : r.status === f.status))
      && (!f.month || r.occurredDate.startsWith(f.month)),
    searchText: (r) => [siteName(r.siteId), r.workContent, r.troubleContent, r.cause, r.action, r.assignee, r.notes],
    sort: byDateDesc('occurredDate'),
    label: (r) => `${formatDate(r.occurredDate)} ${siteName(r.siteId)} の記録`,
    columns: [
      { label: '発生日', render: (r) => formatDate(r.occurredDate) },
      { label: 'サイト', render: (r) => siteLink(r.siteId) },
      { label: '区分', render: (r) => html`${badge(r.kind === 'trouble' ? 'red' : 'blue', L.WORK_KIND[r.kind])}${r.priority !== 'normal' ? badge(r.priority === 'urgent' ? 'red' : 'yellow', `優先度：${L.PRIORITY[r.priority]}`) : ''}` },
      { label: '内容', className: 'col-wide', render: (r) => html`
        ${r.workContent ? html`<span class="cell-block">${multiline(r.workContent)}</span>` : ''}
        ${r.troubleContent ? html`<span class="cell-sub">トラブル：${r.troubleContent}</span>` : ''}
        ${r.cause ? html`<span class="cell-sub">原因：${r.cause}</span>` : ''}
        ${r.action ? html`<span class="cell-sub">対応：${r.action}</span>` : ''}` },
      { label: '担当者', render: (r) => r.assignee || '—' },
      { label: '状況', render: (r) => html`${badge(statusTone(r.status), L.WORK_STATUS[r.status])}${r.completedDate ? html`<span class="cell-sub">完了 ${formatDate(r.completedDate)}</span>` : ''}` }
    ]
  });
}
