<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDialogStore } from '../stores/dialog'
import { useUserStore } from '../stores/user'
import { useMenu } from '../composables'

const dialog = useDialogStore()
const router = useRouter()
const userStore = useUserStore()

const { menus, staffs, isLoading: loading, isOperating, taxRate, menusByCategory, fetchData, calcTaxIncluded, calcTaxExcluded, saveMenu, deleteMenu, deleteCategoryMenus, importFromCsv, getStaffName } = useMenu({
  onError: (error) => dialog.alert(error.message || '読み込みエラー', 'エラー')
})

const showModal = ref(false)
const isEditing = ref(false)
const editTargetId = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const editForm = ref({
  id: '', title: '', price: 0, priceWithTax: 0, duration_min: 30, available_staff_ids: [] as string[], description: '', category: 'barber' as 'barber' | 'beauty' | 'student' | 'chiro', order_priority: 10
})

const categories = [{ id: 'barber', label: '💈 理容' }, { id: 'beauty', label: '💇‍♀️ 美容' }, { id: 'student', label: '🎓 学生（中学まで）' }, { id: 'chiro', label: '💆‍♂️ カイロ' }]

const updateInclusive = () => { editForm.value.priceWithTax = calcTaxIncluded(editForm.value.price) }
const updateExclusive = () => { editForm.value.price = calcTaxExcluded(editForm.value.priceWithTax) }

// ⚡ カテゴリ内全削除 (開発者用)
const deleteCategoryMenusHandler = async (catId: string, catLabel: string) => {
  // 管理者権限チェック
  if (!userStore.isAdmin) return dialog.alert('管理者権限が必要です', 'エラー')

  // 最終確認
  const ok = await dialog.confirm(`本当に「${catLabel}」内のメニューを全て削除しますか？\nこの操作は取り消せません。`, '完全削除の確認', 'danger')
  if (!ok) return

  const success = await deleteCategoryMenus(catId)
  if (success) {
    dialog.alert(`「${catLabel}」のメニューを削除しました`)
  } else {
    dialog.alert('削除対象のメニューがありません')
  }
}// 📤 CSVインポート処理
const triggerFileUpload = () => fileInput.value?.click()

const importCsv = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const ok = await dialog.confirm('CSVからメニューを取り込みますか？\n※既存の同名メニューは上書きされず、新規追加されます。', 'インポート確認')
  if (!ok) { target.value = ''; return }

  const reader = new FileReader()
  reader.onload = async (e) => {
    const text = e.target?.result as string
    const count = await importFromCsv(text)

    if (count > 0) {
      dialog.alert(`${count}件のメニューを取り込みました`)
    } else {
      dialog.alert('取り込みに失敗しました。フォーマットを確認してください。', 'エラー')
    }
    target.value = ''
  }
  reader.readAsText(file)
}

const openEditModal = (menu?: any) => {
  if (menu) {
    isEditing.value = true
    editTargetId.value = menu.id
    editForm.value = { ...JSON.parse(JSON.stringify(menu)), priceWithTax: menu.price_with_tax }
    if (!editForm.value.category) editForm.value.category = 'barber'
    if (editForm.value.order_priority === undefined) editForm.value.order_priority = 10
  } else {
    isEditing.value = false
    editTargetId.value = null
    editForm.value = { id: '', title: '', price: 4000, priceWithTax: calcTaxIncluded(4000), duration_min: 60, available_staff_ids: staffs.value.map(s => s.id), description: '', category: 'barber', order_priority: 10 }
  }
  showModal.value = true
}

const saveMenuHandler = async () => {
  if (!editForm.value.title) return dialog.alert('メニュー名を入力してください')

  const success = await saveMenu({
    id: editTargetId.value || undefined,
    title: editForm.value.title,
    price: editForm.value.price,
    price_with_tax: editForm.value.priceWithTax,
    duration_min: editForm.value.duration_min,
    available_staff_ids: editForm.value.available_staff_ids,
    description: editForm.value.description || '',
    category: editForm.value.category,
    order_priority: Number(editForm.value.order_priority)
  })

  if (success) {
    dialog.alert('保存しました')
    showModal.value = false
  } else {
    dialog.alert('保存失敗', 'エラー')
  }
}

