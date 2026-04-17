import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.WRRAPD_CAP_SERVER_URL ?? "https://REPLACE_WITH_YOUR_TRACKING_HOST/driver";

const config: CapacitorConfig = {
  appId: "com.wrrapd.tracking.driver",
  appName: "Wrrapd Driver",
  webDir: "www",
  server: { url: serverUrl, cleartext: false },
};

export default config;
