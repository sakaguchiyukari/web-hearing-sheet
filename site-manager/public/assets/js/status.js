/**
 * 状態判定ロジック（色分け・集計）
 * 優先度：赤 ＞ 黄 ＞ グレー ＞ 緑
 * 「確認していないもの」は決して緑（問題なし）にしない。
 * asOf（基準日）を指定すると、その日までの記録だけで判定する（過去月の報告書用）。
 */
import { daysBetween, addDays, todayStr, formatDate, daysLeftText } from './utils.js';

export const LEVEL_ORDER = { green: 0, grey: 1, yellow: 2, red: 3 };
export const maxLevel = (levels) => levels.reduce((a, b) => (LEVEL_ORDER[b] > LEVEL_ORDER[a] ? b : a), 'green');

/* ---------- サイト単位の記録取得 ---------- */

export const siteInspections = (db, siteId, asOf = todayStr()) => db.inspections
  .filter((i) => i.siteId === siteId && i.date <= asOf)
  .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

/** 最終点検日（点検記録がなければ導入前の手入力値） */
export function lastInspectionDate(db, site, asOf = todayStr()) {
  const latest = siteInspections(db, site.id, asOf)[0];
  if (latest) return latest.date;
  return site.lastInspectionManual && site.lastInspectionManual <= asOf ? site.lastInspectionManual : '';
}

/** 点検結果の件数集計 */
export function countResults(items = []) {
  const c = { ok: 0, check: 0, progress: 0, done: 0, unchecked: 0, na: 0 };
  items.forEach((it) => { c[it.result] = (c[it.result] || 0) + 1; });
  return c;
}

/** 種類別の最新バックアップ */
export function latestBackups(db, siteId, asOf = todayStr()) {
  const out = {};
  db.backups
    .filter((b) => b.siteId === siteId && b.backupDate && b.backupDate <= asOf)
    .forEach((b) => {
      if (!out[b.kind] || out[b.kind].backupDate < b.backupDate) out[b.kind] = b;
    });
  return out;
}

const reportDate = (r) => r.diagnosisDate || r.receivedDate || r.createdAt.slice(0, 10);

export const siteSecurityReports = (db, siteId, asOf = todayStr()) => db.securityReports
  .filter((r) => r.siteId === siteId && reportDate(r) <= asOf)
  .sort((a, b) => reportDate(b).localeCompare(reportDate(a)));

/** 未対応の診断指摘か */
export const isOpenFinding = (r) => r.result === 'findings' && ['unchecked', 'open', 'progress'].includes(r.responseStatus);
/** 未解決の不正ファイル検出か */
export const isOpenScan = (s) => s.result === 'detected' && ['open', 'progress'].includes(s.status);
/** 未解決のトラブルか */
export const isOpenTrouble = (w) => w.kind === 'trouble' && w.status !== 'done';

/* ---------- サイトの状態判定 ---------- */

/**
 * @returns {{level: 'red'|'yellow'|'grey'|'green', reasons: {level:string, text:string}[]}}
 */
