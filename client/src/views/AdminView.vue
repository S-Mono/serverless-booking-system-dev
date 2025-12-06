<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { db, auth } from '../lib/firebase'
import { collection, getDocs, setDoc, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where, Timestamp, onSnapshot, getDoc, type Unsubscribe } from 'firebase/firestore'
import { useRouter } from 'vue-router'
import { useDialogStore } from '../stores/dialog'
import { messaging, VAPID_KEY } from '../lib/firebase' // 👈 VAPID_KEY
import { getToken, onMessage } from 'firebase/messaging'
import * as XLSX from 'xlsx-js-style'

const router = useRouter()
const dialog = useDialogStore()

// LocalStorage キー
const NOTIFICATION_STATUS_KEY = 'admin_notification_enabled'
const NOTIFICATION_TOKEN_KEY = 'admin_notification_token'

const isNotifyEnabled = ref(false) // 現在通知ONかどうか

interface Staff { id: string; name: string; color?: string }
interface Reservation {
  id: string; start_at: Timestamp; end_at: Timestamp; staff_id: string
  customer_id?: string; // 👈 追加
  customer_name?: string; customer_phone?: string; menu_items: { title: string; duration: number }[]; status: string; source?: 'web' | 'phone'; note?: string
}
interface Menu { id: string; title: string; duration_min: number; price: number }
interface ShopConfig { holiday_weekdays: number[]; closed_dates: string[]; business_hours: { start: string; end: string }; tax_rate: number }

const staffs = ref<Staff[]>([])
// reservations for the left-side list (from selectedDate onward)
const listReservations = ref<Reservation[]>([])
// reservations for the right-side timeline (only the selectedDate)
const dayReservations = ref<Reservation[]>([])
const menus = ref<Menu[]>([])
const shopConfig = ref<ShopConfig>({ holiday_weekdays: [], closed_dates: [], business_hours: { start: '09:00', end: '19:00' }, tax_rate: 10 })
const loading = ref(true)
// how many days to include in left-list window (from selectedDate 00:00)
const listWindowDays = ref(30)

const isSidebarOpen = ref(true)
const selectedDate = ref(new Date())
const openHour = ref(9)
const closeHour = ref(19)

let unsubscribeList: Unsubscribe | null = null
let unsubscribeDay: Unsubscribe | null = null

const isDragging = ref(false)
const dragStaffId = ref<string | null>(null)
const dragStartTime = ref<Date | null>(null)
const dragEndTime = ref<Date | null>(null)
const dragStartX = ref(0)

// --- モーダル管理 ---
const showModal = ref(false)
const showDetailModal = ref(false)

const selectedReservation = ref<Reservation | null>(null)
const customerHistory = ref<Reservation[]>([]) // 👈 履歴用

const isEditing = ref(false)
const editingId = ref<string | null>(null)

const newReservation = ref({
  staff_id: '', start_time: '', customer_name: '', customer_phone: '', menu_id: '', note: ''
})

// 共有の Audio インスタンス（フォールバック用）
const notificationSound = new Audio('/sounds/Chime-Announce05-3.mp3');

// WebAudio を使ったプリロード（より低遅延での再生を狙う）
let audioCtx: (AudioContext | null) = null
let chimeBuffer: AudioBuffer | null = null

const ensureAudioContext = () => {
  if (!audioCtx) {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (Ctx) audioCtx = new Ctx()
  }
}

const preloadChime = async () => {
  try {
    ensureAudioContext()
    // fetch with cache and decode into buffer
    const r = await fetch('/sounds/Chime-Announce05-3.mp3', { cache: 'force-cache' })
    const buffer = await r.arrayBuffer()
    if (!audioCtx) return
    // decodeAudioData returns a promise in modern browsers
    chimeBuffer = await audioCtx.decodeAudioData(buffer.slice(0))
  } catch (e) {
    // この時点ではフォールバックを残しておく
    console.warn('chime preload failed', e)
    chimeBuffer = null
  }
}

// 再生関数: Buffer があれば WebAudio を使い、なければ Audio element を使う
const playChime = async () => {
  try {
    if (audioCtx && chimeBuffer) {
      if (audioCtx.state === 'suspended') {
        // resume してから再生
        try { await audioCtx.resume() } catch (_) { /* ignore */ }
      }
      const src = audioCtx.createBufferSource()
      src.buffer = chimeBuffer
      src.connect(audioCtx.destination)
      src.start()
      return
    }

    // フォールバック：Audio element を使う
    try {
      await notificationSound.play()
      // すぐ止めないで自然に鳴らす（短い音なのでOK）。
    } catch (e) {
      console.warn('Audio element play failed', e)
      playFallbackBeep()
    }
  } catch (e) {
    console.error('playChime failed', e)
    playFallbackBeep()
  }
}
// onMessage の解除関数を保持する（initData が複数回呼ばれても一度だけ登録する）
let unregisterFcmOnMessage: (() => void) | null = null

// 最近通知済み ID を一時的に記録して重複通知を抑止する
const recentNotified = new Map<string, number>()
const NOTIFY_TTL_MS = 60 * 1000
const addRecentlyNotified = (id: string) => {
  try {
    recentNotified.set(id, Date.now() + NOTIFY_TTL_MS)
    // schedule cleanup
    setTimeout(() => { if ((recentNotified.get(id) || 0) <= Date.now()) recentNotified.delete(id) }, NOTIFY_TTL_MS + 500)
  } catch (_) { /* ignore */ }
}
const isRecentlyNotified = (id?: string) => { if (!id) return false; const t = recentNotified.get(id); return !!t && t > Date.now() }

// フォールバック: WebAudio を使って短いビープを鳴らす（mp3 が取得できない or 再生がブロックされた場合）
const playFallbackBeep = () => {
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) {
      console.warn('WebAudio not supported in this browser')
      return
    }
    const ctx = new AudioCtx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = 880 // A5
    g.gain.value = 0
    o.connect(g)
    g.connect(ctx.destination)
    const now = ctx.currentTime
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(0.2, now + 0.02)
    o.start(now)
    // 200ms 程度でフェードアウトして停止
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
    setTimeout(() => {
      try { o.stop(); ctx.close() } catch (_) { /* ignore */ }
    }, 220)
    return
  } catch (e) {
    console.warn('WebAudio fallback failed', e)
  }
}

const timeLabels = computed(() => {
  const labels = []
  for (let i = openHour.value; i < closeHour.value; i++) labels.push(`${i}:00`)
  return labels
})

const changeDate = (diff: number) => {
  const d = new Date(selectedDate.value)
  d.setDate(d.getDate() + diff)
  selectedDate.value = d
}

watch(selectedDate, () => { initData(false) })

const getTaxPrice = (price: number) => Math.ceil(price * (1 + shopConfig.value.tax_rate / 100))

