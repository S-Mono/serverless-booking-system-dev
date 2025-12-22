<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { auth, db } from '../lib/firebase'
import { signInWithEmailAndPassword, updatePassword } from 'firebase/auth'
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore'
import { useDialogStore } from '../stores/dialog'

const router = useRouter()
const route = useRoute()
const dialog = useDialogStore()

const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const verifying = ref(true)
const message = ref('')
const validToken = ref(false)
const customerId = ref('')
const customerPhone = ref('')

const PSEUDO_DOMAIN = '@local.booking-system'

onMounted(async () => {
    const token = route.query.token as string
    if (!token) {
        message.value = '無効なURLです'
        verifying.value = false
        return
    }

    try {
        // トークンを検証
        const resetQuery = query(
            collection(db, 'password_reset_requests'),
            where('token', '==', token),
            where('used', '==', false)
        )
        const resetSnapshot = await getDocs(resetQuery)

        if (resetSnapshot.empty || !resetSnapshot.docs[0]) {
            message.value = 'このリンクは無効または既に使用されています'
            verifying.value = false
            return
        }

        const resetData = resetSnapshot.docs[0].data()
        const expiresAt = resetData.expires_at?.toDate()

        if (!expiresAt) {
            message.value = 'リクエストデータが不正です'
            verifying.value = false
            return
        }

        if (expiresAt < new Date()) {
            message.value = 'このリンクの有効期限が切れています'
            verifying.value = false
            return
        }

        customerId.value = resetData.customer_id
        customerPhone.value = resetData.phone_number
        validToken.value = true
        console.log('✅ トークン検証成功:', customerId.value)
    } catch (error: any) {
        console.error('トークン検証エラー:', error)
        message.value = `エラーが発生しました: ${error.message}`
    } finally {
        verifying.value = false
    }
})

const submitReset = async () => {
    // バリデーション
    if (!newPassword.value || !confirmPassword.value) {
        message.value = 'すべての項目を入力してください'
        return
    }

    if (newPassword.value.length < 6) {
        message.value = 'パスワードは6文字以上で入力してください'
        return
    }

    if (newPassword.value !== confirmPassword.value) {
        message.value = 'パスワードが一致しません'
        return
    }

    loading.value = true
    message.value = ''

    try {
        const phoneDigits = customerPhone.value.replace(/\D/g, '')
        const firebaseEmail = `${phoneDigits}${PSEUDO_DOMAIN}`

        // 一時的にログインして パスワードを変更
        let tempUser
        try {
            // 既存のパスワードでログインを試みる（パスワードが設定されている場合）
            const userCred = await signInWithEmailAndPassword(auth, firebaseEmail, 'temp_password')
            tempUser = userCred.user
        } catch (error: any) {
            // ユーザーが存在しない場合は、顧客データから再構築が必要
            // この場合、Cloud Functionsで処理するのが望ましい
            console.error('ユーザー認証エラー:', error)
            message.value = 'パスワードリセットに失敗しました。管理者にお問い合わせください。'
            loading.value = false
            return
        }

        // パスワードを更新
        await updatePassword(tempUser, newPassword.value)

        // トークンを使用済みにする
        const token = route.query.token as string
        const resetQuery = query(
            collection(db, 'password_reset_requests'),
            where('token', '==', token)
        )
        const resetSnapshot = await getDocs(resetQuery)

        if (!resetSnapshot.empty && resetSnapshot.docs[0]) {
            await updateDoc(resetSnapshot.docs[0].ref, {
                used: true
            })
        }

        console.log('✅ パスワード更新成功')

        await dialog.alert(
            'パスワードを更新しました。\n新しいパスワードでログインしてください。',
            '更新完了'
        )

        router.push('/login')
    } catch (error: any) {
        console.error('パスワード更新エラー:', error)
        message.value = `エラーが発生しました: ${error.message}`
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <div class="reset-password-container">
        <div class="reset-password-card">
            <h2>パスワードの再設定</h2>

            <div v-if="verifying" class="verifying">
                <p>リンクを確認しています...</p>
            </div>

            <div v-else-if="!validToken" class="error-state">
                <p class="error-message">{{ message }}</p>
                <button @click="router.push('/login')" class="back-btn">
                    ログイン画面に戻る
                </button>
            </div>

            <div v-else>
                <p class="description">新しいパスワードを入力してください。</p>

                <div class="form-group">
                    <label>新しいパスワード</label>
                    <input type="password" v-model="newPassword" placeholder="6文字以上" :disabled="loading" />
                </div>

                <div class="form-group">
                    <label>パスワード（確認）</label>
                    <input type="password" v-model="confirmPassword" placeholder="もう一度入力" :disabled="loading" />
                </div>

                <p v-if="message" class="error-message">{{ message }}</p>

                <div class="button-group">
                    <button @click="submitReset" :disabled="loading" class="submit-btn">
                        {{ loading ? '更新中...' : 'パスワードを更新' }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.reset-password-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 20px;
}

.reset-password-card {
    background: white;
    padding: 40px;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    max-width: 450px;
    width: 100%;
}

h2 {
    text-align: center;
    margin-bottom: 10px;
    color: #333;
}

.description {
    text-align: center;
    font-size: 0.9rem;
    color: #666;
    margin-bottom: 30px;
}

.verifying {
    text-align: center;
    padding: 40px 0;
    color: #666;
}

.error-state {
    text-align: center;
    padding: 20px 0;
}

.form-group {
    margin-bottom: 20px;
}

.form-group label {
    display: block;
    font-weight: 600;
    margin-bottom: 8px;
    color: #333;
}

.form-group input {
    width: 100%;
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 1rem;
    transition: border-color 0.3s;
}

.form-group input:focus {
    outline: none;
    border-color: #667eea;
}

.error-message {
    color: #e74c3c;
    font-size: 0.9rem;
    margin-bottom: 15px;
    text-align: center;
}

.button-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.submit-btn,
.back-btn {
    width: 100%;
    padding: 14px;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
}

.submit-btn {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
}

.submit-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.back-btn {
    background: #f5f5f5;
    color: #666;
}

.back-btn:hover {
    background: #e0e0e0;
}

@media (max-width: 500px) {
    .reset-password-card {
        padding: 30px 20px;
    }
}
</style>
