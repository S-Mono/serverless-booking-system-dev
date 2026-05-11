<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h2>{{ isEditing ? '✏️ カルテ編集' : '➕ カルテ新規作成' }}</h2>
        <button @click="close" type="button" class="btn-close">×</button>
      </div>

      <div class="customer-info-banner">
        <span class="customer-name">👤 {{ customerName }}</span>
        <span v-if="customerPhone" class="customer-phone">📞 {{ customerPhone }}</span>
      </div>

      <div class="modal-body">
        <form @submit.prevent="handleSubmit" class="editor-form">
          <!-- 施術内容 -->
          <div class="form-group">
            <label for="content" class="required">【施術内容】</label>
            <textarea id="content" v-model="formData.content" rows="6" 
              placeholder="例: オーダーメイドカット、カラー施術..." required
              class="form-textarea" />
            <span v-if="errors.content" class="error">{{ errors.content }}</span>
          </div>

          <!-- 施術後の写真 -->
          <div class="form-group">
            <label class="required">【施術後の写真】</label>
            <RecordPhotoUploader v-model="formData.photos" :customer-id="customerId" />
            <span v-if="errors.photos" class="error">{{ errors.photos }}</span>
          </div>

          <!-- 特記事項 -->
          <div class="form-group">
            <label for="notes">【特記事項 / 次回の提案】</label>
            <textarea id="notes" v-model="formData.notes" rows="4" 
              placeholder="例: 左側のボリュームアップを希望、次回はスタイリング剤でセット..."
              class="form-textarea" />
          </div>

          <!-- ボタン -->
          <div class="form-actions">
            <button type="button" @click="close" class="btn-cancel">
              キャンセル
            </button>
            <button type="submit" :disabled="isSaving" class="btn-save">
              <span v-if="isSaving" class="spinner"></span>
              {{ isSaving ? '保存中...' : '💾 保存' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRecordStore, type MedicalRecord } from '../stores/recordStore'
import { useDialogStore } from '../stores/dialog'
import { auth } from '../lib/firebase'
import RecordPhotoUploader from './RecordPhotoUploader.vue'

interface Props {
  isOpen: boolean
  customerId: string
  customerName: string
  customerPhone: string
  recordId?: string
  existingRecord?: MedicalRecord | null
}

interface Emits {
  (e: 'close'): void
  (e: 'saved'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const recordStore = useRecordStore()
const dialog = useDialogStore()

const isEditing = computed(() => !!props.recordId)
const isSaving = ref(false)

interface PhotoData {
  url?: string
  thumbnail_url?: string
  file?: File
  notes?: string
}

const formData = ref<{
  content: string
  photos: PhotoData[]
  notes: string
}>({
  content: '',
  photos: [],
  notes: ''
})

const errors = ref({
  content: '',
  photos: ''
})

// ダイアログが開いた時と既存レコードが変更された時にフォームを初期化
watch(() => [props.isOpen, props.existingRecord], () => {
  if (props.isOpen) {
    if (props.existingRecord) {
      // 編集モード
      formData.value = {
        content: props.existingRecord.treatment_content,
        photos: props.existingRecord.photos.map(p => ({
          url: p.url,
          thumbnail_url: p.thumbnail_url,
          notes: p.notes || ''
        })),
        notes: props.existingRecord.notes || ''
      }
    } else {
      // 新規作成モード
      formData.value = {
        content: '',
        photos: [],
        notes: ''
      }
    }
    // エラーをクリア
    errors.value = { content: '', photos: '' }
  }
}, { immediate: true })

// バリデーション
const validate = (): boolean => {
  errors.value = { content: '', photos: '' }
  let isValid = true

  if (!formData.value.content.trim()) {
    errors.value.content = '施術内容を入力してください'
    isValid = false
  }

  if (formData.value.photos.length === 0) {
    errors.value.photos = '写真を1枚以上アップロードしてください'
    isValid = false
  }

  return isValid
}

// 保存
const handleSubmit = async () => {
  if (!validate()) {
    dialog.alert('入力内容を確認してください')
    return
  }

  const currentUser = auth.currentUser
  if (!currentUser) {
    dialog.alert('ログインしてください')
    return
  }

  // スタッフIDを取得（管理者のuid）
  const staffId = currentUser.uid

  isSaving.value = true

  try {
    // 写真アップロード処理
    const uploadedPhotos: Array<{ url: string; thumbnail_url: string; notes?: string }> = []
    for (const photo of formData.value.photos) {
      if (photo.file) {
        // 新規アップロード（Fileオブジェクトが存在する場合）
        const tempRecordId = props.recordId || `temp_${Date.now()}`
        const { url, thumbnail_url } = await recordStore.uploadPhoto(
          photo.file,
          props.customerId,
          tempRecordId
        )
        uploadedPhotos.push({
          url,
          thumbnail_url,
          notes: photo.notes || ''
        })
      } else if (photo.url && photo.thumbnail_url) {
        // 既存の写真（編集時）
        uploadedPhotos.push({
          url: photo.url,
          thumbnail_url: photo.thumbnail_url,
          notes: photo.notes || ''
        })
      }
    }

    if (isEditing.value && props.recordId) {
      // 更新
      await recordStore.updateRecord(
        props.recordId,
        staffId,
        formData.value.content,
        uploadedPhotos,
        formData.value.notes
      )
      dialog.alert('カルテを更新しました')

      // サムネイルを非同期で更新（バックグラウンド処理）
      setTimeout(() => {
        try {
          if (recordStore.updateThumbnailsAsync) {
            recordStore.updateThumbnailsAsync(props.recordId!)
          }
        } catch (e) {
          console.error('サムネイル更新エラー:', e)
        }
      }, 3000)
    } else {
      // 新規作成
      const newRecord = await recordStore.createRecord(
        props.customerId,
        staffId,
        formData.value.content,
        uploadedPhotos,
        formData.value.notes
      )
      dialog.alert('カルテを作成しました')

      // サムネイルを非同期で更新（バックグラウンド処理）
      if (newRecord) {
        setTimeout(() => {
          try {
            if (recordStore.updateThumbnailsAsync) {
              recordStore.updateThumbnailsAsync(newRecord.id)
            }
          } catch (e) {
            console.error('サムネイル更新エラー:', e)
          }
        }, 3000)
      }
    }

    emit('saved')
    close()
  } catch (error: any) {
    console.error('Failed to save record:', error)
    dialog.alert('保存に失敗しました: ' + error.message)
  } finally {
    isSaving.value = false
  }
}

// 閉じる
const close = () => {
  emit('close')
}
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
  z-index: 9999;
  overflow-y: auto;
  padding: 20px;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(30px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e0e0e0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 12px 12px 0 0;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: bold;
}

.btn-close {
  background: none;
  border: none;
  font-size: 2rem;
  color: white;
  cursor: pointer;
  padding: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  border-radius: 50%;
}

.btn-close:hover {
  background: rgba(255, 255, 255, 0.2);
}

.customer-info-banner {
  background: #f8f9fa;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  gap: 1.5rem;
  font-size: 0.95rem;
}

.customer-name {
  font-weight: bold;
  color: #333;
}

.customer-phone {
  color: #666;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.editor-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-weight: bold;
  color: #333;
  font-size: 0.95rem;
}

.form-group label.required::after {
  content: ' *';
  color: #e74c3c;
}

.form-textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 1rem;
  font-family: inherit;
  resize: vertical;
  transition: border-color 0.2s;
}

.form-textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.error {
  color: #e74c3c;
  font-size: 0.875rem;
}

.form-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  padding-top: 1rem;
  border-top: 1px solid #e0e0e0;
}

.btn-cancel,
.btn-save {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-cancel {
  background: #e0e0e0;
  color: #333;
}

.btn-cancel:hover {
  background: #d0d0d0;
}

.btn-save {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-save:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .modal-content {
    max-width: 100%;
    max-height: 100vh;
    border-radius: 0;
  }

  .modal-header {
    border-radius: 0;
  }

  .form-actions {
    flex-direction: column-reverse;
  }

  .btn-cancel,
  .btn-save {
    width: 100%;
    justify-content: center;
  }
}
</style>
