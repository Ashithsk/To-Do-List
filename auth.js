/* ==========================================================================
   TASKFLOW — CORE AUTHENTICATION MODULE (auth.js)
   Shared Auth State, Route Protection, Firestore Profile, and Error Handling.
   ========================================================================== */

import { auth, db, isFirebaseConfigured } from "./firebase-config.js";
import { 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { 
  doc, 
  setDoc, 
  getDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/**
 * Maps Firebase Authentication error codes to clear, human-readable messages.
 * Prevents technical stack traces and cryptic strings from being displayed to users.
 *
 * @param {Error|Object} error - The Firebase error object
 * @returns {string} Human-friendly error message
 */
export function translateFirebaseError(error) {
  if (!error) return "An unexpected error occurred. Please try again.";

  const code = error.code || "";

  switch (code) {
    case "auth/email-already-in-use":
      return "An account already exists with this email address. Please sign in instead.";

    case "auth/invalid-email":
      return "The email address is improperly formatted. Please check your spelling.";

    case "auth/user-not-found":
      return "No account found with this email. Please check your spelling or sign up.";

    case "auth/wrong-password":
      return "Incorrect password. Please try again or use 'Forgot password'.";

    case "auth/invalid-credential":
      return "Invalid email or password. Please verify your credentials and try again.";

    case "auth/weak-password":
      return "Password is too weak. Please choose a stronger password (at least 6 characters).";

    case "auth/user-disabled":
      return "This account has been disabled. Please contact support for assistance.";

    case "auth/too-many-requests":
      return "Too many failed attempts. Access is temporarily disabled to protect your account. Please wait a moment and try again.";

    case "auth/popup-closed-by-user":
      return "Google sign-in popup was closed before completing. Please try again.";

    case "auth/cancelled-popup-request":
      return "Previous sign-in popup request was cancelled.";

    case "auth/popup-blocked":
      return "The sign-in popup was blocked by your browser. Please allow popups for this site.";

    case "auth/network-request-failed":
      return "Network connection error. Please verify your internet connection and try again.";

    case "auth/expired-action-code":
      return "This link has expired. Please request a new password reset or verification link.";

    case "auth/invalid-action-code":
      return "This action link is invalid or has already been used. Please request a new one.";

    case "auth/unauthorized-domain":
      return "This domain is not authorized in your Firebase Console. Please add this host (e.g. localhost, 127.0.0.1) under Authentication > Settings > Authorized domains.";

    case "auth/operation-not-allowed":
      return "This sign-in method is not enabled. Please enable it in the Firebase Console under Authentication > Sign-in method.";

    case "auth/requires-recent-login":
      return "This sensitive operation requires a recent sign-in. Please log in again and retry.";

    default:
      return error.message || "An authentication error occurred. Please try again.";
  }
}

/**
 * Guards page access based on user authentication status.
 *
 * @param {Object} options
 * @param {boolean} options.requireAuth - If true, redirects unauthenticated users to login.html
 * @param {string} options.redirectUrl - Target URL when redirecting
 * @param {Function} [options.onUserReady] - Callback invoked when user state is confirmed
 */
export function protectRoute({ requireAuth = true, redirectUrl = "login.html", onUserReady = null } = {}) {
  // Show smooth loading state while Firebase resolves auth state from IndexedDB
  document.body.classList.add("auth-resolving");

  return onAuthStateChanged(auth, (user) => {
    document.body.classList.remove("auth-resolving");

    if (requireAuth) {
      // Protected page (e.g., index.html)
      if (!user) {
        // Save intended destination for post-login redirect
        const targetPath = window.location.pathname + window.location.search;
        sessionStorage.setItem("taskflow_redirect", targetPath);
        window.location.replace(redirectUrl);
        return;
      }
    } else {
      // Guest-only page (e.g., login.html, signup.html)
      if (user) {
        // Redirect already logged-in users to the dashboard
        const targetPath = sessionStorage.getItem("taskflow_redirect") || redirectUrl || "index.html";
        sessionStorage.removeItem("taskflow_redirect");
        window.location.replace(targetPath);
        return;
      }
    }

    if (typeof onUserReady === "function") {
      onUserReady(user);
    }
  });
}

/**
 * Creates or updates a user profile document in Cloud Firestore.
 * Document location: `users/{user.uid}`
 *
 * @param {Object} user - The Firebase User object
 * @param {Object} [additionalData] - Optional additional profile attributes
 */
export async function createUserProfile(user, additionalData = {}) {
  if (!user || !user.uid) return null;

  const userDocRef = doc(db, "users", user.uid);

  const profileData = {
    uid: user.uid,
    displayName: additionalData.displayName || user.displayName || "User",
    email: user.email || "",
    photoURL: user.photoURL || "",
    emailVerified: Boolean(user.emailVerified),
    providerId: user.providerData?.[0]?.providerId || "password",
    role: additionalData.role || "Productivity Pro",
    lastLoginAt: new Date().toISOString()
  };

  try {
    // Check if doc exists to avoid overwriting createdAt
    const existingDoc = await getDoc(userDocRef);
    if (!existingDoc.exists()) {
      profileData.createdAt = serverTimestamp();
    }

    await setDoc(userDocRef, profileData, { merge: true });
    return profileData;
  } catch (error) {
    console.warn("Firestore: Could not save user profile (verify Firestore rules):", error);
    return profileData; // Return data anyway so local auth flow continues
  }
}

/**
 * Fetches user profile data from Firestore.
 *
 * @param {string} uid - Firebase user ID
 * @returns {Promise<Object|null>}
 */
export async function getUserProfile(uid) {
  if (!uid) return null;
  try {
    const userDocRef = doc(db, "users", uid);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      return snap.data();
    }
  } catch (error) {
    console.warn("Firestore: Error fetching user profile:", error);
  }
  return null;
}

/**
 * Signs out the current user and clears any local session data.
 *
 * @param {string} [redirectUrl="login.html"] - Where to navigate after sign out
 */
export async function logoutUser(redirectUrl = "login.html") {
  try {
    await signOut(auth);
    sessionStorage.clear();
    window.location.href = redirectUrl;
  } catch (error) {
    console.error("Sign out failed:", error);
    window.location.href = redirectUrl;
  }
}

/**
 * Computes 2-letter uppercase initials from a name or email.
 */
export function getInitials(nameOrEmail) {
  if (!nameOrEmail) return "TF";
  const cleaned = nameOrEmail.trim();
  if (cleaned.includes(" ")) {
    const parts = cleaned.split(" ");
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return cleaned.substring(0, 2).toUpperCase();
}

/**
 * UI Helper: Shows a banner alert (error or success) inside a container element.
 */
export function showGlobalAlert(containerId, message, type = "error") {
  const alertEl = document.getElementById(containerId);
  if (!alertEl) return;

  alertEl.className = `global-alert alert-${type}`;
  alertEl.innerHTML = `
    <span class="alert-icon">
      ${type === "error" 
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>` 
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`}
    </span>
    <span class="alert-text">${escapeHtml(message)}</span>
  `;
  alertEl.classList.remove("hidden");
}

export function clearGlobalAlert(containerId) {
  const alertEl = document.getElementById(containerId);
  if (!alertEl) return;
  alertEl.className = "global-alert hidden";
  alertEl.innerHTML = "";
}

/**
 * UI Helper: Sets button loading state with an animated spinner.
 */
export function setBtnLoading(button, isLoading, loadingText = "Processing...") {
  if (!button) return;

  if (isLoading) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.classList.add("btn-loading");
    button.innerHTML = `
      <span class="spinner" aria-hidden="true"></span>
      <span>${escapeHtml(loadingText)}</span>
    `;
  } else {
    button.disabled = false;
    button.classList.remove("btn-loading");
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
    }
  }
}

/**
 * Checks if Firebase placeholder credentials are still present, and displays
 * a helpful setup notification at the top of the auth card if needed.
 */
export function checkFirebaseConfigNotice() {
  if (!isFirebaseConfigured()) {
    const header = document.querySelector(".auth-header");
    if (!header) return;

    const existingNotice = document.getElementById("firebase-setup-notice");
    if (existingNotice) return;

    const notice = document.createElement("div");
    notice.id = "firebase-setup-notice";
    notice.className = "config-notice-card";
    notice.innerHTML = `
      <div class="config-notice-badge">Firebase Setup Required</div>
      <p>Your app is ready for real authentication! Replace the placeholder credentials in <code>firebase-config.js</code> with your Firebase project keys.</p>
      <a href="FIREBASE_SETUP.md" target="_blank" class="config-notice-link">View Setup Guide &rarr;</a>
    `;
    header.insertAdjacentElement("afterend", notice);
  }
}

/**
 * Escapes unsafe characters to prevent XSS.
 */
export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
