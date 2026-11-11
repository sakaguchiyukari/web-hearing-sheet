/**
 * 設定
 * - 基本設定（組織名・担当者・警告の日数）
 * - 点検項目テンプレート（サイトの種類ごと）
 * - ユーザー管理・パスワード変更
 * - データのバックアップ・復元・CSV出力
 */
import { api } from '../api.js';
import { state, siteName } from '../state.js';
import { html, raw, formatDate, formatBytes, todayStr } from '../utils.js';
import * as L from '../labels.js';
import { pageHeader, toast, confirmDialog, table, badge } from '../ui.js';
import { renderFields, readFields } from '../form.js';
import { notifyChanged } from '../editors.js';
import { downloadCsv } from '../csv.js';
import { lastInspectionDate, siteInspections, siteStatus } from '../status.js';

const local = { checklistType: 'wordpress', draft: null };

/* =========================================================
   基本設定
   ========================================================= */
const settingFields = () => [
  { name: 'orgName', label: '組織名・部署名', type: 'text', maxlength: 100, placeholder: '例）株式会社〇〇 総務部', help: 'メニューと報告書に表示されます' },
  { name: 'staff', label: '担当者の候補（1行に1名）', type: 'textarea', rows: 4, maxlength: 3000, placeholder: '山田\n佐藤', help: '入力欄の候補として表示されます' },
  { name: 'inspectionIntervalDays', label: '点検の間隔（日）', type: 'number', required: true, min: 1, max: 366, step: 1, help: 'この日数を過ぎると「未確認（点検期限切れ）」になります' },
  { name: 'backupStaleDays', label: 'バックアップが古いと判断する日数', type: 'number', required: true, min: 1, max: 366, step: 1 },
  { name: 'sslAlertDays', label: 'SSL期限の警告（何日前から）', type: 'number', required: true, min: 1, max: 366, step: 1 },
  { name: 'domainAlertDays', label: 'ドメイン期限の警告（何日前から）', type: 'number', required: true, min: 1, max: 366, step: 1 }
];

/* =========================================================
   点検項目エディタ
   ========================================================= */
function checklistRows(items) {
  return html`${items.map((it, i) => html`<li class="list-editor__row" data-index="${i}">
    <select class="input input--select input--sm" aria-label="分類" data-field="category">
      ${Object.entries(L.CHECK_CATEGORIES).map(([k, v]) => html`<option value="${k}"${(it.category || 'other') === k ? raw(' selected') : ''}>${v}</option>`)}
    </select>
    <input class="input input--sm" type="text" value="${it.label}" maxlength="200" required aria-label="点検項目名" data-field="label" placeholder="点検項目名">
    <input class="input input--sm list-editor__hint" type="text" value="${it.hint}" maxlength="300" aria-label="確認方法のヒント" data-field="hint" placeholder="確認方法のヒント（任意）">
    <span class="list-editor__buttons">
      <button type="button" class="btn btn--ghost btn--sm" data-move="-1" aria-label="上へ"${i === 0 ? raw(' disabled') : ''}>↑</button>
      <button type="button" class="btn btn--ghost btn--sm" data-move="1" aria-label="下へ"${i === items.length - 1 ? raw(' disabled') : ''}>↓</button>
      <button type="button" class="btn btn--danger-ghost btn--sm" data-remove aria-label="削除">削除</button>
    </span>
  </li>`)}`;
}

/* =========================================================
   CSV出力（データ一覧）
   ファイル名は環境による文字化けを避けるため半角英数字にする（中身は日本語）
   ========================================================= */
const t = (map, v) => map[v] ?? v ?? '';
const d = (v) => (v ? formatDate(v) : '');

