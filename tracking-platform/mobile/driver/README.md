# Driver Capacitor shell (iOS + Android)

Native shell for the Wrrapd Driver App. The UI and APIs live on Cloud Run at `/courier`; this project wraps that URL for App Store / Play Store distribution.

Hire / onboarding stays on the web (`apply.wrrapd.com/driver` → `pros.wrrapd.com/driver-onboarding`). After Command Center **Activate**, Drivers sign in here with roster name/email/ID + contractor passcode.

## Prerequisites

- Node 20+
- **Android:** Android Studio + SDK
- **iOS:** macOS + Xcode 16+ (not available on the GCP VM)

## Configure

```bash
cd tracking-platform/mobile/driver
npm install

# Must end with /courier
export WRRAPD_CAP_SERVER_URL="https://YOUR_TRACKING_HOST/courier"
```

## First-time native projects

```bash
npx cap add android
npx cap add ios   # Mac only
npx cap sync
```

### Android permissions

Ensure `android/app/src/main/AndroidManifest.xml` includes:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

### iOS Info.plist

```xml
<key>NSCameraUsageDescription</key>
<string>Driver scans package labels and captures delivery proof.</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>Driver shares location while delivering gifts.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Driver may upload delivery proof photos.</string>
```

## Build / run

```bash
npx cap sync
npx cap open android
npx cap open ios
```

## Deploy note

Ship Next.js changes via Cloud Run (`DEPLOYMENT.md`). Rebuild the native shell only when Capacitor config, plugins, or permissions change.
