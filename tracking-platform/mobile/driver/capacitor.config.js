const serverUrl =
  process.env.WRRAPD_CAP_SERVER_URL ?? "https://REPLACE_WITH_YOUR_TRACKING_HOST/driver";

const config = {
  appId: "com.wrrapd.tracking.driver",
  appName: "Wrrapd Driver",
  webDir: "www",
  server: { url: serverUrl, cleartext: false },
};

module.exports = config;
