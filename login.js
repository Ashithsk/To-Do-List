/* ==========================================================================
   TASKFLOW — LOGIN CONTROLLER (login.js)
   Email/Password Sign-In, Google Authentication, and Session Persistence.
   ========================================================================== */

import { 
  auth, 
  googleProvider, 
  browserLocalPersistence, 
  browserSessionPersistence, 
  setPersistence 
} from "./firebase-config.js";
import { 
  signInWithEmailAndPassword, 
  signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { 
  translateFirebaseError, 
  protectRoute, 
  createUserProfile, 
  showGlobalAlert, 
  clearGlobalAlert, 
  setBtnLoading, 
  checkFirebaseConfigNotice 
} from "./auth.js";

// Eye icon SVGs for password toggling
const EYE_OPEN = `
  <svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
`;

const EYE_CLOSED = `
  <svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
`;

// Protect this guest-only page: redirect to dashboard if already logged in
protectRoute({ requireAuth: false, redirectUrl: "index.html" });

document.addEventListener("DOMContentLoaded", () => {
  // Check for Firebase placeholder credentials notice
  checkFirebaseConfigNotice();

  const loginForm = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const rememberCheckbox = document.getElementById("remember-me");
  const submitBtn = document.getElementById("submit-login-btn");
  const googleBtn = document.getElementById("google-login-btn");
  const togglePasswordBtn = document.getElementById("toggle-password");

  // Show/Hide Password Toggle
  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";
      togglePasswordBtn.innerHTML = isPassword ? EYE_CLOSED : EYE_OPEN;
      togglePasswordBtn.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
    });
  }

  // Clear errors when typing
  emailInput?.addEventListener("input", () => clearInputError("email", "email-error"));
  passwordInput?.addEventListener("input", () => clearInputError("password", "password-error"));

  // --------------------------------------------------------------------------
  // Email & Password Sign-In
  // --------------------------------------------------------------------------
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearGlobalAlert("global-alert");

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const rememberMe = rememberCheckbox ? rememberCheckbox.checked : true;

    let hasError = false;

    // Validate email
    if (!email) {
      setInputError("email", "email-error", "Please enter your work email.");
      hasError = true;
    } else if (!isValidEmail(email)) {
      setInputError("email", "email-error", "Please enter a valid email address.");
      hasError = true;
    }

    // Validate password
    if (!password) {
      setInputError("password", "password-error", "Please enter your password.");
      hasError = true;
    }

    if (hasError) return;

    try {
      setBtnLoading(submitBtn, true, "Signing in...");

      // Apply selected session persistence
      const persistenceType = rememberMe ? browserLocalPersistence : browserSessionPersistence;
      await setPersistence(auth, persistenceType);

      // Authenticate with Firebase Authentication
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update Firestore user document
      await createUserProfile(user);

      showGlobalAlert("global-alert", "Sign in successful! Preparing your workspace...", "success");

      // Smooth redirect
      setTimeout(() => {
        const redirectUrl = sessionStorage.getItem("taskflow_redirect") || "index.html";
        sessionStorage.removeItem("taskflow_redirect");
        window.location.href = redirectUrl;
      }, 600);

    } catch (error) {
      console.error("Firebase Login Error:", error);
      const friendlyMessage = translateFirebaseError(error);
      showGlobalAlert("global-alert", friendlyMessage, "error");
      setBtnLoading(submitBtn, false);
    }
  });

  // --------------------------------------------------------------------------
  // Google OAuth Sign-In
  // --------------------------------------------------------------------------
  googleBtn?.addEventListener("click", async () => {
    clearGlobalAlert("global-alert");

    try {
      setBtnLoading(googleBtn, true, "Connecting to Google...");

      // Configure local persistence for Google OAuth
      await setPersistence(auth, browserLocalPersistence);

      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Ensure user profile document exists in Firestore
      await createUserProfile(user, {
        displayName: user.displayName,
        photoURL: user.photoURL
      });

      showGlobalAlert("global-alert", "Signed in with Google! Opening workspace...", "success");

      setTimeout(() => {
        const redirectUrl = sessionStorage.getItem("taskflow_redirect") || "index.html";
        sessionStorage.removeItem("taskflow_redirect");
        window.location.href = redirectUrl;
      }, 600);

    } catch (error) {
      console.error("Google Sign-In Error:", error);
      const friendlyMessage = translateFirebaseError(error);
      showGlobalAlert("global-alert", friendlyMessage, "error");
      setBtnLoading(googleBtn, false);
    }
  });
});

// Helper validation functions
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setInputError(inputId, errorId, message) {
  const inputEl = document.getElementById(inputId);
  const errorEl = document.getElementById(errorId);
  if (inputEl) inputEl.classList.add("is-invalid");
  if (errorEl) errorEl.textContent = message;
}

function clearInputError(inputId, errorId) {
  const inputEl = document.getElementById(inputId);
  const errorEl = document.getElementById(errorId);
  if (inputEl) inputEl.classList.remove("is-invalid");
  if (errorEl) errorEl.textContent = "";
}

