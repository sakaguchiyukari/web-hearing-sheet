/**
 * 各データの入力フォーム定義と、追加・編集・削除の共通処理
 * 一覧画面・サイト詳細画面のどちらからでも同じフォームを呼び出せるようにする。
 */
import { api } from './api.js';
import { state, loadDb, siteOptions, staffOptions, siteName } from './state.js';
import { renderFields, readFields, detectSecrets } from './form.js';
import { openFormModal, confirmDialog, toast } from './ui.js';
import { html, todayStr, formatBytes } from './utils.js';
import * as L from './labels.js';

/* =========================================================
   データ変更の通知（画面の再描画は app.js が担当）
   ========================================================= */
export async function notifyChanged() {
  await loadDb();
  window.dispatchEvent(new CustomEvent('wsm:data-changed'));
}

const SECRET_NOTE = html`<p class="form-note">パスワード・APIキー・FTP情報などの秘密情報は入力しないでください（このシステムでは保存しない方針です）。</p>`;

/* =========================================================
   フォーム定義
   ========================================================= */
export const FORMS = {
  /* ---------- サイト ---------- */
  sites: {
    title: 'サイト',
    fields: () => [
      { type: 'heading', label: '基本情報' },
      { name: 'name', label: 'サイト名', type: 'text', required: true, maxlength: 100, placeholder: '例）コーポレートサイト' },
      { name: 'siteType', label: 'サイトの種類', type: 'select', required: true, options: L.SITE_TYPES, help: '点検項目はこの種類に応じて切り替わります' },
      { name: 'domain', label: 'ドメイン', type: 'text', maxlength: 253, placeholder: '例）example.co.jp', pattern: '[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}', help: '半角英数字。https:// は不要です' },
      { name: 'url', label: 'サイトのURL', type: 'url', maxlength: 500, placeholder: 'https://example.co.jp/' },
      { name: 'cmsName', label: 'CMSの種類', type: 'text', maxlength: 100, placeholder: '例）WordPress', list: ['WordPress', 'bears CMS', 'なし（静的HTML）'] },
      { name: 'wpTheme', label: 'WordPressテーマ', type: 'text', maxlength: 100, placeholder: '例）SWELL', list: ['SWELL'] },
      { name: 'manager', label: 'サイトの管理担当者', type: 'text', maxlength: 100, placeholder: '例）山田', list: staffOptions() },
      { name: 'active', label: '運用状況', type: 'select', options: L.SITE_ACTIVE, help: '閉鎖したサイトは「運用終了」にすると履歴を残したまま集計から外れます' },

      { type: 'heading', label: 'サーバー・ドメイン・SSL' },
      { name: 'serverCompany', label: 'レンタルサーバー会社', type: 'text', maxlength: 100, placeholder: '例）〇〇サーバー' },
      { name: 'sslStatus', label: 'SSL証明書の確認状況', type: 'select', options: L.SSL_STATUS },
      { name: 'sslExpiry', label: 'SSL証明書の有効期限', type: 'date' },
      { name: 'sslCheckedDate', label: 'SSLを確認した日', type: 'date' },
      { name: 'serverContract', label: 'サーバー契約情報', type: 'textarea', maxlength: 1000, placeholder: '例）スタンダードプラン／年払い／契約者：総務部' },
      { name: 'domainContract', label: 'ドメイン契約情報', type: 'textarea', maxlength: 1000, placeholder: '例）〇〇ドメインで管理／自動更新あり' },

      { type: 'heading', label: '担当範囲', help: '制作会社と自社の役割分担を記録します' },
      { name: 'vendor', label: '制作会社・保守会社', type: 'text', maxlength: 200, full: true, placeholder: '例）株式会社〇〇（保守契約あり）' },
      { name: 'vendorScope', label: '制作会社の担当範囲', type: 'textarea', maxlength: 2000, placeholder: '例）CMSのシステム管理・保守、障害対応' },
      { name: 'ownScope', label: '自社担当者の担当範囲', type: 'textarea', maxlength: 2000, placeholder: '例）編集画面での更新、サーバー契約・支払い' },

      { type: 'heading', label: '点検予定' },
      { name: 'lastInspectionManual', label: '最終点検日（導入前の記録）', type: 'date', help: '点検記録を登録すると、最新の点検日が自動で使われます' },
      { name: 'nextInspectionDate', label: '次回点検予定日', type: 'date' },
      { name: 'notes', label: '備考', type: 'textarea', maxlength: 5000 }
    ],
    defaults: () => ({ siteType: 'wordpress', active: 'active', sslStatus: 'unchecked', cmsName: 'WordPress', wpTheme: 'SWELL' })
  },

  /* ---------- 作業履歴・トラブル ---------- */
  worklogs: {
    title: '作業履歴・トラブル',
    fields: () => [
      { name: 'siteId', label: '対象サイト', type: 'select', required: true, emptyLabel: '選択してください', options: siteOptions() },
      { name: 'occurredDate', label: '発生日（作業日）', type: 'date', required: true },
      { name: 'kind', label: '区分', type: 'select', options: L.WORK_KIND, help: '不具合・障害は「トラブル」を選ぶと、未解決のものがダッシュボードに表示されます' },
      { name: 'priority', label: '優先度', type: 'select', options: L.PRIORITY },
      { name: 'workContent', label: '作業内容', type: 'textarea', maxlength: 3000, placeholder: '例）プラグインを3件更新' },
      { name: 'troubleContent', label: 'トラブル内容', type: 'textarea', maxlength: 3000, placeholder: '例）問い合わせフォームの通知メールが届かない' },
      { name: 'cause', label: '原因', type: 'textarea', maxlength: 3000, placeholder: '分からない場合は「調査中」' },
      { name: 'action', label: '対応内容', type: 'textarea', maxlength: 3000 },
      { name: 'assignee', label: '対応担当者', type: 'text', maxlength: 100, list: staffOptions() },
      { name: 'status', label: '対応状況', type: 'select', options: L.WORK_STATUS },
      { name: 'completedDate', label: '完了日', type: 'date', help: '「完了」で未入力の場合は今日の日付が入ります' },
      { name: 'notes', label: '備考', type: 'textarea', maxlength: 3000 }
    ],
    defaults: () => ({ occurredDate: todayStr(), kind: 'work', status: 'done', priority: 'normal', assignee: state.me?.displayName || '' }),
    beforeSave: (v) => {
      if (v.status === 'done' && !v.completedDate) v.completedDate = todayStr();
      if (!v.workContent && !v.troubleContent) throw new Error('「作業内容」または「トラブル内容」のどちらかを入力してください');
      return v;
    }
  },

  /* ---------- セキュリティ診断サービス（契約） ---------- */
  securityServices: {
    title: 'セキュリティ診断サービス',
    fields: () => [
      { name: 'name', label: '診断サービス名', type: 'text', required: true, maxlength: 200, placeholder: '例）〇〇Webセキュリティ診断' },
      { name: 'provider', label: '提供会社', type: 'text', maxlength: 200, placeholder: '例）株式会社〇〇' },
      { name: 'targetSiteIds', label: '診断対象サイト', type: 'checkboxes', options: siteOptions(), help: 'この契約で診断しているサイトを選択してください' },
      { name: 'targetDomains', label: 'その他の対象ドメイン', type: 'textarea', maxlength: 2000, placeholder: '台帳に登録していないドメインがあれば1行に1つずつ' },
      { name: 'contractInfo', label: '契約内容', type: 'textarea', maxlength: 2000, placeholder: '例）月1回の外部診断／レポートはメールで受領' },
      { name: 'scope', label: '診断内容・範囲', type: 'textarea', maxlength: 2000, placeholder: '例）外部からの脆弱性スキャン、改ざん検知' },
      { name: 'notes', label: '備考', type: 'textarea', maxlength: 3000 }
    ]
  },

  /* ---------- セキュリティ診断結果（外部からの診断） ---------- */
  securityReports: {
    title: 'セキュリティ診断結果',
    fields: () => [
      { name: 'serviceId', label: '診断サービス', type: 'select', required: true, emptyLabel: '選択してください', options: state.db.securityServices.map((s) => ({ value: s.id, label: s.name })), help: '先に「診断サービス契約」を登録してください' },
      { name: 'siteId', label: '診断対象サイト', type: 'select', required: true, emptyLabel: '選択してください', options: siteOptions() },
      { name: 'diagnosisDate', label: '最終診断日', type: 'date', max: todayStr() },
      { name: 'receivedDate', label: 'レポート受領日', type: 'date', max: todayStr() },
      { name: 'result', label: '診断結果', type: 'select', options: L.SEC_RESULT, help: 'レポートを確認していない場合は「未確認」のままにしてください' },
      { name: 'severity', label: '重要度（最も高いもの）', type: 'select', options: L.SEVERITY },
      { name: 'findings', label: '指摘事項', type: 'textarea', maxlength: 5000, placeholder: 'レポートに記載された指摘内容を転記' },
      { name: 'responseStatus', label: '対応状況', type: 'select', options: L.RESPONSE_STATUS },
      { name: 'nextCheckDate', label: '次回確認日', type: 'date' },
      { name: 'responseDetail', label: '対応内容', type: 'textarea', maxlength: 5000 },
      { name: 'notes', label: '備考', type: 'textarea', maxlength: 3000 }
    ],
    defaults: () => ({ result: 'unchecked', severity: 'none', responseStatus: 'unchecked', receivedDate: todayStr() }),
    beforeSave: (v) => {
      if (v.result === 'ok' && v.severity !== 'none' && v.severity !== 'low') {
        throw new Error('診断結果が「問題なし」ですが重要度が「中」以上になっています。内容を確認してください。');
      }
      if (v.result === 'ok' && v.responseStatus === 'unchecked') v.responseStatus = 'na';
      return v;
    },
    extra: (values) => attachmentField(values.attachments || []),
    onOpen: (form) => bindAttachmentField(form),
    readExtra: (form) => ({ attachments: readAttachmentIds(form) })
  },

  /* ---------- サーバー内部の不正ファイル検査 ---------- */
  serverScans: {
    title: '不正ファイル検査',
    fields: () => [
      { name: 'siteId', label: '対象サイト', type: 'select', required: true, emptyLabel: '選択してください', options: siteOptions() },
      { name: 'scanDate', label: '検査日', type: 'date', required: true, max: todayStr() },
      { name: 'method', label: '検査方法・ツール', type: 'text', maxlength: 200, placeholder: '例）サーバー会社のウイルスチェック機能', list: ['サーバー会社のウイルスチェック機能', 'WordPressセキュリティプラグイン', '制作会社による検査', '手動でのファイル確認'] },
      { name: 'inspector', label: '担当者', type: 'text', maxlength: 100, list: staffOptions() },
      { name: 'scope', label: '検査範囲', type: 'textarea', maxlength: 2000, placeholder: '例）公開ディレクトリ全体' },
      { name: 'result', label: '検査結果', type: 'select', options: L.SCAN_RESULT },
      { name: 'status', label: '対応状況', type: 'select', options: L.SCAN_STATUS },
      { name: 'detail', label: '検出内容', type: 'textarea', maxlength: 3000 },
      { name: 'action', label: '対応内容', type: 'textarea', maxlength: 3000 },
      { name: 'nextDate', label: '次回検査予定日', type: 'date' },
      { name: 'notes', label: '備考', type: 'textarea', maxlength: 3000 }
    ],
    defaults: () => ({ scanDate: todayStr(), result: 'unchecked', status: 'na', inspector: state.me?.displayName || '' }),
    beforeSave: (v) => {
      if (v.result === 'detected' && v.status === 'na') v.status = 'open';
      return v;
    }
  },

  /* ---------- バックアップ ---------- */
  backups: {
    title: 'バックアップ記録',
    fields: () => [
      { name: 'siteId', label: '対象サイト', type: 'select', required: true, emptyLabel: '選択してください', options: siteOptions() },
      { name: 'kind', label: 'バックアップの種類', type: 'select', required: true, options: L.BACKUP_KIND, help: 'WordPress（プラグイン等で取得）とサーバー全体（サーバー会社の機能等）は分けて記録します' },
      { name: 'backupDate', label: '最終バックアップ日', type: 'date', max: todayStr(), help: '実際に取得を確認できた日付。不明な場合は空欄（未確認扱い）' },
      { name: 'method', label: 'バックアップ方法', type: 'text', maxlength: 200, placeholder: '例）BackWPupで自動取得', list: ['プラグインで自動取得', 'プラグインで手動取得', 'サーバー会社の自動バックアップ', 'FTPで手動ダウンロード', '制作会社が取得'] },
      { name: 'location', label: '保存場所', type: 'text', maxlength: 300, placeholder: '例）社内NAS /web-backup/', help: '場所の説明のみ。ログイン情報は書かないでください' },
      { name: 'fileName', label: '保存ファイル名', type: 'text', maxlength: 300, placeholder: '例）corporate_20261101.zip' },
      { name: 'target', label: 'バックアップ対象', type: 'textarea', maxlength: 1000, placeholder: '例）データベース・テーマ・プラグイン・アップロード画像' },
      { name: 'restoreVerified', label: '復元方法の確認', type: 'select', options: L.RESTORE_VERIFIED },
      { name: 'restoreTestDate', label: '復元テスト実施日', type: 'date', max: todayStr() },
      { name: 'notes', label: '備考', type: 'textarea', maxlength: 3000 }
    ],
    defaults: () => ({ kind: 'wordpress', backupDate: todayStr(), restoreVerified: 'unknown' })
  },

  /* ---------- 契約・支払い ---------- */
  contracts: {
    title: '契約',
    fields: () => [
      { name: 'serviceName', label: '契約サービス名', type: 'text', required: true, maxlength: 200, placeholder: '例）レンタルサーバー スタンダードプラン' },
      { name: 'company', label: '契約会社', type: 'text', maxlength: 200, placeholder: '例）〇〇株式会社' },
      { name: 'category', label: '契約の種類', type: 'select', options: L.CONTRACT_CATEGORY },
      { name: 'status', label: '契約状況', type: 'select', options: L.CONTRACT_STATUS },
      { name: 'siteIds', label: '対象サイト', type: 'checkboxes', options: siteOptions(), help: '同じサーバー契約を複数サイトで使っている場合は、すべて選択してください' },
      { name: 'amount', label: '費用（税込・円）', type: 'number', min: 0, step: 1, inputmode: 'numeric', placeholder: '例）13200' },
      { name: 'amountUnit', label: '費用の単位', type: 'select', options: L.AMOUNT_UNIT },
      { name: 'paymentCycle', label: '支払い周期', type: 'select', options: L.PAYMENT_CYCLE },
      { name: 'nextRenewalDate', label: '次回更新日', type: 'date' },
      { name: 'paymentConfirmedDate', label: '支払い確認日', type: 'date' },
      { name: 'owner', label: '契約担当者', type: 'text', maxlength: 100, list: staffOptions() },
      { name: 'content', label: '契約内容', type: 'textarea', maxlength: 3000, placeholder: '例）ディスク300GB／自動更新あり' },
      { name: 'notes', label: '備考', type: 'textarea', maxlength: 3000, placeholder: 'ログインID・パスワードは記載しないでください' }
    ],
    defaults: () => ({ category: 'server', status: 'active', amountUnit: 'year', paymentCycle: 'yearly' })
  }
};

