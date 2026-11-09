/**
 * セキュリティ管理
 * - 外部のセキュリティ診断サービス（外から見た脆弱性チェック）
 * - サーバー内部の不正ファイル検査（サーバー内のファイルの検査）
 * の2つを別々に記録する。結果が登録されていない場合は「未確認」と表示する。
 */
import { state, activeSites, siteName } from '../state.js';
import { html, formatDate, byDateDesc } from '../utils.js';
import * as L from '../labels.js';
import { siteSecurityReports, isOpenFinding, isOpenScan } from '../status.js';
import { pageHeader, badge, table, multiline } from '../ui.js';
import { openRecordEditor, siteLink } from '../editors.js';
import { mountCrudList, siteFilterOptions, mapOptions, setCrudFilter } from '../crud.js';

const tabState = { current: 'overview' };

const secResultTone = { unchecked: 'grey', ok: 'green', findings: 'red' };
const severityTone = { none: 'muted', low: 'blue', medium: 'yellow', high: 'red', critical: 'red' };
const responseTone = { unchecked: 'grey', open: 'red', progress: 'yellow', done: 'green', accepted: 'green', na: 'muted' };
const scanTone = { unchecked: 'grey', clean: 'green', detected: 'red' };

export const secResultBadge = (r) => badge(secResultTone[r], L.SEC_RESULT[r]);
export const scanResultBadge = (r) => badge(scanTone[r], L.SCAN_RESULT[r]);

const latestScan = (siteId) => state.db.serverScans.filter((x) => x.siteId === siteId).sort(byDateDesc('scanDate'))[0];

/** 添付ファイルのリンク一覧 */
export const attachmentLinks = (ids = []) => {
  const files = ids.map((id) => state.db.attachments.find((a) => a.id === id)).filter(Boolean);
  return files.length
    ? html`${files.map((a) => html`<a class="link cell-block" href="/api/attachments/${a.id}" download>📎 ${a.name}</a>`)}`
    : '';
};

/* =========================================================
   タブ：サイト別状況
   ========================================================= */
function overviewTab() {
  const db = state.db;
  const rows = activeSites().map((site) => {
    const reports = siteSecurityReports(db, site.id, '9999-12-31');
    return {
      site,
      report: reports[0],
      openFindings: reports.filter(isOpenFinding).length,
      services: db.securityServices.filter((s) => s.targetSiteIds.includes(site.id)),
      scan: latestScan(site.id),
      openScans: db.serverScans.filter((x) => x.siteId === site.id && isOpenScan(x)).length
    };
  });
  return html`
    <div class="explain-box">
      <div class="explain-box__item">
        <p class="explain-box__title">外部のセキュリティ診断</p>
        <p>契約している診断サービスが、インターネット側からサイトを調べて弱点（脆弱性）がないか確認するものです。結果はレポートを見て手動で登録します。</p>
      </div>
      <div class="explain-box__item">
        <p class="explain-box__title">サーバー内部の不正ファイル検査</p>
        <p>サーバーの中に改ざんされたファイルやウイルスが置かれていないかを調べるものです。外部診断では分からないため、別に記録します。</p>
      </div>
    </div>
    <p class="matrix-note">結果が登録されていない項目は「未確認」と表示します（問題なしとは判断しません）。</p>
    ${table([
      { label: 'サイト', render: (r) => siteLink(r.site.id) },
      { label: '契約中の診断', render: (r) => (r.services.length ? r.services.map((s) => s.name).join('、') : html`<span class="text-muted">対象の契約なし</span>`) },
      { label: '外部診断（最新）', render: (r) => (r.report
        ? html`${secResultBadge(r.report.result)}<span class="cell-sub">${formatDate(r.report.diagnosisDate || r.report.receivedDate)}</span>`
        : badge('grey', '未確認')) },
      { label: '未対応の指摘', render: (r) => (r.openFindings ? badge('red', `${r.openFindings}件`) : r.report ? 'なし' : '—') },
      { label: '次回確認日', render: (r) => formatDate(r.report?.nextCheckDate) },
      { label: '内部検査（最新）', render: (r) => (r.scan
        ? html`${scanResultBadge(r.scan.result)}<span class="cell-sub">${formatDate(r.scan.scanDate)}</span>`
        : badge('grey', '未確認')) },
      { label: '内部検査の未解決', render: (r) => (r.openScans ? badge('red', `${r.openScans}件`) : r.scan ? 'なし' : '—') }
    ], rows, { empty: '運用中のサイトがありません' })}`;
}

