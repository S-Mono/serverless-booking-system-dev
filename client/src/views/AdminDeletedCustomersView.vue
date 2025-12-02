<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '../lib/firebase'
import { collection, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore'
import { useDialogStore } from '../stores/dialog'

const dialog = useDialogStore()
const router = useRouter()

interface Customer {
    id: string
    name_kana: string
    phone_number: string
    deleted_at: Timestamp
}

const deletedCustomers = ref<Customer[]>([])
const loading = ref(true)

const fetchDeletedCustomers = async () => {
    loading.value = true
    try {
        const snap = await getDocs(collection(db, 'customers'))
        deletedCustomers.value = snap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter((c: any) => c.deleted_at) // 👈 削除されたものだけ
            .sort((a: any, b: any) => b.deleted_at.seconds - a.deleted_at.seconds) as Customer[] // 削除日順
    } catch (e) {
        console.error(e)
    } finally {
        loading.value = false
    }
}

// ♻️ 復元処理
const restoreCustomer = async (id: string) => {
    const ok = await dialog.confirm('この顧客データを復元しますか？')
    if (!ok) return

    try {
        await updateDoc(doc(db, 'customers', id), {
            deleted_at: null // 論理削除解除
        })
        dialog.alert('復元しました')
        fetchDeletedCustomers()
    } catch (e) {
        dialog.alert('復元に失敗しました')
    }
}

const goBack = () => router.push('/admin/customers')

const formatDate = (ts: Timestamp) => {
    if (!ts) return ''
    const d = ts.toDate()
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(() => { fetchDeletedCustomers() })
</script>

<template>
    <div class="admin-container">
        <header class="admin-header trash-header">
            <button @click="goBack" class="back-btn">◀ 顧客一覧に戻る</button>
            <h2>🗑️ 顧客ゴミ箱</h2>
        </header>

        <main class="admin-body">
            <div class="content-wrapper">

                <div v-if="loading" class="loading">Loading...</div>

                <div v-else class="table-container">
                    <table class="customer-table">
                        <thead>
                            <tr>
                                <th>お名前 (カナ)</th>
                                <th>電話番号</th>
                                <th>削除日時</th>
                                <th class="actions-col">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="cust in deletedCustomers" :key="cust.id">
                                <td class="name-cell">{{ cust.name_kana }}</td>
                                <td>{{ cust.phone_number }}</td>
                                <td class="date-cell">{{ formatDate(cust.deleted_at) }}</td>
                                <td class="actions-cell">
                                    <button @click="restoreCustomer(cust.id)" class="restore-btn">♻️ 復元</button>
                                </td>
                            </tr>
                            <tr v-if="deletedCustomers.length === 0">
                                <td colspan="4" class="no-data">ゴミ箱は空です</td>
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

/* ゴミ箱画面はヘッダー色を変えて分かりやすく */
.trash-header {
    background: #7f8c8d;
    color: white;
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-shrink: 0;
}

.trash-header h2 {
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
    color: #555;
    text-decoration: line-through;
    /* 削除済みっぽく */
}

.date-cell {
    color: #999;
    font-size: 0.9rem;
}

.no-data {
    text-align: center;
    color: #999;
    padding: 2rem;
}

.restore-btn {
    background: #27ae60;
    color: white;
    border: none;
    padding: 0.4rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
}

.restore-btn:hover {
    background: #219150;
}

.loading {
    text-align: center;
    color: #666;
    margin-top: 2rem;
}
</style>