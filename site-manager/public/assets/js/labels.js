/**
 * 選択肢（列挙値）と日本語ラベルの定義
 * サーバー側の入力検証とクライアント側の表示で共通利用する（DOMに依存しない）
 */

export const SITE_TYPES = {
  wordpress: 'WordPress',
  static: '静的HTML',
  bears: 'bears CMS',
  other: 'その他'
};

export const SITE_ACTIVE = {
  active: '運用中',
  archived: '運用終了'
};

/* 点検結果 */
export const RESULTS = {
  unchecked: '未確認',
  ok: '問題なし',
  check: '要確認',
  progress: '対応中',
  done: '対応済み',
  na: '対象外'
};

/* 点検結果ごとの表示色 */
export const RESULT_TONE = {
  ok: 'green',
  done: 'green',
  check: 'yellow',
  progress: 'yellow',
  unchecked: 'grey',
  na: 'muted'
};

/* サイト状態（色分け） */
export const STATUS_LEVELS = {
  red: '問題発生・至急対応',
  yellow: '確認が必要',
  grey: '未確認',
  green: '確認済み・問題なし'
};

export const SSL_STATUS = {
  unchecked: '未確認',
  valid: '有効（確認済み）',
  expiring: '期限間近',
  expired: '期限切れ',
  none: 'SSLなし'
};

/* セキュリティ診断（外部） */
export const SEC_RESULT = {
  unchecked: '未確認',
  ok: '問題なし',
  findings: '指摘あり'
};

export const SEVERITY = {
  none: 'なし',
  low: '低',
  medium: '中',
  high: '高',
  critical: '緊急'
};

export const RESPONSE_STATUS = {
  unchecked: '未確認',
  open: '未対応',
  progress: '対応中',
  done: '対応済み',
  accepted: '対応不要（判断済み）',
  na: '対象外'
};

/* サーバー内部の不正ファイル検査 */
export const SCAN_RESULT = {
  unchecked: '未確認',
  clean: '検出なし',
  detected: '不審ファイル検出'
};

export const SCAN_STATUS = {
  na: '対応不要',
  open: '未対応',
  progress: '対応中',
  done: '対応済み'
};

/* バックアップ */
export const BACKUP_KIND = {
  wordpress: 'WordPressバックアップ',
  server: 'サーバー全体バックアップ',
  vendor: '制作会社管理のバックアップ',
  other: 'その他'
};

export const RESTORE_VERIFIED = {
  unknown: '未確認',
  yes: '確認済み',
  no: '未実施'
};

/* 契約・支払い */
export const CONTRACT_CATEGORY = {
  server: 'レンタルサーバー',
  domain: 'ドメイン',
  ssl: 'SSL証明書',
  maintenance: '保守契約',
  security: 'セキュリティ診断',
  other: 'その他'
};

export const AMOUNT_UNIT = {
  month: '月額',
  year: '年額',
  once: '一括',
  other: 'その他'
};

export const PAYMENT_CYCLE = {
  monthly: '毎月',
  yearly: '毎年',
  multiyear: '複数年',
  other: 'その他'
};

export const CONTRACT_STATUS = {
  active: '契約中',
  ended: '解約済み'
};

/* 作業履歴・トラブル */
export const WORK_KIND = {
  work: '作業',
  trouble: 'トラブル'
};

export const WORK_STATUS = {
  open: '未着手',
  progress: '対応中',
  hold: '保留',
  done: '完了'
};

export const PRIORITY = {
  normal: '通常',
  high: '高',
  urgent: '至急'
};
