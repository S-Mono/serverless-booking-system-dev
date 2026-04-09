<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router'
import { auth, db } from './lib/firebase'
import { onAuthStateChanged, signOut, type Unsubscribe } from 'firebase/auth'
import { collection, query, where, onSnapshot, doc, setDoc, Timestamp } from 'firebase/firestore'
import { useUserStore } from './stores/user'
import { useLineAuthStore } from './stores/lineAuth'
import liff from '@line/liff'
import ConfirmDialog from './components/ConfirmDialog.vue'
import AppFooter from './components/AppFooter.vue'

const userStore = useUserStore()
const lineAuthStore = useLineAuthStore()
const router = useRouter()
const route = useRoute()

const isMenuOpen = ref(false)
const isAdminPage = computed(() => route.path.startsWith('/admin'))
const unreadCount = ref(0) // 👈 未読数

// ユーザー名取得
const fetchCustomerName = async (user: any) => {
  if (!user) { userStore.setCustomerName(''); return }
  try {
    const { getDoc, doc, getDocs } = await import('firebase/firestore')
    // まずUIDで直接取得を試す
    const docRef = doc(db, 'customers', user.uid)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      const data = docSnap.data()
      // 漢字名があればそれを優先、なければカナを使用（空文字も許可）
      const name = data.name_kanji || data.name_kana || ''
      userStore.setCustomerName(name)
      return
    }

    // なければ電話番号で名寄せ
    const phone = user.email?.split('@')[0]
    if (phone) {
      const q = query(collection(db, 'customers'), where('phone_number', '==', phone))
      const snapshot = await getDocs(q)
      if (!snapshot.empty) {
        const data = snapshot.docs[0]!.data()
        const name = data.name_kanji || data.name_kana || ''
        userStore.setCustomerName(name)
        return
      }
    }

    userStore.setCustomerName('')
  } catch (e) {
    console.error('顧客名取得エラー:', e)
    userStore.setCustomerName('')
  }
}

// 🔔 未読数の監視 (リアルタイム)
const subscribeUnread = (userId: string) => {
  const q = query(collection(db, 'messages'), where('customer_id', '==', userId), where('is_read', '==', false))
  return onSnapshot(q, (snap) => {
    unreadCount.value = snap.size
  })
}

let unsubscribeAuth: Unsubscribe | null = null
let unsubscribeMessages: (() => void) | null = null

onMounted(async () => {
  console.log('=== App.vue mounted ===')
  console.log('Line auth initializing...')
  try {
    await lineAuthStore.init()
    console.log('Line auth initialized:', {
      isLineApp: lineAuthStore.isLineApp,
      profile: lineAuthStore.profile?.displayName
    })
  } catch (error) {
    console.error('=== Line auth init error ===', error)
    // エラーレポート送信
    const { reportError } = await import('./lib/errorReporter')
    reportError(error, 'APP_LINE_AUTH_INIT')
  }

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    console.log('=== Auth state changed ===', user ? `User: ${user.uid}` : 'No user')
    if (user) {
      userStore.setUser(user)
      await fetchCustomerName(user)
      unsubscribeMessages = subscribeUnread(user.uid) // 監視開始
      console.log('User setup complete:', userStore.customerName)
      // 【一時ログ】LINEアプリ内ならLINE User IDをFirestoreに記録
      // if (lineAuthStore.isLineApp) {
      //   try {
      //     const profile = await liff.getProfile()
      //     await setDoc(doc(db, 'tmp_line_uid_log', profile.userId), {
      //       lineUserId: profile.userId,
      //       displayName: profile.displayName,
      //       firebaseUid: user.uid,
      //       logged_at: Timestamp.now()
      //     })
      //   } catch (e) { /* ignore */ }
      // }
    } else {
      userStore.setUser(null)
      userStore.setCustomerName('')
      if (unsubscribeMessages) unsubscribeMessages() // 監視解除
    }
  })
})

onUnmounted(() => {
  if (unsubscribeAuth) {
    unsubscribeAuth()
    console.log('[App] Auth listener unsubscribed')
  }
  if (unsubscribeMessages) {
    unsubscribeMessages()
  }
})

const toggleMenu = () => isMenuOpen.value = !isMenuOpen.value
const closeMenu = () => isMenuOpen.value = false

const handleLogout = async () => {
  try {
    // ログアウトフラグを設定（5秒間自動ログインをスキップ）
    localStorage.setItem('logout_flag', Date.now().toString())
    await signOut(auth)
    closeMenu()
    userStore.setCustomerName('')
    router.push('/')
  } catch (error) { console.error(error) }
}

