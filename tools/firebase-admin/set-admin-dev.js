const admin = require('firebase-admin');
const serviceAccount = require('../../booking-system-dev-81786-firebase-adminsdk-fbsvc-8126f47cb0.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
console.log('✅ Firebase Admin initialized (開発環境)');

const argv = require('yargs/yargs')(process.argv.slice(2)).argv;

async function main() {
  const uid = argv.uid;
  const adminValue = argv.admin === 'true' || argv.admin === true;

  if (!uid) {
    console.error('❌ --uid が必要です');
    console.error('使用例: node set-admin-dev.js --uid <UID> --admin true');
    process.exit(1);
  }

  try {
    console.log(`Setting admin=${adminValue} for UID=${uid}`);
    
    // 現在のカスタムクレームを取得
    const user = await admin.auth().getUser(uid);
    const currentClaims = user.customClaims || {};
    
    // adminクレームを追加/更新
    await admin.auth().setCustomUserClaims(uid, {
      ...currentClaims,
      admin: adminValue
    });
    
    console.log('✅ Success!');
    console.log('カスタムクレーム:', { ...currentClaims, admin: adminValue });
    
    process.exit(0);
  } catch (e) {
    console.error('Failed:', e);
    process.exit(1);
  }
}

main();
