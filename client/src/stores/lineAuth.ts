import { defineStore } from 'pinia'
import { ref } from 'vue'
import liff from '@line/liff'
import { reportLiffError } from '../lib/errorReporter'

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
  const isInitializing = ref(true) // 初期化中フラグ（ローディング表示用）※初期値trueで真っ白画面を防ぐ

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
    const timeoutId = setTimeout(async () => {
      if (isInitializing.value) {
        console.error('LINE initialization timeout (10s)')
        error.value = 'LINE初期化がタイムアウトしました。ページを更新してください。'
        isInitializing.value = false
        // 🔥 Firestoreにタイムアウトエラーを記録
        await reportLiffError(
          new Error('LINE initialization timeout after 10 seconds'),
          'init',
          import.meta.env.VITE_MINI_APP_ID
        ).catch(e => console.error('Failed to report timeout error:', e))
      }
    }, 10000)

    try {
      const miniAppId = import.meta.env.VITE_MINI_APP_ID
      if (!miniAppId) {
        const errorMsg = 'VITE_MINI_APP_ID is not defined. Please check .env file or Vercel environment variables.'
        console.error(errorMsg)
        error.value = errorMsg
        // 🔥 Firestoreに環境変数未定義エラーを記録
        await reportLiffError(
          new Error(errorMsg),
          'init',
          'undefined'
        ).catch(e => console.error('Failed to report env error:', e))
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
          // チャネル同意の簡略化対応: profileスコープの権限を確認
          try {
            console.log('Checking profile permission...')
            const permissionStatus = await liff.permission.query('profile')
            console.log('Profile permission status:', permissionStatus.state)
            
            if (permissionStatus.state === 'granted') {
              // 権限が付与済み
              profile.value = await liff.getProfile()
              console.log('LINE Profile loaded:', profile.value.displayName)
            } else if (permissionStatus.state === 'prompt') {
              // 権限を求める必要がある
              console.log('Profile permission required, requesting...')
              // ここでは権限要求せず、後でユーザーアクションで行う
              console.log('Profile will be loaded after user grants permission')
            } else {
              // denied
              console.warn('Profile permission denied')
            }
          } catch (e) {
            console.error('Profile permission check or fetch failed', e)
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
      // 🔥 Firestoreにliff.init()失敗エラーを記録
      await reportLiffError(
        err,
        'init',
        import.meta.env.VITE_MINI_APP_ID
      ).catch(e => console.error('Failed to report init error:', e))
      // エラー時もアラート表示
      if (import.meta.env.DEV || import.meta.env.MODE === 'staging') {
        alert(`LINE初期化エラー: ${err.message}`)
      }
    } finally {
      isInitializing.value = false
    }
  }

  /**
   * プロフィール権限を要求してプロフィールを取得
   */
  const requestProfilePermission = async () => {
    if (!isInitialized.value || !liff.isLoggedIn()) {
      console.warn('LIFF not initialized or not logged in')
      return false
    }

    try {
      const permissionStatus = await liff.permission.query('profile')
      
      if (permissionStatus.state === 'granted') {
        // 既に権限付与済み
        if (!profile.value) {
          profile.value = await liff.getProfile()
        }
        return true
      } else if (permissionStatus.state === 'prompt') {
        // ユーザーに許可を求める
        await liff.permission.requestAll()
        // 権限付与後、プロフィール取得
        profile.value = await liff.getProfile()
        return true
      } else {
        // denied
        console.warn('Profile permission denied by user')
        return false
      }
    } catch (e) {
      console.error('Failed to request profile permission', e)
      return false
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

  /**
   * LIFFログアウト
   * 退会時やトークン無効時にアクセストークンをクリアする
   */
  const logout = () => {
    if (!isInitialized.value) {
      console.warn('LINE not initialized')
      return
    }

    try {
      if (liff.isLoggedIn()) {
        console.log('Logging out from LIFF...')
        liff.logout()
        profile.value = null
        console.log('LIFF logout completed')
      }
    } catch (e) {
      console.error('LIFF logout failed', e)
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
    logout,
    refreshProfile,
    requestProfilePermission
  }
})
