#!/usr/bin/env node
/**
 * send-release-notice.js
 * Publish a release notice to all customers using the existing messages collection.
 *
 * Usage:
 *   node send-release-notice.js --title "【重要】アップデートのお知らせ" --body "サービスメッセージに対応しました。" --releaseUrl /releases
 *   node send-release-notice.js --title "..." --body "..." --version 1.1.0-dev --dryRun true
 */

const admin = require('firebase-admin')
const argv = require('yargs/yargs')(process.argv.slice(2)).argv

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('\n❌ ERROR: GOOGLE_APPLICATION_CREDENTIALS not set.')
  process.exit(2)
}

try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  })
  console.log('✅ Firebase Admin initialized successfully (develop)')
} catch (e) {
  console.error('\n❌ ERROR: Failed to initialize Firebase Admin SDK')
  console.error('Error:', e.message)
  process.exit(2)
}

const isTrue = (value) => value === true || value === 'true' || value === '1'

async function main() {
  const title = String(argv.title || '').trim()
  const body = String(argv.body || '').trim()
  const version = String(argv.version || '').trim()
  const releaseUrl = String(argv.releaseUrl || '/releases').trim()
  const dryRun = isTrue(argv.dryRun)

  if (!title || !body) {
    console.error('\n❌ Please provide --title and --body')
    console.error('Usage: node send-release-notice.js --title "..." --body "..." [--releaseUrl /releases] [--version 1.1.0-dev] [--dryRun true]\n')
    process.exit(1)
  }

  const db = admin.firestore()
  const customersSnap = await db.collection('customers').get()

  if (customersSnap.empty) {
    console.log('ℹ️ No customers found. Nothing to send.')
    return
  }

  console.log(`🔍 Customers found: ${customersSnap.size}`)
  console.log(`📝 Title: ${title}`)
  console.log(`📝 Release URL: ${releaseUrl}`)
  if (version) console.log(`🧩 Version: ${version}`)

  if (dryRun) {
    console.log('🧪 dryRun=true: No documents were written.')
    return
  }

  const now = admin.firestore.FieldValue.serverTimestamp()
  const chunkSize = 400
  const customerIds = customersSnap.docs.map((doc) => doc.id)

  let sent = 0

  for (let i = 0; i < customerIds.length; i += chunkSize) {
    const chunk = customerIds.slice(i, i + chunkSize)
    const batch = db.batch()

    chunk.forEach((customerId) => {
      const messageRef = db.collection('messages').doc()
      batch.set(messageRef, {
        customer_id: customerId,
        title,
        body,
        release_url: releaseUrl,
        release_version: version || null,
        is_read: false,
        created_at: now,
      })
    })

    await batch.commit()
    sent += chunk.length
    console.log(`✅ Sent: ${sent}/${customerIds.length}`)
  }

  console.log('\n🎉 Release notice published successfully.')
  console.log(`Total delivered records: ${sent}`)
}

main().catch((err) => {
  console.error('❌ Failed:', err)
  process.exit(1)
})
