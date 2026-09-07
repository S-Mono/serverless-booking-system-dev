<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router' // 👈 useRoute 追加
import { db } from '../lib/firebase'
import { collection, getDocs, doc, query, where, orderBy, Timestamp, addDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { useDialogStore } from '../stores/dialog'
import CsvImportModal from '@/components/CsvImportModal.vue'

const dialog = useDialogStore()
const router = useRouter()
const route = useRoute()
const functions = getFunctions(undefined, 'asia-northeast1')

interface Customer {
    id: string
    name_kana: string
    name_kanji?: string
    phone_number: string
    phone_number2?: string
    record_number?: string
    customer_type?: string // '個人' | '法人'
    company_name?: string
    postal_code?: string
    prefecture?: string
    address1?: string
    address2?: string
    email?: string
    rank?: string
    memo?: string
    preferred_category?: 'barber' | 'beauty' | 'student' | 'chiro' | null
    // true => 既存顧客, false => 新規顧客
    is_existing_customer?: boolean
    created_at?: Timestamp
    updated_at?: Timestamp
    deleted_at?: Timestamp | null
}

interface ReservationHistory {
    id: string
    start_at: Timestamp
    menu_items: { title: string; price: number }[]
    status: string
}

const customers = ref<Customer[]>([])
const filteredCustomers = ref<Customer[]>([])
const loading = ref(true)
const searchQuery = ref('')

const showModal = ref(false)
const isEditing = ref(false)
const editForm = ref<Customer>({ id: '', name_kana: '', phone_number: '', record_number: '', memo: '', preferred_category: 'barber', is_existing_customer: true })
const history = ref<ReservationHistory[]>([])

// パスワード変更
const showPasswordModal = ref(false)
const newPassword = ref('')
const confirmPassword = ref('')
const isChangingPassword = ref(false)
const targetCustomerId = ref('')

const showImportModal = ref(false)

// インポート完了時の再取得
const handleImported = async () => {
  if (typeof fetchCustomers === 'function') {
    await fetchCustomers()
  }
}

const fetchCustomers = async () => {
    loading.value = true
    try {
        const snap = await getDocs(collection(db, 'customers'))
        customers.value = snap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter((c: any) => !c.deleted_at)
            .sort((a: any, b: any) => (a.name_kana || '').localeCompare(b.name_kana || '')) as Customer[]

        filterCustomers()

        // 🟢 クエリパラメータがあれば、その顧客のモーダルを開く (NEW)
        const openId = route.query.open_id as string
        if (openId) {
            const target = customers.value.find(c => c.id === openId)
            if (target) {
                openEditModal(target)
                // 開いた後はURLを綺麗にする（リロード時の再発防止）
                router.replace('/admin/customers')
            }
        }

    } catch (e) {
        console.error(e)
        dialog.alert('読み込みエラー')
    } finally {
        loading.value = false
    }
}

const filterCustomers = () => {
    const q = searchQuery.value.trim()
    if (!q) {
        filteredCustomers.value = customers.value
    } else {
        filteredCustomers.value = customers.value.filter(c =>
            (c.name_kana && c.name_kana.includes(q)) ||
            (c.phone_number && c.phone_number.includes(q))
        )
    }
}

const fetchHistory = async (customerId: string) => {
    try {
        const q = query(collection(db, 'reservations'), where('customer_id', '==', customerId))
        const snap = await getDocs(q)
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ReservationHistory[]
        history.value = list.sort((a, b) => b.start_at.seconds - a.start_at.seconds)
    } catch (e) { console.error(e) }
}

const openEditModal = async (customer?: Customer) => {
    if (customer) {
        isEditing.value = true
        editForm.value = JSON.parse(JSON.stringify(customer))
        
        // 既存フィールドのフォールバック
        editForm.value.name_kanji = customer.name_kanji || ''
        editForm.value.name_kana = customer.name_kana || ''
        editForm.value.phone_number = formatPhoneNumber(customer.phone_number || '')
        editForm.value.record_number = customer.record_number || ''
        editForm.value.memo = customer.memo || ''
        if (typeof editForm.value.is_existing_customer === 'undefined') editForm.value.is_existing_customer = true
        editForm.value.preferred_category = customer.preferred_category ?? null

        // 新設フィールド（発信写録項目）のフォールバック
        editForm.value.phone_number2 = formatPhoneNumber(customer.phone_number2 || '')
        editForm.value.customer_type = customer.customer_type || '個人'
        editForm.value.company_name = customer.company_name || ''
        editForm.value.postal_code = customer.postal_code || ''
        editForm.value.prefecture = customer.prefecture || ''
        editForm.value.address1 = customer.address1 || ''
        editForm.value.address2 = customer.address2 || ''

        await fetchHistory(customer.id)
    } else {
        isEditing.value = false
        // 新規登録時の初期値
        editForm.value = {
            id: '',
            name_kanji: '',
            name_kana: '',
            phone_number: '',
            phone_number2: '',
            record_number: '',
            customer_type: '個人',
            company_name: '',
            postal_code: '',
            prefecture: '',
            address1: '',
            address2: '',
            memo: '',
            preferred_category: null,
            is_existing_customer: true
        }
        history.value = []
    }
    showModal.value = true
}

const saveCustomer = async () => {
  if (!editForm.value.name_kana) {
    dialog.alert('お名前（カナ）は必須です')
    return
  }

  const payload = {
    name_kanji: (editForm.value.name_kanji || '').trim(),
    name_kana: editForm.value.name_kana.trim(),
    phone_number: (editForm.value.phone_number || '').replace(/\D/g, ''),
    phone_number2: (editForm.value.phone_number2 || '').replace(/\D/g, ''),
    record_number: (editForm.value.record_number || '').trim(),
    customer_type: editForm.value.customer_type || '個人',
    company_name: (editForm.value.company_name || '').trim(),
    postal_code: (editForm.value.postal_code || '').replace(/\D/g, ''),
    prefecture: (editForm.value.prefecture || '').trim(),
    address1: (editForm.value.address1 || '').trim(),
    address2: (editForm.value.address2 || '').trim(),
    preferred_category: editForm.value.preferred_category,
    is_existing_customer: editForm.value.is_existing_customer,
    memo: (editForm.value.memo || '').trim(),
    updated_at: Timestamp.now()
  }

  try {
    if (isEditing.value && editForm.value.id) {
      await updateDoc(doc(db, 'customers', editForm.value.id), payload)
      dialog.alert('顧客情報を更新しました')
    } else {
      await addDoc(collection(db, 'customers'), {
        ...payload,
        created_at: Timestamp.now(),
        deleted_at: null
      })
      dialog.alert('新規顧客を登録しました')
    }
    showModal.value = false
    await fetchCustomers()
  } catch (e) {
    console.error(e)
    dialog.alert('保存に失敗しました')
  }
}

const deleteCustomer = async (id: string) => {
    const ok = await dialog.confirm('この顧客を削除しますか？', '削除確認', 'danger')
    if (!ok) return
    try {
        await updateDoc(doc(db, 'customers', id), { deleted_at: Timestamp.now() })
        dialog.alert('削除しました')
        fetchCustomers()
    } catch (e) { dialog.alert('削除失敗') }
}

const goBack = () => router.push('/admin')
const goToTrash = () => router.push('/admin/customers/trash')
const goToRecords = (customerId: string) => router.push(`/admin/customers/${customerId}/records`)

// パスワード変更
const openPasswordModal = (customerId: string) => {
    targetCustomerId.value = customerId
    newPassword.value = ''
    confirmPassword.value = ''
    showPasswordModal.value = true
}

const changeCustomerPassword = async () => {
    if (!newPassword.value || newPassword.value.length < 6) {
        dialog.alert('パスワードは6文字以上で入力してください。', '入力エラー')
        return
    }

    if (newPassword.value !== confirmPassword.value) {
        dialog.alert('パスワードが一致しません。', '入力エラー')
        return
    }

    isChangingPassword.value = true
    try {
        const adminUpdatePassword = httpsCallable(functions, 'adminUpdatePassword')
        await adminUpdatePassword({
            uid: targetCustomerId.value,
            newPassword: newPassword.value
        })

        dialog.alert('パスワードを変更しました。', '変更完了')
        showPasswordModal.value = false
    } catch (e: any) {
        console.error('パスワード変更エラー', e)
        dialog.alert('パスワード変更に失敗しました。管理者権限を確認してください。', 'エラー')
    } finally {
        isChangingPassword.value = false
    }
}

// 電話番号フォーマット（ハイフン自動補完）
const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/[^0-9]/g, '')
    if (numbers.length <= 3) return numbers
    if (numbers.length <= 6) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
    if (numbers.length === 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
    if (numbers.length === 8) return `${numbers.slice(0, 4)}-${numbers.slice(4)}`
    if (numbers.length === 9) return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6)}`
    if (numbers.length === 10) {
        if (['090', '080', '070', '050'].includes(numbers.slice(0, 3))) {
            return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`
        }
        return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6)}`
    }
    if (numbers.length >= 11) return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`
    return numbers
}

