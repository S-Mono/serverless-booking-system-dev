// 正当な利用(ログイン名寄せ・予約・エラー報告)が、ルール強化後も動くことの確認
import { test, before, after, beforeEach, describe } from 'node:test'
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where,
} from 'firebase/firestore'
import { createEnv, seed, ctxs } from './helper.mjs'

let env, c
before(async () => { env = await createEnv(); c = ctxs(env) })
after(async () => { await env?.cleanup() })
beforeEach(async () => {
  await seed(env)
  await env.withSecurityRulesDisabled(async (x) => {
    // 管理者が事前登録した顧客(UIDとは別ID)。電話番号 09011111111 で名寄せされる
    await setDoc(doc(x.firestore(), 'customers/preReg1'), { name_kana: 'ヨヤク', phone_number: '09011111111' })
    await setDoc(doc(x.firestore(), 'reservations/r-prereg'), { customer_id: 'preReg1', status: 'confirmed' })
  })
})

describe('電話番号ログインの名寄せ (正当な利用)', () => {
  test('自分の電話番号で customers を検索できる', async () => {
    const q = query(collection(c.phoneUser(), 'customers'), where('phone_number', '==', '09011111111'))
    await assertSucceeds(getDocs(q))
  })
  test('他人の電話番号では検索できない', async () => {
    const q = query(collection(c.phoneUser(), 'customers'), where('phone_number', '==', '09022222222'))
    await assertFails(getDocs(q))
  })
  test('全件一覧は取得できない', async () => {
    await assertFails(getDocs(collection(c.phoneUser(), 'customers')))
  })
  test('名寄せで見つけた自分の事前登録顧客の予約を読める', async () => {
    await assertSucceeds(getDoc(doc(c.phoneUser(), 'reservations/r-prereg')))
  })
  test('他人の事前登録顧客の予約は読めない', async () => {
    await assertFails(getDoc(doc(c.alice(), 'reservations/r-prereg')))
  })
})

describe('顧客の通常操作', () => {
  test('新規登録: 自分の customers を role 無しで作成できる', async () => {
    const ctx = env.authenticatedContext('newuser').firestore()
    await assertSucceeds(setDoc(doc(ctx, 'customers/newuser'), { name_kana: 'ア', phone_number: '09099999999', provider: 'phone' }))
  })
  test('プロフィール更新(role以外)ができる', async () => {
    await assertSucceeds(updateDoc(doc(c.alice(), 'customers/alice'), { name_kana: 'アリス' }))
  })
  test('自分の予約を読める', async () => {
    await assertSucceeds(getDoc(doc(c.alice(), 'reservations/r-alice')))
  })
  test('自分の予約を条件付きクエリで取得できる', async () => {
    const q = query(collection(c.alice(), 'reservations'), where('customer_id', '==', 'alice'))
    await assertSucceeds(getDocs(q))
  })
  test('pending で予約を作成できる', async () => {
    await assertSucceeds(setDoc(doc(c.alice(), 'reservations/new1'), { customer_id: 'alice', status: 'pending', total_price: 3000 }))
  })
  test('confirmed で直接予約を作成できない', async () => {
    await assertFails(setDoc(doc(c.alice(), 'reservations/new2'), { customer_id: 'alice', status: 'confirmed' }))
  })
  test('自分の予約をキャンセル(削除)できる', async () => {
    await assertSucceeds(deleteDoc(doc(c.alice(), 'reservations/r-alice')))
  })
  test('自分宛メッセージを読める', async () => {
    await env.withSecurityRulesDisabled((x) => setDoc(doc(x.firestore(), 'messages/m-alice'), { customer_id: 'alice' }))
    await assertSucceeds(getDoc(doc(c.alice(), 'messages/m-alice')))
  })
})

describe('error_logs', () => {
  test('認証済みユーザーは許可フィールドで記録できる', async () => {
    await assertSucceeds(addDoc(collection(c.alice(), 'error_logs'), { message: 'x', name: 'E', context: 'LIFF_INIT' }))
  })
  test('想定外フィールドや巨大データは拒否', async () => {
    await assertFails(addDoc(collection(c.alice(), 'error_logs'), { evil: 'x' }))
    await assertFails(addDoc(collection(c.alice(), 'error_logs'), { message: 'a'.repeat(3000) }))
  })
})
