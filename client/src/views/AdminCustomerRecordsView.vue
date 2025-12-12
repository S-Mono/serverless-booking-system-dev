<template>
  <div class="records-view">
    <div class="header">
      <button @click="goBack" class="btn-back">← 戻る</button>
      <div class="customer-info">
        <h1>📋 {{ customerName }} さんのカルテ</h1>
        <p v-if="customerPhone" class="phone">📞 {{ customerPhone }}</p>
      </div>
    </div>

    <div class="actions">
      <button @click="navigateToCreate" class="btn-create">
        ➕ カルテ作成
      </button>
    </div>

    <!-- ローディング -->
    <div v-if="recordStore.loading" class="loading">
      カルテを読み込んでいます...
    </div>

    <!-- カルテ一覧 -->
    <div v-else-if="recordStore.records.length > 0" class="records-list">
      <div 
        v-for="record in recordStore.records" 
        :key="record.id" 
        class="record-card"
        @click="showDetail(record)"
      >
        <div class="record-header">
          <span class="record-date">📅 {{ formatDate(record.recorded_at) }}</span>
          <span class="record-staff">👤 {{ getStaffName(record.created_by) }}</span>
        </div>
        <div class="record-content">
          <p class="treatment-preview">{{ truncateText(record.treatment_content, 60) }}</p>
          <div class="record-meta">
            <span v-if="record.photos.length > 0" class="photo-count">
              📷 {{ record.photos.length }}枚
            </span>
            <span v-if="record.updated_at" class="updated-badge">編集済</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 空の状態 -->
    <div v-else class="empty-state">
      <p>📋 まだカルテがありません</p>
      <p class="hint">「カルテ作成」ボタンから新しいカルテを作成できます</p>
    </div>

    <!-- 詳細モーダル -->
    <RecordDetailModal
      :is-open="showDetailModal"
      :record="selectedRecord!"
      :staff-list="staffList"
      @close="showDetailModal = false"
      @edit="navigateToEdit"
      @delete="handleDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRecordStore, type MedicalRecord } from '../stores/recordStore'
import { useDialogStore } from '../stores/dialog'
import { db } from '../lib/firebase'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import RecordDetailModal from '../components/RecordDetailModal.vue'
import type { Timestamp } from 'firebase/firestore'

const route = useRoute()
const router = useRouter()
const recordStore = useRecordStore()
const dialog = useDialogStore()

const customerId = route.params.customerId as string
const fromPage = route.query.from as string

const customerName = ref('')
const customerPhone = ref('')
const staffList = ref<Array<{ id: string; name: string }>>([])

const showDetailModal = ref(false)
const selectedRecord = ref<MedicalRecord | null>(null)

onMounted(async () => {
  try {
    // 顧客情報を取得
    const customerDoc = await getDoc(doc(db, 'customers', customerId))
    if (customerDoc.exists()) {
      const data = customerDoc.data()
      customerName.value = data.name_kana || '不明'
      customerPhone.value = data.phone_number || ''
    }

    // スタッフ一覧を取得
    const staffSnap = await getDocs(collection(db, 'staffs'))
    staffList.value = staffSnap.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name || '不明'
    }))

    // カルテを取得
    await recordStore.fetchRecordsByCustomer(customerId)
  } catch (error: any) {
    console.error('Failed to load data:', error)
    dialog.alert('データの読み込みに失敗しました: ' + error.message)
  }
})

// スタッフ名を取得
const getStaffName = (staffId: string) => {
  const staff = staffList.value.find(s => s.id === staffId)
  return staff?.name || '不明'
}

// 日時フォーマット
const formatDate = (timestamp: Timestamp) => {
  const date = timestamp.toDate()
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short'
  })
}

// テキストを切り詰め
const truncateText = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

// カルテ作成画面へ
const navigateToCreate = () => {
  router.push(`/admin/customer-records/${customerId}/edit`)
}

// カルテ詳細を表示
const showDetail = (record: MedicalRecord) => {
  selectedRecord.value = record
  showDetailModal.value = true
}

// カルテ編集画面へ
const navigateToEdit = (recordId: string) => {
  showDetailModal.value = false
  router.push(`/admin/customer-records/${customerId}/edit/${recordId}`)
}

// カルテ削除
const handleDelete = async (recordId: string) => {
  const confirmed = await dialog.confirm('このカルテを削除しますか？\nこの操作は取り消せません。')
  if (!confirmed) return

  try {
    await recordStore.deleteRecord(customerId, recordId)
    showDetailModal.value = false
    dialog.alert('カルテを削除しました')
  } catch (error: any) {
    console.error('Failed to delete record:', error)
    dialog.alert('削除に失敗しました: ' + error.message)
  }
}

// 戻る
const goBack = () => {
  if (fromPage === 'reservations') {
    router.push('/admin')
  } else if (fromPage === 'customers') {
    router.push('/admin/customers')
  } else {
    router.back()
  }
}
</script>

<style scoped>
.records-view {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.btn-back {
  background: #f0f0f0;
  border: none;
  padding: 10px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 15px;
  transition: background 0.2s;
}

.btn-back:hover {
  background: #e0e0e0;
}

.customer-info {
  flex: 1;
}

.customer-info h1 {
  margin: 0 0 5px 0;
  font-size: 22px;
  color: #333;
}

.phone {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.actions {
  margin-bottom: 20px;
  text-align: right;
}

.btn-create {
  background: #4CAF50;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  transition: background 0.2s;
}

.btn-create:hover {
  background: #45a049;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #666;
  font-size: 16px;
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.record-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.record-card:hover {
  border-color: #4CAF50;
  box-shadow: 0 3px 8px rgba(0,0,0,0.1);
  transform: translateY(-2px);
}

.record-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.record-date {
  font-weight: bold;
  color: #333;
  font-size: 15px;
}

.record-staff {
  color: #666;
  font-size: 14px;
}

.record-content {
  color: #555;
}

.treatment-preview {
  margin: 0 0 10px 0;
  line-height: 1.5;
  font-size: 14px;
}

.record-meta {
  display: flex;
  gap: 12px;
  font-size: 13px;
}

.photo-count {
  color: #4CAF50;
  font-weight: bold;
}

.updated-badge {
  background: #FFC107;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #999;
}

.empty-state p {
  margin: 10px 0;
  font-size: 16px;
}

.hint {
  font-size: 14px;
  color: #bbb;
}

@media (max-width: 768px) {
  .records-view {
    padding: 15px;
  }

  .header {
    flex-direction: column;
    align-items: flex-start;
  }

  .customer-info h1 {
    font-size: 20px;
  }

  .actions {
    text-align: center;
    width: 100%;
  }

  .btn-create {
    width: 100%;
  }
}
</style>
