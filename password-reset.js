/* ==========================================================================
   TASKFLOW — PASSWORD RECOVERY & RESET CONTROLLER (password-reset.js)
   Forgot Password, Firebase Action Code Verification, and Password Reset.
   ========================================================================== */

import { auth } from "./firebase-config.js";
import { 
  sendPasswordResetEmail, 
  verifyPasswordResetCode, 
  confirmPasswordReset 
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { 
  translateFirebaseError, 
  showGlobalAlert, 
  clearGlobalAlert, 
  setBtnLoading, 
  checkFirebaseConfigNotice 
} from "./auth.js";

// Password visibility icon SVGs
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

document.addEventListener("DOMContentLoaded", () => {
  checkFirebaseConfigNotice();

  // Route depending on whether we're on forgot-password.html or reset-password.html
  if (document.getElementById("forgot-password-form")) {
    initForgotPassword();
  }

  if (document.getElementById("reset-password-form")) {
    initResetPassword();
  }
});

/* ==========================================================================
   1. Forgot Password Flow (Request Reset Link)
   ========================================================================== */
function initForgotPassword() {
  const form = document.getElementById("forgot-password-form");
  const emailInput = document.getElementById("email");
  const submitBtn = document.getElementById("submit-reset-btn");
  const formCard = document.getElementById("form-card");
  const successCard = document.getElementById("success-card");
  const sentEmailDisplay = document.getElementById("sent-email-display");
  const resendBtn = document.getElementById("resend-btn");

  emailInput?.addEventListener("input", () => clearInputError("email", "email-error"));

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearGlobalAlert("global-alert");

    const email = emailInput.value.trim();

    if (!email) {
      setInputError("email", "email-error", "Please enter your registered email address.");
      return;
    }

    if (!isValidEmail(email)) {
      setInputError("email", "email-error", "Please enter a valid email address.");
      return;
    }

    try {
      setBtnLoading(submitBtn, true, "Sending Link...");

      // Send Firebase password reset email
      await sendPasswordResetEmail(auth, email);

      // Show confirmation state
      if (sentEmailDisplay) sentEmailDisplay.textContent = email;
      formCard?.classList.add("hidden");
      successCard?.classList.remove("hidden");

      startResendCountdown(resendBtn, email);

    } catch (error) {
      console.error("Password reset error:", error);
      const friendlyMessage = translateFirebaseError(error);
      showGlobalAlert("global-alert", friendlyMessage, "error");
      setBtnLoading(submitBtn, false);
    }
  });

  // Resend reset link button
  resendBtn?.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) return;

    try {
      resendBtn.disabled = true;
      resendBtn.textContent = "Sending...";
      await sendPasswordResetEmail(auth, email);
      showGlobalAlert("global-alert", "Reset link resent! Please check your inbox and spam folder.", "success");
      startResendCountdown(resendBtn, email);
    } catch (err) {
      showGlobalAlert("global-alert", translateFirebaseError(err), "error");
      resendBtn.disabled = false;
      resendBtn.textContent = "Resend link";
    }
  });
}

function startResendCountdown(btn, email) {
  if (!btn) return;
  let remaining = 60;
  btn.disabled = true;

  const timer = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      btn.textContent = `Resend in ${remaining}s`;
    } else {
      clearInterval(timer);
      btn.disabled = false;
      btn.textContent = "Resend link";
    }
  }, 1000);
}

/* ==========================================================================
   2. Reset Password Flow (Action Code from Email)
   ========================================================================== */
async function initResetPassword() {
  const form = document.getElementById("reset-password-form");
  const passwordInput = document.getElementById("new-password");
  const confirmInput = document.getElementById("confirm-password");
  const submitBtn = document.getElementById("submit-new-password-btn");
  const loadingCard = document.getElementById("verifying-card");
  const invalidCard = document.getElementById("invalid-code-card");
  const successCard = document.getElementById("success-card");
  const targetEmailEl = document.getElementById("target-email-display");

  setupPasswordToggles();

  // Read action parameters from URL
  const urlParams = new URLSearchParams(window.location.search);
  const actionCode = urlParams.get("oobCode");

  // Validate the code with Firebase
  if (!actionCode) {
    loadingCard?.classList.add("hidden");
    invalidCard?.classList.remove("hidden");
    return;
  }

  try {
    // Verify the password reset code and retrieve user email
    const userEmail = await verifyPasswordResetCode(auth, actionCode);

    if (targetEmailEl) targetEmailEl.textContent = userEmail;
    loadingCard?.classList.add("hidden");
    form?.classList.remove("hidden");

  } catch (error) {
    console.error("Invalid action code:", error);
    loadingCard?.classList.add("hidden");
    invalidCard?.classList.remove("hidden");
    const errorTextEl = document.getElementById("invalid-code-reason");
    if (errorTextEl) {
      errorTextEl.textContent = translateFirebaseError(error);
    }
    return;
  }

  // Password strength meter
  passwordInput?.addEventListener("input", () => {
    evaluatePasswordStrength(passwordInput.value);
    clearInputError("new-password", "password-error");
  });

  confirmInput?.addEventListener("input", () => {
    clearInputError("confirm-password", "confirm-error");
  });

  // Handle new password submission
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearGlobalAlert("global-alert");

    const newPassword = passwordInput.value;
    const confirmPassword = confirmInput.value;

    let hasError = false;

    if (!newPassword) {
      setInputError("new-password", "password-error", "Please enter a new password.");
      hasError = true;
    } else if (newPassword.length < 6) {
      setInputError("new-password", "password-error", "Password must be at least 6 characters.");
      hasError = true;
    }

    if (!confirmPassword) {
      setInputError("confirm-password", "confirm-error", "Please confirm your new password.");
      hasError = true;
    } else if (newPassword !== confirmPassword) {
      setInputError("confirm-password", "confirm-error", "Passwords do not match.");
      hasError = true;
    }

    if (hasError) return;

    try {
      setBtnLoading(submitBtn, true, "Updating Password...");

      // Confirm the new password with Firebase
      await confirmPasswordReset(auth, actionCode, newPassword);

      form?.classList.add("hidden");
      successCard?.classList.remove("hidden");

    } catch (error) {
      console.error("Password reset confirmation error:", error);
      const friendlyMessage = translateFirebaseError(error);
      showGlobalAlert("global-alert", friendlyMessage, "error");
      setBtnLoading(submitBtn, false);
    }
  });
}

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
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (password.length < 6) score = 0;

  switch (score) {
    case 0:
    case 1:
      strengthBar.className = "strength-bar strength-weak";
      strengthBar.style.width = "25%";
      strengthText.textContent = "Weak";
      strengthText.style.color = "var(--crimson)";
      break;
    case 2:
      strengthBar.className = "strength-bar strength-fair";
      strengthBar.style.width = "50%";
      strengthText.textContent = "Fair";
      strengthText.style.color = "var(--accent-gold)";
      break;
    case 3:
      strengthBar.className = "strength-bar strength-good";
      strengthBar.style.width = "75%";
      strengthText.textContent = "Good";
      strengthText.style.color = "#2563eb";
      break;
    case 4:
      strengthBar.className = "strength-bar strength-strong";
      strengthBar.style.width = "100%";
      strengthText.textContent = "Strong";
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

