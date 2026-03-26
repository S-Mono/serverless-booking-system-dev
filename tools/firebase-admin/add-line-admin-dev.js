/**
 * add-line-admin-dev.js
 * admin_line_users コレクションに LINE User ID を追加する（開発環境）
 * 既存のドキュメントは一切変更・削除しない。
 *
 * Usage:
 *   node add-line-admin-dev.js --lineUserId <LINE_USER_ID> --name <名前>
 */
const admin = require('firebase-admin');
const serviceAccount = require('../../booking-system-dev-81786-firebase-adminsdk-fbsvc-8126f47cb0.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
console.log('✅ Firebase Admin initialized (開発環境)');

const argv = require('yargs/yargs')(process.argv.slice(2)).argv;

async function main() {
  const lineUserId = argv.lineUserId;
  const name = argv.name || '';

  if (!lineUserId) {
    console.error('❌ --lineUserId が必要です');
    console.error('使用例: node add-line-admin-dev.js --lineUserId Uxxxxxxxx --name 管理者名');
    process.exit(1);
  }

  const db = admin.firestore();
  const docRef = db.collection('admin_line_users').doc(lineUserId);

  // 既存ドキュメントの確認（上書きしない）
  const existing = await docRef.get();
  if (existing.exists) {
    console.log('ℹ️  既にドキュメントが存在します:', existing.data());
    process.exit(0);
  }

  await docRef.set({
    enabled: true,
    name: name,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log('✅ admin_line_users に追加しました');
  console.log('  ドキュメントID (LINE User ID):', lineUserId);
  console.log('  name:', name);
  console.log('  enabled: true');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ エラーが発生しました:', e);
  process.exit(1);
});
