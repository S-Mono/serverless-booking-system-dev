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
  Timestamp,
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
  tags: string[]
  description?: string
  category: 'barber' | 'beauty' | 'student' | 'chiro'
  order_priority: number
}

export interface Staff {
  id: string
  name: string
  code?: string
}

export interface MenuTag {
  id: string
  name: string
  order_priority: number
}

export interface UseMenuOptions {
  onError?: (error: any) => void
}

export function useMenu(options?: UseMenuOptions) {
  const menus = ref<Menu[]>([])
  const staffs = ref<Staff[]>([])
  const menuTags = ref<MenuTag[]>([])
  const isLoading = ref(false)
  const isOperating = ref(false)
  const taxRate = ref(10)

  const menusByCategory = computed(() => ({
    barber: menus.value.filter(m => m.category === 'barber' || !m.category),
    beauty: menus.value.filter(m => m.category === 'beauty'),
    student: menus.value.filter(m => m.category === 'student'),
    chiro: menus.value.filter(m => m.category === 'chiro')
  }))

  /**
   * メニューとスタッフデータを取得
   */
  const fetchData = async (): Promise<void> => {
    isLoading.value = true
    try {
      const [menuSnap, staffSnap, configSnap, tagSnap] = await Promise.all([
        getDocs(collection(db, 'menus')),
        getDocs(collection(db, 'staffs')),
        getDoc(doc(db, 'shop_config', 'default_config')),
        getDocs(collection(db, 'menu_tags'))
      ])

      menus.value = menuSnap.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
          price_with_tax: doc.data().price_with_tax ?? Math.ceil(doc.data().price * 1.1),
          order_priority: doc.data().order_priority ?? 999,
          tags: doc.data().tags ?? []
        }))
        .sort((a: any, b: any) => a.order_priority - b.order_priority) as Menu[]

      staffs.value = staffSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Staff[]

      menuTags.value = tagSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => (a.order_priority ?? 999) - (b.order_priority ?? 999)) as MenuTag[]

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
        tags: menu.tags ?? [],
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

        const [title, priceInStr, durationStr, catStr, orderStr, desc, staffCodesStr, tagNamesStr] = line.split(',')

        if (!title || !priceInStr) continue

        const priceWithTax = parseInt(priceInStr ?? '0')
        const price = calcTaxExcluded(priceWithTax)
        const duration = parseInt(durationStr ?? '30') || 30
        const category = (['barber', 'beauty', 'student', 'chiro'].includes(catStr ?? '') ? catStr : 'barber') as any
        const orderPriority = orderStr ? parseInt(orderStr) : 999
        const targetCodes = staffCodesStr ? staffCodesStr.split('/') : []
        const staffIds = staffs.value
          .filter(s => s.code && targetCodes.includes(s.code))
          .map(s => s.id)

        // タグ名 → タグID 変換（未登録のタグ名は自動作成）
        const targetTagNames = tagNamesStr ? tagNamesStr.split('/').map(n => n.trim()).filter(n => n) : []
        const tagIds: string[] = []
        for (const tagName of targetTagNames) {
          const existing = menuTags.value.find(t => t.name === tagName)
          if (existing) {
            tagIds.push(existing.id)
          } else {
            const newTagRef = doc(collection(db, 'menu_tags'))
            batch.set(newTagRef, {
              name: tagName,
              order_priority: 999,
              created_at: Timestamp.now()
            })
            menuTags.value.push({ id: newTagRef.id, name: tagName, order_priority: 999 })
            tagIds.push(newTagRef.id)
          }
        }

        const newDocRef = doc(collection(db, 'menus'))
        batch.set(newDocRef, {
          title,
          price,
          price_with_tax: priceWithTax,
          duration_min: duration,
          category,
          description: desc || '',
          available_staff_ids: staffIds,
          tags: tagIds,
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

  /**
   * タグ名を取得
   */
  const getTagName = (tagId: string): string => {
    return menuTags.value.find(t => t.id === tagId)?.name || tagId
  }

  /**
   * タグを保存（新規追加または改名）
   */
  const saveTag = async (tag: { id?: string; name: string }): Promise<boolean> => {
    isOperating.value = true
    try {
      const name = tag.name.trim()
      if (!name) return false

      if (tag.id) {
        await updateDoc(doc(db, 'menu_tags', tag.id), { name })
      } else {
        // 同名タグの重複登録を防止
        if (menuTags.value.some(t => t.name === name)) return false
        const maxOrder = menuTags.value.reduce((max, t) => Math.max(max, t.order_priority ?? 0), 0)
        await addDoc(collection(db, 'menu_tags'), {
          name,
          order_priority: maxOrder + 10,
          created_at: Timestamp.now()
        })
      }

      await fetchData()
      return true
    } catch (error: any) {
      console.error('[useMenu] Error saving tag:', error)
      options?.onError?.(error)
      return false
    } finally {
      isOperating.value = false
    }
  }

  /**
   * タグを削除（参照しているメニューからも除去）
   */
  const deleteTag = async (tagId: string): Promise<boolean> => {
    isOperating.value = true
    try {
      const batch = writeBatch(db)
      batch.delete(doc(db, 'menu_tags', tagId))

      // このタグを参照しているメニューの tags 配列から除去
      const referencing = menus.value.filter(m => (m.tags ?? []).includes(tagId))
      referencing.forEach(m => {
        batch.update(doc(db, 'menus', m.id), {
          tags: m.tags.filter(id => id !== tagId)
        })
      })

      await batch.commit()
      await fetchData()
      return true
    } catch (error: any) {
      console.error('[useMenu] Error deleting tag:', error)
      options?.onError?.(error)
      return false
    } finally {
      isOperating.value = false
    }
  }

  return {
    menus,
    staffs,
    menuTags,
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
    getStaffName,
    getTagName,
    saveTag,
    deleteTag
  }
}
