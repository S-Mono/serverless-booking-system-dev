# メール送信機能の設定

## 概要
お問い合わせフォームから送信された内容を、指定されたメインの受信先（TO）に送信し、顧客のメールアドレスにCC、全管理者のメールアドレスにBCCで送信します。

## SMTP設定（Gmail使用の場合）

### 1. Gmailアプリパスワードの取得

1. Googleアカウントの[セキュリティ設定](https://myaccount.google.com/security)にアクセス
2. 「2段階認証プロセス」を有効化（未設定の場合）
3. 「アプリパスワード」を検索して設定
4. アプリ名を入力（例：予約システム）して生成
5. 表示される16桁のパスワードをコピー

### 2. .envファイルの設定

`functions/.env`ファイルに以下を設定：

```env
# メール送信設定
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com          # 送信元Gmailアドレス
SMTP_PASS=xxxx xxxx xxxx xxxx           # アプリパスワード（スペースは削除）
FROM_EMAIL=your-email@gmail.com         # 送信者アドレス
FROM_NAME=ヘアーサロン JOY's 予約システム  # 送信者名
TO_EMAIL=main-contact@example.com       # メイン受信先（TO）
```

### 3. Firebase Functions環境変数の設定

ローカル開発では`.env`ファイルが使用されますが、本番環境では以下のコマンドで環境変数を設定します：

```bash
cd functions

# 各変数を設定
firebase functions:config:set smtp.host="smtp.gmail.com"
firebase functions:config:set smtp.port="587"
firebase functions:config:set smtp.user="your-email@gmail.com"
firebase functions:config:set smtp.pass="your-app-password"
firebase functions:config:set smtp.from_email="your-email@gmail.com"
firebase functions:config:set smtp.from_name="ヘアーサロン JOY's 予約システム"
firebase functions:config:set smtp.to_email="main-contact@example.com"

# 設定確認
firebase functions:config:get

# デプロイ
npm run deploy
```

## メール送信の流れ

1. 顧客がマイページから「お問い合わせ」を送信
2. Firestoreの`contacts`コレクションに保存
3. Cloud Functions（`onContactCreated`）がトリガー
4. `users`コレクションから`is_admin: true`のユーザーのメールアドレスを取得
5. メール送信：
   - TO: 環境変数`TO_EMAIL`で設定されたメインの受信先
   - CC: 顧客のメールアドレス
   - BCC: 全管理者のメールアドレス
6. メール本文に返信先（顧客のメールアドレスと電話番号）を記載
7. 顧客の`messages`コレクションに確認通知を保存

## トラブルシューティング

### メールが送信されない場合

1. Firebase Functionsのログを確認：
   ```bash
   firebase functions:log
   ```

2. 環境変数が正しく設定されているか確認：
   ```bash
   firebase functions:config:get
   ```

3. Gmailのセキュリティ設定を確認：
   - 2段階認証が有効か
   - アプリパスワードが正しいか
   - 「安全性の低いアプリのアクセス」は不要（アプリパスワード使用時）

### Gmail以外のSMTPサーバーを使用する場合

`.env`ファイルの設定を変更：

```env
# 例：独自ドメインのメールサーバー
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-password
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=ヘアーサロン JOY's 予約システム
```

## セキュリティ上の注意

- `.env`ファイルは`.gitignore`に含まれており、Gitにコミットされません
- アプリパスワードは厳重に管理してください
- 本番環境では必ずFirebase Functions環境変数を使用してください
