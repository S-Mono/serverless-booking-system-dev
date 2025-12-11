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

    // 10秒タイムアウト設定
    const timeout = setTimeout(() => {
      if (isInitializing.value) {
        error.value = 'LIFF初期化がタイムアウトしました。ネットワークを確認してください。'
        console.error('LIFF init timeout')
        isInitializing.value = false
      }
    }, 10000)

    try {
      const miniAppId = import.meta.env.VITE_MINI_APP_ID
      console.log('[DEBUG] VITE_MINI_APP_ID:', miniAppId)
      console.log('[DEBUG] import.meta.env:', import.meta.env)
      
      if (!miniAppId) {
        const errorMsg = 'VITE_MINI_APP_ID is not defined. Please check .env file or Vercel environment variables.'
        console.error(errorMsg)
        error.value = errorMsg
        // 审査・開発環境でエラーを明示的に表示
        if (import.meta.env.DEV || import.meta.env.MODE === 'staging') {
          alert(errorMsg)
        }
        clearTimeout(timeout)
        isInitializing.value = false
        return
      }

      console.log('[DEBUG] Initializing LINE Mini App:', miniAppId)
      console.log('[DEBUG] window.location:', window.location.href)
      console.log('[DEBUG] navigator.userAgent:', navigator.userAgent)

      // LIFF SDKが読み込まれているか確認
      if (typeof liff === 'undefined') {
        throw new Error('LIFF SDKが読み込まれていません')
      }

      // LINEミニアプリ初期化（LIFF SDKを使用）
      console.log('[DEBUG] Calling liff.init...')
      await liff.init({ liffId: miniAppId })
      console.log('[DEBUG] liff.init completed')
      
      clearTimeout(timeout)
      isInitialized.value = true

      // LINEアプリ内かどうかの判定
      if (liff.isInClient()) {
        isLineApp.value = true
        console.log('[DEBUG] Running in LINE app')
        
        // ミニアプリは常にログイン状態のはず
        if (liff.isLoggedIn()) {
          try {
            profile.value = await liff.getProfile()
            console.log('[DEBUG] LINE Profile loaded:', profile.value.displayName)
          } catch (e) {
            console.error('[DEBUG] Profile fetch failed', e)
          }
        } else {
          console.warn('[DEBUG] Not logged in (unexpected in Mini App)')
        }
      } else {
        console.log('[DEBUG] Not running in LINE app (browser or other)')
      }
    } catch (err: any) {
      clearTimeout(timeout)
      console.error('[DEBUG] LINE Mini App init failed', err)
      console.error('[DEBUG] Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name
      })
      error.value = `初期化エラー: ${err.message}`
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
