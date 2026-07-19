import { stateNumberFromZip } from "./us-state-codes";

/** WrapStar IDs begin with 8; courier Driver IDs begin with 7. */
export type EmployeeRolePrefix = "8" | "7";

/**
 * 10-digit employee ID:
 *   [role 1][year 2][state 2][zipLast3Reversed 3][serial 2]
 * Example WrapStar FL 32218 (2026, first in ZIP): 8260981201
 * Example Driver   FL 32218 (2026, first in ZIP): 7260981201
 */
export function buildEmployeeIdPrefix(
  role: EmployeeRolePrefix,
  postalCode: string,
  createdAt: Date = new Date(),
): { prefix8: string; stateNumber: string; zipRev: string; year: string } | { error: string } {
  const zip = postalCode.replace(/\D/g, "").slice(0, 5);
  if (zip.length !== 5) return { error: "A valid 5-digit ZIP is required for employee ID." };
  const stateNumber = stateNumberFromZip(zip);
  if (!stateNumber) return { error: `Could not map ZIP ${zip} to a US state for employee ID.` };
  const year = String(createdAt.getFullYear()).slice(-2);
  const zipRev = zip.slice(-3).split("").reverse().join("");
  return {
    prefix8: `${role}${year}${stateNumber}${zipRev}`,
    stateNumber,
    zipRev,
    year,
  };
}

export function isEmployeeIdFormat(id: string, role?: EmployeeRolePrefix): boolean {
  if (!/^\d{10}$/.test(id)) return false;
  if (role) return id.startsWith(role);
  return id.startsWith("7") || id.startsWith("8");
}

export function parseEmployeeId(id: string): {
  role: EmployeeRolePrefix;
  year: string;
  stateNumber: string;
  zipRev: string;
  serial: string;
} | null {
  if (!isEmployeeIdFormat(id)) return null;
  const role = id[0] as EmployeeRolePrefix;
  if (role !== "7" && role !== "8") return null;
  return {
    role,
    year: id.slice(1, 3),
    stateNumber: id.slice(3, 5),
    zipRev: id.slice(5, 8),
    serial: id.slice(8, 10),
  };
}

/**
 * Allocate next serial 01–99 for this role + year + state + reversed ZIP prefix.
 * `existingIds` should include all WrapStar or Driver ids already issued.
 */
export function allocateEmployeeId(
  role: EmployeeRolePrefix,
  postalCode: string,
  existingIds: string[],
  createdAt: Date = new Date(),
): { ok: true; id: string } | { ok: false; error: string } {
  const built = buildEmployeeIdPrefix(role, postalCode, createdAt);
  if ("error" in built) return { ok: false, error: built.error };

  let maxSerial = 0;
  for (const id of existingIds) {
    if (!id.startsWith(built.prefix8)) continue;
    const serial = Number.parseInt(id.slice(8, 10), 10);
    if (Number.isFinite(serial) && serial > maxSerial) maxSerial = serial;
  }
  if (maxSerial >= 99) {
    return {
      ok: false,
      error: `No serials left (01–99) for this ZIP under role ${role === "8" ? "WrapStar" : "Driver"}.`,
    };
  }
  const next = maxSerial + 1;
  const id = `${built.prefix8}${String(next).padStart(2, "0")}`;
  return { ok: true, id };
}

/** Fixed demo IDs (Florida / Georgia, year 2026). */
export const DEMO_EMPLOYEE_IDS = {
  /** Roger — WrapStar, FL 32218, serial 01 → 8260981201 */
  wrapstarRoger: "8260981201",
  /** Taylor — WrapStar, FL 32256, serial 01 → 8260965201 */
  wrapstarTaylor: "8260965201",
  /** Jordan — WrapStar, FL 32218, serial 02 → 8260981202 */
  wrapstarJordan: "8260981202",
  /** Casey — WrapStar, GA 30309, serial 01 → 8261090301 */
  wrapstarCasey: "8261090301",
  /** Devon — Driver, FL 32218, serial 01 → 7260981201 */
  driverDevon: "7260981201",
  /** Morgan — Driver, GA 30309, serial 01 → 7261090301 */
  driverMorgan: "7261090301",
  /** Riley — Driver, FL 32256, serial 01 → 7260965201 */
  driverRiley: "7260965201",
} as const;
