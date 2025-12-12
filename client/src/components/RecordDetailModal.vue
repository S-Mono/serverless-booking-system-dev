<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h2>📋 カルテ詳細</h2>
        <button @click="close" type="button" class="btn-close">×</button>
      </div>

      <div class="modal-body">
        <!-- 監査ログ情報 -->
        <div class="audit-info">
          <div class="audit-row">
            <span class="label">📝 作成者:</span>
            <span class="value">{{ createdByName }} ({{ formatDateTime(record.created_at) }})</span>
          </div>
          <div v-if="record.updated_by" class="audit-row">
            <span class="label">✏️ 最終更新:</span>
            <span class="value">{{ updatedByName }} ({{ formatDateTime(record.updated_at) }})</span>
          </div>
        </div>

        <hr />

        <!-- 記録日時 -->
        <div class="info-row">
          <span class="label">🗓️ 記録日時:</span>
          <span class="value">{{ formatDateTime(record.recorded_at) }}</span>
        </div>

        <!-- 施術内容 -->
        <div class="section">
          <h3>【施術内容】</h3>
          <div class="content-box">{{ record.treatment_content }}</div>
        </div>

        <!-- 施術後の写真 -->
        <div class="section">
          <h3>【施術後の写真】({{ record.photos.length }}枚)</h3>
          <div v-if="record.photos.length > 0" class="photos-grid">
            <div v-for="(photo, index) in record.photos" :key="index" class="photo-item">
              <div class="photo-preview" @click="openPhotoViewer(photo.url, photo.notes)">
                <img :src="photo.thumbnail_url || photo.url" :alt="`Photo ${index + 1}`" />
                <span class="zoom-hint">🔍</span>
              </div>
              <p v-if="photo.notes" class="photo-notes">{{ photo.notes }}</p>
            </div>
          </div>
          <div v-else class="empty-photos">
            写真がありません
          </div>
        </div>

        <!-- 特記事項 -->
        <div v-if="record.notes" class="section">
          <h3>【特記事項 / 次回の提案】</h3>
          <div class="content-box">{{ record.notes }}</div>
        </div>

        <!-- 保持期限 -->
        <div class="expiry-info">
          <small>このカルテは {{ formatDate(record.expiry_date) }} まで保持されます</small>
        </div>
      </div>

      <div class="modal-footer">
        <button @click="handleEdit" type="button" class="btn-edit">✏️ 編集</button>
        <button @click="handleDelete" type="button" class="btn-delete">🗑️ 削除</button>
      </div>
    </div>
  </div>

  <!-- 写真拡大表示モーダル -->
  <PhotoViewerModal :is-open="viewerOpen" :image-url="viewerImageUrl" :caption="viewerCaption"
    @close="closePhotoViewer" />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Timestamp } from 'firebase/firestore'
import type { MedicalRecord } from '../stores/recordStore'
import PhotoViewerModal from './PhotoViewerModal.vue'

interface Staff {
  id: string
  name: string
}

interface Props {
  isOpen: boolean
  record: MedicalRecord
  staffList: Staff[]
}

const props = defineProps<Props>()
const emit = defineEmits(['close', 'edit', 'delete'])

// 写真ビューアー用の状態
const viewerOpen = ref(false)
const viewerImageUrl = ref('')
const viewerCaption = ref('')

// 作成者の名前を取得
const createdByName = computed(() => {
  const staff = props.staffList.find(s => s.id === props.record.created_by)
  if (staff) {
    return staff.name
  }
  // スタッフが見つからない場合、UIDの最初の8文字を表示
  console.warn('⚠️ スタッフが見つかりません:', props.record.created_by)
  return `不明 (${props.record.created_by?.substring(0, 8)}...)`
})

// 更新者の名前を取得
const updatedByName = computed(() => {
  if (!props.record.updated_by) return ''
  const staff = props.staffList.find(s => s.id === props.record.updated_by)
  if (staff) {
    return staff.name
  }
  // スタッフが見つからない場合、UIDの最初の8文字を表示
  console.warn('⚠️ スタッフが見つかりません:', props.record.updated_by)
  return `不明 (${props.record.updated_by?.substring(0, 8)}...)`
})

