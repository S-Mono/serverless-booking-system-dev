<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { auth } from '../lib/firebase'
import { signInWithEmailAndPassword } from 'firebase/auth'

const email = ref('')
const password = ref('')
const router = useRouter()
const route = useRoute()
const errorMsg = ref('')
const loading = ref(false)

const handleLogin = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    await signInWithEmailAndPassword(auth, email.value, password.value)
    // ログイン成功後、IDトークンのカスタムクレームに admin があるか確認して遷移
    const { getIdTokenResult } = await import('firebase/auth')
    const idTokenResult = await getIdTokenResult(auth.currentUser!)
    if (idTokenResult.claims && idTokenResult.claims.admin) {
      router.push('/admin')
    } else {
      errorMsg.value = 'このアカウントには管理者権限がありません'
    }
  } catch (e: any) {
    console.error(e)
    errorMsg.value = 'ログインに失敗しました。'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <h2>管理者ログイン</h2>
      <p class="subtitle">Restricted Area</p>

      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label>ID (Email)</label>
          <input type="email" v-model="email" required placeholder="admin@barber.com">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" v-model="password" required>
        </div>
        <button type="submit" :disabled="loading">
          {{ loading ? 'ログイン中...' : 'ログイン' }}
        </button>
      </form>

      <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #2c3e50;
}

.login-card {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  width: 90%;
  max-width: 350px;
  text-align: center;
}

h2 {
  margin: 0 0 0.5rem 0;
  color: #333;
}

.subtitle {
  color: #7f8c8d;
  margin-bottom: 2rem;
  font-size: 0.9rem;
  letter-spacing: 1px;
}

.form-group {
  margin-bottom: 1rem;
  text-align: left;
}

label {
  display: block;
  margin-bottom: 0.3rem;
  font-weight: bold;
  font-size: 0.9rem;
}

input {
  width: 100%;
  padding: 0.7rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
}

button {
  width: 100%;
  padding: 0.8rem;
  background: #e74c3c;
  color: white;
  border: none;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
  margin-top: 1rem;
}

button:hover {
  background: #c0392b;
}

button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.error {
  color: #e74c3c;
  margin-top: 1rem;
  font-size: 0.9rem;
}
</style>