const serverUrl =
  process.env.WRRAPD_CAP_SERVER_URL ??
  "https://wrrapd-tracking-r63cgiod4q-uc.a.run.app/wrapstar";

/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: "com.wrrapd.wrapstar",
  appName: "WrapStar",
  webDir: "www",
  server: {
    url: serverUrl,
    cleartext: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#F59E0B",
    },
    Camera: {
      // Camera / mic used for shift chain-of-custody video in the WebView
    },
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "automatic",
    limitsNavigationsToAppBoundDomains: true,
  },
};

module.exports = config;