const initData = async (fetchMaster = true) => {
  if (auth.currentUser?.phoneNumber) { dialog.alert('権限がありません'); router.push('/'); return }
  loading.value = true
  if (Notification.permission === 'default') Notification.requestPermission()

  try {
    if (fetchMaster) {
      const staffSnap = await getDocs(collection(db, 'staffs'))
      staffs.value = staffSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((s: any) => s.is_working !== false).sort((a: any, b: any) => a.order_priority - b.order_priority) as Staff[]
      const menuSnap = await getDocs(collection(db, 'menus'))
      menus.value = menuSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Menu[]
      const configSnap = await getDoc(doc(db, 'shop_config', 'default_config'))
      if (configSnap.exists()) {
        const data = configSnap.data()
        shopConfig.value = {
          holiday_weekdays: data.holiday_weekdays || [],
          closed_dates: data.closed_dates || [],
          business_hours: data.business_hours || { start: '09:00', end: '19:00' },
          tax_rate: data.tax_rate ?? 10
        }
        const hours = shopConfig.value.business_hours
        if (hours?.start) openHour.value = parseInt(hours.start.split(':')[0]!, 10)
        if (hours?.end) closeHour.value = parseInt(hours.end.split(':')[0]!, 10)
      }
    }

    const startOfDay = new Date(selectedDate.value); startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(selectedDate.value); endOfDay.setDate(endOfDay.getDate() + 1); endOfDay.setHours(0, 0, 0, 0)

    // 1) timeline query: only reservations for selected date (existing behaviour)
    if (unsubscribeDay) unsubscribeDay()
    const qDay = query(collection(db, 'reservations'), where('start_at', '>=', Timestamp.fromDate(startOfDay)), where('start_at', '<', Timestamp.fromDate(endOfDay)), orderBy('start_at', 'asc'))
    unsubscribeDay = onSnapshot(qDay, (snapshot) => {
      dayReservations.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Reservation[]
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const createdAt = data.created_at?.toDate().getTime() || 0;
          const now = new Date().getTime();

          // 1分以内に作成された予約（＝過去データ取得時ではなく、今の新規予約）なら
          if ((now - createdAt) < 60000 && !loading.value) {

            // 🔴 修正: 通知がONのときだけ実行する条件を追加
            if (isNotifyEnabled.value) {
              // avoid duplicates when FCM also delivers the same reservation
              const rId = change.doc.id
              if (isRecentlyNotified(rId)) {
                console.log('Skip snapshot notification (already recently notified):', rId)
                return
              }

              // 🎵 音を鳴らす（可能なら WebAudio バッファを使用）
              playChime().then(() => console.log('チャイム再生成功')).catch(e => {
                console.warn('チャイム再生ブロック', e)
                playFallbackBeep()
              })

              // ✨ ダイアログ表示
              const timeStr = `${formatTime(data.start_at)} - ${formatTime(data.end_at)}`;
              const staffName = getStaffName(data.staff_id);
              const menuName = data.menu_items?.[0]?.title || 'メニュー不明';

              dialog.alert(
                `${data.customer_name}様から新規予約があります！\n\n担当: ${staffName}\n時間: ${timeStr}\nメニュー: ${menuName}`,
                '🎉 新着予約'
              );
              // mark as notified so a following FCM message won't duplicate
              addRecentlyNotified(rId)
            }
          }
        }
      })
      loading.value = false
    })

    // 2) list query: show reservations from selectedDate (00:00) up to listWindowDays
    if (unsubscribeList) unsubscribeList()
    const windowEnd = new Date(startOfDay);
    windowEnd.setDate(windowEnd.getDate() + listWindowDays.value)
    const qList = query(collection(db, 'reservations'), where('start_at', '>=', Timestamp.fromDate(startOfDay)), where('start_at', '<', Timestamp.fromDate(windowEnd)), orderBy('start_at', 'asc'))
    unsubscribeList = onSnapshot(qList, (snapshot) => {
      listReservations.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Reservation[]
    })

    // Note: Foreground FCM handler is registered once in onMounted lifecycle
  } catch (e) { console.error(e); loading.value = false }
}

// 🔔 1. 画面ロード時に現在の通知設定を確認する
const checkNotificationStatus = async () => {
  try {
    // まずブラウザの許可状態を確認
    if (Notification.permission !== 'granted') {
      isNotifyEnabled.value = false
      localStorage.removeItem(NOTIFICATION_STATUS_KEY)
      localStorage.removeItem(NOTIFICATION_TOKEN_KEY)
      return
    }

    // トークンを取得
    const token = await getToken(messaging, { vapidKey: VAPID_KEY })
    if (token) {
      // localStorageに保存されたトークンと比較
      const savedToken = localStorage.getItem(NOTIFICATION_TOKEN_KEY)
      const savedStatus = localStorage.getItem(NOTIFICATION_STATUS_KEY)

      // トークンが変わった場合は、古いトークンを削除して新しいトークンで再登録
      if (savedToken && savedToken !== token) {
        console.log('Token changed, cleaning up old token:', savedToken)
        try {
          await deleteDoc(doc(db, 'admin_tokens', savedToken))
        } catch (e) {
          console.warn('Failed to delete old token', e)
        }
      }

      // DBにトークンが存在するかチェック
      const docSnap = await getDoc(doc(db, 'admin_tokens', token))
      const isEnabled = docSnap.exists()

      // 状態を更新
      isNotifyEnabled.value = isEnabled
      if (isEnabled) {
        localStorage.setItem(NOTIFICATION_STATUS_KEY, 'true')
        localStorage.setItem(NOTIFICATION_TOKEN_KEY, token)
      } else {
        // DBにない場合は、localStorageもクリア
        localStorage.removeItem(NOTIFICATION_STATUS_KEY)
        localStorage.removeItem(NOTIFICATION_TOKEN_KEY)
      }

      console.log('Notification status checked:', { isEnabled, token: token.substring(0, 20) + '...' })
    }
  } catch (e) {
    console.error('通知ステータス確認エラー', e)
    isNotifyEnabled.value = false
    localStorage.removeItem(NOTIFICATION_STATUS_KEY)
    localStorage.removeItem(NOTIFICATION_TOKEN_KEY)
  }
}

// 🔔 2. トグル切り替え処理
const toggleNotification = async () => {
  if (isNotifyEnabled.value) {
    // ONならOFFにする（削除処理）
    await turnOffNotification()
  } else {
    // OFFならONにする（登録処理）
    await requestNotificationPermission()
  }
}

// 🔔 3. 通知ON処理 (既存の requestNotificationPermission を少し修正)
const requestNotificationPermission = async () => {
  try {
    const permission = await Notification.requestPermission()
    console.log('requestNotificationPermission - Notification.permission:', permission)
    if (permission === 'granted') {
      console.log('Getting FCM token...')
      const token = await getToken(messaging, { vapidKey: VAPID_KEY })
      console.log('FCM token obtained:', token ? token.substring(0, 20) + '...' : 'null')
      if (token) {
        // 既にDBに存在するかチェック（重複登録防止）
        const docSnap = await getDoc(doc(db, 'admin_tokens', token))
        if (!docSnap.exists()) {
          // 新規登録
          await setDoc(doc(db, 'admin_tokens', token), {
            token: token,
            uid: auth.currentUser?.uid || 'unknown_admin',
            device_agent: navigator.userAgent,
            created_at: Timestamp.now()
          })
          console.log('requestNotificationPermission - saved new token to admin_tokens')
        } else {
          console.log('requestNotificationPermission - token already exists in DB')
        }

        // 状態を更新してlocalStorageに保存
        isNotifyEnabled.value = true
        localStorage.setItem(NOTIFICATION_STATUS_KEY, 'true')
        localStorage.setItem(NOTIFICATION_TOKEN_KEY, token)

        dialog.alert('この端末での通知を【ON】にしました！')
        // ユーザーが通知を有効にした直後は「ユーザー操作」とみなされるため
        // このタイミングで一度音を再生しておくと、今後の非同期通知再生で
        // ブラウザの自動再生制限に引っかかりにくくなります。
        try {
          // ユーザー操作の文脈なので WebAudio の resume とプリロード済みバッファの短再生を試みる
          ensureAudioContext()
          if (audioCtx) {
            try { await audioCtx.resume() } catch (_) { /* ignore */ }
            if (!chimeBuffer) await preloadChime()
            if (chimeBuffer) {
              try {
                // ごく短い・ほぼ無音レベルで再生して「ユーザー操作」を満たす
                const src = audioCtx.createBufferSource()
                const g = audioCtx.createGain()
                g.gain.value = 0.0001
                src.buffer = chimeBuffer
                src.connect(g)
                g.connect(audioCtx.destination)
                src.start()
                setTimeout(() => { try { src.stop() } catch (_) { } }, 120)
                console.log('通知用サウンドをWebAudioでプリロード/プライムしました')
              } catch (e) {
                console.warn('WebAudio test playback failed', e)
              }
            } else {
              // バッファがない場合は Audio element を使って短く鳴らす
              try {
                await notificationSound.play()
                notificationSound.pause()
                notificationSound.currentTime = 0
                console.log('通知用サウンド（Audio element）でプリロードに成功')
              } catch (e) {
                console.warn('通知サウンドのプリロードがブロックされました', e)
                try { playFallbackBeep() } catch (_) { /* ignore */ }
              }
            }
          }
        } catch (e) {
          console.warn('notification prime failed', e)
        }
      }
    } else {
      console.log('Notification permission denied:', permission)
      dialog.alert('ブラウザの設定で通知がブロックされています。')
    }
  } catch (e: any) {
    console.error('Notification setup error:', e)
    const errorMsg = e?.message || e?.code || '不明なエラー'
    dialog.alert(`設定に失敗しました: ${errorMsg}`)
  }
}
// 🔔 4. 通知OFF処理 (新規)
const turnOffNotification = async () => {
  try {
    const token = await getToken(messaging, { vapidKey: VAPID_KEY })
    if (token) {
      // DBから削除
      await deleteDoc(doc(db, 'admin_tokens', token))

      // 状態を更新してlocalStorageからも削除
      isNotifyEnabled.value = false
      localStorage.removeItem(NOTIFICATION_STATUS_KEY)
      localStorage.removeItem(NOTIFICATION_TOKEN_KEY)

      console.log('Notification turned off and localStorage cleared')
      dialog.alert('この端末での通知を【OFF】にしました。')
    } else {
      console.warn('No token found for turning off notification')
    }
  } catch (e: any) {
    console.error('Notification turn-off error:', e)
    const errorMsg = e?.message || e?.code || '不明なエラー'
    dialog.alert(`解除に失敗しました: ${errorMsg}`)
  }
}

