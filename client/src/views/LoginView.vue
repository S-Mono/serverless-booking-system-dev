<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { auth, db } from '../lib/firebase'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  type User
} from 'firebase/auth'
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore'
import liff from '@line/liff'

const router = useRouter()

const isLoginMode = ref(true)
const phoneNumber = ref('')
const password = ref('')
const loading = ref(false)
const message = ref('')
// social 認証専用の状態 (google | line) を保持します。
const socialAuth = ref<string | null>(null)
const miniAppLoading = ref(true)
const isLineApp = ref(false)

const PSEUDO_DOMAIN = '@local.booking-system'
const LINE_DOMAIN = '@line.booking-system'

const createCustomerData = async (user: User, provider: 'google' | 'line' | 'phone', name?: string, nameKanji?: string) => {
  try {
    const docRef = doc(db, 'customers', user.uid)
    const docSnap = await getDoc(docRef)
    if (!docSnap.exists()) {
      await setDoc(docRef, {
        name_kanji: nameKanji || '',
        name_kana: name || user.displayName || 'ゲスト',
        phone_number: provider === 'phone' ? user.email?.split('@')[0] : '',
        email: user.email || '',
        is_existing_customer: false,
        preferred_category: 'barber',
        provider: provider,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now()
      })
    }
  } catch (e) { console.error('顧客データ作成エラー:', e) }
}

onMounted(async () => {
  // 1. LINEアプリ判定
  if (/Line/i.test(navigator.userAgent)) {
    isLineApp.value = true
  }

  // 2. Googleリダイレクト復帰チェック
  try {
    const result = await getRedirectResult(auth)
    if (result) {
      await createCustomerData(result.user, 'google')
      router.push('/')
      return
    }
  } catch (error: any) {
    if (error.code !== 'auth/popup-closed-by-user') {
      console.error(error)
    }
  }

  // 3. LINEミニアプリ初期化
  try {
    const miniAppId = import.meta.env.VITE_MINI_APP_ID
    if (miniAppId) {
      console.log('Initializing LINE Mini App:', miniAppId)
      await liff.init({ liffId: miniAppId })

      console.log('LIFF initialized successfully')
      console.log('liff.isInClient():', liff.isInClient())
      console.log('liff.isLoggedIn():', liff.isLoggedIn())

      if (liff.isInClient()) {
        isLineApp.value = true
        console.log('Running in LINE app')

        // ログアウト直後かチェック（5秒以内なら自動ログインをスキップ）
        const logoutFlag = localStorage.getItem('logout_flag')
        const now = Date.now()
        if (logoutFlag && now - parseInt(logoutFlag) < 5000) {
          console.log('Recently logged out, skipping auto-login')
          localStorage.removeItem('logout_flag')
        } else {
          // ミニアプリは自動ログイン状態のため、すぐに認証処理
          if (liff.isLoggedIn()) {
            console.log('Already logged in, attempting auto-login...')
            // 自動ログイン処理を実行
            await autoLoginWithLine()
          } else {
            console.warn('Not logged in in LINE app - this should not happen in Mini App')
          }
        }
      } else {
        console.log('Not running in LINE app (browser or other)')
      }
    } else {
      console.warn('VITE_MINI_APP_ID is not defined')
    }
  } catch (error) {
    console.error('LINE Mini App init failed', error)
  } finally {
    miniAppLoading.value = false
  }
})

/**
 * LINEミニアプリ自動ログイン
 * ミニアプリ起動時に既にログイン状態の場合、自動的にFirebase認証
 */
