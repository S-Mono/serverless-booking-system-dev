// 未認証ユーザーの攻撃シナリオ。FAIL = 脆弱性あり。
import { test, before, after, beforeEach, describe } from 'node:test'
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection } from 'firebase/firestore'
import { createEnv, seed, ctxs } from './helper.mjs'

let env, c
before(async () => { env = await createEnv(); c = ctxs(env) })
after(async () => { await env?.cleanup() })
beforeEach(() => seed(env))

describe('未認証ユーザー', () => {
  test('customers 一覧(list)を取得できない (個人情報漏洩)', async () => {
    await assertFails(getDocs(collection(c.anon(), 'customers')))
  })
  test('customers 個別(get)を取得できない', async () => {
    await assertFails(getDoc(doc(c.anon(), 'customers/bob')))
  })
  test('password_reset_requests を読めない (トークン漏洩)', async () => {
    await assertFails(getDoc(doc(c.anon(), 'password_reset_requests/req1')))
  })
  test('password_reset_requests を任意作成できない', async () => {
    await assertFails(setDoc(doc(c.anon(), 'password_reset_requests/evil'), {
      customer_id: 'bob', token: 'mine', used: false,
    }))
  })
  test('password_reset_requests を改ざんできない', async () => {
    await assertFails(updateDoc(doc(c.anon(), 'password_reset_requests/req1'), { used: false, expires_at: 9999 }))
  })
  test('error_logs を未認証で作成できない (DoS/汚染)', async () => {
    await assertFails(addDoc(collection(c.anon(), 'error_logs'), { msg: 'spam' }))
  })
  test('reservations を読めない', async () => {
    await assertFails(getDoc(doc(c.anon(), 'reservations/r-bob')))
  })
  test('マスタ(menus)は公開読み取り可・書き込み不可', async () => {
    await assertSucceeds(getDoc(doc(c.anon(), 'menus/m1')))
    await assertFails(setDoc(doc(c.anon(), 'menus/m1'), { name: 'hacked' }))
  })
  test('カルテ/着信/管理トークン/問い合わせ/ログは読めない', async () => {
    for (const p of ['customer_medical_records/rec1', 'incoming_calls/c1', 'admin_tokens/t1', 'contacts/ct1', 'error_logs/e1']) {
      await assertFails(getDoc(doc(c.anon(), p)))
    }
  })
})
