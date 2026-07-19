# WrapStar Capacitor shell (iOS + Android)

Native shell for the WrapStar App. The UI and APIs live on Cloud Run at `/wrapstar`; this project wraps that URL for App Store / Play Store distribution.

## Prerequisites

- Node 20+
- **Android:** Android Studio + SDK (Linux/Mac/Windows)
- **iOS:** macOS + Xcode 16+ (not available on the GCP VM)

## Configure

```bash
cd tracking-platform/mobile/wrapstar
npm install

# Point at your Cloud Run WrapStar URL (must end with /wrapstar)
export WRRAPD_CAP_SERVER_URL="https://YOUR_TRACKING_HOST/wrapstar"
```

Edit `capacitor.config.js` if you prefer a hard-coded host.

## First-time native projects

Android is already scaffolded under `android/` (generated on the VM).

**iOS (Mac only):**

```bash
cd tracking-platform/mobile/wrapstar
npm install
npx cap add ios
# Then add Info.plist camera/mic keys (see Permissions below)
npx cap sync ios
```

## Permissions

### Android (`android/app/src/main/AndroidManifest.xml`)

Ensure these are present after `cap add android`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

Do **not** require continuous background location — WrapStars wrap only (no final-mile driving).

### iOS (`ios/App/App/Info.plist`)

```xml
<key>NSCameraUsageDescription</key>
<string>WrapStar records chain-of-custody video while you wrap gifts.</string>
<key>NSMicrophoneUsageDescription</key>
<string>WrapStar records audio with chain-of-custody video.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>WrapStar may save or upload wrap proof media.</string>
```

## Build / run

```bash
npx cap sync
npx cap open android   # Android Studio → Run
npx cap open ios       # Xcode → Run / Archive
```

## Deploy note

Ship Next.js changes via Cloud Run (`DEPLOYMENT.md`). Rebuild the native shell only when Capacitor config, plugins, or permissions change — not for every web UI tweak.
