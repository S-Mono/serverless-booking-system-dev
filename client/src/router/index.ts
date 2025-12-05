import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import LoginView from '../views/LoginView.vue'
import MyPageView from '../views/MyPageView.vue'
import AdminView from '../views/AdminView.vue'
import AdminSettingsView from '../views/AdminSettingsView.vue'
import AdminMenuSettingsView from '../views/AdminMenuSettingsView.vue'
import AdminLoginView from '../views/AdminLoginView.vue'
import { auth } from '../lib/firebase'
import { getIdTokenResult } from 'firebase/auth'

// 管理キーはクライアント側に置かない（Firebase 管理者クレームで管理）

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { 
      path: '/',
      name: 'home',
      component: HomeView 
    },
    { 
      path: '/login',
      name: 'login',
      component: LoginView },
    { 
      path: '/mypage', 
      name: 'mypage',
      component: MyPageView },
    {
      path: '/messages',
      name: 'messages',
      component: () => import('../views/MessagesView.vue')
    },
    
    // 管理画面ルート群
    {
      path: '/admin-login',
      name: 'admin-login',
      component: AdminLoginView
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
      meta: { requiresAdmin: true }
    },
    {
      path: '/admin/settings',
      name: 'admin-settings',
      component: AdminSettingsView,
      meta: { requiresAdmin: true }
    },
    {
      path: '/admin/settings/menus',
      name: 'admin-menu-settings',
      component: AdminMenuSettingsView,
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
    }
  ]
})

// 🔒 ナビゲーションガード (門番)
router.beforeEach(async (to, from, next) => {
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