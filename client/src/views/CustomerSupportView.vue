<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { db, auth } from '../lib/firebase'
import { collection, doc, setDoc, Timestamp, getDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { useDialogStore } from '../stores/dialog'

const dialog = useDialogStore()

const currentUser = ref<any>(null)
const contactMessage = ref('')
const isSendingContact = ref(false)
const phoneNumber = ref('') // お客様の電話番号

// お問い合わせ送信
const sendContactForm = async () => {
    if (!currentUser.value) {
        dialog.alert('ログインが必要です。', 'エラー')
        return
    }

    if (!contactMessage.value || contactMessage.value.trim() === '') {
        dialog.alert('お問い合わせ内容を入力してください。', '入力エラー')
        return
    }

    isSendingContact.value = true
    try {
        // お客様情報を取得
        const customerDocRef = doc(db, 'customers', currentUser.value.uid)
        const customerSnap = await getDoc(customerDocRef)
        const customerData = customerSnap.exists() ? customerSnap.data() : {}

        // お問い合わせ内容をFirestoreに保存
        const contactRef = doc(collection(db, 'contacts'))
        await setDoc(contactRef, {
            customer_id: currentUser.value.uid,
            customer_name: customerData.name_kanji || customerData.name_kana || 'ゲスト',
            customer_email: currentUser.value.email || '',
            customer_phone: customerData.phone_number || phoneNumber.value || '',
            message: contactMessage.value,
            created_at: Timestamp.now(),
            status: 'pending'
        })

        // メッセージコレクションにも通知を追加（お客様が確認できるように）
        const messageRef = doc(collection(db, 'messages'))
        await setDoc(messageRef, {
            customer_id: currentUser.value.uid,
            title: 'お問い合わせを受け付けました',
            body: `お問い合わせ内容:\n${contactMessage.value}\n\n折り返しご連絡いたしますので、しばらくお待ちください。`,
            is_read: false,
            created_at: Timestamp.now()
        })

        dialog.alert('お問い合わせを送信しました。\n折り返しご連絡いたしますので、しばらくお待ちください。', '送信完了')
        contactMessage.value = ''
    } catch (error: any) {
        console.error('お問い合わせ送信エラー:', error)
        const errorMessage = error?.message || '不明なエラー'
        const errorCode = error?.code || ''
        dialog.alert(`送信に失敗しました。\nエラー: ${errorCode}\n${errorMessage}\n\n時間をおいて再度お試しください。`, 'エラー')
    } finally {
        isSendingContact.value = false
    }
}

onMounted(() => {
    onAuthStateChanged(auth, async (user) => {
        currentUser.value = user
        if (user) {
            // お客様情報を取得して電話番号を設定
            const customerDocRef = doc(db, 'customers', user.uid)
            const customerSnap = await getDoc(customerDocRef)
            if (customerSnap.exists()) {
                const customerData = customerSnap.data()
                phoneNumber.value = customerData.phone_number || ''
            }
        }
    })
})
</script>

<template>
    <div class="support-container">
        <div class="scroll-content">
            <div class="page-header">
                <router-link to="/" class="back-btn">◀ 予約画面に戻る</router-link>
                <h2 class="page-title">カスタマーサポート</h2>
            </div>

            <div class="content-wrapper">
                <div class="card contact-card">
                    <h3>お問い合わせ</h3>

                    <div class="contact-form">
                        <div class="phone-info">
                            <p class="phone-label">店舗直通電話</p>
                            <a href="tel:011-694-5449" class="phone-number">📞 011-694-5449</a>
                            <p class="phone-hint">営業時間内にお電話いただくとすぐに対応できます</p>
                            <div class="email-section">
                                <p class="email-label">メールでのお問い合わせ</p>
                                <a href="mailto:monou1222@icloud.com" class="email-address">📧 monou1222@icloud.com</a>
                            </div>
                        </div>

                        <div class="divider-or">
                            <span>または</span>
                        </div>

                        <div class="form-group">
                            <label>お問い合わせ内容<span class="required">*</span></label>
                            <textarea v-model="contactMessage" placeholder="ご質問やご要望をご記入ください" rows="8"
                                :disabled="isSendingContact"></textarea>
                            <p class="hint">※ 内容を確認後、メールまたはお電話にてご連絡いたします。</p>
                        </div>

                        <button @click="sendContactForm" :disabled="isSendingContact || !currentUser" class="send-btn">
                            {{ isSendingContact ? '送信中...' : '送信する' }}
                        </button>

                        <p v-if="!currentUser" class="login-notice">
                            ※ お問い合わせを送信するには<router-link to="/login" class="login-link">ログイン</router-link>が必要です。
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.support-container {
    max-width: 800px;
    margin: 0 auto;
    height: calc(100vh - 60px - 80px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
}

.scroll-content {
    flex: 1;
    overflow-y: auto;
    padding: 2rem 1rem;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}

.scroll-content::-webkit-scrollbar {
    width: 6px;
}

.scroll-content::-webkit-scrollbar-track {
    background: transparent;
}

.scroll-content::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}

.page-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
    border-bottom: 2px solid #eee;
    padding-bottom: 0.5rem;
}

