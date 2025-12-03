#!/usr/bin/env node
/**
 * create-user.js
 * Create a new Firebase Authentication user
 *
 * Usage:
 *   node create-user.js --email <EMAIL> --password <PASSWORD>
 */

const admin = require('firebase-admin')
const argv = require('yargs/yargs')(process.argv.slice(2)).argv

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('\n❌ ERROR: GOOGLE_APPLICATION_CREDENTIALS not set.')
  console.error('Set the environment variable and try again.\n')
  process.exit(2)
}

try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  })
  console.log('✅ Firebase Admin initialized successfully')
} catch (e) {
  console.error('\n❌ ERROR: Failed to initialize Firebase Admin SDK')
  console.error('Error:', e.message)
  process.exit(2)
}

async function main() {
  const email = argv.email
  const password = argv.password

  if (!email || !password) {
    console.error('\n❌ Please provide --email and --password')
    console.error('\nUsage: node create-user.js --email admin@example.com --password YourPassword123\n')
    process.exit(1)
  }

  try {
    console.log(`\n🔄 Creating user with email: ${email}`)
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      emailVerified: false
    })
    
    console.log('✅ User created successfully!')
    console.log(`   UID: ${userRecord.uid}`)
    console.log(`   Email: ${userRecord.email}`)
    console.log('\n💡 Next step: Set admin claim using:')
    console.log(`   node set-admin.js --uid ${userRecord.uid} --admin true\n`)
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      console.error('\n⚠️  User already exists with this email.')
      console.error('Use set-admin.js to set admin claim instead.\n')
    } else {
      console.error('\n❌ Failed to create user:', err.message)
    }
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
