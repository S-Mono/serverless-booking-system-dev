# booking-app-client

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd) 
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Build for Review Environment (LINE Mini App審査用)

審査環境用にビルドする場合は、`.env.review`ファイルを使用します：

```sh
# 審査環境用の環境変数を使用してビルド
cp .env.review .env
npm run build
```

または、直接環境変数を指定してビルド：

```sh
VITE_MINI_APP_ID=2000207130-jq8XNWKo npm run build
```

ビルド後、`dist`フォルダの内容をVercelにデプロイしてください。

**重要:** 本番環境へのデプロイ前に、必ず`.env`ファイルを元に戻してください。

## Admin access / developer accounts

This project no longer uses a client-side admin key. Administrative routes (/admin/*) are protected by Firebase Authentication custom claims.

- To grant admin rights to a Firebase user you must set the `admin` custom claim for that user using Firebase Admin SDK or Cloud Function.
- Example (Node.js, using firebase-admin):

```js
await admin.auth().setCustomUserClaims('USER_UID', { admin: true })
```

After a user logs in, the client checks the ID token's claims. If `admin: true` is present the user can access admin routes. This avoids secrets in client code or env files.
```
