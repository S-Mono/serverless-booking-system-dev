import { ref, watch, onUnmounted, computed } from 'vue';
import { collection, query, orderBy, limit, onSnapshot, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/stores/user';

export interface MatchedCustomer {
  id: string;
  name: string;
  kana?: string;
  phoneNumber: string;
}

export interface IncomingCallItem {
  id: string;
  phoneNumber: string;
  createdAt: Timestamp;
  customer: MatchedCustomer | null;
  isNew: boolean;
}

// --- モジュールスコープの共有状態（App.vueで1回だけ呼ばれる前提だが安全のため） ---
const MAX_CALLS = 5;            // 保持する着信件数
const AUTO_CLOSE_MS = 60000;    // 自動クローズまでの時間（60秒）

const incomingCalls = ref<IncomingCallItem[]>([]);

let unsubscribe: (() => void) | null = null;
let mountTime = Date.now();
let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

const cleanPhone = (num: string) => (num || '').replace(/\D/g, '');

// 自動クローズタイマーのリセット（新着のたびに呼ぶ）
const resetAutoCloseTimer = () => {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
  autoCloseTimer = setTimeout(() => {
    incomingCalls.value = [];
    autoCloseTimer = null;
  }, AUTO_CLOSE_MS);
};

const clearAutoCloseTimer = () => {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
};

export function useIncomingCall() {
  const userStore = useUserStore();

  // 着信番号（ハイフンなし）を元に customers コレクションを照合
  const findCustomerByPhone = async (rawPhone: string): Promise<MatchedCustomer | null> => {
    const targetClean = cleanPhone(rawPhone);
    if (!targetClean) return null;

    try {
      const snapshot = await getDocs(collection(db, 'customers'));
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const docPhoneClean = cleanPhone(data.phone_number || data.phoneNumber || '');
        
        if (docPhoneClean === targetClean) {
          return {
            id: docSnap.id,
            name: data.name_kanji || data.name || '名前未登録',
            kana: data.name_kana || data.kana || '',
            phoneNumber: data.phone_number || data.phoneNumber || rawPhone
          };
        }
      }
    } catch (e) {
      console.error('[CTI] 顧客照合エラー:', e);
    }
    return null;
  };

  const startListening = () => {
    if (unsubscribe) return;

    // 直近5件を監視（連続・同時着信をすべて把握するため）
    const q = query(
      collection(db, 'incoming_calls'),
      orderBy('createdAt', 'desc'),
      limit(MAX_CALLS)
    );

    unsubscribe = onSnapshot(q, async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === 'added') {
          const data = change.doc.data();
          const createdAt = data.createdAt as Timestamp;

          // 起動前の着信や45秒以上経過した着信はスキップ
          if (!createdAt || createdAt.toMillis() < mountTime || (Date.now() - createdAt.toMillis() > 45000)) {
            continue;
          }

          // 既にキューにある着信はスキップ（重複防止）
          if (incomingCalls.value.some(c => c.id === change.doc.id)) {
            continue;
          }

          const rawPhone = data.phoneNumber || '';
          // 既存顧客と照合
          const customer = await findCustomerByPhone(rawPhone);

          // 既存の全着信の新着フラグを解除（バッジは次の着信が来るまで）
          incomingCalls.value.forEach(c => { c.isNew = false; });

          // 新着を先頭に追加し、直近5件に切り捨て
          incomingCalls.value.unshift({
            id: change.doc.id,
            phoneNumber: rawPhone,
            createdAt,
            customer,
            isNew: true
          });
          if (incomingCalls.value.length > MAX_CALLS) {
            incomingCalls.value = incomingCalls.value.slice(0, MAX_CALLS);
          }

          // 自動クローズタイマーをリセット
          resetAutoCloseTimer();
        }
      }
    });
  };

  const stopListening = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    clearAutoCloseTimer();
  };

  // 管理者ログイン時のみ監視
  watch(
    () => userStore.isAdmin,
    (isAdmin) => {
      if (isAdmin) {
        mountTime = Date.now(); // 監視開始時刻を更新
        startListening();
      } else {
        stopListening();
        incomingCalls.value = [];
      }
    },
    { immediate: true }
  );

  onUnmounted(() => {
    stopListening();
  });

  const dismiss = () => {
    incomingCalls.value = [];
    clearAutoCloseTimer();
  };

  // --- 後方互換：最新1件を指す computed ---
  const latestCall = computed(() => incomingCalls.value[0] || null);
  const isRinging = computed(() => incomingCalls.value.length > 0);
  const incomingPhoneNumber = computed(() => latestCall.value?.phoneNumber || '');
  const matchedCustomer = computed(() => latestCall.value?.customer || null);

  return {
    isRinging,
    incomingPhoneNumber,
    matchedCustomer,
    incomingCalls,
    dismiss,
  };
}