// 日時フォーマット（詳細）
const formatDateTime = (timestamp: Timestamp | undefined) => {
  if (!timestamp) return ''
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

// 日付フォーマット（簡易）
const formatDate = (timestamp: Timestamp | undefined) => {
  if (!timestamp) return ''
  const date = timestamp.toDate()
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

// 写真ビューアーを開く
const openPhotoViewer = (url: string, notes?: string) => {
  viewerImageUrl.value = url
  viewerCaption.value = notes || ''
  viewerOpen.value = true
}

// 写真ビューアーを閉じる
const closePhotoViewer = () => {
  viewerOpen.value = false
}

const close = () => emit('close')
const handleEdit = () => emit('edit', props.record.id)
const handleDelete = () => emit('delete', props.record.id)
</script>

<style scoped>
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
  padding: 20px;
  box-sizing: border-box;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 700px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #eee;
  position: sticky;
  top: 0;
  background: white;
  z-index: 10;
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
  color: #333;
}

.btn-close {
  background: none;
  border: none;
  font-size: 32px;
  cursor: pointer;
  color: #999;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
}

.btn-close:hover {
  color: #666;
}

.modal-body {
  padding: 20px;
}

.audit-info {
  background: #f0f8ff;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 15px;
}

.audit-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 8px;
}

.audit-row:last-child {
  margin-bottom: 0;
}

.label {
  font-weight: bold;
  color: #555;
  white-space: nowrap;
}

.value {
  color: #333;
  text-align: right;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 12px;
  background: #fafafa;
  border-radius: 6px;
  margin-bottom: 15px;
  flex-wrap: wrap;
  gap: 8px;
}

hr {
  border: none;
  border-top: 1px solid #e0e0e0;
  margin: 15px 0;
}

.section {
  margin-top: 20px;
}

.section h3 {
  font-size: 16px;
  margin-bottom: 12px;
  color: #333;
  font-weight: bold;
}

.content-box {
  background: #f9f9f9;
  padding: 15px;
  border-radius: 8px;
  white-space: pre-wrap;
  line-height: 1.6;
  color: #333;
  border: 1px solid #e0e0e0;
}

.photos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.photo-item {
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  background: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.photo-preview {
  cursor: pointer;
  position: relative;
  overflow: hidden;
  background: #f0f0f0;
}

.photo-preview img {
  width: 100%;
  height: 140px;
  object-fit: cover;
  display: block;
  transition: transform 0.2s;
}

.photo-preview:hover img {
  transform: scale(1.05);
}

.zoom-hint {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

.photo-preview:hover .zoom-hint {
  opacity: 1;
}

.photo-notes {
  padding: 8px;
  font-size: 13px;
  color: #666;
  background: white;
  margin: 0;
  border-top: 1px solid #eee;
  line-height: 1.4;
}

.empty-photos {
  text-align: center;
  padding: 30px;
  color: #999;
  font-size: 14px;
}

.expiry-info {
  margin-top: 20px;
  padding: 10px;
  background: #fffbf0;
  border-radius: 6px;
  text-align: center;
  color: #666;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 20px;
  border-top: 1px solid #eee;
  position: sticky;
  bottom: 0;
  background: white;
}

.btn-edit,
.btn-delete {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 15px;
  font-weight: bold;
  transition: all 0.2s;
}

.btn-edit {
  background: #4CAF50;
  color: white;
}

.btn-edit:hover {
  background: #45a049;
}

.btn-delete {
  background: #f44336;
  color: white;
}

.btn-delete:hover {
  background: #d32f2f;
}

@media (max-width: 768px) {
  .modal-content {
    max-width: 100%;
    max-height: 100vh;
    border-radius: 0;
  }

  .photos-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .audit-row,
  .info-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .value {
    text-align: left;
  }
}
</style>