const DATA_EXPORTS = {
  sites: {
    file: 'site-ledger',
    label: 'サイト管理台帳',
    rows: (db) => [
      ['サイト名', 'ドメイン', 'URL', 'サイトの種類', 'CMS', 'WordPressテーマ', '運用状況', '管理担当者', 'レンタルサーバー会社', 'サーバー情報', 'ドメイン管理会社', 'ドメイン有効期限', 'ドメイン情報', 'SSL確認状況', 'SSL有効期限', '制作・保守会社', '制作会社の担当範囲', '自社の担当範囲', '最終点検日', '次回点検予定日', '備考'],
      ...db.sites.map((s) => [s.name, s.domain, s.url, t(L.SITE_TYPES, s.siteType), s.cmsName, s.wpTheme, t(L.SITE_ACTIVE, s.active), s.manager, s.serverCompany, s.serverContract, s.domainRegistrar, d(s.domainExpiry), s.domainContract,
        t(L.SSL_STATUS, s.sslStatus), d(s.sslExpiry), s.vendor, s.vendorScope, s.ownScope, d(lastInspectionDate(db, s)), d(s.nextInspectionDate), s.notes])
    ]
  },
  inspections: {
    file: 'inspections',
    label: '点検記録（項目ごと）',
    rows: (db) => [
      ['点検日', 'サイト', '担当者', '点検項目', '結果', 'コメント', '全体コメント'],
      ...db.inspections.slice().sort((a, b) => b.date.localeCompare(a.date))
        .flatMap((i) => i.items.map((it) => [d(i.date), siteName(i.siteId), i.inspector, it.label, t(L.RESULTS, it.result), it.comment, i.summary]))
    ]
  },
  worklogs: {
    file: 'worklogs',
    label: '作業履歴・トラブル',
    rows: (db) => [
      ['発生日', 'サイト', '区分', '優先度', '作業内容', 'トラブル内容', '原因', '対応内容', '対応担当者', '対応状況', '完了日', '備考'],
      ...db.worklogs.slice().sort((a, b) => b.occurredDate.localeCompare(a.occurredDate)).map((w) => [d(w.occurredDate), siteName(w.siteId), t(L.WORK_KIND, w.kind), t(L.PRIORITY, w.priority),
        w.workContent, w.troubleContent, w.cause, w.action, w.assignee, t(L.WORK_STATUS, w.status), d(w.completedDate), w.notes])
    ]
  },
  securityReports: {
    file: 'security-reports',
    label: 'セキュリティ診断結果',
    rows: (db) => [
      ['診断サービス', 'サイト', '最終診断日', 'レポート受領日', '診断結果', '指摘事項', '重要度', '対応状況', '対応内容', '次回確認日', '添付ファイル', '備考'],
      ...db.securityReports.map((r) => [db.securityServices.find((s) => s.id === r.serviceId)?.name || '', siteName(r.siteId), d(r.diagnosisDate), d(r.receivedDate), t(L.SEC_RESULT, r.result),
        r.findings, t(L.SEVERITY, r.severity), t(L.RESPONSE_STATUS, r.responseStatus), r.responseDetail, d(r.nextCheckDate),
        r.attachments.map((id) => db.attachments.find((a) => a.id === id)?.name).filter(Boolean).join(' / '), r.notes])
    ]
  },
  serverScans: {
    file: 'server-scans',
    label: '不正ファイル検査',
    rows: (db) => [
      ['検査日', 'サイト', '検査方法', '検査範囲', '検査結果', '検出内容', '対応内容', '対応状況', '担当者', '次回予定', '備考'],
      ...db.serverScans.map((x) => [d(x.scanDate), siteName(x.siteId), x.method, x.scope, t(L.SCAN_RESULT, x.result), x.detail, x.action, t(L.SCAN_STATUS, x.status), x.inspector, d(x.nextDate), x.notes])
    ]
  },
  backups: {
    file: 'backups',
    label: 'バックアップ記録',
    rows: (db) => [
      ['最終バックアップ日', 'サイト', '種類', '方法', '保存場所', '保存ファイル名', '対象', '復元方法の確認', '復元テスト実施日', '備考'],
      ...db.backups.map((b) => [d(b.backupDate), siteName(b.siteId), t(L.BACKUP_KIND, b.kind), b.method, b.location, b.fileName, b.target, t(L.RESTORE_VERIFIED, b.restoreVerified), d(b.restoreTestDate), b.notes])
    ]
  },
  todos: {
    file: 'todos',
    label: 'ToDo',
    rows: (db) => [
      ['やること', 'サイト', '分類', '優先度', '状況', '期限', '担当者', '詳細', '登録元', '完了日', '対応メモ'],
      ...db.todos.map((x) => [x.title, x.siteId ? siteName(x.siteId) : '全サイト共通', t(L.CHECK_CATEGORIES, x.category), t(L.PRIORITY, x.priority), t(L.TODO_STATUS, x.status),
        d(x.dueDate), x.assignee, x.detail, x.source, d(x.completedDate), x.notes])
    ]
  }
};

