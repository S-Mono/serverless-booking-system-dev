<template>
  <div class="editor-view">
    <div class="header">
      <button @click="goBack" class="btn-back">← 戻る</button>
      <h1>{{ isEditing ? '✏️ カルテ編集' : '➕ カルテ新規作成' }}</h1>
    </div>

    <div class="customer-info-banner">
      <span class="customer-name">👤 {{ customerName }}</span>
      <span v-if="customerPhone" class="customer-phone">📞 {{ customerPhone }}</span>
    </div>

    <form @submit.prevent="handleSubmit" class="editor-form">
      <!-- 施術内容 -->
      <div class="form-group">
        <label for="content" class="required">【施術内容】</label>
        <textarea id="content" v-model="formData.content" rows="6" placeholder="例: オーダーメイドカット、カラー施術..." required
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
        <textarea id="notes" v-model="formData.notes" rows="4" placeholder="例: 左側のボリュームアップを希望、次回はスタイリング剤でセット..."
          class="form-textarea" />
      </div>

      <!-- ボタン -->
      <div class="form-actions">
        <button type="button" @click="goBack" class="btn-cancel">
          キャンセル
        </button>
        <button type="submit" :disabled="isSaving" class="btn-save">
          <span v-if="isSaving" class="spinner"></span>
          {{ isSaving ? '保存中...' : '💾 保存' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRecordStore } from '../stores/recordStore'
import { useDialogStore } from '../stores/dialog'
import { auth, db } from '../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import RecordPhotoUploader from '../components/RecordPhotoUploader.vue'

const route = useRoute()
const router = useRouter()
const recordStore = useRecordStore()
const dialog = useDialogStore()

const customerId = route.params.customerId as string
const recordIdParam = route.params.recordId as string | undefined
const isEditing = computed(() => !!recordIdParam)

// recordIdは編集時のみ使用（新規作成時は不要）
const recordId = ref(recordIdParam)

const customerName = ref('')
const customerPhone = ref('')
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

onMounted(async () => {
  try {
    // 顧客情報を取得
    const customerDoc = await getDoc(doc(db, 'customers', customerId))
    if (customerDoc.exists()) {
      const data = customerDoc.data()
      customerName.value = data.name_kana || '不明'
      customerPhone.value = data.phone_number || ''
    }

    // 編集モードの場合、既存データを取得
    if (isEditing.value && recordIdParam) {
      await recordStore.fetchRecordsByCustomer(customerId)
      const existing = recordStore.records.find(r => r.id === recordIdParam)

      if (existing) {
        formData.value = {
          content: existing.treatment_content,
          photos: existing.photos.map(p => ({
            url: p.url,
            thumbnail_url: p.thumbnail_url,
            notes: p.notes || ''
          })),
          notes: existing.notes || ''
        }
        recordId.value = recordIdParam
      } else {
        dialog.alert('カルテが見つかりませんでした')
        goBack()
      }
    }
  } catch (error: any) {
    console.error('Failed to load data:', error)
    dialog.alert('データの読み込みに失敗しました: ' + error.message)
  }
})

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
        // 一時的なrecordIdを使用してアップロード
        const tempRecordId = recordIdParam || `temp_${Date.now()}`
        const { url, thumbnail_url } = await recordStore.uploadPhoto(
          photo.file,
          customerId,
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

    if (isEditing.value && recordIdParam) {
      // 更新
      await recordStore.updateRecord(
        recordIdParam,
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
            recordStore.updateThumbnailsAsync(recordIdParam)
          }
        } catch (e) {
          console.error('サムネイル更新エラー:', e)
        }
      }, 3000) // 3秒後に実行（Cloud Functionsがサムネイル生成する時間を確保）
    } else {
      // 新規作成
      const newRecord = await recordStore.createRecord(
        customerId,
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
        }, 3000) // 3秒後に実行（Cloud Functionsがサムネイル生成する時間を確保）
      }
    }

    // カルテ一覧に戻る
    router.push(`/admin/customer-records/${customerId}`)
  } catch (error: any) {
    console.error('Failed to save record:', error)
    dialog.alert('保存に失敗しました: ' + error.message)
  } finally {
    isSaving.value = false
  }
}

// 戻る
const goBack = () => {
  router.push(`/admin/customer-records/${customerId}`)
}
</script>

<style scoped>
.editor-view {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 20px;
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

.header h1 {
  margin: 0;
  font-size: 22px;
  color: #333;
}

.customer-info-banner {
  background: #f0f8ff;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.customer-name {
  font-weight: bold;
  color: #333;
  font-size: 16px;
}

.customer-phone {
  color: #666;
  font-size: 14px;
}

.editor-form {
  background: white;
  padding: 24px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.form-group {
  margin-bottom: 24px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: bold;
  color: #333;
  font-size: 15px;
}

.required::after {
  content: ' *';
  color: #f44336;
}

.form-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
}

.form-textarea:focus {
  outline: none;
  border-color: #4CAF50;
  box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.1);
}

.error {
  display: block;
  color: #f44336;
  font-size: 13px;
  margin-top: 6px;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid #eee;
}

.btn-cancel,
.btn-save {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 15px;
  font-weight: bold;
  transition: all 0.2s;
}

.btn-cancel {
  background: #f0f0f0;
  color: #666;
}

.btn-cancel:hover {
  background: #e0e0e0;
}

.btn-save {
  background: #4CAF50;
  color: white;
}

.btn-save:hover:not(:disabled) {
  background: #45a049;
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 8px;
  vertical-align: middle;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.btn-save:disabled {
  background: #ccc;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .editor-view {
    padding: 15px;
  }

  .editor-form {
    padding: 16px;
  }

  .form-actions {
    flex-direction: column-reverse;
  }

  .btn-cancel,
  .btn-save {
    width: 100%;
  }
}
</style>
