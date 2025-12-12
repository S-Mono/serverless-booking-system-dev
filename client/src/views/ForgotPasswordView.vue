<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '../lib/firebase'
import { collection, addDoc, query, where, getDocs, Timestamp } from 'firebase/firestore'
import { useDialogStore } from '../stores/dialog'

const router = useRouter()
const dialog = useDialogStore()

const phoneNumber = ref('')
const nameKana = ref('')
const email = ref('')
const loading = ref(false)
const message = ref('')

// 電話番号フォーマット
const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/[^0-9]/g, '')
    if (numbers.length <= 3) return numbers
    else if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
    else if (numbers.length === 10) return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`
    else if (numbers.length >= 11) return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`
    return numbers
}

const handlePhoneInput = (event: Event) => {
    const input = event.target as HTMLInputElement
    phoneNumber.value = formatPhoneNumber(input.value)
}

const submitRequest = async () => {
    // バリデーション
    if (!phoneNumber.value || !nameKana.value || !email.value) {
        message.value = 'すべての項目を入力してください'
        return
    }

    // メールアドレスの簡易バリデーション
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
        message.value = '有効なメールアドレスを入力してください'
        return
    }

    loading.value = true
    message.value = ''

    try {
        // 顧客情報を検索
        const phoneDigits = phoneNumber.value.replace(/\D/g, '')
        const nameWithoutSpace = nameKana.value.replace(/\s/g, '')

        const customersQuery = query(
            collection(db, 'customers'),
            where('phone_number', 'in', [phoneNumber.value, phoneDigits])
        )
        const customersSnapshot = await getDocs(customersQuery)

        let matchedCustomer: any = null
        for (const doc of customersSnapshot.docs) {
            const data = doc.data()
            const customerNameKana = (data.name_kana || '').replace(/\s/g, '')
            if (customerNameKana === nameWithoutSpace) {
                matchedCustomer = { id: doc.id, ...data }
                break
            }
        }

        if (!matchedCustomer) {
            message.value = '入力された情報と一致する顧客が見つかりませんでした'
            loading.value = false
            return
        }

        // LINEログインユーザーはパスワードリセット不可
        if (matchedCustomer.provider === 'line') {
            message.value = 'LINEでログインしている場合はパスワードリセットできません'
            loading.value = false
            return
        }

        // パスワードリセットリクエストを作成
        const token = Math.random().toString(36).substring(2) + Date.now().toString(36)
        await addDoc(collection(db, 'password_reset_requests'), {
            customer_id: matchedCustomer.id,
            phone_number: matchedCustomer.phone_number,
            name_kana: matchedCustomer.name_kana,
            email: email.value,
            token: token,
            used: false,
            created_at: Timestamp.now(),
            expires_at: Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)) // 10分有効
        })

        console.log('✅ パスワードリセットリクエスト作成:', token)

        await dialog.alert(
            'パスワードリセット用のURLを記載したメールを送信しました。\nメールをご確認ください。',
            'リクエスト完了'
        )

        router.push('/login')
    } catch (error: any) {
        console.error('パスワードリセットリクエストエラー:', error)
        message.value = `エラーが発生しました: ${error.message}`
    } finally {
        loading.value = false
    }
}

const goBack = () => router.push('/login')
</script>

<template>
    <div class="forgot-password-container">
        <div class="forgot-password-card">
            <h2>パスワードを忘れた方</h2>
            <p class="description">
                電話番号、お名前（カナ）、メールアドレスを入力してください。<br>
                パスワード再設定用のURLをメールで送信します。
            </p>

            <div class="form-group">
                <label>電話番号</label>
                <input type="tel" v-model="phoneNumber" @input="handlePhoneInput" placeholder="例: 090-1234-5678"
                    :disabled="loading" />
            </div>

            <div class="form-group">
                <label>お名前（カナ）</label>
                <input type="text" v-model="nameKana" placeholder="例: ヤマダタロウ（スペースなし）" :disabled="loading" />
                <small>※スペースを入れずに入力してください</small>
            </div>

            <div class="form-group">
                <label>メールアドレス</label>
                <input type="email" v-model="email" placeholder="例: example@example.com" :disabled="loading" />
            </div>

            <p v-if="message" class="error-message">{{ message }}</p>

            <div class="button-group">
                <button @click="submitRequest" :disabled="loading" class="submit-btn">
                    {{ loading ? '送信中...' : 'リセットURLを送信' }}
                </button>
                <button @click="goBack" :disabled="loading" class="back-btn">
                    ログイン画面に戻る
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.forgot-password-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 20px;
}

.forgot-password-card {
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
    line-height: 1.6;
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

.form-group small {
    display: block;
    margin-top: 4px;
    font-size: 0.85rem;
    color: #999;
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

.back-btn:hover:not(:disabled) {
    background: #e0e0e0;
}

@media (max-width: 500px) {
    .forgot-password-card {
        padding: 30px 20px;
    }
}
</style>
