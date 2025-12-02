# LINEミニアプリ移行完了ドキュメント

## ✅ 完了した作業

LIFFからLINEミニアプリへの完全移行が完了しました。

### 変更されたファイル

1. **client/.env**
   - `VITE_LIFF_ID` → `VITE_MINI_APP_ID` に変更
   - 開発環境ID: 2000207129（デフォルト）
   - 審査環境ID: 2000207130（コメント）
   - 本番環境ID: 2000207131（コメント）

2. **client/src/stores/lineAuth.ts**（新規作成）
   - 旧 `liff.ts` を置き換え
   - `useLineAuthStore` として実装
   - ミニアプリの初期化・プロフィール取得機能

3. **client/src/views/LoginView.vue**
   - ミニアプリ自動ログイン機能を追加
   - `autoLoginWithLine()` 関数で起動時に自動認証
   - `liffLoading` → `miniAppLoading` に変数名変更

4. **client/src/App.vue**
   - `useLiffStore` → `useLineAuthStore` に変更

5. **client/src/stores/liff.ts**（削除）
   - 旧LIFFファイルを削除

---

## 🔧 次に必要な作業

### 1. パッケージ依存関係の確認（重要）

現在の `@line/liff` パッケージはLIFFとミニアプリの両方に対応しています。
2024年12月時点では、**そのまま使用可能**です。

念のため、最新バージョンを確認してください：

```bash
cd client
npm update @line/liff
```

もし専用パッケージが必要な場合は、LINE公式ドキュメントを確認してください。

---

### 2. 環境ごとのビルド設定

現在 `.env` には開発環境IDがセットされています。
審査・本番環境へのデプロイ時は、以下のいずれかの方法でIDを切り替えてください：

#### **方法A: .env ファイルを直接編集**
```bash
# 審査環境用
VITE_MINI_APP_ID=2000207130

# 本番環境用
VITE_MINI_APP_ID=2000207131
```

#### **方法B: 環境別ファイルを作成（推奨）**
```bash
# 開発環境
.env.development
VITE_MINI_APP_ID=2000207129

# 審査環境
.env.staging
VITE_MINI_APP_ID=2000207130

# 本番環境
.env.production
VITE_MINI_APP_ID=2000207131
```

ビルド時に環境を指定：
```bash
# 開発
npm run dev

# 審査環境ビルド
npm run build -- --mode staging

# 本番環境ビルド
npm run build -- --mode production
```

---

### 3. ローカル開発環境での検証

ミニアプリは **LINEアプリ内でのみ動作** するため、ローカル開発時は以下の方法で検証してください：

#### **LINE Developers での設定**
1. LINE Developers コンソールにログイン
2. 開発用ミニアプリ（2000207129）を選択
3. 「エンドポイントURL」に以下を設定：
   - ローカル開発: `https://localhost:5173`（ngrokなどのトンネル経由）
   - または開発サーバー: `https://your-dev-server.com`

#### **ngrokを使ったローカルテスト**
```bash
# 別ターミナルでViteサーバー起動
cd client
npm run dev

# ngrokでトンネル作成
ngrok http 5173
```

ngrokのHTTPS URLをLINE Developersのエンドポイントに設定してください。

---

### 4. LINE Developers での確認事項

各ミニアプリ（開発・審査・本番）で以下を確認してください：

- ✅ **エンドポイントURL**: 正しいデプロイ先URLが設定されているか
- ✅ **スコープ設定**: `profile`、`openid` が有効か
- ✅ **リッチメニュー**: ミニアプリURLが設定されているか
  - 例: `https://miniapp.line.me/2000207129`

---

### 5. 動作確認チェックリスト

#### **✅ 開発環境**
- [ ] LINEアプリからミニアプリを起動
- [ ] 自動ログインが動作する
- [ ] プロフィール情報（名前）が取得できる
- [ ] Firebase認証が成功する
- [ ] ホーム画面（予約画面）に遷移する
- [ ] 予約作成ができる

#### **✅ 審査環境**
- [ ] 審査用IDでビルド・デプロイ
- [ ] 上記と同じ動作確認

#### **✅ 本番環境**
- [ ] 本番用IDでビルド・デプロイ
- [ ] リッチメニューからの起動確認
- [ ] 既存ユーザーのログイン動作確認

---

## 🔍 トラブルシューティング

### **問題1: 自動ログインが動作しない**
**原因**: ミニアプリが正しく初期化されていない

**解決策**:
1. ブラウザコンソールで以下を確認：
   ```
   Initializing LINE Mini App: 2000207129
   Running in LINE app
   Already logged in, attempting auto-login...
   ```
2. LINE Developersでエンドポイント URLが正しいか確認
3. `.env` のミニアプリIDが正しいか確認

---

### **問題2: "VITE_MINI_APP_ID is not defined" エラー**
**原因**: 環境変数が読み込まれていない

**解決策**:
1. `.env` ファイルが `client/` 直下にあるか確認
2. Viteサーバーを再起動：
   ```bash
   npm run dev
   ```

---

### **問題3: ローカル環境でテストできない**
**原因**: ミニアプリはLINEアプリ内でのみ動作

**解決策**:
- ngrokなどのトンネルツールを使用
- または Firebase Hosting にデプロイしてテスト

---

## 📱 デプロイ手順

### **Vercel（フロントエンド）**

#### **開発環境**
```bash
# Vercelにプッシュするだけで自動デプロイ
git add .
git commit -m "LINEミニアプリ対応"
git push origin main
```

または Vercel CLI を使用：
```bash
# Vercel CLI インストール（初回のみ）
npm install -g vercel

# デプロイ
vercel

# 本番デプロイ
vercel --prod
```

#### **環境変数の設定（Vercel Dashboard）**
1. Vercel ダッシュボードにログイン
2. プロジェクトを選択
3. Settings → Environment Variables
4. 以下を追加：

**開発環境（Preview）**:
```
VITE_MINI_APP_ID=2000207129
```

**本番環境（Production）**:
```
VITE_MINI_APP_ID=2000207131
```

**審査環境（特定ブランチ）**:
```
VITE_MINI_APP_ID=2000207130
```

---

### **Firebase（バックエンド）**

Cloud Functions と Firestore のみデプロイ：

```bash
# Cloud Functions のみ
firebase deploy --only functions

# Firestore Rules のみ
firebase deploy --only firestore:rules

# Firestore Indexes のみ
firebase deploy --only firestore:indexes

# まとめてデプロイ
firebase deploy --only functions,firestore:rules,firestore:indexes
```

---

## 📞 サポート

問題が発生した場合は、以下を確認してください：

1. **ブラウザコンソールログ**: エラーメッセージを確認
2. **LINE Developers**: 設定とログを確認
3. **Firebase Authentication**: ユーザー登録状況を確認

---

**移行作業は完了しました！** 🎉

次は上記の「次に必要な作業」を進めてください。
