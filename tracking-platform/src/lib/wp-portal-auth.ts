/**
 * Verify a contractor's WordPress onboarding credentials (email + password) through the
 * WrapStars ops API (`POST /wrrapd/v1/portal-auth`, ops key, via the api.wrrapd.com bridge).
 *
 * One login everywhere: the username/password issued at approval on apply.wrrapd.com keeps
 * working on wrapstar.wrrapd.com and joyrider.wrrapd.com. WrapRiders (third hire track, own
 * CPT) get both apps with a single account — WordPress mirrors them into both role slots.
 */

export type PortalAuthRole = {
  applicationId: number;
  status: string;
  suspended: boolean;
  fullName: string;
  greetingName?: string;
  activatedAt?: string;
  mustChangePassword?: boolean;
  /**
   * "wraprider" when this role entry was satisfied by an active WrapRider application (third
   * hire track, own CPT). WordPress mirrors an active WrapRider into `roles.wrapstar` and
   * `roles.driver` so one account signs in to both contractor apps.
   */
  hireRole?: "wrapstar" | "driver" | "wraprider";
};

export type PortalAuthRoles = {
  wrapstar?: PortalAuthRole;
  driver?: PortalAuthRole;
  wraprider?: PortalAuthRole;
};

export type PortalAuthResult =
  | {
      ok: true;
      userId: number;
      email: string;
      displayName: string;
      roles: PortalAuthRoles;
    }
  | { ok: false; status: number; error: string };

function wpBase(): string {
  return (
    process.env.WRRAPD_WRAPSTARS_WP_BASE_URL ||
    process.env.WRRAPD_WRAPSTARS_APPLY_URL ||
    "https://api.wrrapd.com/api/wrapstars-wp-bridge"
  ).replace(/\/$/, "");
}

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function verifyPortalCredentials(
  email: string,
  password: string,
  portal: "wrapstar" | "driver" | "wraprider",
): Promise<PortalAuthResult> {
  const key = (process.env.WRRAPD_WRAPSTARS_OPS_API_KEY || "").trim();
  if (!key) {
    return { ok: false, status: 503, error: "Portal login is not configured (ops key missing)." };
  }
  try {
    const r = await fetch(`${wpBase()}/wp-json/wrrapd/v1/portal-auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Wrrapd-Wrapstars-Ops-Key": key,
      },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password, portal }),
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
    const roles =
      body.roles && typeof body.roles === "object"
        ? (body.roles as PortalAuthRoles)
        : {};
    return {
      ok: true,
      userId: Number(body.userId) || 0,
      email: String(body.email || email).toLowerCase(),
      displayName: String(body.displayName || ""),
      roles,
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : "Portal login is temporarily unavailable.",
    };
  }
}
