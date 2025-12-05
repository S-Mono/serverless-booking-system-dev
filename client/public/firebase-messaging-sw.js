// Service Worker内でFirebaseライブラリを読み込む
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// Configは本体と同じものを使用
const firebaseConfig = {
  apiKey: "AIzaSyAIqfpB6xIv9-NuS85-Kd1-Rnt1WNDQ0gc",
  authDomain: "booking-system-dev-81786.firebaseapp.com",
  databaseURL: "https://booking-system-dev-81786-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "booking-system-dev-81786",
  storageBucket: "booking-system-dev-81786.firebasestorage.app",
  messagingSenderId: "593961087476",
  appId: "1:593961087476:web:bce41618269870d75509a1"
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