/* =========================================================
   タブ：各一覧
   ========================================================= */
function mountReports(box) {
  mountCrudList(box, {
    key: 'securityReports',
    collection: 'securityReports',
    searchPlaceholder: '指摘事項・対応内容で検索',
    filters: [
      { name: 'siteId', label: 'サイト', options: siteFilterOptions },
      { name: 'serviceId', label: '診断サービス', options: () => state.db.securityServices.map((s) => ({ value: s.id, label: s.name })) },
      { name: 'result', label: '診断結果', options: () => mapOptions(L.SEC_RESULT) },
      { name: 'responseStatus', label: '対応状況', options: () => mapOptions(L.RESPONSE_STATUS) }
    ],
    match: (r, f) => (!f.siteId || r.siteId === f.siteId) && (!f.serviceId || r.serviceId === f.serviceId)
      && (!f.result || r.result === f.result) && (!f.responseStatus || r.responseStatus === f.responseStatus),
    searchText: (r) => [siteName(r.siteId), r.findings, r.responseDetail, r.notes],
    sort: (a, b) => (b.diagnosisDate || b.receivedDate || '').localeCompare(a.diagnosisDate || a.receivedDate || ''),
    label: (r) => `${siteName(r.siteId)} の診断結果`,
    columns: [
      { label: '診断日', render: (r) => html`${formatDate(r.diagnosisDate)}<span class="cell-sub">受領 ${formatDate(r.receivedDate)}</span>` },
      { label: 'サイト', render: (r) => siteLink(r.siteId) },
      { label: 'サービス', render: (r) => state.db.securityServices.find((s) => s.id === r.serviceId)?.name || '—' },
      { label: '結果', render: (r) => html`${secResultBadge(r.result)}${r.severity !== 'none' ? badge(severityTone[r.severity], `重要度：${L.SEVERITY[r.severity]}`) : ''}` },
      { label: '指摘事項・対応', className: 'col-wide', render: (r) => html`${r.findings ? multiline(r.findings) : html`<span class="text-muted">指摘なし</span>`}
        ${r.responseDetail ? html`<span class="cell-sub">対応：${r.responseDetail}</span>` : ''}${attachmentLinks(r.attachments)}` },
      { label: '対応状況', render: (r) => html`${badge(responseTone[r.responseStatus], L.RESPONSE_STATUS[r.responseStatus])}${r.nextCheckDate ? html`<span class="cell-sub">次回 ${formatDate(r.nextCheckDate)}</span>` : ''}` }
    ],
    empty: '診断結果は登録されていません（全サイト「未確認」の扱いです）'
  });
}

function mountServices(box) {
  mountCrudList(box, {
    key: 'securityServices',
    collection: 'securityServices',
    searchPlaceholder: 'サービス名・提供会社・ドメインで検索',
    searchText: (r) => [r.name, r.provider, r.targetDomains, r.contractInfo, r.targetSiteIds.map(siteName).join(' ')],
    sort: (a, b) => a.name.localeCompare(b.name, 'ja'),
    label: (r) => r.name,
    columns: [
      { label: 'サービス名', render: (r) => html`<strong>${r.name}</strong><span class="cell-sub">${r.provider || ''}</span>` },
      { label: '診断対象', className: 'col-wide', render: (r) => html`${r.targetSiteIds.length ? r.targetSiteIds.map((id) => html`<span class="cell-block">${siteLink(id)}</span>`) : html`<span class="text-muted">サイト未選択</span>`}
        ${r.targetDomains ? html`<span class="cell-sub pre-wrap">${r.targetDomains}</span>` : ''}` },
      { label: '契約内容', render: (r) => multiline(r.contractInfo) },
      { label: '登録済みの結果', render: (r) => `${state.db.securityReports.filter((x) => x.serviceId === r.id).length}件` }
    ],
    empty: '診断サービスの契約が登録されていません'
  });
}

