# リリースお知らせ配信手順（開発 / develop）

対象
- `develop` 環境の全顧客に、ミニアプリ内「お知らせ」を一斉配信する手順です。
- 配信先は Firestore `messages` コレクションです。

前提
- `GOOGLE_APPLICATION_CREDENTIALS` が開発プロジェクトのサービスアカウントJSONを指していること
- `tools/firebase-admin` で `npm install` 済みであること

手順
1. フォルダ移動
```bash
cd develop/tools/firebase-admin
```

2. ドライラン（書き込みなし）
```bash
npm run send-release-notice -- \
  --title "【開発環境】アップデート確認" \
  --body "サービスメッセージ対応と連絡先表示を更新しました。" \
  --releaseUrl /releases \
  --version 1.1.0-dev \
  --dryRun true
```

3. 本配信
```bash
npm run send-release-notice -- \
  --title "【開発環境】アップデート確認" \
  --body "サービスメッセージ対応と連絡先表示を更新しました。" \
  --releaseUrl /releases \
  --version 1.1.0-dev
```

メッセージ仕様
- 書き込まれる主な項目
- `customer_id`
- `title`
- `body`
- `release_url`
- `release_version`
- `is_read=false`
- `created_at`

確認方法
1. ミニアプリのヘッダー未読バッジが増える
2. お知らせ一覧で配信文が見える
3. 「リリース情報を見る」で `/releases` に遷移できる

運用メモ
- お知らせ整理を実行すると、配信日時に関係なく最新1件以外は履歴へ移動します。
- 履歴削除を実行すると、履歴のお知らせは完全削除されます。
