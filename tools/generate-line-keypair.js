/**
 * LINEアサーション署名キーのキーペア生成スクリプト
 * 
 * 使い方:
 * node tools/generate-line-keypair.js
 * 
 * 生成されたキーペア:
 * - private-key.json: 秘密鍵（Cloud Functionsの環境変数に設定）
 * - public-key.json: 公開鍵（LINE Developersコンソールに登録）
 */

const crypto = require('crypto');
const fs = require('fs');

// RSA 2048bit キーペアを生成
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'jwk'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'jwk'
  }
});

// JWK形式に変換（LINE仕様に準拠 - プロパティ順序も一致させる）
const publicJWK = {
  kty: publicKey.kty,
  e: publicKey.e,
  n: publicKey.n,
  alg: 'RS256',
  use: 'sig'
};

// LINEドキュメントと同じプロパティ順序で秘密鍵を構築
const privateJWK = {
  alg: 'RS256',
  d: privateKey.d,
  dp: privateKey.dp,
  dq: privateKey.dq,
  e: privateKey.e,
  kty: privateKey.kty,
  n: privateKey.n,
  p: privateKey.p,
  q: privateKey.q,
  qi: privateKey.qi,
  use: 'sig'
};

// ファイルに保存
fs.writeFileSync('private-key.json', JSON.stringify(privateJWK, null, 2));
fs.writeFileSync('public-key.json', JSON.stringify(publicJWK, null, 2));

console.log('✅ キーペアを生成しました！');
console.log('\n📝 次のステップ:');
console.log('1. public-key.json の内容を LINE Developers コンソールに登録');
console.log('   - チャネル基本設定 → アサーション署名キー → 公開鍵を登録する');
console.log('2. 登録後に表示される kid をコピー');
console.log('3. functions/.env に以下を追加:');
console.log('   LINE_ASSERTION_PRIVATE_KEY=<private-key.jsonの内容を1行にした文字列>');
console.log('   LINE_ASSERTION_KID=<取得したkid>');
console.log('\n⚠️  重要: private-key.json は絶対に外部に漏らさないでください！');
