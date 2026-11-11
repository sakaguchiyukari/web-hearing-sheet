/**
 * 月次報告書のHTML生成（A4縦・社内提出用）
 * 上司が専門知識なしで読めるよう、各章に「この項目の意味」を一文で添える。
 */
import { html, formatDate, daysLeftText } from './utils.js';
import * as L from './labels.js';
import { GLOSSARY, LEVEL_MARK, countsText } from './report-model.js';

const mark = (level, text = LEVEL_MARK[level]) => html`<span class="report__mark report__mark--${level}">${text}</span>`;

const none = (text) => html`<p class="report__explain">${text}</p>`;

let sectionNo = 0;
const section = (title, explain, body, extraClass = '') => {
  sectionNo += 1;
  return html`<section class="report__section ${extraClass}">
    <h2 class="report__h2"><span class="report__h2-num">${sectionNo}.</span>${title}</h2>
    ${explain ? html`<p class="report__explain">${explain}</p>` : ''}
    ${body}
  </section>`;
};

const reportTable = (headers, rows) => html`<table class="report__table">
  <thead><tr>${headers.map((h) => html`<th>${h}</th>`)}</tr></thead>
  <tbody>${rows.map((r) => html`<tr>${r.map((c) => html`<td>${c}</td>`)}</tr>`)}</tbody>
</table>`;

const nameList = (rows) => (rows.length ? html`<ul class="report__summary-list">${rows.map((r) => html`<li>${r.site.name}</li>`)}</ul>` : html`<p class="report__explain">該当なし</p>`);

