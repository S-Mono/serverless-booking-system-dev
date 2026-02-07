<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { auth } from '../lib/firebase'
import { Timestamp } from 'firebase/firestore'
import { onAuthStateChanged, signOut, type Unsubscribe, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { useDialogStore } from '../stores/dialog'
import { useUserStore } from '../stores/user'
import { useRouter } from 'vue-router'
import { useCustomer, useReservation, useContact } from '../composables'

const dialog = useDialogStore()
const userStore = useUserStore()
const router = useRouter()
const functions = getFunctions(undefined, 'asia-northeast1')

// Composablesの初期化
const { customerData, isLoading: isLoadingCustomer, isSaving: isSavingProfile, fetchCustomer, saveCustomer } = useCustomer({
  onError: (error) => dialog.alert(error.message || 'エラーが発生しました', 'エラー')
})

const { reservations, isLoading: isLoadingReservations, isOperating: isCancellingReservation, fetchUserReservations, cancelReservation: cancelReservationComposable } = useReservation({
  onError: (error) => dialog.alert(error.message || 'エラーが発生しました', 'エラー')
})

const { isSending: isSendingContact, sendContact } = useContact({
  onError: (error) => dialog.alert(error.message || 'エラーが発生しました', 'エラー')
})

const loading = ref(true)
const currentUser = ref<any>(null)
const nameKanji = ref('') // 姓名（漢字）
const nameKana = ref('') // 読み仮名（カナ）
const phoneNumber = ref('') // 電話番号
const preferredCategory = ref('barber')
const isProfileOpen = ref(false) // お客様情報の開閉状態
const isLineUser = ref(false) // LINEログインユーザーかどうか
const showPasswordChangeDialog = ref(false) // パスワード変更ダイアログ表示フラグ
const currentPassword = ref('') // 現在のパスワード
const newPassword = ref('') // 新しいパスワード
const confirmPassword = ref('') // 新しいパスワード（確認）
const isChangingPassword = ref(false) // パスワード変更中フラグ

// 電話番号フォーマット（ハイフン自動補完）
const formatPhoneNumber = (value: string) => {
  // 数字のみ抽出
  const numbers = value.replace(/[^0-9]/g, '')

  // 桁数に応じてフォーマット
  if (numbers.length <= 3) {
    return numbers
  } else if (numbers.length <= 6) {
    // 3-3 or 3-4
    return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
  } else if (numbers.length === 7) {
    // 7桁: 000-0000 (固定電話)
    return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
  } else if (numbers.length === 8) {
    // 8桁: 0000-0000 (4-4形式)
    return `${numbers.slice(0, 4)}-${numbers.slice(4)}`
  } else if (numbers.length === 9) {
    // 9桁: 000-000-000 または 0000-0-0000 → 一般的なのは 000-000-000
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6)}`
  } else if (numbers.length === 10) {
    // 10桁: 000-000-0000 (携帯/固定)
    // 先頭が090,080,070などなら携帯形式
    if (['090', '080', '070', '050'].includes(numbers.slice(0, 3))) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`
    } else {
      // 固定電話の場合 (0X-XXXX-XXXX または 0XX-XXX-XXXX)
      return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6)}`
    }
  } else if (numbers.length >= 11) {
    // 11桁: 000-0000-0000 (携帯)
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`
  }
  return numbers
}

const handlePhoneInput = (event: Event) => {
  const input = event.target as HTMLInputElement
  const cursorPos = input.selectionStart || 0
  const oldValue = phoneNumber.value
  const newValue = formatPhoneNumber(input.value)

  phoneNumber.value = newValue

  // カーソル位置を調整
  if (newValue.length > oldValue.length && (newValue[cursorPos] === '-' || newValue[cursorPos - 1] === '-')) {
    setTimeout(() => {
      input.setSelectionRange(cursorPos + 1, cursorPos + 1)
    }, 0)
  }
}

// お問い合わせフォーム
const isContactFormOpen = ref(false)
const contactMessage = ref('')

