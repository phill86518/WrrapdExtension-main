/**
 * Verify a contractor's WordPress onboarding credentials (email + password) through the
 * WrapStars ops API (`POST /wrrapd/v1/portal-auth`, ops key, via the api.wrrapd.com bridge).
 *
 * The username/password issued at approval on apply.wrrapd.com is the login for that person's
 * OWN app: WrapStars → wrapstar.wrrapd.com, JoyRiders → joyrider.wrrapd.com, WrapRiders →
 * wraprider.wrrapd.com. Each app checks only its own role slot; WordPress never mirrors one
 * track into another.
 */

export type PortalAuthRole = {
  applicationId: number;
  status: string;
  suspended: boolean;
  fullName: string;
  greetingName?: string;
  activatedAt?: string;
  mustChangePassword?: boolean;
  /** Which CPT produced this entry — always matches the slot it sits in. */
  hireRole?: "wrapstar" | "driver" | "wraprider";
};

export type PortalAuthRoles = {
  wrapstar?: PortalAuthRole;
  driver?: PortalAuthRole;
  wraprider?: PortalAuthRole;
};

export type PortalTrack = "wrapstar" | "driver" | "wraprider";

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

async function postPortal(path: string, body: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
  const key = (process.env.WRRAPD_WRAPSTARS_OPS_API_KEY || "").trim();
  if (!key) {
    return { status: 503, body: { error: "Password reset is not available right now." } };
  }
  const r = await fetch(`${wpBase()}/wp-json/wrrapd/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Wrrapd-Wrapstars-Ops-Key": key,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const parsed = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: r.status, body: parsed };
}

/** Ask WordPress to email a reset link. A missing account still looks successful. */
export async function requestPortalPasswordReset(email: string, portal: PortalTrack): Promise<{ ok: boolean; error?: string }> {
  try {
    const { status, body } = await postPortal("portal-forgot-password", {
      email: email.trim().toLowerCase(),
      portal,
    });
    if (status >= 200 && status < 300) return { ok: true };
    if (status === 400) {
      return { ok: false, error: typeof body.error === "string" ? body.error : "Enter the email on your account." };
    }
    return { ok: false, error: "We couldn't send the email. Try again in a few minutes." };
  } catch {
    return { ok: false, error: "We couldn't send the email. Try again in a few minutes." };
  }
}

export async function completePortalPasswordReset(input: {
  login: string;
  key: string;
  newPassword: string;
  portal: PortalTrack;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { status, body } = await postPortal("portal-reset-password", {
      login: input.login,
      key: input.key,
      newPassword: input.newPassword,
      portal: input.portal,
    });
    if (status >= 200 && status < 300 && body.ok === true) return { ok: true };
    return {
      ok: false,
      error: typeof body.error === "string" ? body.error : "This reset link has expired. Ask for a new one.",
    };
  } catch {
    return { ok: false, error: "We couldn't save the new password. Try again in a few minutes." };
  }
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