/* =========================================================
   添付ファイル欄（セキュリティ診断レポート用）
   ========================================================= */
const MAX_FILE = 15 * 1024 * 1024;

const attachmentItem = (a) => html`<li class="file-list__item" data-attachment-id="${a.id}">
  <span>${a.name}<span class="cell-sub">${formatBytes(a.size)}</span></span>
  <span class="btn-row">
    <a class="btn btn--ghost btn--sm" href="/api/attachments/${a.id}" download>ダウンロード</a>
    <button type="button" class="btn btn--danger-ghost btn--sm" data-remove-attachment>外す</button>
  </span>
</li>`;

function attachmentField(ids) {
  const items = ids.map((id) => state.db.attachments.find((a) => a.id === id)).filter(Boolean);
  return html`<div class="field field--full attachment-field">
    <span class="field__label">レポートファイルの添付</span>
    <div class="file-drop">
      <input type="file" class="attachment-input" multiple accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.csv,.txt,.xlsx,.xls,.docx,.doc,.zip">
      <span class="field__help">PDF・画像・Excel・Word・CSV・ZIP（1ファイル15MBまで）。選択するとすぐに保存されます。</span>
    </div>
    <ul class="file-list">${items.map(attachmentItem)}</ul>
  </div>`;
}

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(new Error('ファイルを読み込めませんでした'));
  reader.readAsDataURL(file);
});

