#!/usr/bin/env node
/**
 * set-admin.js
 * Small CLI utility to add/remove the `admin` custom claim on a Firebase user.
 *
 * Usage:
 *   node set-admin.js --uid <UID> --admin true
 *   node set-admin.js --email <EMAIL> --admin false
 *
 * SECURITY: This script requires a Firebase service account (GOOGLE_APPLICATION_CREDENTIALS)
 * and must be executed in a trusted environment. Do NOT commit service account files to git.
 */

const admin = require('firebase-admin')
const argv = require('yargs/yargs')(process.argv.slice(2)).argv

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS not set. Set it to your service account JSON path and run this script in a secure environment.')
  process.exit(2)
}

try {
  admin.initializeApp({})
} catch (e) {
  // Already initialized maybe
}

async function main() {
  const uid = argv.uid
  const email = argv.email
  const setAdmin = argv.admin === 'true' || argv.admin === true

  if (!uid && !email) {
    console.error('Please provide --uid or --email')
    process.exit(1)
  }

  let targetUid = uid
  if (!targetUid && email) {
    // resolve to UID
    const userRecord = await admin.auth().getUserByEmail(email)
    targetUid = userRecord.uid
  }

  if (!targetUid) {
    console.error('Cannot determine target UID')
    process.exit(1)
  }

  console.log(`Setting admin=${setAdmin} for UID=${targetUid}`)
  await admin.auth().setCustomUserClaims(targetUid, { admin: setAdmin })

  console.log('Done — please ask the user to refresh their ID token (they can sign out/in or call getIdToken(true)).')
}

main().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
