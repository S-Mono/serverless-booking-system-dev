<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { db, auth } from '../lib/firebase'
import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore'
import { onAuthStateChanged, type Unsubscribe } from 'firebase/auth'
import * as XLSX from 'xlsx'

interface Reservation {
    id: string
    customer_name: string
    start_at: Timestamp
    menu_items: Array<{ title: string; price: number }>
    total_price?: number
}

interface DailySales {
    date: string
    sales: number
    count: number
    reservations: Reservation[]
}

const router = useRouter()
const loading = ref(true)
const currentUser = ref<any>(null)

// 今月の範囲を初期値として設定
const getInitialDates = (): { currentStart: string; currentEnd: string; pastStart: string; pastEnd: string } => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const lastYearStart = new Date(start)
    lastYearStart.setFullYear(lastYearStart.getFullYear() - 1)
    const lastYearEnd = new Date(end)
    lastYearEnd.setFullYear(lastYearEnd.getFullYear() - 1)
    return {
        currentStart: start.toISOString().split('T')[0] as string,
        currentEnd: end.toISOString().split('T')[0] as string,
        pastStart: lastYearStart.toISOString().split('T')[0] as string,
        pastEnd: lastYearEnd.toISOString().split('T')[0] as string
    }
}

const initialDates = getInitialDates()

// 現在の期間
const currentStartDate = ref(initialDates.currentStart)
const currentEndDate = ref(initialDates.currentEnd)

// 過去の期間（デフォルトは去年）
const pastStartDate = ref(initialDates.pastStart)
const pastEndDate = ref(initialDates.pastEnd)

// 過去データの表示フラグ
const showPastData = ref(false)

// データ
const currentSalesData = ref<DailySales[]>([])
const pastSalesData = ref<DailySales[]>([])

// 合計
const currentTotal = computed(() =>
    currentSalesData.value.reduce((sum, day) => sum + day.sales, 0)
)
const currentCount = computed(() =>
    currentSalesData.value.reduce((sum, day) => sum + day.count, 0)
)
const pastTotal = computed(() =>
    pastSalesData.value.reduce((sum, day) => sum + day.sales, 0)
)
const pastCount = computed(() =>
    pastSalesData.value.reduce((sum, day) => sum + day.count, 0)
)

// 今月の月初・月末を取得
const getThisMonthRange = () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { start, end }
}

// 去年の同期間を取得
const getLastYearRange = (startDate: Date, endDate: Date) => {
    const lastYearStart = new Date(startDate)
    lastYearStart.setFullYear(lastYearStart.getFullYear() - 1)
    const lastYearEnd = new Date(endDate)
    lastYearEnd.setFullYear(lastYearEnd.getFullYear() - 1)
    return { start: lastYearStart, end: lastYearEnd }
}

// 日付をYYYY-MM-DD形式に変換
const formatDateInput = (date: Date): string => {
    return date.toISOString().split('T')[0] as string
}

// 日付文字列をDateに変換
const parseDate = (dateStr: string): Date => {
    return new Date(dateStr + 'T00:00:00')
}

// 予約データを取得して日別に集計
const fetchSalesData = async (startDate: Date, endDate: Date): Promise<DailySales[]> => {
    try {
        const startTimestamp = Timestamp.fromDate(startDate)
        const endDate24 = new Date(endDate)
        endDate24.setHours(23, 59, 59, 999)
        const endTimestamp = Timestamp.fromDate(endDate24)

        const q = query(
            collection(db, 'reservations'),
            where('start_at', '>=', startTimestamp),
            where('start_at', '<=', endTimestamp),
            orderBy('start_at', 'asc')
        )

        const snap = await getDocs(q)
        const reservations = snap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as Reservation[]

        // 日別に集計
        const dailyMap = new Map<string, DailySales>()

        reservations.forEach(reservation => {
            const date = reservation.start_at.toDate()
            const dateKey = formatDateInput(date)

            if (!dailyMap.has(dateKey)) {
                dailyMap.set(dateKey, {
                    date: dateKey,
                    sales: 0,
                    count: 0,
                    reservations: []
                })
            }

            const dailyData = dailyMap.get(dateKey)!
            dailyData.sales += reservation.total_price || 0
            dailyData.count += 1
            dailyData.reservations.push(reservation)
        })

        // 日付順にソート
        return Array.from(dailyMap.values()).sort((a, b) =>
            a.date.localeCompare(b.date)
        )
    } catch (e) {
        console.error('売上データ取得エラー:', e)
        return []
    }
}

