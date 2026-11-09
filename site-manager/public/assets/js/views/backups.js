/**
 * バックアップ管理
 * WordPressのバックアップとサーバー全体のバックアップを区別して管理する。
 */
import { state, activeSites, siteName } from '../state.js';
import { html, todayStr, formatDate, daysBetween, byDateDesc } from '../utils.js';
import * as L from '../labels.js';
import { latestBackups } from '../status.js';
import { pageHeader, badge, table } from '../ui.js';
import { openRecordEditor, siteLink } from '../editors.js';
import { mountCrudList, siteFilterOptions, mapOptions, setCrudFilter } from '../crud.js';

/** バックアップ日付の表示（古い・未確認を色で示す） */
export function backupCell(b) {
  if (!b) return badge('grey', '未確認');
  const age = daysBetween(b.backupDate, todayStr());
  const stale = age > state.db.settings.backupStaleDays;
  return html`${badge(stale ? 'yellow' : 'green', formatDate(b.backupDate))}<span class="cell-sub">${age}日前${stale ? '（古い）' : ''}</span>`;
}

const restoreBadge = (v) => badge({ unknown: 'grey', yes: 'green', no: 'yellow' }[v], L.RESTORE_VERIFIED[v]);

function summaryTable() {
  const rows = activeSites().map((site) => ({ site, latest: latestBackups(state.db, site.id) }));
  return table([
    { label: 'サイト', render: (r) => html`${siteLink(r.site.id)}<span class="cell-sub">${L.SITE_TYPES[r.site.siteType]}</span>` },
    { label: 'WordPressバックアップ', render: (r) => (r.site.siteType === 'wordpress' ? backupCell(r.latest.wordpress) : html`<span class="text-muted">対象外</span>`) },
    { label: 'サーバー全体バックアップ', render: (r) => backupCell(r.latest.server) },
    { label: '制作会社管理', render: (r) => (r.latest.vendor ? backupCell(r.latest.vendor) : r.site.vendor ? badge('grey', '未確認') : html`<span class="text-muted">—</span>`) },
    { label: '復元方法', render: (r) => {
      const all = Object.values(r.latest);
      if (!all.length) return badge('grey', '未確認');
      return all.some((b) => b.restoreVerified === 'yes') ? restoreBadge('yes') : restoreBadge(all.some((b) => b.restoreVerified === 'no') ? 'no' : 'unknown');
    } },
    { label: '', className: 'col-actions', render: (r) => html`<button type="button" class="btn btn--ghost btn--sm" data-add-site="${r.site.id}">＋ 記録</button>` }
  ], rows, { empty: '運用中のサイトがありません' });
}

export function renderBackups(root, { query }) {
  if (query.site) setCrudFilter('backups', { siteId: query.site });
  root.innerHTML = String(html`
    ${pageHeader('バックアップ管理', `バックアップの取得状況を記録します。最終バックアップから${state.db.settings.backupStaleDays}日を超えると「古い」と表示します（日数は設定で変更できます）。`,
      html`<button type="button" class="btn btn--primary" data-add-site="">＋ バックアップを記録</button>`)}

    <section class="card js-fade">
      <div class="card__header"><h2 class="card__title">サイト別の状況</h2></div>
      <p class="matrix-note">記録がないものは「未確認」と表示します。WordPressバックアップ（プラグイン等でサイトのデータを保存）と、サーバー全体バックアップ（サーバー会社の機能等）は別物です。</p>
      ${summaryTable()}
    </section>

    <section class="card js-fade">
      <div class="card__header"><h2 class="card__title">バックアップ記録</h2></div>
      <div id="backup-list"></div>
    </section>`);

  mountCrudList(root.querySelector('#backup-list'), {
    key: 'backups',
    collection: 'backups',
    searchPlaceholder: '方法・保存場所・ファイル名で検索',
    filters: [
      { name: 'siteId', label: 'サイト', options: siteFilterOptions },
      { name: 'kind', label: '種類', options: () => mapOptions(L.BACKUP_KIND) }
    ],
    match: (r, f) => (!f.siteId || r.siteId === f.siteId) && (!f.kind || r.kind === f.kind),
    searchText: (r) => [siteName(r.siteId), r.method, r.location, r.fileName, r.target, r.notes],
    sort: byDateDesc('backupDate'),
    label: (r) => `${formatDate(r.backupDate)} ${siteName(r.siteId)} のバックアップ記録`,
    columns: [
      { label: 'バックアップ日', render: (r) => (r.backupDate ? formatDate(r.backupDate) : badge('grey', '未確認')) },
      { label: 'サイト', render: (r) => siteLink(r.siteId) },
      { label: '種類', render: (r) => badge(r.kind === 'server' ? 'blue' : 'muted', L.BACKUP_KIND[r.kind]) },
      { label: '方法・保存場所', render: (r) => html`${r.method || '—'}<span class="cell-sub">${r.location || ''}</span><span class="cell-sub">${r.fileName || ''}</span>` },
      { label: '対象', render: (r) => r.target || '—' },
      { label: '復元確認', render: (r) => html`${restoreBadge(r.restoreVerified)}${r.restoreTestDate ? html`<span class="cell-sub">テスト ${formatDate(r.restoreTestDate)}</span>` : ''}` }
    ],
    empty: 'バックアップ記録はありません'
  });

  root.onclick = (e) => {
    const t = e.target.closest('[data-add-site]');
    if (!t) return;
    const site = state.db.sites.find((s) => s.id === t.dataset.addSite);
    openRecordEditor('backups', null, site ? { siteId: site.id, kind: site.siteType === 'wordpress' ? 'wordpress' : site.siteType === 'bears' ? 'vendor' : 'server' } : {});
  };
}
