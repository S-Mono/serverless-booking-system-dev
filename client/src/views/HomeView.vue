<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { db, auth } from '../lib/firebase'
import { collection, getDocs, addDoc, query, where, Timestamp, orderBy, getDoc, doc, limit } from 'firebase/firestore'
import { onAuthStateChanged, type Unsubscribe } from 'firebase/auth'
import { useDialogStore } from '../stores/dialog'
import { useLineAuthStore } from '@/stores/lineAuth'
import { reportLiffError } from '../lib/errorReporter'

const dialog = useDialogStore()
const router = useRouter()
const lineAuthStore = useLineAuthStore()

// 🟢 修正1: price_with_tax を定義に追加
interface Menu {
  id: string
  title: string
  price: number
  price_with_tax: number // 👈 追加
  duration_min: number
  available_staff_ids: string[]
  description?: string
  category?: string
  order_priority?: number
}
interface Staff { id: string; name: string; display_name: string; roles: { accepts_new_customer: boolean; accepts_free_booking: boolean }; is_working: boolean; }
interface CustomerProfile { id: string; name_kanji?: string; name_kana: string; phone_number?: string; is_existing_customer: boolean; preferred_category?: string; }
interface ShopConfig { business_hours: { start: string; end: string }; time_slot_interval: number; tax_rate: number; }

const menus = ref<Menu[]>([])
const staffs = ref<Staff[]>([])
const shopConfig = ref<ShopConfig>({ business_hours: { start: '09:00', end: '19:00' }, time_slot_interval: 30, tax_rate: 10 })
const loading = ref(true)
const processing = ref(false)
const currentUser = ref<any>(null)

const customerProfile = ref<CustomerProfile | null>(null)
const isNewUser = ref(false)
const unreadCount = ref(0)

const showModal = ref(false)
const selectedMenus = ref<Menu[]>([])
const reservationDate = ref('')
const selectedTime = ref('')
const selectedStaffId = ref<string>('')
const customerNote = ref('')
const availableSlots = ref<Date[]>([])
const activeTab = ref<'barber' | 'beauty' | 'student' | 'chiro'>('barber')

const minDate = computed(() => {
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); return now.toISOString().slice(0, 10)
})

const displayedMenus = computed(() => {
  return menus.value.filter(m => {
    const cat = m.category || 'barber'
    return cat === activeTab.value
  })
})

// 前回の予約データ保持用
const lastReservation = ref<any>(null)

const lastReservationMenuLabel = computed(() => {
  const items = lastReservation.value?.menu_items as { title: string }[] | undefined
  if (!items?.length) return ''
  return items.map(m => m.title).join(' + ')
})

// 最新の予約を1件取得する関数
const fetchLastReservation = async (userId: string) => {
  try {
    const q = query(
      collection(db, 'reservations'),
      where('customer_id', '==', userId),
      where('status', '!=', 'cancelled'), // キャンセル済みは除外
      orderBy('created_at', 'desc'), // 作成日順で新しいもの
      limit(1) // 1件だけ
    )
    const snap = await getDocs(q)
    if (!snap.empty) {
      lastReservation.value = snap.docs[0]!.data()
    }
  } catch (e) {
    console.error('前回予約取得エラー', e)
  }
}

// 🟢 修正2: 計算ロジックを廃止し、DBの値をそのまま使う
// const getTaxPrice = (price: number) => Math.ceil(price * (1 + shopConfig.value.tax_rate / 100))

// 合計金額も price_with_tax を足し合わせるように変更
const totalAmount = computed(() => selectedMenus.value.reduce((sum, m) => sum + m.price_with_tax, 0))
const totalDuration = computed(() => selectedMenus.value.reduce((sum, m) => sum + m.duration_min, 0))