// 現在の期間のデータ取得
const loadCurrentData = async () => {
    if (!currentStartDate.value || !currentEndDate.value) return
    loading.value = true
    const start = parseDate(currentStartDate.value)
    const end = parseDate(currentEndDate.value)
    currentSalesData.value = await fetchSalesData(start, end)
    loading.value = false
}

// 過去の期間のデータ取得
const loadPastData = async () => {
    if (!pastStartDate.value || !pastEndDate.value) return
    const start = parseDate(pastStartDate.value)
    const end = parseDate(pastEndDate.value)
    pastSalesData.value = await fetchSalesData(start, end)
}

// 期間変更時に自動的に去年の期間も更新
watch([currentStartDate, currentEndDate], () => {
    if (!currentStartDate.value || !currentEndDate.value) return
    const start = parseDate(currentStartDate.value)
    const end = parseDate(currentEndDate.value)
    const lastYear = getLastYearRange(start, end)
    pastStartDate.value = formatDateInput(lastYear.start)
    pastEndDate.value = formatDateInput(lastYear.end)
})

// 初期化
let unsubscribeAuth: Unsubscribe | null = null

onMounted(() => {
    unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser.value = user
            // データ取得
            await loadCurrentData()
        } else {
            router.push('/admin-login')
        }
    })
})

onUnmounted(() => {
    if (unsubscribeAuth) {
        unsubscribeAuth()
        console.log('[AdminSalesView] Auth listener unsubscribed')
    }
})

// 日付のフォーマット（表示用）
const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00')
    return `${date.getMonth() + 1}/${date.getDate()}(${['日', '月', '火', '水', '木', '金', '土'][date.getDay()]})`
}

// 最大売上（グラフのスケール用）
const maxSales = computed(() => {
    const currentMax = Math.max(...currentSalesData.value.map(d => d.sales), 0)
    const pastMax = showPastData.value ? Math.max(...pastSalesData.value.map(d => d.sales), 0) : 0
    return Math.max(currentMax, pastMax)
})

// グラフの高さ計算（パーセンテージ）
const getBarHeight = (sales: number) => {
    if (maxSales.value === 0) return '0%'
    return `${(sales / maxSales.value) * 100}%`
}

// 検索実行
const handleSearch = async () => {
    await loadCurrentData()
    if (showPastData.value) {
        await loadPastData()
    }
}

// 過去データの表示切り替え
const togglePastData = async () => {
    showPastData.value = !showPastData.value
    if (showPastData.value && pastSalesData.value.length === 0) {
        await loadPastData()
    }
}

