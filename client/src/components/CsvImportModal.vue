<!-- client/src/components/CsvImportModal.vue -->
<template>
  <div v-if="modelValue" class="modal-overlay" @click.self="close">
    <div class="modal-content import-modal">
      <div class="modal-header">
        <h3>📥 発信写録 顧客データインポート</h3>
        <button class="close-x-btn" @click="close">×</button>
      </div>

      <!-- ステップ1: ファイル選択 -->
      <div v-if="step === 'select'" class="modal-body">
        <div class="drop-zone" @dragover.prevent @drop.prevent="handleFileDrop">
          <input
            type="file"
            ref="fileInput"
            accept=".csv,.txt"
            class="file-input-hidden"
            @change="handleFileChange"
          />
          <div class="drop-text">
            <span class="upload-icon">📄</span>
            <p>発信写録から出力したCSVファイルをドラッグ＆ドロップ</p>
            <button type="button" class="select-file-btn" @click="triggerFileInput">
              ファイルを選択
            </button>
          </div>
        </div>
        <p class="hint">※ Shift-JIS / UTF-8 の両形式に自動対応しています。</p>
      </div>

      <!-- ステップ2: プレビュー確認 -->
      <div v-else-if="step === 'preview'" class="modal-body preview-body">
        <div class="summary-box">
          <span>読み込み総数: <strong>{{ parsedList.length }}</strong> 件</span>
          <span class="badge-new">新規登録対象: <strong>{{ validList.length }}</strong> 件</span>
          <span v-if="skipCount > 0" class="badge-skip">除外（重複・番号なし）: {{ skipCount }} 件</span>
        </div>

        <div class="table-scroll">
          <table class="preview-table">
            <thead>
              <tr>
                <th>状態</th>
                <th>電話番号</th>
                <th>氏名（漢字）</th>
                <th>氏名（カナ）</th>
                <th>住所</th>
                <th>メモ</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(item, idx) in previewList"
                :key="idx"
                :class="{ 'row-skipped': item.isSkip }"
              >
                <td>
                  <span :class="item.isSkip ? 'tag-skip' : 'tag-valid'">
                    {{ item.statusText }}
                  </span>
                </td>
                <td class="font-mono">{{ item.phone_formatted }}</td>
                <td>{{ item.name_kanji || '-' }}</td>
                <td>{{ item.name_kana || '-' }}</td>
                <td class="text-truncate">{{ item.address_full || '-' }}</td>
                <td class="text-truncate">{{ item.memo || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- モーダルアクション -->
      <div class="modal-actions">
        <button type="button" class="cancel-btn" :disabled="isSaving" @click="close">
          キャンセル
        </button>
        <button
          v-if="step === 'preview'"
          type="button"
          class="save-btn"
          :disabled="validList.length === 0 || isSaving"
          @click="executeImport"
        >
          {{ isSaving ? '登録中...' : `${validList.length} 件を登録する` }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { db } from '@/lib/firebase'
import { collection, getDocs, writeBatch, doc, Timestamp } from 'firebase/firestore'
import { useDialogStore } from '@/stores/dialog'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'imported'): void
}>()

const dialog = useDialogStore()
const fileInput = ref<HTMLInputElement | null>(null)
const step = ref<'select' | 'preview'>('select')
const isSaving = ref(false)

interface ParsedCustomer {
  phone_raw: string
  phone_formatted: string
  phone_number2: string
  postal_code: string
  prefecture: string
  address1: string
  address2: string
  address_full: string
  company_name: string
  customer_type: string
  email: string
  rank: string
  name_kanji: string
  name_kana: string
  memo: string
  isSkip: boolean
  statusText: string
}

const parsedList = ref<ParsedCustomer[]>([])

const validList = computed(() => parsedList.value.filter(item => !item.isSkip))
const skipCount = computed(() => parsedList.value.filter(item => item.isSkip).length)
const previewList = computed(() => parsedList.value.slice(0, 100))

const triggerFileInput = () => {
  fileInput.value?.click()
}

// 半角カナを全角カタカナに変換
const kanaMap: Record<string, string> = {
  'ｶﾞ': 'ガ', 'ｷﾞ': 'ギ', 'ｸﾞ': 'グ', 'ｹﾞ': 'ゲ', 'ｺﾞ': 'ゴ',
  'ｻﾞ': 'ザ', 'ｼﾞ': 'ジ', 'ｽﾞ': 'ズ', 'ｾﾞ': 'ゼ', 'ｿﾞ': 'ゾ',
  'ﾀﾞ': 'ダ', 'ﾁﾞ': 'ヂ', 'ﾂﾞ': 'ヅ', 'ﾃﾞ': 'デ', 'ﾄﾞ': 'ド',
  'ﾊﾞ': 'バ', 'ﾋﾞ': 'ビ', 'ﾌﾞ': 'ブ', 'ﾍﾞ': 'ベ', 'ﾎﾞ': 'ボ',
  'ﾊﾟ': 'パ', 'ﾋﾟ': 'ピ', 'ﾌﾟ': 'プ', 'ﾍﾟ': 'ペ', 'ﾎﾟ': 'ポ',
  'ｳﾞ': 'ヴ',
  'ｱ': 'ア', 'ｲ': 'イ', 'ｳ': 'ウ', 'ｴ': 'エ', 'ｵ': 'オ',
  'ｶ': 'カ', 'ｷ': 'キ', 'ｸ': 'ク', 'ｹ': 'ケ', 'ｺ': 'コ',
  'ｻ': 'サ', 'ｼ': 'シ', 'ｽ': 'ス', 'ｾ': 'セ', 'ｿ': 'ソ',
  'ﾀ': 'タ', 'ﾁ': 'チ', 'ﾂ': 'ツ', 'ﾃ': 'テ', 'ﾄ': 'ト',
  'ﾅ': 'ナ', 'ﾆ': 'ニ', 'ﾇ': 'ヌ', 'ﾈ': 'ネ', 'ﾉ': 'ノ',
  'ﾊ': 'ハ', 'ﾋ': 'ヒ', 'ﾌ': 'フ', 'ﾍ': 'ヘ', 'ﾎ': 'ホ',
  'ﾏ': 'マ', 'ﾐ': 'ミ', 'ﾑ': 'ム', 'ﾒ': 'メ', 'ﾓ': 'モ',
  'ﾔ': 'ヤ', 'ﾕ': 'ユ', 'ﾖ': 'ヨ',
  'ﾗ': 'ラ', 'ﾘ': 'リ', 'ﾙ': 'ル', 'ﾚ': 'レ', 'ﾛ': 'ロ',
  'ﾜ': 'ワ', 'ｦ': 'ヲ', 'ﾝ': 'ン',
  'ｧ': 'ァ', 'ｨ': 'ィ', 'ｩ': 'ゥ', 'ｪ': 'ェ', 'ｫ': 'ォ',
  'ｯ': 'ッ', 'ｬ': 'ャ', 'ｭ': 'ュ', 'ｮ': 'ョ', 'ｰ': 'ー'
}

const toFullKana = (str: string) => {
  let res = str
  for (const [k, v] of Object.entries(kanaMap)) {
    res = res.split(k).join(v)
  }
  return res
}

// ダブルクォーテーション考慮のCSV行パーサー
const parseCsvLine = (text: string): string[] => {
  const result: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (c === ',' && !inQuotes) {
      result.push(field.trim())
      field = ''
    } else {
      field += c
    }
  }
  result.push(field.trim())
  return result
}

