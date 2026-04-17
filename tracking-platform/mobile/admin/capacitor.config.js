const serverUrl =
  process.env.WRRAPD_CAP_SERVER_URL ?? "https://REPLACE_WITH_YOUR_TRACKING_HOST/admin";

const config = {
  appId: "com.wrrapd.tracking.admin",
  appName: "Wrrapd Admin",
  webDir: "www",
  server: { url: serverUrl, cleartext: false },
};

module.exports = config;