const formatDate = (ts: Timestamp) => {
    if (!ts) return ''
    const d = ts.toDate()
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 🟢 ステータス表示ロジック (NEW)
const getStatusLabel = (h: ReservationHistory) => {
    const now = new Date()
    const start = h.start_at.toDate()

    // 過去の日時なら「済」
    if (start < now) return '済'

    // 未来ならステータスで分岐
    if (h.status === 'pending') return '仮'
    return '確'
}

const getStatusClass = (h: ReservationHistory) => {
    const label = getStatusLabel(h)
    if (label === '済') return 'status-done'
    if (label === '仮') return 'status-pending'
    return 'status-confirmed'
}

onMounted(() => { fetchCustomers() })
</script>

<template>
    <div class="admin-container">
        <header class="admin-header">
            <div class="header-left">
                <button @click="goBack" class="back-btn">◀ ダッシュボード</button>
            </div>
            <h2>顧客管理</h2>
            <div class="header-right">
                <button @click="goToTrash" class="trash-link-btn">🗑️ 削除済み顧客</button>
            </div>
        </header>

        <main class="admin-body">
            <div class="content-wrapper">
                <div class="action-bar">
                    <div class="search-box">
                        <input type="text" v-model="searchQuery" @input="filterCustomers"
                            placeholder="名前(カナ) または 電話番号で検索..." />
                    </div>
                    <button @click="openEditModal()" class="add-btn">＋ 顧客登録</button>
                    <button class="export-btn" @click="showImportModal = true">
                    📥 発信写録CSV取込
                    </button>
                </div>

                <div class="table-container">
                    <table class="customer-table">
                        <thead>
                            <tr>
                                <th>お名前 (カナ)</th>
                                <th>電話番号</th>
                                <th>住所</th>
                                <th>種別</th>
                                <th>よく利用する</th>
                                <th>メモ</th>
                                <th class="actions-col">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="cust in filteredCustomers" :key="cust.id">
                                <td class="name-cell">{{ cust.name_kana }}</td>
                                <td>{{ formatPhoneNumber(cust.phone_number || '') }}</td>
                                <td style="font-size: 0.85rem; max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <span v-if="cust.address1 || cust.prefecture">
                                        {{ cust.prefecture || '' }}{{ cust.address1 || '' }} {{ cust.address2 || '' }}
                                    </span>
                                    <span v-else style="color: #bbb;">-</span>
                                </td>
                                <td>{{ cust.is_existing_customer ? '既存' : '新規' }}</td>
                                <td>
                                    <span v-if="cust.preferred_category === 'beauty'">美容</span>
                                    <span v-else-if="cust.preferred_category === 'barber'">理容</span>
                                    <span v-else-if="cust.preferred_category === 'student'">学生</span>
                                    <span v-else-if="cust.preferred_category === 'chiro'">カイロ</span>
                                    <span v-else style="color: #bbb;">未設定</span>
                                </td>
                                <td class="memo-cell">{{ cust.memo }}</td>
                                <td class="actions-cell">
                                    <button @click="openEditModal(cust)" class="edit-btn">詳細・履歴</button>
                                    <button @click="deleteCustomer(cust.id)" class="delete-btn">削除</button>
                                </td>
                            </tr>
                            <tr v-if="filteredCustomers.length === 0">
                                <td colspan="5" class="no-data">データが見つかりません</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </main>

        <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
            <div class="modal-content">
                <div class="modal-header-row">
                    <h3>{{ isEditing ? '顧客詳細・編集' : '新規顧客登録' }}</h3>
                    <button class="close-x-btn" @click="showModal = false">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-section">
                        <!-- 氏名（漢字・カナ） -->
                        <div class="form-row">
                            <div class="form-group">
                                <label>お名前 (漢字)</label>
                                <input type="text" v-model="editForm.name_kanji" placeholder="山田 太郎" />
                            </div>
                            <div class="form-group">
                                <label>お名前 (カナ) <span class="req">*</span></label>
                                <input type="text" v-model="editForm.name_kana" placeholder="ヤマダ タロウ" />
                            </div>
                        </div>

                        <!-- 電話番号（主・予備） -->
                        <div class="form-row">
                            <div class="form-group">
                                <label>電話番号１（主）</label>
                                <input type="tel" v-model="editForm.phone_number"
                                    @input="(e) => editForm.phone_number = formatPhoneNumber((e.target as HTMLInputElement).value)"
                                    placeholder="090-1234-5678" />
                            </div>
                            <div class="form-group">
                                <label>電話番号２（予備）</label>
                                <input type="tel" v-model="editForm.phone_number2"
                                    @input="(e) => editForm.phone_number2 = formatPhoneNumber((e.target as HTMLInputElement).value)"
                                    placeholder="011-123-4567" />
                            </div>
                        </div>

                        <!-- カルテ番号・個人法人区分・会社名 -->
                        <div class="form-row">
                            <div class="form-group" style="flex: 1;">
                                <label>カルテ番号</label>
                                <input type="text" v-model="editForm.record_number" placeholder="例: 12345" />
                            </div>
                            <div class="form-group" style="flex: 1;">
                                <label>個人 / 法人</label>
                                <select v-model="editForm.customer_type">
                                    <option value="個人">個人</option>
                                    <option value="法人">法人</option>
                                </select>
                            </div>
                            <div class="form-group" style="flex: 2;">
                                <label>会社名</label>
                                <input type="text" v-model="editForm.company_name" placeholder="例: 株式会社〇〇" />
                            </div>
                        </div>

                        <!-- 住所情報（郵便番号・都道府県・市区町村・建物名） -->
                        <div class="form-row">
                            <div class="form-group" style="flex: 1;">
                                <label>郵便番号</label>
                                <input type="text" v-model="editForm.postal_code" placeholder="0060000" maxlength="8" />
                            </div>
                            <div class="form-group" style="flex: 1;">
                                <label>都道府県</label>
                                <input type="text" v-model="editForm.prefecture" placeholder="北海道" />
                            </div>
                            <div class="form-group" style="flex: 2;">
                                <label>市区町村・番地</label>
                                <input type="text" v-model="editForm.address1" placeholder="札幌市手稲区..." />
                            </div>
                        </div>
                        <div class="form-group">
                            <label>建物名・部屋番号</label>
                            <input type="text" v-model="editForm.address2" placeholder="〇〇マンション 101" />
                        </div>

                        <!-- よく利用するメニュー -->
                        <div class="form-group">
                            <label>よく利用するメニュー</label>
                            <div class="radio-group">
                                <label><input type="radio" :value="null" v-model="editForm.preferred_category"> 未設定</label>
                                <label><input type="radio" value="barber" v-model="editForm.preferred_category"> 理容</label>
                                <label><input type="radio" value="beauty" v-model="editForm.preferred_category"> 美容</label>
                                <label><input type="radio" value="student" v-model="editForm.preferred_category"> 学生（中学まで）</label>
                                <label><input type="radio" value="chiro" v-model="editForm.preferred_category"> カイロ</label>
                            </div>
                        </div>

                        <!-- 顧客タイプ -->
                        <div class="form-group">
                            <label>顧客タイプ</label>
                            <div class="radio-group">
                                <label><input type="radio" :value="true" v-model="editForm.is_existing_customer"> 既存顧客</label>
                                <label><input type="radio" :value="false" v-model="editForm.is_existing_customer"> 新規顧客</label>
                            </div>
                        </div>

                        <!-- 顧客メモ -->
                        <div class="form-group">
                            <label>顧客メモ</label>
                            <textarea v-model="editForm.memo" placeholder="特記事項など"></textarea>
                        </div>

                        <div class="modal-actions">
                            <button @click="saveCustomer" class="save-btn">保存する</button>
                            <button v-if="isEditing" @click="goToRecords(editForm.id)" class="records-btn">📋 カルテを見る</button>
                            <button v-if="isEditing" @click="openPasswordModal(editForm.id)" class="password-btn">🔒 パスワード変更</button>
                        </div>
                    </div>
                    <div v-if="isEditing" class="history-section">
                        <h4>予約履歴</h4>
                        <div class="history-list-container">
                            <ul v-if="history.length > 0" class="history-list">
                                <li v-for="h in history" :key="h.id" class="history-item">
                                    <span class="h-date">{{ formatDate(h.start_at) }}</span>
                                    <span class="h-menu">{{ h.menu_items[0]?.title }}</span>
                                    <span class="h-status" :class="getStatusClass(h)">
                                        {{ getStatusLabel(h) }}
                                    </span>
                                </li>
                            </ul>
                            <p v-else class="no-history">履歴はありません</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- パスワード変更モーダル -->
        <div v-if="showPasswordModal" class="modal-overlay" @click.self="showPasswordModal = false">
            <div class="modal-content password-modal">
                <div class="modal-header-row">
                    <h3>🔒 顧客パスワード変更</h3>
                    <button class="close-x-btn" @click="showPasswordModal = false">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-section">
                        <div class="form-group">
                            <label>新しいパスワード <span class="req">*</span></label>
                            <input type="password" v-model="newPassword" placeholder="6文字以上" />
                        </div>
                        <div class="form-group">
                            <label>パスワード確認 <span class="req">*</span></label>
                            <input type="password" v-model="confirmPassword" placeholder="もう一度入力" />
                        </div>
                        <p class="hint-text">※ パスワードは6文字以上で設定してください。</p>
                        <div class="modal-actions">
                            <button @click="changeCustomerPassword" :disabled="isChangingPassword" class="save-btn">
                                {{ isChangingPassword ? '変更中...' : 'パスワードを変更' }}
                            </button>
                            <button @click="showPasswordModal = false" class="cancel-btn">キャンセル</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <CsvImportModal v-model="showImportModal" @imported="handleImported" />
</template>

<style scoped>
/* CSSは既存のものをベースに、ステータス色を追加 */
.admin-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: #f4f5f7;
    overflow: hidden;
}

