<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
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
import { useLineAuthStore } from '../stores/lineAuth'

const router = useRouter()
const lineAuthStore = useLineAuthStore()

const isLoginMode = ref(true)
const phoneNumber = ref('')
const password = ref('')
const loading = ref(false)
const message = ref('')
// social 認証専用の状態 (google | line) を保持します。
const socialAuth = ref<string | null>(null)
const miniAppLoading = ref(true)
// isLineAppはStoreから取得（2重管理を避ける）
const isLineApp = computed(() => lineAuthStore.isLineApp)

const PSEUDO_DOMAIN = '@local.booking-system'
const LINE_DOMAIN = '@line.booking-system'

// 電話番号フォーマット（ハイフン自動補完）
const formatPhoneNumber = (value: string) => {
  const numbers = value.replace(/[^0-9]/g, '')
  if (numbers.length <= 3) return numbers
  if (numbers.length <= 6) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
  if (numbers.length === 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
  if (numbers.length === 8) return `${numbers.slice(0, 4)}-${numbers.slice(4)}`
  if (numbers.length === 9) return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6)}`
  if (numbers.length === 10) {
    if (['090', '080', '070', '050'].includes(numbers.slice(0, 3))) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`
    }
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6)}`
  }
  if (numbers.length >= 11) return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`
  return numbers
}

const handlePhoneInput = (event: Event) => {
  const input = event.target as HTMLInputElement
  phoneNumber.value = formatPhoneNumber(input.value)
}

const createCustomerData = async (user: User, provider: 'google' | 'line' | 'phone', name?: string, nameKanji?: string) => {
  try {
    console.log('[createCustomerData] Starting with provider:', provider)
    console.log('[createCustomerData] User email:', user.email)

    const docRef = doc(db, 'customers', user.uid)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      const phoneNumberValue = provider === 'phone' ? user.email?.split('@')[0] || '' : ''
      console.log('[createCustomerData] Creating new customer with phone_number:', phoneNumberValue)

      await setDoc(docRef, {
        name_kanji: nameKanji || '',
        name_kana: name || user.displayName || '',
        phone_number: phoneNumberValue,
        email: user.email || '',
        is_existing_customer: false,
        preferred_category: 'barber',
        provider: provider,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now()
      })
      console.log('[createCustomerData] Customer document created successfully')
    } else {
      console.log('[createCustomerData] Customer document already exists')
    }
  } catch (e) {
    console.error('顧客データ作成エラー:', e)
  }
}

