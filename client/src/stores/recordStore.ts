import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db, storage } from '../lib/firebase'
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  getDocs,
  Timestamp 
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage'

export interface MedicalRecordPhoto {
  url: string
  thumbnail_url: string
  uploaded_at: Timestamp
  notes?: string
}

export interface MedicalRecord {
  id: string
  customer_id: string
  staff_id: string
  recorded_at: Timestamp
  treatment_content: string
  photos: MedicalRecordPhoto[]
  notes?: string
  expiry_date: Timestamp
  created_by: string
  created_at: Timestamp
  updated_by?: string
  updated_at?: Timestamp
}

export const useRecordStore = defineStore('records', () => {
  const records = ref<MedicalRecord[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 顧客のカルテを全て取得（新しい順）
  const fetchRecordsByCustomer = async (customerId: string) => {
    loading.value = true
    error.value = null
    try {
      const q = query(
        collection(db, 'customer_medical_records'),
        where('customer_id', '==', customerId),
        orderBy('recorded_at', 'desc')
      )
      const snap = await getDocs(q)
      records.value = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MedicalRecord[]
    } catch (e: any) {
      console.error('Failed to fetch records:', e)
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  // 写真をアップロード（オリジナルのみ、サムネイルは自動生成）
  const uploadPhoto = async (
    file: File,
    customerId: string,
    recordId: string
  ): Promise<{ url: string; thumbnail_url: string }> => {
    try {
      // ファイル名: timestamp + ランダム文字列
      const timestamp = new Date().getTime()
      const random = Math.random().toString(36).substring(7)
      const extension = file.name.split('.').pop() || 'jpg'
      const filename = `photo_${timestamp}_${random}.${extension}`
      
      const photoRef = storageRef(
        storage,
        `customer_medical_records/${customerId}/${recordId}/${filename}`
      )

      // アップロード
      await uploadBytes(photoRef, file)

      // ダウンロードURL取得
      const url = await getDownloadURL(photoRef)

      // サムネイルURL（Cloud Functionsで自動生成される）
      const thumbFilename = filename.replace(/(\.\w+)$/, '_thumb$1')
      const thumbRef = storageRef(
        storage,
        `customer_medical_records/${customerId}/${recordId}/${thumbFilename}`
      )

      // サムネイルが生成されるまで待つ（最大10秒）
      let thumbnail_url = url // フォールバック
      for (let i = 0; i < 10; i++) {
        try {
          thumbnail_url = await getDownloadURL(thumbRef)
          break
        } catch (e) {
          // まだ生成されていない場合は1秒待つ
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      return { url, thumbnail_url }
    } catch (e: any) {
      console.error('Failed to upload photo:', e)
      throw e
    }
  }

  // カルテを新規作成
  const createRecord = async (
    customerId: string,
    staffId: string,
    content: string,
    photos: Array<{ url: string; thumbnail_url: string; notes?: string }>,
    notes?: string
  ): Promise<MedicalRecord> => {
    loading.value = true
    error.value = null
    try {
      const now = new Date()
      const expiry = new Date(now.getTime() + 730 * 24 * 60 * 60 * 1000) // 730日後

      const newRecord = {
        customer_id: customerId,
        staff_id: staffId,
        recorded_at: Timestamp.fromDate(now),
        treatment_content: content,
        photos: photos.map(p => ({
          url: p.url,
          thumbnail_url: p.thumbnail_url,
          uploaded_at: Timestamp.fromDate(new Date()),
          notes: p.notes || ''
        })),
        notes: notes || '',
        expiry_date: Timestamp.fromDate(expiry),
        created_by: staffId,
        created_at: Timestamp.fromDate(now)
      }

      const docRef = await addDoc(
        collection(db, 'customer_medical_records'),
        newRecord
      )

      const result = { id: docRef.id, ...newRecord } as MedicalRecord
      
      // ローカルリストに追加
      records.value.unshift(result)
      
      return result
    } catch (e: any) {
      console.error('Failed to create record:', e)
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  // カルテを更新
  const updateRecord = async (
    recordId: string,
    staffId: string,
    content: string,
    photos: Array<{ url: string; thumbnail_url: string; notes?: string }>,
    notes?: string
  ) => {
    loading.value = true
    error.value = null
    try {
      const recordRef = doc(db, 'customer_medical_records', recordId)
      const updateData = {
        treatment_content: content,
        photos: photos.map(p => ({
          url: p.url,
          thumbnail_url: p.thumbnail_url,
          uploaded_at: p.uploaded_at || Timestamp.fromDate(new Date()),
          notes: p.notes || ''
        })),
        notes: notes || '',
        updated_by: staffId,
        updated_at: Timestamp.fromDate(new Date())
      }

      await updateDoc(recordRef, updateData)

      // ローカルリストを更新
      const index = records.value.findIndex(r => r.id === recordId)
      if (index !== -1) {
        records.value[index] = { ...records.value[index], ...updateData }
      }
    } catch (e: any) {
      console.error('Failed to update record:', e)
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  // カルテを削除（Firestore + Storage）
  const deleteRecord = async (customerId: string, recordId: string) => {
    loading.value = true
    error.value = null
    try {
      // 1. Storage フォルダ内のファイルを全削除
      const folderRef = storageRef(
        storage,
        `customer_medical_records/${customerId}/${recordId}`
      )

      try {
        const fileList = await listAll(folderRef)
        const deletePromises = fileList.items.map(item => deleteObject(item))
        await Promise.all(deletePromises)
      } catch (e) {
        console.warn('Failed to delete storage files:', e)
        // ストレージ削除失敗でも続行
      }

      // 2. Firestore ドキュメント削除
      await deleteDoc(doc(db, 'customer_medical_records', recordId))

      // ローカルリストから削除
      records.value = records.value.filter(r => r.id !== recordId)
    } catch (e: any) {
      console.error('Failed to delete record:', e)
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    records,
    loading,
    error,
    fetchRecordsByCustomer,
    uploadPhoto,
    createRecord,
    updateRecord,
    deleteRecord
  }
})
