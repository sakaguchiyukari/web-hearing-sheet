/**
 * 月次報告書のデータ作成
 * 指定月の月末（当月の場合は今日）を基準日として、その時点までの記録から集計する。
 * 画面プレビュー・印刷/PDF・CSV のすべてがこのデータを使う。
 */
import { todayStr, monthEnd, monthLabel, formatDate, daysBetween } from './utils.js';
import * as L from './labels.js';
import {
  siteStatus, siteInspections, countResults, latestBackups, siteSecurityReports,
  openIssues, upcomingEvents, isOpenScan, isOpenTodo
} from './status.js';

/* 専門用語のかんたんな説明（報告書の末尾に掲載） */
export const GLOSSARY = [
  ['WordPress（ワードプレス）', 'ホームページを作成・更新するための仕組み（CMS）。世界で最も使われており、狙われやすいため定期的な更新が必要です。'],
  ['CMS', '専門知識がなくてもページを更新できる管理システムの総称。WordPressやbears CMSなど。'],
  ['テーマ（SWELL）', 'WordPressサイトのデザインや機能を決める部品。更新が出たら適用します。'],
  ['プラグイン', 'WordPressに機能を追加する部品。古いままだと不正侵入の原因になることがあります。'],
  ['静的HTMLサイト', '管理システムを使わず、ページのファイルを直接置いているサイト。'],
  ['SSL証明書', 'サイトの通信を暗号化する仕組み（URLが https になる）。有効期限が切れると「安全でないサイト」と表示されます。'],
  ['ドメイン', 'サイトの住所にあたる名前（例：example.co.jp）。更新を忘れるとサイトが表示されなくなります。'],
  ['レンタルサーバー', 'サイトのデータを置いておく場所。管理画面のログインやWAFなどの設定もここで行います。'],
  ['WAF（ワフ）', 'サイトへの不正な通信を自動で止める防御機能。多くのレンタルサーバーに付属しています。'],
  ['DNS', 'ドメイン名とサーバーを結びつける設定。書き換えられると偽サイトに誘導されるおそれがあります。'],
  ['バックアップ', '万一に備えたデータの控え。WordPressのデータ控えと、サーバー全体の控えは別物です。'],
  ['復元（リストア）', 'バックアップからサイトを元の状態に戻すこと。手順を事前に確認しておくことが大切です。'],
  ['二段階認証', 'パスワードに加えて、スマホ等の確認コードでログインする仕組み。不正ログインを防ぎます。'],
  ['セキュリティ診断（外部）', '外部の専門サービスが、インターネット側からサイトの弱点（脆弱性）を調べるもの。'],
  ['不正ファイル検査（内部）', 'サーバーの中に、改ざんされたファイルやウイルスが置かれていないかを調べるもの。外部診断とは別に行います。'],
  ['脆弱性（ぜいじゃくせい）', 'システムの弱点。放置すると不正アクセスや改ざんにつながるおそれがあります。']
];

export const LEVEL_MARK = { green: '問題なし', yellow: '要確認', red: '至急対応', grey: '未確認' };

/**
 * @param {object} db 業務データ
 * @param {string} ym 'YYYY-MM'
 */
