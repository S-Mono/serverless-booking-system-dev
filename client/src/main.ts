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

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
