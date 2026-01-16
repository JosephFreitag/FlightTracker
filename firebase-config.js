// firebase-config.js

// 1. Your web app's Firebase configuration (PASTE YOURS HERE)
const firebaseConfig = {
  apiKey: "AIzaSyDlLsfQ-iIpT6fX8zNth1YqTdhhS9iA_Ow",
  authDomain: "flight-tracker-ffdb9.firebaseapp.com",
  databaseURL: "https://flight-tracker-ffdb9-default-rtdb.firebaseio.com",
  projectId: "flight-tracker-ffdb9",
  storageBucket: "flight-tracker-ffdb9.firebasestorage.app",
  messagingSenderId: "1082207253722",
  appId: "1:1082207253722:web:f9f8da05263698149721e3"
};

// 2. Initialize Firebase using the global 'firebase' object
firebase.initializeApp(firebaseConfig);

// 3. Get the REALTIME DATABASE instance and make it global
const database = firebase.database();