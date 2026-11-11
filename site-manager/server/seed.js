/**
 * 初期データ（初回起動時のみ作成）
 * サイト名・ドメインは仮の名称。画面からいつでも編集できる。
 * 点検記録などは作成しない（未確認のものを「問題なし」と見せないため）。
 *
 * チェック項目は「サイトの種類」ごとに持ち、分類（category）で
 * サイト本体／アカウント／サーバー／ドメイン／SSL／バックアップ／診断 に整理する。
 */

export const DEFAULT_SETTINGS = {
  orgName: '自社',
  staff: [],
  inspectionIntervalDays: 31,
  backupStaleDays: 35,
  sslAlertDays: 30,
  domainAlertDays: 60
};

const item = (id, category, label, hint) => ({ id, category, label, hint });

/* ---------- どの種類のサイトにも共通する項目（サーバー・ドメイン・SSL・バックアップ・診断） ---------- */
const common = (p) => [
  item(`${p}-srv-panel-2fa`, 'server', 'サーバー管理画面の二段階認証', 'レンタルサーバーの管理画面で二段階認証が有効か'),
  item(`${p}-srv-accounts`, 'server', 'サーバー・FTPアカウントの棚卸し', '使っていない・退職者・制作会社の不要なアカウントが残っていないか'),
  item(`${p}-srv-ftp`, 'server', 'ファイル転送の暗号化（SFTP / FTPS）', '暗号化なしのFTPを使っていないか'),
  item(`${p}-srv-waf`, 'server', 'WAF（不正アクセス防止機能）の有効化', 'サーバー管理画面でWAFが有効になっているか'),
  item(`${p}-srv-log`, 'server', 'アクセスログ・エラーログの確認', '見覚えのない大量アクセスや不審なエラーがないか'),
  item(`${p}-srv-files`, 'server', '不審なファイルの有無', '見覚えのないファイル・更新日時が不自然なファイルがないか'),
  item(`${p}-dom-expiry`, 'domain', 'ドメインの有効期限', '期限切れが近くないか（失効すると第三者に取得されるおそれ）'),
  item(`${p}-dom-panel-2fa`, 'domain', 'ドメイン管理画面の二段階認証', 'ドメイン管理会社のアカウントで二段階認証が有効か'),
  item(`${p}-dom-dns`, 'domain', 'DNS設定に不審な変更がないか', '見覚えのないレコード・転送先が追加されていないか'),
  item(`${p}-dom-mail`, 'domain', 'メールのなりすまし対策（SPF・DKIM・DMARC）', '自社ドメインを使ったなりすましメールへの対策が設定されているか'),
  item(`${p}-ssl-expiry`, 'ssl', 'SSL証明書の有効期限', 'ブラウザの鍵マークから期限を確認'),
  item(`${p}-ssl-redirect`, 'ssl', '常時SSL（httpからhttpsへの転送）', 'http:// で開いても https:// に切り替わるか'),
  item(`${p}-bak-latest`, 'backup', 'バックアップの取得状況', '最新のバックアップが取得できているか'),
  item(`${p}-bak-restore`, 'backup', '復元手順の確認', 'バックアップから戻す手順が分かる状態か'),
  item(`${p}-mon-report`, 'monitor', 'セキュリティ診断レポートの確認', '外部診断サービスのレポートを確認したか'),
  item(`${p}-mon-display`, 'monitor', 'サイトの表示・改ざんの確認', '主要ページが正しく表示され、見覚えのない内容・リンクがないか'),
  item(`${p}-mon-form`, 'monitor', '問い合わせフォームの動作確認', 'テスト送信し、通知メールが届くか。迷惑送信が急増していないか')
];

