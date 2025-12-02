import { defineStore } from 'pinia'
import { ref } from 'vue'
import liff from '@line/liff'

export const useLiffStore = defineStore('liff', () => {
  // 状態
  const isLiffBrowser = ref(false) // LINEアプリ内ブラウザかどうか
  const profile = ref<any>(null)   // LINEプロフィール情報
  const error = ref<string | null>(null)

  // 初期化アクション
  const init = async () => {
    // ローカル環境ではLIFF初期化をスキップ（開発用）
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      console.log('Localhost detected: Skipping LIFF init in Store')
      return
    }

    try {
      const liffId = import.meta.env.VITE_LIFF_ID
      if (!liffId) {
        console.warn('VITE_LIFF_ID is not defined')
        return
      }

      // LIFF初期化
      await liff.init({ liffId })

      // LINEアプリ内かどうかの判定
      if (liff.isInClient()) {
        isLiffBrowser.value = true
        
        // ログイン済みならプロフィール取得を試みる
        if (liff.isLoggedIn()) {
          try {
            profile.value = await liff.getProfile()
          } catch (e) {
            console.error('Profile fetch failed', e)
          }
        }
      }
    } catch (err: any) {
      console.error('LIFF init failed', err)
      error.value = err.message
    }
  }

  // ログイン処理（LoginViewからも呼び出せるように）
  const login = () => {
    if (!liff.isLoggedIn()) {
      liff.login()
    }
  }

  return {
    // State
    isLiffBrowser,
    profile,
    error,
    // Actions
    init,
    login
  }
})