import { ref, type Ref } from 'vue'
import { db } from '../lib/firebase'
import { doc, getDoc, setDoc, getDocs, collection, query, where, Timestamp } from 'firebase/firestore'

export interface CustomerData {
  name_kanji?: string
  name_kana?: string
  phone_number?: string
  provider?: string
  preferred_category?: string
  is_existing_customer?: boolean
  updated_at?: Timestamp
}

export interface UseCustomerOptions {
  onError?: (error: any) => void
}

export function useCustomer(options?: UseCustomerOptions) {
  const customerData = ref<CustomerData>({})
  const isLoading = ref(false)
  const isSaving = ref(false)

  /**
   * UID or 電話番号でカスタマーデータを取得
   */
  const fetchCustomer = async (userId: string): Promise<CustomerData | null> => {
    isLoading.value = true
    try {
      // UID優先で取得
      const docRef = doc(db, 'customers', userId)
      const docSnap = await getDoc(docRef)

      if (docSnap.exists()) {
        const data = docSnap.data() as CustomerData
        customerData.value = data
        return data
      }

      // なければ電話番号で名寄せトライ
      const phone = userId.split('@')[0]
      if (phone) {
        const custQ = query(collection(db, 'customers'), where('phone_number', '==', phone))
        const custSnap = await getDocs(custQ)
        if (!custSnap.empty) {
          const data = custSnap.docs[0]!.data() as CustomerData
          customerData.value = data
          return data
        }
      }

      return null
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('[useCustomer] Error fetching customer:', error)
        options?.onError?.(error)
      }
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * カスタマープロフィールを保存
   */
  const saveCustomer = async (
    userId: string,
    data: Omit<CustomerData, 'updated_at'>
  ): Promise<boolean> => {
    isSaving.value = true
    try {
      await setDoc(
        doc(db, 'customers', userId),
        {
          ...data,
          updated_at: Timestamp.now()
        },
        { merge: true }
      )
      customerData.value = { ...customerData.value, ...data, updated_at: Timestamp.now() }
      return true
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('[useCustomer] Error saving customer:', error)
        options?.onError?.(error)
      }
      return false
    } finally {
      isSaving.value = false
    }
  }

  return {
    customerData,
    isLoading,
    isSaving,
    fetchCustomer,
    saveCustomer
  }
}
