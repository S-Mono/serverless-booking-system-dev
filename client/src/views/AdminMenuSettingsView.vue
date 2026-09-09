<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDialogStore } from '../stores/dialog'
import { useUserStore } from '../stores/user'
import { useMenu } from '../composables'

const dialog = useDialogStore()
const router = useRouter()
const userStore = useUserStore()

const { menus, staffs, menuTags, isLoading: loading, isOperating, taxRate, menusByCategory, fetchData, calcTaxIncluded, calcTaxExcluded, saveMenu, deleteMenu, deleteCategoryMenus, importFromCsv, getStaffName, getTagName, saveTag, deleteTag } = useMenu({
  onError: (error) => dialog.alert(error.message || '読み込みエラー', 'エラー')
})

const showModal = ref(false)
const isEditing = ref(false)
const editTargetId = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const editForm = ref({
  id: '', title: '', price: 0, priceWithTax: 0, duration_min: 30, available_staff_ids: [] as string[], tags: [] as string[], description: '', category: 'barber' as 'barber' | 'beauty' | 'student' | 'chiro', order_priority: 10
})

const categories: { id: 'barber' | 'beauty' | 'student' | 'chiro'; label: string }[] = [{ id: 'barber', label: '💈 理容' }, { id: 'beauty', label: '💇‍♀️ 美容' }, { id: 'student', label: '🎓 学生（中学まで）' }, { id: 'chiro', label: '💆‍♂️ カイロ' }]

// --- 一覧の表示モード・フィルタ ---
const viewMode = ref<'category' | 'staff'>('staff')
const searchKeyword = ref('')
const filterTagId = ref('')

// キーワード・タグでフィルタされたメニュー
const filteredMenus = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  return menus.value.filter(m => {
    if (keyword) {
      const tagNames = (m.tags ?? []).map(id => getTagName(id)).join(' ')
      const haystack = `${m.title} ${m.description ?? ''} ${tagNames}`.toLowerCase()
      if (!haystack.includes(keyword)) return false
    }
    if (filterTagId.value && !(m.tags ?? []).includes(filterTagId.value)) return false
    return true
  })
})

// カテゴリ別セクション（フィルタ適用済み）
const filteredByCategory = computed(() => ({
  barber: filteredMenus.value.filter(m => m.category === 'barber' || !m.category),
  beauty: filteredMenus.value.filter(m => m.category === 'beauty'),
  student: filteredMenus.value.filter(m => m.category === 'student'),
  chiro: filteredMenus.value.filter(m => m.category === 'chiro')
}))

// 担当者別セクション（複数担当のメニューは各セクションに重複表示）
interface StaffSection { id: string; label: string; menus: typeof menus.value }
const staffSections = computed<StaffSection[]>(() => {
  const sections: StaffSection[] = staffs.value.map(staff => ({
    id: staff.id,
    label: `👤 ${staff.name}`,
    menus: filteredMenus.value.filter(m => (m.available_staff_ids ?? []).includes(staff.id))
  }))
  // 担当未設定（全員対応可）セクション
  const unassigned = filteredMenus.value.filter(m => (m.available_staff_ids ?? []).length === 0)
  if (unassigned.length > 0 || sections.length === 0) {
    sections.push({ id: '__unassigned__', label: '🌐 担当未設定（全員対応可）', menus: unassigned })
  }
  return sections
})

// --- タグ管理 ---
const showTagModal = ref(false)
const newTagName = ref('')
const renamingTagId = ref<string | null>(null)
const renameTagName = ref('')

const addTagHandler = async () => {
  const name = newTagName.value.trim()
  if (!name) return
  const success = await saveTag({ name })
  if (success) {
    newTagName.value = ''
  } else {
    dialog.alert('タグの追加に失敗しました（同名のタグが既に存在する可能性があります）', 'エラー')
  }
}

const startRename = (tagId: string, currentName: string) => {
  renamingTagId.value = tagId
  renameTagName.value = currentName
}

