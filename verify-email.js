/* ==========================================================================
   TASKFLOW — EMAIL VERIFICATION CONTROLLER (verify-email.js)
   Reloads Auth State, Resends Verification Link, and Directs to Dashboard.
   ========================================================================== */

import { auth } from "./firebase-config.js";
import { 
  sendEmailVerification, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { 
  translateFirebaseError, 
  createUserProfile, 
  logoutUser, 
  showGlobalAlert, 
  clearGlobalAlert, 
  setBtnLoading 
} from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const userEmailDisplay = document.getElementById("user-email-display");
  const checkStatusBtn = document.getElementById("check-status-btn");
  const resendBtn = document.getElementById("resend-verification-btn");
  const logoutBtn = document.getElementById("logout-btn");

  let currentUser = null;

  // Listen to Auth State
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      // If not logged in at all, redirect to login
      window.location.replace("login.html");
      return;
    }

    currentUser = user;
    if (userEmailDisplay) {
      userEmailDisplay.textContent = user.email || "your registered email";
    }

    // If user is already verified, proceed immediately
    if (user.emailVerified) {
      handleAlreadyVerified();
    }
  });

  // "I've Verified My Email" Check Status Button
  checkStatusBtn?.addEventListener("click", async () => {
    if (!currentUser) return;
    clearGlobalAlert("global-alert");

    try {
      setBtnLoading(checkStatusBtn, true, "Checking Status...");

      // Reload user record from Firebase backend to refresh `emailVerified` flag
      await currentUser.reload();
      const updatedUser = auth.currentUser;

      if (updatedUser && updatedUser.emailVerified) {
        // Update Firestore profile
        await createUserProfile(updatedUser, { emailVerified: true });

        showGlobalAlert("global-alert", "Email verified successfully! Redirecting to dashboard...", "success");
        setTimeout(() => {
          window.location.href = "index.html";
        }, 800);
      } else {
        setBtnLoading(checkStatusBtn, false);
        showGlobalAlert(
          "global-alert",
          "Your email address is not yet verified. Please open the confirmation link in your inbox and click this button again.",
          "error"
        );
      }
    } catch (error) {
      console.error("Error checking verification status:", error);
      showGlobalAlert("global-alert", translateFirebaseError(error), "error");
      setBtnLoading(checkStatusBtn, false);
    }
  });

  // "Resend Verification Email" Button
  resendBtn?.addEventListener("click", async () => {
    if (!currentUser) return;
    clearGlobalAlert("global-alert");

    try {
      resendBtn.disabled = true;
      resendBtn.textContent = "Sending link...";

      await sendEmailVerification(currentUser);

      showGlobalAlert("global-alert", "Verification email resent! Please check your inbox and spam folder.", "success");
      startCooldown(resendBtn);

    } catch (error) {
      console.error("Error resending verification email:", error);
      showGlobalAlert("global-alert", translateFirebaseError(error), "error");
      resendBtn.disabled = false;
      resendBtn.textContent = "Resend verification email";
    }
  });

  // Sign out button
  logoutBtn?.addEventListener("click", async () => {
    await logoutUser("login.html");
  });

  function handleAlreadyVerified() {
    showGlobalAlert("global-alert", "Your email is already verified! Opening dashboard...", "success");
    setTimeout(() => {
      window.location.href = "index.html";
    }, 700);
  }

  function startCooldown(button) {
    let remaining = 60;
    button.disabled = true;

    const interval = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        button.textContent = `Resend available in ${remaining}s`;
      } else {
        clearInterval(interval);
        button.disabled = false;
        button.textContent = "Resend verification email";
      }
    }, 1000);
  }
});