const availableStaffs = computed(() => {
  if (selectedMenus.value.length === 0) return []
  const staffIdsPerMenu = selectedMenus.value.map(m => m.available_staff_ids)
  const commonStaffIds = staffIdsPerMenu.reduce((a, b) => a.filter(c => b.includes(c)))
  let candidates = staffs.value.filter(s => commonStaffIds.includes(s.id))
  candidates = candidates.filter(s => (s as any).is_working !== false)
  if (isNewUser.value) candidates = candidates.filter(s => s.roles.accepts_new_customer)
  return candidates
})

const checkCustomerStatus = async (user: any) => {
  try {
    const docRef = doc(db, 'customers', user.uid)
    const docSnap = await getDoc(docRef)
    if (docSnap.exists()) {
      const data = docSnap.data()
      customerProfile.value = {
        id: docSnap.id,
        name_kanji: data.name_kanji,
        name_kana: data.name_kana,
        phone_number: data.phone_number,
        is_existing_customer: data.is_existing_customer,
        preferred_category: data.preferred_category
      }
      isNewUser.value = !data.is_existing_customer
      if (data.preferred_category && ['barber', 'beauty', 'student', 'chiro'].includes(data.preferred_category)) {
        activeTab.value = data.preferred_category as any
      }
      return
    }
  } catch (e) { console.error(e) }

  if (!user.email) return
  const phoneNumber = user.email.split('@')[0]
  if (!phoneNumber) return
  try {
    const q = query(collection(db, 'customers'), where('phone_number', '==', phoneNumber))
    const snapshot = await getDocs(q)
    if (!snapshot.empty) {
      const data = snapshot.docs[0]!.data()
      customerProfile.value = {
        id: snapshot.docs[0]!.id,
        name_kanji: data.name_kanji,
        name_kana: data.name_kana,
        phone_number: data.phone_number,
        is_existing_customer: data.is_existing_customer,
        preferred_category: data.preferred_category
      }
      isNewUser.value = !data.is_existing_customer
      if (data.preferred_category) activeTab.value = data.preferred_category as any
    } else {
      isNewUser.value = true
      customerProfile.value = null
    }
  } catch (error) { console.error('名寄せエラー:', error) }
}
const fetchUnreadCount = async (userId: string) => {
  try {
    const q = query(
      collection(db, 'messages'),
      where('customer_id', '==', userId),
      where('is_read', '==', false)
    )
    const snap = await getDocs(q)
    unreadCount.value = snap.size
  } catch (e) {
    console.error('未読件数取得エラー', e)
  }
}

// 「いつもの」ボタンのアクション
const bookWithLastMenu = () => {
  if (!lastReservation.value || !lastReservation.value.menu_items) return

  // 前回のメニュー名リスト
  const lastMenuTitles = lastReservation.value.menu_items.map((m: any) => m.title)

  // 現在のマスタ(menus)から、名前が一致するものを探す
  // (マスタから削除されているメニューは除外されるので安全)
  const targets = menus.value.filter(m => lastMenuTitles.includes(m.title))

  if (targets.length === 0) {
    return dialog.alert('前回のメニューは現在取り扱っていないようです。')
  }

  // 選択状態にしてモーダルを開く
  selectedMenus.value = targets
  openBookingModal()
}

let unsubscribeAuth: Unsubscribe | null = null

onMounted(async () => {
  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    currentUser.value = user
    if (user) {
      await checkCustomerStatus(user)
      fetchUnreadCount(user.uid)
      fetchLastReservation(user.uid)
      try {
        const menuSnap = await getDocs(collection(db, 'menus'))
        menus.value = menuSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          // 🟢 修正3: データマッピング時に price_with_tax が無い場合のフォールバックを一応入れておく
          .map((m: any) => ({
            ...m,
            price_with_tax: m.price_with_tax ?? Math.ceil(m.price * 1.1)
          }))
          .sort((a: any, b: any) => (a.order_priority ?? 999) - (b.order_priority ?? 999)) as Menu[]

        const staffSnap = await getDocs(collection(db, 'staffs'))
        staffs.value = staffSnap.docs.map(doc => { const d = doc.data(); return { id: doc.id, ...d, is_working: d.is_working ?? true } }) as Staff[]
        const configSnap = await getDoc(doc(db, 'shop_config', 'default_config'))
        if (configSnap.exists()) {
          const data = configSnap.data()
          shopConfig.value = {
            business_hours: data.business_hours || { start: '09:00', end: '19:00' },
            time_slot_interval: data.time_slot_interval || 30,
            tax_rate: data.tax_rate ?? 10
          }
        }
      } catch (error) { dialog.alert('データの読み込みに失敗しました', 'エラー') } finally { loading.value = false }
    } else { loading.value = false }
  })
})