export function renderReport(m) {
  sectionNo = 0;
  const g = m.groups;
  const c = m.checked;
  const need = [...g.red, ...g.yellow];

  return html`<article class="report">
    <!-- ===== 表紙・見出し ===== -->
    <header class="report__header">
      <div>
        <p class="report__explain">${m.orgName ? `${m.orgName} ` : ''}Webサイト管理</p>
        <h1 class="report__title">Webサイト管理状況報告書（${m.label}）</h1>
      </div>
      <div class="report__meta">
        <p>報告日：${formatDate(m.reportDate)}</p>
        <p>報告者：${m.author || '（未記入）'}</p>
        <p>集計基準日：${formatDate(m.asOf)}${m.isCurrentMonth ? '（月途中）' : ''}</p>
      </div>
    </header>

    <!-- ===== 1. 今月のまとめ ===== -->
    ${section('今月のまとめ', '今月確認したこと、問題がなかったもの、対応が必要なもの・未確認のものを整理しています。', html`
      <div class="report__lead-box">
        <p>管理対象 <strong>${m.sites.length}サイト</strong> のうち、今月は <strong>${c.inspectedSites}サイト</strong> で日常点検（計${c.inspections}回）を実施しました。</p>
        <p>そのほか、セキュリティ診断結果の確認 ${c.securityReports}件、サーバー内部の検査 ${c.scans}件、バックアップの記録 ${c.backups}件、作業 ${c.works}件、トラブル対応 ${c.troubles}件、ToDoの完了 ${c.todosDone}件 を記録しています。</p>
        <p>現在の状態は、問題なし <strong>${g.green.length}</strong>、対応が必要 <strong>${need.length}</strong>（うち至急 ${g.red.length}）、未確認 <strong>${g.grey.length}</strong> サイトです。対応中の問題は <strong>${m.issues.length}件</strong> です。</p>
      </div>
      <div class="report__summary">
        <div class="report__summary-box report__summary-box--green">
          <p class="report__summary-label">問題なし（確認済み）</p>
          <p class="report__summary-value">${g.green.length}<small> サイト</small></p>
          ${nameList(g.green)}
        </div>
        <div class="report__summary-box report__summary-box--${g.red.length ? 'red' : 'yellow'}">
          <p class="report__summary-label">対応が必要（要確認・至急）</p>
          <p class="report__summary-value">${need.length}<small> サイト</small></p>
          ${nameList(need)}
        </div>
        <div class="report__summary-box report__summary-box--grey">
          <p class="report__summary-label">未確認（記録なし・期限切れ）</p>
          <p class="report__summary-value">${g.grey.length}<small> サイト</small></p>
          ${nameList(g.grey)}
        </div>
      </div>
      <p class="report__explain">※「未確認」は確認の記録がないものです。問題がないとは判断していません。</p>`)}

    <!-- ===== 2. 管理対象サイト ===== -->
    ${section('管理対象サイト数と内訳', '現在運用中で、このシステムで管理しているサイトです。', reportTable(
      ['サイトの種類', 'サイト数', '説明'],
      [
        ...m.breakdown.map((b) => [b.label, `${b.count}サイト`, {
          wordpress: '更新の多い一般的な仕組み。本体・テーマ・プラグインの更新確認が必要',
          static: '管理システムを使わないサイト。不要ファイル・フォームのプログラム・サーバー設定の確認が中心',
          bears: 'CMSの保守は制作会社が担当。自社は編集とサーバー・ドメインの管理を担当',
          other: 'その他の仕組みで作られたサイト'
        }[b.type]]),
        [html`<strong>合計</strong>`, html`<strong>${m.sites.length}サイト</strong>`, '']
      ]
    ))}

    <!-- ===== 3. 今月実施した点検 ===== -->
    ${section('今月実施した点検', '担当者がサイトごとに決められた項目を確認した記録です。', m.inspections.length
      ? reportTable(['点検日', 'サイト', '担当者', '結果の内訳', 'コメント'], m.inspections.map((i) => [
        formatDate(i.date), m.siteName(i.siteId), i.inspector, countsText(i.counts), i.summary || '—'
      ]))
      : none('今月の点検記録はありません。'))}

    <!-- ===== 4. 点検結果（サイト別の状態） ===== -->
    ${section('点検結果とサイト別の状態', '点検・SSL・ドメイン・バックアップ・セキュリティ診断・ToDoの記録から判定した、各サイトの現在の状態です。', reportTable(
      ['サイト', '種類', '今月の点検', '最終点検日', '状態', '主な理由'],
      m.siteRows.map((r) => [
        r.site.name, L.SITE_TYPES[r.site.siteType], r.inspectedThisMonth ? '実施' : mark('grey', '未実施'),
        formatDate(r.lastInspection), mark(r.level),
        r.reasons.length ? html`<ul class="report__list">${r.reasons.slice(0, 3).map((x) => html`<li>${x.text}</li>`)}</ul>${r.reasons.length > 3 ? `ほか${r.reasons.length - 3}件` : ''}` : '確認済み・問題なし'
      ])
    ))}

    <!-- ===== 5. セキュリティ ===== -->
    ${section('セキュリティ診断の状況', '外部の診断サービスによるチェック（外からの弱点調査）と、サーバー内部の不正ファイル検査は別のものとして記載しています。結果の登録がないものは「未確認」です。', reportTable(
      ['サイト', '外部診断（サービス・日付）', '診断結果', '重要度 / 対応状況', 'サーバー内部の検査'],
      m.security.map((s) => [
        s.site.name,
        s.report ? html`${s.report.serviceName}<br>${formatDate(s.report.diagnosisDate || s.report.receivedDate)}` : '—',
        s.report ? mark({ ok: 'green', findings: 'red', unchecked: 'grey' }[s.report.result], L.SEC_RESULT[s.report.result]) : mark('grey'),
        s.report && s.report.result === 'findings' ? `${L.SEVERITY[s.report.severity]} / ${L.RESPONSE_STATUS[s.report.responseStatus]}` : '—',
        s.scan ? html`${mark({ clean: 'green', detected: 'red', unchecked: 'grey' }[s.scan.result], L.SCAN_RESULT[s.scan.result])} ${formatDate(s.scan.scanDate)}` : mark('grey')
      ])
    ))}

    <!-- ===== 6. バックアップ ===== -->
    ${section('バックアップの状況', 'WordPressのデータの控えと、サーバー全体の控えを分けて記載しています。基準日数を超えたものは「古い」、記録がないものは「未確認」です。', reportTable(
      ['サイト', 'WordPress', 'サーバー全体', '制作会社管理', '判定', '復元方法の確認'],
      m.backups.map((b) => [
        b.site.name,
        b.site.siteType === 'wordpress' ? formatDate(b.wordpress?.backupDate) : '対象外',
        formatDate(b.server?.backupDate),
        formatDate(b.vendor?.backupDate),
        mark(b.level, { green: '基準内', yellow: '古い', grey: '未確認' }[b.level]),
        b.restoreVerified ? '確認済み' : '未確認'
      ])
    ))}

    <!-- ===== 7. サーバー・ドメイン・SSL ===== -->
    ${section('サーバー・ドメイン・SSLの状況', 'ドメイン（サイトの住所）やSSL証明書（通信の暗号化）の期限が切れると、サイトが表示されなくなったり、第三者に悪用されるおそれがあります。期限が未登録のものは「未登録」です。', reportTable(
      ['サイト', 'サーバー会社', 'ドメイン管理会社', 'ドメイン有効期限', 'SSL有効期限'],
      m.infra.map((x) => [
        x.site.name,
        x.site.serverCompany || '—',
        x.site.domainRegistrar || '—',
        x.site.domainExpiry ? html`${mark(x.domain.level, formatDate(x.site.domainExpiry))}<br><small>${daysLeftText(x.domain.days)}</small>` : mark('grey', '未登録'),
        x.site.sslExpiry ? html`${mark(x.ssl.level, formatDate(x.site.sslExpiry))}<br><small>${daysLeftText(x.ssl.days)}</small>` : mark('grey', '未登録')
      ])
    ))}

    <!-- ===== ToDo ===== -->
    ${section('ToDo（対応リスト）の状況', `対応が必要な作業の一覧です。今月完了したものは ${m.doneTodos.length}件、未完了は ${m.openTodos.length}件（うち期限超過 ${m.openTodos.filter((t) => t.overdue).length}件）です。`, html`
      ${m.openTodos.length
        ? reportTable(['やること', 'サイト', '優先度', '状況', '期限', '担当者'], m.openTodos.map((t) => [
          t.title, t.siteId ? m.siteName(t.siteId) : '全サイト共通',
          t.priority === 'normal' ? L.PRIORITY[t.priority] : mark(t.priority === 'urgent' ? 'red' : 'yellow', L.PRIORITY[t.priority]),
          L.TODO_STATUS[t.status],
          t.dueDate ? (t.overdue ? mark('red', `${formatDate(t.dueDate)} 超過`) : formatDate(t.dueDate)) : '—',
          t.assignee || '—'
        ]))
        : none('未完了のToDoはありません。')}
      ${m.doneTodos.length ? html`<p class="report__explain">今月完了：${m.doneTodos.map((t) => t.title).join('／')}</p>` : ''}`)}

    <!-- ===== 対応中の問題 ===== -->
    ${section('対応中の問題', '解決していないトラブル、診断での指摘、点検で「要確認・対応中」となった項目です。', m.issues.length
      ? reportTable(['緊急度', '区分', 'サイト', '発生・確認日', '内容'], m.issues.map((i) => [
        mark(i.level), i.kind, m.siteName(i.siteId), formatDate(i.date), i.title
      ]))
      : none('対応中の問題はありません。'))}

    <!-- ===== 9. 今後の対応予定 ===== -->
    ${section('今後の対応予定', '期日が登録されている予定（約2か月以内・期限超過を含む）と、担当者が記入した予定です。', html`
      ${m.upcoming.length
        ? reportTable(['日付', '区分', '内容', '対象サイト'], m.upcoming.map((u) => [
          html`${mark(u.level, formatDate(u.date))}<br><small>${u.label}</small>`, u.kind, u.title, u.siteIds.map(m.siteName).join('、') || '—'
        ]))
        : none('期日のある予定はありません。')}
      <p class="report__explain">担当者記入：</p>
      <div class="report__text">${m.plans || '（記入なし）'}</div>`)}

    <!-- ===== 10. 特記事項 ===== -->
    ${section('特記事項', '', html`<div class="report__text">${m.special || '（特になし）'}</div>`)}

    <!-- ===== 用語の説明 ===== -->
    <section class="report__section">
      <h2 class="report__h2">用語のかんたんな説明</h2>
      <dl class="report__glossary">
        ${GLOSSARY.map(([term, desc]) => html`<div><dt>${term}</dt><dd>${desc}</dd></div>`)}
      </dl>
    </section>

    <footer class="report__footer">
      <p>※ この報告書は、担当者が手動で記録した点検・作業・診断結果をもとに自動集計したものです。外部サーバーへの自動アクセスや自動診断は行っていません。</p>
      <p>※ 対応状況（未対応・対応中など）は報告書作成時点の内容です。過去月の報告書では、点検日・診断日などの日付が基準日以前の記録で集計しています。</p>
    </footer>
  </article>`;
}
