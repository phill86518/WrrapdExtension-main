/** Public marketing / extension links (set in Cloud Run env). */

const DEFAULT_CHROME_WEB_STORE_URL =
  "https://chromewebstore.google.com/detail/wrrapd/eampapdpkmnnbfdojhmbpckpljnbpapo";

/** Live listing; override with `NEXT_PUBLIC_CHROME_WEB_STORE_URL` if you ship a new item id. */
export function chromeWebStoreUrl(): string {
  const u = process.env.NEXT_PUBLIC_CHROME_WEB_STORE_URL?.trim();
  if (u && u.startsWith("http")) return u;
  return DEFAULT_CHROME_WEB_STORE_URL;
}

export function supportMailto(): string {
  const e = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@wrrapd.com";
  return `mailto:${e}`;
}

export function supportEmailDisplay(): string {
  return process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@wrrapd.com";
}

/** Show default login hints on the ops hub at `/` (and dev `/platform` redirect). */
export function showPlatformLoginHints(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_PLATFORM_SHOW_LOGIN_HELP === "1"
  );
}
