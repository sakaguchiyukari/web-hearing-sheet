/**
 * サイト管理台帳（一覧・詳細）
 */
import { state, siteById, allSitesSorted } from '../state.js';
import { html, raw, todayStr, formatDate, formatDateTime, formatYen, matchesQuery, byDateDesc, debounce } from '../utils.js';
import * as L from '../labels.js';
import { siteStatus, lastInspectionDate, siteInspections, latestBackups, siteSecurityReports } from '../status.js';
import { pageHeader, statusBadge, statusDot, badge, table, emptyState, multiline } from '../ui.js';
import { openRecordEditor, deleteRecord } from '../editors.js';
import { openInspectionEditor, openInspectionView, inspectionSummary } from './inspections.js';
import { secResultBadge, scanResultBadge, attachmentLinks } from './security.js';
import { backupCell } from './backups.js';
import { renewalBadge } from './contracts.js';

/* =========================================================
   一覧
   ========================================================= */
const filters = { q: '', type: '', level: '', active: 'active' };

function filteredSites() {
  const db = state.db;
  return allSitesSorted()
    .map((site) => ({ site, status: siteStatus(db, site) }))
    .filter(({ site, status }) => (!filters.type || site.siteType === filters.type)
      && (!filters.level || status.level === filters.level)
      && (!filters.active || site.active === filters.active)
      && matchesQuery(filters.q, site.name, site.domain, site.url, site.manager, site.vendor, site.serverCompany, site.wpTheme, site.notes));
}

function siteTable() {
  const db = state.db;
  const rows = filteredSites();
  return html`
    <p class="result-count">${rows.length}件 / 全${db.sites.length}件</p>
    ${table([
      { label: '状態', className: 'col-status', render: ({ status }) => statusBadge(status.level) },
      { label: 'サイト名', render: ({ site }) => html`<a class="link link--strong" href="#/sites/${site.id}">${site.name}</a>
        <span class="cell-sub">${site.domain || '—'}</span>${site.active === 'archived' ? badge('muted', '運用終了') : ''}` },
      { label: '種類', render: ({ site }) => html`${L.SITE_TYPES[site.siteType]}${site.wpTheme ? html`<span class="cell-sub">テーマ：${site.wpTheme}</span>` : ''}` },
      { label: '管理担当者', hideSm: true, render: ({ site }) => site.manager || '—' },
      { label: '制作・保守会社', hideSm: true, render: ({ site }) => site.vendor || '—' },
      { label: '最終点検日', render: ({ site }) => formatDate(lastInspectionDate(db, site)) },
      { label: '次回点検予定', hideSm: true, render: ({ site }) => formatDate(site.nextInspectionDate) },
      { label: 'SSL', render: ({ site }) => html`${L.SSL_STATUS[site.sslStatus]}${site.sslExpiry ? html`<span class="cell-sub">期限 ${formatDate(site.sslExpiry)}</span>` : ''}` },
      { label: '操作', className: 'col-actions', render: ({ site }) => html`<button type="button" class="btn btn--ghost btn--sm" data-edit="${site.id}">編集</button>` }
    ], rows, { empty: '条件に一致するサイトはありません' })}`;
}

