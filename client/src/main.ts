import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

// 🟢 vConsole for mobile debugging (LINEミニアプリでコンソールログを確認するため)
// 審査中は常に有効化（審査完了後に削除）
import('vconsole').then(({ default: VConsole }) => {
  new VConsole()
  console.log('[vConsole] Enabled for debugging')
})

// 🟢 グローバルAbortErrorハンドラー（Firebase SDKの内部リクエスト中断を静かに処理）
window.addEventListener('unhandledrejection', (event) => {
  // AbortErrorはユーザーのページ遷移などによる正常な中断
  if (event.reason?.name === 'AbortError') {
    event.preventDefault() // コンソールエラーを抑制
    console.log('[Global] AbortError caught and suppressed')
  }
})

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