const goToMessages = () => {
  closeMenu()
  router.push('/messages')
}

const retryInit = async () => {
  lineAuthStore.error = null
  await lineAuthStore.init()
}
</script>

<template>
  <!-- LINE初期化中のローディング画面 -->
  <div v-if="lineAuthStore.isInitializing" class="app-loading">
    <img src="/LINE_spinner_dark.svg" alt="読み込み中" class="loading-spinner" />
    <p class="loading-text">読み込み中...</p>
  </div>

  <!-- LINE初期化エラー画面 -->
  <div v-else-if="lineAuthStore.error" class="app-error">
    <div class="error-container">
      <div class="error-icon">⚠️</div>
      <h2 class="error-title">初期化エラー</h2>
      <p class="error-message">{{ lineAuthStore.error }}</p>
      <button @click="retryInit" class="retry-btn">再試行</button>
    </div>
  </div>

  <!-- メインコンテンツ -->
  <div v-else class="app-layout" :class="{ 'admin-mode': isAdminPage }">
    <ConfirmDialog />
    <header>
      <div :class="['header-inner', isAdminPage ? 'container-fluid' : 'container']">
        <h1>
          <RouterLink :to="isAdminPage ? '/admin' : '/'" class="logo-link" @click="closeMenu">💈 理美容予約システム</RouterLink>
        </h1>

        <div v-if="userStore.user && !isAdminPage" class="header-actions">
          <button class="bell-btn" @click="goToMessages">
            🔔
            <span v-if="unreadCount > 0" class="badge">{{ unreadCount }}</span>
          </button>
        </div>

        <button class="hamburger-btn" @click="toggleMenu" :class="{ active: isMenuOpen }">
          <span class="bar"></span><span class="bar"></span><span class="bar"></span>
        </button>

        <nav class="nav-menu" :class="{ open: isMenuOpen }">
          <div v-if="userStore.user && !isAdminPage" class="menu-group">
            <span class="user-welcome">ようこそ {{ userStore.customerName || 'ゲスト' }}様</span>
            <button class="nav-item bell-menu-item" @click="goToMessages">
              お知らせ <span v-if="unreadCount > 0" class="badge-inline">{{ unreadCount }}</span>
            </button>
            <RouterLink to="/mypage" class="nav-item mypage-btn" @click="closeMenu">マイページ</RouterLink>
            <button @click="handleLogout" class="logout-btn">ログアウト</button>
          </div>
          <RouterLink v-else-if="!isAdminPage" to="/login" class="nav-item login-btn" @click="closeMenu">ログイン / 登録
          </RouterLink>
        </nav>

        <div v-if="isMenuOpen" class="menu-overlay" @click="closeMenu"></div>
      </div>
    </header>

    <main :class="[isAdminPage ? 'container-fluid' : 'container']">
      <RouterView />
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
/* ローディング画面 */
.app-loading {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.loading-spinner {
  width: 80px;
  height: 80px;
  /* LINE公式SVGスピナーはアニメーション内蔵 */
}

.loading-text {
  margin-top: 1.5rem;
  font-size: 1.2rem;
  font-weight: bold;
  letter-spacing: 0.1em;
}

/* エラー画面 */
.app-error {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem;
}

.error-container {
  background: white;
  border-radius: 16px;
  padding: 3rem 2rem;
  max-width: 500px;
  width: 100%;
  text-align: center;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.error-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.error-title {
  color: #e74c3c;
  font-size: 1.5rem;
  margin-bottom: 1rem;
  font-weight: bold;
}

.error-message {
  color: #555;
  font-size: 1rem;
  line-height: 1.6;
  margin-bottom: 2rem;
  word-break: break-word;
}

.retry-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 0.8rem 2rem;
  font-size: 1rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
  transition: transform 0.2s, box-shadow 0.2s;
}

.retry-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.retry-btn:active {
  transform: translateY(0);
}

.error-text {
  margin-top: 1rem;
  padding: 1rem 2rem;
  background: rgba(231, 76, 60, 0.9);
  border-radius: 8px;
  font-size: 0.9rem;
  max-width: 90%;
  text-align: center;
}

/* LINEミニアプリ セーフエリア対応 */
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  /* ノーマルモード: 下に34px */
  padding-bottom: 34px;
  padding-bottom: env(safe-area-inset-bottom, 34px);
}

