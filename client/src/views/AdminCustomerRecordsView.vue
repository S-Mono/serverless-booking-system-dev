<template>
  <div class="admin-container">
    <header class="admin-header">
      <div class="header-left">
        <button @click="router.push('/admin')" class="back-btn">◀ ダッシュボード</button>
        <button @click="router.push('/admin/customers')" class="back-btn">👥 顧客管理</button>
        <h2>📋 {{ customerName }} さんのカルテ</h2>
      </div>
      <div class="header-right">
        <div class="customer-phone" v-if="customerPhone">📞 {{ customerPhone }}</div>
      </div>
    </header>

    <main class="admin-body">
      <div class="content-wrapper">
        <div class="action-bar">
          <button @click="navigateToCreate" class="add-btn">
            ➕ カルテ作成
          </button>
        </div>

        <!-- ローディング -->
        <div v-if="recordStore.loading" class="loading">
          カルテを読み込んでいます...
        </div>

        <!-- カルテ一覧 -->
        <div v-else-if="recordStore.records.length > 0" class="records-list">
          <div v-for="record in recordStore.records" :key="record.id" class="record-card" @click="showDetail(record)">
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
      </div>
    </main>

    <!-- 詳細モーダル -->
    <RecordDetailModal v-if="showDetailModal && selectedRecord" :is-open="showDetailModal" :record="selectedRecord"
      :staff-list="staffList" @close="showDetailModal = false" @edit="navigateToEdit" @delete="handleDelete" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRecordStore, type MedicalRecord } from '../stores/recordStore'
import { useDialogStore } from '../stores/dialog'
import { db, auth } from '../lib/firebase'
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

    // デバッグ: スタッフ一覧を表示
    console.log('👥 スタッフ一覧:', staffList.value)

    // staffsコレクションが空の場合、現在のログインユーザーをスタッフとして追加
    const currentUser = auth.currentUser
    if (staffList.value.length === 0 && currentUser) {
      console.log('⚠️ staffsコレクションが空です。現在のユーザーを追加します。')
      // 現在のユーザーのメールアドレスを名前として使用
      const displayName = currentUser.email?.split('@')[0] || 'Admin'
      staffList.value.push({
        id: currentUser.uid,
        name: displayName
      })
    } else if (currentUser) {
      // 現在のユーザーがstaffListに存在しない場合は追加
      const exists = staffList.value.find(s => s.id === currentUser.uid)
      if (!exists) {
        const displayName = currentUser.email?.split('@')[0] || 'Admin'
        staffList.value.push({
          id: currentUser.uid,
          name: displayName
        })
        console.log('➕ 現在のユーザーをスタッフリストに追加:', { id: currentUser.uid, name: displayName })
      }
    }

    // カルテを取得
    await recordStore.fetchRecordsByCustomer(customerId)

    // デバッグ: カルテのcreated_byを表示
    if (recordStore.records.length > 0 && recordStore.records[0]) {
      console.log('📋 カルテのcreated_by:', recordStore.records[0].created_by)
    }

    // カルテ取得後、各カルテのサムネイルを非同期で更新
    // （Cloud Functionsで生成されたサムネイルがあれば更新）
    setTimeout(() => {
      if (recordStore.updateThumbnailsAsync) {
        recordStore.records.forEach(record => {
          if (record?.id) {
            try {
              recordStore.updateThumbnailsAsync(record.id)
            } catch (e) {
              console.error('サムネイル更新エラー:', e)
            }
          }
        })
      }
    }, 2000) // 2秒後に実行
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
</script>

<style scoped>
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

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.back-btn {
  background: transparent;
  border: 1px solid #fff;
  color: #fff;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background 0.2s;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.customer-phone {
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.9rem;
  padding: 0.4rem 0.8rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
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
  justify-content: flex-end;
  margin-bottom: 1.5rem;
}

.add-btn {
  background: #27ae60;
  color: white;
  border: none;
  padding: 0.6rem 1.2rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.95rem;
  transition: background 0.2s;
}

.add-btn:hover {
  background: #229954;
}

.loading {
  text-align: center;
  padding: 60px 20px;
  color: #666;
  font-size: 16px;
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

.empty-state .hint {
  font-size: 14px;
  color: #bbb;
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
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.record-card:hover {
  border-color: #4CAF50;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.1);
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
