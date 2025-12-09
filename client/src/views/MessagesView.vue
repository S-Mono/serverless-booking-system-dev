<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { db, auth } from '../lib/firebase'
// 👇 writeBatch, doc を追加インポート
import { collection, query, where, orderBy, getDocs, Timestamp, writeBatch, doc, updateDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { useDialogStore } from '../stores/dialog' // ダイアログ用

const dialog = useDialogStore()

interface Message {
    id: string
    title: string
    body: string
    created_at: Timestamp
    is_read?: boolean
    is_cancelled?: boolean
    deleted_at?: Timestamp | null
}

const router = useRouter()
const messages = ref<Message[]>([])
const loading = ref(true)
const currentUser = ref<any>(null)
const showArchived = ref(false) // 履歴表示フラグ

// 表示するメッセージ（アクティブまたは全て）
const displayMessages = computed(() => {
    if (showArchived.value) {
        return messages.value // 全て表示
    } else {
        return messages.value.filter(msg => !msg.deleted_at) // 削除されていないもののみ
    }
})

// アクティブなメッセージ数
const activeCount = computed(() => messages.value.filter(msg => !msg.deleted_at).length)

// アーカイブされたメッセージ数
const archivedCount = computed(() => messages.value.filter(msg => msg.deleted_at).length)

const fetchMessages = async (userId: string) => {
    loading.value = true
    try {
        const q = query(
            collection(db, 'messages'),
            where('customer_id', '==', userId),
            orderBy('created_at', 'desc')
        )
        const snap = await getDocs(q)
        messages.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Message[]

        // 🟢 追加: 未読のものがあれば、一括で既読(is_read = true)にする
        const unreadDocs = snap.docs.filter(doc => doc.data().is_read === false)

        if (unreadDocs.length > 0) {
            // バッチ処理でまとめて更新（通信回数を節約）
            const batch = writeBatch(db)
            unreadDocs.forEach(doc => {
                batch.update(doc.ref, { is_read: true })
            })
            await batch.commit()
            // ※App.vue側でリアルタイム監視(onSnapshot)しているので、
            // ここで書き込むと自動的にヘッダーのバッジも消えます！
        }

    } catch (e) {
        console.error('メッセージ取得エラー:', e)
    } finally {
        loading.value = false
    }
}

// 古いメッセージを論理削除する関数
const deleteOldMessages = async () => {
    // アクティブなメッセージが1件以下なら整理する必要なし
    const activeMessages = messages.value.filter(msg => !msg.deleted_at)
    if (activeMessages.length <= 1) {
        await dialog.alert('整理するメッセージがありません', 'お知らせ')
        return
    }

    const ok = await dialog.confirm(
        '最新の1件を残して、過去のお知らせを整理しますか？\n（1年以上経過したものは完全削除、それ以外は履歴に移動します）',
        '履歴の整理',
        'warning'
    )
    if (!ok) return

    loading.value = true
    try {
        const batch = writeBatch(db)
        const now = Timestamp.now()
        const oneYearAgo = new Date()
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
        const oneYearAgoTimestamp = Timestamp.fromDate(oneYearAgo)

        // 配列の [0] は最新なので残し、slice(1) で2件目以降を抽出（アクティブのみ）
        const targets = activeMessages.slice(1)

        let physicalDeleteCount = 0
        let logicalDeleteCount = 0

        targets.forEach(msg => {
            const docRef = doc(db, 'messages', msg.id)

            // 1年以上前のメッセージは物理削除
            if (msg.created_at && msg.created_at.seconds < oneYearAgoTimestamp.seconds) {
                batch.delete(docRef)
                physicalDeleteCount++
            } else {
                // 1年未満は論理削除
                batch.update(docRef, { deleted_at: now })
                logicalDeleteCount++
            }
        })

        await batch.commit()

        await dialog.alert(
            `履歴を整理しました\n完全削除: ${physicalDeleteCount}件\n履歴に移動: ${logicalDeleteCount}件`,
            '完了'
        )

        // 画面をリロード
        if (currentUser.value) await fetchMessages(currentUser.value.uid)

    } catch (e) {
        console.error(e)
        dialog.alert('削除に失敗しました', 'エラー')
        loading.value = false
    }
}

// 履歴から完全削除する関数
const permanentlyDeleteArchived = async () => {
    const archived = messages.value.filter(msg => msg.deleted_at)
    if (archived.length === 0) {
        await dialog.alert('削除する履歴がありません', 'お知らせ')
        return
    }

    const ok = await dialog.confirm(
        `履歴のお知らせ ${archived.length}件を完全に削除しますか？\n（この操作は取り消せません）`,
        '履歴の完全削除',
        'danger'
    )
    if (!ok) return

    loading.value = true
    try {
        const batch = writeBatch(db)

        archived.forEach(msg => {
            const docRef = doc(db, 'messages', msg.id)
            batch.delete(docRef)
        })

        await batch.commit()

        await dialog.alert(`${archived.length}件の履歴を完全に削除しました`)

        // 画面をリロード
        if (currentUser.value) await fetchMessages(currentUser.value.uid)

    } catch (e) {
        console.error(e)
        dialog.alert('削除に失敗しました', 'エラー')
        loading.value = false
    }
}

const formatDate = (ts: Timestamp) => {
    if (!ts) return ''
    const d = ts.toDate()
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(() => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser.value = user
            fetchMessages(user.uid)
        } else {
            router.push('/login')
        }
    })
})
</script>