export function renderSiteList(root) {
  root.innerHTML = String(html`
    ${pageHeader('サイト管理台帳', 'サイトごとの基本情報・契約・担当範囲を管理します。サイト名をクリックすると詳細を表示します。',
      html`<button type="button" class="btn btn--primary" id="add-site">＋ サイトを追加</button>`)}

    <section class="card js-fade">
      <form class="toolbar" role="search" id="site-filter">
        <div class="toolbar__search">
          <label class="visually-hidden" for="site-q">キーワード検索</label>
          <input class="input" type="search" id="site-q" name="q" placeholder="サイト名・ドメイン・担当者などで検索" value="${filters.q}">
        </div>
        <label class="toolbar__select">
          <span class="toolbar__label">種類</span>
          <select class="input input--select" name="type">
            <option value="">すべて</option>
            ${Object.entries(L.SITE_TYPES).map(([v, l]) => html`<option value="${v}"${filters.type === v ? raw(' selected') : ''}>${l}</option>`)}
          </select>
        </label>
        <label class="toolbar__select">
          <span class="toolbar__label">状態</span>
          <select class="input input--select" name="level">
            <option value="">すべて</option>
            ${Object.entries(L.STATUS_LEVELS).map(([v, l]) => html`<option value="${v}"${filters.level === v ? raw(' selected') : ''}>${l}</option>`)}
          </select>
        </label>
        <label class="toolbar__select">
          <span class="toolbar__label">運用状況</span>
          <select class="input input--select" name="active">
            <option value="">すべて</option>
            ${Object.entries(L.SITE_ACTIVE).map(([v, l]) => html`<option value="${v}"${filters.active === v ? raw(' selected') : ''}>${l}</option>`)}
          </select>
        </label>
      </form>
      <div id="site-table">${siteTable()}</div>
    </section>`);

  const tableBox = root.querySelector('#site-table');
  const form = root.querySelector('#site-filter');
  const update = () => {
    filters.q = form.q.value;
    filters.type = form.type.value;
    filters.level = form.level.value;
    filters.active = form.active.value;
    tableBox.innerHTML = String(siteTable());
  };
  form.addEventListener('input', debounce(update, 150));
  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => e.preventDefault());

  root.querySelector('#add-site').addEventListener('click', () => openRecordEditor('sites'));
  tableBox.addEventListener('click', (e) => {
    const id = e.target.closest('[data-edit]')?.dataset.edit;
    if (id) openRecordEditor('sites', siteById(id));
  });
}

/* =========================================================
   詳細
   ========================================================= */
const detailTab = { current: 'overview' };

/** 定義リスト形式の情報表示 */
const infoList = (rows) => html`<dl class="info-list">
  ${rows.map(([k, v]) => html`<div class="info-list__row"><dt class="info-list__term">${k}</dt><dd class="info-list__desc">${v || raw('<span class="text-muted">未入力</span>')}</dd></div>`)}
</dl>`;

/* ---------- 各タブの中身 ---------- */
function tabOverview(site) {
  const db = state.db;
  return html`
    <div class="detail-grid">
      <section class="card card--flat">
        <h3 class="card__subtitle">基本情報</h3>
        ${infoList([
          ['サイト名', site.name],
          ['ドメイン', site.domain],
          ['URL', site.url ? html`<a class="link" href="${site.url}" target="_blank" rel="noopener noreferrer">${site.url}</a>` : ''],
          ['サイトの種類', L.SITE_TYPES[site.siteType]],
          ['CMSの種類', site.cmsName],
          ['WordPressテーマ', site.wpTheme],
          ['運用状況', L.SITE_ACTIVE[site.active]],
          ['管理担当者', site.manager]
        ])}
      </section>
      <section class="card card--flat">
        <h3 class="card__subtitle">サーバー・ドメイン・SSL</h3>
        ${infoList([
          ['レンタルサーバー会社', site.serverCompany],
          ['サーバー契約情報', site.serverContract ? multiline(site.serverContract) : ''],
          ['ドメイン契約情報', site.domainContract ? multiline(site.domainContract) : ''],
          ['SSL証明書', L.SSL_STATUS[site.sslStatus]],
          ['SSL有効期限', site.sslExpiry ? formatDate(site.sslExpiry) : ''],
          ['SSL確認日', site.sslCheckedDate ? formatDate(site.sslCheckedDate) : '']
        ])}
      </section>
      <section class="card card--flat">
        <h3 class="card__subtitle">担当範囲</h3>
        ${infoList([
          ['制作会社・保守会社', site.vendor],
          ['制作会社の担当範囲', site.vendorScope ? multiline(site.vendorScope) : ''],
          ['自社の担当範囲', site.ownScope ? multiline(site.ownScope) : '']
        ])}
      </section>
      <section class="card card--flat">
        <h3 class="card__subtitle">点検・その他</h3>
        ${infoList([
          ['最終点検日', formatDate(lastInspectionDate(db, site))],
          ['次回点検予定日', site.nextInspectionDate ? formatDate(site.nextInspectionDate) : ''],
          ['備考', site.notes ? multiline(site.notes) : ''],
          ['最終更新', `${formatDateTime(site.updatedAt)}${site.updatedBy ? `（${site.updatedBy}）` : ''}`]
        ])}
      </section>
    </div>`;
}

