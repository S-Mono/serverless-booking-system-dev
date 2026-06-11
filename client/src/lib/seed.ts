import { db } from './firebase'
import { doc, setDoc, collection, getDocs, writeBatch } from 'firebase/firestore'
import { useDialogStore } from '../stores/dialog'
import { normalizeShopConfig } from './businessHours'
import { seedShopConfig, seedStaffs, seedMenus } from './seedMasterData'

// コレクションの中身を全て削除するヘルパー関数
const clearCollection = async (collectionName: string) => {
  const colRef = collection(db, collectionName)
  const snapshot = await getDocs(colRef)
  
  if (snapshot.empty) return

  // 一括削除 (Batch)
  const batch = writeBatch(db)
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref)
  })
  await batch.commit()
  console.log(`🧹 ${collectionName} をクリアしました`)
}

export const seedDatabase = async () => {
  const dialog = useDialogStore()
  
  const ok = await dialog.confirm(
    '【警告】\n既存の予約・顧客・メニューデータが全て削除されます。\n本当に初期化してよろしいですか？', 
    '完全初期化の確認', 
    'danger'
  )
  if (!ok) return

  console.log('データ投入を開始します...')

  try {
    // 🗑️ 1. 既存データの削除 (掃除)
    await Promise.all([
      clearCollection('reservations'), // 予約
      clearCollection('customers'),    // 顧客
      clearCollection('menus'),        // メニュー
      clearCollection('staffs')        // スタッフ
    ])

    // 2. 店舗設定
    const shopConfig = normalizeShopConfig(seedShopConfig)

    await setDoc(doc(db, 'shop_config', 'default_config'), {
      ...shopConfig,
      max_future_booking_months: seedShopConfig.max_future_booking_months,
      tenantId: seedShopConfig.tenantId
    })

    // 3. スタッフマスタ
    for (const staff of seedStaffs) {
      await setDoc(doc(db, 'staffs', staff.id), staff)
    }

    // 4. メニューマスタ (CSV相当の内容)
    for (const menu of seedMenus) {
      await setDoc(doc(db, 'menus', menu.id), menu)
    }

    // 5. 顧客データ (テスト用)
    await setDoc(doc(db, 'customers', 'cust_001'), {
      id: 'cust_001',
      name_kana: 'テスト カイハツ',
      phone_number: '09012345678',
      is_existing_customer: true,
      visit_count: 10,
      memo: 'いつもの',
      preferred_category: 'barber'
    })

    dialog.alert('初期化完了！\nすべてのデータがリセットされ、マスタが再投入されました。')

  } catch (error) {
    console.error('データ投入エラー:', error)
    dialog.alert('エラーが発生しました。コンソールを確認してください。', 'エラー')
  }
}