import { ref } from 'vue'
import { defineStore } from 'pinia'
// 👇 ここを変更 (Supabase -> Firebase)
import type { User } from 'firebase/auth'

export const useUserStore = defineStore('user', () =>
{
  const user = ref<User | null>(null)
  // 管理者フラグ（Token の custom claim から判定）
  const isAdmin = ref(false)

  const refreshAdminStatus = async () => {
    if (!user.value) { isAdmin.value = false; return }
    try {
      const { getIdTokenResult } = await import('firebase/auth')
      const tokenResult = await getIdTokenResult(user.value)
      isAdmin.value = Boolean(tokenResult.claims?.admin)
    } catch (e) {
      console.error('admin claim fetch failed', e)
      isAdmin.value = false
    }
  }

  const setUser = (newUser: User | null) =>
  {
    user.value = newUser
    // ユーザー変更時に管理者フラグを更新
    void refreshAdminStatus()
  }

  return { user, setUser, isAdmin, refreshAdminStatus }
})