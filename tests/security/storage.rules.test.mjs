// Storage セキュリティルールの脆弱性テスト
import { test, before, after, describe } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { ref, getBytes, uploadBytes } from 'firebase/storage'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rules = readFileSync(path.resolve(__dirname, '../../storage.rules'), 'utf8')
let env

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-security-test',
    storage: { rules, host: '127.0.0.1', port: 9199 },
  })
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), 'customer_medical_records/bob/rec1/a.jpg'), new Uint8Array([1, 2, 3]))
  })
})
after(async () => { await env?.cleanup() })

const P = 'customer_medical_records/bob/rec1/a.jpg'

describe('Storage', () => {
  test('未認証はカルテ画像を読めない', async () => {
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), P)))
  })
  test('一般顧客(本人含む)はカルテ画像を読めない/書けない', async () => {
    const s = env.authenticatedContext('bob').storage()
    await assertFails(getBytes(ref(s, P)))
    await assertFails(uploadBytes(ref(s, P), new Uint8Array([9])))
  })
  test('一般顧客は任意パスへ書き込めない', async () => {
    const s = env.authenticatedContext('bob').storage()
    await assertFails(uploadBytes(ref(s, 'public/evil.html'), new Uint8Array([9])))
  })
  test('管理者はカルテ画像を読める', async () => {
    const s = env.authenticatedContext('adm', { admin: true }).storage()
    await assertSucceeds(getBytes(ref(s, P)))
  })
})
