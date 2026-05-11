import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
// 👇 追加
import { getMessaging, type Messaging } from 'firebase/messaging'

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
export const storage = getStorage(app)

// 👇 修正: LINEブラウザではMessagingをサポートしないため、条件付きで初期化
export let messaging: Messaging | null = null

// LINEアプリ内ブラウザの検出
const isLineApp = () => {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  return /Line\/\d+\.\d+\.\d+/.test(ua)
}

// Service Workerがサポートされている環境のみでmessagingを初期化
// LIFFアプリ（LINE内ブラウザ）では初期化しない
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && !isLineApp()) {
  try {
    messaging = getMessaging(app)
    console.log('Firebase Messaging initialized successfully')
  } catch (error) {
    console.warn('Firebase Messaging is not supported in this environment:', error)
    messaging = null
  }
} else if (isLineApp()) {
  console.log('LINE app detected, skipping Firebase Messaging initialization')
}

// VAPIDキー (Firebaseコンソール > プロジェクト設定 > Cloud Messaging > ウェブ設定 で生成した鍵)
export const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;
