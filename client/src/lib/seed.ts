import { db } from './firebase'
import { doc, setDoc, collection, getDocs, deleteDoc, writeBatch } from 'firebase/firestore'
import { useDialogStore } from '../stores/dialog'

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
    await setDoc(doc(db, 'shop_config', 'default_config'), {
      time_slot_interval: 30,
      business_hours: { start: '09:00', end: '19:00' },
      holiday_weekdays: [1, 2], // 月火定休
      closed_dates: [],
      tax_rate: 10,
      max_future_booking_months: 2
    })

    // 3. スタッフマスタ
    const staffs = [
      {
        id: 'father',
        code: 'ft',
        name: '賢治',
        display_name: 'オーナー・店長',
        roles: { accepts_new_customer: false, accepts_free_booking: true },
        is_working: true,
        order_priority: 1
      },
      {
        id: 'brother',
        code: 'bt',
        name: 'ひろゆき',
        display_name: 'ひろゆき（スタッフ）',
        roles: { accepts_new_customer: true, accepts_free_booking: true },
        is_working: true,
        order_priority: 2
      },
      {
        id: 'mother',
        code: 'mt',
        name: '由美子',
        display_name: 'ユミコ（美容専門）',
        roles: { accepts_new_customer: true, accepts_free_booking: false },
        is_working: true,
        order_priority: 3
      }
    ]
    for (const staff of staffs) {
      await setDoc(doc(db, 'staffs', staff.id), staff)
    }

    // 4. メニューマスタ (CSV相当の内容)
    const menus = [
      // --- 💈 理容メニュー ---
      { title: '総合調髪', price_tax: 4000, min: 60, cat: 'barber', staff: ['father', 'brother'] },
      { title: 'シンプルカット', price_tax: 3500, min: 45, cat: 'barber', staff: ['father', 'brother'] },
      { title: '学生カット+SV', price_tax: 2800, min: 45, cat: 'barber', desc: '顔剃り込み', staff: ['father', 'brother'] },
      { title: '学生カット', price_tax: 2300, min: 45, cat: 'barber', desc: '中学生まで', staff: ['father', 'brother'] },
      { title: '顔剃 洗髪', price_tax: 3360, min: 40, cat: 'barber', staff: ['father', 'brother'] },
      { title: '洗髪 セット', price_tax: 2625, min: 30, cat: 'barber', staff: ['father', 'brother'] },
      { title: '眉カット', price_tax: 800, min: 10, cat: 'barber', staff: ['father', 'brother', 'mother'] },
      { title: '婦人顔そり(大人)', price_tax: 2750, min: 30, cat: 'barber', staff: ['mother', 'brother'] },
      { title: '婦人顔そり(中学生まで)', price_tax: 1750, min: 30, cat: 'barber', staff: ['mother', 'brother'] },
      { title: 'デザインパーマ', price_tax: 7150, min: 90, cat: 'barber', desc: 'ハード(ツイスト)など', staff: ['father', 'brother'] },
      { title: 'ニュアンス・ソフトパーマ', price_tax: 6150, min: 90, cat: 'barber', staff: ['father', 'brother'] },
      { title: 'ポイントパーマ', price_tax: 4400, min: 60, cat: 'barber', desc: 'ロット5本まで', staff: ['father', 'brother'] },
      { title: 'デザインカラー', price_tax: 4650, min: 60, cat: 'barber', staff: ['brother'] },
      { title: 'ブリーチ', price_tax: 5650, min: 90, cat: 'barber', desc: '金髪まで', staff: ['brother'] },
      { title: 'ナチュラルカラー', price_tax: 4150, min: 60, cat: 'barber', desc: '白髪染め', staff: ['father', 'brother'] },

      // --- 💇‍♀️ 美容メニュー ---
      { title: 'カット&シャンプー', price_tax: 3850, min: 45, cat: 'beauty', staff: ['brother', 'mother'] },
      { title: 'カット&ヘッドスパ', price_tax: 4750, min: 60, cat: 'beauty', staff: ['brother', 'mother'] },
      { title: 'カット&トリートメント', price_tax: 5000, min: 60, cat: 'beauty', staff: ['brother', 'mother'] },
      { title: '縮毛矯正+カット', price_tax: 10000, min: 150, cat: 'beauty', desc: 'ストレートメニュー', staff: ['brother', 'mother'] },
      { title: '髪質矯正+カット', price_tax: 12500, min: 180, cat: 'beauty', desc: 'ストレートメニュー', staff: ['brother', 'mother'] },
      { title: '婦人顔そり(レディースシェーブ)', price_tax: 2750, min: 30, cat: 'beauty', desc: '大人(襟そり+眉カット)', staff: ['mother'] },
      { title: '婦人顔そり(学生)', price_tax: 1750, min: 30, cat: 'beauty', desc: '中学生まで(襟そり+眉カット)', staff: ['mother'] },
      { title: '眉カット・襟そり', price_tax: 1500, min: 15, cat: 'beauty', staff: ['mother'] },
      { title: 'パーマメニュー', price_tax: 8800, min: 90, cat: 'beauty', desc: 'カット込み/トリートメントパーマ～', staff: ['brother', 'mother'] },
      { title: 'ナチュラルパーマ', price_tax: 7700, min: 90, cat: 'beauty', desc: 'カット込み～', staff: ['brother', 'mother'] },
      { title: 'ポイントパーマ', price_tax: 6600, min: 60, cat: 'beauty', desc: 'カット込み/ロット5本まで～', staff: ['brother', 'mother'] },
      { title: 'ヘアマニキュア', price_tax: 4400, min: 60, cat: 'beauty', desc: '～', staff: ['brother', 'mother'] },
      { title: 'ナチュラルカラー', price_tax: 4350, min: 60, cat: 'beauty', desc: '白髪染め/全体染め～', staff: ['brother', 'mother'] },
      { title: '根本染め(リタッチ)', price_tax: 3850, min: 60, cat: 'beauty', desc: '白髪染め～', staff: ['brother', 'mother'] },
      { title: 'ファッションカラー(全体)', price_tax: 4850, min: 60, cat: 'beauty', desc: 'おしゃれ染め～', staff: ['brother', 'mother'] },
      { title: 'ファッションカラー(リタッチ)', price_tax: 4350, min: 60, cat: 'beauty', desc: 'おしゃれ染め～', staff: ['brother', 'mother'] },
      { title: 'ブリーチ', price_tax: 5150, min: 90, cat: 'beauty', desc: '金髪まで～', staff: ['brother', 'mother'] },
      { title: 'ホイルカラー', price_tax: 700, min: 15, cat: 'beauty', desc: '1枚～', staff: ['brother', 'mother'] },

      // --- 💆‍♂️ カイロ ---
      { title: 'カイロプラクティック', price_tax: 4400, min: 45, cat: 'chiro', desc: '全身調整コース', staff: ['brother'] }
    ]

    let priority = 10
    for (const m of menus) {
      // 10%前提で税抜を逆算
      const price = Math.ceil(m.price_tax / 1.1)

      await setDoc(doc(db, 'menus', `menu_${priority}`), {
        title: m.title,
        price: price,
        price_with_tax: m.price_tax,
        duration_min: m.min,
        category: m.cat,
        description: m.desc || '',
        available_staff_ids: m.staff,
        order_priority: priority
      })
      priority += 10
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