function tabInspections(site) {
  const list = siteInspections(state.db, site.id, '9999-12-31');
  return html`
    <div class="tab-actions"><button type="button" class="btn btn--primary btn--sm" data-action="add-inspection">＋ 点検を記録</button></div>
    ${table([
      { label: '点検日', render: (r) => html`<button type="button" class="link link--button" data-view-inspection="${r.id}">${formatDate(r.date)}</button>` },
      { label: '担当者', render: (r) => r.inspector },
      { label: '結果', render: (r) => inspectionSummary(r) },
      { label: 'コメント', render: (r) => r.summary || '—' }
    ], list, { empty: 'まだ点検記録がありません（状態は「未確認」として扱われます）' })}`;
}

function tabWorklogs(site) {
  const list = state.db.worklogs.filter((w) => w.siteId === site.id).sort(byDateDesc('occurredDate'));
  return html`
    <div class="tab-actions"><button type="button" class="btn btn--primary btn--sm" data-action="add-worklog">＋ 作業・トラブルを記録</button></div>
    ${table([
      { label: '発生日', render: (w) => formatDate(w.occurredDate) },
      { label: '区分', render: (w) => badge(w.kind === 'trouble' ? 'red' : 'blue', L.WORK_KIND[w.kind]) },
      { label: '内容', render: (w) => html`${w.workContent || ''}${w.troubleContent ? html`<span class="cell-sub">トラブル：${w.troubleContent}</span>` : ''}` },
      { label: '担当', render: (w) => w.assignee || '—' },
      { label: '状況', render: (w) => badge(w.status === 'done' ? 'green' : 'yellow', L.WORK_STATUS[w.status]) },
      { label: '操作', className: 'col-actions', render: (w) => html`<button type="button" class="btn btn--ghost btn--sm" data-edit-record="worklogs:${w.id}">編集</button>` }
    ], list, { empty: '作業履歴はまだありません' })}`;
}

function tabBackups(site) {
  const db = state.db;
  const latest = latestBackups(db, site.id);
  const list = db.backups.filter((b) => b.siteId === site.id).sort(byDateDesc('backupDate'));
  return html`
    <div class="tab-actions"><button type="button" class="btn btn--primary btn--sm" data-add-record="backups">＋ バックアップを記録</button></div>
    <div class="detail-grid">
      ${Object.entries(L.BACKUP_KIND).filter(([k]) => k !== 'other' && (k !== 'wordpress' || site.siteType === 'wordpress') && (k !== 'vendor' || site.vendor))
        .map(([k, label]) => html`<div class="card card--flat"><h3 class="card__subtitle">${label}</h3>${backupCell(latest[k])}</div>`)}
    </div>
    <div class="tab-section">
      <h3 class="tab-section__title">バックアップ記録</h3>
      ${table([
        { label: '日付', render: (b) => formatDate(b.backupDate) },
        { label: '種類', render: (b) => L.BACKUP_KIND[b.kind] },
        { label: '方法・保存場所', render: (b) => html`${b.method || '—'}<span class="cell-sub">${b.location || ''} ${b.fileName || ''}</span>` },
        { label: '復元確認', render: (b) => L.RESTORE_VERIFIED[b.restoreVerified] },
        { label: '操作', className: 'col-actions', render: (b) => html`<button type="button" class="btn btn--ghost btn--sm" data-edit-record="backups:${b.id}">編集</button>` }
      ], list, { empty: 'バックアップ記録はありません（未確認）' })}
    </div>`;
}

