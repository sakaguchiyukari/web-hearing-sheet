/**
 * 初期データ（初回起動時のみ作成）
 * サイト名・ドメインは仮の名称。画面からいつでも編集できる。
 * 点検記録などは作成しない（未確認のものを「問題なし」と見せないため）。
 */

export const DEFAULT_SETTINGS = {
  orgName: '自社',
  staff: [],
  inspectionIntervalDays: 31,
  backupStaleDays: 35,
  sslAlertDays: 30,
  contractAlertDays: 60
};

export const DEFAULT_CHECKLISTS = {
  wordpress: [
    { id: 'wp-core', label: 'WordPress本体の更新確認', hint: '管理画面「ダッシュボード > 更新」で最新版か確認' },
    { id: 'wp-theme', label: 'テーマの更新確認', hint: 'SWELL本体・子テーマの更新有無' },
    { id: 'wp-plugins', label: 'プラグインの更新確認', hint: '更新が必要なプラグインの有無' },
    { id: 'wp-unused-plugins', label: '不要なプラグインの有無', hint: '使っていない・停止中のプラグインが残っていないか' },
    { id: 'wp-admin-accounts', label: '管理者アカウントの確認', hint: '不明な管理者・退職者のアカウントがないか' },
    { id: 'wp-2fa', label: '二段階認証の設定確認', hint: 'ログイン時の追加認証が有効か' },
    { id: 'wp-login-history', label: '不審なログイン履歴の確認', hint: '見覚えのないログインや失敗の急増がないか' },
    { id: 'wp-display', label: 'サイトの表示確認', hint: 'PC・スマホで主要ページが正しく表示されるか' },
    { id: 'wp-form', label: '問い合わせフォームの動作確認', hint: 'テスト送信し、通知メールが届くか' },
    { id: 'wp-backup', label: 'バックアップの取得状況', hint: '最新のバックアップが取得できているか' },
    { id: 'wp-security-report', label: 'セキュリティ診断レポートの確認', hint: '外部診断サービスのレポートを確認したか' }
  ],
  static: [
    { id: 'st-display', label: 'サイトの表示確認', hint: 'PC・スマホで主要ページが正しく表示されるか' },
    { id: 'st-links', label: 'リンク切れの確認', hint: '主要ページのリンク先が開けるか' },
    { id: 'st-form', label: '問い合わせフォームの動作確認', hint: 'テスト送信し、通知メールが届くか' },
    { id: 'st-ssl', label: 'SSLの確認', hint: 'ブラウザで鍵マークが表示され、期限が切れていないか' },
    { id: 'st-server-contract', label: 'サーバー契約の確認', hint: '契約期限・支払い状況' },
    { id: 'st-backup', label: 'バックアップの確認', hint: '最新のファイル一式が保管されているか' },
    { id: 'st-security-report', label: 'セキュリティ診断レポートの確認', hint: '外部診断サービスのレポートを確認したか' }
  ],
  bears: [
    { id: 'bc-display', label: 'サイトの表示確認', hint: 'PC・スマホで主要ページが正しく表示されるか' },
    { id: 'bc-login', label: '編集画面へのログイン確認', hint: '自社の編集アカウントでログインできるか' },
    { id: 'bc-form', label: '問い合わせフォームの確認', hint: 'テスト送信し、通知メールが届くか' },
    { id: 'bc-server-payment', label: 'サーバー契約・支払いの確認', hint: '自社担当の契約・支払いが済んでいるか' },
    { id: 'bc-vendor-maintenance', label: '制作会社によるCMS保守状況の確認', hint: '保守報告・更新状況を制作会社に確認' },
    { id: 'bc-vendor-questions', label: '制作会社への確認事項', hint: '問い合わせ中・確認待ちの事項がないか' },
    { id: 'bc-backup-restore', label: 'バックアップ・復旧方法の確認', hint: '制作会社側のバックアップと復旧手順' },
    { id: 'bc-security-report', label: 'セキュリティ診断レポートの確認', hint: '外部診断サービスのレポートを確認したか' }
  ],
  other: [
    { id: 'ot-display', label: 'サイトの表示確認', hint: 'PC・スマホで主要ページが正しく表示されるか' },
    { id: 'ot-form', label: '問い合わせフォームの動作確認', hint: 'テスト送信し、通知メールが届くか' },
    { id: 'ot-ssl', label: 'SSLの確認', hint: '期限が切れていないか' },
    { id: 'ot-backup', label: 'バックアップの確認', hint: '最新のバックアップがあるか' },
    { id: 'ot-security-report', label: 'セキュリティ診断レポートの確認', hint: '外部診断サービスのレポートを確認したか' }
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
    ownScope: 'WordPress・テーマ・プラグインの更新、日常点検、サーバー契約・支払い',
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
      ownScope: 'ページ更新、日常点検、サーバー契約・支払い',
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
      ownScope: '編集画面での記事・ページ更新、サーバー契約・支払い、日常点検',
      notes: '仮登録データ（bears CMS）。CMSの保守は制作会社が担当。'
    }
  ];
}