<template>
    <div class="messages-container">
        <div class="page-header">
            <router-link to="/" class="back-btn">◀ 予約画面</router-link>
            <div class="title-row">
                <h2 class="page-title">お知らせ</h2>
                <button @click="showArchived = !showArchived" class="toggle-btn" :class="{ 'active': showArchived }">
                    {{ showArchived ? '📋 現在のみ' : '📂 履歴も表示' }}
                    <span v-if="!showArchived && archivedCount > 0" class="badge">{{ archivedCount }}</span>
                </button>
            </div>
        </div>

        <p v-if="showArchived" class="archive-notice">※ 履歴は1年以上経過後、自動的に削除します。</p>

        <div class="action-buttons">
            <button v-if="activeCount > 1 && !showArchived" @click="deleteOldMessages" class="cleanup-btn">
                🧹 整理
            </button>

            <button v-if="showArchived && archivedCount > 0" @click="permanentlyDeleteArchived"
                class="delete-archived-btn">
                🗑️ 履歴削除
            </button>
        </div>

        <div v-if="loading" class="loading">読み込み中...</div>

        <div v-else class="message-list">
            <div v-if="displayMessages.length === 0" class="no-data">
                {{ showArchived ? '履歴はありません' : 'お知らせはありません' }}
            </div>

            <div v-for="msg in displayMessages" :key="msg.id" class="message-card" :class="{
                'unread': msg.is_read === false,
                'cancelled': msg.is_cancelled,
                'archived': msg.deleted_at
            }">
                <div class="msg-header">
                    <span class="msg-date">{{ formatDate(msg.created_at) }}</span>
                    <span class="msg-title">
                        <span v-if="msg.deleted_at" class="archived-badge">履歴</span>
                        <span v-else-if="msg.is_read === false" class="new-badge">NEW</span>
                        {{ msg.title }}
                    </span>
                </div>
                <div class="msg-body">
                    {{ msg.body }}
                </div>
                <div v-if="msg.deleted_at" class="archived-info">
                    整理日: {{ formatDate(msg.deleted_at) }}
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* コンテナ：画面いっぱいに広げ、縦並び（flex-column）にする */
.messages-container {
    max-width: 800px;
    margin: 0 auto;
    /* App.vueのヘッダー(60px)を引いた高さを確保 */
    height: calc(100vh - 60px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* 全体のスクロールは禁止 */
}

/* ページヘッダー：固定表示エリア */
.page-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem 1rem 0.5rem;
    background-color: #fff;
    z-index: 10;
    flex-wrap: wrap;
}

.title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 1;
    gap: 1rem;
}

.archive-notice {
    padding: 0.5rem 1rem;
    margin: 0;
    background: #fff3cd;
    border-left: 4px solid #ffc107;
    color: #856404;
    font-size: 0.85rem;
    flex-shrink: 0;
}

.action-buttons {
    display: flex;
    gap: 0.5rem;
    padding: 0 1rem 1rem;
    border-bottom: 1px solid #eee;
    flex-shrink: 0;
}

.toggle-btn {
    background: #f8f9fa;
    border: 1px solid #ddd;
    color: #555;
    padding: 0.5rem 1rem;
    border-radius: 20px;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.3rem;
}