function mountScans(box) {
  mountCrudList(box, {
    key: 'serverScans',
    collection: 'serverScans',
    searchPlaceholder: '検出内容・対応内容で検索',
    filters: [
      { name: 'siteId', label: 'サイト', options: siteFilterOptions },
      { name: 'result', label: '検査結果', options: () => mapOptions(L.SCAN_RESULT) },
      { name: 'status', label: '対応状況', options: () => mapOptions(L.SCAN_STATUS) }
    ],
    match: (r, f) => (!f.siteId || r.siteId === f.siteId) && (!f.result || r.result === f.result) && (!f.status || r.status === f.status),
    searchText: (r) => [siteName(r.siteId), r.method, r.detail, r.action, r.notes],
    sort: byDateDesc('scanDate'),
    label: (r) => `${formatDate(r.scanDate)} ${siteName(r.siteId)} の検査`,
    columns: [
      { label: '検査日', render: (r) => formatDate(r.scanDate) },
      { label: 'サイト', render: (r) => siteLink(r.siteId) },
      { label: '方法', render: (r) => r.method || '—' },
      { label: '結果', render: (r) => scanResultBadge(r.result) },
      { label: '検出内容・対応', className: 'col-wide', render: (r) => html`${r.detail ? multiline(r.detail) : '—'}${r.action ? html`<span class="cell-sub">対応：${r.action}</span>` : ''}` },
      { label: '対応状況', render: (r) => badge({ na: 'muted', open: 'red', progress: 'yellow', done: 'green' }[r.status], L.SCAN_STATUS[r.status]) },
      { label: '次回予定', render: (r) => formatDate(r.nextDate) }
    ],
    empty: '不正ファイル検査の記録はありません（未確認の扱いです）'
  });
}

/* =========================================================
   画面
   ========================================================= */
const TABS = [
  { key: 'overview', label: 'サイト別状況' },
  { key: 'reports', label: '外部診断の結果', add: 'securityReports', addLabel: '＋ 診断結果を登録' },
  { key: 'services', label: '診断サービス契約', add: 'securityServices', addLabel: '＋ 診断サービスを登録' },
  { key: 'scans', label: 'サーバー内部の不正ファイル検査', add: 'serverScans', addLabel: '＋ 検査結果を登録' }
];

export function renderSecurity(root, { query }) {
  if (query.tab && TABS.some((t) => t.key === query.tab)) tabState.current = query.tab;
  if (query.site) ['securityReports', 'serverScans'].forEach((k) => setCrudFilter(k, { siteId: query.site }));
  const tab = TABS.find((t) => t.key === tabState.current);
  const openCount = state.db.securityReports.filter(isOpenFinding).length + state.db.serverScans.filter(isOpenScan).length;

  root.innerHTML = String(html`
    ${pageHeader('セキュリティ管理', '外部診断サービスの結果と、サーバー内部の不正ファイル検査を分けて記録します。',
      tab.add ? html`<button type="button" class="btn btn--primary" data-add="${tab.add}">${tab.addLabel}</button>` : '')}
    ${openCount ? html`<div class="alert alert--warning js-fade">未対応の指摘・検出が <strong>${openCount}件</strong> あります。</div>` : ''}
    <div class="tabs js-fade" role="tablist" aria-label="セキュリティ管理">
      ${TABS.map((t) => html`<button type="button" class="tabs__tab ${t.key === tab.key ? 'tabs__tab--active' : ''}" role="tab" aria-selected="${t.key === tab.key}" data-tab="${t.key}">${t.label}</button>`)}
    </div>
    <section class="card tab-panel" role="tabpanel" id="sec-panel">${tab.key === 'overview' ? overviewTab() : ''}</section>`);

  const panel = root.querySelector('#sec-panel');
  if (tab.key === 'reports') {
    if (!state.db.securityServices.length) panel.insertAdjacentHTML('beforebegin', String(html`<div class="alert alert--info">診断結果を登録するには、先に「診断サービス契約」タブでサービスを登録してください。</div>`));
    mountReports(panel);
  }
  if (tab.key === 'services') mountServices(panel);
  if (tab.key === 'scans') mountScans(panel);

  root.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.tab) {
      tabState.current = t.dataset.tab;
      location.hash = '#/security';
      renderSecurity(root, { query: {} });
    }
    if (t.dataset.add) openRecordEditor(t.dataset.add);
  };
}
