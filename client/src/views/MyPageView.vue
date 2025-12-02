<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { db, auth } from '../lib/firebase'
import { collection, query, where, getDocs, deleteDoc, doc, setDoc, Timestamp, orderBy, getDoc, updateDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { useDialogStore } from '../stores/dialog'

const dialog = useDialogStore()

interface Reservation {
  id: string
  start_at: Timestamp
  menu_items: { title: string; price: number }[]
  status: string
}

const reservations = ref<Reservation[]>([])
const loading = ref(true)
const currentUser = ref<any>(null)
const nameKana = ref('')
const preferredCategory = ref('barber') // 👈 追加
const isSavingProfile = ref(false)

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
      nameKana.value = data.name_kana
      preferredCategory.value = data.preferred_category || 'barber'
    } else {
      // なければ電話番号で名寄せトライ
      const phone = currentUser.value.email?.split('@')[0]
      if (phone) {
        const custQ = query(collection(db, 'customers'), where('phone_number', '==', phone))
        const custSnap = await getDocs(custQ)
        if (!custSnap.empty) {
          const data = custSnap.docs[0]!.data()
          nameKana.value = data.name_kana
          preferredCategory.value = data.preferred_category || 'barber'
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
  isSavingProfile.value = true
  try {
    const phone = currentUser.value.email?.split('@')[0] || ''
    await setDoc(doc(db, 'customers', currentUser.value.uid), {
      name_kana: nameKana.value,
      phone_number: phone,
      preferred_category: preferredCategory.value, // 👈 保存
      is_existing_customer: true,
      updated_at: Timestamp.now()
    }, { merge: true })
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
    <div class="page-header">
      <router-link to="/" class="back-btn">◀ 予約画面に戻る</router-link>
      <h2 class="page-title">マイページ</h2>
    </div>

    <div class="content-grid">
      <aside class="profile-column">
        <div class="card profile-card">
          <h3>お客様情報</h3>
          <div class="form-group">
            <label>お名前 (カナ)</label>
            <div class="input-row">
              <input type="text" v-model="nameKana" placeholder="例: ヤマダ タロウ" />
            </div>
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
            </div>
            <p class="hint">※ 予約画面の初期表示に反映されます。</p>
          </div>

          <button @click="saveProfile" :disabled="isSavingProfile" class="save-btn">
            {{ isSavingProfile ? '保存中...' : '保存する' }}
          </button>
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
</template>

<style scoped>
.mypage-container {
  max-width: 1024px;
  margin: 0 auto;
  padding: 2rem 1rem;
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
  gap: 1.5rem;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
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