/* ランドスケープモード: 左右に44px、下に21px */
@media (orientation: landscape) {
  .app-layout {
    padding-left: 44px;
    padding-right: 44px;
    padding-bottom: 21px;
    padding-left: env(safe-area-inset-left, 44px);
    padding-right: env(safe-area-inset-right, 44px);
    padding-bottom: env(safe-area-inset-bottom, 21px);
  }
}

header {
  background-color: #333;
  color: white;
  height: 60px;
  position: sticky;
  top: 0;
  z-index: 100;
  width: 100%;
}

main {
  width: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.app-layout.admin-mode {
  height: 100vh;
  overflow: hidden;
}

.app-layout.admin-mode header {
  position: relative;
  flex-shrink: 0;
}

.app-layout.admin-mode main {
  overflow: auto;
  flex: 1;
  height: auto;
}

.app-layout.admin-mode footer {
  flex-shrink: 0;
}

.container {
  max-width: 1024px;
  margin: 0 auto;
  padding: 0;
  width: 100%;
}

.container-fluid {
  width: 100%;
  padding: 0;
  margin: 0;
  height: 100%;
}

.header-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  padding: 0 1rem;
  box-sizing: border-box;
}

.logo-link {
  color: white;
  text-decoration: none;
  font-weight: bold;
  font-size: 1.1rem;
  white-space: nowrap;
}

/* 👇 追加: ヘッダー内アクション */
.header-actions {
  margin-left: auto;
  margin-right: 1rem;
}

.bell-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  position: relative;
  padding: 0 0.5rem;
}

.badge {
  position: absolute;
  top: 0;
  right: 0;
  background: #e74c3c;
  color: white;
  font-size: 0.7rem;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: bold;
}

/* ナビメニュー */
.nav-menu {
  display: flex;
  align-items: center;
}

.menu-group {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.user-welcome {
  font-size: 0.9rem;
  margin-right: 1rem;
  font-weight: bold;
  white-space: nowrap;
  display: none;
  /* PCでは非表示にしてシンプルに */
}

@media (min-width: 769px) {
  .user-welcome {
    display: block;
  }

  .bell-menu-item {
    display: none;
  }
}

.mypage-btn {
  background-color: #42b883;
  color: white;
  text-decoration: none;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: bold;
  white-space: nowrap;
}

.logout-btn {
  background: transparent;
  border: 1px solid #fff;
  color: #fff;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  white-space: nowrap;
}

.login-btn {
  background: #42b883;
  color: white;
  text-decoration: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  white-space: nowrap;
}

.hamburger-btn {
  display: none;
}

/* スマホ対応 */
@media (max-width: 768px) {
  .hamburger-btn {
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    width: 30px;
    height: 25px;
    background: transparent;
    border: none;
    cursor: pointer;
    z-index: 152;
  }

  .bar {
    width: 100%;
    height: 3px;
    background-color: white;
    transition: all 0.3s;
  }

  .hamburger-btn.active .bar:nth-child(1) {
    transform: rotate(45deg) translate(5px, 6px);
  }

  .hamburger-btn.active .bar:nth-child(2) {
    opacity: 0;
  }

  .hamburger-btn.active .bar:nth-child(3) {
    transform: rotate(-45deg) translate(5px, -6px);
  }

  .nav-menu {
    position: fixed;
    top: 0;
    right: 0;
    width: 280px;
    height: 100vh;
    background-color: #222;
    padding: 80px 2rem 2rem 2rem;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
    z-index: 151;
    box-shadow: -4px 0 10px rgba(0, 0, 0, 0.3);
  }

  .nav-menu.open {
    transform: translateX(0);
  }

  .menu-group {
    flex-direction: column;
    width: 100%;
    align-items: stretch;
    gap: 1rem;
  }

  .user-welcome {
    display: block;
    color: #aaa;
    border-bottom: 1px solid #444;
    padding-bottom: 0.5rem;
    margin-right: 0;
    text-align: center;
  }

  .bell-menu-item {
    background: #444;
    color: white;
    border: none;
    padding: 1rem;
    text-align: left;
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
  }

  .badge-inline {
    background: #e74c3c;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 0.8rem;
  }

  .mypage-btn {
    display: block;
    text-align: center;
    padding: 1rem;
    background-color: #3498db;
  }

  .logout-btn {
    width: 100%;
    padding: 0.8rem;
    background-color: #444;
    border: none;
    margin-top: 1rem;
  }
}

.menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  z-index: 150;
}
</style>