export function buildReport(db, ym) {
  const today = todayStr();
  const end = monthEnd(ym);
  const asOf = end < today ? end : today;
  const note = db.reportNotes[ym] || {};
  const sites = db.sites
    .filter((s) => s.active !== 'archived' && s.createdAt.slice(0, 10) <= asOf)
    .sort((a, b) => Object.keys(L.SITE_TYPES).indexOf(a.siteType) - Object.keys(L.SITE_TYPES).indexOf(b.siteType) || a.name.localeCompare(b.name, 'ja'));
  const siteIds = new Set(sites.map((s) => s.id));
  const inMonth = (d) => !!d && d.startsWith(ym);

  /* ---- 内訳 ---- */
  const breakdown = Object.entries(L.SITE_TYPES).map(([k, label]) => ({ type: k, label, count: sites.filter((s) => s.siteType === k).length }));

  /* ---- 今月の点検 ---- */
  const inspections = db.inspections
    .filter((i) => siteIds.has(i.siteId) && inMonth(i.date) && i.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((i) => ({ ...i, counts: countResults(i.items) }));

  /* ---- サイト別の状態 ---- */
  const siteRows = sites.map((site) => {
    const st = siteStatus(db, site, asOf);
    const monthInsp = inspections.filter((i) => i.siteId === site.id);
    const latest = siteInspections(db, site.id, asOf)[0];
    return {
      site,
      level: st.level,
      reasons: st.reasons,
      inspectedThisMonth: monthInsp.length > 0,
      lastInspection: latest?.date || site.lastInspectionManual || '',
      latestCounts: latest ? countResults(latest.items) : null
    };
  });
  const byLevel = (lv) => siteRows.filter((r) => r.level === lv);

  /* ---- セキュリティ ---- */
  const security = sites.map((site) => {
    const reports = siteSecurityReports(db, site.id, asOf);
    const scans = db.serverScans.filter((x) => x.siteId === site.id && x.scanDate <= asOf).sort((a, b) => b.scanDate.localeCompare(a.scanDate));
    const r = reports[0];
    return {
      site,
      report: r ? { ...r, serviceName: db.securityServices.find((s) => s.id === r.serviceId)?.name || '' } : null,
      reportsThisMonth: reports.filter((x) => inMonth(x.diagnosisDate) || inMonth(x.receivedDate)).length,
      scan: scans[0] || null,
      openScans: scans.filter(isOpenScan).length
    };
  });

  /* ---- バックアップ ---- */
  const backups = sites.map((site) => {
    const latest = latestBackups(db, site.id, asOf);
    const all = Object.values(latest);
    const newest = all.map((b) => b.backupDate).sort().pop() || '';
    const age = newest ? daysBetween(newest, asOf) : null;
    return {
      site,
      wordpress: latest.wordpress || null,
      server: latest.server || null,
      vendor: latest.vendor || null,
      newest,
      level: !newest ? 'grey' : age > db.settings.backupStaleDays ? 'yellow' : 'green',
      restoreVerified: all.some((b) => b.restoreVerified === 'yes')
    };
  });

  /* ---- サーバー・ドメイン・SSL ---- */
  const expiryLevel = (date, alertDays) => {
    if (!date) return { days: null, level: 'grey' };
    const days = daysBetween(asOf, date);
    return { days, level: days < 0 ? 'red' : days <= alertDays ? 'yellow' : 'green' };
  };
  const infra = sites.map((site) => ({
    site,
    domain: expiryLevel(site.domainExpiry, db.settings.domainAlertDays),
    ssl: expiryLevel(site.sslExpiry, db.settings.sslAlertDays)
  }));

  /* ---- ToDo ---- */
  const todoSite = (t) => !t.siteId || siteIds.has(t.siteId);
  const rank = { urgent: 0, high: 1, normal: 2 };
  const openTodos = db.todos
    .filter((t) => todoSite(t) && isOpenTodo(t))
    .map((t) => ({ ...t, overdue: !!t.dueDate && t.dueDate < asOf }))
    .sort((a, b) => rank[a.priority] - rank[b.priority] || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const doneTodos = db.todos.filter((t) => todoSite(t) && t.status === 'done' && inMonth(t.completedDate));

  /* ---- 今月の作業 ---- */
  const works = db.worklogs
    .filter((w) => siteIds.has(w.siteId) && inMonth(w.occurredDate) && w.occurredDate <= asOf)
    .sort((a, b) => a.occurredDate.localeCompare(b.occurredDate));

  /* ---- 対応中の問題・今後の予定 ---- */
  const issues = openIssues(db, asOf).filter((i) => siteIds.has(i.siteId));
  const upcoming = upcomingEvents(db, 62, asOf);

  /* ---- 一目で分かるまとめ ---- */
  const checked = {
    inspections: inspections.length,
    inspectedSites: new Set(inspections.map((i) => i.siteId)).size,
    securityReports: security.reduce((n, s) => n + s.reportsThisMonth, 0),
    scans: db.serverScans.filter((x) => siteIds.has(x.siteId) && inMonth(x.scanDate) && x.scanDate <= asOf).length,
    backups: db.backups.filter((b) => siteIds.has(b.siteId) && inMonth(b.backupDate) && b.backupDate <= asOf).length,
    works: works.filter((w) => w.kind === 'work').length,
    troubles: works.filter((w) => w.kind === 'trouble').length,
    todosDone: doneTodos.length
  };

  return {
    ym,
    label: monthLabel(ym),
    asOf,
    isCurrentMonth: end >= today,
    reportDate: note.reportDate || today,
    author: note.author || '',
    orgName: db.settings.orgName || '',
    plans: note.plans || '',
    special: note.special || '',
    sites,
    breakdown,
    inspections,
    siteRows,
    groups: { green: byLevel('green'), yellow: byLevel('yellow'), red: byLevel('red'), grey: byLevel('grey') },
    security,
    backups,
    infra,
    openTodos,
    doneTodos,
    works,
    issues,
    upcoming,
    checked,
    siteName: (id) => db.sites.find((s) => s.id === id)?.name || '（削除されたサイト）'
  };
}

/** 点検結果を文章にする（例：問題なし 9・要確認 1） */
export function countsText(c) {
  if (!c) return '記録なし';
  return ['ok', 'done', 'check', 'progress', 'unchecked', 'na']
    .filter((k) => c[k])
    .map((k) => `${L.RESULTS[k]} ${c[k]}`)
    .join('・') || '項目なし';
}

/** 報告書をCSV用の行に変換 */
export function reportToCsvRows(m) {
  const rows = [];
  const section = (title, header, data) => {
    rows.push([`■ ${title}`]);
    if (header) rows.push(header);
    data.forEach((r) => rows.push(r));
    rows.push([]);
  };
  section('報告書情報', ['項目', '内容'], [
    ['対象月', m.label], ['報告日', formatDate(m.reportDate)], ['報告者', m.author], ['集計基準日', formatDate(m.asOf)], ['管理対象サイト数', m.sites.length]
  ]);
  section('まとめ', ['区分', 'サイト数', 'サイト名'], Object.entries(LEVEL_MARK).map(([lv, label]) => [label, m.groups[lv].length, m.groups[lv].map((r) => r.site.name).join('、')]));
  section('サイトの内訳', ['種類', 'サイト数'], m.breakdown.map((b) => [b.label, b.count]));
  section('今月実施した点検', ['点検日', 'サイト', '担当者', '結果', 'コメント'], m.inspections.map((i) => [formatDate(i.date), m.siteName(i.siteId), i.inspector, countsText(i.counts), i.summary]));
  section('サイト別の点検結果・状態', ['サイト', '種類', '今月の点検', '最終点検日', '状態', '主な理由'], m.siteRows.map((r) => [
    r.site.name, L.SITE_TYPES[r.site.siteType], r.inspectedThisMonth ? '実施' : '未実施', formatDate(r.lastInspection), LEVEL_MARK[r.level], r.reasons.map((x) => x.text).join(' / ')
  ]));
  section('セキュリティ診断の状況', ['サイト', '診断サービス', '最終診断日', '診断結果', '重要度', '対応状況', '内部検査日', '内部検査結果'], m.security.map((s) => [
    s.site.name, s.report?.serviceName || '', formatDate(s.report?.diagnosisDate || s.report?.receivedDate), s.report ? L.SEC_RESULT[s.report.result] : '未確認',
    s.report ? L.SEVERITY[s.report.severity] : '', s.report ? L.RESPONSE_STATUS[s.report.responseStatus] : '', formatDate(s.scan?.scanDate), s.scan ? L.SCAN_RESULT[s.scan.result] : '未確認'
  ]));
  section('バックアップの状況', ['サイト', 'WordPress', 'サーバー全体', '制作会社管理', '判定', '復元確認'], m.backups.map((b) => [
    b.site.name, formatDate(b.wordpress?.backupDate), formatDate(b.server?.backupDate), formatDate(b.vendor?.backupDate),
    { green: '基準内', yellow: '古い', grey: '未確認' }[b.level], b.restoreVerified ? '確認済み' : '未確認'
  ]));
  section('サーバー・ドメイン・SSLの状況', ['サイト', 'サーバー会社', 'ドメイン管理会社', 'ドメイン有効期限', 'ドメイン残り日数', 'SSL有効期限', 'SSL残り日数'], m.infra.map((x) => [
    x.site.name, x.site.serverCompany, x.site.domainRegistrar, formatDate(x.site.domainExpiry), x.domain.days ?? '未登録', formatDate(x.site.sslExpiry), x.ssl.days ?? '未登録'
  ]));
  section('未完了のToDo', ['やること', 'サイト', '優先度', '状況', '期限', '担当者'], m.openTodos.map((t) => [
    t.title, t.siteId ? m.siteName(t.siteId) : '全サイト共通', L.PRIORITY[t.priority], L.TODO_STATUS[t.status], formatDate(t.dueDate), t.assignee
  ]));
  section('今月完了したToDo', ['やること', 'サイト', '完了日'], m.doneTodos.map((t) => [t.title, t.siteId ? m.siteName(t.siteId) : '全サイト共通', formatDate(t.completedDate)]));
  section('対応中の問題', ['区分', 'サイト', '日付', '内容', '緊急度'], m.issues.map((i) => [i.kind, m.siteName(i.siteId), formatDate(i.date), i.title, LEVEL_MARK[i.level]]));
  section('今後の対応予定（期日あり）', ['日付', '区分', '内容', '対象サイト'], m.upcoming.map((u) => [formatDate(u.date), u.kind, u.title, u.siteIds.map(m.siteName).join('、')]));
  section('今後の対応予定（記入）', null, [[m.plans]]);
  section('特記事項', null, [[m.special]]);
  return rows;
}
