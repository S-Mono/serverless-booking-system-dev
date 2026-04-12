import { ref, type Ref } from 'vue'
import { db } from '../lib/firebase'
import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
  Timestamp,
  orderBy
} from 'firebase/firestore'

export interface ReservationData {
  id: string
  customer_id: string
  start_at: Timestamp
  menu_items: { title: string; price: number }[]
  status: string
  [key: string]: any
}

export interface UseReservationOptions {
  onError?: (error: any) => void
}

export function useReservation(options?: UseReservationOptions) {
  const reservations = ref<ReservationData[]>([])
  const isLoading = ref(false)
  const isOperating = ref(false)

  /**
   * ユーザーの本日以降の予約を取得
   */
  const fetchUserReservations = async (userId: string): Promise<ReservationData[]> => {
    isLoading.value = true
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const q = query(
        collection(db, 'reservations'),
        where('customer_id', '==', userId),
        where('start_at', '>=', Timestamp.fromDate(today)),
        orderBy('start_at', 'asc')
      )

      const querySnapshot = await getDocs(q)
      const results = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ReservationData[]

      reservations.value = results
      return results
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('[useReservation] Error fetching reservations:', error)
        options?.onError?.(error)
      }
      return []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 予約をキャンセル（削除と関連メッセージの更新）
   */
  const cancelReservation = async (reservationId: string): Promise<boolean> => {
    isOperating.value = true
    try {
      // 予約データを取得して確認
      const resDoc = await getDoc(doc(db, 'reservations', reservationId))
      if (!resDoc.exists()) {
        throw new Error('予約が見つかりません')
      }

      // 1. 予約自体の削除
      await deleteDoc(doc(db, 'reservations', reservationId))
      console.log('[useReservation] Reservation deleted successfully:', reservationId)

      // 2. 関連するメッセージを「キャンセル扱い」に更新（非クリティカル）
      try {
        const customerId = resDoc.data()?.customer_id
        const msgQ = query(collection(db, 'messages'), where('reservation_id', '==', reservationId), where('customer_id', '==', customerId))
        const msgSnap = await getDocs(msgQ)

        const updatePromises = msgSnap.docs.map(d =>
          updateDoc(d.ref, {
            is_cancelled: true,
            title: '【キャンセル済】' + d.data().title
          }).catch((err: any) => {
            console.warn('[useReservation] Single message update failed:', err.code || err.message)
          })
        )
        await Promise.all(updatePromises)
        console.log('[useReservation] Messages updated successfully')
      } catch (msgError: any) {
        if (msgError.name !== 'AbortError') {
          console.warn('[useReservation] Message update failed (non-critical):', msgError.code || msgError.message)
        }
      }

      // ローカル状態を更新
      reservations.value = reservations.value.filter(res => res.id !== reservationId)
      return true
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('[useReservation] Cancel error:', error)
        options?.onError?.(error)
      }
      return false
    } finally {
      isOperating.value = false
    }
  }

  return {
    reservations,
    isLoading,
    isOperating,
    fetchUserReservations,
    cancelReservation
  }
}
