<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '../lib/firebase'
import { collection, getDocs, doc, updateDoc, deleteDoc, writeBatch, Timestamp } from 'firebase/firestore'
import { useDialogStore } from '../stores/dialog'

const dialog = useDialogStore()
const router = useRouter()

interface Customer {
    id: string
    name_kana: string
    name_kanji?: string
    phone_number: string
    deleted_at: Timestamp
}

const deletedCustomers = ref<Customer[]>([])
const loading = ref(true)

// 選択された顧客IDの配列
const selectedIds = ref<string[]>([])

// 全選択チェックボックスの状態（削除済み一覧の全件に対して全選択/全解除）
const selectAll = computed({
  get: () => {
    return deletedCustomers.value.length > 0 &&
           deletedCustomers.value.every(cust => selectedIds.value.includes(cust.id))
  },
  set: (value: boolean) => {
    if (value) {
      selectedIds.value = deletedCustomers.value.map(cust => cust.id)
    } else {
      selectedIds.value = []
    }
  }
})

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

// 🗑️ 完全削除（個別）
const deleteCustomerPermanently = async (id: string) => {
    const ok = await dialog.confirm(
        'この顧客を完全に削除しますか？\nこの操作は元に戻せません。',
        '完全削除の確認',
        'danger'
    )
    if (!ok) return

    try {
        await deleteDoc(doc(db, 'customers', id))
        selectedIds.value = selectedIds.value.filter(sid => sid !== id)
        dialog.alert('完全に削除しました')
        fetchDeletedCustomers()
    } catch (e) {
        console.error('完全削除エラー:', e)
        dialog.alert('完全削除に失敗しました')
    }
}

// 🗑️ 完全削除（一括）
const deleteSelectedPermanently = async () => {
    if (selectedIds.value.length === 0) return

    const ok = await dialog.confirm(
        `選択した ${selectedIds.value.length} 件の顧客を完全に削除しますか？\nこの操作は元に戻せません。`,
        '一括完全削除の確認',
        'danger'
    )
    if (!ok) return

    try {
        const batch = writeBatch(db)
        for (const id of selectedIds.value) {
            batch.delete(doc(db, 'customers', id))
        }
        await batch.commit()

        selectedIds.value = []
        await fetchDeletedCustomers()
        dialog.alert('選択した顧客を完全に削除しました')
    } catch (e) {
        console.error('一括完全削除エラー:', e)
        dialog.alert('一括完全削除に失敗しました')
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
            <h2>� 削除済み顧客</h2>
        </header>

        <main class="admin-body">
            <div class="content-wrapper">

                <!-- 👇 追加: 選択中のみ表示される一括完全削除UI -->
                <div class="action-bar" v-if="selectedIds.length > 0">
                    <div class="bulk-actions">
                        <span class="selected-count">{{ selectedIds.length }}件選択中</span>
                        <button @click="deleteSelectedPermanently" class="bulk-delete-btn">
                            🗑️ 選択した顧客を一括完全削除
                        </button>
                    </div>
                </div>

                <div v-if="loading" class="loading">Loading...</div>

                <div v-else class="table-container">
                    <table class="customer-table">
                        <thead>
                            <tr>
                                <!-- 👇 全選択チェックボックス -->
                                <th style="width: 40px; text-align: center;">
                                    <input type="checkbox" v-model="selectAll" />
                                </th>
                                <th>お名前 (漢字)</th>
                                <th>お名前 (カナ)</th>
                                <th>電話番号</th>
                                <th>削除日時</th>
                                <th class="actions-col">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="cust in deletedCustomers" :key="cust.id" :class="{ 'row-selected': selectedIds.includes(cust.id) }">
                                <!-- 👇 個別選択チェックボックス -->
                                <td style="text-align: center;">
                                    <input type="checkbox" :value="cust.id" v-model="selectedIds" />
                                </td>
                                <td class="name-cell">{{ cust.name_kanji || '-' }}</td>
                                <td class="name-cell">{{ cust.name_kana }}</td>
                                <td>{{ cust.phone_number }}</td>
                                <td class="date-cell">{{ formatDate(cust.deleted_at) }}</td>
                                <td class="actions-cell">
                                    <button @click="restoreCustomer(cust.id)" class="restore-btn">♻️ 復元</button>
                                    <button @click="deleteCustomerPermanently(cust.id)" class="delete-btn">🗑️ 完全削除</button>
                                </td>
                            </tr>
                            <tr v-if="deletedCustomers.length === 0">
                                <td colspan="6" class="no-data">削除済みの顧客はありません</td>
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

/* 削除済み顧客画面はヘッダー色を変えて分かりやすく */
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

/* 一括選択・一括完全削除UI */
.action-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
}

.bulk-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: #fff5f5;
    padding: 0.3rem 0.8rem;
    border-radius: 6px;
    border: 1px solid #feb2b2;
}

.selected-count {
    font-size: 0.85rem;
    font-weight: bold;
    color: #c53030;
}

.bulk-delete-btn {
    background: #e53e3e;
    color: white;
    border: none;
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: bold;
    cursor: pointer;
}

.bulk-delete-btn:hover {
    background: #c53030;
}

/* 選択された行の背景色ハイライト */
.row-selected {
    background-color: #ebf8ff !important;
}

/* チェックボックスの見た目調整 */
.customer-table input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
}

/* 個別完全削除ボタン */
.delete-btn {
    background: #e53e3e;
    color: white;
    border: none;
    padding: 0.4rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    margin-left: 0.5rem;
}

.delete-btn:hover {
    background: #c53030;
}
</style>