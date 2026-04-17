#!/usr/bin/env bash
# Installs Capacitor CLI deps for building Android shells under mobile/admin and mobile/driver.
# Prerequisites for APK build: Android Studio + SDK, JAVA_HOME.
#
# After this, from each mobile/{admin,driver} directory:
#   export WRRAPD_CAP_SERVER_URL='https://your-host/admin'   # or /driver
#   npx cap add android
#   npx cap sync android
# Open the generated android/ folder in Android Studio → Build APK.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
npm install --save-dev @capacitor/core @capacitor/cli @capacitor/android
echo "Capacitor packages installed. See mobile/admin and mobile/driver/capacitor.config.ts"
