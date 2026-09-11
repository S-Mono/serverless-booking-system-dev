<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '../lib/firebase'
import { collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore'
import { useDialogStore } from '../stores/dialog'

const dialog = useDialogStore()
const router = useRouter()

interface IncomingCall {
    id: string
    phoneNumber: string
    createdAt: Timestamp
}

interface CustomerLite {
    id: string
    name_kanji?: string
    name_kana?: string
    phoneClean: string
}

const calls = ref<IncomingCall[]>([])
const customers = ref<CustomerLite[]>([])
const loading = ref(true)

// 既定の表示期間: 直近2週間
const formatInputDate = (d: Date): string => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

const today = new Date()
const twoWeeksAgo = new Date()
twoWeeksAgo.setDate(today.getDate() - 14)

const startDate = ref(formatInputDate(twoWeeksAgo))
const endDate = ref(formatInputDate(today))
const phoneQuery = ref('')

// 電話番号の正規化（数字のみ）
const cleanPhone = (num: string) => (num || '').replace(/\D/g, '')

// 顧客を一度だけ取得してメモリ上に保持（各行での個別照合を避ける）
const fetchCustomers = async () => {
    const snap = await getDocs(collection(db, 'customers'))
    customers.value = snap.docs.map(doc => {
        const data = doc.data()
        return {
            id: doc.id,
            name_kanji: data.name_kanji || '',
            name_kana: data.name_kana || '',
            phoneClean: cleanPhone(data.phone_number || data.phoneNumber || '')
        }
    })
}

const fetchCalls = async () => {
    loading.value = true
    try {
        // 終了日は当日いっぱい（翌日0時未満）まで含める
        const start = new Date(startDate.value + 'T00:00:00')
        const end = new Date(endDate.value + 'T00:00:00')
        end.setDate(end.getDate() + 1)

        const q = query(
            collection(db, 'incoming_calls'),
            where('createdAt', '>=', Timestamp.fromDate(start)),
            where('createdAt', '<', Timestamp.fromDate(end)),
            orderBy('createdAt', 'desc')
        )

        const snap = await getDocs(q)
        calls.value = snap.docs.map(doc => {
            const data = doc.data()
            return {
                id: doc.id,
                phoneNumber: data.phoneNumber || '',
                createdAt: data.createdAt as Timestamp
            }
        })
    } catch (e) {
        console.error('着信履歴の取得エラー:', e)
        dialog.alert('着信履歴の取得に失敗しました', 'エラー')
    } finally {
        loading.value = false
    }
}

// 電話番号検索（ハイフン有無を吸収した部分一致）
const filteredCalls = computed(() => {
    const q = cleanPhone(phoneQuery.value)
    if (!q) return calls.value
    return calls.value.filter(c => cleanPhone(c.phoneNumber).includes(q))
})

// 電話番号から顧客を照合
const findCustomer = (rawPhone: string): CustomerLite | null => {
    const target = cleanPhone(rawPhone)
    if (!target) return null
    return customers.value.find(c => c.phoneClean === target) || null
}

const formatDateTime = (ts: Timestamp) => {
    if (!ts) return ''
    const d = ts.toDate()
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

const formatPhone = (num: string) => num || '-'

// 予約作成画面へ（既存の着信クエリ導線を流用）
const createReservation = (call: IncomingCall) => {
    const customer = findCustomer(call.phoneNumber)
    router.push({
        path: '/admin',
        query: {
            phone: call.phoneNumber,
            ...(customer ? { customerId: customer.id, customerName: customer.name_kana || customer.name_kanji || '' } : {})
        }
    })
}

const applyFilter = () => { fetchCalls() }
const goBack = () => router.push('/admin')

onMounted(async () => {
    await fetchCustomers()
    await fetchCalls()
})
</script>

<template>
    <div class="admin-container">
        <header class="admin-header">
            <button @click="goBack" class="back-btn">◀ 管理画面に戻る</button>
            <h2>📞 着信履歴</h2>
        </header>

        <main class="admin-body">
            <div class="content-wrapper">

                <!-- フィルタバー -->
                <div class="filter-bar">
                    <div class="filter-group">
                        <label>期間</label>
                        <input type="date" v-model="startDate" />
                        <span class="date-sep">〜</span>
                        <input type="date" v-model="endDate" />
                    </div>
                    <div class="filter-group">
                        <label>電話番号</label>
                        <input type="text" v-model="phoneQuery" placeholder="例: 09012345678" />
                    </div>
                    <button @click="applyFilter" class="apply-btn">🔍 絞り込み</button>
                </div>
                <p class="filter-note">※初期表示は直近2週間です。期間変更後は「絞り込み」を押してください。</p>

                <div v-if="loading" class="loading">Loading...</div>

                <div v-else class="table-container">
                    <table class="customer-table">
                        <thead>
                            <tr>
                                <th>着信日時</th>
                                <th>電話番号</th>
                                <th>お名前 (漢字)</th>
                                <th>お名前 (カナ)</th>
                                <th class="actions-col">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="call in filteredCalls" :key="call.id">
                                <td class="date-cell">{{ formatDateTime(call.createdAt) }}</td>
                                <td>{{ formatPhone(call.phoneNumber) }}</td>
                                <td class="name-cell">{{ findCustomer(call.phoneNumber)?.name_kanji || '-' }}</td>
                                <td class="name-cell">{{ findCustomer(call.phoneNumber)?.name_kana || '未登録' }}</td>
                                <td class="actions-cell">
                                    <button @click="createReservation(call)" class="reserve-btn">📝 予約作成</button>
                                </td>
                            </tr>
                            <tr v-if="filteredCalls.length === 0">
                                <td colspan="5" class="no-data">着信履歴がありません</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    </div>
</template>

<style scoped>
.admin-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: #f4f5f7;
    overflow: hidden;
}

.admin-header {
    background: #34495e;
    color: white;
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-shrink: 0;
}

.admin-header h2 {
    margin: 0;
    font-size: 1.2rem;
}

.back-btn {
    background: transparent;
    border: 1px solid #fff;
    color: #fff;
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    cursor: pointer;
}

.admin-body {
    flex: 1;
    overflow-y: auto;
    padding: 2rem;
    box-sizing: border-box;
}

.content-wrapper {
    max-width: 1000px;
    margin: 0 auto;
}

.filter-bar {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
}

.filter-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.filter-group label {
    font-size: 0.9rem;
    color: #555;
    font-weight: bold;
    white-space: nowrap;
}

.filter-group input {
    padding: 0.4rem 0.6rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.9rem;
}

.date-sep {
    color: #888;
}

.apply-btn {
    background: #3498db;
    color: #fff;
    border: none;
    padding: 0.5rem 1.2rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
}

.apply-btn:hover {
    background: #2980b9;
}

.filter-note {
    font-size: 0.8rem;
    color: #888;
    margin: 0 0 1rem 0.2rem;
}

.table-container {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    overflow-x: auto;
}

.customer-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 600px;
}

.customer-table th,
.customer-table td {
    padding: 1rem;
    text-align: left;
    border-bottom: 1px solid #eee;
}

.customer-table th {
    background: #f8f9fa;
    color: #555;
    font-size: 0.9rem;
    white-space: nowrap;
}

.date-cell {
    white-space: nowrap;
}

.name-cell {
    font-weight: bold;
}

.no-data {
    text-align: center;
    color: #999;
    padding: 2rem;
}

.actions-col {
    width: 120px;
}

.actions-cell {
    white-space: nowrap;
}

.reserve-btn {
    background: #27ae60;
    color: #fff;
    border: none;
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    cursor: pointer;
}

.reserve-btn:hover {
    background: #229954;
}

.loading {
    text-align: center;
    padding: 2rem;
    color: #888;
}
</style>
