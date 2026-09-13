/**
 * Self-service account calls for active contractors, made from the portal apps to WordPress
 * (ops key, via the api.wrrapd.com bridge). The onboarding site is closed to them after
 * activation, so password + contact edits happen here.
 */

export type PortalKind = "wrapstar" | "driver";

export type PortalContactFields = {
  nickname?: string;
  phoneMobile?: string;
  phoneWork?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

type WpResult<T> = ({ ok: true } & T) | { ok: false; status: number; error: string };

function wpBase(): string {
  return (
    process.env.WRRAPD_WRAPSTARS_WP_BASE_URL ||
    process.env.WRRAPD_WRAPSTARS_APPLY_URL ||
    "https://api.wrrapd.com/api/wrapstars-wp-bridge"
  ).replace(/\/$/, "");
}

async function wpPost<T>(
  path: string,
  payload: Record<string, unknown>,
): Promise<WpResult<T>> {
  const key = (process.env.WRRAPD_WRAPSTARS_OPS_API_KEY || "").trim();
  if (!key) {
    return { ok: false, status: 503, error: "Account changes are not available right now." };
  }
  try {
    const r = await fetch(`${wpBase()}/wp-json/wrrapd/v1/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Wrrapd-Wrapstars-Ops-Key": key },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || body.ok !== true) {
      const msg =
        typeof body.error === "string"
          ? body.error
          : typeof body.message === "string"
            ? body.message
            : `HTTP ${r.status}`;
      return { ok: false, status: r.status || 502, error: msg };
    }
    return { ok: true, ...(body as T) };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : "Temporarily unavailable.",
    };
  }
}

export function changePortalPassword(
  email: string,
  portal: PortalKind,
  currentPassword: string,
  newPassword: string,
): Promise<WpResult<{ passwordChangedAt?: string }>> {
  return wpPost("portal-password", {
    email: email.trim().toLowerCase(),
    portal,
    currentPassword,
    newPassword,
  });
}

export function updatePortalContact(
  email: string,
  portal: PortalKind,
  fields: PortalContactFields,
): Promise<WpResult<{ contact?: PortalContactFields; profileUpdatedAt?: string }>> {
  return wpPost("portal-contact", { email: email.trim().toLowerCase(), portal, ...fields });
}