const submitReservation = async () => {
  if (!newReservation.value.menu_id) return
  const menu = menus.value.find(m => m.id === newReservation.value.menu_id)
  if (!menu) return
  const startDate = new Date(newReservation.value.start_time)
  const endDate = new Date(startDate.getTime() + menu.duration_min * 60000)
  const payload = {
    staff_id: newReservation.value.staff_id,
    start_at: Timestamp.fromDate(startDate),
    end_at: Timestamp.fromDate(endDate),
    customer_name: newReservation.value.customer_name || '電話予約',
    customer_phone: newReservation.value.customer_phone || '',
    menu_items: [{ title: menu.title, duration: menu.duration_min, price: getTaxPrice(menu.price) }],
    source: 'phone', note: newReservation.value.note || '', status: 'confirmed'
  }
  try {
    if (isEditing.value && editingId.value) {
      await updateDoc(doc(db, 'reservations', editingId.value), payload)
      await dialog.alert('予約を更新しました')
    } else {
      await addDoc(collection(db, 'reservations'), { ...payload, created_at: Timestamp.now() })
      await dialog.alert('予約を追加しました')
    }
    showModal.value = false
  } catch (e) { console.error(e); dialog.alert('処理失敗') }
}

const deleteReservation = async (id: string) => {
  const ok = await dialog.confirm('本当に削除しますか？\n（復元できません）', '削除確認', 'danger')
  if (!ok) return

  try {
    // 1. 予約データの削除 (物理削除)
    await deleteDoc(doc(db, 'reservations', id))

    // 🟢 2. 関連するメッセージを「キャンセル扱い」に更新
    const msgQ = query(collection(db, 'messages'), where('reservation_id', '==', id))
    const msgSnap = await getDocs(msgQ)

    msgSnap.forEach(async (d) => {
      await updateDoc(d.ref, {
        is_cancelled: true,
        title: '【キャンセル済】' + d.data().title
      })
    })

    showDetailModal.value = false
    // 完了ダイアログは出さずにスッと閉じる（既存の挙動）

  } catch (e) {
    console.error(e)
    dialog.alert('削除に失敗しました')
  }
}

// 🟢 予約確定 (メッセージ作成機能付き)
const approveReservation = async (res: Reservation) => {
  try {
    // 1. ステータス更新
    await updateDoc(doc(db, 'reservations', res.id), { status: 'confirmed' })

    // 2. 顧客へのメッセージ作成 (customer_idがある場合のみ)
    if (res.customer_id) {
      const dateStr = res.start_at.toDate().toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })

      await addDoc(collection(db, 'messages'), {
        customer_id: res.customer_id,
        reservation_id: res.id,
        title: '予約が確定しました',
        body: `以下のご予約が確定いたしました。\n\n日時: ${dateStr}\nメニュー: ${res.menu_items[0]?.title}\n担当: ${getStaffName(res.staff_id)}\n\nご来店を心よりお待ちしております。`,
        is_read: false,
        created_at: Timestamp.now()
      })
    }

    await dialog.alert('予約を確定し、お客様にお知らせを送りました')
    showDetailModal.value = false
  } catch (e) {
    console.error(e)
    dialog.alert('承認処理に失敗しました')
  }
}

// 🔍 予約詳細を開く（履歴取得も行う）
const openReservationDetail = async (res: Reservation) => {
  selectedReservation.value = res
  showDetailModal.value = true
  customerHistory.value = []

  // 顧客IDがある場合のみ履歴を取得
  if (res.customer_id) {
    try {
      // インデックスエラー回避のため単純クエリで取得し、JS側でソート
      const q = query(collection(db, 'reservations'), where('customer_id', '==', res.customer_id))
      const snap = await getDocs(q)
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Reservation[]
      // 新しい順にソート
      customerHistory.value = list.sort((a, b) => b.start_at.seconds - a.start_at.seconds)
    } catch (e) {
      console.error('履歴取得エラー:', e)
    }
  }
}

// 顧客詳細画面へ遷移
const goToCustomerDetail = () => {
  if (selectedReservation.value?.customer_id) {
    // 🟢 open_id パラメータを付与して遷移
    router.push(`/admin/customers?open_id=${selectedReservation.value.customer_id}`)
  } else {
    router.push('/admin/customers')
  }
}

const openEditModal = (res: Reservation) => {
  const matchedMenu = menus.value.find(m => m.title === res.menu_items[0]?.title)
  newReservation.value = {
    staff_id: res.staff_id,
    start_time: toLocalISOString(res.start_at.toDate()),
    customer_name: res.customer_name || '',
    customer_phone: res.customer_phone || '',
    menu_id: matchedMenu ? matchedMenu.id : '',
    note: res.note || ''
  }
  isEditing.value = true; editingId.value = res.id; showDetailModal.value = false; showModal.value = true
}