.admin-header {
    background: #2c3e50;
    color: white;
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
}

.admin-header h2 {
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

.trash-link-btn {
    background: rgba(231, 76, 60, 0.2);
    color: #ffcccc;
    border: 1px solid rgba(231, 76, 60, 0.5);
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background 0.2s;
}

.trash-link-btn:hover {
    background: rgba(231, 76, 60, 0.4);
    color: white;
}

.admin-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    box-sizing: border-box;
}

/* --- コンテナとコンテンツ全体の幅を拡張 --- */
.content-wrapper {
    width: 100%;
    max-width: 1500px; /* 横幅を十分に確保 */
    margin: 0 auto;
    box-sizing: border-box;
}

.action-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.2rem;
    flex-wrap: wrap;
    gap: 1rem;
}

.search-box input {
    padding: 0.6rem 0.8rem;
    width: 320px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.95rem;
}

.add-btn {
    background: #27ae60;
    color: white;
    border: none;
    padding: 0.6rem 1.5rem;
    border-radius: 4px;
    font-weight: bold;
    cursor: pointer;
}

.export-btn {
    background: #3498db;
    color: white;
    border: none;
    padding: 0.6rem 1.2rem;
    border-radius: 4px;
    font-weight: bold;
    cursor: pointer;
}

.table-container {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    overflow-x: auto; /* 画面が狭いときは横スクロール */
    width: 100%;
}