function tabSecurity(site) {
  const db = state.db;
  const reports = siteSecurityReports(db, site.id, '9999-12-31');
  const scans = db.serverScans.filter((x) => x.siteId === site.id).sort(byDateDesc('scanDate'));
  const services = db.securityServices.filter((s) => s.targetSiteIds.includes(site.id));
  return html`
    <div class="tab-actions">
      <button type="button" class="btn btn--primary btn--sm" data-add-record="securityReports">＋ 外部診断の結果</button>
      <button type="button" class="btn btn--outline btn--sm" data-add-record="serverScans">＋ 不正ファイル検査</button>
    </div>
    <p class="matrix-note">契約中の診断サービス：${services.length ? services.map((s) => s.name).join('、') : '登録なし'}</p>
    <div class="tab-section">
      <h3 class="tab-section__title">外部のセキュリティ診断</h3>
      ${table([
        { label: '診断日', render: (r) => formatDate(r.diagnosisDate || r.receivedDate) },
        { label: 'サービス', render: (r) => db.securityServices.find((s) => s.id === r.serviceId)?.name || '—' },
        { label: '結果', render: (r) => html`${secResultBadge(r.result)}<span class="cell-sub">重要度：${L.SEVERITY[r.severity]}</span>` },
        { label: '指摘事項', render: (r) => html`${r.findings || '—'}${attachmentLinks(r.attachments)}` },
        { label: '対応状況', render: (r) => L.RESPONSE_STATUS[r.responseStatus] },
        { label: '操作', className: 'col-actions', render: (r) => html`<button type="button" class="btn btn--ghost btn--sm" data-edit-record="securityReports:${r.id}">編集</button>` }
      ], reports, { empty: '診断結果は登録されていません（未確認）' })}
    </div>
    <div class="tab-section">
      <h3 class="tab-section__title">サーバー内部の不正ファイル検査</h3>
      ${table([
        { label: '検査日', render: (x) => formatDate(x.scanDate) },
        { label: '方法', render: (x) => x.method || '—' },
        { label: '結果', render: (x) => scanResultBadge(x.result) },
        { label: '対応状況', render: (x) => L.SCAN_STATUS[x.status] },
        { label: '操作', className: 'col-actions', render: (x) => html`<button type="button" class="btn btn--ghost btn--sm" data-edit-record="serverScans:${x.id}">編集</button>` }
      ], scans, { empty: '検査記録はありません（未確認）' })}
    </div>`;
}

function tabContracts(site) {
  const list = state.db.contracts.filter((c) => c.siteIds.includes(site.id));
  return html`
    <div class="tab-actions"><button type="button" class="btn btn--primary btn--sm" data-add-record="contracts">＋ 契約を追加</button></div>
    ${table([
      { label: '契約サービス', render: (c) => html`${c.serviceName}<span class="cell-sub">${c.company || ''}・${L.CONTRACT_CATEGORY[c.category]}</span>` },
      { label: '費用', render: (c) => (c.amount != null ? `${L.AMOUNT_UNIT[c.amountUnit]} ${formatYen(c.amount)}` : '—') },
      { label: '次回更新日', render: renewalBadge },
      { label: '共用サイト数', render: (c) => `${c.siteIds.length}サイト` },
      { label: '操作', className: 'col-actions', render: (c) => html`<button type="button" class="btn btn--ghost btn--sm" data-edit-record="contracts:${c.id}">編集</button>` }
    ], list, { empty: 'このサイトに紐づく契約はありません' })}`;
}

/** タブ定義（ここに追加すると詳細画面のタブが増える） */
const TABS = [
  { key: 'overview', label: '概要', render: tabOverview },
  { key: 'inspections', label: '点検履歴', render: tabInspections, count: (s) => state.db.inspections.filter((r) => r.siteId === s.id).length },
  { key: 'backups', label: 'バックアップ', render: tabBackups, count: (s) => state.db.backups.filter((r) => r.siteId === s.id).length },
  { key: 'security', label: 'セキュリティ', render: tabSecurity, count: (s) => state.db.securityReports.filter((r) => r.siteId === s.id).length + state.db.serverScans.filter((r) => r.siteId === s.id).length },
  { key: 'contracts', label: '契約', render: tabContracts, count: (s) => state.db.contracts.filter((c) => c.siteIds.includes(s.id)).length },
  { key: 'worklogs', label: '作業履歴', render: tabWorklogs, count: (s) => state.db.worklogs.filter((r) => r.siteId === s.id).length }
];