// Excelエクスポート機能
const exportToExcel = () => {
    // ワークブックを作成
    const wb = XLSX.utils.book_new()

    // 現在の期間のシート
    const currentSheetData: any[][] = [
        ['売上分析レポート'],
        ['期間:', `${currentStartDate.value} 〜 ${currentEndDate.value}`],
        [],
        ['サマリー'],
        ['総売上', `¥${currentTotal.value.toLocaleString()}`],
        ['予約件数', `${currentCount.value}件`],
        ['平均単価', `¥${currentCount.value > 0 ? Math.round(currentTotal.value / currentCount.value).toLocaleString() : 0}`],
        [],
        ['日別売上詳細'],
        ['日付', '曜日', '売上', '予約件数']
    ]

    currentSalesData.value.forEach(day => {
        const date = new Date(day.date + 'T00:00:00')
        const weekday = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()]
        currentSheetData.push([
            day.date,
            weekday,
            day.sales,
            day.count
        ])
    })

    // 合計行を追加
    currentSheetData.push([
        '合計',
        '',
        currentTotal.value,
        currentCount.value
    ])

    const wsCurrents = XLSX.utils.aoa_to_sheet(currentSheetData)

    // 列幅を設定
    wsCurrents['!cols'] = [
        { wch: 15 }, // 日付
        { wch: 8 },  // 曜日
        { wch: 15 }, // 売上
        { wch: 10 }  // 予約件数
    ]

    XLSX.utils.book_append_sheet(wb, wsCurrents, '現在の期間')

    // 過去の期間のシート（表示中の場合）
    if (showPastData.value && pastSalesData.value.length > 0) {
        const pastSheetData: any[][] = [
            ['売上分析レポート（過去）'],
            ['期間:', `${pastStartDate.value} 〜 ${pastEndDate.value}`],
            [],
            ['サマリー'],
            ['総売上', `¥${pastTotal.value.toLocaleString()}`],
            ['予約件数', `${pastCount.value}件`],
            ['平均単価', `¥${pastCount.value > 0 ? Math.round(pastTotal.value / pastCount.value).toLocaleString() : 0}`],
            [],
            ['比較'],
            ['売上増減', `${currentTotal.value > pastTotal.value ? '+' : ''}¥${(currentTotal.value - pastTotal.value).toLocaleString()}`],
            ['売上増減率', `${currentTotal.value > pastTotal.value ? '+' : ''}${((currentTotal.value - pastTotal.value) / (pastTotal.value || 1) * 100).toFixed(1)}%`],
            ['予約件数増減', `${currentCount.value > pastCount.value ? '+' : ''}${currentCount.value - pastCount.value}件`],
            [],
            ['日別売上詳細'],
            ['日付', '曜日', '売上', '予約件数']
        ]

        pastSalesData.value.forEach(day => {
            const date = new Date(day.date + 'T00:00:00')
            const weekday = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()]
            pastSheetData.push([
                day.date,
                weekday,
                day.sales,
                day.count
            ])
        })

        // 合計行を追加
        pastSheetData.push([
            '合計',
            '',
            pastTotal.value,
            pastCount.value
        ])

        const wsPast = XLSX.utils.aoa_to_sheet(pastSheetData)

        // 列幅を設定
        wsPast['!cols'] = [
            { wch: 15 }, // 日付
            { wch: 8 },  // 曜日
            { wch: 15 }, // 売上
            { wch: 10 }  // 予約件数
        ]

        XLSX.utils.book_append_sheet(wb, wsPast, '過去の期間')
    }

    // ファイル名を生成（現在の日時を含む）
    const now = new Date()
    const filename = `売上分析_${currentStartDate.value}_${currentEndDate.value}_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`

    // ファイルをダウンロード
    XLSX.writeFile(wb, filename)
}
</script>

