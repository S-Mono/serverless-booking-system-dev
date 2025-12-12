<template>
    <Teleport to="body">
        <div v-if="isOpen" class="photo-viewer-overlay" @click.self="close">
            <div class="photo-viewer-container">
                <button @click="close" class="close-btn" aria-label="閉じる">×</button>
                <div class="photo-content">
                    <img :src="imageUrl" :alt="altText" @click.stop />
                </div>
                <div v-if="caption" class="photo-caption">{{ caption }}</div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { watch, onMounted, onUnmounted } from 'vue'

interface Props {
    isOpen: boolean
    imageUrl: string
    altText?: string
    caption?: string
}

const props = withDefaults(defineProps<Props>(), {
    altText: '写真',
    caption: ''
})

const emit = defineEmits<{
    (e: 'close'): void
}>()

const close = () => {
    emit('close')
}

// ESCキーで閉じる
const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && props.isOpen) {
        close()
    }
}

// body スクロール制御
watch(() => props.isOpen, (isOpen) => {
    if (isOpen) {
        document.body.style.overflow = 'hidden'
    } else {
        document.body.style.overflow = ''
    }
})

onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
    document.body.style.overflow = ''
})
</script>

<style scoped>
.photo-viewer-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }

    to {
        opacity: 1;
    }
}

.photo-viewer-container {
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.close-btn {
    position: absolute;
    top: -40px;
    right: 0;
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    font-size: 32px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
    z-index: 10000;
}

.close-btn:hover {
    background: rgba(255, 255, 255, 0.3);
}

.photo-content {
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: 90vw;
    max-height: 80vh;
}

.photo-content img {
    max-width: 100%;
    max-height: 80vh;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    animation: zoomIn 0.3s ease-out;
}

@keyframes zoomIn {
    from {
        transform: scale(0.8);
        opacity: 0;
    }

    to {
        transform: scale(1);
        opacity: 1;
    }
}

.photo-caption {
    color: white;
    text-align: center;
    padding: 10px;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 8px;
    font-size: 14px;
    max-width: 600px;
    margin: 0 auto;
}

/* モバイル対応 */
@media (max-width: 768px) {
    .photo-viewer-overlay {
        padding: 10px;
    }

    .close-btn {
        top: 10px;
        right: 10px;
        position: fixed;
    }

    .photo-content img {
        max-height: 70vh;
    }

    .photo-caption {
        font-size: 13px;
        padding: 8px;
    }
}
</style>
