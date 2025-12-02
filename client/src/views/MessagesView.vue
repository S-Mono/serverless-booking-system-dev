<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { db, auth } from '../lib/firebase'
// 👇 writeBatch, doc を追加インポート
import { collection, query, where, orderBy, getDocs, Timestamp, writeBatch, doc } from 'firebase/firestore'
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
}

const router = useRouter()
const messages = ref<Message[]>([])
const loading = ref(true)
const currentUser = ref<any>(null)

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

// 古いメッセージを一括削除する関数
const deleteOldMessages = async () => {
    // メッセージが1件以下なら整理する必要なし
    if (messages.value.length <= 1) return

    const ok = await dialog.confirm(
        '最新の1件を残して、過去のお知らせをすべて削除しますか？\n（この操作は取り消せません）',
        '履歴の整理',
        'danger'
    )
    if (!ok) return

    loading.value = true
    try {
        const batch = writeBatch(db)

        // 配列の [0] は最新なので残し、slice(1) で2件目以降を抽出
        const targets = messages.value.slice(1)

        targets.forEach(msg => {
            const docRef = doc(db, 'messages', msg.id)
            batch.delete(docRef)
        })

        await batch.commit()

        await dialog.alert('履歴を整理しました')
        // 画面をリロード（または配列を更新）
        if (currentUser.value) fetchMessages(currentUser.value.uid)

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
            <h2 class="page-title">お知らせ</h2>

            <button v-if="messages.length > 1" @click="deleteOldMessages" class="cleanup-btn">
                🧹 最新1件を残して削除
            </button>
        </div>

        <div v-if="loading" class="loading">読み込み中...</div>

        <div v-else class="message-list">
            <div v-if="messages.length === 0" class="no-data">
                お知らせはありません
            </div>

            <div v-for="msg in messages" :key="msg.id" class="message-card"
                :class="{ 'unread': msg.is_read === false, 'cancelled': msg.is_cancelled }">
                <div class="msg-header">
                    <span class="msg-date">{{ formatDate(msg.created_at) }}</span>
                    <span class="msg-title">
                        <span v-if="msg.is_read === false" class="new-badge">NEW</span>
                        {{ msg.title }}
                    </span>
                </div>
                <div class="msg-body">
                    {{ msg.body }}
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
    /* 縮まないようにする */
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem 1rem;
    border-bottom: 1px solid #eee;
    background-color: #fff;
    /* スクロール時に透けないように */
    z-index: 10;
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
    padding: 0.4rem 0.8rem;
    border-radius: 20px;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
    transition: all 0.2s;
}

.cleanup-btn:hover {
    background: #f0f0f0;
    color: #333;
    border-color: #666;
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
</style>