/* =========================================================
   Notion取り込み用CSV
   1列目をページ名にし、日付は YYYY-MM-DD、選択肢は短い語にそろえる
   ========================================================= */
const NOTION_EXPORTS = {
  todos: {
    file: 'todos',
    label: 'ToDoリスト',
    rows: (db) => [
      ['やること', '状況', '優先度', '期限', 'サイト', '分類', '担当者', '詳細', '登録元', '完了日'],
      ...db.todos.map((x) => [x.title, t(L.TODO_STATUS, x.status), t(L.PRIORITY, x.priority), x.dueDate, x.siteId ? siteName(x.siteId) : '全サイト共通',
        t(L.CHECK_CATEGORIES, x.category), x.assignee, x.detail, x.source, x.completedDate])
    ]
  },
  checks: {
    file: 'security-checks',
    label: 'セキュリティチェック表（最新の結果）',
    rows: (db) => [
      ['チェック項目', '結果', 'サイト', 'サイトの種類', '分類', '点検日', '担当者', 'コメント'],
      ...db.sites.filter((s) => s.active !== 'archived').flatMap((s) => {
        const latest = siteInspections(db, s.id)[0];
        // 点検済みなら最新の結果、未点検ならテンプレートの項目を「未確認」で出す
        const items = latest ? latest.items : (db.checklists[s.siteType] || []).map((c) => ({ label: c.label, category: c.category, result: 'unchecked', comment: '' }));
        return items.map((it) => [it.label, t(L.RESULTS, it.result), s.name, t(L.SITE_TYPES, s.siteType), t(L.CHECK_CATEGORIES, it.category || 'other'), latest?.date || '', latest?.inspector || '', it.comment]);
      })
    ]
  },
  sites: {
    file: 'sites',
    label: 'サイト一覧（状態つき）',
    rows: (db) => [
      ['サイト名', '状態', '種類', 'ドメイン', 'URL', 'サーバー会社', 'ドメイン管理会社', 'ドメイン有効期限', 'SSL有効期限', '最終点検日', '次回点検予定日', '未完了ToDo', '確認が必要な理由'],
      ...db.sites.filter((s) => s.active !== 'archived').map((s) => {
        const st = siteStatus(db, s);
        return [s.name, L.STATUS_LEVELS[st.level], t(L.SITE_TYPES, s.siteType), s.domain, s.url, s.serverCompany, s.domainRegistrar, s.domainExpiry, s.sslExpiry,
          lastInspectionDate(db, s), s.nextInspectionDate, db.todos.filter((x) => x.siteId === s.id && x.status !== 'done').length, st.reasons.map((r) => r.text).join(' / ')];
      })
    ]
  }
};

/* =========================================================
   画面
   ========================================================= */
