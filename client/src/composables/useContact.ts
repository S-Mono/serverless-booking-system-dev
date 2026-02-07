import { ref } from 'vue'
import { db } from '../lib/firebase'
import { doc, collection, setDoc, getDoc, Timestamp } from 'firebase/firestore'

export interface UseContactOptions {
  onError?: (error: any) => void
}

export function useContact(options?: UseContactOptions) {
  const isSending = ref(false)

  /**
   * お問い合わせを送信
   */
  const sendContact = async (
    userId: string,
    message: string,
    customerData: { name_kanji?: string; name_kana?: string; phone_number?: string; email?: string }
  ): Promise<boolean> => {
    isSending.value = true
    try {
      // お客様情報を取得（オプション）
      const customerDocRef = doc(db, 'customers', userId)
      const customerSnap = await getDoc(customerDocRef)
      const data = customerSnap.exists() ? customerSnap.data() : {}

      const customerName = data.name_kanji || data.name_kana || customerData.name_kanji || customerData.name_kana || 'ゲスト'
      const customerEmail = customerData.email || data.email || ''
      const customerPhone = data.phone_number || customerData.phone_number || ''

      // お問い合わせ内容をFirestoreに保存
      const contactRef = doc(collection(db, 'contacts'))
      await setDoc(contactRef, {
        customer_id: userId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        message: message,
        created_at: Timestamp.now(),
        status: 'pending'
      })

      // メッセージコレクションにも通知を追加
      const messageRef = doc(collection(db, 'messages'))
      await setDoc(messageRef, {
        customer_id: userId,
        title: 'お問い合わせを受け付けました',
        body: `お問い合わせ内容:\n${message}\n\n折り返しご連絡いたしますので、しばらくお待ちください。`,
        is_read: false,
        created_at: Timestamp.now()
      })

      return true
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('[useContact] Error sending contact:', error)
        options?.onError?.(error)
      }
      return false
    } finally {
      isSending.value = false
    }
  }

  return {
    isSending,
    sendContact
  }
}
