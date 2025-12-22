# LINEミニアプリ審査用 検証チェックリスト

## 審査用URL
```
https://miniapp.line.me/2000207130-jq8XNWKo
```

## 1. Vercel環境変数の確認

Vercelの管理画面で以下の環境変数が正しく設定されているか確認：

### 審査用（developブランチ）の環境変数
```
VITE_MINI_APP_ID=2000207130-jq8XNWKo
VITE_FIREBASE_API_KEY=AIzaSyCJWmgozIBHbzEmtJq1EH6aAa1g5gQtGf4
VITE_FIREBASE_AUTH_DOMAIN=booking-system-firebase-764d2.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=booking-system-firebase-764d2
VITE_FIREBASE_STORAGE_BUCKET=booking-system-firebase-764d2.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=829906230754
VITE_FIREBASE_APP_ID=1:829906230754:web:6b51fa2c7f184e8788edbb
```

## 2. ブラウザでの確認事項

### Chrome DevToolsで確認
```
1. Network タブ
   - 失敗しているリクエストはないか
   - 404エラーは出ていないか
   
2. Console タブ
   - JavaScriptエラーは出ていないか
   - LIFFの初期化ログは表示されているか
   - "Initializing LINE Mini App: 2000207130-jq8XNWKo" が表示されるか
   
3. Application タブ > Local Storage
   - データが正しく保存されているか
```

### 確認すべきログメッセージ
正常な場合、以下のログが表示されるはず：
```
Initializing LINE Mini App: 2000207130-jq8XNWKo
LIFF initialized successfully
liff.isInClient(): true/false
liff.isLoggedIn(): true/false
```

エラーが出る場合、以下のようなログが表示される：
```
LINE Mini App init failed [error details]
LIFF Error Code: [error code]
```

## 3. LIFF設定の確認

LINE Developersコンソールで確認：
1. LIFF ID: `2000207130-jq8XNWKo`
2. エンドポイントURL: Vercelの審査用URL
3. Scope: `profile`, `openid`
4. LIFF app type: Full

## 4. 真っ白な画面になる主な原因

### A. JavaScriptエラー
- **確認方法**: ブラウザのConsoleタブ
- **対策**: エラーメッセージを確認して修正

### B. LIFF初期化エラー
- **確認方法**: Console に "LINE Mini App init failed" が表示される
- **対策**: LIFF IDが正しいか、エンドポイントURLが一致しているか確認

### C. ルーティングエラー
- **確認方法**: Network タブで404エラー
- **対策**: Vercelの設定で rewrites が正しく設定されているか確認

### D. 環境変数の読み込みエラー
- **確認方法**: Console で `import.meta.env.VITE_*` の値を確認
- **対策**: Vercelの環境変数が正しく設定されているか確認

### E. ビルドエラー
- **確認方法**: Vercelのデプロイログ
- **対策**: ローカルで `npm run build` を実行してエラーがないか確認

## 5. デバッグ手順

### ステップ1: ローカルで確認
```bash
cd client
cp .env.review .env
npm run dev
```
ブラウザで http://localhost:5173 にアクセスして動作確認

### ステップ2: 本番ビルドで確認
```bash
npm run build
npx vite preview
```
ブラウザで http://localhost:4173 にアクセスして動作確認

### ステップ3: Vercelのログ確認
1. Vercelの管理画面にアクセス
2. Deployments > 最新のデプロイ
3. Build Logs を確認
4. Function Logs を確認（あれば）

### ステップ4: リアルタイムデバッグ
審査用URLにアクセスして、Chrome DevToolsで：
1. Console タブで初期化ログを確認
2. Network タブでリクエストを確認
3. Sources タブでブレークポイントを設定

## 6. よくある問題と解決方法

### 問題: "Cannot read property of undefined"
**原因**: 環境変数が読み込まれていない
**解決**: Vercelの環境変数を確認、再デプロイ

### 問題: LIFF Error Code: 403
**原因**: LIFF IDとエンドポイントURLが一致していない
**解決**: LINE Developersコンソールで設定を確認

### 問題: 画面が一瞬表示されて消える
**原因**: 認証エラーでリダイレクトが発生
**解決**: Firebase Authenticationの設定を確認

### 問題: ずっとローディング画面
**原因**: 非同期処理が完了していない
**解決**: `miniAppLoading.value = false` が実行されているか確認

## 7. 緊急対応

以前動いていたバージョンに戻す：
```bash
# 特定のコミットに戻す
git checkout f13c150
git push -f origin develop
```

## 8. 連絡先

- LINE Developers サポート
- Firebase サポート
- Vercel サポート