const handleFileDrop = (e: DragEvent) => {
  const file = e.dataTransfer?.files[0]
  if (file) processFile(file)
}

const handleFileChange = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) processFile(file)
}

const processFile = async (file: File) => {
  try {
    const buffer = await file.arrayBuffer()
    let text = ''
    try {
      const decoder = new TextDecoder('shift-jis', { fatal: true })
      text = decoder.decode(buffer)
    } catch {
      const decoder = new TextDecoder('utf-8')
      text = decoder.decode(buffer)
    }

    const customersSnap = await getDocs(collection(db, 'customers'))
    const existingPhones = new Set<string>()
    customersSnap.docs.forEach(doc => {
      const p1 = (doc.data().phone_number || '').replace(/\D/g, '')
      const p2 = (doc.data().phone_number2 || '').replace(/\D/g, '')
      if (p1) existingPhones.add(p1)
      if (p2) existingPhones.add(p2)
    })

    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
    if (lines.length <= 1) {
      dialog.alert('有効なデータ行が見つかりませんでした。')
      return
    }

    const seenInFile = new Set<string>()
    const parsed: ParsedCustomer[] = []

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i] || '')
      if (cols.length < 11) continue

      const rawPhone1 = cols[0] || ''
      const rawPhone2 = cols[1] || ''
      const phoneRaw = (rawPhone1 || rawPhone2).replace(/\D/g, '')

      const nameKanji = (cols[10] || cols[8] || '').trim()
      const nameKana = toFullKana((cols[9] || cols[7] || '').trim())

      const postalCode = (cols[2] || '').replace(/\D/g, '')
      const prefecture = (cols[3] || '').trim()
      const address1 = (cols[4] || '').trim()
      const address2 = (cols[5] || '').trim()
      const companyName = (cols[8] || '').trim()
      const customerType = (cols[11] || '個人').trim()
      const email = (cols[15] || '').trim()
      const rank = (cols[16] || '').trim()

      const memoParts: string[] = []
      if (cols[12]) memoParts.push(cols[12].trim())
      if (cols[13]) memoParts.push(cols[13].trim())
      if (cols[14]) memoParts.push(cols[14].trim())

      const addressFull = [prefecture, address1, address2].filter(Boolean).join(' ')

      let isSkip = false
      let statusText = '新規'

      if (!phoneRaw) {
        isSkip = true
        statusText = '番号なし'
      } else if (seenInFile.has(phoneRaw)) {
        isSkip = true
        statusText = 'ファイル内重複'
      } else if (existingPhones.has(phoneRaw)) {
        isSkip = true
        statusText = '既存登録済'
      } else {
        seenInFile.add(phoneRaw)
      }

      parsed.push({
        phone_raw: phoneRaw,
        phone_formatted: rawPhone1 || rawPhone2,
        phone_number2: rawPhone1 ? rawPhone2.replace(/\D/g, '') : '',
        postal_code: postalCode,
        prefecture: prefecture,
        address1: address1,
        address2: address2,
        address_full: addressFull,
        company_name: companyName,
        customer_type: customerType,
        email: email,
        rank: rank,
        name_kanji: nameKanji,
        name_kana: nameKana,
        memo: memoParts.join('\n'),
        isSkip,
        statusText
      })
    }

    parsedList.value = parsed
    step.value = 'preview'
  } catch (err) {
    console.error(err)
    dialog.alert('ファイルの読み込み中にエラーが発生しました。')
  }
}

