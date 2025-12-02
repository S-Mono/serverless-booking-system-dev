const functions = require('firebase-functions')
const admin = require('firebase-admin')

// NOTE: initializeApp will pick up GOOGLE_APPLICATION_CREDENTIALS in the environment
admin.initializeApp()

// Secure endpoint to set/remove admin custom claim on a user
// - Protect this by setting a server-side secret (functions:config set admin.token)
// - Call with header Authorization: Bearer <token>

exports.setAdminClaim = functions.https.onRequest(async (req, res) => {
  try {
    const config = functions.config()
    const token = config.admin && config.admin.token
    const authHeader = req.get('Authorization') || ''
    if (!token || !authHeader.startsWith('Bearer ')) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const provided = authHeader.split(' ')[1]
    if (provided !== token) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { uid, email, admin: isAdmin } = req.body || {}
    if (!uid && !email) return res.status(400).json({ error: 'uid or email required' })
    const targetUid = uid || (await admin.auth().getUserByEmail(email)).uid

    await admin.auth().setCustomUserClaims(targetUid, { admin: !!isAdmin })
    return res.json({ ok: true, uid: targetUid, admin: !!isAdmin })
  } catch (err) {
    console.error('setAdminClaim error:', err)
    res.status(500).json({ error: err.message || String(err) })
  }
})
