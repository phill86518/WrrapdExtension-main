import { allocateEmployeeId, DEMO_EMPLOYEE_IDS, isEmployeeIdFormat } from "./employee-id";

/** Generate a 10-digit WrapStar id (role 8 + year + state + zipRev + serial). */
export function generateWrapstarId(
  postalCode: string,
  existingIds: string[],
  createdAt: Date = new Date(),
): { ok: true; id: string } | { ok: false; error: string } {
  return allocateEmployeeId("8", postalCode, existingIds, createdAt);
}

export function isWrapstarIdFormat(id: string): boolean {
  return isEmployeeIdFormat(id, "8");
}

/**
 * Map legacy drv-* seeds to the new structured 10-digit WrapStar IDs.
 * Unknown legacy ids return Taylor's demo id only if hashing was previously used —
 * prefer explicit mapping for known seeds.
 */
export function wrapstarIdFromLegacy(legacyDriverId: string): string {
  if (legacyDriverId === "drv-1") return DEMO_EMPLOYEE_IDS.wrapstarRoger;
  if (legacyDriverId === "drv-2") return DEMO_EMPLOYEE_IDS.wrapstarTaylor;
  // Stable fallback for any other legacy key → Roger's ZIP serial space is not used;
  // return Taylor so callers always get a valid 10-digit WrapStar-shaped id.
  return DEMO_EMPLOYEE_IDS.wrapstarTaylor;
}

export { DEMO_EMPLOYEE_IDS };