export const DEFAULT_CHECKLISTS = {
  /* ---------- WordPress ---------- */
  wordpress: [
    item('wp-core', 'cms', 'WordPress本体の更新', '管理画面「ダッシュボード > 更新」で最新版か'),
    item('wp-theme', 'cms', 'テーマの更新', 'SWELL本体・子テーマの更新有無'),
    item('wp-plugins', 'cms', 'プラグインの更新', '更新が必要なプラグインの有無'),
    item('wp-unused-plugins', 'cms', '不要なプラグイン・テーマの削除', '停止中・未使用のものが残っていないか（停止だけでなく削除）'),
    item('wp-plugin-eol', 'cms', '更新が止まったプラグインの有無', '長期間更新されていない・配布終了のプラグインがないか'),
    item('wp-php', 'cms', 'PHPバージョン', 'サポート期間内のバージョンか（サーバー管理画面で確認）'),
    item('wp-security-plugin', 'cms', 'セキュリティ対策プラグインの稼働', 'ログイン保護・改ざん検知などが有効か'),
    item('wp-admin-accounts', 'account', '管理者アカウントの棚卸し', '不明な管理者・退職者・制作会社の不要なアカウントがないか'),
    item('wp-2fa', 'account', '二段階認証の設定', '管理者アカウントのログインに追加認証があるか'),
    item('wp-login-history', 'account', '不審なログイン履歴', '見覚えのないログインや失敗の急増がないか'),
    item('wp-login-protect', 'account', 'ログイン画面の保護', 'ログイン試行回数の制限・画像認証などが有効か'),
    item('wp-comment-spam', 'cms', 'コメント・投稿の不審な内容', 'スパムコメントや身に覚えのない投稿・固定ページがないか'),
    ...common('wp')
  ],

  /* ---------- 静的HTML ---------- */
  static: [
    item('st-form-program', 'cms', 'フォーム・プログラムの更新', 'メールフォーム等のプログラム（PHP・CGI）が古いまま放置されていないか'),
    item('st-leftover', 'cms', '不要ファイルが公開されていないか', 'バックアップのzip・テスト用ページ・旧ファイルがサーバーに残っていないか'),
    item('st-dir-listing', 'cms', 'ファイル一覧が見えないか', 'フォルダのURLを開いてファイル一覧が表示されないか'),
    item('st-links', 'cms', 'リンク切れ・外部リンク先の確認', 'リンク先が別サイトに変わっていないか'),
    item('st-external-js', 'cms', '外部から読み込むスクリプトの確認', '使っていない・提供終了した外部サービスのタグが残っていないか'),
    ...common('st')
  ],

  /* ---------- bears CMS（CMS保守は制作会社） ---------- */
  bears: [
    item('bc-vendor-maintenance', 'vendor', '制作会社によるCMS保守状況', '更新・脆弱性対応の状況を制作会社に確認'),
    item('bc-vendor-report', 'vendor', '制作会社からの保守報告の確認', '保守報告・障害連絡の有無と内容'),
    item('bc-vendor-questions', 'vendor', '制作会社への確認事項', '問い合わせ中・回答待ちの事項がないか'),
    item('bc-vendor-backup', 'vendor', '制作会社側のバックアップ・復旧方法', '取得頻度と、障害時の復旧手順・連絡先'),
    item('bc-login', 'account', '編集画面へのログイン確認', '自社の編集アカウントでログインできるか'),
    item('bc-accounts', 'account', '編集アカウントの棚卸し', '使っていない・退職者のアカウントが残っていないか'),
    item('bc-login-history', 'account', '不審なログイン・更新履歴', '見覚えのない更新がないか'),
    ...common('bc')
  ],

  /* ---------- その他 ---------- */
  other: [
    item('ot-update', 'cms', 'システム・CMSの更新状況', '利用している仕組みが最新か、サポートが続いているか'),
    item('ot-accounts', 'account', '管理アカウントの棚卸し', '不要なアカウントが残っていないか'),
    item('ot-2fa', 'account', '二段階認証の設定', '管理画面のログインに追加認証があるか'),
    ...common('ot')
  ]
};

/* 初期登録サイト（仮名称）：WordPress（SWELL）7・静的HTML 1・bears CMS 1 */
export function initialSites() {
  const wp = (n, name, domain) => ({
    name,
    domain,
    url: `https://${domain}/`,
    siteType: 'wordpress',
    cmsName: 'WordPress',
    wpTheme: 'SWELL',
    ownScope: 'WordPress・テーマ・プラグインの更新、セキュリティ点検、サーバー・ドメインの管理',
    vendorScope: '',
    notes: `仮登録データ（WordPress ${n}）。サイト名・ドメインを実際の値に修正してください。`
  });
  return [
    wp(1, 'コーポレートサイト（仮）', 'corporate.example.jp'),
    wp(2, '採用サイト（仮）', 'recruit.example.jp'),
    wp(3, 'サービスサイトA（仮）', 'service-a.example.jp'),
    wp(4, 'サービスサイトB（仮）', 'service-b.example.jp'),
    wp(5, '店舗サイト（仮）', 'shop.example.jp'),
    wp(6, 'ブログ・お知らせサイト（仮）', 'blog.example.jp'),
    wp(7, 'キャンペーンサイト（仮）', 'campaign.example.jp'),
    {
      name: '会社案内LP（仮）',
      domain: 'lp.example.jp',
      url: 'https://lp.example.jp/',
      siteType: 'static',
      cmsName: 'なし（静的HTML）',
      wpTheme: '',
      ownScope: 'ページ更新、セキュリティ点検、サーバー・ドメインの管理',
      vendorScope: '',
      notes: '仮登録データ（静的HTML）。'
    },
    {
      name: '製品紹介サイト（仮）',
      domain: 'products.example.jp',
      url: 'https://products.example.jp/',
      siteType: 'bears',
      cmsName: 'bears CMS',
      wpTheme: '',
      vendor: '制作会社（仮）',
      vendorScope: 'CMSのシステム管理・保守、CMSの更新、障害対応、CMS側のバックアップ',
      ownScope: '編集画面での記事・ページ更新、サーバー・ドメインの管理、セキュリティ点検',
      notes: '仮登録データ（bears CMS）。CMSの保守は制作会社が担当。'
    }
  ];
}