.page-title {
    font-size: 1.5rem;
    color: #333;
    margin: 0;
    border-bottom: none;
}

.back-btn {
    background: transparent;
    border: 1px solid #ccc;
    color: #555;
    padding: 0.4rem 1rem;
    border-radius: 20px;
    cursor: pointer;
    font-size: 0.9rem;
    text-decoration: none;
    display: inline-block;
}

.back-btn:hover {
    background: #f0f0f0;
    color: #333;
}

.content-wrapper {
    max-width: 600px;
    margin: 0 auto;
}

.card {
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 2rem;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}

.card h3 {
    margin-top: 0;
    margin-bottom: 1.5rem;
    font-size: 1.3rem;
    color: #2c3e50;
    border-bottom: 1px solid #eee;
    padding-bottom: 0.5rem;
}

.contact-form {
    padding: 0.5rem 0;
}

.phone-info {
    background: #f0f8ff;
    border: 2px solid #42b883;
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
    margin-bottom: 1.5rem;
}

.phone-label {
    font-size: 0.9rem;
    color: #666;
    margin: 0 0 0.5rem 0;
}

.phone-number {
    display: inline-block;
    font-size: 1.4rem;
    font-weight: bold;
    color: #42b883;
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    transition: background 0.2s;
}

.phone-number:hover {
    background: rgba(66, 184, 131, 0.1);
}

.phone-hint {
    font-size: 0.8rem;
    color: #999;
    margin: 0.5rem 0 0 0;
}

.email-section {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #d0e8ff;
}

.email-label {
    font-size: 0.9rem;
    color: #666;
    margin: 0 0 0.5rem 0;
}

.email-address {
    display: inline-block;
    font-size: 1.4rem;
    font-weight: bold;
    color: #3498db;
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    transition: background 0.2s;
}

.email-address:hover {
    background: rgba(52, 152, 219, 0.1);
}

.divider-or {
    text-align: center;
    margin: 1.5rem 0;
    position: relative;
}

.divider-or::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 1px;
    background: #ddd;
    z-index: 0;
}

.divider-or span {
    background: white;
    padding: 0 1rem;
    color: #999;
    font-size: 0.9rem;
    position: relative;
    z-index: 1;
}

.form-group {
    margin-bottom: 1.5rem;
}

.form-group label {
    display: block;
    font-weight: bold;
    margin-bottom: 0.5rem;
    font-size: 0.95rem;
}

.form-group label .required {
    color: #e74c3c;
    margin-left: 0.3rem;
    font-weight: bold;
}

textarea {
    width: 100%;
    padding: 0.8rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
    font-family: inherit;
    resize: vertical;
    box-sizing: border-box;
}

textarea:focus {
    outline: none;
    border-color: #42b883;
}

textarea:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
}

.hint {
    font-size: 0.85rem;
    color: #666;
    margin: 0.5rem 0 0 0;
}

.send-btn {
    width: 100%;
    background: #2c3e50;
    color: white;
    border: none;
    padding: 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    font-size: 1rem;
    transition: background 0.2s;
}

.send-btn:hover {
    background: #34495e;
}

.send-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
}

.login-notice {
    margin-top: 1rem;
    padding: 0.8rem;
    background: #fff9e6;
    border: 1px solid #ffeb99;
    border-radius: 4px;
    font-size: 0.9rem;
    color: #666;
    text-align: center;
}

.login-link {
    color: #3498db;
    font-weight: bold;
    text-decoration: none;
}

.login-link:hover {
    text-decoration: underline;
}

@media (max-width: 768px) {
    .support-container {
        height: calc(100vh - 60px - 60px);
    }

    .scroll-content {
        padding: 1rem;
    }

    .card {
        padding: 1.5rem;
    }

    .phone-number {
        font-size: 1.2rem;
    }

    .email-address {
        font-size: 1rem;
    }
}
</style>
