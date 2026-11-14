/* ==========================================================================
   TASKFLOW — SIGNUP CONTROLLER (signup.js)
   Registration, Password Strength Meter, Email Verification, & Firestore Setup.
   ========================================================================== */

import { 
  auth, 
  googleProvider, 
  browserLocalPersistence, 
  setPersistence 
} from "./firebase-config.js";
import { 
  createUserWithEmailAndPassword, 
  updateProfile, 
  sendEmailVerification, 
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
  checkFirebaseConfigNotice();

  const signupForm = document.getElementById("signup-form");
  const nameInput = document.getElementById("fullname");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirm-password");
  const termsCheckbox = document.getElementById("agree-terms");
  const submitBtn = document.getElementById("submit-signup-btn");
  const googleBtn = document.getElementById("google-signup-btn");

  // Show/Hide Password Toggles
  setupPasswordToggles();

  // Live Password Strength Meter
  if (passwordInput) {
    passwordInput.addEventListener("input", () => {
      evaluatePasswordStrength(passwordInput.value);
      clearInputError("password", "password-error");
    });
  }

  // Clear errors on typing
  nameInput?.addEventListener("input", () => clearInputError("fullname", "name-error"));
  emailInput?.addEventListener("input", () => clearInputError("email", "email-error"));
  confirmPasswordInput?.addEventListener("input", () => clearInputError("confirm-password", "confirm-password-error"));

  // --------------------------------------------------------------------------
  // Email & Password Registration
  // --------------------------------------------------------------------------
  signupForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearGlobalAlert("global-alert");

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    let hasError = false;

    // Validate Full Name
    if (!name) {
      setInputError("fullname", "name-error", "Please enter your full name.");
      hasError = true;
    } else if (name.length < 2) {
      setInputError("fullname", "name-error", "Name must be at least 2 characters.");
      hasError = true;
    }

    // Validate Email
    if (!email) {
      setInputError("email", "email-error", "Please enter your email address.");
      hasError = true;
    } else if (!isValidEmail(email)) {
      setInputError("email", "email-error", "Please enter a valid email address.");
      hasError = true;
    }

    // Validate Password
    if (!password) {
      setInputError("password", "password-error", "Please create a password.");
      hasError = true;
    } else if (password.length < 6) {
      setInputError("password", "password-error", "Password must be at least 6 characters.");
      hasError = true;
    }

    // Validate Password Confirmation
    if (!confirmPassword) {
      setInputError("confirm-password", "confirm-password-error", "Please confirm your password.");
      hasError = true;
    } else if (password !== confirmPassword) {
      setInputError("confirm-password", "confirm-password-error", "Passwords do not match.");
      hasError = true;
    }

    // Validate Terms & Conditions
    if (termsCheckbox && !termsCheckbox.checked) {
      showGlobalAlert("global-alert", "Please review and accept the Terms & Conditions to proceed.", "error");
      hasError = true;
    }

    if (hasError) return;

    try {
      setBtnLoading(submitBtn, true, "Creating Account...");

      // Set session persistence to local storage by default
      await setPersistence(auth, browserLocalPersistence);

      // 1. Create User in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Update Firebase Auth Profile with Display Name
      await updateProfile(user, { displayName: name });

      // 3. Send Verification Email
      try {
        await sendEmailVerification(user);
      } catch (verifyErr) {
        console.warn("Could not send verification email immediately:", verifyErr);
      }

      // 4. Create User Profile Document in Cloud Firestore
      await createUserProfile(user, {
        displayName: name,
        role: "Productivity Pro"
      });

      showGlobalAlert("global-alert", "Account created successfully! Redirecting to email verification...", "success");

      // Redirect to verification guidance screen
      setTimeout(() => {
        window.location.href = "verify-email.html";
      }, 700);

    } catch (error) {
      console.error("Firebase Registration Error:", error);
      const friendlyMessage = translateFirebaseError(error);
      showGlobalAlert("global-alert", friendlyMessage, "error");
      setBtnLoading(submitBtn, false);
    }
  });

  // --------------------------------------------------------------------------
  // Google OAuth Sign-Up
  // --------------------------------------------------------------------------
  googleBtn?.addEventListener("click", async () => {
    clearGlobalAlert("global-alert");

    try {
      setBtnLoading(googleBtn, true, "Connecting to Google...");

      await setPersistence(auth, browserLocalPersistence);
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      await createUserProfile(user, {
        displayName: user.displayName,
        photoURL: user.photoURL
      });

      showGlobalAlert("global-alert", "Signed up with Google! Opening dashboard...", "success");

      setTimeout(() => {
        window.location.href = "index.html";
      }, 600);

    } catch (error) {
      console.error("Google Sign-Up Error:", error);
      const friendlyMessage = translateFirebaseError(error);
      showGlobalAlert("global-alert", friendlyMessage, "error");
      setBtnLoading(googleBtn, false);
    }
  });
});

// --------------------------------------------------------------------------
// Password Strength Algorithm
// --------------------------------------------------------------------------
function evaluatePasswordStrength(password) {
  const strengthBar = document.getElementById("strength-meter-bar");
  const strengthText = document.getElementById("strength-meter-text");
  if (!strengthBar || !strengthText) return;

  if (!password) {
    strengthBar.className = "strength-bar";
    strengthBar.style.width = "0%";
    strengthText.textContent = "";
    return;
  }

  let score = 0;

  // Criteria
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (password.length < 6) {
    score = 0;
  }

  // Visual meter updates
  switch (score) {
    case 0:
    case 1:
      strengthBar.className = "strength-bar strength-weak";
      strengthBar.style.width = "25%";
      strengthText.textContent = "Weak — Add numbers & mixed case";
      strengthText.style.color = "var(--crimson)";
      break;

    case 2:
      strengthBar.className = "strength-bar strength-fair";
      strengthBar.style.width = "50%";
      strengthText.textContent = "Fair — Add special characters";
      strengthText.style.color = "var(--accent-gold)";
      break;

    case 3:
      strengthBar.className = "strength-bar strength-good";
      strengthBar.style.width = "75%";
      strengthText.textContent = "Good — Strong enough for daily use";
      strengthText.style.color = "#2563eb";
      break;

    case 4:
      strengthBar.className = "strength-bar strength-strong";
      strengthBar.style.width = "100%";
      strengthText.textContent = "Excellent — Highly secure password";
      strengthText.style.color = "var(--emerald)";
      break;
  }
}

function setupPasswordToggles() {
  const toggleButtons = document.querySelectorAll(".toggle-password-btn");
  toggleButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const input = targetId ? document.getElementById(targetId) : null;
      if (!input) return;

      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      btn.innerHTML = isPassword ? EYE_CLOSED : EYE_OPEN;
      btn.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
    });
  });
}

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

