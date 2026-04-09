import { createRouter, createWebHistory } from 'vue-router'
import { auth } from '../lib/firebase'
import { getIdTokenResult, signOut } from 'firebase/auth'

// 管理キーはクライアント側に置かない（Firebase 管理者クレームで管理）

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { 
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue')
    },
    { 
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue') },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('../views/ForgotPasswordView.vue')
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('../views/ResetPasswordView.vue')
    },
    { 
      path: '/mypage', 
      name: 'mypage',
      component: () => import('../views/MyPageView.vue'),
      meta: { requiresAuth: true } // 🟢 認証必須
    },
    {
      path: '/messages',
      name: 'messages',
      component: () => import('../views/MessagesView.vue'),
      meta: { requiresAuth: true } // 🟢 認証必須
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: () => import('../views/PrivacyPolicyView.vue')
    },
    {
      path: '/terms',
      name: 'terms',
      component: () => import('../views/TermsOfServiceView.vue')
    },
    {
      path: '/support',
      name: 'support',
      component: () => import('../views/CustomerSupportView.vue'),
      meta: { requiresAuth: true } // 🟢 認証必須
    },
    
    // 管理画面ルート群
    {
      path: '/admin-login',
      name: 'admin-login',
      component: () => import('../views/AdminLoginView.vue')
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('../views/AdminView.vue'),
      meta: { requiresAdmin: true }
    },
    {
      path: '/admin/settings',
      name: 'admin-settings',
      component: () => import('../views/AdminSettingsView.vue'),
      meta: { requiresAdmin: true }
    },
    {
      path: '/admin/settings/menus',
      name: 'admin-menu-settings',
      component: () => import('../views/AdminMenuSettingsView.vue'),
      meta: { requiresAdmin: true }
    },
    {
      path: '/admin/customers',
      name: 'admin-customers',
      component: () => import('../views/AdminCustomerView.vue'),
      meta: { requiresAdmin: true }
    },
    // 👇 追加: 顧客の論理削除一覧
    {
      path: '/admin/customers/trash',
      name: 'admin-customers-trash',
      component: () => import('../views/AdminDeletedCustomersView.vue'),
      meta: { requiresAdmin: true }
    },
    // 👇 追加: 売上分析画面
    {
      path: '/admin/sales',
      name: 'admin-sales',
      component: () => import('../views/AdminSalesView.vue'),
      meta: { requiresAdmin: true }
    },
    // 👇 追加: 顧客カルテ一覧
    {
      path: '/admin/customers/:customerId/records',
      name: 'admin-customer-records',
      component: () => import('../views/AdminCustomerRecordsView.vue'),
      meta: { requiresAdmin: true }
    },
    // 👇 追加: カルテ新規作成
    {
      path: '/admin/customers/:customerId/records/new',
      name: 'admin-record-create',
      component: () => import('../views/AdminRecordEditorView.vue'),
      meta: { requiresAdmin: true }
    },
    // 👇 追加: カルテ編集
    {
      path: '/admin/customers/:customerId/records/:recordId/edit',
      name: 'admin-record-edit',
      component: () => import('../views/AdminRecordEditorView.vue'),
      meta: { requiresAdmin: true }
    }
  ]
})

// 🔒 ナビゲーションガード (門番)
router.beforeEach(async (to, from, next) => {
  // 🟢 ログイン画面に遷移する場合、現在ログイン中なら自動ログアウト
  if (to.path === '/login' && auth.currentUser) {
    try {
      // 再ログイン抑止フラグを設定（5秒間）
      localStorage.setItem('logout_flag', Date.now().toString())
      await signOut(auth)
      console.log('[Router] Auto logout on login page navigation')
    } catch (error) {
      console.error('[Router] Auto logout failed:', error)
    }
  }

  // 🟢 顧客用ページの認証チェック
  if (to.meta.requiresAuth) {
    // Firebaseの初期化完了を待つ
    await new Promise<void>(resolve => {
      const unsubscribe = auth.onAuthStateChanged(() => {
        unsubscribe()
        resolve()
      })
    })

    const user = auth.currentUser
    // 未ログインならログイン画面へ
    if (!user) {
      console.log('[Router] Redirect to login (auth required)')
      return next('/login')
    }
  }

  // requiresAdmin がついているページは Firebase の管理者クレームを確認する
  if (to.meta.requiresAdmin) {
    // Firebase の初期化完了を待ち、現在のユーザーを取得
    await new Promise<void>(resolve => {
      const unsubscribe = auth.onAuthStateChanged(() => {
        unsubscribe()
        resolve()
      })
    })

    const user = auth.currentUser
    // 未ログインなら管理者ログイン画面へ
    if (!user) {
      return next('/admin-login')
    }

    // トークンのカスタムクレームに admin フラグがあるかを確認
    try {
      const idTokenResult = await getIdTokenResult(user)
      if (!idTokenResult.claims || !idTokenResult.claims.admin) {
        // 管理者権限がないならアクセス拒否
        console.warn('管理者権限がありません')
        return next('/admin-login')
      }
    } catch (err) {
      console.error('管理権限確認エラー', err)
      return next('/admin-login')
    }
  }

  next()
})

export default router