function bindAttachmentField(form) {
  const input = form.querySelector('.attachment-input');
  const list = form.querySelector('.file-list');
  input.addEventListener('change', async () => {
    for (const file of input.files) {
      if (file.size > MAX_FILE) {
        toast(`${file.name} は15MBを超えているため添付できません`, 'error');
        continue;
      }
      try {
        const { attachment } = await api('POST', '/api/attachments', { name: file.name, data: await fileToBase64(file) });
        state.db.attachments.push(attachment);
        list.insertAdjacentHTML('beforeend', String(attachmentItem(attachment)));
        toast(`${file.name} を添付しました`);
      } catch (err) {
        toast(`${file.name}：${err.message}`, 'error');
      }
    }
    input.value = '';
  });
  list.addEventListener('click', (e) => {
    if (e.target.closest('[data-remove-attachment]')) e.target.closest('.file-list__item').remove();
  });
}

const readAttachmentIds = (form) => [...form.querySelectorAll('[data-attachment-id]')].map((li) => li.dataset.attachmentId);

/* =========================================================
   保存・削除
   ========================================================= */
export function saveRecord(collection, values, id) {
  return id
    ? api('PUT', `/api/c/${collection}/${id}`, values)
    : api('POST', `/api/c/${collection}`, values);
}

/**
 * 追加・編集フォームを開く
 * @param {string} collection
 * @param {object|null} record 編集時は既存レコード
 * @param {object} presets 新規時の初期値（例：サイト詳細から開いたときの siteId）
 */