// ユーザーデータをロード
const loadUserData = async (userId: string) => {
  loading.value = true
  try {
    // 予約と顧客データを並行で取得
    const [reservationData, customerDataResult] = await Promise.all([
      fetchUserReservations(userId),
      fetchCustomer(userId)
    ])

    // 顧客データをローカル状態に反映
    if (customerDataResult) {
      nameKanji.value = customerDataResult.name_kanji || ''
      nameKana.value = customerDataResult.name_kana || ''
      phoneNumber.value = customerDataResult.phone_number ? formatPhoneNumber(customerDataResult.phone_number) : ''
      preferredCategory.value = customerDataResult.preferred_category || 'barber'
      isLineUser.value = customerDataResult.provider === 'line'
      // 未入力なら開く、入力済みなら閉じる
      isProfileOpen.value = !nameKana.value || !phoneNumber.value
    } else {
      isProfileOpen.value = true
    }
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      dialog.alert('データの取得に失敗しました。ページを更新してください。', 'エラー')
    }
  } finally {
    loading.value = false
  }
}

const saveProfile = async () => {
  if (!currentUser.value) return

  // バリデーション: カナと電話番号が必須
  if (!nameKana.value || nameKana.value.trim() === '') {
    dialog.alert('お名前（カナ）を入力してください。', '入力エラー')
    return
  }
  if (!phoneNumber.value || phoneNumber.value.trim() === '') {
    dialog.alert('電話番号を入力してください。', '入力エラー')
    return
  }

  // 文字種バリデーション
  // 漢字名: 漢字、ひらがな、スペースのみ
  if (nameKanji.value && nameKanji.value.trim() !== '') {
    const kanjiPattern = /^[ぁ-ん一-龠々\s　]+$/
    if (!kanjiPattern.test(nameKanji.value)) {
      dialog.alert('お名前（漢字）は漢字とひらがなで入力してください。', '入力エラー')
      return
    }
  }

  // カナ: 全角カタカナとスペースのみ
  const kanaPattern = /^[ァ-ヶー\s　]+$/
  if (!kanaPattern.test(nameKana.value)) {
    dialog.alert('お名前（カナ）は全角カタカナで入力してください。', '入力エラー')
    return
  }

  // 電話番号: 数字とハイフンのみ
  const phonePattern = /^[0-9\-]+$/
  if (!phonePattern.test(phoneNumber.value)) {
    dialog.alert('電話番号は数字とハイフン(-)で入力してください。', '入力エラー')
    return
  }

  // 電話番号からハイフンを除去して保存
  const cleanPhoneNumber = phoneNumber.value.replace(/[^0-9]/g, '')

  const success = await saveCustomer(currentUser.value.uid, {
    name_kanji: nameKanji.value,
    name_kana: nameKana.value,
    phone_number: cleanPhoneNumber,
    preferred_category: preferredCategory.value,
    is_existing_customer: true
  })

  if (success) {
    // 🔴 ヘッダーの名前を即座に更新（漢字優先、なければカナ）
    userStore.setCustomerName(nameKanji.value || nameKana.value)
    dialog.alert('プロフィールを保存しました')
  } else {
    dialog.alert('保存失敗', 'エラー')
  }
}

const cancelReservation = async (id: string) => {
  const ok = await dialog.open('キャンセルしますか？', { title: '確認', type: 'normal', cancelText: 'いいえ', confirmText: 'はい' })
  if (!ok) return

  const success = await cancelReservationComposable(id)
  if (success) {
    dialog.alert('予約をキャンセルしました')
  } else {
    const errorMsg = '予約のキャンセルに失敗しました'
    dialog.alert(`${errorMsg}`, 'エラー')
  }
}

// 戻る
const goBack = () => {
  router.push('/')
}

