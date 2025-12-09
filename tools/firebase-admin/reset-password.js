const admin = require('firebase-admin');
const serviceAccount = require('../../booking-system-dev-81786-firebase-adminsdk-fbsvc-8126f47cb0.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
console.log('✅ Firebase Admin initialized (開発環境)');

const argv = require('yargs/yargs')(process.argv.slice(2)).argv;

async function main() {
  const email = argv.email;
  const newPassword = argv.password;

  if (!email || !newPassword) {
    console.error('❌ --email と --password が必要です');
    console.error('使用例: node reset-password.js --email user@example.com --password newPassword123');
    process.exit(1);
  }

  if (newPassword.length < 6) {
    console.error('❌ パスワードは6文字以上必要です');
    process.exit(1);
  }

  try {
    // メールアドレスからユーザーを取得
    const user = await admin.auth().getUserByEmail(email);
    console.log(`ユーザー検出: ${user.email} (UID: ${user.uid})`);
    
    // パスワードを更新
    await admin.auth().updateUser(user.uid, {
      password: newPassword
    });
    
    console.log('✅ パスワードを正常にリセットしました');
    console.log(`メール: ${email}`);
    console.log(`新しいパスワード: ${newPassword}`);
    
    process.exit(0);
  } catch (e) {
    console.error('❌ Failed:', e.message);
    process.exit(1);
  }
}

main();
