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

  // 画像をWebPに変換して圧縮
  const convertToWebP = async (file: File, maxSizeKB: number = 100): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const reader = new FileReader()

      reader.onload = (e) => {
        img.src = e.target?.result as string
      }

      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('Canvas context not available'))
          return
        }

        // アスペクト比を保ちながらリサイズ（最大1920px）
        let width = img.width
        let height = img.height
        const maxDimension = 1920

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = (height / width) * maxDimension
            width = maxDimension
          } else {
            width = (width / height) * maxDimension
            height = maxDimension
          }
        }

        canvas.width = width
        canvas.height = height

        // 画像を描画
        ctx.drawImage(img, 0, 0, width, height)

        // WebPに変換（品質を調整しながら目標サイズに）
        const attemptConversion = (quality: number) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to convert image'))
                return
              }

              const sizeKB = blob.size / 1024

              // 目標サイズに収まった、または品質が最低値に達した
              if (sizeKB <= maxSizeKB || quality <= 0.3) {
                console.log(`WebP conversion complete: ${sizeKB.toFixed(1)}KB at quality ${quality}`)
                resolve(blob)
              } else {
                // 品質を下げて再試行
                attemptConversion(quality - 0.1)
              }
            },
            'image/webp',
            quality
          )
        }

        // 初回は品質0.8で試行
        attemptConversion(0.8)
      }

      img.onerror = () => {
        reject(new Error('Failed to load image'))
      }

      reader.onerror = () => {
        reject(new Error('Failed to read file'))
      }

      reader.readAsDataURL(file)
    })
  }

  // 写真をアップロード（WebP変換＋圧縮）
  const uploadPhoto = async (
    file: File,
    customerId: string,
    recordId: string
  ): Promise<{ url: string; thumbnail_url: string }> => {
    try {
      // WebPに変換＋圧縮
      const webpBlob = await convertToWebP(file, 100)

      // ファイル名: timestamp + ランダム文字列（WebP拡張子）
      const timestamp = new Date().getTime()
      const random = Math.random().toString(36).substring(7)
      const filename = `photo_${timestamp}_${random}.webp`
      
      const photoRef = storageRef(
        storage,
        `customer_medical_records/${customerId}/${recordId}/${filename}`
      )

      // アップロード
      await uploadBytes(photoRef, webpBlob, {
        contentType: 'image/webp'
      })

      // ダウンロードURL取得
      const url = await getDownloadURL(photoRef)

      // サムネイルはCloud Functionsで非同期に生成されるため、
      // アップロード時は元画像を使用し、後で更新する
      return { url, thumbnail_url: url }
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
    photos: Array<{ url: string; thumbnail_url: string; notes?: string; uploaded_at?: Timestamp }>,
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
        const currentRecord = records.value[index]
        if (currentRecord) {
          records.value[index] = { ...currentRecord, ...updateData }
        }
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

  // サムネイルを非同期で更新（保存後やカルテ表示時に呼び出す）
  const updateThumbnailsAsync = async (recordId: string) => {
    try {
      const record = records.value.find(r => r.id === recordId)
      if (!record) return

      let hasUpdates = false
      const updatedPhotos = []

      for (const photo of record.photos) {
        // 元画像とサムネイルが同じ場合、サムネイルがまだ生成されていない可能性
        if (photo.url === photo.thumbnail_url) {
          try {
            // URLからファイルパスを抽出
            const urlMatch = photo.url?.match(/customer_medical_records\/([^?]+)/)
            if (urlMatch && urlMatch[1]) {
              const filePath = urlMatch[1]
              const thumbPath = filePath.replace(/\.webp$/, '_thumb.webp')
              const thumbRef = storageRef(storage, `customer_medical_records/${thumbPath}`)
              
              // サムネイルが存在するか確認
              const thumbnail_url = await getDownloadURL(thumbRef)
              console.log('✅ サムネイル更新:', filePath)
              
              updatedPhotos.push({
                ...photo,
                thumbnail_url
              })
              hasUpdates = true
            } else {
              updatedPhotos.push(photo)
            }
          } catch (e) {
            // サムネイルがまだ生成されていない場合
            console.log('⏳ サムネイル未生成:', photo.url)
            updatedPhotos.push(photo)
          }
        } else {
          updatedPhotos.push(photo)
        }
      }

      // 更新があればFirestoreを更新
      if (hasUpdates) {
        await updateDoc(doc(db, 'customer_medical_records', recordId), {
          photos: updatedPhotos
        })

        // ローカルの状態も更新
        const index = records.value.findIndex(r => r.id === recordId)
        if (index !== -1 && records.value[index]) {
          records.value[index].photos = updatedPhotos as MedicalRecordPhoto[]
        }
      }
    } catch (e: any) {
      console.error('Failed to update thumbnails:', e)
      // エラーは無視（サムネイルは必須ではない）
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
    deleteRecord,
    updateThumbnailsAsync
  }
})