// お問い合わせ送信
const sendContactForm = async () => {
  if (!currentUser.value) {
    dialog.alert('ログインが必要です。', 'エラー')
    return
  }

  if (!contactMessage.value || contactMessage.value.trim() === '') {
    dialog.alert('お問い合わせ内容を入力してください。', '入力エラー')
    return
  }

  const success = await sendContact(currentUser.value.uid, contactMessage.value, {
    name_kanji: nameKanji.value,
    name_kana: nameKana.value,
    phone_number: phoneNumber.value,
    email: currentUser.value.email
  })

  if (success) {
    dialog.alert('お問い合わせを送信しました。\n折り返しご連絡いたしますので、しばらくお待ちください。', '送信完了')
    contactMessage.value = ''
    isContactFormOpen.value = false
  } else {
    dialog.alert('お問い合わせの送信に失敗しました。\n時間をおいて再度お試しください。', 'エラー')
  }
}

// 🟢 Authリスナーのクリーンアップ用
let unsubscribeAuth: Unsubscribe | null = null

onMounted(() => {
  unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    currentUser.value = user
    if (user) loadUserData(user.uid)
    else loading.value = false
  })
})

onUnmounted(() => {
  // リスナーを解除してメモリリークとAbortErrorを防ぐ
  if (unsubscribeAuth) {
    unsubscribeAuth()
    console.log('[MyPage] Auth listener unsubscribed')
  }
})

const formatDate = (ts: Timestamp) => {
  const d = ts.toDate()
  return d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
}

// 退会処理
const isDeletingAccount = ref(false)
const isDeleteAccountOpen = ref(false) // 退会セクションの開閉状態

const deleteAccount = async () => {
  // 二重確認
  const confirm1 = await dialog.confirm(
    '本当に退会しますか？\n\nこの操作を実行すると：\n・本サービスとLINEの連携が解除されます\n・予約履歴やアカウント情報が削除されます\n・予約中の予約は自動的にキャンセルされます\n・この操作は取り消せません',
    '退会の確認',
    'danger'
  )
  if (!confirm1) return

  const confirm2 = await dialog.confirm(
    '最終確認です。\n本当に退会してもよろしいですか？',
    '最終確認',
    'danger'
  )
  if (!confirm2) return

  isDeletingAccount.value = true

  try {
    // Cloud Functionを呼び出し
    const deleteUserAccount = httpsCallable(functions, 'deleteUserAccount')
    await deleteUserAccount()

    await dialog.alert('退会処理が完了しました。\nご利用ありがとうございました。', '退会完了')

    // ログアウトフラグを設定（5秒間自動ログインをスキップ）
    localStorage.setItem('logout_flag', Date.now().toString())

    // ログアウトしてログイン画面へ
    await signOut(auth)
    router.push('/login')
  } catch (error: any) {
    // AbortErrorは無視
    if (error.name === 'AbortError') {
      console.log('[MyPage] Delete account aborted')
      return
    }
    console.error('退会処理エラー:', error)
    const errorMessage = error?.message || '不明なエラー'
    dialog.alert(`退会処理に失敗しました。\n${errorMessage}\n\n時間をおいて再度お試しいただくか、カスタマーサポートまでお問い合わせください。`, 'エラー')
  } finally {
    isDeletingAccount.value = false
  }
}

// パスワード変更ダイアログを開く
const openPasswordChangeDialog = () => {
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  showPasswordChangeDialog.value = true
}

// パスワードを変更
const changePassword = async () => {
  // バリデーション
  if (!currentPassword.value) {
    dialog.alert('現在のパスワードを入力してください', '入力エラー')
    return
  }

  if (!newPassword.value) {
    dialog.alert('新しいパスワードを入力してください', '入力エラー')
    return
  }

  if (newPassword.value.length < 6) {
    dialog.alert('新しいパスワードは6文字以上で入力してください', '入力エラー')
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    dialog.alert('新しいパスワードが一致しません', '入力エラー')
    return
  }

  if (currentPassword.value === newPassword.value) {
    dialog.alert('新しいパスワードは現在のパスワードと異なるものを設定してください', '入力エラー')
    return
  }

  isChangingPassword.value = true

  try {
    const user = auth.currentUser
    if (!user || !user.email) {
      throw new Error('ユーザー情報が取得できません')
    }

    // 現在のパスワードで再認証
    const credential = EmailAuthProvider.credential(user.email, currentPassword.value)
    await reauthenticateWithCredential(user, credential)

    // パスワードを更新
    await updatePassword(user, newPassword.value)

    console.log('✅ パスワード変更成功')

    showPasswordChangeDialog.value = false
    await dialog.alert(
      'パスワードを変更しました。',
      '変更完了'
    )

    // フォームをクリア
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (error: any) {
    console.error('パスワード変更エラー:', error)
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      dialog.alert('現在のパスワードが正しくありません', 'エラー')
    } else {
      dialog.alert(`エラーが発生しました: ${error.message}`, 'エラー')
    }
  } finally {
    isChangingPassword.value = false
  }
}

