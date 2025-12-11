import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

// 🟢 vConsole for mobile debugging (LINEミニアプリでコンソールログを確認するため)
// 開発・審査環境でのみ有効化
if (import.meta.env.MODE !== 'production') {
  import('vconsole').then(({ default: VConsole }) => {
    new VConsole()
    console.log('[vConsole] Enabled for debugging')
  })
}

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
