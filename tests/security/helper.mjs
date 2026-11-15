// 共通: Firestore Emulator のセットアップ
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rules = readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8')

export const createEnv = () => initializeTestEnvironment({
  projectId: 'demo-security-test',
  firestore: { rules, host: '127.0.0.1', port: 8080 },
})

export const seed = async (env) => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'customers/alice'), { name: 'Alice', phone_number: '090-1111-1111', role: 'customer' })
    await setDoc(doc(db, 'customers/bob'), { name: 'Bob', phone_number: '090-2222-2222', role: 'customer' })
    await setDoc(doc(db, 'customers/adminuser'), { name: 'Admin', role: 'admin' })
    await setDoc(doc(db, 'reservations/r-alice'), { customer_id: 'alice', status: 'confirmed', price: 5000 })
    await setDoc(doc(db, 'reservations/r-bob'), { customer_id: 'bob', status: 'confirmed', price: 5000 })
    await setDoc(doc(db, 'messages/m-bob'), { customer_id: 'bob', body: 'secret' })
    await setDoc(doc(db, 'password_reset_requests/req1'), { customer_id: 'bob', token: 'SECRET-TOKEN', used: false })
    await setDoc(doc(db, 'customer_medical_records/rec1'), { customer_id: 'bob', note: 'medical' })
    await setDoc(doc(db, 'incoming_calls/c1'), { phone: '090' })
    await setDoc(doc(db, 'admin_tokens/t1'), { token: 'x' })
    await setDoc(doc(db, 'contacts/ct1'), { body: 'hi' })
    await setDoc(doc(db, 'error_logs/e1'), { msg: 'x' })
    await setDoc(doc(db, 'menus/m1'), { name: 'cut' })
  })
}

export const ctxs = (env) => ({
  anon: () => env.unauthenticatedContext().firestore(),
  alice: () => env.authenticatedContext('alice').firestore(),
  admin: () => env.authenticatedContext('adminuser', { admin: true }).firestore(),
  phoneUser: () => env.authenticatedContext('uid-phone-1', { email: '09011111111@local.booking-system' }).firestore(),
  fakeAdmin: () => env.authenticatedContext('adminuser').firestore(), // claim なし
})


