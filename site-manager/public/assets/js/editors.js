/**
 * 各データの入力フォーム定義と、追加・編集・削除の共通処理
 * 一覧画面・サイト詳細画面のどちらからでも同じフォームを呼び出せるようにする。
 */
import { api } from './api.js';
import { state, loadDb, siteOptions, staffOptions, siteName } from './state.js';
import { renderFields, readFields, detectSecrets } from './form.js';
import { openFormModal, confirmDialog, toast } from './ui.js';
import { html, todayStr } from './utils.js';
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
  }
};

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
