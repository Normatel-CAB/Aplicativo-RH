// firebase-config.js - VERSÃO CORRIGIDA
// Certifique-se de adicionar os scripts CDN do Firebase no seu index.html antes deste arquivo:
// <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-storage-compat.js"></script>

// Inicializa o Firebase com configuração padrão
if (!window.firebase) {
  throw new Error('Firebase SDK não carregado. Verifique se os scripts CDN estão no HTML.');
}

const firebaseConfig = {
  apiKey: "AIzaSyCWLQteC_iYmUi_0DVEsUb5kCdki5e13bs",
  authDomain: "normatel-rh.firebaseapp.com",
  projectId: "normatel-rh",
  storageBucket: "normatel-rh.firebasestorage.app",
  messagingSenderId: "184591082402",
  appId: "1:184591082402:web:8cc2e29f863e0ac8f888fb",
  measurementId: "G-RWH43JZTPY"
};

if (!firebase.apps || firebase.apps.length === 0) {
  firebase.initializeApp(firebaseConfig);
}

window.db = firebase.firestore();
window.db.settings({ experimentalAutoDetectLongPolling: true, merge: true });

if (typeof firebase.storage === 'function') {
  window.storage = firebase.storage();
} else {
  window.storage = null;
}

window.auth = firebase.auth();