const fetchAvailableSlots = async () => {
  availableSlots.value = []
  if (!selectedStaffId.value || !reservationDate.value || selectedMenus.value.length === 0) return
  try {
    const targetDate = new Date(reservationDate.value)
    const startOfDay = new Date(targetDate); startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(targetDate); endOfDay.setDate(endOfDay.getDate() + 1); endOfDay.setHours(0, 0, 0, 0)
    const q = query(collection(db, 'reservations'), where('staff_id', '==', selectedStaffId.value), where('start_at', '>=', Timestamp.fromDate(startOfDay)), where('start_at', '<', Timestamp.fromDate(endOfDay)), orderBy('start_at', 'asc'))
    const snapshot = await getDocs(q)
    const busySlots = snapshot.docs.map(doc => doc.data()).filter(d => d.status !== 'cancelled').map(d => ({ start: d.start_at.toDate().getTime(), end: d.end_at.toDate().getTime() }))

    const openTime = parseInt(shopConfig.value.business_hours.start.split(':')[0]!, 10)
    const closeTime = parseInt(shopConfig.value.business_hours.end.split(':')[0]!, 10)
    const interval = shopConfig.value.time_slot_interval || 30
    const requiredDuration = totalDuration.value
    let current = new Date(targetDate); current.setHours(openTime, 0, 0, 0)
    const closeDate = new Date(targetDate); closeDate.setHours(closeTime, 0, 0, 0)
    const slots: Date[] = []
    const now = new Date().getTime()
    while (current.getTime() + (requiredDuration * 60000) <= closeDate.getTime()) {
      const slotStart = current.getTime(); const slotEnd = slotStart + (requiredDuration * 60000)
      const isOverlap = busySlots.some(busy => slotStart < busy.end && slotEnd > busy.start)
      const isPast = slotStart < now
      if (!isOverlap && !isPast) slots.push(new Date(current))
      current = new Date(current.getTime() + interval * 60000)
    }
    availableSlots.value = slots
  } catch (e) { console.error('空き状況計算エラー:', e) }
}
watch([reservationDate, selectedStaffId, selectedMenus], () => { fetchAvailableSlots() })

const openBookingModal = () => {
  if (selectedMenus.value.length === 0) return dialog.alert('メニューを選択してください')

  // 🔴 名前と電話番号の必須チェック（ダイアログを開く前）
  if (!customerProfile.value?.name_kana || customerProfile.value.name_kana.trim() === '' ||
    !customerProfile.value?.phone_number || customerProfile.value.phone_number.trim() === '') {
    dialog.alert('マイページでお名前と電話番号を登録してから予約してください。', '名前・電話番号未登録')
    return
  }

  if (availableStaffs.value.length > 0) selectedStaffId.value = availableStaffs.value[0]!.id; else selectedStaffId.value = ''
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  reservationDate.value = now.toISOString().slice(0, 10)
  selectedTime.value = ''
  customerNote.value = ''; showModal.value = true; fetchAvailableSlots()
}
const selectTime = (time: Date) => {
  const pad = (n: number) => n < 10 ? '0' + n : n
  selectedTime.value = pad(time.getHours()) + ':' + pad(time.getMinutes())
}
const toggleMenu = (menu: Menu) => {
  const index = selectedMenus.value.findIndex(m => m.id === menu.id)
  if (index === -1) selectedMenus.value.push(menu)
  else selectedMenus.value.splice(index, 1)
}
const isSelected = (menu: Menu) => selectedMenus.value.some(m => m.id === menu.id)
const formatTime = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
const formatDateJP = (dateStr: string) => { if (!dateStr) return ''; const d = new Date(dateStr); return `${d.getMonth() + 1}月${d.getDate()}日` }