export function siteStatus(db, site, asOf = todayStr()) {
  const s = db.settings;
  const reasons = [];
  const add = (level, text) => reasons.push({ level, text });

  /* --- 日常点検 --- */
  const latest = siteInspections(db, site.id, asOf)[0];
  const lastDate = lastInspectionDate(db, site, asOf);
  if (!lastDate) {
    add('grey', '点検記録がありません（未確認）');
  } else {
    const age = daysBetween(lastDate, asOf);
    if (age > s.inspectionIntervalDays) add('grey', `前回点検から${age}日経過しています（今期未確認）`);
  }
  if (site.nextInspectionDate && site.nextInspectionDate < asOf) {
    add('yellow', `次回点検予定日（${formatDate(site.nextInspectionDate)}）を過ぎています`);
  }
  if (latest) {
    const c = countResults(latest.items);
    if (c.check) add('yellow', `前回点検で「要確認」が${c.check}件あります`);
    if (c.progress) add('yellow', `前回点検で「対応中」が${c.progress}件あります`);
    if (c.unchecked) add('grey', `前回点検で「未確認」の項目が${c.unchecked}件あります`);
  }

  /* --- SSL証明書 --- */
  if (site.sslExpiry) {
    const d = daysBetween(asOf, site.sslExpiry);
    if (d < 0) add('red', `SSL証明書の有効期限が切れています（${formatDate(site.sslExpiry)}）`);
    else if (d <= s.sslAlertDays) add('yellow', `SSL証明書の有効期限まであと${d}日です`);
  }
  if (site.sslStatus === 'unchecked') add('grey', 'SSL証明書の状況が未確認です');
  else if (site.sslStatus === 'expired' && !(site.sslExpiry && site.sslExpiry < asOf)) add('red', 'SSL証明書が期限切れと記録されています');
  else if (site.sslStatus === 'expiring') add('yellow', 'SSL証明書が期限間近と記録されています');
  else if (site.sslStatus === 'none') add('yellow', 'SSL（https）が設定されていません');

  /* --- バックアップ --- */
  const backups = Object.values(latestBackups(db, site.id, asOf));
  if (!backups.length) {
    add('grey', 'バックアップの記録がありません（未確認）');
  } else {
    const newest = backups.map((b) => b.backupDate).sort().pop();
    const age = daysBetween(newest, asOf);
    if (age > s.backupStaleDays) add('yellow', `最終バックアップから${age}日経過しています`);
  }

  /* --- セキュリティ診断（外部） --- */
  const reports = siteSecurityReports(db, site.id, asOf);
  if (!reports.length) {
    add('grey', 'セキュリティ診断の結果が登録されていません（未確認）');
  } else {
    if (reports[0].result === 'unchecked') add('grey', '最新のセキュリティ診断結果が未確認です');
    reports.filter(isOpenFinding).forEach((r) => {
      if (['high', 'critical'].includes(r.severity)) add('red', `重要度「高」以上の診断指摘が未対応です`);
      else add('yellow', '未対応の診断指摘があります');
    });
    const next = reports[0].nextCheckDate;
    if (next && next < asOf) add('yellow', `診断の次回確認日（${formatDate(next)}）を過ぎています`);
  }

  /* --- サーバー内部の不正ファイル検査 --- */
  db.serverScans
    .filter((x) => x.siteId === site.id && x.scanDate <= asOf && isOpenScan(x))
    .forEach(() => add('red', '不正ファイルの検出が未解決です'));

  /* --- トラブル --- */
  db.worklogs
    .filter((w) => w.siteId === site.id && w.occurredDate <= asOf && isOpenTrouble(w))
    .forEach((w) => add(w.priority === 'urgent' ? 'red' : 'yellow', `未解決のトラブルがあります（${formatDate(w.occurredDate)}発生）`));

  /* --- 契約 --- */
  db.contracts
    .filter((c) => c.status === 'active' && c.siteIds.includes(site.id) && c.nextRenewalDate)
    .forEach((c) => {
      const d = daysBetween(asOf, c.nextRenewalDate);
      if (d < 0) add('red', `契約「${c.serviceName}」の更新日を過ぎています（更新済みなら次回更新日を修正）`);
      else if (d <= s.contractAlertDays) add('yellow', `契約「${c.serviceName}」の更新日まであと${d}日です`);
    });

  // 重複する理由をまとめる
  const unique = [];
  reasons.forEach((r) => { if (!unique.some((u) => u.text === r.text)) unique.push(r); });
  unique.sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level]);

  return { level: maxLevel(unique.map((r) => r.level)), reasons: unique };
}

/** 点検が必要か（記録なし・間隔超過・予定日到来） */
export function needsInspection(db, site, asOf = todayStr()) {
  const last = lastInspectionDate(db, site, asOf);
  if (!last) return true;
  if (daysBetween(last, asOf) > db.settings.inspectionIntervalDays) return true;
  return !!(site.nextInspectionDate && site.nextInspectionDate <= asOf);
}

/* ---------- 対応中の問題（横断） ---------- */

/**
 * 未解決の問題一覧
 * @returns {{kind:string, siteId:string, date:string, title:string, level:string, ref:object}[]}
 */
