# Webサイト管理システム 設計書

## 1. システム構成

| 項目 | 内容 |
|---|---|
| 実行方式 | ローカルPC上で動く Node.js サーバー（標準モジュールのみ・追加パッケージ不要） |
| 画面 | HTML5 / CSS（1ファイル）/ JavaScript（ES Modules、jQuery不使用） |
| 保存先 | `data/db.json`（業務データ）、`data/auth.json`（ログイン情報＝ハッシュのみ）、`data/attachments/`（添付ファイル）、`data/backups/`（自動スナップショット） |
| 公開範囲 | 既定で `127.0.0.1`（そのPCのみ）で待ち受け。ログイン必須 |
| 外部通信 | 一切行わない（自動ログイン・自動同期・外部診断なし） |

### 実装する機能 / 手動入力が必要な機能

| 区分 | 内容 |
|---|---|
| システムが自動で行う | 状態の色分け判定、期限（契約更新・SSL・点検・バックアップ）の計算と警告、集計、報告書の生成、CSV出力、自動スナップショット |
| 担当者が手動で入力する | 点検結果、作業・トラブル記録、セキュリティ診断結果（レポート内容の転記・添付）、不正ファイル検査結果、バックアップ実施記録、契約・支払い情報、報告書の特記事項 |
| 実装しない | WordPress・サーバーへの自動ログイン、外部サイトへのアクセス、自動診断、パスワード等の秘密情報の保存 |

## 2. 画面構成

```
ログイン（初回は管理者アカウント作成）
└ 左メニュー
   ├ ダッシュボード ……… 件数サマリー／サイト状態（色分け）／対応中の問題／予定／直近の作業
   ├ サイト管理台帳 ……… 一覧（検索・絞り込み）→ サイト詳細（タブ：概要・点検・バックアップ・セキュリティ・契約・作業履歴）
   ├ 日常点検 …………… 点検記録一覧／点検入力（サイト種類ごとの項目）
   ├ 作業履歴・トラブル … 一覧（検索・期間・状態）
   ├ セキュリティ管理 …… 診断サービス契約／外部診断結果（添付可）／サーバー内部の不正ファイル検査／サイト別状況
   ├ バックアップ管理 …… サイト別状況（WordPress／サーバー全体を区別）／実施記録
   ├ 契約・支払い ……… 契約一覧（複数サイト共用可・更新期限警告・年間費用）
   ├ 月次報告書 ………… 月選択・特記事項入力・プレビュー／印刷・PDF／CSV
   └ 設定 ………………… 基本設定・しきい値／点検項目テンプレート／ユーザー／データのバックアップ・復元・CSV
```

## 3. データ設計（`data/db.json`）

すべてのレコードは `id`・`createdAt`・`updatedAt` を持ちます。サイト間の関連は `siteId`（ID参照）で持つため、サイト名を変更しても履歴は崩れません。

| コレクション | 主な項目 |
|---|---|
| `sites` サイト | name, domain, url, siteType(wordpress/static/bears/other), cmsName, wpTheme, active(運用中/運用終了), serverCompany, serverContract, domainContract, sslStatus, sslExpiry, sslCheckedDate, manager, vendor, vendorScope, ownScope, lastInspectionManual, nextInspectionDate, notes |
| `inspections` 点検記録 | siteId, date, inspector, items[{itemId, label, result, comment}], summary |
| `worklogs` 作業・トラブル | siteId, occurredDate, kind(作業/トラブル), workContent, troubleContent, cause, action, assignee, status, priority, completedDate, notes |
| `securityServices` 診断サービス契約 | name, provider, contractInfo, targetSiteIds[], targetDomains, scope, notes |
| `securityReports` 外部診断結果 | serviceId, siteId, diagnosisDate, receivedDate, result, findings, severity, responseStatus, responseDetail, nextCheckDate, attachments[], notes |
| `serverScans` 不正ファイル検査 | siteId, scanDate, method, scope, result, detail, action, status, inspector, nextDate, notes |
| `backups` バックアップ記録 | siteId, kind(wordpress/server/vendor/other), backupDate, method, location, fileName, target, restoreVerified, restoreTestDate, notes |
| `contracts` 契約・支払い | serviceName, company, category, siteIds[], content, amount, amountUnit, paymentCycle, nextRenewalDate, paymentConfirmedDate, owner, status, notes |
| `attachments` 添付メタ情報 | name, size, mime（実体は `data/attachments/<id>.bin`） |
| `settings` 設定 | orgName, staff[], inspectionIntervalDays, backupStaleDays, sslAlertDays, contractAlertDays |
| `checklists` 点検項目 | wordpress / static / bears / other ごとの項目一覧（画面から編集可） |
| `reportNotes` 報告書メモ | `YYYY-MM` ごとに reportDate, author, plans, special |

点検記録には「その時点の項目名」を保存するため、点検項目テンプレートを後から変えても過去の履歴は変わりません。

## 4. 状態判定ルール（色分け）

優先度：赤 ＞ 黄 ＞ グレー ＞ 緑。**未確認を自動的に「問題なし」にはしません。** 緑は「点検が期限内に行われ、全項目が問題なし／対応済み／対象外」で、かつ他の条件にも引っかからない場合だけです。

| 色 | 主な条件 |
|---|---|
| 赤（至急） | 至急のトラブルが未解決／重要度「高・緊急」の診断指摘が未対応／不審ファイル検出が未解決／SSL期限切れ／契約更新日超過 |
| 黄（要確認） | 点検で「要確認・対応中」あり／次回点検日超過／未解決トラブル／診断指摘が未対応／診断の次回確認日超過／バックアップが古い／SSL・契約の期限が近い |
| グレー（未確認） | 点検記録なし・点検期限切れ／点検に「未確認」項目あり／SSL未確認／バックアップ記録なし／セキュリティ診断結果なし |
| 緑（問題なし） | 上記のいずれにも該当しない |

判定理由は画面に文章で表示します。

## 5. セキュリティ方針

- 待ち受けは既定で `127.0.0.1`。社内LANで共有する場合のみ `HOST` を変更（README参照）
- パスワードは scrypt でハッシュ化して `auth.json` に保存（業務データのバックアップには含めない）
- Cookie は HttpOnly / SameSite=Strict、更新系APIは独自ヘッダー必須（CSRF対策）、CSP等のセキュリティヘッダー付与
- ログイン失敗の回数制限
- 入力欄に「パスワード: xxx」のような秘密情報らしき記述があると保存前に警告
- 添付ファイルは拡張子を制限し、常にダウンロード扱いで返却（HTML/SVG等は不可）
- CSVは数式インジェクション対策済み・UTF-8（BOM付き）で出力
