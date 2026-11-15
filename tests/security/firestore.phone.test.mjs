// 電話番号の自己書き換えによる「なりすまし」の検証。FAIL = 脆弱性あり。
// 管理者が事前登録した顧客(preReg1: 電話 09011111111)の予約を、
// 別の顧客(mallory)が自分の phone_number を書き換えて読めてしまわないか。
//
// 【仕様】マイページで顧客が自分の phone_number を更新するため、
// phone_number の書き換え自体はルールで禁止していない（MyPageView の正当な操作）。
// 守るべきは「書き換えても、他人のデータに届かないこと」。
import { test, before, after, beforeEach, describe } from 'node:test'
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { createEnv, seed } from './helper.mjs'

let env
before(async () => { env = await createEnv() })
after(async () => { await env?.cleanup() })
beforeEach(async () => {
  await seed(env)
  await env.withSecurityRulesDisabled(async (x) => {
    const db = x.firestore()
    // 管理者が事前登録した顧客と、その予約
    await setDoc(doc(db, 'customers/preReg1'), { name_kana: 'ヨヤク', phone_number: '09011111111' })
    await setDoc(doc(db, 'reservations/r-prereg'), { customer_id: 'preReg1', status: 'confirmed' })
    // 悪意のある顧客(自分の電話番号は 09099990000)
    await setDoc(doc(db, 'customers/mallory'), { name_kana: 'マロリー', phone_number: '09099990000', provider: 'phone' })
  })
})

// mallory は自分のメール(=電話番号@local.booking-system)でログインしている
const mallory = () => env.authenticatedContext('mallory', { email: '09099990000@local.booking-system' }).firestore()

describe('phone_number の自己書き換え', () => {
  test('自分の phone_number を更新できる (マイページの正当な操作)', async () => {
    await assertSucceeds(updateDoc(doc(mallory(), 'customers/mallory'), { phone_number: '09088887777' }))
  })
  test('他人の事前登録顧客の予約は、書き換え前から読めない', async () => {
    await assertFails(getDoc(doc(mallory(), 'reservations/r-prereg')))
  })
  test('他人の電話番号に書き換えても、他人の予約・顧客情報は読めない', async () => {
    // 書き換え自体は通る（仕様）。ただし認可は token.email で判定されるため、他人のデータには届かない
    await assertSucceeds(updateDoc(doc(mallory(), 'customers/mallory'), { phone_number: '09011111111' }))
    await assertFails(getDoc(doc(mallory(), 'reservations/r-prereg')))
    await assertFails(getDoc(doc(mallory(), 'customers/preReg1')))
  })
  test('自分の電話番号のまま、他のプロフィールは更新できる (正当な利用)', async () => {
    await assertSucceeds(updateDoc(doc(mallory(), 'customers/mallory'), { name_kana: 'マロリー改' }))
  })
})