const saveRenameHandler = async () => {
  if (!renamingTagId.value) return
  const name = renameTagName.value.trim()
  if (!name) { renamingTagId.value = null; return }
  const success = await saveTag({ id: renamingTagId.value, name })
  if (!success) dialog.alert('タグ名の変更に失敗しました', 'エラー')
  renamingTagId.value = null
  renameTagName.value = ''
}

const deleteTagHandler = async (tagId: string, tagName: string) => {
  const usedCount = menus.value.filter(m => (m.tags ?? []).includes(tagId)).length
  const msg = usedCount > 0
    ? `タグ「${tagName}」を削除しますか？\n${usedCount}件のメニューからもこのタグが外れます。`
    : `タグ「${tagName}」を削除しますか？`
  const ok = await dialog.confirm(msg, 'タグ削除の確認', 'danger')
  if (!ok) return
  const success = await deleteTag(tagId)
  if (!success) dialog.alert('タグの削除に失敗しました', 'エラー')
}

const updateInclusive = () => { editForm.value.priceWithTax = calcTaxIncluded(editForm.value.price) }
const updateExclusive = () => { editForm.value.price = calcTaxExcluded(editForm.value.priceWithTax) }

// 編集フォームのタグ選択をトグル
const toggleEditFormTag = (tagId: string) => {
  const idx = editForm.value.tags.indexOf(tagId)
  if (idx > -1) {
    editForm.value.tags.splice(idx, 1)
  } else {
    editForm.value.tags.push(tagId)
  }
}

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
    if (!editForm.value.tags) editForm.value.tags = []
  } else {
    isEditing.value = false
    editTargetId.value = null
    editForm.value = { id: '', title: '', price: 4000, priceWithTax: calcTaxIncluded(4000), duration_min: 60, available_staff_ids: staffs.value.map(s => s.id), tags: [], description: '', category: 'barber', order_priority: 10 }
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
    tags: editForm.value.tags,
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
          <button @click="showTagModal = true" class="tag-btn">🏷️ タグ管理</button>
          <button @click="triggerFileUpload" class="csv-btn">📤 CSVインポート</button>
          <button @click="openEditModal()" class="add-btn">＋ 新規メニュー追加</button>
        </div>

        <div class="list-controls">
          <input type="text" v-model="searchKeyword" class="list-search-input"
            placeholder="🔍 キーワード検索（メニュー名・説明・タグ）">
          <select v-model="filterTagId" class="list-tag-select">
            <option value="">タグ: 全て</option>
            <option v-for="tag in menuTags" :key="tag.id" :value="tag.id">{{ tag.name }}</option>
          </select>
          <div class="view-mode-toggle">
            <button :class="{ active: viewMode === 'staff' }" @click="viewMode = 'staff'">👤 担当別</button>
            <button :class="{ active: viewMode === 'category' }" @click="viewMode = 'category'">📂 カテゴリ別</button>
          </div>
        </div>

        <div v-if="loading">Loading...</div>

        <!-- カテゴリ別表示 -->
        <div v-else-if="viewMode === 'category'" class="category-sections">
          <div v-for="cat in categories" :key="cat.id" class="category-section">
            <div class="cat-header">
              <h3 class="cat-title">{{ cat.label }}</h3>
              <button @click="deleteCategoryMenusHandler(cat.id, cat.label)" class="delete-cat-btn"
                title="このカテゴリのメニューを全削除">🗑️
                全削除</button>
            </div>

            <div v-if="filteredByCategory[cat.id as keyof typeof filteredByCategory].length === 0" class="no-item">メニューがありません
            </div>
            <div class="menu-list">
              <div v-for="menu in filteredByCategory[cat.id as keyof typeof filteredByCategory]" :key="menu.id"
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
                  <div v-if="(menu.tags ?? []).length > 0" class="detail-row"><span class="label">タグ:</span>
                    <div class="staff-tags"><span v-for="tagId in menu.tags" :key="tagId"
                        class="menu-tag-badge">{{ getTagName(tagId) }}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 担当者別表示 -->
        <div v-else class="category-sections">
          <div v-for="section in staffSections" :key="section.id" class="category-section">
            <div class="cat-header">
              <h3 class="cat-title">{{ section.label }}</h3>
              <span class="section-count">{{ section.menus.length }}件</span>
            </div>
            <div v-if="section.menus.length === 0" class="no-item">メニューがありません</div>
            <div class="menu-list">
              <div v-for="menu in section.menus" :key="menu.id" class="menu-card">
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
                  <div class="detail-row"><span class="label">区分:</span>
                    <span class="menu-tag-badge category-badge">{{ categories.find(c => c.id === (menu.category || 'barber'))?.label }}</span>
                  </div>
                  <div v-if="(menu.tags ?? []).length > 0" class="detail-row"><span class="label">タグ:</span>
                    <div class="staff-tags"><span v-for="tagId in menu.tags" :key="tagId"
                        class="menu-tag-badge">{{ getTagName(tagId) }}</span></div>
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
          <div class="segmented-control">
            <button v-for="cat in categories" :key="cat.id" type="button"
              class="segment-btn" :class="{ active: editForm.category === cat.id }"
              @click="editForm.category = cat.id">{{ cat.label }}</button>
          </div>
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
        <div class="form-group"><label>担当可能スタッフ <small class="hint-inline">※ 未選択 = 全員対応可</small></label>
          <div class="checkbox-group"><label v-for="staff in staffs" :key="staff.id" class="checkbox-item"><input
                type="checkbox" :value="staff.id" v-model="editForm.available_staff_ids"> {{ staff.name }}</label></div>
        </div>
        <div class="form-group"><label>タグ <small class="hint-inline">※ クリックで選択・解除</small></label>
          <div v-if="menuTags.length === 0" class="no-tags-msg">タグが未登録です。「🏷️ タグ管理」から追加してください。</div>
          <div v-else class="tag-chip-group">
            <button v-for="tag in menuTags" :key="tag.id" type="button"
              class="tag-chip" :class="{ active: editForm.tags.includes(tag.id) }"
              @click="toggleEditFormTag(tag.id)">
              <span v-if="editForm.tags.includes(tag.id)" class="chip-check">✓</span>{{ tag.name }}
            </button>
          </div>
        </div>
        <div class="form-group"><label>説明 (任意)</label><textarea v-model="editForm.description"></textarea></div>
        <div class="modal-actions"><button @click="showModal = false" class="cancel-btn">キャンセル</button><button
            @click="saveMenuHandler" class="save-btn">保存</button></div>
      </div>
    </div>

    <!-- タグ管理モーダル -->
    <div v-if="showTagModal" class="modal-overlay" @click.self="showTagModal = false">
      <div class="modal-content">
        <div class="modal-header-row">
          <h3>🏷️ タグ管理</h3>
          <button class="close-x-btn" @click="showTagModal = false">×</button>
        </div>
        <div class="tag-add-row">
          <input type="text" v-model="newTagName" placeholder="新しいタグ名（例: 新規限定）"
            @keyup.enter="addTagHandler" />
          <button @click="addTagHandler" class="save-btn" :disabled="isOperating">追加</button>
        </div>
        <div v-if="menuTags.length === 0" class="no-item">タグが登録されていません</div>
        <ul v-else class="tag-manage-list">
          <li v-for="tag in menuTags" :key="tag.id" class="tag-manage-item">
            <template v-if="renamingTagId === tag.id">
              <input type="text" v-model="renameTagName" class="tag-rename-input"
                @keyup.enter="saveRenameHandler" @keyup.esc="renamingTagId = null" />
              <button @click="saveRenameHandler" class="tag-action-btn" :disabled="isOperating">✔</button>
              <button @click="renamingTagId = null" class="tag-action-btn">✖</button>
            </template>
            <template v-else>
              <span class="tag-name">{{ tag.name }}</span>
              <span class="tag-usage">{{ menus.filter(m => (m.tags ?? []).includes(tag.id)).length }}件のメニュー</span>
              <button @click="startRename(tag.id, tag.name)" class="tag-action-btn" title="名前を変更">✏️</button>
              <button @click="deleteTagHandler(tag.id, tag.name)" class="tag-action-btn" title="削除">🗑️</button>
            </template>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-container {
  /* main内に収めるため100vhではなく100%を使用（フッターはみ出し防止） */
  height: 100%;
  background-color: #f4f5f7;
  display: flex;
  flex-direction: column;
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

.tag-btn {
  background: #8e44ad;
  color: white;
  border: none;
  padding: 0.8rem 1rem;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
  margin-right: 0.5rem;
}

.list-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.list-search-input {
  flex: 1;
  min-width: 200px;
  padding: 0.6rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.95rem;
  box-sizing: border-box;
}

.list-tag-select {
  padding: 0.6rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.9rem;
  min-width: 140px;
}

.view-mode-toggle {
  display: flex;
  gap: 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  overflow: hidden;
}

.view-mode-toggle button {
  background: #fff;
  border: none;
  padding: 0.6rem 1rem;
  font-size: 0.9rem;
  cursor: pointer;
  color: #666;
}

.view-mode-toggle button.active {
  background: #2c3e50;
  color: #fff;
  font-weight: bold;
}

.section-count {
  background: #eee;
  color: #666;
  font-size: 0.8rem;
  padding: 2px 8px;
  border-radius: 10px;
}

.menu-tag-badge {
  background: #f3e5f5;
  color: #6a1b9a;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.75rem;
}

.category-badge {
  background: #eceff1;
  color: #455a64;
}

.no-tags-msg {
  color: #999;
  font-size: 0.85rem;
  padding: 0.5rem;
  border: 1px dashed #ccc;
  border-radius: 4px;
}

.hint-inline {
  color: #999;
  font-weight: normal;
  font-size: 0.75rem;
}

/* タグ選択（バッジ型トグル） */
.tag-chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  border: 1px solid #eee;
  padding: 0.8rem;
  border-radius: 4px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem 0.9rem;
  border: 1px solid #ddd;
  border-radius: 16px;
  background: #fff;
  color: #555;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;
}

.tag-chip:hover {
  border-color: #6a1b9a;
  color: #6a1b9a;
}

.tag-chip.active {
  background: #6a1b9a;
  color: #fff;
  border-color: #6a1b9a;
  font-weight: bold;
}

.chip-check {
  font-size: 0.75rem;
}

.tag-add-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.tag-add-row input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
}

.tag-manage-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.tag-manage-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.3rem;
  border-bottom: 1px solid #eee;
}

.tag-name {
  font-weight: bold;
  color: #2c3e50;
  flex: 1;
}

.tag-usage {
  color: #999;
  font-size: 0.8rem;
}

.tag-action-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  padding: 0.2rem;
}

.tag-rename-input {
  flex: 1;
  padding: 0.4rem;
  border: 1px solid #42b883;
  border-radius: 4px;
  font-size: 1rem;
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

/* カテゴリ選択（セグメントボタン） */
.segmented-control {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  border: 1px solid #eee;
  padding: 0.8rem;
  border-radius: 4px;
}

.segment-btn {
  flex: 1;
  min-width: 90px;
  padding: 0.6rem 0.8rem;
  border: 1px solid #ddd;
  border-radius: 20px;
  background: #fff;
  color: #555;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.segment-btn:hover {
  border-color: #2c3e50;
  color: #2c3e50;
}

.segment-btn.active {
  background: #2c3e50;
  color: #fff;
  border-color: #2c3e50;
  font-weight: bold;
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