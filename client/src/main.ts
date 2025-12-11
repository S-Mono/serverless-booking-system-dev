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
  const reason = event.reason
  
  // AbortErrorを多様な方法で検出
  const isAbortError = 
    reason?.name === 'AbortError' ||
    reason?.constructor?.name === 'AbortError' ||
    (reason instanceof Error && reason.name === 'AbortError') ||
    (typeof reason === 'object' && reason?.message?.includes('aborted'))
  
  if (isAbortError) {
    event.preventDefault() // コンソールエラーを抑制
    // デバッグ用に詳細を記録（本番では削除可）
    if (import.meta.env.MODE !== 'production') {
      console.log('[Global] AbortError suppressed:', reason)
    }
    return false // エラー伝播を停止
  }
})

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
