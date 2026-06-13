import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
// import { reportError } from './lib/errorReporter'

const CHUNK_RELOAD_GUARD_KEY = 'chunk_reload_guard'

const isChunkLoadError = (error: unknown): boolean => {
  const message =
    typeof error === 'string' ?
      error :
      (error as { message?: string } | null)?.message || ''

  return [
    'Failed to fetch dynamically imported module',
    'Importing a module script failed',
    'Loading chunk',
    'dynamically imported module'
  ].some((keyword) => message.includes(keyword))
}

const reloadForChunkError = (): boolean => {
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === '1') {
      return false
    }
    sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, '1')
  } catch {
    // sessionStorage が使えない環境ではガードなしでリロード
  }

  window.location.reload()
  return true
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  reloadForChunkError()
})

// グローバルAbortErrorハンドラー（vConsoleより先に設定）
window.addEventListener('unhandledrejection', async(event) => {
  const reason = event.reason

  if (isChunkLoadError(reason)) {
    event.preventDefault()
    event.stopImmediatePropagation()
    reloadForChunkError()
    return false
  }
  
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

router.onError((error) => {
  if (isChunkLoadError(error)) {
    reloadForChunkError()
  }
})

app.use(createPinia())
app.use(router)

app.mount('#app')

try {
  sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY)
} catch {
  // noop
}