const getLeftPosition = (startTs: Timestamp) => {
  const date = startTs.toDate()
  let minutesFromOpen = (date.getHours() - openHour.value) * 60 + date.getMinutes()
  if (minutesFromOpen < 0) minutesFromOpen = 0
  const totalOpenMinutes = (closeHour.value - openHour.value) * 60
  return (minutesFromOpen / totalOpenMinutes) * 100
}
const getWidth = (startTs: Timestamp, endTs: Timestamp) => {
  let start = startTs.toDate().getTime(); const end = endTs.toDate().getTime()
  const openTime = new Date(startTs.toDate()); openTime.setHours(openHour.value, 0, 0, 0)
  if (start < openTime.getTime()) start = openTime.getTime()
  const durationMinutes = (end - start) / 60000
  const totalOpenMinutes = (closeHour.value - openHour.value) * 60
  return (durationMinutes / totalOpenMinutes) * 100
}
const onMouseDown = (e: MouseEvent, staffId: string) => {
  isDragging.value = true; dragStaffId.value = staffId
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = e.clientX - rect.left; dragStartX.value = (x / rect.width) * 100
  const totalMinutes = (closeHour.value - openHour.value) * 60
  const minutes = Math.floor(totalMinutes * (x / rect.width)); const roundedMinutes = Math.floor(minutes / 15) * 15
  const date = new Date(selectedDate.value); date.setHours(openHour.value, roundedMinutes, 0, 0)
  dragStartTime.value = date; dragEndTime.value = new Date(date.getTime() + 15 * 60000)
}
const onMouseMove = (e: MouseEvent) => {
  if (!isDragging.value || !dragStartTime.value) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = e.clientX - rect.left
  const minutes = Math.floor(((closeHour.value - openHour.value) * 60) * (x / rect.width))
  const date = new Date(selectedDate.value); date.setHours(openHour.value, minutes, 0, 0)
  const roundedDate = new Date(Math.ceil(date.getTime() / (900000)) * 900000)
  if (roundedDate > dragStartTime.value) dragEndTime.value = roundedDate
}
const onMouseUp = () => {
  if (!isDragging.value || !dragStaffId.value || !dragStartTime.value || !dragEndTime.value) { isDragging.value = false; return }
  isEditing.value = false; editingId.value = null
  newReservation.value = {
    staff_id: dragStaffId.value,
    start_time: toLocalISOString(dragStartTime.value),
    customer_name: '', customer_phone: '', menu_id: '', note: ''
  }
  showModal.value = true; isDragging.value = false; dragStaffId.value = null
}
const formatTime = (ts: Timestamp) => { const d = ts.toDate(); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` }
const formatDate = (ts: Timestamp) => { const d = ts.toDate(); return `${d.getMonth() + 1}/${d.getDate()}` }
const getStaffName = (id: string) => staffs.value.find(s => s.id === id)?.name || '未定'
const getStaffColor = (id: string) => staffs.value.find(s => s.id === id)?.color || '#3498db'
const toLocalISOString = (date: Date) => {
  const pad = (n: number) => n < 10 ? '0' + n : n
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}
const formatDateJP = (d: Date) => { const days = ['日', '月', '火', '水', '木', '金', '土']; return `${d.getFullYear()}年 ${d.getMonth() + 1}月 ${d.getDate()}日 (${days[d.getDay()]})` }
const formatDateShort = (d: Date) => { const days = ['日', '月', '火', '水', '木', '金', '土']; const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}/${m}/${day} (${days[d.getDay()]})`; }
const getDragBarStyle = computed(() => {
  if (!dragStartTime.value || !dragEndTime.value) return {}
  const start = dragStartTime.value.getTime(); const end = dragEndTime.value.getTime()
  const totalOpenMinutes = (closeHour.value - openHour.value) * 60 * 60000
  const openTime = new Date(dragStartTime.value); openTime.setHours(openHour.value, 0, 0, 0)
  const left = ((start - openTime.getTime()) / totalOpenMinutes) * 100
  const width = ((end - start) / totalOpenMinutes) * 100
  return { left: `${left}%`, width: `${width}%` }
})
const getTooltipText = (res: Reservation) => {
  const sourceType = res.source === 'phone' ? '【電話】' : '【WEB】'
  const statusText = res.status === 'pending' ? '【仮予約】' : ''
  let text = `${statusText}${sourceType}\n${formatTime(res.start_at)} - ${formatTime(res.end_at)}\n${res.menu_items[0]?.title}\n${res.customer_name || '名称未設定'}`
  if (res.note) text += `\n📝 ${res.note}`
  return text
}
const getReservationClass = (res: Reservation) => {
  if (res.status === 'pending') return 'res-pending'
  return res.source === 'phone' ? 'res-phone' : 'res-web'
}
const getReservationStyle = (res: Reservation) => {
  const baseColor = getStaffColor(res.staff_id)
  if (res.status === 'pending') {
    return {
      backgroundColor: baseColor,
      backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255, 255, 255, 0.2) 5px, rgba(255, 255, 255, 0.2) 10px)',
      border: `1px solid ${baseColor}`
    }
  }
  return {
    backgroundColor: baseColor
  }
}
const calendarDays = computed(() => {
  const year = selectedDate.value.getFullYear(); const month = selectedDate.value.getMonth()
  const firstDay = new Date(year, month, 1); const lastDay = new Date(year, month + 1, 0)
  const days = []
  for (let i = 0; i < firstDay.getDay(); i++) days.push({ day: '', isCurrentMonth: false })
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dateObj = new Date(year, month, d)
    const isHoliday = shopConfig.value.holiday_weekdays?.includes(dateObj.getDay()) || shopConfig.value.closed_dates?.includes(dateStr)
    days.push({ day: d, dateStr, isCurrentMonth: true, isHoliday, isSelected: d === selectedDate.value.getDate() })
  }
  return days
})

// helper: compare two Date objects by date only (ignore time)
const isSameDateOnly = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// group left-side list by date and put selectedDate group first
const groupedByDate = computed(() => {
  const groups: Record<string, Reservation[]> = {}
  listReservations.value.forEach(r => {
    const d = r.start_at.toDate()
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!groups[key]) groups[key] = []
    groups[key].push(r)
  })

  // sort reservations in each group by start time
  for (const k in groups) {
    groups[k]!.sort((a, b) => a.start_at.seconds - b.start_at.seconds)
  }

  // order keys ascending (parse YYYY-MM-DD to local Date safely)
  const parseKeyToDate = (k: string) => {
    const parts = k.split('-')
    const y = Number(parts[0] || 0)
    const m = Number(parts[1] || 1)
    const d = Number(parts[2] || 1)
    return new Date(y, m - 1, d)
  }
  const keys = Object.keys(groups).sort((a, b) => parseKeyToDate(a).getTime() - parseKeyToDate(b).getTime())

  // ensure selectedDate group always shows at top (even if empty)
  const sel = new Date(selectedDate.value); sel.setHours(0, 0, 0, 0)
  const selKey = `${sel.getFullYear()}-${String(sel.getMonth() + 1).padStart(2, '0')}-${String(sel.getDate()).padStart(2, '0')}`
  if (!groups[selKey]) groups[selKey] = []
  const result: { key: string; date: Date; items: Reservation[] }[] = []
  // push selected date (now guaranteed to exist) first
  result.push({ key: selKey, date: parseKeyToDate(selKey), items: groups[selKey] })
  keys.forEach(k => {
    if (k === selKey) return
    result.push({ key: k, date: parseKeyToDate(k), items: groups[k] || [] })
  })

  return result
})
const selectCalendarDate = (day: any) => { if (!day.isCurrentMonth) return; const newDate = new Date(selectedDate.value); newDate.setDate(day.day); selectedDate.value = newDate }

// load more days into the left-list window (incrementally)
const loadMoreDays = (days = 30) => {
  listWindowDays.value += days
  initData(false)
}

onMounted(async () => {
  initData()
  // try to preload the chime buffer for lower-latency playback
  preloadChime()
  // 通知状態を確認・復元
  await checkNotificationStatus()

  // Register a single foreground onMessage handler for FCM so admin sees alerts
  // even when they're viewing a different date. Keep unregister function in module scope.
  if (!unregisterFcmOnMessage) {
    const fcmHandler = (payload: any) => {
      console.log('Foreground FCM message received', payload)
      try {
        const title = payload.notification?.title || payload.data?.title
        const body = payload.notification?.body || payload.data?.body
        // dedupe: if payload contains reservationId and it's recently handled, skip
        const reservationId = payload?.data?.reservationId || payload?.data?.reservation_id
        if (reservationId && isRecentlyNotified(reservationId)) {
          console.log('Skipping duplicate notification for', reservationId)
          return
        }

        if (title || body) {
          playChime().then(() => console.log('チャイム再生成功 (fcm)')).catch(e => {
            console.warn('チャイム再生失敗 (fcm)', e)
            playFallbackBeep()
          })

          dialog.alert(body || '', title || 'お知らせ')
          if (reservationId) addRecentlyNotified(reservationId)
        }
      } catch (e) {
        console.error('Foreground message processing failed', e)
      }
    }

    try {
      unregisterFcmOnMessage = onMessage(messaging, fcmHandler) as unknown as () => void
    } catch (e) {
      console.warn('onMessage registration failed', e)
    }
  }
})

