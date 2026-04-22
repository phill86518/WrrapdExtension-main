/** Shared cookie + JWT lifetime for admin/driver (Edge-safe — no Node fs). */
export const SESSION_COOKIE_NAME = "wrrapd_session";

export const SESSION_MAX_AGE_SEC = 12 * 60 * 60;

export function getSessionSecretBytes(): Uint8Array {
  return new TextEncoder().encode(
    (process.env.APP_SESSION_SECRET || "local-dev-secret-change-in-prod").trim(),
  );
}