</script>

<template>
  <div class="mypage-container">
    <div class="scroll-content">
      <div class="page-header">
        <router-link to="/" class="back-btn">◀ 予約画面に戻る</router-link>
        <h2 class="page-title">マイページ</h2>
      </div>

      <div class="content-grid">
        <aside class="profile-column">
          <div class="card profile-card">
            <div class="profile-header">
              <h3>お客様情報</h3>
              <button @click="isProfileOpen = !isProfileOpen" class="toggle-btn">
                {{ isProfileOpen ? '▲ 閉じる' : '▼ 開く' }}
              </button>
            </div>

            <div v-show="isProfileOpen" class="profile-form">
              <div class="form-group">
                <label>お名前（漢字）</label>
                <div class="input-row">
                  <input type="text" v-model="nameKanji" placeholder="例: 山田 太郎" />
                </div>
              </div>

              <div class="form-group">
                <label>お名前（カナ）<span class="required">*</span></label>
                <div class="input-row">
                  <input type="text" v-model="nameKana" placeholder="例: ヤマダ タロウ" />
                </div>
              </div>

              <div class="form-group">
                <label>電話番号<span class="required">*</span></label>
                <div class="input-row">
                  <input type="tel" v-model="phoneNumber" @input="handlePhoneInput" placeholder="例: 090-1234-5678" />
                </div>
                <p class="hint">※ 予約時に必要となります。</p>
              </div>

              <div class="form-group">
                <label>よく利用するメニュー</label>
                <div class="radio-group">
                  <label class="radio-item">
                    <input type="radio" value="barber" v-model="preferredCategory"> 💈 理容
                  </label>
                  <label class="radio-item">
                    <input type="radio" value="beauty" v-model="preferredCategory"> 💇‍♀️ 美容
                  </label>
                  <label class="radio-item">
                    <input type="radio" value="student" v-model="preferredCategory"> 🎓 学生（中学まで）
                  </label>
                  <label class="radio-item">
                    <input type="radio" value="chiro" v-model="preferredCategory"> 💆‍♂️ カイロ
                  </label>
                </div>
                <p class="hint">※ 予約画面の初期表示に反映されます。</p>
              </div>

              <button @click="saveProfile" :disabled="isSavingProfile" class="save-btn">
                {{ isSavingProfile ? '保存中...' : '保存する' }}
              </button>

              <!-- パスワード変更ボタン（LINEユーザー以外） -->
              <button v-if="!isLineUser" @click="openPasswordChangeDialog" class="password-reset-btn">
                🔐 パスワードを変更
              </button>
            </div>
          </div>

          <!-- 予約状況 -->
          <div class="card reservations-card">
            <h3>予約状況</h3>
            <div v-if="loading" class="loading-state">
              <p>読み込み中...</p>
            </div>
            <div v-else-if="reservations.length === 0" class="empty-state">
              <p>予約がありません</p>
              <router-link to="/" class="book-now-btn">今すぐ予約する</router-link>
            </div>
            <ul v-else class="reservation-list">
              <li v-for="reservation in reservations" :key="reservation.id" class="reservation-item"
                :class="{ cancelled: reservation.status === 'cancelled' }">
                <div class="res-header">
                  <span class="date">
                    {{ new Date(reservation.start_at.seconds * 1000).toLocaleString('ja-JP', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) }}
                  </span>
                  <span class="status-badge" :class="reservation.status">
                    {{ reservation.status === 'confirmed' ? '予約済' :
                      reservation.status === 'pending' ? '仮予約' : 'キャンセル済' }}
                  </span>
                </div>
                <ul class="menu-list">
                  <li v-for="(item, index) in reservation.menu_items" :key="index">
                    {{ item.title }} - ¥{{ item.price.toLocaleString() }}
                  </li>
                </ul>
                <div class="reservation-actions">
                  <button v-if="reservation.status === 'confirmed' || reservation.status === 'pending'"
                    @click="cancelReservation(reservation.id)" class="cancel-btn" :disabled="isCancellingReservation">
                    {{ isCancellingReservation ? '処理中...' : 'キャンセル' }}
                  </button>
                </div>
              </li>
            </ul>
          </div>

          <!-- お問い合わせフォーム -->
          <div class="card contact-card">
            <div class="profile-header">
              <h3>お問い合わせ</h3>
              <button @click="isContactFormOpen = !isContactFormOpen" class="toggle-btn">
                {{ isContactFormOpen ? '▲ 閉じる' : '▼ 開く' }}
              </button>
            </div>

            <div v-show="isContactFormOpen" class="contact-form">
              <div class="phone-info">
                <p class="phone-label">店舗直通電話</p>
                <a href="tel:011-694-5449" class="phone-number">📞 011-694-5449</a>
                <p class="phone-hint">営業時間内にお電話いただくとすぐに対応できます</p>
              </div>

              <div class="divider-or">
                <span>または</span>
              </div>

              <div class="form-group">
                <label>お問い合わせ内容<span class="required">*</span></label>
                <textarea v-model="contactMessage" placeholder="ご質問やご要望をご記入ください" rows="6"
                  :disabled="isSendingContact"></textarea>
                <p class="hint">※ 内容を確認後、メールまたはお電話にてご連絡いたします。</p>
              </div>

              <button @click="sendContactForm" :disabled="isSendingContact" class="save-btn">
                {{ isSendingContact ? '送信中...' : '送信する' }}
              </button>
            </div>
          </div>

          <!-- 退会セクション（トグル形式） -->
          <div class="card danger-card">
            <div class="profile-header">
              <h3>アカウントの削除</h3>
              <button @click="isDeleteAccountOpen = !isDeleteAccountOpen" class="toggle-btn danger-toggle">
                {{ isDeleteAccountOpen ? '▲ 閉じる' : '▼ 開く' }}
              </button>
            </div>

            <div v-show="isDeleteAccountOpen" class="danger-zone">
              <p class="danger-note">
                退会すると、以下の処理が実行されます：
              </p>
              <ul class="danger-list">
                <li>本サービスとLINEの連携が解除されます</li>
                <li>予約履歴やアカウント情報が削除されます</li>
                <li>予約中の予約は自動的にキャンセルされます</li>
                <li><strong>この操作は取り消せません</strong></li>
              </ul>
              <button @click="deleteAccount" class="delete-account-btn" :disabled="isDeletingAccount">
                {{ isDeletingAccount ? '処理中...' : '退会する' }}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>

    <!-- パスワード変更ダイアログ -->
    <Teleport to="body">
      <div v-if="showPasswordChangeDialog" class="modal-overlay" @click.self="showPasswordChangeDialog = false">
        <div class="modal-content password-change-modal">
          <div class="modal-header">
            <h3>パスワードの変更</h3>
            <button class="close-btn" @click="showPasswordChangeDialog = false">×</button>
          </div>
          <div class="modal-body">
            <p class="modal-description">
              パスワードを変更します。<br>
              現在のパスワードと新しいパスワードを入力してください。
            </p>
            <div class="form-group">
              <label>現在のパスワード *</label>
              <input type="password" v-model="currentPassword" placeholder="現在のパスワードを入力"
                :disabled="isChangingPassword" />
            </div>
            <div class="form-group">
              <label>新しいパスワード *</label>
              <input type="password" v-model="newPassword" placeholder="新しいパスワードを入力（6文字以上）"
                :disabled="isChangingPassword" />
            </div>
            <div class="form-group">
              <label>新しいパスワード（確認） *</label>
              <input type="password" v-model="confirmPassword" placeholder="新しいパスワードを再入力"
                :disabled="isChangingPassword" />
            </div>
          </div>
          <div class="modal-actions">
            <button @click="showPasswordChangeDialog = false" class="cancel-btn-modal" :disabled="isChangingPassword">
              キャンセル
            </button>
            <button @click="changePassword" class="submit-btn" :disabled="isChangingPassword">
              {{ isChangingPassword ? '変更中...' : '変更する' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.mypage-container {
  max-width: 1024px;
  margin: 0 auto;
  height: calc(100vh - 60px - 80px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.scroll-content {
  flex: 1;
  overflow-y: auto;
  padding: 2rem 1rem;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}

.scroll-content::-webkit-scrollbar {
  width: 6px;
}

.scroll-content::-webkit-scrollbar-track {
  background: transparent;
}

.scroll-content::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
  border-bottom: 2px solid #eee;
  padding-bottom: 0.5rem;
}

.page-title {
  font-size: 1.5rem;
  color: #333;
  margin: 0;
  border-bottom: none;
}

.profile-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.profile-header h3 {
  margin: 0;
}

.toggle-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 0.2s;
}

.toggle-btn:hover {
  background: #2980b9;
}

.danger-toggle {
  background: #e74c3c;
}

.danger-toggle:hover {
  background: #c0392b;
}

.profile-form {
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    max-height: 0;
  }

  to {
    opacity: 1;
    max-height: 1000px;
  }
}

.back-btn {
  background: transparent;
  border: 1px solid #ccc;
  color: #555;
  padding: 0.4rem 1rem;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.9rem;
  text-decoration: none;
  display: inline-block;
}

.back-btn:hover {
  background: #f0f0f0;
  color: #333;
}

.content-grid {
  display: block;
  /* スマホ優先: 1カラムレイアウト */
}

@media (min-width: 768px) {
  .content-grid {
    display: flex;
    justify-content: center;
  }

  .profile-column {
    max-width: 700px;
    width: 100%;
  }
}

.card {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}

.card h3 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  font-size: 1.1rem;
  color: #2c3e50;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  font-weight: bold;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.form-group label .required {
  color: #e74c3c;
  margin-left: 0.3rem;
  font-weight: bold;
}