/* --- テーブルと各セルの改行制御 --- */
.customer-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 980px; /* 項目が潰れない最小幅 */
    text-align: left;
}

.customer-table th,
.customer-table td {
    padding: 0.85rem 1rem;
    border-bottom: 1px solid #eee;
    vertical-align: middle;
}

.customer-table th {
    background: #f8f9fa;
    color: #4a5568;
    font-weight: bold;
    font-size: 0.88rem;
    white-space: nowrap; /* ヘッダーの不自然な改行を防止 */
}

/* 氏名セル */
.name-cell {
    min-width: 160px;
    white-space: nowrap;
}

/* 電話番号の縦改行を防止 */
.customer-table td:nth-child(2) {
    white-space: nowrap;
    font-family: monospace;
    font-size: 0.95rem;
}

/* 住所セル */
.customer-table td:nth-child(3) {
    min-width: 180px;
    max-width: 280px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* 種別・利用メニュー */
.customer-table td:nth-child(4),
.customer-table td:nth-child(5) {
    white-space: nowrap;
}

.memo-cell {
    color: #718096;
    font-size: 0.85rem;
    max-width: 200px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.actions-col,
.actions-cell {
    white-space: nowrap;
    text-align: right;
    width: 150px;
}

.no-data {
    text-align: center;
    color: #999;
    padding: 2.5rem;
}

.edit-btn {
    background: #3498db;
    color: white;
    border: none;
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    cursor: pointer;
    margin-right: 0.4rem;
    font-size: 0.85rem;
}

.delete-btn {
    background: #e74c3c;
    color: white;
    border: none;
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
}

/* モーダル */
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
    padding: 1.5rem;
    border-radius: 8px;
    width: 90%;
    max-width: 650px;
    max-height: 90vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}

.modal-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    border-bottom: 1px solid #eee;
    padding-bottom: 0.5rem;
}

