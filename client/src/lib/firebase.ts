import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
// 👇 追加
import { getMessaging, getToken, onMessage } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
// 👇 追加: Messagingのエクスポート
export const messaging = getMessaging(app)

// VAPIDキー (Firebaseコンソール > プロジェクト設定 > Cloud Messaging > ウェブ設定 で生成した鍵)
// 開発環境用
export const VAPID_KEY = "BFBlmGzyMviT22QFy7sx9lmphmOjX-Lat-ERapY3bpefMFVkxJcZraUawKlvbKmngzruvxWYzQgKgVc1G41EdmU";

