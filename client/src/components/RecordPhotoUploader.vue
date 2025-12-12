<template>
    <div class="photo-uploader">
        <div class="upload-controls">
            <button @click="openFileInput" type="button" class="btn-camera">
                📷 写真を追加
            </button>
            <input ref="fileInput" type="file" @change="onFileSelected" accept="image/*" multiple capture="environment"
                style="display: none;" />
        </div>

        <!-- アップロード進捗表示 -->
        <div v-if="isUploading" class="upload-progress">
            <div class="progress-bar">
                <div class="progress-fill" :style="{ width: uploadProgress + '%' }"></div>
            </div>
            <span class="progress-text">{{ uploadProgress }}% アップロード中...</span>
        </div>

        <!-- アップロード済み写真 -->
        <div v-if="photos.length > 0" class="photos-grid">
            <div v-for="(photo, index) in photos" :key="index" class="photo-card">
                <div class="photo-preview" @click="openPhotoViewer(photo.url || '', photo.notes)">
                    <img :src="photo.thumbnail_url || photo.url" :alt="`Photo ${index + 1}`" />
                    <div class="zoom-overlay">🔍</div>
                </div>
                <textarea v-model="photo.notes" placeholder="この写真についてのメモ" @input="onPhotoNotesChange"
                    class="photo-notes" />
                <button @click="removePhoto(index)" type="button" class="btn-remove">削除</button>
            </div>
        </div>

        <div v-if="photos.length === 0 && !isUploading" class="empty-state">
            写真が追加されていません
        </div>
    </div>

    <!-- 写真拡大表示モーダル -->
    <PhotoViewerModal :is-open="viewerOpen" :image-url="viewerImageUrl" :caption="viewerCaption"
        @close="closePhotoViewer" />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRecordStore } from '../stores/recordStore'
import { useDialogStore } from '../stores/dialog'
import PhotoViewerModal from './PhotoViewerModal.vue'

interface Photo {
    url?: string
    thumbnail_url?: string
    file?: File
    notes?: string
}

interface Props {
    modelValue: Photo[]
    customerId: string
}

const props = defineProps<Props>()
const emit = defineEmits(['update:modelValue'])

const recordStore = useRecordStore()
const dialog = useDialogStore()

const fileInput = ref<HTMLInputElement | null>(null)
const isUploading = ref(false)
const uploadProgress = ref(0)
const photos = ref<Photo[]>([...props.modelValue])

// 写真ビューアー用の状態
const viewerOpen = ref(false)
const viewerImageUrl = ref('')
const viewerCaption = ref('')

// modelValue が外部から変更された時に同期
watch(() => props.modelValue, (newVal) => {
    photos.value = [...newVal]
}, { deep: true })

// カメラ/ファイルピッカーを開く
const openFileInput = () => {
    fileInput.value?.click()
}

// 写真ビューアーを開く
const openPhotoViewer = (url: string, caption?: string) => {
    viewerImageUrl.value = url
    viewerCaption.value = caption || ''
    viewerOpen.value = true
}

// 写真ビューアーを閉じる
const closePhotoViewer = () => {
    viewerOpen.value = false
}

// ファイル選択時の処理
const onFileSelected = async (event: Event) => {
    const input = event.target as HTMLInputElement
    const files = Array.from(input.files || [])

    if (files.length === 0) return

    isUploading.value = true
    uploadProgress.value = 0

    try {
        for (let i = 0; i < files.length; i++) {
            const file = files[i]

            // undefinedチェック
            if (!file) continue

            // ファイルサイズチェック (10MB制限)
            if (file.size > 10 * 1024 * 1024) {
                dialog.alert(`${file.name} は10MBを超えています。スキップします。`)
                continue
            }

            // プレビュー用のURLを生成（アップロードは保存時に行う）
            const previewUrl = URL.createObjectURL(file)

            photos.value.push({
                file,
                url: previewUrl, // プレビュー用
                thumbnail_url: previewUrl, // プレビュー用
                notes: ''
            })

            // プログレス更新
            uploadProgress.value = Math.round(((i + 1) / files.length) * 100)
        }

        // 親コンポーネントに通知
        emit('update:modelValue', photos.value)

        // 入力をリセット
        if (input) input.value = ''
    } catch (error: any) {
        console.error('Failed to select photos:', error)
        dialog.alert('写真の選択に失敗しました: ' + error.message)
    } finally {
        isUploading.value = false
        uploadProgress.value = 0
    }
}

// 写真を削除
const removePhoto = (index: number) => {
    const photo = photos.value[index]
    // プレビューURL（ObjectURL）の場合はメモリ解放
    if (photo?.file && photo.url?.startsWith('blob:')) {
        URL.revokeObjectURL(photo.url)
    }
    photos.value.splice(index, 1)
    emit('update:modelValue', photos.value)
}

// メモを更新
const onPhotoNotesChange = () => {
    emit('update:modelValue', photos.value)
}
</script>

<style scoped>
.photo-uploader {
    padding: 15px;
    background: #f9f9f9;
    border-radius: 8px;
}

.upload-controls {
    margin-bottom: 15px;
}

.btn-camera {
    background: #4CAF50;
    color: white;
    border: none;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
    width: 100%;
    transition: background 0.2s;
}

.btn-camera:hover {
    background: #45a049;
}

.upload-progress {
    margin: 15px 0;
    text-align: center;
}

.progress-bar {
    width: 100%;
    height: 24px;
    background: #e0e0e0;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 8px;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4CAF50, #8BC34A);
    transition: width 0.3s ease;
}

.progress-text {
    font-size: 14px;
    color: #555;
    font-weight: bold;
}

.photos-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
    margin-top: 15px;
}

.photo-card {
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
    transition: transform 0.2s;
}

.photo-preview:hover {
    transform: scale(1.02);
}

.zoom-overlay {
    position: absolute;
    top: 5px;
    right: 5px;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 14px;
    opacity: 0;
    transition: opacity 0.2s;
    pointer-events: none;
}

.photo-preview:hover .zoom-overlay {
    opacity: 1;
}

.photo-card img {
    width: 100%;
    height: 150px;
    object-fit: cover;
    display: block;
}

.photo-notes {
    width: 100%;
    height: 60px;
    padding: 8px;
    border: none;
    border-top: 1px solid #eee;
    resize: none;
    font-size: 13px;
    font-family: inherit;
    box-sizing: border-box;
}

.photo-notes:focus {
    outline: none;
    background: #fffef0;
}

.btn-remove {
    width: 100%;
    padding: 8px;
    background: #f44336;
    color: white;
    border: none;
    cursor: pointer;
    font-size: 13px;
    transition: background 0.2s;
}

.btn-remove:hover {
    background: #d32f2f;
}

.empty-state {
    text-align: center;
    padding: 30px;
    color: #999;
    font-size: 14px;
}

@media (max-width: 768px) {
    .photos-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

@media (min-width: 1024px) {
    .photos-grid {
        grid-template-columns: repeat(3, 1fr);
    }
}
</style>