onMounted(async () => {
  console.log('=== LoginView.vue mounted ===')
  console.log('User agent:', navigator.userAgent)
  console.log('Mini app ID:', import.meta.env.VITE_MINI_APP_ID)

  // 1. Googleリダイレクト復帰チェック
  console.log('Checking Google redirect result...')
  try {
    const result = await getRedirectResult(auth)
    if (result) {
      console.log('Google redirect result found:', result.user.uid)
      await createCustomerData(result.user, 'google')
      router.push('/')
      return
    }
    console.log('No Google redirect result')
  } catch (error: any) {
    if (error.code !== 'auth/popup-closed-by-user') {
      console.error('Google redirect error:', error)
    }
  }

  // 2. LINEミニアプリ自動ログイン（Storeで既に初期化済み）
  console.log('Checking LINE auth state from store...')
  console.log('LINE auth initialized:', lineAuthStore.isInitialized)
  console.log('Is LINE app:', lineAuthStore.isLineApp)

  if (lineAuthStore.isInitialized && lineAuthStore.isLineApp) {
    // Storeで既にLIFFが初期化されている
    console.log('LIFF already initialized by store')
    console.log('isInClient:', liff.isInClient())
    console.log('isLoggedIn:', liff.isLoggedIn())

    // ログアウト直後かチェック（5秒以内なら自動ログインをスキップ）
    const logoutFlag = localStorage.getItem('logout_flag')
    const now = Date.now()
    if (logoutFlag && now - parseInt(logoutFlag) < 5000) {
      console.log('Logout flag detected, skipping auto login')
      localStorage.removeItem('logout_flag')
      miniAppLoading.value = false
      // 【一時ログ】自動ログインをスキップしても LINE User ID だけ記録
      // try {
      //   if (liff.isLoggedIn()) {
      //     const profile = await liff.getProfile()
      //     await setDoc(doc(db, 'tmp_line_uid_log', profile.userId), {
      //       lineUserId: profile.userId,
      //       displayName: profile.displayName,
      //       logged_at: Timestamp.now()
      //     })
      //   }
      // } catch (e) { /* ignore */ }
    } else {
      // ミニアプリは自動ログイン状態のため、すぐに認証処理
      if (liff.isLoggedIn()) {
        console.log('LIFF logged in, starting auto login...')
        try {
          await autoLoginWithLine()
        } catch (error: any) {
          console.error('Auto login failed:', error)
          message.value = `LINE自動ログイン失敗: ${error.message || 'エラーが発生しました'}`
          miniAppLoading.value = false
        }
      } else {
        console.log('LIFF not logged in')
        miniAppLoading.value = false
      }
    }
  } else {
    // LINEアプリではない、または初期化失敗
    console.log('Not in LINE app or LIFF init failed')
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

    // チャネル同意の簡略化対応: profileスコープの権限を確認・要求
    console.log('Checking and requesting profile permission...')
    const permissionStatus = await liff.permission.query('profile')
    console.log('Profile permission status:', permissionStatus.state)

    if (permissionStatus.state === 'prompt') {
      // 権限がない場合、ユーザーに許可を求める
      console.log('Requesting profile permission...')
      await liff.permission.requestAll()
      console.log('Permission granted')
    }

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
    console.log('Customer data created successfully')

    // 【一時ログ】LINE User ID を Firestore に記録（確認後削除）
    // await setDoc(doc(db, 'tmp_line_uid_log', lineUserId), {
    //   lineUserId,
    //   displayName: lineName,
    //   firebaseUid: user.uid,
    //   logged_at: Timestamp.now()
    // })

    // 成功時はオーバーレイをクリアしてから遷移
    console.log('Login successful, redirecting to /')
    socialAuth.value = null
    router.push('/')
  } catch (error: any) {
    console.error('=== Auto login failed ===', error)
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    })

    // アクセストークンが無効な場合、LIFFログアウトして再ログインを促す
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-disabled') {
      console.log('Access token may be invalid, clearing LIFF session...')
      lineAuthStore.logout()
      message.value = 'アクセストークンが無効です。再度ログインしてください。'
      miniAppLoading.value = false
      socialAuth.value = null
      return
    }

    // エラーレポート送信
    const { reportLiffError } = await import('../lib/errorReporter')
    reportLiffError(error, 'login')

    message.value = `LINE自動ログイン失敗 [${error.code || 'UNKNOWN'}]: ${error.message || 'エラーの詳細が不明です'}`
    socialAuth.value = null
    miniAppLoading.value = false
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
    // 電話番号からハイフンを除去
    const phoneNumberDigits = phoneNumber.value.replace(/[^0-9]/g, '')
    const pseudoEmail = `${phoneNumberDigits}${PSEUDO_DOMAIN}`
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

    <!-- LINE連携確認中の表示を廃止 -->

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
        <label>電話番号</label>
        <input type="tel" v-model="phoneNumber" @input="handlePhoneInput" placeholder="090-1234-5678" required
          pattern="[0-9\-]*" />
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

    <div v-if="isLoginMode" class="forgot-password">
      <router-link to="/forgot-password">パスワードをお忘れの方</router-link>
    </div>

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

.forgot-password {
  text-align: center;
  margin-top: 1rem;
  font-size: 0.85rem;
}

.forgot-password a {
  color: #667eea;
  text-decoration: none;
}

.forgot-password a:hover {
  text-decoration: underline;
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