const deleteMenuHandler = async (id: string) => {
  const ok = await dialog.confirm('本当に削除しますか？', '削除確認', 'danger')
  if (!ok) return

  const success = await deleteMenu(id)
  if (!success) {
    dialog.alert('削除失敗', 'エラー')
  }
}

const goBack = () => router.push('/admin/settings')

onMounted(() => { fetchData() })
</script>

<template>
  <div class="settings-container">
    <header class="settings-header">
      <button @click="goBack" class="back-btn">◀ 設定一覧に戻る</button>
      <h2>メニュー設定</h2>
    </header>

    <main class="settings-body">
      <div class="content-wrapper">
        <div class="top-actions">
          <span class="tax-info">消費税率: <strong>{{ taxRate }}%</strong></span>
          <input type="file" ref="fileInput" accept=".csv" style="display: none" @change="importCsv" />
          <button @click="triggerFileUpload" class="csv-btn">📤 CSVインポート</button>
          <button @click="openEditModal()" class="add-btn">＋ 新規メニュー追加</button>
        </div>

        <div v-if="loading">Loading...</div>

        <div v-else class="category-sections">
          <div v-for="cat in categories" :key="cat.id" class="category-section">
            <div class="cat-header">
              <h3 class="cat-title">{{ cat.label }}</h3>
              <button @click="deleteCategoryMenusHandler(cat.id, cat.label)" class="delete-cat-btn"
                title="このカテゴリのメニューを全削除">🗑️
                全削除</button>
            </div>

            <div v-if="menusByCategory[cat.id as keyof typeof menusByCategory].length === 0" class="no-item">メニューがありません
            </div>
            <div class="menu-list">
              <div v-for="menu in menusByCategory[cat.id as keyof typeof menusByCategory]" :key="menu.id"
                class="menu-card">
                <div class="card-header">
                  <div class="title-group"><span class="order-badge">{{ menu.order_priority }}</span>
                    <h3>{{ menu.title }}</h3>
                  </div>
                  <div class="card-actions"><button @click="openEditModal(menu)" class="edit-icon">✏️</button><button
                      @click="deleteMenuHandler(menu.id)" class="delete-icon">🗑️</button></div>
                </div>
                <div class="card-details">
                  <div class="detail-row"><span class="label">価格:</span><span>¥{{ menu.price.toLocaleString() }} <small
                        class="tax-text">(税込 ¥{{ menu.price_with_tax.toLocaleString() }})</small></span></div>
                  <div class="detail-row"><span class="label">時間:</span> {{ menu.duration_min }}分</div>
                  <div class="detail-row"><span class="label">担当:</span>
                    <div class="staff-tags"><span v-for="staffId in menu.available_staff_ids" :key="staffId"
                        class="staff-tag">{{ getStaffName(staffId) }}</span><span
                        v-if="menu.available_staff_ids.length === 0" class="no-staff">担当者なし</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-content">
        <h3>{{ isEditing ? 'メニュー編集' : '新規メニュー' }}</h3>
        <div class="form-group"><label>カテゴリ</label>
          <div class="radio-group"><label v-for="cat in categories" :key="cat.id" class="radio-item"><input type="radio"
                :value="cat.id" v-model="editForm.category">{{ cat.label }}</label></div>
        </div>
        <div class="form-row">
          <div class="form-group priority-group"><label>表示順</label><input type="number"
              v-model="editForm.order_priority" placeholder="10" /></div>
          <div class="form-group title-group-in-form"><label>メニュー名</label><input type="text" v-model="editForm.title"
              placeholder="例: カット＆カラー" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>税抜価格 (円)</label><input type="number" v-model="editForm.price"
              @input="updateInclusive" /></div>
          <div class="form-group"><label>税込価格 (円)</label><input type="number" v-model="editForm.priceWithTax"
              @input="updateExclusive" /></div>
        </div>
        <div class="form-group"><label>所要時間 (分)</label><input type="number" v-model="editForm.duration_min" /></div>
        <div class="form-group"><label>担当可能スタッフ</label>
          <div class="checkbox-group"><label v-for="staff in staffs" :key="staff.id" class="checkbox-item"><input
                type="checkbox" :value="staff.id" v-model="editForm.available_staff_ids"> {{ staff.name }}</label></div>
        </div>
        <div class="form-group"><label>説明 (任意)</label><textarea v-model="editForm.description"></textarea></div>
        <div class="modal-actions"><button @click="showModal = false" class="cancel-btn">キャンセル</button><button
            @click="saveMenuHandler" class="save-btn">保存</button></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-container {
  min-height: 100vh;
  background-color: #f4f5f7;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.settings-header {
  background: #2c3e50;
  color: white;
  padding: 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-shrink: 0;
}

