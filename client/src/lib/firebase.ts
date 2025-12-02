import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
// 👇 追加
import { getMessaging, getToken, onMessage } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: "AIzaSyCJWmgozIBHbzEmtJq1EH6aAa1g5gQtGf4",
  authDomain: "booking-system-firebase-764d2.firebaseapp.com",
  projectId: "booking-system-firebase-764d2",
  storageBucket: "booking-system-firebase-764d2.firebasestorage.app",
  messagingSenderId: "829906230754",
  appId: "1:829906230754:web:6b51fa2c7f184e8788edbb"
};

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
// 👇 追加: Messagingのエクスポート
export const messaging = getMessaging(app)

// VAPIDキー (Firebaseコンソール > プロジェクト設定 > Cloud Messaging > ウェブ設定 で生成した鍵)
// ※まだの場合は仮置きし、後で差し替えてください
//export const VAPID_KEY = "ここにご自身のVAPID鍵ペア(公開鍵)を入れてください";
export const VAPID_KEY = "BK8qd-xiunI6hy87n2LyLWNdhzeS7DMldCTGmfr7Q6F3Gan5EbN1t5DzKzSxRHLvTry74tvD47gASvD7nadBK8w";