const autoLoginWithLine = async () => {
  try {
    console.log('=== autoLoginWithLine START ===')
    socialAuth.value = 'line'
    message.value = 'LINEアカウントで認証中...'

    await setPersistence(auth, browserLocalPersistence)
    console.log('Getting LINE profile...')
    const profile = await liff.getProfile()
    console.log('LINE profile:', profile)

    const lineUserId = profile.userId
    const lineName = profile.displayName
    const firebaseEmail = `line_${lineUserId}${LINE_DOMAIN}`
    const firebasePassword = `line_pass_${lineUserId}`

    console.log('Firebase email:', firebaseEmail)

    let user: User
    try {
      console.log('Attempting to sign in...')
      const cred = await signInWithEmailAndPassword(auth, firebaseEmail, firebasePassword)
      user = cred.user
      console.log('LINE user signed in:', user.uid)
    } catch (error: any) {
      console.log('Sign in error:', error.code, error.message)
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        console.log('Creating new LINE user...')
        const cred = await createUserWithEmailAndPassword(auth, firebaseEmail, firebasePassword)
        user = cred.user
        console.log('New LINE user created:', user.uid)
      } else {
        throw error
      }
    }

    console.log('Creating customer data...')
    await createCustomerData(user, 'line', lineName, lineName)

    // 成功時はオーバーレイをクリアしてから遷移
    console.log('Login successful, redirecting to /')
    socialAuth.value = null
    router.push('/')
  } catch (error: any) {
    console.error('Auto login failed:', error)
    message.value = `LINE自動ログイン失敗: ${error.message}`
    socialAuth.value = null
  }
}

/**
 * 🟢 LINEログイン（手動ボタン押下時）
 * ミニアプリでは通常不要だが、フォールバック用に残す
 */
const loginWithLine = async () => {
  socialAuth.value = 'line'
  message.value = 'LINEアカウントを確認中...'

  if (!liff.isLoggedIn()) {
    console.log('Not logged in, redirecting to LINE login...')
    liff.login()
    return
  }

  // 既にログイン済みの場合は自動ログイン処理と同じ
  await autoLoginWithLine()
}

// 🔵 Googleログイン
const loginWithGoogle = async () => {
  // social 認証フローを示す
  socialAuth.value = 'google'
  message.value = 'Googleで認証中...'
  loading.value = true
  try {
    await setPersistence(auth, browserLocalPersistence)
    const provider = new GoogleAuthProvider()

    // スマホならリダイレクト
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    if (isMobile) {
      await signInWithRedirect(auth, provider)
    } else {
      const result = await signInWithPopup(auth, provider)
      if (result.user) {
        await createCustomerData(result.user, 'google')
        router.push('/')
      }
    }
    // popup 成功または redirect 前に処理が抜けるため socialAuth をクリア
    socialAuth.value = null
  } catch (error: any) {
    console.error(error)
    message.value = `Googleログイン失敗: ${error.message}`
    loading.value = false
    socialAuth.value = null
  }
}