.settings-header h2 {
  margin: 0;
  font-size: 1.2rem;
}

.back-btn {
  background: transparent;
  border: 1px solid #fff;
  color: #fff;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
  width: 100%;
  box-sizing: border-box;
}

.content-wrapper {
  width: 95%;
  margin: 0 auto;
  padding-bottom: 2rem;
}

.top-actions {
  text-align: right;
  margin-bottom: 1.5rem;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 1rem;
}

.tax-info {
  color: #666;
  font-size: 0.9rem;
}

.add-btn {
  background: #42b883;
  color: white;
  border: none;
  padding: 0.8rem 1.5rem;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
}

.csv-btn {
  background: #e67e22;
  color: white;
  border: none;
  padding: 0.8rem 1rem;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
  margin-right: 0.5rem;
}

.category-section {
  margin-bottom: 3rem;
}

/* ヘッダー横並び */
.cat-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  border-left: 5px solid #2c3e50;
  padding-left: 1rem;
}

.cat-title {
  margin: 0;
  color: #333;
  font-size: 1.3rem;
}

.delete-cat-btn {
  background: #e74c3c;
  color: white;
  border: none;
  padding: 0.3rem 0.8rem;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
}

.delete-cat-btn:hover {
  background: #c0392b;
}

.no-item {
  color: #999;
  padding: 1rem;
  background: #fff;
  border-radius: 8px;
  text-align: center;
  border: 1px dashed #ccc;
}

.menu-list {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}

.menu-card {
  background: white;
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-top: 3px solid #ddd;
}

.category-section:nth-child(1) .menu-card {
  border-top-color: #3498db;
}

.category-section:nth-child(2) .menu-card {
  border-top-color: #e91e63;
}

.category-section:nth-child(3) .menu-card {
  border-top-color: #27ae60;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.8rem;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.5rem;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.order-badge {
  background: #eee;
  color: #666;
  font-size: 0.75rem;
  padding: 1px 5px;
  border-radius: 4px;
  font-family: monospace;
}

.card-header h3 {
  margin: 0;
  font-size: 1rem;
  color: #2c3e50;
}

.card-actions button {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  padding: 0.2rem;
}

.detail-row {
  display: flex;
  margin-bottom: 0.4rem;
  font-size: 0.85rem;
}

.detail-row .label {
  font-weight: bold;
  color: #666;
  width: 40px;
  flex-shrink: 0;
}

.tax-text {
  color: #e74c3c;
  font-weight: bold;
  margin-left: 0.5rem;
  font-size: 0.8rem;
}

.staff-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
}

.staff-tag {
  background: #e0f7fa;
  color: #006064;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.75rem;
}

.no-staff {
  color: #e74c3c;
  font-weight: bold;
  font-size: 0.8rem;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
}

.modal-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.modal-header-row h3 {
  margin: 0;
  font-size: 1.2rem;
}

.close-x-btn {
  background: transparent;
  border: none;
  font-size: 1.5rem;
  color: #999;
  cursor: pointer;
  line-height: 1;
  padding: 0;
}

.close-x-btn:hover {
  color: #333;
}

.form-group {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-row {
  display: flex;
  gap: 1rem;
}

.form-row .form-group {
  flex: 1;
}

.priority-group {
  flex: 0 0 80px;
}

.title-group-in-form {
  flex: 1;
}

input,
textarea {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
}

.checkbox-group,
.radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  border: 1px solid #eee;
  padding: 0.8rem;
  border-radius: 4px;
}

.checkbox-item,
.radio-item {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 2rem;
}

.save-btn {
  background: #42b883;
  color: white;
  border: none;
  padding: 0.6rem 2rem;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
}

.cancel-btn {
  background: #eee;
  border: none;
  padding: 0.6rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}
</style>