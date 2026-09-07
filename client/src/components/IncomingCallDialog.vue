<template>
  <div v-if="isRinging" class="modal-overlay" @click.self="dismiss">
    <div class="modal-content">
      <div class="modal-header">
        <span class="call-icon">📞</span>
        <h3>電話着信</h3>
      </div>

      <div class="modal-body">
        <div class="phone-label">発信元電話番号</div>
        <div class="phone-number">{{ incomingPhoneNumber }}</div>

        <!-- 既存顧客照合ヒット時 -->
        <div v-if="matchedCustomer" class="customer-card matched">
          <div class="customer-name">{{ matchedCustomer.name }} 様</div>
          <div v-if="matchedCustomer.kana" class="customer-kana">({{ matchedCustomer.kana }})</div>
        </div>

        <!-- 新規顧客（未登録番号）時 -->
        <div v-else class="customer-card new">
          <div class="new-title">新規のお客様（未登録番号）</div>
          <div class="new-desc">顧客カルテに一致する登録がありません。</div>
        </div>
      </div>

      <div class="modal-actions">
        <button type="button" class="cancel-btn" @click="dismiss">閉じる</button>
        <button
          v-if="matchedCustomer"
          type="button"
          class="record-btn"
          @click="handleOpenRecord"
        >
          カルテ表示
        </button>
        <button
          type="button"
          class="save-btn"
          @click="handleCreateReservation"
        >
          予約を登録
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useIncomingCall } from '@/composables/useIncomingCall';

const router = useRouter();
const { isRinging, incomingPhoneNumber, matchedCustomer, dismiss } = useIncomingCall();

const handleCreateReservation = () => {
  const queryParams: Record<string, string> = {
    phone: incomingPhoneNumber.value
  };

  if (matchedCustomer.value) {
    queryParams.customerId = matchedCustomer.value.id;
    queryParams.customerName = matchedCustomer.value.name;
  }

  dismiss();
  router.push({ path: '/admin', query: queryParams });
};

const handleOpenRecord = () => {
  if (!matchedCustomer.value) return;
  const customerId = matchedCustomer.value.id;
  dismiss();
  router.push(`/admin/customers/${customerId}/records`);
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
}

.modal-content {
  background: white;
  padding: 1.5rem;
  border-radius: 12px;
  width: 90%;
  max-width: 440px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
  box-sizing: border-box;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.75rem;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #2c3e50;
}

.call-icon {
  font-size: 1.4rem;
  animation: pulse 1.2s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.modal-body {
  margin-bottom: 1.5rem;
}

.phone-label {
  font-size: 0.8rem;
  color: #666;
  margin-bottom: 0.2rem;
}

.phone-number {
  font-size: 1.8rem;
  font-weight: bold;
  color: #2c3e50;
  letter-spacing: 0.05em;
  margin-bottom: 1rem;
}

.customer-card {
  padding: 0.8rem 1rem;
  border-radius: 8px;
  box-sizing: border-box;
}

.customer-card.matched {
  background-color: #eaf6ff;
  border: 1px solid #b3d7ff;
}

.customer-name {
  font-size: 1.1rem;
  font-weight: bold;
  color: #0d47a1;
}

.customer-kana {
  font-size: 0.85rem;
  color: #555;
  margin-top: 2px;
}

.customer-card.new {
  background-color: #fff8e1;
  border: 1px solid #ffe082;
}

.new-title {
  font-size: 0.95rem;
  font-weight: bold;
  color: #b78103;
}

.new-desc {
  font-size: 0.8rem;
  color: #666;
  margin-top: 2px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.5rem;
}

button {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: bold;
  cursor: pointer;
  border: none;
  transition: opacity 0.2s;
}

button:hover {
  opacity: 0.9;
}

.cancel-btn {
  background: #eee;
  color: #555;
}

.record-btn {
  background: transparent;
  border: 1px solid #3498db;
  color: #3498db;
}

.save-btn {
  background: #27ae60;
  color: white;
}
</style>