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
            <p>発信写録から出力したCSV / TXTファイルをドラッグ＆ドロップ</p>
            <button type="button" class="select-file-btn" @click="triggerFileInput">
              ファイルを選択
            </button>
          </div>
        </div>
        <p class="hint">※ Shift-JIS / UTF-8、カンマ / タブ区切りの両形式に自動対応しています。</p>
      </div>

      <!-- ステップ2: プレビュー確認 -->
      <div v-else-if="step === 'preview'" class="modal-body preview-body">
        <!-- サマリー ＆ 表示フィルター -->
        <div class="summary-bar">
          <div class="summary-counts">
            <span>総数: <strong>{{ parsedList.length }}</strong> 件</span>
            <span class="badge-new">登録対象: <strong>{{ validList.length }}</strong> 件</span>
            <span v-if="skipCount > 0" class="badge-skip">除外: {{ skipCount }} 件</span>
          </div>

          <div class="filter-tabs">
            <button
              type="button"
              :class="{ active: viewFilter === 'all' }"
              @click="viewFilter = 'all'; currentPage = 1"
            >
              すべて ({{ parsedList.length }})
            </button>
            <button
              type="button"
              :class="{ active: viewFilter === 'valid' }"
              @click="viewFilter = 'valid'; currentPage = 1"
            >
              登録対象 ({{ validList.length }})
            </button>
            <button
              v-if="skipCount > 0"
              type="button"
              :class="{ active: viewFilter === 'skip' }"
              @click="viewFilter = 'skip'; currentPage = 1"
            >
              除外 ({{ skipCount }})
            </button>
          </div>
        </div>

        <!-- プレビューテーブル -->
        <div class="table-scroll">
          <table class="preview-table">
            <thead>
              <tr>
                <th style="width: 70px;">状態</th>
                <th style="width: 130px;">電話番号</th>
                <th style="width: 140px;">氏名（漢字）</th>
                <th style="width: 140px;">氏名（カナ）</th>
                <th>住所</th>
                <th style="width: 150px;">メモ</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(item, idx) in paginatedList"
                :key="idx"
                :class="{ 'row-skipped': item.isSkip }"
              >
                <td>
                  <span :class="item.isSkip ? 'tag-skip' : 'tag-valid'">
                    {{ item.statusText }}
                  </span>
                </td>
                <td class="font-mono">
                  <div>{{ item.phone_formatted }}</div>
                  <div v-if="item.phone_number2" class="sub-text">副: {{ item.phone_number2 }}</div>
                </td>
                <td>
                  <div class="font-bold">{{ item.name_kanji || '-' }}</div>
                  <div v-if="item.company_name" class="sub-text">🏢 {{ item.company_name }}</div>
                </td>
                <td>{{ item.name_kana || '-' }}</td>
                <td class="text-truncate" :title="item.address_full">
                  {{ item.address_full || '-' }}
                </td>
                <td class="text-truncate" :title="item.memo">
                  {{ item.memo || '-' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ページネーション操作バー -->
        <div class="pagination-bar">
          <span class="pagination-info">
            {{ filteredList.length }} 件中 {{ (currentPage - 1) * pageSize + 1 }} 〜
            {{ Math.min(currentPage * pageSize, filteredList.length) }} 件を表示
          </span>
          <div class="pagination-controls">
            <button
              type="button"
              :disabled="currentPage <= 1"
              @click="currentPage--"
              class="page-btn"
            >
              ◀ 前へ
            </button>
            <span class="page-current">{{ currentPage }} / {{ totalPages || 1 }} ページ</span>
            <button
              type="button"
              :disabled="currentPage >= totalPages"
              @click="currentPage++"
              class="page-btn"
            >
              次へ ▶
            </button>
          </div>
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
          {{ isSaving ? '登録中...' : `${validList.length} 件を一括登録する` }}
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

// ページネーション ＆ フィルター状態
const currentPage = ref(1)
const pageSize = ref(50)
const viewFilter = ref<'all' | 'valid' | 'skip'>('all')

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

// フィルター別リスト
const filteredList = computed(() => {
  if (viewFilter.value === 'valid') return validList.value
  if (viewFilter.value === 'skip') return parsedList.value.filter(item => item.isSkip)
  return parsedList.value
})

const totalPages = computed(() => Math.ceil(filteredList.value.length / pageSize.value))

// 現在のページに表示するリスト（50件単位）
const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})

