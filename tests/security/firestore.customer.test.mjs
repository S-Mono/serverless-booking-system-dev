// 一般顧客(alice)・管理者の攻撃/権限シナリオ。FAIL = 脆弱性あり。
import { test, before, after, beforeEach, describe } from 'node:test'
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection } from 'firebase/firestore'
import { createEnv, seed, ctxs } from './helper.mjs'

let env, c
before(async () => { env = await createEnv(); c = ctxs(env) })
after(async () => { await env?.cleanup() })
beforeEach(() => seed(env))

describe('一般顧客 (alice)', () => {
  test('自分の customers を読める', async () => {
    await assertSucceeds(getDoc(doc(c.alice(), 'customers/alice')))
  })
  test('他人(bob)の customers を読めない', async () => {
    await assertFails(getDoc(doc(c.alice(), 'customers/bob')))
  })
  test('他人(bob)の customers を更新できない', async () => {
    await assertFails(updateDoc(doc(c.alice(), 'customers/bob'), { name: 'pwned' }))
  })
  test('自分の role を admin に昇格できない (権限昇格)', async () => {
    await assertFails(updateDoc(doc(c.alice(), 'customers/alice'), { role: 'admin' }))
  })
  test('role=admin で customers を新規作成できない', async () => {
    await env.withSecurityRulesDisabled((x) => deleteDoc(doc(x.firestore(), 'customers/alice')))
    await assertFails(setDoc(doc(c.alice(), 'customers/alice'), { name: 'A', role: 'admin' }))
  })
  test('他人の予約を読めない', async () => {
    await assertFails(getDoc(doc(c.alice(), 'reservations/r-bob')))
  })
  test('予約一覧(全件)を取得できない', async () => {
    await assertFails(getDocs(collection(c.alice(), 'reservations')))
  })
  test('他人名義の予約を作成できない', async () => {
    await assertFails(setDoc(doc(c.alice(), 'reservations/x'), { customer_id: 'bob' }))
  })
  test('他人の予約を更新/削除できない', async () => {
    await assertFails(updateDoc(doc(c.alice(), 'reservations/r-bob'), { status: 'cancelled' }))
    await assertFails(deleteDoc(doc(c.alice(), 'reservations/r-bob')))
  })
  test('自分の予約の price を改ざんできない', async () => {
    await assertFails(updateDoc(doc(c.alice(), 'reservations/r-alice'), { price: 0 }))
  })
  test('他人のメッセージを読めない', async () => {
    await assertFails(getDoc(doc(c.alice(), 'messages/m-bob')))
  })
  test('カルテ・着信・管理トークン・問い合わせにアクセスできない', async () => {
    for (const p of ['customer_medical_records/rec1', 'incoming_calls/c1', 'admin_tokens/t1', 'contacts/ct1']) {
      await assertFails(getDoc(doc(c.alice(), p)))
    }
  })
  test('マスタを書き換えられない', async () => {
    await assertFails(setDoc(doc(c.alice(), 'menus/m1'), { name: 'hacked' }))
    await assertFails(setDoc(doc(c.alice(), 'staffs/s1'), { name: 'hacked' }))
    await assertFails(setDoc(doc(c.alice(), 'shop_config/main'), { x: 1 }))
  })
  test('incoming_calls へ書き込めない', async () => {
    await assertFails(setDoc(doc(c.alice(), 'incoming_calls/c2'), { phone: 'x' }))
  })
})

describe('管理者 (admin claim)', () => {
  test('管理系コレクションを読み書きできる', async () => {
    await assertSucceeds(getDoc(doc(c.admin(), 'customer_medical_records/rec1')))
    await assertSucceeds(getDoc(doc(c.admin(), 'incoming_calls/c1')))
    await assertSucceeds(getDoc(doc(c.admin(), 'admin_tokens/t1')))
    await assertSucceeds(setDoc(doc(c.admin(), 'menus/m2'), { name: 'new' }))
  })
  test('incoming_calls へクライアントから書き込めない', async () => {
    await assertFails(setDoc(doc(c.admin(), 'incoming_calls/c2'), { phone: 'x' }))
  })
  test('customers.role=admin だけ(claimなし)では管理者扱いされない', async () => {
    await assertFails(getDoc(doc(c.fakeAdmin(), 'customer_medical_records/rec1')))
    await assertFails(getDoc(doc(c.fakeAdmin(), 'admin_tokens/t1')))
  })
})
