<script setup lang="ts">
import { useDialogStore } from '../stores/dialog'

const dialogStore = useDialogStore()

const handleCancel = () =>
{
  dialogStore.resolve(false)
  dialogStore.close()
}

const handleConfirm = () =>
{
  dialogStore.resolve(true)
  dialogStore.close()
}

const handleThird = () =>
{
  dialogStore.resolve('skip')
  dialogStore.close()
}

// thirdText指定時はオーバーレイクリック（ダイアログ外クリック）を「skip」扱いにする
// （未指定時は従来通りキャンセル扱い）
const handleOverlayClick = () =>
{
  if (dialogStore.options.alertOnly) return
  if (dialogStore.options.thirdText)
  {
    handleThird()
  } else
  {
    handleCancel()
  }
}
</script>

<template>
  <div v-if="dialogStore.isOpen" class="dialog-overlay" @click.self="handleOverlayClick">
    <div class="dialog-content" :class="dialogStore.options.type">
      <h3>{{ dialogStore.options.title || '確認' }}</h3>
      <p class="dialog-message">{{ dialogStore.message }}</p>

      <textarea
        v-if="dialogStore.options.showMemoInput"
        v-model="dialogStore.memoInput"
        class="dialog-memo-input"
        :placeholder="dialogStore.options.memoPlaceholder || 'メモを入力（任意）'"
        rows="3"
      ></textarea>

      <div class="dialog-actions">
        <button
          v-if="dialogStore.options.thirdText"
          class="third-btn"
          @click="handleThird">
          {{ dialogStore.options.thirdText }}
        </button>

        <button
          v-if="!dialogStore.options.alertOnly"
          class="cancel-btn"
          @click="handleCancel">
          {{ dialogStore.options.cancelText || 'キャンセル' }}
        </button>

        <button
          class="confirm-btn"
          @click="handleConfirm">
          {{ dialogStore.options.confirmText || 'OK' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
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
  /* 最前面 */
}

.dialog-content {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  animation: popIn 0.2s ease-out;
}

@keyframes popIn {
  from {
    transform: scale(0.9);
    opacity: 0;
  }

  to {
    transform: scale(1);
    opacity: 1;
  }
}

h3 {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  color: #333;
}

.dialog-message {
  white-space: pre-wrap;
  margin-bottom: 1.5rem;
  color: #555;
  line-height: 1.5;
}

.dialog-memo-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.6rem;
  margin-bottom: 1.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.95rem;
  font-family: inherit;
  resize: vertical;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.75rem;
}

button {
  padding: 0.6rem 1.2rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.95rem;
  border: none;
}

.cancel-btn {
  background: #f0f0f0;
  color: #333;
}

.cancel-btn:hover {
  background: #e0e0e0;
}

.third-btn {
  background: #fff;
  color: #3498db;
  border: 1px solid #3498db;
}

.third-btn:hover {
  background: #eaf4fc;
}

.confirm-btn {
  background: #42b883;
  color: white;
  font-weight: bold;
}

.confirm-btn:hover {
  background: #3aa876;
}

/* 危険な操作 (削除など) 用のスタイル */
.dialog-content.danger .confirm-btn {
  background: #e74c3c;
}

.dialog-content.danger .confirm-btn:hover {
  background: #c0392b;
}
</style>