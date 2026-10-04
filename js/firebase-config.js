// Firebase コンソール → プロジェクトの設定 → 「マイアプリ」→ ウェブアプリ の firebaseConfig を貼り付ける
// databaseURL は Realtime Database の URL（例: https://xxxx-default-rtdb.asia-southeast1.firebasedatabase.app）
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDbJw8kj8cXkLcecj0Ay92Y80B1zXHkCp4",
  authDomain: "survey-game-24fd2.firebaseapp.com",
  databaseURL: "https://survey-game-24fd2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "survey-game-24fd2",
  appId: "1:222910581869:web:152598ec4df0e0bd944364",
};
// 複数の会で同じ Firebase を使い回す場合はここを変える（例: "game-2026-10"）
window.ROOM = "game";
