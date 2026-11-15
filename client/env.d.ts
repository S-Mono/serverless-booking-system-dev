/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LIFF_ID: string
  readonly VITE_RECAPTCHA_SITE_KEY?: string
  // 他に使う環境変数があればここに追加
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __APP_VERSION__: string
