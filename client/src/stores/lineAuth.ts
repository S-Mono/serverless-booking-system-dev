import { defineStore } from 'pinia'
import { ref } from 'vue'
import liff from '@line/liff'

/**
 * LINEミニアプリ認証用Store
 * 旧: useLiffStore → 新: useLineAuthStore
 */
export const useLineAuthStore = defineStore('lineAuth', () => {
  // 状態
  const isLineApp = ref(false) // LINEアプリ内かどうか
  const profile = ref<any>(null) // LINEプロフィール情報
  const error = ref<string | null>(null)
  const isInitialized = ref(false) // 初期化完了フラグ
  const isInitializing = ref(false) // 初期化中フラグ（ローディング表示用）

  /**
   * LINEミニアプリの初期化
   * ローカル環境でもミニアプリIDがあれば初期化を試みる（検証用）
   */
  const init = async () => {
    if (isInitialized.value) {
      console.log('LINE Mini App already initialized')
      return
    }

    isInitializing.value = true

    // 🟢 タイムアウト処理（10秒で強制的に終了）
    const timeoutId = setTimeout(() => {
      if (isInitializing.value) {
        console.error('LINE initialization timeout (10s)')
        error.value = 'LINE初期化がタイムアウトしました。ページを更新してください。'
        isInitializing.value = false
      }
    }, 10000)

    try {
      const miniAppId = import.meta.env.VITE_MINI_APP_ID
      if (!miniAppId) {
        const errorMsg = 'VITE_MINI_APP_ID is not defined. Please check .env file or Vercel environment variables.'
        console.error(errorMsg)
        error.value = errorMsg
        // 審査・開発環境でエラーを明示的に表示
        if (import.meta.env.DEV || import.meta.env.MODE === 'staging') {
          alert(errorMsg)
        }
        clearTimeout(timeoutId)
        isInitializing.value = false
        return
      }

      console.log('Initializing LINE Mini App:', miniAppId)
      console.log('Current URL:', window.location.href)
      console.log('User Agent:', navigator.userAgent)

      // LINEミニアプリ初期化（LIFF SDKを使用）
      await liff.init({ liffId: miniAppId })
      
      clearTimeout(timeoutId)
      isInitialized.value = true

      // LINEアプリ内かどうかの判定
      if (liff.isInClient()) {
        isLineApp.value = true
        console.log('Running in LINE app')
        
        // ミニアプリは常にログイン状態のはず
        if (liff.isLoggedIn()) {
          try {
            profile.value = await liff.getProfile()
            console.log('LINE Profile loaded:', profile.value.displayName)
          } catch (e) {
            console.error('Profile fetch failed', e)
          }
        } else {
          console.warn('Not logged in (unexpected in Mini App)')
        }
      } else {
        console.log('Not running in LINE app (browser or other)')
      }
    } catch (err: any) {
      clearTimeout(timeoutId)
      console.error('LINE Mini App init failed', err)
      error.value = err.message
      // エラー時もアラート表示
      if (import.meta.env.DEV || import.meta.env.MODE === 'staging') {
        alert(`LINE初期化エラー: ${err.message}`)
      }
    } finally {
      isInitializing.value = false
    }
  }

  /**
   * ログイン処理
   * ミニアプリでは通常不要（常にログイン状態）だが、
   * フォールバック用に残しておく
   */
  const login = () => {
    if (!liff.isLoggedIn()) {
      console.log('Attempting LIFF login...')
      liff.login()
    } else {
      console.log('Already logged in')
    }
  }

  /**
   * プロフィール再取得
   */
  const refreshProfile = async () => {
    if (!isInitialized.value) {
      console.warn('LINE not initialized')
      return
    }

    try {
      if (liff.isLoggedIn()) {
        profile.value = await liff.getProfile()
      }
    } catch (e) {
      console.error('Profile refresh failed', e)
    }
  }

  return {
    // State
    isLineApp,
    profile,
    error,
    isInitialized,
    isInitializing, // 追加: ローディング表示用
    // Actions
    init,
    login,
    refreshProfile
  }
})