const executeImport = async () => {
  if (validList.value.length === 0) return

  isSaving.value = true
  try {
    const total = validList.value.length
    const CHUNK_SIZE = 400
    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = validList.value.slice(i, i + CHUNK_SIZE)
      const batch = writeBatch(db)

      for (const item of chunk) {
        const docRef = doc(collection(db, 'customers'))
        batch.set(docRef, {
          phone_number: item.phone_raw,
          phone_number2: item.phone_number2,
          name_kanji: item.name_kanji,
          name_kana: item.name_kana || item.name_kanji || '顧客',
          postal_code: item.postal_code,
          prefecture: item.prefecture,
          address1: item.address1,
          address2: item.address2,
          company_name: item.company_name,
          customer_type: item.customer_type,
          email: item.email,
          rank: item.rank,
          memo: item.memo,
          preferred_category: 'barber',
          is_existing_customer: true,
          created_at: Timestamp.now(),
          deleted_at: null
        })
      }
      await batch.commit()
    }

    await dialog.alert(`${total} 件の顧客データをインポートしました！`)
    emit('imported')
    close()
  } catch (err) {
    console.error('一括登録エラー:', err)
    dialog.alert('登録処理中にエラーが発生しました。')
  } finally {
    isSaving.value = false
  }
}

const close = () => {
  step.value = 'select'
  parsedList.value = []
  if (fileInput.value) fileInput.value.value = ''
  emit('update:modelValue', false)
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
}

.import-modal {
  background: white;
  padding: 1.5rem;
  border-radius: 10px;
  width: 90%;
  max-width: 820px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.75rem;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.15rem;
  color: #2c3e50;
}

.close-x-btn {
  background: transparent;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #999;
}

.modal-body {
  padding: 1.2rem 0;
  overflow-y: auto;
}

.drop-zone {
  border: 2px dashed #3498db;
  border-radius: 8px;
  background: #f8fbfe;
  padding: 3rem 1rem;
  text-align: center;
}

.file-input-hidden {
  display: none;
}

.upload-icon {
  font-size: 2.5rem;
}

.select-file-btn {
  margin-top: 1rem;
  padding: 0.5rem 1.5rem;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
}

.hint {
  font-size: 0.8rem;
  color: #888;
  margin-top: 0.5rem;
  text-align: center;
}

.summary-box {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.badge-new {
  background: #e8f5e9;
  color: #2e7d32;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
}

.badge-skip {
  background: #fbe9e7;
  color: #d84315;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
}

.table-scroll {
  max-height: 380px;
  overflow-y: auto;
  border: 1px solid #ddd;
  border-radius: 6px;
}

.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.preview-table th,
.preview-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #eee;
  text-align: left;
}

.preview-table th {
  background: #f5f5f5;
  position: sticky;
  top: 0;
  z-index: 2;
}

.row-skipped {
  background: #fafafa;
  color: #999;
}

.tag-valid {
  background: #27ae60;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
}

.tag-skip {
  background: #95a5a6;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
}

.text-truncate {
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.font-mono {
  font-family: monospace;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  border-top: 1px solid #eee;
  padding-top: 1rem;
}

.cancel-btn {
  background: #eee;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}

.save-btn {
  background: #27ae60;
  color: white;
  border: none;
  padding: 0.5rem 1.5rem;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>