const submitReservation = async () => {
  if (!reservationDate.value || !selectedTime.value || !currentUser.value || !selectedStaffId.value) return

  // 🟢 予約内容の確認ダイアログ
  const startDate = new Date(reservationDate.value + 'T' + selectedTime.value)
  const dateStr = startDate.toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    weekday: 'short'
  })
  const staffName = availableStaffs.value.find(s => s.id === selectedStaffId.value)?.name || '担当者'
  const menuList = selectedMenus.value.map(m => `  ${m.title} (${m.duration_min}分) - ¥${m.price_with_tax.toLocaleString()}`).join('\n')
  const confirmMessage = `この内容で予約を確定します。\nよろしいでしょうか？\n\n【予約内容】\n日時: ${dateStr}\n担当: ${staffName}\nメニュー:\n${menuList}\n\n合計: ¥${totalAmount.value.toLocaleString()} (${totalDuration.value}分)`

  const confirmed = await dialog.open(confirmMessage, { title: '予約確認', type: 'normal', cancelText: 'いいえ', confirmText: 'はい' })
  if (!confirmed) return

  processing.value = true
  try {
    const now = new Date()
    if (startDate < now) throw new Error('過去の日時は選択できません。')
    const duration = totalDuration.value
    const endDate = new Date(startDate.getTime() + duration * 60000)
    const startTimestamp = Timestamp.fromDate(startDate); const endTimestamp = Timestamp.fromDate(endDate)
    const uid = currentUser.value?.uid || 'unknown'
    const limitQ = query(collection(db, 'reservations'), where('customer_id', '==', customerProfile.value?.id || uid), where('start_at', '>=', Timestamp.now()), where('status', '!=', 'cancelled'))
    const limitSnapshot = await getDocs(limitQ)
    if (limitSnapshot.size >= 3) throw new Error('予約数の上限(3件)に達しています。')
    const q = query(collection(db, 'reservations'), where('start_at', '<', endTimestamp), where('end_at', '>', startTimestamp))
    const snapshot = await getDocs(q)
    let isBusy = false
    snapshot.forEach(doc => { const data = doc.data(); if (data.status !== 'cancelled' && data.staff_id === selectedStaffId.value) isBusy = true })
    if (isBusy) throw new Error('申し訳ありません。指定された日時は担当者が満席です。')

    // 🟢 修正4: 保存時も price_with_tax を使う
    const resRef = await addDoc(collection(db, 'reservations'), {
      customer_id: customerProfile.value?.id || uid, customer_name: customerProfile.value?.name_kana || 'WEB予約ゲスト',
      customer_phone: customerProfile.value?.phone_number || '', staff_id: selectedStaffId.value, start_at: startTimestamp, end_at: endTimestamp,
      menu_items: selectedMenus.value.map(m => ({ title: m.title, price: m.price_with_tax, duration: m.duration_min })),
      total_price: totalAmount.value, total_duration_min: totalDuration.value, source: 'web', status: 'pending', note: customerNote.value || '', created_at: Timestamp.now()
    })

    // 🟢 追加: LINE Notify 送信（コメントアウト）
    // try {
    //   const NOTIFY_API_URL = 'https://send-line-notice-799586295685.asia-northeast1.run.app';
    //   const dateStr = startDate.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    //   const menuNames = selectedMenus.value.map(m => m.title).join(', ');
    //   const custName = customerProfile.value?.name_kana || 'ゲスト';
    //   const message = `🎉 新しい予約が入りました！\n\n日時: ${dateStr}\nメニュー: ${menuNames}\nお名前: ${custName} 様`;
    //   fetch(NOTIFY_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
    // } catch (e) { console.error('通知送信エラー:', e); }

    // 🟢 追加: 予約受付メッセージを送信
    const dateStr = startDate.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    await addDoc(collection(db, 'messages'), {
      customer_id: customerProfile.value?.id || uid,
      reservation_id: resRef.id,
      title: '仮予約を受け付けました',
      body: `以下の内容でリクエストを承りました。\nお店からの確定通知をお待ちください。\n\n日時: ${dateStr}\nメニュー: ${selectedMenus.value.map(m => m.title).join(', ')}\n担当: ${availableStaffs.value.find(s => s.id === selectedStaffId.value)?.name}`,
      is_read: false,
      created_at: Timestamp.now()
    })

    await dialog.alert('予約リクエストを送信しました！\nお店からの確定をお待ちください。')
    showModal.value = false;
    reservationDate.value = '';
    selectedTime.value = '';
    selectedMenus.value = []
  } catch (error: any) {
    console.error(error); await dialog.alert(error.message, 'エラー')
  } finally {
    processing.value = false
  }
}
</script>