export function renderSiteDetail(root, { params: [id] }) {
  const site = siteById(id);
  if (!site) {
    root.innerHTML = String(html`${pageHeader('サイトが見つかりません')}${emptyState('削除された可能性があります。', html`<a class="btn btn--primary" href="#/sites">台帳に戻る</a>`)}`);
    return;
  }
  const { level, reasons } = siteStatus(state.db, site, todayStr());
  if (!TABS.some((t) => t.key === detailTab.current)) detailTab.current = 'overview';
  const tab = TABS.find((t) => t.key === detailTab.current);

  root.innerHTML = String(html`
    <nav class="breadcrumb" aria-label="パンくずリスト"><a class="link" href="#/sites">サイト管理台帳</a><span aria-hidden="true">／</span><span>${site.name}</span></nav>
    ${pageHeader(site.name, `${L.SITE_TYPES[site.siteType]}${site.domain ? `・${site.domain}` : ''}`,
      html`<button type="button" class="btn btn--outline" data-action="edit-site">編集</button>
           <button type="button" class="btn btn--danger-ghost" data-action="delete-site">削除</button>`)}

    <section class="card status-panel status-panel--${level} js-fade" aria-label="現在の状態">
      <div class="status-panel__head">${statusBadge(level)}</div>
      ${reasons.length ? html`<ul class="status-panel__reasons">
        ${reasons.map((r) => html`<li class="reason reason--${r.level}">${statusDot(r.level)}${r.text}</li>`)}
      </ul>` : html`<p class="status-panel__ok">点検・SSL・バックアップ・セキュリティ診断のすべてが確認済みで、問題は登録されていません。</p>`}
    </section>

    <div class="tabs js-fade" role="tablist" aria-label="サイト情報">
      ${TABS.map((t) => html`<button type="button" class="tabs__tab ${t.key === tab.key ? 'tabs__tab--active' : ''}" role="tab"
        aria-selected="${t.key === tab.key}" data-tab="${t.key}">${t.label}${t.count ? html`<span class="tabs__count">${t.count(site)}</span>` : ''}</button>`)}
    </div>
    <section class="card tab-panel" role="tabpanel">${tab.render(site)}</section>`);

  // イベント（委譲）
  root.onclick = (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.dataset.tab) {
      detailTab.current = t.dataset.tab;
      renderSiteDetail(root, { params: [id] });
      return;
    }
    if (t.dataset.viewInspection) openInspectionView(t.dataset.viewInspection);
    if (t.dataset.addRecord) {
      const presets = t.dataset.addRecord === 'contracts' ? { siteIds: [site.id] }
        : t.dataset.addRecord === 'securityReports' ? { siteId: site.id, serviceId: state.db.securityServices.find((x) => x.targetSiteIds.includes(site.id))?.id || '' }
          : { siteId: site.id };
      if (t.dataset.addRecord === 'backups') presets.kind = site.siteType === 'wordpress' ? 'wordpress' : site.siteType === 'bears' ? 'vendor' : 'server';
      openRecordEditor(t.dataset.addRecord, null, presets);
    }
    if (t.dataset.editRecord) {
      const [col, rid] = t.dataset.editRecord.split(':');
      openRecordEditor(col, state.db[col].find((r) => r.id === rid));
    }
    switch (t.dataset.action) {
      case 'edit-site': openRecordEditor('sites', site); break;
      case 'delete-site':
        deleteRecord('sites', site, site.name).then((ok) => { if (ok) location.hash = '#/sites'; });
        break;
      case 'add-inspection': openInspectionEditor(null, { siteId: site.id }); break;
      case 'add-worklog': openRecordEditor('worklogs', null, { siteId: site.id }); break;
      default: break;
    }
  };
}

/* 他の画面から詳細のタブを開くためのヘルパー */
export const setSiteDetailTab = (key) => { detailTab.current = key; };