export function openRecordEditor(collection, record = null, presets = {}) {
  const def = FORMS[collection];
  const fields = def.fields(record);
  const values = record ? { ...record } : { ...(def.defaults?.() || {}), ...presets };

  openFormModal({
    title: `${def.title}を${record ? '編集' : '追加'}`,
    wide: fields.length > 8,
    body: html`${SECRET_NOTE}${renderFields(fields, values)}${def.extra ? def.extra(values) : ''}`,
    onOpen: (form) => def.onOpen?.(form, values),
    onSubmit: async (form) => {
      let data = { ...(record || {}), ...readFields(form, fields), ...(def.readExtra?.(form) || {}) };
      if (def.beforeSave) data = def.beforeSave(data);
      const secrets = detectSecrets(data, fields);
      if (secrets.length) {
        const ok = await confirmDialog('秘密情報（パスワード等）らしき記述があります。このまま保存しますか？', {
          detail: `対象：${secrets.join('、')}。パスワードやAPIキーはこのシステムに保存しないでください。`,
          okLabel: 'このまま保存'
        });
        if (!ok) return false;
      }
      await saveRecord(collection, data, record?.id);
      toast(`${def.title}を${record ? '更新' : '登録'}しました`);
      await notifyChanged();
      return true;
    }
  });
}

