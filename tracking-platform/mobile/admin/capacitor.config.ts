import type { CapacitorConfig } from "@capacitor/cli";

/** Replace with your deployed tracking origin (same host as Cloud Run / custom domain). */
const serverUrl = process.env.WRRAPD_CAP_SERVER_URL ?? "https://REPLACE_WITH_YOUR_TRACKING_HOST/admin";

const config: CapacitorConfig = {
  appId: "com.wrrapd.tracking.admin",
  appName: "Wrrapd Admin",
  webDir: "www",
  server: { url: serverUrl, cleartext: false },
};

export default config;
