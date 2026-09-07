import { ref, watch, onUnmounted } from 'vue';
import { collection, query, orderBy, limit, onSnapshot, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/stores/user';

export interface MatchedCustomer {
  id: string;
  name: string;
  kana?: string;
  phoneNumber: string;
}

export function useIncomingCall() {
  const userStore = useUserStore();

  const isRinging = ref(false);
  const incomingPhoneNumber = ref<string>('');
  const matchedCustomer = ref<MatchedCustomer | null>(null);
  
  let unsubscribe: (() => void) | null = null;
  const mountTime = Date.now();

  const cleanPhone = (num: string) => (num || '').replace(/\D/g, '');

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

    const q = query(
      collection(db, 'incoming_calls'),
      orderBy('createdAt', 'desc'),
      limit(1)
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

          const rawPhone = data.phoneNumber || '';
          incomingPhoneNumber.value = rawPhone;

          // 既存顧客と照合
          matchedCustomer.value = await findCustomerByPhone(rawPhone);
          isRinging.value = true;
        }
      }
    });
  };

  const stopListening = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  // 管理者ログイン時のみ監視
  watch(
    () => userStore.isAdmin,
    (isAdmin) => {
      if (isAdmin) {
        startListening();
      } else {
        stopListening();
        isRinging.value = false;
      }
    },
    { immediate: true }
  );

  onUnmounted(() => {
    stopListening();
  });

  const dismiss = () => {
    isRinging.value = false;
  };

  return {
    isRinging,
    incomingPhoneNumber,
    matchedCustomer,
    dismiss,
  };
}