export function openIssues(db, asOf = todayStr()) {
  const items = [];
  const sites = db.sites.filter((s) => s.active !== 'archived');
  const activeIds = new Set(sites.map((s) => s.id));

  db.worklogs.filter((w) => activeIds.has(w.siteId) && isOpenTrouble(w) && w.occurredDate <= asOf).forEach((w) => items.push({
    kind: 'トラブル', siteId: w.siteId, date: w.occurredDate, level: w.priority === 'urgent' ? 'red' : 'yellow',
    title: w.troubleContent || w.workContent || '（内容未入力）', ref: w, collection: 'worklogs'
  }));

  db.securityReports.filter((r) => activeIds.has(r.siteId) && isOpenFinding(r)).forEach((r) => items.push({
    kind: '診断指摘', siteId: r.siteId, date: r.diagnosisDate || r.receivedDate, level: ['high', 'critical'].includes(r.severity) ? 'red' : 'yellow',
    title: r.findings || '（指摘内容未入力）', ref: r, collection: 'securityReports'
  }));

  db.serverScans.filter((x) => activeIds.has(x.siteId) && isOpenScan(x)).forEach((x) => items.push({
    kind: '不正ファイル', siteId: x.siteId, date: x.scanDate, level: 'red',
    title: x.detail || '不審ファイル検出', ref: x, collection: 'serverScans'
  }));

  sites.forEach((site) => {
    const latest = siteInspections(db, site.id, asOf)[0];
    if (!latest) return;
    latest.items.filter((it) => it.result === 'check' || it.result === 'progress').forEach((it) => items.push({
      kind: '点検', siteId: site.id, date: latest.date, level: 'yellow',
      title: `${it.label}：${it.result === 'check' ? '要確認' : '対応中'}${it.comment ? `（${it.comment}）` : ''}`, ref: latest, collection: 'inspections'
    }));
  });

  return items.sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level] || (b.date || '').localeCompare(a.date || ''));
}

/* ---------- 今後の予定（横断） ---------- */

/**
 * 期日のある予定（期限超過も含む）
 * @param {number} withinDays 何日先まで含めるか
 */
export function upcomingEvents(db, withinDays = 90, asOf = todayStr()) {
  const limit = addDays(asOf, withinDays);
  const list = [];
  const push = (date, kind, title, siteIds, alertDays) => {
    if (!date || date > limit) return;
    const days = daysBetween(asOf, date);
    const level = days < 0 ? 'red' : days <= alertDays ? 'yellow' : 'grey';
    list.push({ date, kind, title, siteIds, days, level, label: daysLeftText(days) });
  };
  const s = db.settings;
  const sites = db.sites.filter((x) => x.active !== 'archived');

  db.contracts.filter((c) => c.status === 'active').forEach((c) => push(c.nextRenewalDate, '契約更新', c.serviceName, c.siteIds, s.contractAlertDays));
  sites.forEach((site) => {
    push(site.sslExpiry, 'SSL期限', 'SSL証明書の有効期限', [site.id], s.sslAlertDays);
    push(site.nextInspectionDate, '点検予定', '次回点検予定日', [site.id], 7);
    const latestReport = siteSecurityReports(db, site.id, asOf)[0];
    if (latestReport) push(latestReport.nextCheckDate, '診断確認', 'セキュリティ診断の次回確認', [site.id], 7);
  });
  const latestScan = {};
  db.serverScans.forEach((x) => { if (!latestScan[x.siteId] || latestScan[x.siteId].scanDate < x.scanDate) latestScan[x.siteId] = x; });
  Object.values(latestScan).forEach((x) => {
    if (sites.some((site) => site.id === x.siteId)) push(x.nextDate, '内部検査', '不正ファイル検査の予定', [x.siteId], 7);
  });

  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- バックアップの警告 ---------- */
export function backupAlerts(db, asOf = todayStr()) {
  const out = [];
  db.sites.filter((s) => s.active !== 'archived').forEach((site) => {
    const latest = latestBackups(db, site.id, asOf);
    const all = Object.values(latest);
    if (!all.length) {
      out.push({ siteId: site.id, level: 'grey', text: 'バックアップ記録なし（未確認）' });
      return;
    }
    const newest = all.map((b) => b.backupDate).sort().pop();
    const age = daysBetween(newest, asOf);
    if (age > db.settings.backupStaleDays) out.push({ siteId: site.id, level: 'yellow', text: `最終バックアップから${age}日経過` });
  });
  return out;
}