.toggle-btn:hover {
    background: #e9ecef;
    border-color: #adb5bd;
}

.toggle-btn.active {
    background: #42b883;
    color: white;
    border-color: #42b883;
}

.badge {
    background: #e74c3c;
    color: white;
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 10px;
    font-weight: bold;
    min-width: 18px;
    text-align: center;
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

/* リストエリア：ここだけスクロールさせる */
.message-list {
    flex: 1;
    /* 残りの高さを全て使う */
    overflow-y: auto;
    /* 縦スクロール許可 */
    padding: 1.5rem 1rem;
    /* 内部の余白 */
    padding-bottom: 3rem;
    /* 最下部に見切れ防止の余白 */
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

/* ロード中・データなし表示もスクロールエリア内で中央寄せ */
.loading,
.no-data {
    text-align: center;
    color: #999;
    margin-top: 3rem;
    font-size: 1rem;
}

.cleanup-btn {
    background: transparent;
    border: 1px solid #999;
    color: #666;
    padding: 0.5rem 0.8rem;
    border-radius: 20px;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
    transition: all 0.2s;
}

.cleanup-btn:hover {
    background: #fff3cd;
    color: #856404;
    border-color: #ffc107;
}

.delete-archived-btn {
    background: transparent;
    border: 1px solid #dc3545;
    color: #dc3545;
    padding: 0.5rem 0.8rem;
    border-radius: 20px;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
    transition: all 0.2s;
}

.delete-archived-btn:hover {
    background: #dc3545;
    color: white;
}

/* --- 以下、カードのデザイン（変更なし） --- */
.message-card {
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    transition: border-color 0.3s;
    flex-shrink: 0;
    /* カードが潰れないように */
}

.msg-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.8rem;
    border-bottom: 1px dashed #eee;
    padding-bottom: 0.5rem;
}

.msg-date {
    font-size: 0.85rem;
    color: #888;
}

.msg-title {
    font-weight: bold;
    color: #2c3e50;
    font-size: 1.1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.msg-body {
    white-space: pre-wrap;
    line-height: 1.6;
    color: #555;
    font-size: 0.95rem;
}

/* 未読時のスタイル */
.message-card.unread {
    border-left: 5px solid #e74c3c;
    background-color: #fffdfd;
}

.new-badge {
    background: #e74c3c;
    color: white;
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: bold;
}

.archived-badge {
    background: #95a5a6;
    color: white;
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: bold;
}

/* アーカイブされたメッセージのスタイル */
.message-card.archived {
    background-color: #f8f9fa;
    border-left: 3px solid #adb5bd;
    opacity: 0.85;
}

.message-card.archived .msg-title,
.message-card.archived .msg-body {
    color: #6c757d;
}

.archived-info {
    margin-top: 0.8rem;
    padding-top: 0.8rem;
    border-top: 1px dashed #dee2e6;
    font-size: 0.8rem;
    color: #6c757d;
}

/* キャンセルされたメッセージのスタイル */
.message-card.cancelled {
    background-color: #f3f3f3;
    /* 背景をグレーに */
    border-left: 5px solid #bdc3c7;
    /* 左線をグレーに */
    opacity: 0.7;
    /* 全体を薄くする */
}

.message-card.cancelled .msg-title,
.message-card.cancelled .msg-body {
    color: #95a5a6;
    /* 文字色も薄く */
    text-decoration: line-through;
    /* 取り消し線（お好みで） */
}

/* 打ち消し線を入れるなら body の white-space と競合しないよう注意 */
.message-card.cancelled .msg-body {
    text-decoration: none;
    /* 本文は読みづらくなるので線なしが良いかも */
}

.cancel-badge {
    background: #7f8c8d;
    color: white;
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 4px;
    margin-right: 5px;
}

/* レスポンシブ対応 */
@media (max-width: 768px) {
    .page-header {
        flex-direction: column;
        align-items: stretch;
        gap: 0.75rem;
    }

    .page-title {
        font-size: 1.3rem;
    }

    .header-actions {
        width: 100%;
        justify-content: space-between;
        margin-left: 0;
    }

    .toggle-btn,
    .cleanup-btn,
    .delete-archived-btn {
        font-size: 0.8rem;
        padding: 0.4rem 0.7rem;
    }

    .back-btn {
        font-size: 0.85rem;
    }
}
</style>