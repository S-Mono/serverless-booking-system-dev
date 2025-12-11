<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router' // 👈 useRoute 追加
import { db } from '../lib/firebase'
import { collection, getDocs, doc, query, where, orderBy, Timestamp, addDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { useDialogStore } from '../stores/dialog'

const dialog = useDialogStore()
const router = useRouter()
const route = useRoute() // 👈 追加

interface Customer {
    id: string
    name_kana: string
    phone_number: string
    memo?: string
    preferred_category?: 'barber' | 'beauty'
    // true => 既存顧客, false => 新規顧客
    is_existing_customer?: boolean
    deleted_at?: Timestamp | null
}

interface ReservationHistory {
    id: string
    start_at: Timestamp
    menu_items: { title: string; price: number }[]
    status: string
}

const customers = ref<Customer[]>([])
const filteredCustomers = ref<Customer[]>([])
const loading = ref(true)
const searchQuery = ref('')

const showModal = ref(false)
const isEditing = ref(false)
const editForm = ref<Customer>({ id: '', name_kana: '', phone_number: '', memo: '', preferred_category: 'barber', is_existing_customer: true })
const history = ref<ReservationHistory[]>([])

const fetchCustomers = async () => {
    loading.value = true
    try {
        const snap = await getDocs(collection(db, 'customers'))
        customers.value = snap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter((c: any) => !c.deleted_at)
            .sort((a: any, b: any) => (a.name_kana || '').localeCompare(b.name_kana || '')) as Customer[]

        filterCustomers()

        // 🟢 クエリパラメータがあれば、その顧客のモーダルを開く (NEW)
        const openId = route.query.open_id as string
        if (openId) {
            const target = customers.value.find(c => c.id === openId)
            if (target) {
                openEditModal(target)
                // 開いた後はURLを綺麗にする（リロード時の再発防止）
                router.replace('/admin/customers')
            }
        }

    } catch (e) {
        console.error(e)
        dialog.alert('読み込みエラー')
    } finally {
        loading.value = false
    }
}

const filterCustomers = () => {
    const q = searchQuery.value.trim()
    if (!q) {
        filteredCustomers.value = customers.value
    } else {
        filteredCustomers.value = customers.value.filter(c =>
            (c.name_kana && c.name_kana.includes(q)) ||
            (c.phone_number && c.phone_number.includes(q))
        )
    }
}

const fetchHistory = async (customerId: string) => {
    try {
        const q = query(collection(db, 'reservations'), where('customer_id', '==', customerId))
        const snap = await getDocs(q)
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ReservationHistory[]
        history.value = list.sort((a, b) => b.start_at.seconds - a.start_at.seconds)
    } catch (e) { console.error(e) }
}

const openEditModal = async (customer?: Customer) => {
    if (customer) {
        isEditing.value = true
        editForm.value = JSON.parse(JSON.stringify(customer))
        // 編集時、is_existing_customer が存在しないケースに備えてデフォルトを付与
        if (typeof editForm.value.is_existing_customer === 'undefined') editForm.value.is_existing_customer = true
        if (!editForm.value.preferred_category) editForm.value.preferred_category = 'barber'
        await fetchHistory(customer.id)
    } else {
        isEditing.value = false
        editForm.value = { id: '', name_kana: '', phone_number: '', memo: '', preferred_category: 'barber' }
        history.value = []
    }
    showModal.value = true
}

const saveCustomer = async () => {
    if (!editForm.value.name_kana) return dialog.alert('名前（カナ）は必須です')
    try {
        if (isEditing.value) {
            await updateDoc(doc(db, 'customers', editForm.value.id), {
                name_kana: editForm.value.name_kana,
                phone_number: editForm.value.phone_number,
                memo: editForm.value.memo || '',
                preferred_category: editForm.value.preferred_category,
                is_existing_customer: editForm.value.is_existing_customer ?? true
            })
        } else {
            await addDoc(collection(db, 'customers'), {
                ...editForm.value,
                created_at: Timestamp.now(),
                // 作成時はフォームの選択に従う
                is_existing_customer: editForm.value.is_existing_customer ?? true,
                deleted_at: null
            })
        }
        dialog.alert('保存しました')
        showModal.value = false
        fetchCustomers()
    } catch (e) { console.error(e); dialog.alert('保存失敗') }
}

const deleteCustomer = async (id: string) => {
    const ok = await dialog.confirm('この顧客を削除済みに移動しますか？', '削除確認', 'danger')
    if (!ok) return
    try {
        await updateDoc(doc(db, 'customers', id), { deleted_at: Timestamp.now() })
        dialog.alert('削除済みに移動しました')
        fetchCustomers()
    } catch (e) { dialog.alert('削除失敗') }
}

const goBack = () => router.push('/admin')
const goToTrash = () => router.push('/admin/customers/trash')

const formatDate = (ts: Timestamp) => {
    if (!ts) return ''
    const d = ts.toDate()
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 🟢 ステータス表示ロジック (NEW)
const getStatusLabel = (h: ReservationHistory) => {
    const now = new Date()
    const start = h.start_at.toDate()

    // 過去の日時なら「済」
    if (start < now) return '済'

    // 未来ならステータスで分岐
    if (h.status === 'pending') return '仮'
    return '確'
}

const getStatusClass = (h: ReservationHistory) => {
    const label = getStatusLabel(h)
    if (label === '済') return 'status-done'
    if (label === '仮') return 'status-pending'
    return 'status-confirmed'
}

onMounted(() => { fetchCustomers() })
</script>

<template>
    <div class="admin-container">
        <header class="admin-header">
            <div class="header-left">
                <button @click="goBack" class="back-btn">◀ ダッシュボード</button>
            </div>
            <h2>顧客管理</h2>
            <div class="header-right">
                <button @click="goToTrash" class="trash-link-btn">� 削除済み顧客を見る</button>
            </div>
        </header>

        <main class="admin-body">
            <div class="content-wrapper">
                <div class="action-bar">
                    <div class="search-box">
                        <input type="text" v-model="searchQuery" @input="filterCustomers"
                            placeholder="名前(カナ) または 電話番号で検索..." />
                    </div>
                    <button @click="openEditModal()" class="add-btn">＋ 顧客登録</button>
                </div>

                <div class="table-container">
                    <table class="customer-table">
                        <thead>
                            <tr>
                                <th>お名前 (カナ)</th>
                                <th>電話番号</th>
                                <th>種別</th>
                                <th>よく利用する</th>
                                <th>メモ</th>
                                <th class="actions-col">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="cust in filteredCustomers" :key="cust.id">
                                <td class="name-cell">{{ cust.name_kana }}</td>
                                <td>{{ cust.phone_number }}</td>
                                <td>{{ cust.is_existing_customer ? '既存' : '新規' }}</td>
                                <td>{{ cust.preferred_category === 'beauty' ? '美容' : '理容' }}</td>
                                <td class="memo-cell">{{ cust.memo }}</td>
                                <td class="actions-cell">
                                    <button @click="openEditModal(cust)" class="edit-btn">詳細・履歴</button>
                                    <button @click="deleteCustomer(cust.id)" class="delete-btn">削除</button>
                                </td>
                            </tr>
                            <tr v-if="filteredCustomers.length === 0">
                                <td colspan="5" class="no-data">データが見つかりません</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </main>

        <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
            <div class="modal-content">
                <div class="modal-header-row">
                    <h3>{{ isEditing ? '顧客詳細・編集' : '新規顧客登録' }}</h3>
                    <button class="close-x-btn" @click="showModal = false">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-section">
                        <div class="form-row">
                            <div class="form-group">
                                <label>お名前 (カナ) <span class="req">*</span></label>
                                <input type="text" v-model="editForm.name_kana" placeholder="ヤマダ タロウ" />
                            </div>
                            <div class="form-group">
                                <label>電話番号</label>
                                <input type="tel" v-model="editForm.phone_number" placeholder="09012345678" />
                            </div>
                        </div>
                        <div class="form-group">
                            <label>よく利用するメニュー</label>
                            <div class="radio-group">
                                <label><input type="radio" value="barber" v-model="editForm.preferred_category">
                                    理容</label>
                                <label><input type="radio" value="beauty" v-model="editForm.preferred_category">
                                    美容</label>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>顧客タイプ</label>
                            <div class="radio-group">
                                <label><input type="radio" :value="true" v-model="editForm.is_existing_customer">
                                    既存顧客</label>
                                <label><input type="radio" :value="false" v-model="editForm.is_existing_customer">
                                    新規顧客</label>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>顧客メモ</label>
                            <textarea v-model="editForm.memo" placeholder="特記事項など"></textarea>
                        </div>
                        <div class="modal-actions">
                            <button @click="saveCustomer" class="save-btn">保存する</button>
                        </div>
                    </div>
                    <div v-if="isEditing" class="history-section">
                        <h4>予約履歴</h4>
                        <div class="history-list-container">
                            <ul v-if="history.length > 0" class="history-list">
                                <li v-for="h in history" :key="h.id" class="history-item">
                                    <span class="h-date">{{ formatDate(h.start_at) }}</span>
                                    <span class="h-menu">{{ h.menu_items[0]?.title }}</span>
                                    <span class="h-status" :class="getStatusClass(h)">
                                        {{ getStatusLabel(h) }}
                                    </span>
                                </li>
                            </ul>
                            <p v-else class="no-history">履歴はありません</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* CSSは既存のものをベースに、ステータス色を追加 */
.admin-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: #f4f5f7;
    overflow: hidden;
}

.admin-header {
    background: #2c3e50;
    color: white;
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
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

.trash-link-btn {
    background: rgba(231, 76, 60, 0.2);
    color: #ffcccc;
    border: 1px solid rgba(231, 76, 60, 0.5);
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background 0.2s;
}

.trash-link-btn:hover {
    background: rgba(231, 76, 60, 0.4);
    color: white;
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

.action-bar {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 1rem;
}

.search-box input {
    padding: 0.6rem;
    width: 300px;
    border: 1px solid #ccc;
    border-radius: 4px;
}

.add-btn {
    background: #27ae60;
    color: white;
    border: none;
    padding: 0.6rem 1.5rem;
    border-radius: 4px;
    font-weight: bold;
    cursor: pointer;
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
    font-weight: bold;
}

.name-cell {
    font-weight: bold;
    color: #2c3e50;
}

.memo-cell {
    color: #777;
    font-size: 0.9rem;
    max-width: 200px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.actions-cell {
    white-space: nowrap;
}

.no-data {
    text-align: center;
    color: #999;
    padding: 2rem;
}

.edit-btn {
    background: #3498db;
    color: white;
    border: none;
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    cursor: pointer;
    margin-right: 0.5rem;
    font-size: 0.85rem;
}

.delete-btn {
    background: #e74c3c;
    color: white;
    border: none;
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
}

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
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}

.modal-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    border-bottom: 1px solid #eee;
    padding-bottom: 0.5rem;
}

.modal-header-row h3 {
    margin: 0;
    font-size: 1.2rem;
    color: #333;
}

.close-x-btn {
    background: transparent;
    border: none;
    font-size: 1.5rem;
    color: #999;
    cursor: pointer;
    padding: 0;
    line-height: 1;
}

.modal-body {
    display: flex;
    flex-direction: column;
    gap: 2rem;
}

.form-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.form-row {
    display: flex;
    gap: 1rem;
}

.form-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
}

label {
    font-weight: bold;
    font-size: 0.9rem;
    color: #555;
}

.req {
    color: #e74c3c;
}

input,
textarea {
    padding: 0.6rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
}

textarea {
    resize: vertical;
    min-height: 80px;
}

.modal-actions {
    text-align: right;
    margin-top: 0.5rem;
}

.save-btn {
    background: #3498db;
    color: white;
    border: none;
    padding: 0.6rem 2rem;
    border-radius: 4px;
    font-weight: bold;
    cursor: pointer;
}

.radio-group {
    display: flex;
    gap: 1.5rem;
}

.radio-group label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: normal;
    cursor: pointer;
}

.history-section {
    background: #fcfcfc;
    padding: 1rem;
    border-radius: 6px;
    border: 1px solid #eee;
}

.history-section h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    color: #555;
    border-bottom: 2px solid #ddd;
    padding-bottom: 0.3rem;
}

.history-list-container {
    max-height: 200px;
    overflow-y: auto;
}

.history-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.history-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px dashed #eee;
    font-size: 0.9rem;
}

.h-date {
    font-weight: bold;
    color: #333;
}

.h-menu {
    color: #555;
}

.h-status {
    font-size: 0.8rem;
    padding: 2px 6px;
    border-radius: 4px;
    color: white;
}

/* 👇 ステータス色分け */
.status-confirmed {
    background: #27ae60;
}

/* 確: 緑 */
.status-pending {
    background: #9b59b6;
}

/* 仮: 紫 */
.status-done {
    background: #7f8c8d;
}

/* 済: グレー */

.no-history {
    color: #999;
    font-size: 0.9rem;
    text-align: center;
    padding: 1rem;
}

@media (max-width: 600px) {
    .form-row {
        flex-direction: column;
        gap: 1rem;
    }

    .table-container {
        padding-bottom: 1rem;
    }
}
</style>