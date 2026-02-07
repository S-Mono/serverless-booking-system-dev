import { ref, computed, type Ref } from 'vue'
import { db } from '../lib/firebase'
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  getDoc,
  writeBatch,
  query,
  where
} from 'firebase/firestore'

export interface Menu {
  id: string
  title: string
  price: number
  price_with_tax: number
  duration_min: number
  available_staff_ids: string[]
  description?: string
  category: 'barber' | 'beauty' | 'chiro'
  order_priority: number
}

export interface Staff {
  id: string
  name: string
  code?: string
}

export interface UseMenuOptions {
  onError?: (error: any) => void
}

export function useMenu(options?: UseMenuOptions) {
  const menus = ref<Menu[]>([])
  const staffs = ref<Staff[]>([])
  const isLoading = ref(false)
  const isOperating = ref(false)
  const taxRate = ref(10)

  const menusByCategory = computed(() => ({
    barber: menus.value.filter(m => m.category === 'barber' || !m.category),
    beauty: menus.value.filter(m => m.category === 'beauty'),
    chiro: menus.value.filter(m => m.category === 'chiro')
  }))

  /**
   * メニューとスタッフデータを取得
   */
  const fetchData = async (): Promise<void> => {
    isLoading.value = true
    try {
      const [menuSnap, staffSnap, configSnap] = await Promise.all([
        getDocs(collection(db, 'menus')),
        getDocs(collection(db, 'staffs')),
        getDoc(doc(db, 'shop_config', 'default_config'))
      ])

      menus.value = menuSnap.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
          price_with_tax: doc.data().price_with_tax ?? Math.ceil(doc.data().price * 1.1),
          order_priority: doc.data().order_priority ?? 999
        }))
        .sort((a: any, b: any) => a.order_priority - b.order_priority) as Menu[]

      staffs.value = staffSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Staff[]

      if (configSnap.exists()) {
        taxRate.value = configSnap.data().tax_rate ?? 10
      }
    } catch (error: any) {
      console.error('[useMenu] Error fetching data:', error)
      options?.onError?.(error)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 税率を計算（税込み価格から税抜き）
   */
  const calcTaxExcluded = (priceWithTax: number): number => {
    return Math.ceil(priceWithTax / (1 + taxRate.value / 100))
  }

  /**
   * 税率を計算（税抜き価格から税込み）
   */
  const calcTaxIncluded = (price: number): number => {
    return Math.ceil(price * (1 + taxRate.value / 100))
  }

  /**
   * メニューを保存（新規追加または更新）
   */
  const saveMenu = async (menu: Omit<Menu, 'id'> & { id?: string }): Promise<boolean> => {
    isOperating.value = true
    try {
      const payload = {
        title: menu.title,
        price: menu.price,
        price_with_tax: menu.price_with_tax,
        duration_min: menu.duration_min,
        available_staff_ids: menu.available_staff_ids,
        description: menu.description || '',
        category: menu.category,
        order_priority: Number(menu.order_priority)
      }

      if (menu.id) {
        await updateDoc(doc(db, 'menus', menu.id), payload)
      } else {
        await addDoc(collection(db, 'menus'), payload)
      }

      await fetchData()
      return true
    } catch (error: any) {
      console.error('[useMenu] Error saving menu:', error)
      options?.onError?.(error)
      return false
    } finally {
      isOperating.value = false
    }
  }

  /**
   * メニューを削除
   */
  const deleteMenu = async (menuId: string): Promise<boolean> => {
    isOperating.value = true
    try {
      await deleteDoc(doc(db, 'menus', menuId))
      await fetchData()
      return true
    } catch (error: any) {
      console.error('[useMenu] Error deleting menu:', error)
      options?.onError?.(error)
      return false
    } finally {
      isOperating.value = false
    }
  }

  /**
   * カテゴリ内の全メニューを削除
   */
  const deleteCategoryMenus = async (categoryId: string): Promise<boolean> => {
    isOperating.value = true
    try {
      const q = query(collection(db, 'menus'), where('category', '==', categoryId))
      const snapshot = await getDocs(q)

      if (snapshot.empty) {
        return false
      }

      const batch = writeBatch(db)
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref)
      })
      await batch.commit()

      await fetchData()
      return true
    } catch (error: any) {
      console.error('[useMenu] Error deleting category menus:', error)
      options?.onError?.(error)
      return false
    } finally {
      isOperating.value = false
    }
  }

  /**
   * CSVからメニューをインポート
   */
  const importFromCsv = async (csvText: string): Promise<number> => {
    isOperating.value = true
    try {
      const lines = csvText.split(/\r\n|\n/)
      let count = 0
      const batch = writeBatch(db)

      for (let i = 0; i < lines.length; i++) {
        const line: string = lines[i]!.trim()
        if (!line || line.startsWith('メニュー名')) continue

        const [title, priceInStr, durationStr, catStr, orderStr, desc, staffCodesStr] = line.split(',')

        if (!title || !priceInStr) continue

        const priceWithTax = parseInt(priceInStr ?? '0')
        const price = calcTaxExcluded(priceWithTax)
        const duration = parseInt(durationStr ?? '30') || 30
        const category = (['barber', 'beauty', 'chiro'].includes(catStr ?? '') ? catStr : 'barber') as any
        const orderPriority = orderStr ? parseInt(orderStr) : 999
        const targetCodes = staffCodesStr ? staffCodesStr.split('/') : []
        const staffIds = staffs.value
          .filter(s => s.code && targetCodes.includes(s.code))
          .map(s => s.id)

        const newDocRef = doc(collection(db, 'menus'))
        batch.set(newDocRef, {
          title,
          price,
          price_with_tax: priceWithTax,
          duration_min: duration,
          category,
          description: desc || '',
          available_staff_ids: staffIds,
          order_priority: orderPriority
        })
        count++
      }

      await batch.commit()
      await fetchData()
      return count
    } catch (error: any) {
      console.error('[useMenu] Error importing CSV:', error)
      options?.onError?.(error)
      return 0
    } finally {
      isOperating.value = false
    }
  }

  /**
   * スタッフ名を取得
   */
  const getStaffName = (staffId: string): string => {
    return staffs.value.find(s => s.id === staffId)?.name || staffId
  }

  return {
    menus,
    staffs,
    isLoading,
    isOperating,
    taxRate,
    menusByCategory,
    fetchData,
    calcTaxExcluded,
    calcTaxIncluded,
    saveMenu,
    deleteMenu,
    deleteCategoryMenus,
    importFromCsv,
    getStaffName
  }
}
