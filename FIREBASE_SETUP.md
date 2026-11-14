# TaskFlow — Firebase Setup, Security & Testing Guide

This guide walks you through connecting **TaskFlow** to your own Firebase project for real-world authentication, Google OAuth, email verification, password recovery, and Cloud Firestore user data synchronization.

---

## 1. Create a Firebase Project

1. Open the [Firebase Console](https://console.firebase.google.com/) and sign in with your Google account.
2. Click **Add project** (or **Create a project**).
3. Enter a project name (e.g. `taskflow-prod` or `my-taskflow-app`).
4. (Optional) Disable Google Analytics for this demo if not needed, then click **Create project**.
5. Wait a few seconds for the project to provision, then click **Continue**.

---

## 2. Register Your Web App & Get Config Keys

1. In the Firebase Console project overview page, click the **Web icon (`</>`)** to add a web application.
2. Enter an app nickname (e.g. `TaskFlow Web`).
3. Leave **Firebase Hosting** unchecked for now, then click **Register app**.
4. Firebase will display your `firebaseConfig` object, looking similar to this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef..."
};
```

5. Open [firebase-config.js](file:///d:/to%20do%20list/firebase-config.js) in your editor and paste these values into the `firebaseConfig` object:

```javascript
export const firebaseConfig = {
  apiKey: "YOUR_COPIED_API_KEY",
  authDomain: "YOUR_COPIED_AUTH_DOMAIN",
  projectId: "YOUR_COPIED_PROJECT_ID",
  storageBucket: "YOUR_COPIED_STORAGE_BUCKET",
  messagingSenderId: "YOUR_COPIED_MESSAGING_SENDER_ID",
  appId: "YOUR_COPIED_APP_ID"
};
```

---

## 3. Enable Authentication Sign-In Providers

1. In the Firebase Console left sidebar, click **Build > Authentication**.
2. Click **Get Started**.
3. Under the **Sign-in method** tab:

### A. Enable Email/Password
- Click **Email/Password**.
- Toggle **Enable** to ON.
- Leave "Email link (passwordless sign-in)" disabled.
- Click **Save**.

### B. Enable Google OAuth
- Click **Add new provider** and select **Google**.
- Toggle **Enable** to ON.
- Choose a **Project support email** from the dropdown (your email).
- Click **Save**.

### C. Verify Authorized Domains
- In the Authentication section, switch to the **Settings** tab and click **Authorized domains**.
- Confirm that `localhost` and `127.0.0.1` are in the list. This ensures you can sign in with Google when testing via VS Code Live Server or your local browser!

---

## 4. Enable Cloud Firestore Database

1. In the Firebase Console left sidebar, click **Build > Firestore Database**.
2. Click **Create database**.
3. Choose a Firestore location close to your users (e.g. `nam5 (us-central)` or `asia-south1`).
4. Choose **Start in production mode**.
5. Click **Create**.

---

## 5. Deploy Security Rules

1. In the Firestore section, click the **Rules** tab.
2. Replace whatever is in the editor with the rules from [firestore.rules](file:///d:/to%20do%20list/firestore.rules):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuthenticated() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    match /users/{userId} {
      allow read, write: if isOwner(userId);

      match /tasks/{taskId} {
        allow read, write: if isOwner(userId);
      }
    }

    match /tasks/{taskId} {
      allow read, update, delete: if isAuthenticated() && resource.data.userId == request.auth.uid;
      allow create: if isAuthenticated() && request.resource.data.userId == request.auth.uid;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

3. Click **Publish**.

---

## 6. Testing Checklist

Open the project with VS Code Live Server (`http://127.0.0.1:5500/login.html`):

| Test Case | How to Test | Expected Result |
| :--- | :--- | :--- |
| **New Registration** | Go to `signup.html`, enter a new name, email, and password. | Account is created in Firebase Auth, verification email sent, redirected to `verify-email.html`. |
| **Duplicate Email** | Try registering again with the exact same email. | Banner shows: *"An account already exists with this email address."* |
| **Password Strength** | Type passwords of varying complexity in `signup.html`. | Progress bar dynamically updates from Red (Weak) to Green (Strong). |
| **Google Sign-In** | Click "Continue with Google" on `login.html`. | Google popup appears; upon selecting account, redirects to dashboard with your Google name and avatar. |
| **Email Sign-In** | Sign in with registered credentials. | Success banner displays, user redirected to `index.html`. |
| **Protected Route** | In an incognito tab, try navigating directly to `index.html`. | Blocked from dashboard; immediately redirected to `login.html`. |
| **Forgot Password** | Go to `forgot-password.html`, enter registered email, submit. | Reset email is sent by Firebase. Page displays confirmation and countdown timer. |
| **Email Verification** | On `verify-email.html`, click "I've Verified My Email". | If unverified: warning asks to check inbox. Once verified in inbox: redirects to dashboard. |
| **Sign Out** | Click the sign out icon next to your name at the bottom of the sidebar. | Firebase session ends, redirected back to `login.html`. |

---

## 7. Production Deployment Guidance

When deploying TaskFlow to a live hosting platform (e.g., Firebase Hosting, Vercel, Netlify, or GitHub Pages):

1. **Add Custom Domain to Firebase:**
   - Go to **Firebase Console > Authentication > Settings > Authorized domains**.
   - Click **Add domain** and type your production domain (e.g. `mytaskflow.vercel.app` or `yourdomain.com`).
2. **Configure Password Reset Action URL:**
   - In **Firebase Console > Authentication > Templates**, under **Password reset**, click the edit pencil icon.
   - Set the action URL to `https://yourdomain.com/reset-password.html` so users clicking the email link arrive directly at your custom password reset screen!
3. **Always serve over HTTPS:** Firebase Authentication OAuth popups and session storage require a secure HTTPS origin in production.

