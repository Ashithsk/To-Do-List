/* ==========================================================================
   TASKFLOW — FIREBASE CONFIGURATION (firebase-config.js)
   Firebase v10+ Modular SDK Configuration & Initialization.
   ========================================================================== */

// Import official Firebase modular SDK from Google's CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence 
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/**
 * --------------------------------------------------------------------------
 * Firebase Project Credentials
 * --------------------------------------------------------------------------
 * Replace the placeholder values below with your real project credentials
 * from the Firebase Console (Project Settings > General > Your apps > Web app).
 *
 * Refer to FIREBASE_SETUP.md for step-by-step instructions.
 */
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

/**
 * Checks whether the user has replaced placeholder credentials with real keys.
 * Used to display a friendly setup banner if keys are still pending.
 */
export function isFirebaseConfigured() {
  return (
    Boolean(firebaseConfig.apiKey) &&
    firebaseConfig.apiKey !== "YOUR_API_KEY" &&
    firebaseConfig.projectId !== "YOUR_PROJECT_ID"
  );
}

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication with default local persistence
export const auth = getAuth(app);

// Initialize Cloud Firestore database
export const db = getFirestore(app);

// Configure Google OAuth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account"
});

export { browserLocalPersistence, browserSessionPersistence, setPersistence };