.modal-header-row h3 {
    margin: 0;
    font-size: 1.2rem;
    color: #333;
}

.close-x-btn {
    background: transparent;
    border: none;
    font-size: 1.5rem;
    color: #999;
    cursor: pointer;
    padding: 0;
    line-height: 1;
}

.modal-body {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}

.form-section {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
}

.form-row {
    display: flex;
    gap: 0.75rem;
}

.form-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
}

label {
    font-weight: bold;
    font-size: 0.88rem;
    color: #555;
}

.req {
    color: #e74c3c;
}

input,
select,
textarea {
    padding: 0.55rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.95rem;
}

textarea {
    resize: vertical;
    min-height: 80px;
}

.modal-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    margin-top: 0.5rem;
}

.save-btn {
    background: #3498db;
    color: white;
    border: none;
    padding: 0.6rem 1.8rem;
    border-radius: 4px;
    font-weight: bold;
    cursor: pointer;
}

.save-btn:hover {
    background: #2980b9;
}

.records-btn {
    background: #27ae60;
    color: white;
    border: none;
    padding: 0.6rem 1.2rem;
    border-radius: 4px;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.3rem;
}

.records-btn:hover {
    background: #229954;
}

.password-btn {
    background: #9b59b6;
    color: white;
    border: none;
    padding: 0.6rem 1.2rem;
    border-radius: 4px;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.3rem;
}