.input-row input {
  width: 100%;
  padding: 0.7rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
  box-sizing: border-box;
}

.radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  min-width: 100px;
}

.hint {
  font-size: 0.8rem;
  color: #666;
  margin: 0.5rem 0 0 0;
}

.save-btn {
  width: 100%;
  background: #2c3e50;
  color: white;
  border: none;
  padding: 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  transition: background 0.2s;
}

.save-btn:hover {
  background: #34495e;
}

.save-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

/* 予約状況 */
.reservations-card {
  margin-top: 1.5rem;
}

/* お問い合わせフォーム */
.contact-card {
  margin-top: 1.5rem;
}

.contact-form {
  padding: 1rem;
}

.phone-info {
  background: #f0f8ff;
  border: 2px solid #42b883;
  border-radius: 8px;
  padding: 0.6rem 0.3rem;
  text-align: center;
  margin-bottom: 1.5rem;
}

.phone-label {
  font-size: 0.9rem;
  color: #666;
  margin: 0 0 0.5rem 0;
}

.phone-number {
  display: inline-block;
  font-size: 1.25rem;
  font-weight: bold;
  color: #42b883;
  text-decoration: none;
  padding: 0.3rem 0.2rem;
  border-radius: 4px;
  transition: background 0.2s;
}

.phone-number:hover {
  background: rgba(66, 184, 131, 0.1);
}

