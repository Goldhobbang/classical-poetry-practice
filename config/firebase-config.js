// This file is gitignored and should define window.__FIREBASE_CONFIG__ for the app.
// Paste your firebaseConfig object here, for example:

window.__FIREBASE_CONFIG__ = {
  apiKey: "AIzaSyBaIiI5lY_nSyk4Li1Yvju0fxPElU7mKEo",
  authDomain: "classical-poetry-practicer.firebaseapp.com",
  projectId: "classical-poetry-practicer",
  storageBucket: "classical-poetry-practicer.firebasestorage.app",
  messagingSenderId: "951378049043",
  appId: "1:951378049043:web:b4d487ab0a4e9641a9e7e6",
  measurementId: "G-CBG0P4VVB6"
};

// Admin password handling: store only a SHA-256 hash to avoid keeping plaintext in repo.
// Note: client-side storage of password hashes is still weaker than server-side auth.
// For now (user choice), we keep a hashed value instead of the plaintext password.
// SHA-256("hobgenius") = c011463175b0dc8c454f3f34c4e6f4afc6fc7089044fdc765085110c0803b704
window.__ADMIN_PASSWORD_HASH__ = "c011463175b0dc8c454f3f34c4e6f4afc6fc7089044fdc765085110c0803b704";