export async function renderSettings(root) {
  const db = state.db;
  const s = db.settings;
  if (!local.draft) local.draft = structuredClone(db.checklists);

  root.innerHTML = String(html`
    ${pageHeader('設定', '基本設定・点検項目・ユーザー・データのバックアップを管理します。')}

    <div class="settings-grid">
      <!-- ===== 基本設定 ===== -->
      <section class="card js-fade" aria-labelledby="set-basic">
        <h2 class="card__title" id="set-basic">基本設定</h2>
        <form id="settings-form" novalidate>
          ${renderFields(settingFields(), { ...s, staff: (s.staff || []).join('\n') })}
          <div class="tab-actions"><button type="submit" class="btn btn--primary">基本設定を保存</button></div>
        </form>
      </section>

      <!-- ===== 機能の区分 ===== -->
      <section class="card js-fade" aria-labelledby="set-about">
        <h2 class="card__title" id="set-about">このシステムでできること</h2>
        <h3 class="card__subtitle">システムが自動で行うこと</h3>
        <ul class="report__list">
          <li>記録内容からサイトの状態を色分け判定（未確認は「問題なし」にしない）</li>
          <li>ドメイン期限・SSL期限・点検予定・ToDoの期限・バックアップの古さの計算と警告</li>
          <li>点検で「要確認・対応中」にした項目や診断の指摘をToDoへ自動登録</li>
          <li>ダッシュボードと月次報告書の集計、CSV出力</li>
          <li>データ保存時の自動スナップショット（1日1回・削除や復元の前）</li>
        </ul>
        <h3 class="card__subtitle">担当者が手動で入力すること</h3>
        <ul class="report__list">
          <li>日常点検の結果、作業・トラブルの記録</li>
          <li>セキュリティ診断レポートの内容（転記・ファイル添付）と不正ファイル検査の結果</li>
          <li>バックアップ取得の記録、サーバー・ドメインの情報、ToDoの完了、報告書の特記事項</li>
        </ul>
        <h3 class="card__subtitle">行わないこと</h3>
        <ul class="report__list">
          <li>WordPress・サーバーへの自動ログインや自動同期、外部サイトへの自動アクセス・自動診断</li>
          <li>パスワード・APIキー・FTP情報などの秘密情報の保存、契約費用・支払いの管理（別システムで管理）</li>
        </ul>
      </section>
    </div>

    <!-- ===== 点検項目テンプレート ===== -->
    <section class="card js-fade" aria-labelledby="set-check">
      <div class="card__header">
        <h2 class="card__title" id="set-check">点検項目テンプレート</h2>
        <label class="toolbar__select"><span class="toolbar__label">サイトの種類</span>
          <select class="input input--select input--sm" id="checklist-type">
            ${Object.entries(L.SITE_TYPES).map(([k, v]) => html`<option value="${k}"${k === local.checklistType ? raw(' selected') : ''}>${v}（${local.draft[k]?.length || 0}項目）</option>`)}
          </select>
        </label>
      </div>
      <p class="card__lead">点検の入力画面に表示される項目です。変更しても、過去の点検記録の内容は変わりません。</p>
      <ul class="list-editor" id="checklist-editor">${checklistRows(local.draft[local.checklistType] || [])}</ul>
      <div class="data-actions">
        <button type="button" class="btn btn--outline btn--sm" id="checklist-add">＋ 項目を追加</button>
        <button type="button" class="btn btn--primary btn--sm" id="checklist-save">点検項目を保存</button>
        <button type="button" class="btn btn--ghost btn--sm" id="checklist-reset">編集を取り消す</button>
      </div>
    </section>

    <div class="settings-grid">
      <!-- ===== ユーザー ===== -->
      <section class="card js-fade" aria-labelledby="set-users">
        <h2 class="card__title" id="set-users">ユーザー</h2>
        <div id="user-list"><p class="text-muted">読み込み中…</p></div>
        <h3 class="card__subtitle">ユーザーを追加</h3>
        <form id="user-form" class="form-grid" novalidate>
          <div class="field"><label class="field__label" for="nu-name">ユーザー名<span class="field__required">必須</span></label>
            <input class="input" id="nu-name" name="username" type="text" required minlength="3" maxlength="32" pattern="[A-Za-z0-9._\\-]{3,32}" autocomplete="off" placeholder="半角英数字"></div>
          <div class="field"><label class="field__label" for="nu-display">表示名<span class="field__required">必須</span></label>
            <input class="input" id="nu-display" name="displayName" type="text" required maxlength="50" placeholder="例）佐藤"></div>
          <div class="field"><label class="field__label" for="nu-pass">初期パスワード<span class="field__required">必須</span></label>
            <input class="input" id="nu-pass" name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></div>
          <div class="field"><span class="field__label">&nbsp;</span><button type="submit" class="btn btn--outline">追加する</button></div>
        </form>
        <h3 class="card__subtitle">自分のパスワードを変更</h3>
        <form id="password-form" class="form-grid" novalidate>
          <div class="field"><label class="field__label" for="pw-current">現在のパスワード</label>
            <input class="input" id="pw-current" name="current" type="password" required autocomplete="current-password"></div>
          <div class="field"><label class="field__label" for="pw-next">新しいパスワード（8文字以上）</label>
            <input class="input" id="pw-next" name="next" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></div>
          <div class="field field--full"><button type="submit" class="btn btn--outline">パスワードを変更</button></div>
        </form>
      </section>

      <!-- ===== データ管理 ===== -->
      <section class="card js-fade" aria-labelledby="set-data">
        <h2 class="card__title" id="set-data">データのバックアップ・復元</h2>
        <p class="card__lead">このシステムのデータを1つのファイルに書き出します。定期的に書き出して、社内の安全な場所に保管してください。ログイン情報（パスワード）は含まれません。</p>
        <div class="data-actions">
          <a class="btn btn--primary btn--sm" href="/api/backup" download>データを書き出す（添付なし）</a>
          <a class="btn btn--outline btn--sm" href="/api/backup?attachments=1" download>添付ファイルも含めて書き出す</a>
        </div>

        <h3 class="card__subtitle">バックアップから復元</h3>
        <div class="file-drop">
          <input type="file" id="restore-file" accept=".json,application/json">
          <span class="field__help">書き出したファイル（または data/backups 内のファイル）を選ぶと、現在のデータを置き換えます。復元前の状態は自動で保存されます。</span>
        </div>

        <h3 class="card__subtitle">一覧をCSVで出力（Excel対応）</h3>
        <div class="data-actions">
          ${Object.entries(DATA_EXPORTS).map(([k, v]) => html`<button type="button" class="btn btn--ghost btn--sm" data-export="${k}">${v.label}</button>`)}
        </div>

        <h3 class="card__subtitle">Notionに取り込む（CSV）</h3>
        <p class="field__help">Notionで「インポート → CSV」を選ぶと、データベース（表）として取り込めます。1列目がページ名になります。取り込み後に「状況」「優先度」などの列をセレクト型に変えると、ボードやフィルターで使えます。</p>
        <div class="data-actions">
          ${Object.entries(NOTION_EXPORTS).map(([k, v]) => html`<button type="button" class="btn btn--outline btn--sm" data-notion="${k}">${v.label}</button>`)}
        </div>

        <h3 class="card__subtitle">自動スナップショット</h3>
        <div id="snapshot-list"><p class="text-muted">読み込み中…</p></div>
      </section>
    </div>`);

  bindSettings(root);
  loadUsers(root);
  loadSnapshots(root);
}