.phone-hint {
  font-size: 0.75rem;
  color: #999;
  margin: 0.5rem 0 0 0;
}

.divider-or {
  text-align: center;
  margin: 1.5rem 0;
  position: relative;
}

.divider-or::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: #ddd;
  z-index: 0;
}

.divider-or span {
  background: white;
  padding: 0 1rem;
  color: #999;
  font-size: 0.9rem;
  position: relative;
  z-index: 1;
}

textarea {
  width: 100%;
  padding: 0.8rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
}

textarea:focus {
  outline: none;
  border-color: #42b883;
}

textarea:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.loading,
.no-data {
  text-align: center;
  color: #666;
  padding: 2rem 0;
}

.book-link {
  color: #3498db;
  font-weight: bold;
  text-decoration: none;
}

.reservation-list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.reservation-item {
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 1.25rem;
  background: #fcfcfc;
  margin-bottom: 0.5rem;
}

.res-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px dashed #eee;
}

.res-header .date {
  font-weight: bold;
  font-size: 1.1rem;
  color: #333;
}

.status-badge {
  font-size: 0.8rem;
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: bold;
  color: white;
}

.status-badge.confirmed {
  background: #42b883;
}

.status-badge.pending {
  background: #e67e22;
}

.status-badge.cancelled {
  background: #95a5a6;
}