.password-btn:hover {
    background: #8e44ad;
}

.cancel-btn {
    background: #95a5a6;
    color: white;
    border: none;
    padding: 0.6rem 1.5rem;
    border-radius: 4px;
    font-weight: bold;
    cursor: pointer;
}

.cancel-btn:hover {
    background: #7f8c8d;
}

.password-modal {
    max-width: 400px;
}

.hint-text {
    font-size: 0.85rem;
    color: #666;
    margin: 0.5rem 0;
}

.radio-group {
    display: flex;
    gap: 1.2rem;
    flex-wrap: wrap;
}

.radio-group label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: normal;
    cursor: pointer;
}

.history-section {
    background: #fcfcfc;
    padding: 1rem;
    border-radius: 6px;
    border: 1px solid #eee;
}

.history-section h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.95rem;
    color: #555;
    border-bottom: 2px solid #ddd;
    padding-bottom: 0.3rem;
}

.history-list-container {
    max-height: 200px;
    overflow-y: auto;
}

.history-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.history-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px dashed #eee;
    font-size: 0.85rem;
}

.h-date {
    font-weight: bold;
    color: #333;
}

.h-menu {
    color: #555;
}

.h-status {
    font-size: 0.78rem;
    padding: 2px 6px;
    border-radius: 4px;
    color: white;
}

/* ステータス色分け */
.status-confirmed {
    background: #27ae60;
}

.status-pending {
    background: #9b59b6;
}

.status-done {
    background: #7f8c8d;
}

.no-history {
    color: #999;
    font-size: 0.85rem;
    text-align: center;
    padding: 1rem;
}

@media (max-width: 768px) {
    .form-row {
        flex-direction: column;
        gap: 0.75rem;
    }

    .table-container {
        padding-bottom: 1rem;
    }
}
</style>