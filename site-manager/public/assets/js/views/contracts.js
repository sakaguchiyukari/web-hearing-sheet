/**
 * 契約・支払い管理
 * 1つの契約を複数サイトに紐づけられる（共用サーバー等）。
 */
import { state, siteName } from '../state.js';
import { html, todayStr, formatDate, formatYen, daysBetween, daysLeftText } from '../utils.js';
import * as L from '../labels.js';
import { pageHeader, badge } from '../ui.js';
import { openRecordEditor, siteLink } from '../editors.js';
import { mountCrudList, siteFilterOptions, mapOptions, setCrudFilter } from '../crud.js';

/** 更新日までの残り日数バッジ */
export function renewalBadge(c) {
  if (!c.nextRenewalDate) return badge('grey', '未登録');
  if (c.status === 'ended') return html`<span class="text-muted">${formatDate(c.nextRenewalDate)}</span>`;
  const d = daysBetween(todayStr(), c.nextRenewalDate);
  const tone = d < 0 ? 'red' : d <= state.db.settings.contractAlertDays ? 'yellow' : 'green';
  return html`${badge(tone, formatDate(c.nextRenewalDate))}<span class="cell-sub">${daysLeftText(d)}</span>`;
}

/** 年間費用の概算（月額×12＋年額。一括・その他は含めない） */
export function annualCost(c) {
  if (c.status !== 'active' || c.amount == null) return 0;
  if (c.amountUnit === 'month') return c.amount * 12;
  if (c.amountUnit === 'year') return c.amount;
  return 0;
}

export function renderContracts(root, { query }) {
  if (query.site) setCrudFilter('contracts', { siteId: query.site });
  const active = state.db.contracts.filter((c) => c.status === 'active');
  const total = active.reduce((sum, c) => sum + annualCost(c), 0);
  const alertDays = state.db.settings.contractAlertDays;
  const soon = active.filter((c) => c.nextRenewalDate && daysBetween(todayStr(), c.nextRenewalDate) <= alertDays);

  root.innerHTML = String(html`
    ${pageHeader('契約・支払い', `サーバー・ドメインなどの契約を管理します。次回更新日まで${alertDays}日以内の契約は黄色、過ぎた契約は赤で表示します。`,
      html`<button type="button" class="btn btn--primary" id="add-contract">＋ 契約を追加</button>`)}

    ${soon.length ? html`<div class="alert alert--warning js-fade">更新日が近い・過ぎている契約が <strong>${soon.length}件</strong> あります：${soon.map((c) => c.serviceName).join('、')}</div>` : ''}

    <section class="card js-fade">
      <div class="cost-summary">
        <p>契約中 <strong>${active.length}</strong> 件</p>
        <p>年間費用の目安 <strong>${formatYen(total)}</strong><span class="cell-sub">月額×12＋年額の合計（一括・その他は除く）</span></p>
      </div>
    </section>

    <section class="card js-fade" id="contract-list"></section>`);

  root.querySelector('#add-contract').addEventListener('click', () => openRecordEditor('contracts'));

  mountCrudList(root.querySelector('#contract-list'), {
    key: 'contracts',
    collection: 'contracts',
    initial: { status: 'active' },
    searchPlaceholder: 'サービス名・契約会社・内容で検索',
    filters: [
      { name: 'siteId', label: 'サイト', options: siteFilterOptions },
      { name: 'category', label: '種類', options: () => mapOptions(L.CONTRACT_CATEGORY) },
      { name: 'status', label: '契約状況', options: () => mapOptions(L.CONTRACT_STATUS) }
    ],
    match: (r, f) => (!f.siteId || r.siteIds.includes(f.siteId)) && (!f.category || r.category === f.category) && (!f.status || r.status === f.status),
    searchText: (r) => [r.serviceName, r.company, r.content, r.owner, r.notes, r.siteIds.map(siteName).join(' ')],
    sort: (a, b) => (a.nextRenewalDate || '9999').localeCompare(b.nextRenewalDate || '9999'),
    label: (r) => r.serviceName,
    columns: [
      { label: '契約サービス', render: (r) => html`<strong>${r.serviceName}</strong><span class="cell-sub">${r.company || ''}</span>${badge('muted', L.CONTRACT_CATEGORY[r.category])}${r.status === 'ended' ? badge('grey', '解約済み') : ''}` },
      { label: '対象サイト', render: (r) => (r.siteIds.length ? html`${r.siteIds.map((id) => html`<span class="cell-block">${siteLink(id)}</span>`)}` : html`<span class="text-muted">未設定</span>`) },
      { label: '費用', render: (r) => html`${r.amount != null ? `${L.AMOUNT_UNIT[r.amountUnit]} ${formatYen(r.amount)}` : '—'}<span class="cell-sub">支払い：${L.PAYMENT_CYCLE[r.paymentCycle]}</span>` },
      { label: '次回更新日', render: renewalBadge },
      { label: '支払い確認日', render: (r) => formatDate(r.paymentConfirmedDate) },
      { label: '担当者', hideSm: true, render: (r) => r.owner || '—' }
    ],
    empty: '契約は登録されていません'
  });
}
