const admin = require('firebase-admin');
const serviceAccount = require('../../booking-system-dev-81786-firebase-adminsdk-fbsvc-8126f47cb0.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const userIds = [
  'YN2FxWlaz9UHtPguzGbYybakPNu2', // monosashi1109@gmail.com
  'Yo8YhKJZYwSXqXFqN3YlTOSwqxl2', // s_monou@ridgeworks.co.jp
  'cr8iwXYoa7afKvlLHPC2FG0bWjl1'  // k_aoki@ridgeworks.co.jp
];

async function updateCustomClaims() {
  console.log('Updating custom claims to admin...\n');
  
  for (const uid of userIds) {
    try {
      // 現在のカスタムクレームを取得
      const user = await admin.auth().getUser(uid);
      console.log(`User: ${user.email || uid}`);
      console.log(`  Before: ${JSON.stringify(user.customClaims)}`);
      
      // admin に更新（is_admin から切り替え）
      await admin.auth().setCustomUserClaims(uid, { admin: true });
      
      // 確認
      const updatedUser = await admin.auth().getUser(uid);
      console.log(`  After:  ${JSON.stringify(updatedUser.customClaims)}`);
      console.log('  ✅ Updated\n');
    } catch (error) {
      console.error(`  ❌ Error updating ${uid}:`, error.message);
    }
  }
  
  console.log('All custom claims updated!');
  process.exit(0);
}

updateCustomClaims().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