/* ---------- イベント ---------- */
function bindSettings(root) {
  /* 基本設定 */
  const sForm = root.querySelector('#settings-form');
  sForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!sForm.reportValidity()) return;
    const v = readFields(sForm, settingFields());
    try {
      await api('PUT', '/api/settings', { ...v, staff: v.staff.split('\n').map((x) => x.trim()).filter(Boolean) });
      toast('基本設定を保存しました');
      await notifyChanged();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  /* 点検項目 */
  const editor = root.querySelector('#checklist-editor');
  const syncDraft = () => {
    local.draft[local.checklistType] = [...editor.querySelectorAll('.list-editor__row')].map((li) => {
      const old = local.draft[local.checklistType][Number(li.dataset.index)] || {};
      return { id: old.id, category: li.querySelector('[data-field=category]').value, label: li.querySelector('[data-field=label]').value.trim(), hint: li.querySelector('[data-field=hint]').value.trim() };
    });
  };
  const redraw = () => { editor.innerHTML = String(checklistRows(local.draft[local.checklistType])); };

  root.querySelector('#checklist-type').addEventListener('change', (e) => {
    syncDraft();
    local.checklistType = e.target.value;
    redraw();
  });
  root.querySelector('#checklist-add').addEventListener('click', () => {
    syncDraft();
    local.draft[local.checklistType].push({ id: `${local.checklistType.slice(0, 2)}-${Date.now().toString(36)}`, category: 'other', label: '', hint: '' });
    redraw();
    editor.querySelector('.list-editor__row:last-child input').focus();
  });
  editor.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    syncDraft();
    const list = local.draft[local.checklistType];
    const i = Number(b.closest('.list-editor__row').dataset.index);
    if (b.dataset.move) {
      const j = i + Number(b.dataset.move);
      [list[i], list[j]] = [list[j], list[i]];
    }
    if (b.hasAttribute('data-remove')) list.splice(i, 1);
    redraw();
  });
  root.querySelector('#checklist-reset').addEventListener('click', () => {
    local.draft = structuredClone(state.db.checklists);
    redraw();
  });
  root.querySelector('#checklist-save').addEventListener('click', async () => {
    syncDraft();
    const empty = Object.entries(local.draft).find(([, list]) => list.some((it) => !it.label));
    if (empty) {
      toast(`${L.SITE_TYPES[empty[0]]}に項目名が空欄の行があります`, 'error');
      return;
    }
    try {
      await api('PUT', '/api/checklists', local.draft);
      local.draft = null;
      toast('点検項目を保存しました');
      await notifyChanged();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  /* ユーザー追加 */
  const uForm = root.querySelector('#user-form');
  uForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!uForm.reportValidity()) return;
    try {
      await api('POST', '/api/users', { username: uForm.username.value.trim(), displayName: uForm.displayName.value.trim(), password: uForm.password.value });
      uForm.reset();
      toast('ユーザーを追加しました');
      loadUsers(root);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  /* パスワード変更 */
  const pForm = root.querySelector('#password-form');
  pForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pForm.reportValidity()) return;
    try {
      await api('POST', '/api/password', { current: pForm.current.value, next: pForm.next.value });
      pForm.reset();
      toast('パスワードを変更しました');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  /* 復元 */
  root.querySelector('#restore-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      toast('ファイルを読み込めませんでした（JSON形式ではありません）', 'error');
      return;
    }
    const src = data.format === 'wsm-backup' ? data.db : data;
    const ok = await confirmDialog(`「${file.name}」から復元しますか？`, {
      danger: true,
      okLabel: '復元する',
      detail: `現在のデータは置き換えられます（復元前の状態は自動保存されます）。ファイル内：サイト${src?.sites?.length ?? '?'}件・点検${src?.inspections?.length ?? '?'}件${data.exportedAt ? `・書き出し日時 ${data.exportedAt.slice(0, 16).replace('T', ' ')}` : ''}`
    });
    if (!ok) return;
    try {
      const res = await api('POST', '/api/restore', data);
      toast(`復元しました（サイト${res.counts.sites}件）`);
      local.draft = null;
      await notifyChanged();
    } catch (err) {
      toast(`復元できませんでした：${err.message}`, 'error');
    }
  });

  /* Notion用CSV */
  root.querySelectorAll('[data-notion]').forEach((b) => b.addEventListener('click', () => {
    const def = NOTION_EXPORTS[b.dataset.notion];
    downloadCsv(`notion-${def.file}_${todayStr()}.csv`, def.rows(state.db));
  }));

  /* CSV */
  root.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => {
    const def = DATA_EXPORTS[b.dataset.export];
    downloadCsv(`${def.file}_${todayStr()}.csv`, def.rows(state.db));
  }));
}

