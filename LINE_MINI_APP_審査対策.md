# LINEミニアプリ審査対策ガイド

## 審査却下の原因と対策

### 問題: 審査用LIFF URLが真っ白な画面のまま開けない

#### 考えられる原因
1. **環境変数の設定ミス**: 審査用LIFF IDが正しく設定されていない
2. **LIFF初期化エラー**: エラーハンドリングが不十分で画面が真っ白になる
3. **ビルド環境の問題**: 開発環境用の設定でビルドしてしまった

#### 対策

### 1. 審査用ビルドの作成

```bash
cd client

# 審査環境用の環境変数ファイルを使用
cp .env.review .env

# ビルド
npm run build

# distフォルダの内容をVercelにデプロイ
```

### 2. LIFF IDの確認

審査用LIFF ID: `2000207130-jq8XNWKo`

以下のファイルで正しく設定されているか確認：
- `.env.review` ファイル
- ビルド時の環境変数

### 3. エラーハンドリングの改善

LoginView.vueで以下を実装済み：
- LIFF初期化失敗時も画面を表示
- エラーメッセージの表示
- フォールバック処理

### 4. 動作確認手順

#### ローカルでの確認
```bash
# 審査環境用の設定で起動
cp .env.review .env
npm run dev
```

ブラウザで以下を確認：
1. コンソールログで「Initializing LINE Mini App: 2000207130-jq8XNWKo」と表示される
2. LIFF初期化エラーが発生しても、ログイン画面が表示される
3. 電話番号ログインが正常に動作する

#### LINE Developersコンソールでの確認
1. LIFF ID `2000207130-jq8XNWKo` の設定を確認
2. エンドポイントURLが審査用のVercel URLと一致しているか確認
3. Scopeが適切に設定されているか確認（`profile`, `openid`）

### 5. デプロイ手順

```bash
# 1. 審査用ビルド
cd client
cp .env.review .env
npm run build

# 2. Vercelにデプロイ
# (Vercelの管理画面またはCLIでデプロイ)

# 3. デプロイ後の確認
# 審査用URLにアクセスして動作確認

# 4. 元の環境に戻す
cp .env.development .env
```

### 6. チェックリスト

審査申請前に以下を確認：

- [ ] 審査用LIFF IDで正しくビルドされている
- [ ] Vercelにデプロイ済み
- [ ] 審査用URLでログイン画面が表示される
- [ ] LINEアプリ内で開いた時にエラーが出ない
- [ ] 電話番号ログインが動作する
- [ ] Googleログインが動作する
- [ ] 予約機能が正常に動作する
- [ ] マイページが表示される
- [ ] 管理画面へのアクセスが制限されている

### 7. よくある問題と解決方法

#### 問題: 真っ白な画面が表示される
**解決方法:**
- ブラウザの開発者ツールでコンソールエラーを確認
- LIFF IDが正しいか確認
- ビルド時の環境変数を確認

#### 問題: LIFF初期化エラー
**解決方法:**
- LIFF IDが正しいか確認
- エンドポイントURLが正しいか確認
- LIFF設定のスコープを確認

#### 問題: ログインできない
**解決方法:**
- Firebase Authenticationの設定を確認
- Firestoreのセキュリティルールを確認
- ネットワークタブでAPIエラーを確認

### 8. 環境の切り替え

開発環境、審査環境、本番環境の切り替え：

```bash
# 開発環境
cp .env .env.backup  # バックアップ
echo "VITE_MINI_APP_ID=2000207129-d8Zq4GxE" > .env.temp
cat .env.backup | grep -v VITE_MINI_APP_ID >> .env.temp
mv .env.temp .env

# 審査環境
cp .env.review .env

# 本番環境
echo "VITE_MINI_APP_ID=2000207131-6onpDmb9" > .env.temp
cat .env.backup | grep -v VITE_MINI_APP_ID >> .env.temp
mv .env.temp .env
```

### 9. デバッグ情報の確認

審査用URLにアクセスした際、ブラウザのコンソールに以下が表示されることを確認：

```
Initializing LINE Mini App: 2000207130-jq8XNWKo
LIFF initialized successfully
liff.isInClient(): true/false
liff.isLoggedIn(): true/false
```

エラーが発生した場合、エラーコードとメッセージを確認してください。

## 連絡先

問題が解決しない場合は、LINE Developers公式サポートに問い合わせてください。
