<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { db, auth } from '../lib/firebase'
import { collection, query, where, getDocs, deleteDoc, doc, setDoc, Timestamp, orderBy, getDoc, updateDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { useDialogStore } from '../stores/dialog'
import { useUserStore } from '../stores/user'

const dialog = useDialogStore()
const userStore = useUserStore()

interface Reservation {
  id: string
  start_at: Timestamp
  menu_items: { title: string; price: number }[]
  status: string
}

const reservations = ref<Reservation[]>([])
const loading = ref(true)
const currentUser = ref<any>(null)
const nameKanji = ref('') // 姓名（漢字）
const nameKana = ref('') // 読み仮名（カナ）
const phoneNumber = ref('') // 電話番号
const preferredCategory = ref('barber')
const isSavingProfile = ref(false)
const isProfileOpen = ref(false) // お客様情報の開閉状態

// お問い合わせフォーム
const isContactFormOpen = ref(false)
const contactMessage = ref('')
const isSendingContact = ref(false)

const fetchReservations = async (userId: string) => {
  loading.value = true
  try {
    const q = query(collection(db, 'reservations'), where('customer_id', '==', userId))
    const querySnapshot = await getDocs(q)
    const results = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Reservation[]
    reservations.value = results.sort((a, b) => a.start_at.seconds - b.start_at.seconds)

    // プロフィール取得 (UID優先)
    const docRef = doc(db, 'customers', userId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      const data = docSnap.data()
      nameKanji.value = data.name_kanji || ''
      nameKana.value = data.name_kana || ''
      phoneNumber.value = data.phone_number || ''
      preferredCategory.value = data.preferred_category || 'barber'
      // 未入力なら開く、入力済みなら閉じる
      isProfileOpen.value = !nameKana.value || !phoneNumber.value
    } else {
      // なければ電話番号で名寄せトライ
      const phone = currentUser.value.email?.split('@')[0]
      if (phone) {
        const custQ = query(collection(db, 'customers'), where('phone_number', '==', phone))
        const custSnap = await getDocs(custQ)
        if (!custSnap.empty) {
          const data = custSnap.docs[0]!.data()
          nameKanji.value = data.name_kanji || ''
          nameKana.value = data.name_kana || ''
          phoneNumber.value = data.phone_number || ''
          preferredCategory.value = data.preferred_category || 'barber'
          // 未入力なら開く、入力済みなら閉じる
          isProfileOpen.value = !nameKana.value || !phoneNumber.value
        }
      }
    }
  } catch (error) {
    console.error('Error fetching reservations:', error)
  } finally {
    loading.value = false
  }
}

const saveProfile = async () => {
  if (!currentUser.value) return

  // バリデーション: カナと電話番号が必須
  if (!nameKana.value || nameKana.value.trim() === '') {
    dialog.alert('お名前（カナ）を入力してください。', '入力エラー')
    return
  }
  if (!phoneNumber.value || phoneNumber.value.trim() === '') {
    dialog.alert('電話番号を入力してください。', '入力エラー')
    return
  }

  // 文字種バリデーション
  // 漢字名: 漢字、ひらがな、スペースのみ
  if (nameKanji.value && nameKanji.value.trim() !== '') {
    const kanjiPattern = /^[ぁ-ん一-龠々\s　]+$/
    if (!kanjiPattern.test(nameKanji.value)) {
      dialog.alert('お名前（漢字）は漢字とひらがなで入力してください。', '入力エラー')
      return
    }
  }

  // カナ: 全角カタカナとスペースのみ
  const kanaPattern = /^[ァ-ヶー\s　]+$/
  if (!kanaPattern.test(nameKana.value)) {
    dialog.alert('お名前（カナ）は全角カタカナで入力してください。', '入力エラー')
    return
  }

  // 電話番号: 数字とハイフンのみ
  const phonePattern = /^[0-9\-]+$/
  if (!phonePattern.test(phoneNumber.value)) {
    dialog.alert('電話番号は数字とハイフン(-)で入力してください。', '入力エラー')
    return
  }

  isSavingProfile.value = true
  try {
    await setDoc(doc(db, 'customers', currentUser.value.uid), {
      name_kanji: nameKanji.value,
      name_kana: nameKana.value,
      phone_number: phoneNumber.value,
      preferred_category: preferredCategory.value,
      is_existing_customer: true,
      updated_at: Timestamp.now()
    }, { merge: true })

    // 🔴 ヘッダーの名前を即座に更新（漢字優先、なければカナ）
    userStore.setCustomerName(nameKanji.value || nameKana.value)

    dialog.alert('プロフィールを保存しました')
  } catch (error) { console.error(error); dialog.alert('保存失敗', 'エラー') } finally { isSavingProfile.value = false }
}

const cancelReservation = async (id: string) => {
  const ok = await dialog.confirm('キャンセルしますか？')
  if (!ok) return
  try {
    // 1. 予約自体の削除 (既存処理)
    await deleteDoc(doc(db, 'reservations', id))

    // 🟢 2. 【追加】関連するメッセージを「キャンセル扱い」に更新
    const msgQ = query(collection(db, 'messages'), where('reservation_id', '==', id))
    const msgSnap = await getDocs(msgQ)

    // 関連するメッセージがあれば全て更新
    msgSnap.forEach(async (d) => {
      await updateDoc(d.ref, {
        is_cancelled: true, // キャンセル済みフラグ
        title: '【キャンセル済】' + d.data().title // タイトルもわかりやすく変更
      })
    })

    dialog.alert('予約をキャンセルしました')
    reservations.value = reservations.value.filter(res => res.id !== id)
  } catch (error) { console.error(error); dialog.alert('キャンセル失敗', 'エラー') }
}

// 戻る
const goBack = () => {
  // ルーターを使ってもいいが、import省略のためhistory.back()でも可
  // 今回はrouterを使う
  import('vue-router').then(({ useRouter }) => {
    useRouter().push('/')
  })
}

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
    isContactFormOpen.value = false
  } catch (error) {
    console.error('お問い合わせ送信エラー:', error)
    dialog.alert('送信に失敗しました。時間をおいて再度お試しください。', 'エラー')
  } finally {
    isSendingContact.value = false
  }
}

onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    currentUser.value = user
    if (user) fetchReservations(user.uid)
    else loading.value = false
  })
})

const formatDate = (ts: Timestamp) => {
  const d = ts.toDate()
  return d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
}
</script>

<template>
  <div class="mypage-container">
    <div class="scroll-content">
      <div class="page-header">
        <router-link to="/" class="back-btn">◀ 予約画面に戻る</router-link>
        <h2 class="page-title">マイページ</h2>
      </div>

      <div class="content-grid">
        <aside class="profile-column">
          <div class="card profile-card">
            <div class="profile-header">
              <h3>お客様情報</h3>
              <button @click="isProfileOpen = !isProfileOpen" class="toggle-btn">
                {{ isProfileOpen ? '▲ 閉じる' : '▼ 開く' }}
              </button>
            </div>

            <div v-show="isProfileOpen" class="profile-form">
              <div class="form-group">
                <label>お名前（漢字）</label>
                <div class="input-row">
                  <input type="text" v-model="nameKanji" placeholder="例: 山田 太郎" />
                </div>
              </div>

              <div class="form-group">
                <label>お名前（カナ）<span class="required">*</span></label>
                <div class="input-row">
                  <input type="text" v-model="nameKana" placeholder="例: ヤマダ タロウ" />
                </div>
              </div>

              <div class="form-group">
                <label>電話番号<span class="required">*</span></label>
                <div class="input-row">
                  <input type="tel" v-model="phoneNumber" placeholder="例: 090-1234-5678" />
                </div>
                <p class="hint">※ 予約時に必要となります。</p>
              </div>

              <div class="form-group">
                <label>よく利用するメニュー</label>
                <div class="radio-group">
                  <label class="radio-item">
                    <input type="radio" value="barber" v-model="preferredCategory"> 💈 理容
                  </label>
                  <label class="radio-item">
                    <input type="radio" value="beauty" v-model="preferredCategory"> 💇‍♀️ 美容
                  </label>
                  <label class="radio-item">
                    <input type="radio" value="chiro" v-model="preferredCategory"> 💆‍♂️ カイロ
                  </label>
                </div>
                <p class="hint">※ 予約画面の初期表示に反映されます。</p>
              </div>

              <button @click="saveProfile" :disabled="isSavingProfile" class="save-btn">
                {{ isSavingProfile ? '保存中...' : '保存する' }}
              </button>
            </div>
          </div>

          <!-- お問い合わせフォーム -->
          <div class="card contact-card">
            <div class="profile-header">
              <h3>お問い合わせ</h3>
              <button @click="isContactFormOpen = !isContactFormOpen" class="toggle-btn">
                {{ isContactFormOpen ? '▲ 閉じる' : '▼ 開く' }}
              </button>
            </div>

            <div v-show="isContactFormOpen" class="contact-form">
              <div class="phone-info">
                <p class="phone-label">店舗直通電話</p>
                <a href="tel:011-694-5449" class="phone-number">📞 011-694-5449</a>
                <p class="phone-hint">営業時間内にお電話いただくとすぐに対応できます</p>
              </div>

              <div class="divider-or">
                <span>または</span>
              </div>

              <div class="form-group">
                <label>お問い合わせ内容<span class="required">*</span></label>
                <textarea v-model="contactMessage" placeholder="ご質問やご要望をご記入ください" rows="6"
                  :disabled="isSendingContact"></textarea>
                <p class="hint">※ 内容を確認後、メールまたはお電話にてご連絡いたします。</p>
              </div>

              <button @click="sendContactForm" :disabled="isSendingContact" class="save-btn">
                {{ isSendingContact ? '送信中...' : '送信する' }}
              </button>
            </div>
          </div>
        </aside>

        <main class="reservation-column">
          <div class="card reservation-container">
            <h3>予約状況</h3>
            <p v-if="loading" class="loading">読み込み中...</p>
            <div v-else>
              <div v-if="reservations.length === 0" class="no-data">
                <p>現在、予約はありません。</p>
                <router-link to="/" class="book-link">予約を入れる</router-link>
              </div>
              <ul v-else class="reservation-list">
                <li v-for="res in reservations" :key="res.id" class="reservation-item">
                  <div class="res-header">
                    <span class="date">{{ formatDate(res.start_at) }}</span>
                    <span v-if="res.status === 'confirmed'" class="status-badge confirmed">予約確定</span>
                    <span v-else-if="res.status === 'pending'" class="status-badge pending">お店の確認待ち</span>
                  </div>
                  <div class="res-body">
                    <div v-for="(item, index) in res.menu_items" :key="index" class="menu-item">
                      <span class="menu-title">{{ item.title }}</span>
                      <span v-if="item.price" class="menu-price">¥{{ item.price.toLocaleString() }}</span>
                    </div>
                  </div>
                  <div class="res-footer">
                    <button class="cancel-btn" @click="cancelReservation(res.id)">キャンセル</button>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mypage-container {
  max-width: 1024px;
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

.profile-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.profile-header h3 {
  margin: 0;
}

.toggle-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 0.2s;
}