onUnmounted(() => {
  try { if (unsubscribeDay) unsubscribeDay() } catch (_) { }
  try { if (unsubscribeList) unsubscribeList() } catch (_) { }
  try { if (unregisterFcmOnMessage) unregisterFcmOnMessage() } catch (_) { }
})

// Excel出力関数
const exportReservationsToExcel = async () => {
  try {
    // 左パネルと同じ表示期間の予約を取得（selectedDateから30日分）
    const startDate = new Date(selectedDate.value)
    startDate.setHours(0, 0, 0, 0)

    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + listWindowDays.value)
    endDate.setHours(23, 59, 59, 999)

    const reservationsRef = collection(db, 'reservations')
    const q = query(
      reservationsRef,
      where('start_at', '>=', Timestamp.fromDate(startDate)),
      where('start_at', '<=', Timestamp.fromDate(endDate)),
      orderBy('start_at', 'asc')
    )
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      dialog.alert('出力する予約がありません', '予約データなし')
      return
    }

    const reservations: Reservation[] = []
    snapshot.forEach((doc) => {
      reservations.push({ id: doc.id, ...doc.data() } as Reservation)
    })

    // 日付ごとにグループ化
    const groupedByDate = new Map<string, Reservation[]>()
    reservations.forEach((res) => {
      const date = res.start_at.toDate()
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      if (!groupedByDate.has(dateKey)) {
        groupedByDate.set(dateKey, [])
      }
      groupedByDate.get(dateKey)!.push(res)
    })

    // 営業時間の取得
    const startHour = parseInt(shopConfig.value.business_hours.start.split(':')[0] as string)
    const endHour = parseInt(shopConfig.value.business_hours.end.split(':')[0] as string)

    // 15分単位の時間枠を生成 (例: 09:00, 09:15, 09:30...)
    const timeSlots: string[] = []
    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        timeSlots.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
      }
    }
    timeSlots.push(`${String(endHour).padStart(2, '0')}:00`)

    // Excelデータ作成（横軸=時間、縦軸=項目）
    const worksheetData: any[] = []
    const cellStyles: { row: number; col: number; style: any }[] = []
    let currentRow = 0

    // 日付ごとに処理
    const sortedDates = Array.from(groupedByDate.keys()).sort()
    sortedDates.forEach((dateKey, dateIndex) => {
      const dateReservations = groupedByDate.get(dateKey)!
      const dateObj = new Date(dateKey)
      const days = ['日', '月', '火', '水', '木', '金', '土']
      const dateHeader = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日(${days[dateObj.getDay()]})`

      // 日付ヘッダー行を追加
      if (dateIndex > 0) {
        worksheetData.push([]) // 前の日付との間に空行
        currentRow++
      }
      worksheetData.push([dateHeader])
      currentRow++

      // ヘッダー行：項目名 + 各時間枠
      const headerRow = ['時間', ...timeSlots]
      worksheetData.push(headerRow)
      const headerRowIndex = currentRow
      currentRow++

      // 各時間枠の予約データを収集（開始時間のみ記録）
      const timeSlotData = new Map<string, {
        reservation: Reservation | null;
        isStart: boolean;
        customerName: string;
        phone: string;
        staff: string;
        menu: string;
        note: string
      }>()

      // 予約ごとに開始時間と終了時間を特定
      dateReservations.forEach((res) => {
        const resStart = res.start_at.toDate()
        const resEnd = res.end_at.toDate()

        // 開始時間に最も近い時間枠を見つける
        let startSlotIndex = -1
        let endSlotIndex = -1

        timeSlots.forEach((slot, index) => {
          const [slotHour, slotMinute] = slot.split(':').map(Number) as [number, number]
          const slotTime = new Date(dateObj)
          slotTime.setHours(slotHour, slotMinute, 0, 0)

          // 開始時間の時間枠を特定
          if (resStart.getHours() === slotHour && resStart.getMinutes() === slotMinute) {
            startSlotIndex = index
          }

          // 終了時間の時間枠を特定
          if (resEnd <= new Date(slotTime.getTime() + 15 * 60 * 1000)) {
            if (endSlotIndex === -1) {
              endSlotIndex = index
            }
          }
        })

        // 各時間枠に対してデータを設定
        timeSlots.forEach((slot, index) => {
          const isStartSlot = index === startSlotIndex
          const isInRange = index >= startSlotIndex && index <= endSlotIndex && startSlotIndex !== -1

          if (isInRange && !timeSlotData.has(slot)) {
            timeSlotData.set(slot, {
              reservation: res,
              isStart: isStartSlot,
              customerName: isStartSlot ? (res.customer_name || '名称未設定') : '',
              phone: isStartSlot ? (res.customer_phone || '') : '',
              staff: isStartSlot ? getStaffName(res.staff_id) : '',
              menu: isStartSlot ? res.menu_items.map(m => m.title).join(', ') : '',
              note: isStartSlot ? (res.note || '') : ''
            })
          }
        })
      })

      // 各項目行を作成
      const customerNameRow = ['顧客名', ...timeSlots.map(slot => timeSlotData.get(slot)?.customerName || '')]
      const phoneRow = ['電話番号', ...timeSlots.map(slot => timeSlotData.get(slot)?.phone || '')]
      const staffRow = ['スタッフ', ...timeSlots.map(slot => timeSlotData.get(slot)?.staff || '')]
      const menuRow = ['メニュー', ...timeSlots.map(slot => timeSlotData.get(slot)?.menu || '')]
      const noteRow = ['備考', ...timeSlots.map(slot => timeSlotData.get(slot)?.note || '')]

      const customerNameRowIndex = currentRow
      worksheetData.push(customerNameRow)
      currentRow++
      worksheetData.push(phoneRow)
      currentRow++
      worksheetData.push(staffRow)
      currentRow++
      worksheetData.push(menuRow)
      currentRow++
      worksheetData.push(noteRow)
      currentRow++

      // セルのスタイルを設定
      timeSlots.forEach((slot, colIndex) => {
        const slotData = timeSlotData.get(slot)
        const excelCol = colIndex + 1 // 0列目は項目名なので+1

        // 奇数・偶数列の色分け（薄いストライプ）
        const isOddColumn = (colIndex + 1) % 2 === 1
        const stripeBgColor = isOddColumn ? 'F9F9F9' : 'FFFFFF'

        // 予約がある場合は薄いグレーで塗りつぶし
        const bgColor = slotData?.reservation ? 'E8E8E8' : stripeBgColor

        // 各項目行のセルにスタイルを適用
        for (let rowOffset = 0; rowOffset < 5; rowOffset++) {
          cellStyles.push({
            row: customerNameRowIndex + rowOffset,
            col: excelCol,
            style: {
              fill: {
                fgColor: { rgb: bgColor }
              }
            }
          })
        }
      })
    })

    // ワークブックとワークシートを作成
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)

    // セルスタイルを適用
    cellStyles.forEach(({ row, col, style }) => {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
      if (!worksheet[cellAddress]) {
        worksheet[cellAddress] = { t: 's', v: '' }
      }
      // xlsx-js-style用のスタイル形式
      worksheet[cellAddress].s = {
        fill: {
          patternType: 'solid',
          fgColor: { rgb: style.fill.fgColor.rgb }
        }
      }
    })

    // 列幅の設定（時間枠の数に応じて）
    const colWidths = [{ wch: 12 }] // 最初の列（項目名）
    timeSlots.forEach(() => {
      colWidths.push({ wch: 15 }) // 各時間枠の列
    })
    worksheet['!cols'] = colWidths

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '予約一覧')

    // ファイル名を生成（表示期間の開始日）
    const fileName = `予約一覧_${startDate.getFullYear()}${String(startDate.getMonth() + 1).padStart(2, '0')}${String(startDate.getDate()).padStart(2, '0')}.xlsx`

    // ファイルをダウンロード
    XLSX.writeFile(workbook, fileName)

    dialog.alert(`${reservations.length}件の予約をExcelに出力しました`, '出力完了')
  } catch (error) {
    console.error('Excel出力エラー:', error)
    dialog.alert('Excelの出力中にエラーが発生しました', 'エラー')
  }
}
</script>

<template>
  <div class="admin-container">
    <header class="admin-header">
      <div class="header-left">
        <h2>予約管理ダッシュボード</h2>
      </div>
      <div class="header-right">
        <button @click="toggleNotification" class="notify-btn" :class="{ 'active': isNotifyEnabled }">
          {{ isNotifyEnabled ? '🔕 通知OFFにする' : '🔔 通知ONにする' }}
        </button>
        <button @click="exportReservationsToExcel" class="export-btn" title="当日から未来の予約をExcelに出力">📥 Excel出力</button>
        <button @click="router.push('/admin/customers')" class="nav-link-btn">👥 顧客管理</button>
        <button @click="router.push('/admin/sales')" class="nav-link-btn">📊 売上分析</button>
        <div class="status-badge">🟢 リアルタイム接続中</div>
        <button @click="$router.push('/admin/settings')" class="settings-link-btn">⚙ 設定</button>
      </div>
    </header>

    <div v-if="loading" class="loading">Loading...</div>

    <div v-else class="admin-body">

      <div class="panel-left" :class="{ collapsed: !isSidebarOpen }">
        <div class="panel-header">
          <template v-if="isSidebarOpen">
            <div style="display:flex;align-items:center;gap:8px;">
              <h3 style="margin:0">予約リスト</h3>
              <button class="today-btn" style="padding:0.25rem 0.6rem;font-size:0.8rem;height:auto;"
                @click="selectedDate = new Date()">📅 本日の予約</button>
            </div>
            <button class="toggle-btn" @click="isSidebarOpen = false" title="閉じる">◀</button>
          </template>
          <div v-else class="collapsed-content" @click="isSidebarOpen = true">
            <button class="toggle-btn open">▶</button>
            <span class="vertical-text">予約リスト</span>
          </div>
        </div>
        <div v-if="isSidebarOpen" class="kanban-list-container">
          <div class="kanban-list">
            <div v-for="group in groupedByDate" :key="group.key" class="date-group">
              <div class="date-group-header" :class="{ 'selected-group': isSameDateOnly(group.date, selectedDate) }">{{
                formatDateJP(group.date) }}</div>
              <transition-group name="list">
                <div v-for="res in group.items" :key="res.id" class="kanban-card" :class="getReservationClass(res)"
                  @click="openReservationDetail(res)">
                  <div class="card-left">
                    <div class="time-box">
                      <span class="time">{{ formatTime(res.start_at) }}<span
                          v-if="!isSameDateOnly(res.start_at.toDate(), selectedDate)"
                          style="font-size:0.7rem;color:#666;margin-left:6px">{{ formatDate(res.start_at)
                          }}</span></span>
                      <span v-if="res.status === 'pending'" class="status-icon-pending">未</span>
                      <span v-else class="source-icon">{{ res.source === 'phone' ? '📞' : '🌐' }}</span>
                    </div>
                  </div>
                  <div class="details">
                    <div class="menu-title">{{ res.menu_items[0]?.title }}</div>
                    <div class="customer-info">
                      <div v-if="res.customer_name" class="c-row"><span class="icon">👤</span> {{ res.customer_name }}
                      </div>
                    </div>
                    <div class="staff-badge">担当: {{ getStaffName(res.staff_id) }}</div>
                  </div>
                </div>
              </transition-group>
              <p v-if="group.items.length === 0" style="margin-left:8px;color:#777;font-size:0.85rem">この日の予約はありません</p>
            </div>
            <div class="list-footer"
              style="display:flex;align-items:center;justify-content:space-between;margin-top:0.5rem">
              <div style="font-size:0.85rem;color:#666">表示期間: {{ formatDateShort(selectedDate) }} 〜
                {{ formatDateShort(new Date(new Date(selectedDate).getTime() + (listWindowDays * 24 * 3600 * 1000))) }}
              </div>
              <div>
                <button class="load-more-btn" @click="loadMoreDays(30)">さらに30日を読み込む</button>
              </div>
            </div>
            <p v-if="groupedByDate.length === 0" class="no-data">予約はありません</p>
          </div>
        </div>
      </div>

      <div class="panel-right">
        <div class="calendar-bar">
          <button class="date-nav-btn" @click="changeDate(-1)">◀ 前日</button>
          <div class="calendar-dropdown-wrapper">
            <div class="current-date"><span class="date-text">{{ formatDateJP(selectedDate) }}</span></div>
            <div class="mini-calendar-popup">
              <div class="calendar-grid">
                <div class="day-label" v-for="d in ['日', '月', '火', '水', '木', '金', '土']" :key="d">{{ d }}</div>
                <div v-for="(day, idx) in calendarDays" :key="idx" class="day-cell"
                  :class="{ 'is-holiday': day.isHoliday, 'is-selected': day.isSelected, 'empty': !day.isCurrentMonth }"
                  @click="selectCalendarDate(day)">{{ day.day }}</div>
              </div>
            </div>
          </div>
          <button class="date-nav-btn" @click="changeDate(1)">翌日 ▶</button>
          <button class="today-btn" @click="selectedDate = new Date()">今日</button>
        </div>

        <div class="timeline-container">
          <div class="timeline-header">
            <div class="staff-header-cell"></div>
            <div class="time-scale">
              <div v-for="label in timeLabels" :key="label" class="time-label-cell">{{ label }}</div>
            </div>
          </div>
          <div class="timeline-body" @mouseleave="isDragging = false">
            <div v-for="staff in staffs" :key="staff.id" class="staff-row">
              <div class="staff-cell">{{ staff.name }}</div>
              <div class="timeline-cell" @mousedown="onMouseDown($event, staff.id)" @mousemove="onMouseMove"
                @mouseup="onMouseUp">
                <div class="grid-lines">
                  <div v-for="label in timeLabels" :key="label" class="grid-line"></div>
                </div>
                <transition-group name="fade">
                  <template v-for="res in dayReservations" :key="res.id">
                    <div v-if="res.staff_id === staff.id" class="reservation-bar" :class="getReservationClass(res)"
                      :style="{ ...getReservationStyle(res), left: `${getLeftPosition(res.start_at)}%`, width: `${getWidth(res.start_at, res.end_at)}%` }"
                      :title="getTooltipText(res)" @mousedown.stop @click.stop="openReservationDetail(res)">
                      <span class="bar-text">
                        <span v-if="res.status === 'pending'">【未】</span>
                        {{ res.menu_items[0]?.title }}
                      </span>
                    </div>
                  </template>
                </transition-group>
                <div v-if="isDragging && dragStaffId === staff.id" class="drag-preview-bar" :style="getDragBarStyle">
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-content">
        <div class="modal-header-row">
          <h3>{{ isEditing ? '予約の編集' : '新規予約 (電話受付)' }}</h3>
          <button class="close-x-btn" @click="showModal = false">×</button>
        </div>
        <div class="form-group"><label>担当スタッフ</label><select v-model="newReservation.staff_id" disabled>
            <option v-for="s in staffs" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select></div>
        <div class="form-group"><label>開始日時</label><input type="datetime-local" v-model="newReservation.start_time">
        </div>
        <div class="form-group"><label>メニュー</label><select v-model="newReservation.menu_id">
            <option value="" disabled>選択してください</option>
            <option v-for="m in menus" :key="m.id" :value="m.id">{{ m.title }} ({{ m.duration_min }}分)</option>
          </select></div>
        <div class="form-group"><label>顧客名 (任意)</label><input type="text" v-model="newReservation.customer_name"
            placeholder="例: 山田様"></div>
        <div class="form-group"><label>電話番号 (任意)</label><input type="tel" v-model="newReservation.customer_phone"
            placeholder="09012345678"></div>
        <div class="form-group"><label>メモ</label><textarea v-model="newReservation.note"
            placeholder="特記事項..."></textarea>
        </div>
        <div class="modal-actions right-align">
          <button class="save-btn" @click="submitReservation">{{ isEditing ? '更新する' : '登録する' }}</button>
        </div>
      </div>
    </div>

    <div v-if="showDetailModal && selectedReservation" class="modal-overlay" @click.self="showDetailModal = false">
      <div class="modal-content detail-modal">
        <div class="modal-header-row">
          <h3>予約詳細</h3>
          <button class="close-x-btn" @click="showDetailModal = false">×</button>
        </div>

        <div v-if="selectedReservation.status === 'pending'" class="pending-alert">
          <p>⚠️ <strong>WEBからの仮予約です</strong></p>
          <button class="approve-btn" @click="approveReservation(selectedReservation)">✅ 予約を確定する</button>
        </div>

        <div class="detail-body">
          <div class="detail-row"><span class="label">日時:</span> {{ formatTime(selectedReservation.start_at) }} - {{
            formatTime(selectedReservation.end_at) }}</div>
          <div class="detail-row"><span class="label">メニュー:</span> {{ selectedReservation.menu_items[0]?.title }}</div>
          <div class="detail-row"><span class="label">顧客名:</span> {{ selectedReservation.customer_name || '名称未設定' }}
            <button v-if="selectedReservation.customer_id" class="link-text-btn" @click="goToCustomerDetail">➡
              顧客詳細へ</button>
          </div>
          <div class="detail-row"><span class="label">電話:</span> {{ selectedReservation.customer_phone || 'なし' }}</div>
          <div class="detail-row"><span class="label">担当:</span> {{ getStaffName(selectedReservation.staff_id) }}</div>
          <div class="detail-row"><span class="label">受付:</span> <span
              :class="selectedReservation.status === 'pending' ? 'tag-pending' : (selectedReservation.source === 'phone' ? 'tag-phone' : 'tag-web')">{{
                selectedReservation.status === 'pending' ? '仮予約' : (selectedReservation.source === 'phone' ? '電話予約' :
                  'WEB予約')
              }}</span></div>
          <div class="detail-note">
            <div class="label">メモ:</div>
            <div class="note-content">{{ selectedReservation.note || '（なし）' }}</div>
          </div>
        </div>

        <div class="history-area">
          <h4>📋 この顧客の予約履歴</h4>
          <ul v-if="customerHistory.length > 0" class="history-list">
            <li v-for="h in customerHistory" :key="h.id" class="history-item"
              :class="{ 'current': h.id === selectedReservation.id }">
              <span class="h-date">{{ formatDate(h.start_at) }}</span>
              <span class="h-menu">{{ h.menu_items[0]?.title }}</span>
              <span class="h-status" :class="h.status">{{ h.status === 'confirmed' ? '済' : '未' }}</span>
            </li>
          </ul>
          <p v-else class="no-history">履歴はありません</p>
        </div>

        <div class="modal-actions split">
          <button class="delete-confirm-btn" @click="deleteReservation(selectedReservation.id)">🗑️ 削除</button>
          <button class="edit-btn" @click="openEditModal(selectedReservation)">✏️ 編集</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* --- 全体レイアウト --- */
/* 画面いっぱいに広げる */
.admin-container {
  height: 100%;
  /* 親のmainタグの高さに合わせる */
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: #f4f5f7;
  overflow: hidden;
  /* 外側へのスクロールを禁止 */
}

/* ヘッダー */
.admin-header {
  background: #2c3e50;
  color: white;
  padding: 0 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 50px;
  flex-shrink: 0;
  /* 縮まない */
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.status-badge {
  background: #27ae60;
  color: white;
  font-size: 0.7rem;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-weight: bold;
  white-space: nowrap;
}

.settings-link-btn {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: none;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  white-space: nowrap;
}

.settings-link-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.notify-btn {
  /* デフォルト(通知OFFの状態)はオレンジや緑で「押してね」感を出す */
  background: #e67e22;
  color: white;
  border: none;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: bold;
  margin-right: 0.5rem;
  transition: all 0.2s;
}

.notify-btn:hover {
  opacity: 0.9;
}

/* 通知がONの状態（＝OFFにするボタン） */
.notify-btn.active {
  background: #139933;
  /* グレーにして「今は有効だよ」感を出す */
  /* または #34495e (ダークブルー) などお好みで */
}

.notify-btn.active:hover {
  background: #95a5a6;
}

.export-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: bold;
  margin-right: 0.5rem;
  transition: all 0.2s;
}

.export-btn:hover {
  background: #2980b9;
}

/* ボディエリア (ここより下で横並び) */
.admin-body {
  flex: 1;
  /* 残りの高さを埋める */
  display: flex;
  overflow: hidden;
  /* 内部ではみ出した分は隠す(子要素でスクロール) */
  width: 100%;
  position: relative;
}

/* --- 左パネル (予約リスト) --- */
.panel-left {
  width: 350px;
  /* 固定幅に変更(または35%) */
  min-width: 300px;
  background: #ebecf0;
  border-right: 1px solid #ddd;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.3s ease, min-width 0.3s ease;
}

.panel-left.collapsed {
  width: 40px;
  min-width: 40px;
  align-items: center;
  cursor: pointer;
  background: #dcdde1;
}

.panel-left.collapsed:hover {
  background: #d0d1d6;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  height: 40px;
  /* 固定高さ */
  padding: 0 1rem;
  box-sizing: border-box;
  flex-shrink: 0;
  background-color: #ebecf0;
  border-bottom: 1px solid #ddd;
}

.panel-header h3 {
  margin: 0;
  font-size: 1rem;
  color: #333;
  white-space: nowrap;
}

.toggle-btn {
  background: transparent;
  border: none;
  font-size: 1rem;
  color: #666;
  cursor: pointer;
  padding: 0 5px;
}

.collapsed-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  height: 100%;
  width: 100%;
  padding-top: 0.5rem;
}

.vertical-text {
  writing-mode: vertical-rl;
  text-orientation: upright;
  font-weight: bold;
  color: #555;
  letter-spacing: 3px;
  margin-top: 0.5rem;
  white-space: nowrap;
  font-size: 0.9rem;
}

/* リスト部分のスクロールエリア */
.kanban-list-container {
  flex: 1;
  overflow-y: auto;
  /* 縦スクロール */
  padding: 1rem;
  box-sizing: border-box;
}

.kanban-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
}

.date-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.date-group-header {
  font-size: 0.85rem;
  font-weight: bold;
  color: #2c3e50;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.8));
  padding: 6px 8px;
  border-radius: 6px;
  border-left: 3px solid #3498db;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03);
}

.date-group-header.selected-group {
  background: linear-gradient(90deg, #eaf6ff, #ffffff);
  border-left-color: #2f86d7;
}

.load-more-btn {
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  background: #3498db;
  color: white;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
}

.load-more-btn:hover {
  opacity: 0.95
}

.no-data {
  text-align: center;
  color: #999;
  margin-top: 2rem;
  font-size: 0.9rem;
}

/* --- カード --- */
.kanban-card {
  background: white;
  padding: 0.6rem;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  display: flex;
  gap: 0.8rem;
  align-items: flex-start;
  border-left: 4px solid #ccc;
  transition: all 0.3s ease;
  width: 100%;
  position: relative;
  cursor: pointer;
  box-sizing: border-box;
}

.kanban-card:hover {
  transform: translateX(2px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.kanban-card.res-web {
  border-left-color: #3498db;
}

.kanban-card.res-phone {
  border-left-color: #e67e22;
}

.kanban-card.res-pending {
  border-left-color: #9b59b6;
  background-color: #fbfaff;
}

.status-icon-pending {
  color: #fff;
  background-color: #9b59b6;
  font-weight: bold;
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  margin-top: 4px;
  display: inline-block;
}

.time-box {
  min-width: 45px;
  border-right: 1px solid #eee;
  padding-right: 0.6rem;
  text-align: center;
  font-weight: bold;
  color: #333;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.time {
  font-size: 1rem;
}

.source-icon {
  font-size: 1rem;
  margin-top: 3px;
}

.details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  overflow: hidden;
}

.menu-title {
  font-weight: bold;
  font-size: 0.9rem;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.customer-info {
  font-size: 0.8rem;
  color: #444;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.icon {
  font-size: 0.7rem;
}

.staff-badge {
  font-size: 0.75rem;
  background: #e0e0e0;
  padding: 1px 6px;
  border-radius: 10px;
  display: inline-block;
  color: #555;
  align-self: flex-start;
  margin-top: 2px;
}

.note-preview {
  font-size: 0.75rem;
  color: #e67e22;
  font-weight: bold;
}

/* --- 右パネル --- */
.panel-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 内部スクロールのみ許可 */
  background: white;
  position: relative;
}

/* カレンダーバー */
.calendar-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem;
  background: #f9f9f9;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
  z-index: 20;
}

.current-date .date-text {
  font-size: 1.1rem;
  font-weight: bold;
  color: #333;
}

.date-nav-btn,
.today-btn {
  padding: 0.3rem 0.8rem;
  font-size: 0.85rem;
  border-radius: 4px;
  cursor: pointer;
}

.date-nav-btn {
  background: white;
  border: 1px solid #ccc;
}

.today-btn {
  background: #34495e;
  color: white;
  border: none;
}

.calendar-dropdown-wrapper {
  position: relative;
  cursor: pointer;
  padding: 0 1rem;
}

.mini-calendar-popup {
  display: none;
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
  padding: 10px;
  z-index: 30;
  width: 240px;
}

.calendar-dropdown-wrapper:hover .mini-calendar-popup {
  display: block;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.day-label {
  text-align: center;
  font-size: 0.7rem;
  color: #666;
}

.day-cell {
  text-align: center;
  font-size: 0.85rem;
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
}

.day-cell:hover {
  background: #eee;
}

.day-cell.is-holiday {
  background-color: #ffebee;
  color: #c0392b;
}

.day-cell.is-selected {
  background-color: #3498db;
  color: white;
  font-weight: bold;
}

.day-cell.empty {
  visibility: hidden;
}

/* タイムライン */
.timeline-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-x: auto;
  /* 横スクロール */
  overflow-y: hidden;
  /* 縦は中身でスクロール */
  position: relative;
}

.timeline-header {
  display: flex;
  height: 30px;
  background: #f9f9f9;
  border-bottom: 1px solid #ddd;
  flex-shrink: 0;
  min-width: 100%;
}

.staff-header-cell {
  width: 80px;
  flex-shrink: 0;
  border-right: 1px solid #ddd;
  position: sticky;
  left: 0;
  background: #f9f9f9;
  z-index: 10;
}

.time-scale {
  flex: 1;
  display: flex;
  min-width: 800px;
}

/* 最低幅確保 */
.time-label-cell {
  flex: 1;
  border-right: 1px solid transparent;
  font-size: 0.7rem;
  color: #666;
  padding-left: 2px;
  display: flex;
  align-items: center;
}

.timeline-body {
  flex: 1;
  overflow-y: auto;
  /* 縦スクロール */
  min-width: 100%;
}

.staff-row {
  display: flex;
  height: 60px;
  border-bottom: 2px solid #ccc;
  min-width: 800px;
}

.staff-cell {
  width: 80px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  background: #f9f9f9;
  border-right: 2px solid #bbb;
  font-size: 0.85rem;
  position: sticky;
  left: 0;
  z-index: 5;
}

.timeline-cell {
  flex: 1;
  position: relative;
  background: #fff;
  cursor: crosshair;
}

.grid-lines {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  pointer-events: none;
}

.grid-line {
  flex: 1;
  border-right: 1px solid #ddd;
  height: 100%;
}

.reservation-bar {
  position: absolute;
  top: 6px;
  bottom: 6px;
  border-radius: 3px;
  color: white;
  font-size: 0.7rem;
  padding: 2px 6px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition: all 0.2s;
  z-index: 1;
  opacity: 0.95;
}

.reservation-bar:hover {
  z-index: 10;
  opacity: 1;
  transform: scale(1.01);
}

.drag-preview-bar {
  position: absolute;
  top: 6px;
  bottom: 6px;
  background-color: rgba(52, 152, 219, 0.5);
  border: 2px dashed #3498db;
  border-radius: 3px;
  pointer-events: none;
  z-index: 5;
}

/* アニメーション */
.list-enter-active,
.list-leave-active {
  transition: all 0.5s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-10px);
  background-color: #fff3cd;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* モーダル共通 */
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
  padding: 1.5rem;
  border-radius: 8px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
}

.modal-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.modal-header-row h3 {
  margin: 0;
  font-size: 1.1rem;
}

.close-x-btn {
  background: transparent;
  border: none;
  font-size: 1.4rem;
  color: #999;
  cursor: pointer;
  line-height: 1;
  padding: 0;
}

.close-x-btn:hover {
  color: #333;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.form-group {
  margin-bottom: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.form-row {
  display: flex;
  gap: 0.8rem;
}

.form-row .form-group {
  flex: 1;
}

input,
select {
  padding: 0.4rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.95rem;
}

textarea {
  padding: 0.4rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.95rem;
  resize: none;
  min-height: 80px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 1.5rem;
}

.modal-actions.right-align {
  justify-content: flex-end;
}

.modal-actions.split {
  justify-content: space-between;
}

.save-btn {
  background: #42b883;
  color: white;
  border: none;
  padding: 0.5rem 1.5rem;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
}

.cancel-btn {
  background: #eee;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}

/* 詳細モーダル */
.detail-modal {
  max-width: 450px;
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.detail-row {
  border-bottom: 1px solid #f0f0f0;
  padding-bottom: 0.3rem;
  font-size: 0.9rem;
}

.detail-row .label {
  font-weight: bold;
  color: #666;
  display: inline-block;
  width: 70px;
}

.detail-note {
  background: #fff9e6;
  padding: 0.8rem;
  border-radius: 4px;
  border-left: 3px solid #f39c12;
  margin-top: 0.5rem;
}

.detail-note .label {
  font-weight: bold;
  color: #d35400;
  margin-bottom: 0.2rem;
  display: block;
  font-size: 0.8rem;
}

.note-content {
  white-space: pre-wrap;
  color: #333;
  font-size: 0.9rem;
}

.pending-alert {
  background: #f3e5f5;
  border: 1px solid #e1bee7;
  border-radius: 4px;
  padding: 0.8rem;
  margin-bottom: 0.8rem;
  text-align: center;
}

.approve-btn {
  background: #8e44ad;
  color: white;
  border: none;
  padding: 0.4rem 1.2rem;
  border-radius: 20px;
  font-weight: bold;
  cursor: pointer;
  margin-top: 0.5rem;
  display: inline-block;
  font-size: 0.9rem;
}

.delete-confirm-btn {
  background: #e74c3c;
  color: white;
  border: none;
  padding: 0.5rem 1.2rem;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
  font-size: 0.9rem;
}

.delete-confirm-btn:hover {
  background: #c0392b;
}

.edit-btn {
  background: #f39c12;
  color: white;
  border: none;
  padding: 0.5rem 1.2rem;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
  font-size: 0.9rem;
}

.edit-btn:hover {
  background: #e67e22;
}

.tag-phone {
  color: #e67e22;
  font-weight: bold;
}

.tag-web {
  color: #3498db;
  font-weight: bold;
}

.delete-modal {
  max-width: 350px;
  text-align: center;
}

.delete-msg {
  margin: 1.5rem 0;
  line-height: 1.5;
  color: #555;
  font-size: 0.9rem;
}

.delete-modal .modal-actions {
  gap: 0.5rem;
  justify-content: center;
}

@media (max-width: 768px) {
  .modal-body {
    flex-direction: column;
    gap: 0.5rem;
  }
}
</style>