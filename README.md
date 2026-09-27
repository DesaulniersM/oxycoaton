# Medication Tracker (iOS PWA + Google Sheets Sync)

A lightweight, zero-cost medication tracker designed for iOS. It runs as a Progressive Web App (PWA) directly from the iPhone Home Screen, tracks medication intervals with visual status badges, provides a 5-second undo grace period for accidental taps, works offline, and automatically syncs all logs to a Google Sheet in Google Drive.

---

## Architecture Highlights

* **No Apple Developer Fees or Expiration:** Avoids the 7-day sideloading expiration limit of Xcode by running as an iOS Home Screen PWA.
* **$0 Hosting:** Host on GitHub Pages (or any static host) with zero maintenance.
* **Zero-Hassle Sync:** Uses a Google Apps Script Web App attached directly to your Google Sheet. No OAuth prompts or Google Cloud credentials needed for the user.
* **Offline First:** Logs doses instantly to `localStorage`. If offline, queues entries and flushes them automatically when connectivity is restored.
* **Accidental Tap Safety:** 5-second floating "Undo" banner with an animated countdown bar.

---

## 3-Step Setup Guide

### Step 1: Create the Google Sheet & Deploy Backend (2 mins)

1. Go to [Google Sheets](https://sheets.new) and create a new blank spreadsheet (e.g., named **"Medication Log"**).
2. In the top menu, click **Extensions** > **Apps Script**.
3. Delete any default code in `Code.gs` and paste the entire contents of [`Code.gs`](file:///home/matt/PersonalProjects/oxycoaton/Code.gs).
4. Click **Save** (disk icon).
5. In the top right, click **Deploy** > **New deployment**.
6. Click the gear icon next to "Select type" and select **Web app**.
7. Configure:
   * **Description:** `Meds Tracker API`
   * **Execute as:** `Me (your email)`
   * **Who has access:** `Anyone` *(Crucial: This allows your friend's phone to post logs without needing a Google login).*
8. Click **Deploy**, click **Authorize access**, and grant permissions.
9. **Copy the Web App URL** (it ends with `/exec`). You will paste this into the app settings.

---

### Step 2: Host the App on GitHub Pages (1 min)

1. Push this folder (`index.html`, `manifest.json`, `sw.js`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) to a GitHub repository.
2. In your GitHub repository, go to **Settings** > **Pages**.
3. Under **Branch**, select `main` (or `master`) and `/ (root)`, then click **Save**.
4. GitHub will give you a public URL (e.g., `https://<your-username>.github.io/<repo-name>/`).

---

### Step 3: Install onto your Friend's iPhone (30 seconds)

1. On your friend's iPhone, open the GitHub Pages URL in **Safari**.
2. Tap the **Share** button (the square with an arrow pointing up at the bottom of the screen).
3. Scroll down and tap **"Add to Home Screen"**.
4. Tap **Add** in the top right.
5. Tap the new **Medications** icon on their Home Screen. It will open full-screen like a native app.
6. In the app:
   * Tap the **Settings** gear icon in the top right.
   * Paste your **Google Apps Script Web App URL** from Step 1.
   * Tap **Save & Test Connection**.
   * Switch to your Google Sheet — you should see a green connection test row!

---

## App Features

* **Configurable Meds:** Tap **"Manage Buttons"** or **"+ Add Medication"** to customize medications, doses, timer intervals (e.g., 4h, 6h, 8h, 24h), and colors.
* **Live Status Badges:**
  * 🟢 **Green:** Dose taken recently, countdown timer active.
  * 🟡 **Yellow:** Within 30 minutes of next scheduled dose.
  * 🔴 **Red:** Due or overdue.
* **Undo Protection:** Tap any med button to log immediately; a 5-second countdown banner appears at the bottom allowing you to undo with one tap.
* **Sync Status Pill:**
  * 🟢 **Synced:** All entries saved to Google Sheet.
  * 🟡 **Queued (X):** Offline or syncing in progress.
* **Data Backup:** Export/import your full medication settings and history via JSON anytime.