// 📞 電話番号認証
const handleAuth = async () => {
  loading.value = true
  message.value = ''
  try {
    await setPersistence(auth, browserLocalPersistence)
    const pseudoEmail = `${phoneNumber.value}${PSEUDO_DOMAIN}`
    let user: User
    if (isLoginMode.value) {
      const cred = await signInWithEmailAndPassword(auth, pseudoEmail, password.value)
      user = cred.user
    } else {
      const cred = await createUserWithEmailAndPassword(auth, pseudoEmail, password.value)
      user = cred.user
    }
    await createCustomerData(user, 'phone')
    router.push('/')
  } catch (error: any) {
    console.error(error)
    if (error.code === 'auth/invalid-email') message.value = '電話番号の形式が正しくありません'
    else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') message.value = '電話番号またはパスワードが違います'
    else if (error.code === 'auth/email-already-in-use') message.value = 'この電話番号は既に登録されています'
    else if (error.code === 'auth/weak-password') message.value = 'パスワードは6文字以上で設定してください'
    else message.value = `エラー: ${error.message}`
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-container">
    <h2>{{ isLoginMode ? 'ログイン' : '新規会員登録' }}</h2>

    <div v-if="miniAppLoading" class="loading-text">LINE連携を確認中...</div>

    <div class="social-login">
      <button v-if="isLineApp" class="line-login-btn" @click="loginWithLine" :disabled="loading">
        <span class="line-icon">L</span> LINEアカウントでログイン
      </button>
      <button v-else class="google-btn" @click="loginWithGoogle" :disabled="loading">
        <span class="g-icon">G</span> Googleでログイン
      </button>
    </div>

    <!-- 認証中オーバーレイ（LINE / Google 用） -->
    <div v-if="socialAuth" class="auth-overlay" aria-live="polite">
      <div class="auth-overlay-inner">
        <div class="spinner" aria-hidden="true"></div>
        <div class="overlay-text">{{ socialAuth === 'line' ? 'LINEで認証中...' : 'Googleで認証中...' }}</div>
      </div>
    </div>

    <div class="divider"><span>または 電話番号</span></div>

    <form @submit.prevent="handleAuth" class="auth-form">
      <div class="form-group">
        <label>電話番号 (ハイフンなし)</label>
        <input type="tel" v-model="phoneNumber" placeholder="09012345678" required pattern="[0-9]*" />
      </div>
      <div class="form-group">
        <label>パスワード</label>
        <input type="password" v-model="password" placeholder="6文字以上" required minlength="6" />
      </div>
      <button type="submit" class="submit-btn" :disabled="loading">
        {{ loading ? '処理中...' : (isLoginMode ? 'ログイン' : '登録する') }}
      </button>
    </form>

    <p v-if="message" class="message">{{ message }}</p>

    <p class="toggle-mode">
      {{ isLoginMode ? '初めての方はこちら' : 'すでにアカウントをお持ちの方' }}
      <a href="#" @click.prevent="isLoginMode = !isLoginMode">
        {{ isLoginMode ? '新規登録' : 'ログイン' }}
      </a>
    </p>
  </div>
</template>

<style scoped>
/* CSSは前回と同じ */
.auth-container {
  max-width: 400px;
  margin: 2rem auto;
  padding: 2rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  background-color: #fff;
}

h2 {
  text-align: center;
  margin-bottom: 1.5rem;
}

.loading-text {
  text-align: center;
  color: #666;
  font-size: 0.8rem;
  margin-bottom: 1rem;
}

.social-login {
  margin-bottom: 1.5rem;
}

.google-btn {
  width: 100%;
  background-color: #fff;
  color: #757575;
  border: 1px solid #ddd;
  padding: 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: bold;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: background 0.2s;
}

.google-btn:hover {
  background-color: #f8f9fa;
}

.g-icon {
  font-weight: 900;
  color: #4285F4;
  font-family: sans-serif;
  font-size: 1.2rem;
}

.line-login-btn {
  width: 100%;
  background-color: #06C755;
  color: #fff;
  border: none;
  padding: 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: bold;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: opacity 0.2s;
}

.line-login-btn:hover {
  opacity: 0.9;
}

.line-icon {
  font-weight: 900;
  font-family: sans-serif;
  font-size: 1.2rem;
}

.divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin-bottom: 1.5rem;
  color: #999;
  font-size: 0.85rem;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid #ddd;
}

.divider span {
  padding: 0 10px;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  text-align: left;
}

label {
  font-weight: bold;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

input {
  padding: 0.8rem;
  font-size: 1.1rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  letter-spacing: 0.05em;
}

.submit-btn {
  background-color: #42b883;
  color: white;
  border: none;
  padding: 0.8rem;
  font-size: 1rem;
  cursor: pointer;
  margin-top: 0.5rem;
  border-radius: 4px;
  font-weight: bold;
}

.submit-btn:disabled {
  background-color: #ccc;
}

.message {
  margin-top: 1rem;
  color: red;
  font-size: 0.9rem;
  text-align: center;
}

.toggle-mode {
  margin-top: 1.5rem;
  font-size: 0.9rem;
  text-align: center;
}

.toggle-mode a {
  color: #3498db;
  font-weight: bold;
  margin-left: 0.5rem;
  text-decoration: none;
}

.toggle-mode a:hover {
  text-decoration: underline;
}

/* social auth 用オーバーレイ */
.auth-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  z-index: 9999;
}

.auth-overlay-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  background: rgba(255, 255, 255, 0.95);
  padding: 1rem 1.25rem;
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
}

.overlay-text {
  font-weight: bold;
  color: #333;
}

.spinner {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 4px solid rgba(0, 0, 0, 0.12);
  border-top-color: #42b883;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>