.res-body {
  margin-bottom: 1.25rem;
}

.menu-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.menu-title {
  font-size: 1rem;
}

.menu-price {
  font-weight: bold;
  color: #555;
}

/* 退会セクション */
.danger-card {
  margin-top: 1rem;
  border: 2px solid #e74c3c;
}

.danger-card h3 {
  color: #e74c3c;
  margin: 0 0 1rem 0;
}

.danger-zone {
  background: #fff5f5;
  padding: 1rem;
  border-radius: 4px;
}

.danger-note {
  color: #c0392b;
  font-size: 0.95rem;
  margin: 0 0 0.5rem 0;
  font-weight: 500;
}

.danger-list {
  margin: 0.5rem 0 1rem 1.5rem;
  padding: 0;
  color: #555;
  font-size: 0.9rem;
  line-height: 1.8;
}

.danger-list li {
  margin-bottom: 0.3rem;
}

.danger-list strong {
  color: #e74c3c;
}

.delete-account-btn {
  background: #e74c3c;
  color: white;
  border: none;
  padding: 0.8rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: bold;
  transition: background 0.2s;
  width: 100%;
}

.delete-account-btn:hover:not(:disabled) {
  background: #c0392b;
}

.delete-account-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.password-reset-btn {
  width: 100%;
  background: #667eea;
  color: white;
  border: none;
  padding: 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  margin-top: 10px;
  transition: all 0.3s;
}

.password-reset-btn:hover {
  background: #5568d3;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.password-reset-modal {
  max-width: 450px;
}

.password-change-modal {
  max-width: 500px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.modal-content {
  background: white;
  border-radius: 8px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e0e0e0;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.25rem;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #999;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #333;
}

.modal-body {
  padding: 1.5rem;
}

.modal-body .form-group {
  margin-bottom: 1.25rem;
}

.modal-body .form-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.5rem;
  font-size: 0.95rem;
  color: #333;
}

.modal-body .form-group input[type="password"],
.modal-body .form-group input[type="email"],
.modal-body .form-group input[type="text"] {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.modal-body .form-group input:focus {
  outline: none;
  border-color: #4CAF50;
}

.modal-body .form-group input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid #e0e0e0;
}

.cancel-btn-modal {
  background: white;
  border: 1px solid #ddd;
  color: #666;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s;
}

.cancel-btn-modal:hover {
  background: #f5f5f5;
}

.cancel-btn-modal:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.submit-btn {
  background: #4CAF50;
  border: none;
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s;
}

.submit-btn:hover {
  background: #45a049;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-description {
  color: #666;
  font-size: 0.95rem;
  line-height: 1.6;
  margin-bottom: 20px;
}

.res-footer {
  text-align: right;
}

.reservation-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #f0f0f0;
}

.cancel-btn {
  background: white;
  border: 1px solid #e74c3c;
  color: #e74c3c;
  padding: 0.5rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.cancel-btn:hover {
  background: #e74c3c;
  color: white;
}

@media (max-width: 768px) {
  .content-grid {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
}
</style>