async function loadUsers(root) {
  const box = root.querySelector('#user-list');
  try {
    const { users } = await api('GET', '/api/users');
    box.innerHTML = String(table([
      { label: 'ユーザー名', render: (u) => html`${u.username}${u.id === state.me.id ? badge('blue', 'ログイン中') : ''}` },
      { label: '表示名', render: (u) => u.displayName },
      { label: '作成日', render: (u) => formatDate(u.createdAt.slice(0, 10)) },
      { label: '操作', className: 'col-actions', render: (u) => (u.id === state.me.id ? '' : html`<button type="button" class="btn btn--danger-ghost btn--sm" data-delete-user="${u.id}" data-name="${u.username}">削除</button>`) }
    ], users));
    box.onclick = async (e) => {
      const b = e.target.closest('[data-delete-user]');
      if (!b) return;
      if (!(await confirmDialog(`ユーザー「${b.dataset.name}」を削除しますか？`, { danger: true, okLabel: '削除する' }))) return;
      try {
        await api('DELETE', `/api/users/${b.dataset.deleteUser}`);
        toast('ユーザーを削除しました');
        loadUsers(root);
      } catch (err) {
        toast(err.message, 'error');
      }
    };
  } catch (err) {
    box.textContent = err.message;
  }
}

async function loadSnapshots(root) {
  const box = root.querySelector('#snapshot-list');
  try {
    const { snapshots, dataDir } = await api('GET', '/api/snapshots');
    box.innerHTML = String(html`
      <p class="field__help">保存先：${dataDir}/backups（最新30件を保持）</p>
      ${snapshots.length ? html`<ul class="file-list">${snapshots.slice(0, 5).map((sn) => html`<li class="file-list__item"><span>${sn.name}</span><span class="cell-sub">${formatBytes(sn.size)}</span></li>`)}</ul>
        ${snapshots.length > 5 ? html`<p class="field__help">ほか${snapshots.length - 5}件</p>` : ''}` : html`<p class="field__help">まだありません</p>`}`);
  } catch (err) {
    box.textContent = err.message;
  }
}