const triggerFileInput = () => {
  fileInput.value?.click()
}

// 半角カナ → 全角カタカナ変換テーブル
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

// CSV/TSV行パーサー
const parseLine = (text: string, delimiter: string = ','): string[] => {
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
    } else if (c === delimiter && !inQuotes) {
      result.push(cleanField(field))
      field = ''
    } else {
      field += c
    }
  }
  result.push(cleanField(field))
  return result
}

const cleanField = (val: string) => {
  return val.trim().replace(/^["']|["']$/g, '').trim()
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

    // 既存の顧客電話番号を取得
    const customersSnap = await getDocs(collection(db, 'customers'))
    const existingPhones = new Set<string>()
    customersSnap.docs.forEach(d => {
      const data = d.data()
      const p1 = (data.phone_number || '').replace(/\D/g, '')
      const p2 = (data.phone_number2 || '').replace(/\D/g, '')
      if (p1) existingPhones.add(p1)
      if (p2) existingPhones.add(p2)
    })

    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
    if (lines.length === 0) {
      dialog.alert('ファイルが空です。')
      return
    }

    const firstLine = lines[0] || ''
    const delimiter = (firstLine.split('\t').length > firstLine.split(',').length) ? '\t' : ','
    const firstCols = parseLine(firstLine, delimiter)

    // 完全一致最優先 ＆ 除外指定つきの厳密な列検索関数
    const findIndexStrict = (
      exactKeywords: string[],
      includeKeywords: string[] = [],
      excludeKeywords: string[] = []
    ) => {
      // 1. 完全一致
      for (const kw of exactKeywords) {
        const idx = firstCols.findIndex(col => col === kw)
        if (idx !== -1) return idx
      }
      // 2. 部分一致（除外ワードに引っかからないもの）
      for (const kw of includeKeywords) {
        const idx = firstCols.findIndex(col => col.includes(kw) && !excludeKeywords.some(ex => col.includes(ex)))
        if (idx !== -1) return idx
      }
      return -1
    }

    // 各項目のインデックスを厳密に特定
    const idxMap = {
      phone1: findIndexStrict(['電話番号１', '電話番号1', 'TEL1', '電話番号', 'TEL'], ['電話番号', 'TEL'], ['２', '2']),
      phone2: findIndexStrict(['電話番号２', '電話番号2', 'TEL2', '携帯番号', '携帯'], ['電話番号２', '電話番号2', 'TEL2', '携帯']),
      postal: findIndexStrict(['郵便番号', '郵便', '〒'], ['郵便', '〒']),
      prefecture: findIndexStrict(['都道府県'], ['都道府県']),
      address1: findIndexStrict(['住所１', '住所1', '住所'], ['住所１', '住所1'], ['２', '2', 'コード']),
      address2: findIndexStrict(['住所２', '住所2', '建物名', 'マンション名', '方書'], ['住所２', '住所2', '建物', '方書'], ['コード']),
      companyKana: findIndexStrict(['会社名カナ', '法人名カナ', '勤務先カナ'], ['会社名カナ', '法人名カナ']),
      companyKanji: findIndexStrict(['会社名漢字', '会社名', '法人名', '勤務先'], ['会社名', '法人名'], ['カナ']),
      // ★「会社名カナ」「法人名カナ」を絶対に拾わないように除外指定
      nameKana: findIndexStrict(['名前カナ', '氏名カナ', '名前（カナ）', '氏名（カナ）', 'フリガナ', 'ふりがな'], ['名前カナ', '氏名カナ', 'カナ'], ['会社', '法人']),
      // ★「会社名漢字」を絶対に拾わないように除外指定
      nameKanji: findIndexStrict(['名前漢字', '氏名漢字', '名前', '氏名', 'お名前', '顧客名'], ['名前', '氏名'], ['会社', '法人', 'カナ', 'コード']),
      customerType: findIndexStrict(['個人法人区分', '個人法人', '区分', '種別'], ['個人法人', '区分']),
      memo1: findIndexStrict(['登録メモ１', '登録メモ1', 'メモ１', 'メモ1'], ['メモ１', 'メモ1']),
      memo2: findIndexStrict(['登録メモ２', '登録メモ2', 'メモ２', 'メモ2'], ['メモ２', 'メモ2']),
      memo3: findIndexStrict(['登録メモ３', '登録メモ3', 'メモ３', 'メモ3'], ['メモ３', 'メモ3']),
      email: findIndexStrict(['メールアドレス', 'メール', 'E-mail', 'mail'], ['メール', 'mail']),
      rank: findIndexStrict(['ランク', '会員ランク'], ['ランク'])
    }

    const seenInFile = new Set<string>()
    const parsed: ParsedCustomer[] = []

    // 1行目はヘッダーなのでスキップ
    for (let i = 1; i < lines.length; i++) {
      const cols = parseLine(lines[i] || '', delimiter)
      if (cols.length <= 1) continue

      const getCol = (idx: number) => (idx !== -1 && idx < cols.length) ? cols[idx]! : ''

      const rawPhone1 = getCol(idxMap.phone1)
      const rawPhone2 = getCol(idxMap.phone2)
      const phoneRaw = (rawPhone1 || rawPhone2).replace(/\D/g, '')

      const nameKanji = getCol(idxMap.nameKanji) || getCol(idxMap.companyKanji)
      const nameKana = toFullKana(getCol(idxMap.nameKana) || getCol(idxMap.companyKana))

      const postalCode = getCol(idxMap.postal).replace(/\D/g, '')
      const prefecture = getCol(idxMap.prefecture)
      const address1 = getCol(idxMap.address1)
      const address2 = getCol(idxMap.address2)
      const companyName = getCol(idxMap.companyKanji)
      const customerType = getCol(idxMap.customerType) || '個人'
      const email = getCol(idxMap.email)
      const rank = getCol(idxMap.rank)

      const memoParts: string[] = []
      const m1 = getCol(idxMap.memo1)
      const m2 = getCol(idxMap.memo2)
      const m3 = getCol(idxMap.memo3)
      if (m1) memoParts.push(m1)
      if (m2) memoParts.push(m2)
      if (m3) memoParts.push(m3)

      const postalDisplay = postalCode ? (postalCode.length === 7 ? `〒${postalCode.slice(0, 3)}-${postalCode.slice(3)} ` : `〒${postalCode} `) : ''
      const addressFull = `${postalDisplay}${prefecture}${address1} ${address2}`.trim()

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
        prefecture,
        address1,
        address2,
        address_full: addressFull,
        company_name: companyName,
        customer_type: customerType,
        email,
        rank,
        name_kanji: nameKanji,
        name_kana: nameKana,
        memo: memoParts.join('\n'),
        isSkip,
        statusText
      })
    }

    parsedList.value = parsed
    currentPage.value = 1
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

    await dialog.alert(`${total} 件の顧客データを正常にインポートしました！`)
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
  currentPage.value = 1
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
  width: 95%;
  max-width: 920px;
  max-height: 90vh;
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
  padding: 1rem 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.drop-zone {
  border: 2px dashed #3498db;
  border-radius: 8px;
  background: #f8fbfe;
  padding: 3.5rem 1rem;
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

.summary-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.summary-counts {
  display: flex;
  gap: 0.75rem;
  align-items: center;
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

.filter-tabs {
  display: flex;
  gap: 4px;
  background: #f0f0f0;
  padding: 3px;
  border-radius: 6px;
}

.filter-tabs button {
  padding: 4px 10px;
  font-size: 0.8rem;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: #666;
}

.filter-tabs button.active {
  background: white;
  color: #2c3e50;
  font-weight: bold;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.table-scroll {
  max-height: 420px;
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
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid #eee;
  text-align: left;
}

.preview-table th {
  background: #f8f9fa;
  position: sticky;
  top: 0;
  z-index: 2;
  font-weight: bold;
  color: #444;
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

.font-bold {
  font-weight: bold;
}

.sub-text {
  font-size: 0.75rem;
  color: #7f8c8d;
}

.pagination-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.75rem;
  font-size: 0.85rem;
}

.pagination-info {
  color: #666;
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.page-btn {
  padding: 0.3rem 0.75rem;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-current {
  font-weight: bold;
  color: #333;
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