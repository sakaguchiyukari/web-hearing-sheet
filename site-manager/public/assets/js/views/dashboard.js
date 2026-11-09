/**
 * ダッシュボード
 * 全サイトの状況・対応中の問題・今後の予定・直近の作業を1画面で把握する
 */
import { state, activeSites, siteName } from '../state.js';
import { html, todayStr, currentMonth, formatDate, byDateDesc } from '../utils.js';
import { STATUS_LEVELS, SITE_TYPES, WORK_KIND, WORK_STATUS } from '../labels.js';
import { siteStatus, needsInspection, openIssues, upcomingEvents, backupAlerts, lastInspectionDate } from '../status.js';
import { pageHeader, statusBadge, statusDot, badge, emptyState } from '../ui.js';
import { siteLink } from '../editors.js';

const statCard = (label, value, note = '', tone = '') => html`
  <div class="stat-card ${tone ? `stat-card--${tone}` : ''} js-fade">
    <p class="stat-card__label">${label}</p>
    <p class="stat-card__value">${value}</p>
    ${note ? html`<p class="stat-card__note">${note}</p>` : ''}
  </div>`;

export function renderDashboard(root) {
  const db = state.db;
  const today = todayStr();
  const month = currentMonth();
  const sites = activeSites();

  const statuses = sites.map((site) => ({ site, ...siteStatus(db, site, today) }));
  const levelCount = { red: 0, yellow: 0, grey: 0, green: 0 };
  statuses.forEach((s) => { levelCount[s.level] += 1; });

  const typeCount = (t) => sites.filter((s) => s.siteType === t).length;
  const inspectedThisMonth = sites.filter((s) => db.inspections.some((i) => i.siteId === s.id && i.date.startsWith(month))).length;
  const needInspection = sites.filter((s) => needsInspection(db, s, today));
  const issues = openIssues(db, today);
  const upcoming = upcomingEvents(db, 90, today).slice(0, 8);
  const recent = [...db.worklogs].sort(byDateDesc('occurredDate')).slice(0, 6);
  const bAlerts = backupAlerts(db, today);

  // 表示順：赤 → 黄 → グレー → 緑
  const order = { red: 0, yellow: 1, grey: 2, green: 3 };
  statuses.sort((a, b) => order[a.level] - order[b.level]);

  root.innerHTML = String(html`
    ${pageHeader('ダッシュボード', `${formatDate(today)} 時点の管理状況です。色は記録された内容から自動判定しています（未確認のものは「問題なし」になりません）。`)}

    <!-- ===== 件数サマリー ===== -->
    <section class="section" aria-labelledby="sum-title">
      <h2 class="visually-hidden" id="sum-title">件数サマリー</h2>
      <div class="stat-grid">
        ${statCard('登録サイト総数', sites.length, '運用中のサイト')}
        ${statCard('WordPress', typeCount('wordpress'), 'サイト')}
        ${statCard('静的HTML', typeCount('static'), 'サイト')}
        ${statCard('その他CMS', typeCount('bears') + typeCount('other'), `bears CMS ${typeCount('bears')}・その他 ${typeCount('other')}`)}
        ${statCard('今月の点検済み', `${inspectedThisMonth} / ${sites.length}`, '今月1回以上点検したサイト', inspectedThisMonth === sites.length && sites.length ? 'green' : '')}
        ${statCard('点検が必要', needInspection.length, '未点検・期限超過・予定日到来', needInspection.length ? 'yellow' : 'green')}
        ${statCard('対応中の問題', issues.length, 'トラブル・診断指摘・点検の要確認', issues.some((i) => i.level === 'red') ? 'red' : issues.length ? 'yellow' : 'green')}
      </div>
    </section>

    <!-- ===== サイト状態 ===== -->
    <section class="section card js-fade" aria-labelledby="status-title">
      <div class="card__header">
        <h2 class="card__title" id="status-title">サイトごとの状態</h2>
        <ul class="legend" aria-label="凡例">
          ${['green', 'yellow', 'red', 'grey'].map((lv) => html`<li class="legend__item">${statusDot(lv)}${STATUS_LEVELS[lv]}<span class="legend__count">${levelCount[lv]}</span></li>`)}
        </ul>
      </div>
      ${sites.length ? html`
        <ul class="site-tiles">
          ${statuses.map(({ site, level, reasons }) => html`
            <li class="site-tile site-tile--${level}">
              <a class="site-tile__link" href="#/sites/${site.id}">
                <div class="site-tile__head">
                  <span class="site-tile__name">${site.name}</span>
                  <span class="site-tile__type">${SITE_TYPES[site.siteType]}</span>
                </div>
                ${statusBadge(level)}
                <p class="site-tile__meta">最終点検：${formatDate(lastInspectionDate(db, site, today))}</p>
                ${reasons.length ? html`<ul class="site-tile__reasons">
                  ${reasons.slice(0, 3).map((r) => html`<li class="reason reason--${r.level}">${r.text}</li>`)}
                  ${reasons.length > 3 ? html`<li class="reason reason--more">ほか${reasons.length - 3}件</li>` : ''}
                </ul>` : html`<p class="site-tile__ok">すべての確認項目が問題なしです</p>`}
              </a>
            </li>`)}
        </ul>` : emptyState('運用中のサイトがありません。', html`<a class="btn btn--primary" href="#/sites">サイトを登録する</a>`)}
    </section>

    <div class="dash-grid">
      <!-- ===== 対応中の問題 ===== -->
      <section class="card js-fade" aria-labelledby="issue-title">
        <div class="card__header">
          <h2 class="card__title" id="issue-title">対応中の問題</h2>
          <span class="card__count">${issues.length}件</span>
        </div>
        ${issues.length ? html`<ul class="item-list">
          ${issues.slice(0, 8).map((i) => html`
            <li class="item-list__row">
              ${statusDot(i.level)}
              <div class="item-list__body">
                <p class="item-list__title">${badge('muted', i.kind)} ${i.title}</p>
                <p class="item-list__meta">${siteLink(i.siteId)}・${formatDate(i.date)}</p>
              </div>
            </li>`)}
        </ul>
        ${issues.length > 8 ? html`<p class="card__more">ほか${issues.length - 8}件</p>` : ''}` : emptyState('未解決の問題は登録されていません。')}
      </section>

      <!-- ===== 今後の予定 ===== -->
      <section class="card js-fade" aria-labelledby="upcoming-title">
        <div class="card__header">
          <h2 class="card__title" id="upcoming-title">次回の更新・契約確認予定</h2>
          <span class="card__count">90日以内</span>
        </div>
        ${upcoming.length ? html`<ul class="item-list">
          ${upcoming.map((u) => html`
            <li class="item-list__row">
              <span class="date-chip date-chip--${u.level}">${formatDate(u.date).slice(5)}<small>${u.label}</small></span>
              <div class="item-list__body">
                <p class="item-list__title">${badge('muted', u.kind)} ${u.title}</p>
                <p class="item-list__meta">${u.siteIds.length ? u.siteIds.map((id) => siteName(id)).join('、') : '対象サイト未設定'}</p>
              </div>
            </li>`)}
        </ul>` : emptyState('90日以内の予定はありません。契約やSSLの期限を登録すると表示されます。')}
      </section>

      <!-- ===== 点検が必要なサイト ===== -->
      <section class="card js-fade" aria-labelledby="need-title">
        <div class="card__header">
          <h2 class="card__title" id="need-title">点検が必要なサイト</h2>
          <span class="card__count">${needInspection.length}件</span>
        </div>
        ${needInspection.length ? html`<ul class="item-list">
          ${needInspection.slice(0, 6).map((s) => html`
            <li class="item-list__row">
              ${statusDot('grey')}
              <div class="item-list__body">
                <p class="item-list__title">${siteLink(s.id)}</p>
                <p class="item-list__meta">最終点検：${formatDate(lastInspectionDate(db, s, today))}${s.nextInspectionDate ? `・予定日：${formatDate(s.nextInspectionDate)}` : ''}</p>
              </div>
            </li>`)}
        </ul>
        ${needInspection.length > 6 ? html`<p class="card__more">ほか${needInspection.length - 6}件（<a class="link" href="#/sites">台帳で確認</a>）</p>` : ''}` : emptyState('点検期限内です。')}
      </section>

      <!-- ===== バックアップの警告 ===== -->
      <section class="card js-fade" aria-labelledby="backup-title">
        <div class="card__header">
          <h2 class="card__title" id="backup-title">バックアップの確認が必要</h2>
          <span class="card__count">${bAlerts.length}件</span>
        </div>
        ${bAlerts.length ? html`<ul class="item-list">
          ${bAlerts.slice(0, 6).map((b) => html`
            <li class="item-list__row">
              ${statusDot(b.level)}
              <div class="item-list__body">
                <p class="item-list__title">${siteLink(b.siteId)}</p>
                <p class="item-list__meta">${b.text}</p>
              </div>
            </li>`)}
        </ul>
        ${bAlerts.length > 6 ? html`<p class="card__more">ほか${bAlerts.length - 6}件</p>` : ''}` : emptyState('全サイトのバックアップが基準日数以内に確認されています。')}
      </section>
    </div>

    <!-- ===== 直近の作業履歴 ===== -->
    <section class="section card js-fade" aria-labelledby="recent-title">
      <div class="card__header">
        <h2 class="card__title" id="recent-title">直近の作業履歴</h2>
        <a class="link" href="#/worklogs">すべて見る →</a>
      </div>
      ${recent.length ? html`<ul class="timeline">
        ${recent.map((w) => html`
          <li class="timeline__item">
            <span class="timeline__date">${formatDate(w.occurredDate)}</span>
            <div class="timeline__body">
              <p class="timeline__title">${badge(w.kind === 'trouble' ? 'red' : 'blue', WORK_KIND[w.kind])} ${badge(w.status === 'done' ? 'green' : 'yellow', WORK_STATUS[w.status])} ${w.kind === 'trouble' ? w.troubleContent : w.workContent}</p>
              <p class="timeline__meta">${siteLink(w.siteId)}${w.assignee ? `・${w.assignee}` : ''}</p>
            </div>
          </li>`)}
      </ul>` : emptyState('作業履歴はまだありません。')}
    </section>
  `);
}
