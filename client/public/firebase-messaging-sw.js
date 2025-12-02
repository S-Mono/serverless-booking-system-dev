// Service Worker内でFirebaseライブラリを読み込む
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Configは本体と同じものを使用
const firebaseConfig = {
  apiKey: "AIzaSyCJWmgozIBHbzEmtJq1EH6aAa1g5gQtGf4",
  authDomain: "booking-system-firebase-764d2.firebaseapp.com",
  projectId: "booking-system-firebase-764d2",
  storageBucket: "booking-system-firebase-764d2.firebasestorage.app",
  messagingSenderId: "829906230754",
  appId: "1:829906230754:web:6b51fa2c7f184e8788edbb"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// バックグラウンドでの受信処理
messaging.onBackgroundMessage(function(payload) {
  console.log('Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.ico', // アプリアイコンがあれば指定
    tag: 'reservation-alert'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});