<template>
    <div class="sales-container">
        <div class="page-header">
            <router-link to="/admin" class="back-btn">◀ 管理画面</router-link>
            <h2 class="page-title">売上分析</h2>
        </div>

        <div class="content-wrapper">
            <!-- 現在の期間 -->
            <div class="main-pane" :class="{ 'with-past': showPastData }">
                <div class="period-controls">
                    <h3 class="period-title">📊 現在の期間</h3>
                    <div class="date-inputs">
                        <input type="date" v-model="currentStartDate" class="date-input">
                        <span class="separator">〜</span>
                        <input type="date" v-model="currentEndDate" class="date-input">
                        <button @click="handleSearch" class="search-btn">検索</button>
                        <button @click="togglePastData" class="toggle-past-btn">
                            {{ showPastData ? '📂 過去を非表示' : '📈 過去と比較' }}
                        </button>
                        <button @click="exportToExcel" class="export-btn" :disabled="currentSalesData.length === 0">
                            📥 Excelダウンロード
                        </button>
                    </div>
                </div>

                <div v-if="loading" class="loading">読み込み中...</div>

                <div v-else>
                    <!-- サマリー -->
                    <div class="summary-cards">
                        <div class="summary-card">
                            <div class="summary-label">総売上</div>
                            <div class="summary-value">¥{{ currentTotal.toLocaleString() }}</div>
                        </div>
                        <div class="summary-card">
                            <div class="summary-label">予約件数</div>
                            <div class="summary-value">{{ currentCount }}件</div>
                        </div>
                        <div class="summary-card">
                            <div class="summary-label">平均単価</div>
                            <div class="summary-value">
                                ¥{{ currentCount > 0 ? Math.round(currentTotal / currentCount).toLocaleString() : 0 }}
                            </div>
                        </div>
                    </div>

                    <!-- グラフ（棒グラフ + 折れ線） -->
                    <div class="chart-container">
                        <div class="chart-header">日別売上推移</div>
                        <div class="chart-wrapper">
                            <div class="chart-y-axis">
                                <div class="y-label">¥{{ Math.round(maxSales).toLocaleString() }}</div>
                                <div class="y-label">¥{{ Math.round(maxSales * 0.5).toLocaleString() }}</div>
                                <div class="y-label">¥0</div>
                            </div>
                            <div class="chart-content">
                                <svg class="line-chart" viewBox="0 0 100 100" preserveAspectRatio="none">
                                    <!-- 現在の折れ線 -->
                                    <polyline v-if="currentSalesData.length > 0" :points="currentSalesData.map((d, i) =>
                                        `${(i / (currentSalesData.length - 1)) * 100},${100 - (d.sales / maxSales) * 100}`
                                    ).join(' ')" fill="none" stroke="#42b883" stroke-width="2"
                                        vector-effect="non-scaling-stroke" />
                                </svg>
                                <div class="bars-container">
                                    <div v-for="day in currentSalesData" :key="day.date" class="bar-wrapper">
                                        <div class="bar" :style="{ height: getBarHeight(day.sales) }">
                                            <div class="bar-tooltip">
                                                <div>{{ formatDisplayDate(day.date) }}</div>
                                                <div>¥{{ day.sales.toLocaleString() }}</div>
                                                <div>{{ day.count }}件</div>
                                            </div>
                                        </div>
                                        <div class="bar-label">{{ formatDisplayDate(day.date) }}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- リスト -->
                    <div class="list-container">
                        <div class="list-header">
                            <span>日付</span>
                            <span>売上</span>
                            <span>件数</span>
                        </div>
                        <div v-for="day in currentSalesData" :key="day.date" class="list-item">
                            <span class="list-date">{{ formatDisplayDate(day.date) }}</span>
                            <span class="list-sales">¥{{ day.sales.toLocaleString() }}</span>
                            <span class="list-count">{{ day.count }}件</span>
                        </div>
                        <div v-if="currentSalesData.length === 0" class="no-data">
                            データがありません
                        </div>
                    </div>
                </div>
            </div>

            <!-- 過去の期間（折りたたみ可能） -->
            <div v-if="showPastData" class="past-pane">
                <div class="period-controls">
                    <h3 class="period-title">📅 過去の期間</h3>
                    <div class="date-inputs">
                        <input type="date" v-model="pastStartDate" class="date-input">
                        <span class="separator">〜</span>
                        <input type="date" v-model="pastEndDate" class="date-input">
                        <button @click="loadPastData" class="search-btn">検索</button>
                    </div>
                </div>

                <!-- サマリー -->
                <div class="summary-cards">
                    <div class="summary-card past">
                        <div class="summary-label">総売上</div>
                        <div class="summary-value">¥{{ pastTotal.toLocaleString() }}</div>
                        <div class="summary-diff"
                            :class="{ 'positive': currentTotal > pastTotal, 'negative': currentTotal < pastTotal }">
                            {{ currentTotal > pastTotal ? '+' : '' }}{{ ((currentTotal - pastTotal) / (pastTotal || 1) *
                                100).toFixed(1) }}%
                        </div>
                    </div>
                    <div class="summary-card past">
                        <div class="summary-label">予約件数</div>
                        <div class="summary-value">{{ pastCount }}件</div>
                        <div class="summary-diff"
                            :class="{ 'positive': currentCount > pastCount, 'negative': currentCount < pastCount }">
                            {{ currentCount > pastCount ? '+' : '' }}{{ currentCount - pastCount }}件
                        </div>
                    </div>
                    <div class="summary-card past">
                        <div class="summary-label">平均単価</div>
                        <div class="summary-value">
                            ¥{{ pastCount > 0 ? Math.round(pastTotal / pastCount).toLocaleString() : 0 }}
                        </div>
                    </div>
                </div>

                <!-- グラフ -->
                <div class="chart-container">
                    <div class="chart-header">日別売上推移（過去）</div>
                    <div class="chart-wrapper">
                        <div class="chart-y-axis">
                            <div class="y-label">¥{{ Math.round(maxSales).toLocaleString() }}</div>
                            <div class="y-label">¥{{ Math.round(maxSales * 0.5).toLocaleString() }}</div>
                            <div class="y-label">¥0</div>
                        </div>
                        <div class="chart-content">
                            <svg class="line-chart" viewBox="0 0 100 100" preserveAspectRatio="none">
                                <!-- 過去の折れ線 -->
                                <polyline v-if="pastSalesData.length > 0" :points="pastSalesData.map((d, i) =>
                                    `${(i / (pastSalesData.length - 1)) * 100},${100 - (d.sales / maxSales) * 100}`
                                ).join(' ')" fill="none" stroke="#95a5a6" stroke-width="2"
                                    vector-effect="non-scaling-stroke" />
                            </svg>
                            <div class="bars-container">
                                <div v-for="day in pastSalesData" :key="day.date" class="bar-wrapper">
                                    <div class="bar past" :style="{ height: getBarHeight(day.sales) }">
                                        <div class="bar-tooltip">
                                            <div>{{ formatDisplayDate(day.date) }}</div>
                                            <div>¥{{ day.sales.toLocaleString() }}</div>
                                            <div>{{ day.count }}件</div>
                                        </div>
                                    </div>
                                    <div class="bar-label">{{ formatDisplayDate(day.date) }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- リスト -->
                <div class="list-container">
                    <div class="list-header">
                        <span>日付</span>
                        <span>売上</span>
                        <span>件数</span>
                    </div>
                    <div v-for="day in pastSalesData" :key="day.date" class="list-item">
                        <span class="list-date">{{ formatDisplayDate(day.date) }}</span>
                        <span class="list-sales">¥{{ day.sales.toLocaleString() }}</span>
                        <span class="list-count">{{ day.count }}件</span>
                    </div>
                    <div v-if="pastSalesData.length === 0" class="no-data">
                        データがありません
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.sales-container {
    max-width: 100%;
    margin: 0 auto;
    height: calc(100vh - 60px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.page-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem 1rem;
    border-bottom: 1px solid #eee;
    background-color: #fff;
}

.page-title {
    font-size: 1.5rem;
    margin: 0;
    color: #333;
}

.back-btn {
    background: transparent;
    border: 1px solid #ccc;
    color: #555;
    padding: 0.4rem 1rem;
    border-radius: 20px;
    cursor: pointer;
    text-decoration: none;
    font-size: 0.9rem;
    display: inline-block;
}

.back-btn:hover {
    background: #f0f0f0;
    color: #333;
}

.content-wrapper {
    flex: 1;
    display: flex;
    gap: 1rem;
    padding: 1rem;
    overflow: hidden;
}

.main-pane {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.main-pane.with-past {
    flex: 0 0 50%;
}

.past-pane {
    flex: 0 0 48%;
    overflow-y: auto;
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.period-controls {
    margin-bottom: 1.5rem;
}

.period-title {
    font-size: 1.2rem;
    margin: 0 0 0.5rem 0;
    color: #333;
}

.date-inputs {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
}

.date-input {
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.9rem;
}

.separator {
    color: #666;
}

.search-btn {
    background: #42b883;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background 0.2s;
}

.search-btn:hover {
    background: #369970;
}

.toggle-past-btn {
    background: #6c757d;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background 0.2s;
}

.toggle-past-btn:hover {
    background: #5a6268;
}

.export-btn {
    background: #28a745;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background 0.2s;
}

.export-btn:hover:not(:disabled) {
    background: #218838;
}

.export-btn:disabled {
    background: #6c757d;
    cursor: not-allowed;
    opacity: 0.6;
}

.loading {
    text-align: center;
    padding: 3rem;
    color: #999;
}

.summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
}

.summary-card {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.summary-card.past {
    background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%);
}

.summary-label {
    font-size: 0.9rem;
    opacity: 0.9;
    margin-bottom: 0.5rem;
}

.summary-value {
    font-size: 1.8rem;
    font-weight: bold;
}

.summary-diff {
    font-size: 0.85rem;
    margin-top: 0.3rem;
}

.summary-diff.positive {
    color: #a8f5a8;
}

.summary-diff.negative {
    color: #ffb3b3;
}

.chart-container {
    background: white;
    border: 1px solid #eee;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 2rem;
}

.chart-header {
    font-size: 1rem;
    font-weight: bold;
    margin-bottom: 1rem;
    color: #333;
}

.chart-wrapper {
    display: flex;
    gap: 0.5rem;
    height: 300px;
}

.chart-y-axis {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding-right: 0.5rem;
    font-size: 0.75rem;
    color: #666;
}

.chart-content {
    flex: 1;
    position: relative;
}

.line-chart {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}

.bars-container {
    display: flex;
    height: 100%;
    align-items: flex-end;
    gap: 2px;
}

.bar-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
}

.bar {
    width: 100%;
    background: linear-gradient(to top, #42b883, #5fd4a0);
    border-radius: 4px 4px 0 0;
    position: relative;
    transition: all 0.2s;
    cursor: pointer;
}

.bar.past {
    background: linear-gradient(to top, #95a5a6, #b8c2c3);
}

.bar:hover {
    opacity: 0.8;
}

.bar-tooltip {
    display: none;
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 0.5rem;
    border-radius: 4px;
    white-space: nowrap;
    font-size: 0.8rem;
    z-index: 10;
}

.bar:hover .bar-tooltip {
    display: block;
}

.bar-label {
    font-size: 0.7rem;
    color: #666;
    margin-top: 0.3rem;
    transform: rotate(-45deg);
    transform-origin: top left;
}

.list-container {
    background: white;
    border: 1px solid #eee;
    border-radius: 8px;
    overflow: hidden;
}

.list-header {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: 1rem;
    padding: 1rem;
    background: #f8f9fa;
    font-weight: bold;
    border-bottom: 2px solid #dee2e6;
}

.list-item {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: 1rem;
    padding: 1rem;
    border-bottom: 1px solid #eee;
    transition: background 0.2s;
}

.list-item:hover {
    background: #f8f9fa;
}

.list-sales {
    font-weight: bold;
    color: #42b883;
}

.no-data {
    text-align: center;
    padding: 2rem;
    color: #999;
}

/* レスポンシブ対応 */
@media (max-width: 1024px) {
    .content-wrapper {
        flex-direction: column;
    }

    .main-pane.with-past {
        flex: 1;
    }

    .past-pane {
        flex: 1;
    }
}

@media (max-width: 768px) {
    .summary-cards {
        grid-template-columns: 1fr;
    }

    .list-header,
    .list-item {
        grid-template-columns: 2fr 1fr 1fr;
        font-size: 0.85rem;
    }

    .chart-wrapper {
        height: 200px;
    }

    .bar-label {
        font-size: 0.6rem;
    }
}
</style>
