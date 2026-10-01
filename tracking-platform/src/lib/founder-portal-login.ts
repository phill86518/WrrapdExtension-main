/**
 * Staff test login for the three contractor apps.
 *
 * admin@wrrapd.com plus the Command Center password (APP_ADMIN_PASSWORD) opens a
 * fixed, already-approved roster seat on whichever app you are signing into.
 * Saving an email on a roster row does not create this login.
 */

import { DEMO_EMPLOYEE_IDS } from "./employee-id";
import { ensureDemoDeliveryDrivers, findDeliveryDriverById } from "./driver-registry";
import { ensureDemoWrapriders, findWrapriderById } from "./wraprider-registry";
import { findWrapstarById } from "./wrapstar-registry";
import { ensureDemoWrapstarApprovals } from "./wrapstar-profiles";
import { ensureDemoStaffing } from "./demo-staffing";

export const FOUNDER_PORTAL_EMAIL = "admin@wrrapd.com";

export const FOUNDER_PORTAL_SEATS = {
  wrapstar: { id: DEMO_EMPLOYEE_IDS.wrapstarRoger, name: "Roger" },
  driver: { id: DEMO_EMPLOYEE_IDS.driverDevon, name: "Devon Blake" },
  wraprider: { id: DEMO_EMPLOYEE_IDS.wrapriderAlex, name: "Alex Rivera" },
} as const;

export function founderPortalPassword(): string {
  return (process.env.APP_ADMIN_PASSWORD || "admin123").trim();
}

export function isFounderPortalLogin(email: string, password: string): boolean {
  return (
    email.trim().toLowerCase() === FOUNDER_PORTAL_EMAIL &&
    password.trim() === founderPortalPassword()
  );
}

export async function founderWrapstarSeat(): Promise<{ id: string; name: string } | null> {
  await ensureDemoStaffing();
  await ensureDemoWrapstarApprovals();
  const row = await findWrapstarById(FOUNDER_PORTAL_SEATS.wrapstar.id);
  if (!row || row.hireRole === "wraprider") return null;
  return { id: row.id, name: row.name || FOUNDER_PORTAL_SEATS.wrapstar.name };
}

export async function founderJoyriderSeat(): Promise<{ id: string; name: string } | null> {
  await ensureDemoDeliveryDrivers();
  const row = await findDeliveryDriverById(FOUNDER_PORTAL_SEATS.driver.id);
  if (!row || row.status !== "approved" || row.hireRole === "wraprider") return null;
  return { id: row.id, name: row.name || FOUNDER_PORTAL_SEATS.driver.name };
}

export async function founderWrapriderSeat(): Promise<{ id: string; name: string } | null> {
  await ensureDemoWrapriders();
  const row = await findWrapriderById(FOUNDER_PORTAL_SEATS.wraprider.id);
  if (!row || row.status !== "approved") return null;
  return { id: row.id, name: row.name || FOUNDER_PORTAL_SEATS.wraprider.name };
}