<template>
  <div class="home-container">
    <p v-if="loading" class="loading">読み込み中...</p>

    <div v-else-if="currentUser" class="scroll-content">
      <div class="sticky-tabs">
        <div v-if="lastReservation" class="repeat-booking-area">
          <div class="repeat-card">
            <span class="repeat-label">前回のメニュー:</span>
            <span class="repeat-menu-text">
              {{ lastReservationMenuLabel }}
            </span>
            <button @click="bookWithLastMenu" class="repeat-btn">これで予約</button>
          </div>
        </div>
        <div class="tab-container">
          <button class="tab-btn" :class="{ active: activeTab === 'barber' }" @click="activeTab = 'barber'">💈
            理容</button>
          <button class="tab-btn" :class="{ active: activeTab === 'beauty' }" @click="activeTab = 'beauty'">💇‍♀️
            美容</button>
          <button class="tab-btn" :class="{ active: activeTab === 'student' }" @click="activeTab = 'student'">🎓
            学生</button>
          <button class="tab-btn" :class="{ active: activeTab === 'chiro' }" @click="activeTab = 'chiro'">💆‍♂️
            カイロ</button>
        </div>
      </div>

      <div class="menu-section-wrapper">
        <div class="menu-header">
          <h2 class="section-title">
            {{ activeTab === 'barber' ? '理容メニュー' : (activeTab === 'beauty' ? '美容メニュー' : (activeTab === 'student' ?
              '学生メニュー（中学生まで）' : 'カイロプラクティック')) }}
          </h2>
          <p class="section-desc">
            {{ activeTab === 'chiro' ? '身体のメンテナンスメニューです' : (activeTab === 'student' ? '中学生までの学生向けメニューです' :
              'ご希望のメニューを選択してください') }}
          </p>
        </div>
        <ul class="menu-list">
          <li v-for="menu in displayedMenus" :key="menu.id" class="menu-item" :class="{ active: isSelected(menu) }"
            @click="toggleMenu(menu)">

            <div class="check-icon">{{ isSelected(menu) ? '✅' : '⬜' }}</div>

            <div class="menu-main-info">
              <span class="menu-title">{{ menu.title }}</span>
              <div class="menu-meta">
                <span class="menu-duration">⏱ {{ menu.duration_min }}分</span>
                <span class="menu-price">¥{{ menu.price_with_tax.toLocaleString() }}</span>
              </div>
            </div>

            <div v-if="menu.description" class="menu-desc-right">
              {{ menu.description }}
            </div>

          </li>
        </ul>
        <p v-if="displayedMenus.length === 0" class="no-menu-msg">メニューがありません</p>
      </div>
    </div>

    <div v-else class="login-prompt">
      <div class="prompt-card">
        <h2>ようこそ！</h2>
        <p>WEB予約を利用するにはログイン（または会員登録）が必要です。</p><button class="go-login-btn" @click="router.push('/login')">ログイン /
          新規登録</button>
      </div>
    </div>

    <div class="bottom-action" v-if="currentUser && selectedMenus.length > 0">
      <div class="summary"><span>合計: <strong>{{ totalDuration }}分</strong></span><span class="total-price">¥{{
        totalAmount.toLocaleString() }}</span></div>
      <button class="book-btn" @click="openBookingModal">予約へ進む</button>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-content">
        <h3>予約内容の確認</h3>
        <div class="selected-list">
          <p v-for="m in selectedMenus" :key="m.id">・{{ m.title }}</p>
        </div>
        <div class="form-group"><label>担当スタッフ指名</label><select v-model="selectedStaffId">
            <option v-for="s in availableStaffs" :key="s.id" :value="s.id">{{ s.name }} ({{ s.display_name }})</option>
          </select>
          <p v-if="availableStaffs.length === 0" class="warn-text">※ 対応できるスタッフがいません</p>
        </div>
        <div class="form-group"><label>日付を選択:</label><input type="date" v-model="reservationDate" :min="minDate" />
        </div>
        <div v-if="selectedStaffId && reservationDate" class="availability-section">
          <h4>📅 {{ formatDateJP(reservationDate) }} の空き状況</h4>
          <p class="avail-desc">ご希望の時間を選択してください（所要時間: {{ totalDuration }}分）</p>
          <div v-if="availableSlots.length > 0" class="slot-grid"><button v-for="time in availableSlots"
              :key="time.getTime()" class="slot-btn" :class="{ selected: selectedTime === formatTime(time) }"
              @click="selectTime(time)">{{
                selectedTime === formatTime(time) ? '✓ ' + formatTime(time) : formatTime(time) }}</button></div>
          <p v-else class="no-slots-msg">❌ この日の空き枠はありません</p>
        </div>
        <div class="form-group"><label>ご要望・メモ (任意)</label><textarea v-model="customerNote"
            placeholder="髪型の希望など"></textarea></div>
        <div class="modal-actions"><button class="cancel-btn" @click="showModal = false"
            :disabled="processing">キャンセル</button><button class="confirm-btn" @click="submitReservation"
            :disabled="!reservationDate || !selectedTime || !selectedStaffId || processing">{{ processing ? '処理中...' :
              '確定する' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* コンテナを縦flexにし、高さを固定（ヘッダー60px + フッター80px分引く） */
.home-container {
  max-width: 1024px;
  margin: 0 auto;
  height: calc(100vh - 60px - 80px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

/* メインのスクロールエリア */
.scroll-content {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
}

/* ログインプロンプト */
.login-prompt {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem;
}

.prompt-card {
  background: #f8f9fa;
  padding: 3rem;
  border-radius: 8px;
  border: 1px solid #ddd;
  max-width: 600px;
  margin: 0 auto;
}

.go-login-btn {
  background: #42b883;
  color: white;
  border: none;
  padding: 1rem 3rem;
  font-size: 1.2rem;
  font-weight: bold;
  border-radius: 30px;
  cursor: pointer;
  margin-top: 2rem;
  box-shadow: 0 4px 6px rgba(66, 184, 131, 0.3);
  transition: transform 0.2s;
}

.go-login-btn:hover {
  transform: translateY(-2px);
  background: #3aa876;
}

/* タブ切り替え（スクロール内で固定） */
.sticky-tabs {
  position: sticky;
  top: 0;
  z-index: 90;
  background-color: #f4f5f7;
  padding-top: 1.5rem;
  margin-bottom: 0;
}

.tab-container {
  display: flex;
  max-width: 1024px;
  margin: 0 auto;
  width: 100%;
  border-bottom: 1px solid #dcdde1;
}

.tab-btn {
  flex: 1;
  padding: 0.6rem 0.25rem;
  border: none;
  border-right: 1px solid #e0e0e0;
  background: none;
  font-weight: bold;
  color: #888;
  cursor: pointer;
  border-bottom: 3px solid transparent;
  transition: all 0.2s;
  font-size: clamp(0.7rem, 3.2vw, 1rem);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-btn:last-child {
  border-right: none;
}

.tab-btn:hover {
  color: #555;
  background-color: rgba(0, 0, 0, 0.02);
}

.tab-btn.active {
  color: #3498db;
  border-bottom-color: #3498db;
  background-color: rgba(52, 152, 219, 0.06);
}

.repeat-booking-area {
  background-color: #f4f5f7;
  /* 背景色と合わせる */
  padding: 0.5rem 1rem 0 1rem;
  /* タブとの隙間調整 */
}

.repeat-card {
  background: #fff;
  border: 1px solid #dcdde1;
  border-radius: 8px;
  padding: 0.8rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.03);
}

.repeat-label {
  font-size: 0.8rem;
  font-weight: bold;
  color: #7f8c8d;
  white-space: nowrap;
}

.repeat-menu-text {
  flex: 1;
  font-size: 0.9rem;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.repeat-btn {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 0.4rem 0.8rem;
  font-size: 0.85rem;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  font-weight: bold;
}

.repeat-btn:hover {
  background: #34495e;
}

/* スマホ対応部分への追記 */
@media (max-width: 768px) {
  /* ... 既存の定義 ... */

  .repeat-card {
    flex-wrap: wrap;
    /* スマホなら折り返す */
    gap: 0.5rem;
  }

  .repeat-menu-text {
    width: 100%;
    /* メニュー名を改行して表示 */
    white-space: normal;
    font-size: 0.85rem;
    order: 3;
    /* ボタンの下に来るように */
  }

  .repeat-btn {
    margin-left: auto;
    /* 右寄せ */
  }
}


/* メニューセクション */
.menu-section-wrapper {
  background: #fff;
  border: 1px solid #ddd;
  border-top: none;
  border-radius: 0 0 8px 8px;
  padding: 2rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  margin-bottom: 2rem;
  box-sizing: border-box;
  padding-bottom: 4rem;
  /* 最下部の余白 */
}

.section-title {
  text-align: center;
  margin-bottom: 0.5rem;
  font-size: 1.5rem;
  color: #333;
  margin-top: 1rem;
}

.section-desc {
  text-align: center;
  font-size: 0.9rem;
  color: #666;
  margin-bottom: 2rem;
}

/* メニューリスト（グリッド） */
.menu-list {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1.5rem;
}

/* メニューカード */
.menu-item {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 1.2rem;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  flex-wrap: wrap;
}

.menu-item:hover {
  border-color: #bbb;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.menu-item.active {
  border-color: #42b883;
  background-color: #f0fff9;
  box-shadow: 0 0 0 2px #42b883;
}

.check-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

/* メニュー情報（中央エリア） */
.menu-main-info {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex: 1;
  min-width: 140px;
}

.menu-title {
  font-weight: bold;
  font-size: 1.1rem;
  line-height: 1.3;
}

.menu-meta {
  display: flex;
  gap: 0.8rem;
  font-size: 0.95rem;
  color: #555;
  align-items: center;
}

.menu-price {
  font-weight: bold;
  color: #2c3e50;
  white-space: nowrap;
}

/* 右側の説明文エリア */
.menu-desc-right {
  font-size: 0.85rem;
  color: #7f8c8d;
  line-height: 1.4;
  white-space: pre-wrap;
  text-align: right;
  margin-left: auto;
  padding-left: 1rem;
  max-width: 45%;
  border-left: 1px solid #eee;
}

.no-menu-msg {
  text-align: center;
  padding: 4rem;
  color: #999;
  font-size: 1.1rem;
  border: 2px dashed #eee;
  border-radius: 8px;
  background: #fafafa;
}

.loading {
  text-align: center;
  color: #666;
  margin-top: 4rem;
}

/* ボトムアクション（固定フッター的扱い） */
.bottom-action {
  width: 100%;
  background: rgba(255, 255, 255, 0.95);
  border-top: 1px solid #ddd;
  backdrop-filter: blur(5px);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
  padding: 1rem;
  display: flex;
  justify-content: center;
  gap: 3rem;
  align-items: center;
  z-index: 90;
  box-sizing: border-box;
  flex-shrink: 0;
}

.summary {
  display: flex;
  flex-direction: column;
  font-size: 1rem;
  text-align: right;
}

.total-price {
  font-size: 1.5rem;
  font-weight: bold;
  color: #e74c3c;
}

.book-btn {
  background-color: #42b883;
  color: white;
  border: none;
  padding: 1rem 4rem;
  border-radius: 30px;
  font-weight: bold;
  font-size: 1.2rem;
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(66, 184, 131, 0.4);
  transition: background 0.2s, transform 0.2s;
}

.book-btn:hover {
  background-color: #3aa876;
  transform: translateY(-2px);
}

/* モーダル */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 2.5rem;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  max-height: 90vh;
  overflow-y: auto;
  box-sizing: border-box;
}

.selected-list {
  background: #f9f9f9;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.warn-text {
  color: #e74c3c;
  font-size: 0.85rem;
  margin-top: 0.5rem;
}

input,
select,
textarea {
  padding: 0.8rem;
  font-size: 1.1rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
  width: 100%;
}

textarea {
  resize: vertical;
  min-height: 100px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}

.cancel-btn {
  background: #f0f0f0;
  border: none;
  padding: 0.8rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
}

.confirm-btn {
  background: #42b883;
  color: white;
  border: none;
  padding: 0.8rem 1.5rem;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
}

.confirm-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

/* 空き状況 */
.availability-section {
  margin-bottom: 1.5rem;
  background: #e8f5e9;
  padding: 1.5rem;
  border-radius: 6px;
  border: 1px solid #c8e6c9;
}

.availability-info h4 {
  margin: 0 0 0.5rem 0;
  font-size: 1.1rem;
  color: #2e7d32;
  text-align: center;
}

.avail-desc {
  font-size: 0.9rem;
  color: #555;
  margin-bottom: 1rem;
  text-align: center;
}

.slot-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.8rem;
}

.slot-btn {
  background: white;
  border: 1px solid #4caf50;
  color: #4caf50;
  padding: 0.8rem 0.5rem;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.slot-btn:hover {
  background: #e8f5e9;
  transform: translateY(-1px);
}

.slot-btn.selected {
  background: #1b5e20;
  color: #ffffff;
  font-weight: bold;
  font-size: 1rem;
  border: 2px solid #1b5e20;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35);
  transform: translateY(-2px);
}

.no-slots-msg {
  text-align: center;
  color: #e65100;
  font-weight: bold;
  font-size: 1rem;
}

/* スマホ対応 */
@media (max-width: 768px) {
  .home-container {
    padding-left: 0;
    padding-right: 0;
  }

  .menu-list {
    grid-template-columns: 1fr;
    gap: 0.8rem;
  }

  .menu-item {
    padding: 1rem;
    gap: 0.8rem;
  }

  .menu-title {
    font-size: 1rem;
  }

  .menu-meta {
    font-size: 0.85rem;
    gap: 0.5rem;
    justify-content: space-between;
    width: 100%;
  }

  .menu-price {
    font-size: 1.1rem;
  }

  /* スマホでは説明文を下段に */
  .menu-desc-right {
    width: 100%;
    max-width: 100%;
    margin-left: 0;
    padding-left: 0;
    padding-top: 0.5rem;
    border-left: none;
    border-top: 1px dashed #eee;
    text-align: left;
  }

  .bottom-action {
    padding: 1rem;
    gap: 1rem;
    flex-direction: column;
  }

  .book-btn {
    width: 100%;
    padding: 0.8rem;
    font-size: 1.1rem;
  }

  .summary {
    width: 100%;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }

  .modal-content {
    padding: 1.5rem;
  }

  .slot-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>