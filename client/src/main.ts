import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
// import { reportError } from './lib/errorReporter'

// グローバルAbortErrorハンドラー（vConsoleより先に設定）
window.addEventListener('unhandledrejection', async(event) => {
  const reason = event.reason
  
  // AbortErrorを多様な方法で検出
  const isAbortError = 
    reason?.name === 'AbortError' ||
    reason?.constructor?.name === 'AbortError' ||
    (reason instanceof Error && reason.name === 'AbortError') ||
    (typeof reason === 'object' && reason !== null && (
      reason.message?.includes('aborted') ||
      reason.message?.includes('user aborted')
    ))
  
  if (isAbortError) {
    event.preventDefault() // コンソールエラーを抑制
    event.stopImmediatePropagation() // 他のリスナーへの伝播を停止
    return false
  }
  
  // それ以外のエラーは詳細にログ出力してFirestoreに記録
  console.error('=== Unhandled Promise Rejection ===')
  console.error('Reason:', reason)
  console.error('Type:', typeof reason)
  console.error('Stack:', reason?.stack)

  // ✅ エラーが起きた時だけ動的にインポートして実行
  const { reportError } = await import('./lib/errorReporter')
  // Firestoreにエラーレポート送信
  reportError(reason, 'UNHANDLED_REJECTION')
}, true) // キャプチャフェーズで先に処理

// グローバルエラーハンドラー
window.addEventListener('error', async(event) => {
  console.error('=== Global Error ===')
  console.error('Message:', event.message)
  console.error('Filename:', event.filename)
  console.error('Line:', event.lineno, 'Column:', event.colno)
  console.error('Error:', event.error)
  
  // Firestoreにエラーレポート送信
  const { reportError } = await import('./lib/errorReporter')

  reportError(event.error || new Error(event.message), 'GLOBAL_ERROR', {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  })
})

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