.toggle-btn:hover {
  background: #2980b9;
}

.profile-form {
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    max-height: 0;
  }

  to {
    opacity: 1;
    max-height: 1000px;
  }
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

.content-grid {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 2rem;
  align-items: start;
}

.card {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}

.card h3 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  font-size: 1.1rem;
  color: #2c3e50;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  font-weight: bold;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.form-group label .required {
  color: #e74c3c;
  margin-left: 0.3rem;
  font-weight: bold;
}

.input-row input {
  width: 100%;
  padding: 0.7rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
  box-sizing: border-box;
}

.radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  min-width: 100px;
}

.hint {
  font-size: 0.8rem;
  color: #666;
  margin: 0.5rem 0 0 0;
}

.save-btn {
  width: 100%;
  background: #2c3e50;
  color: white;
  border: none;
  padding: 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  transition: background 0.2s;
}

.save-btn:hover {
  background: #34495e;
}

.save-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

/* お問い合わせフォーム */
.contact-card {
  margin-top: 1.5rem;
}

.contact-form {
  padding: 1rem;
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
  font-size: 1.5rem;
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
  font-size: 0.75rem;
  color: #999;
  margin: 0.5rem 0 0 0;
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

.loading,
.no-data {
  text-align: center;
  color: #666;
  padding: 2rem 0;
}

.book-link {
  color: #3498db;
  font-weight: bold;
  text-decoration: none;
}

.reservation-list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.reservation-item {
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 1rem;
  background: #fcfcfc;
}

.res-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.8rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px dashed #eee;
}

.res-header .date {
  font-weight: bold;
  font-size: 1.1rem;
  color: #333;
}

.status-badge {
  font-size: 0.8rem;
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: bold;
  color: white;
}

.status-badge.confirmed {
  background: #42b883;
}

.status-badge.pending {
  background: #e67e22;
}

.res-body {
  margin-bottom: 1rem;
}

.menu-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.3rem;
}

.menu-title {
  font-size: 1rem;
}

.menu-price {
  font-weight: bold;
  color: #555;
}

.res-footer {
  text-align: right;
}

.cancel-btn {
  background: white;
  border: 1px solid #e74c3c;
  color: #e74c3c;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.cancel-btn:hover {
  background: #e74c3c;
  color: white;
}

@media (max-width: 768px) {
  .content-grid {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
}
</style>