# パスワードリセットツール

## 概要
Firebase Authenticationのユーザーパスワードを管理者権限でリセットするためのツールです。

## 前提条件
- Node.jsがインストールされていること
- 依存パッケージがインストールされていること（yargs）

## 使用方法

### 本番環境でのパスワードリセット

```bash
cd /home/s_monou/booking-app/serverless-booking-system/tools/firebase-admin
node reset-password.js --email ユーザーのメールアドレス --password 新しいパスワード
```

### 開発環境でのパスワードリセット

```bash
cd /home/s_monou/booking-app/serverless-booking-system-d/tools/firebase-admin
node reset-password.js --email ユーザーのメールアドレス --password 新しいパスワード
```

## 使用例

```bash
# 本番環境: k.monou5449@gmail.com のパスワードを Admin123456 にリセット
cd /home/s_monou/booking-app/serverless-booking-system/tools/firebase-admin
node reset-password.js --email k.monou5449@gmail.com --password Admin123456

# 開発環境: test@example.com のパスワードを Test123456 にリセット
cd /home/s_monou/booking-app/serverless-booking-system-d/tools/firebase-admin
node reset-password.js --email test@example.com --password Test123456
```

## パラメータ

| パラメータ | 必須 | 説明 |
|----------|------|------|
| `--email` | ✅ | パスワードをリセットするユーザーのメールアドレス |
| `--password` | ✅ | 新しいパスワード（6文字以上） |

## パスワード要件
- **最小文字数**: 6文字以上

## 実行結果

### 成功時
```
✅ Firebase Admin initialized (本番環境)
ユーザー検出: k.monou5449@gmail.com (UID: IXdqLwazyYZJcqMIgEj1Mo4RbXr2)
✅ パスワードを正常にリセットしました
メール: k.monou5449@gmail.com
新しいパスワード: Admin123456
```

### エラー時

**パラメータ不足**
```
❌ --email と --password が必要です
使用例: node reset-password.js --email user@example.com --password newPassword123
```

**パスワードが短すぎる**
```
❌ パスワードは6文字以上必要です
```

**ユーザーが見つからない**
```
❌ Failed: There is no user record corresponding to the provided identifier.
```

## 注意事項

1. このスクリプトは管理者権限で実行されます
2. パスワードはコンソールに表示されるため、実行時は画面を他人に見られないようにしてください
3. リセット後、ユーザーには通知されません。新しいパスワードを別途伝える必要があります
4. 本番環境と開発環境で異なるサービスアカウントキーを使用しています

## 関連ツール

- `set-admin-prod.js` / `set-admin-dev.js`: 管理者権限の付与/削除
- `list-users.js`: ユーザー一覧の表示
- `create-user.js`: 新規ユーザーの作成

## トラブルシューティング

### エラー: Cannot find module 'yargs'
```bash
cd /home/s_monou/booking-app/serverless-booking-system/tools/firebase-admin
npm install
```

### エラー: Service account key file not found
サービスアカウントキーのパスが正しいか確認してください：
- 本番環境: `../../booking-system-firebase-764d2-firebase-adminsdk-fbsvc-5f79f3985e.json`
- 開発環境: `../../booking-system-dev-81786-firebase-adminsdk-fbsvc-8126f47cb0.json`
