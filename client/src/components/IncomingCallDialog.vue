<!-- client/src/components/IncomingCallDialog.vue -->
<template>
  <v-dialog v-model="isRinging" max-width="480" persistent>
    <v-card class="pa-2">
      <v-card-title class="d-flex align-center text-primary">
        <v-icon start color="primary" class="animate-pulse">mdi-phone-incoming</v-icon>
        <span class="font-weight-bold">電話着信</span>
      </v-card-title>

      <v-divider></v-divider>

      <v-card-text class="pt-4 pb-2">
        <div class="text-caption text-grey">発信元電話番号</div>
        <div class="text-h4 font-weight-bold mb-4 text-high-emphasis">
          {{ incomingPhoneNumber }}
        </div>

        <!-- 既存顧客照合ヒット時 -->
        <div v-if="matchedCustomer" class="bg-blue-lighten-5 pa-3 rounded-lg border">
          <div class="text-subtitle-1 font-weight-bold text-blue-darken-4">
            {{ matchedCustomer.name }} 様
          </div>
          <div v-if="matchedCustomer.kana" class="text-caption text-grey-darken-1">
            {{ matchedCustomer.kana }}
          </div>
        </div>

        <!-- 新規顧客（未登録番号）時 -->
        <div v-else class="bg-amber-lighten-5 pa-3 rounded-lg border border-amber">
          <div class="text-subtitle-2 font-weight-bold text-amber-darken-4">
            新規のお客様（未登録番号）
          </div>
          <div class="text-caption text-grey-darken-2">
            顧客カルテに一致する登録がありません。
          </div>
        </div>
      </v-card-text>

      <v-card-actions class="px-4 pb-3">
        <v-btn variant="text" color="grey" @click="dismiss">閉じる</v-btn>
        <v-spacer></v-spacer>

        <!-- 顧客カルテ確認（既存顧客のみ） -->
        <v-btn
          v-if="matchedCustomer"
          variant="outlined"
          color="primary"
          class="mr-2"
          @click="handleOpenRecord"
        >
          カルテ表示
        </v-btn>

        <!-- 予約作成画面へ -->
        <v-btn
          color="primary"
          variant="flat"
          @click="handleCreateReservation"
        >
          予約を登録
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useIncomingCall } from '@/composables/useIncomingCall';

const router = useRouter();
const { isRinging, incomingPhoneNumber, matchedCustomer, dismiss } = useIncomingCall();

// 予約作成画面またはモーダルへの連携
const handleCreateReservation = () => {
  const queryParams: Record<string, string> = {
    phone: incomingPhoneNumber.value
  };

  if (matchedCustomer.value) {
    queryParams.customerId = matchedCustomer.value.id;
    queryParams.customerName = matchedCustomer.value.name;
  }

  dismiss();
  // AdminViewへ予約作成クエリを渡して遷移
  router.push({ path: '/admin', query: queryParams });
};

// 既存カルテ確認への遷移
const handleOpenRecord = () => {
  if (!matchedCustomer.value) return;
  const customerId = matchedCustomer.value.id;
  dismiss();
  // AdminCustomerRecordsView へ遷移
  router.push({ name: 'AdminCustomerRecords', params: { id: customerId } });
};
</script>

<style scoped>
.animate-pulse {
  animation: pulse 1.2s infinite;
}
@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}
</style>