/** サイト削除時に一緒に消える記録の件数 */
function relatedCounts(siteId) {
  const db = state.db;
  const n = (list) => list.filter((r) => r.siteId === siteId).length;
  return [
    ['点検記録', n(db.inspections)],
    ['作業履歴', n(db.worklogs)],
    ['バックアップ記録', n(db.backups)],
    ['セキュリティ診断結果', n(db.securityReports)],
    ['不正ファイル検査', n(db.serverScans)]
  ].filter(([, c]) => c > 0);
}

/** 削除（確認ダイアログ付き） */
export async function deleteRecord(collection, record, label) {
  let detail = 'この操作は取り消せません。';
  if (collection === 'sites') {
    const rel = relatedCounts(record.id);
    detail = rel.length
      ? `関連する ${rel.map(([k, c]) => `${k}${c}件`).join('・')} も削除されます。履歴を残したい場合は、削除せずに「運用状況」を「運用終了」にしてください。削除前の状態は自動でスナップショット保存されます。`
      : '削除前の状態は自動でスナップショット保存されます。';
  }
  const ok = await confirmDialog(`「${label}」を削除しますか？`, { okLabel: '削除する', danger: true, detail });
  if (!ok) return false;
  try {
    await api('DELETE', `/api/c/${collection}/${record.id}`);
    toast('削除しました');
    await notifyChanged();
    return true;
  } catch (err) {
    toast(err.message, 'error');
    return false;
  }
}

/** 一覧などで使う「サイト名」リンク */
export const siteLink = (siteId) => html`<a class="link" href="#/sites/${siteId}">${siteName(siteId)}</a>`;
