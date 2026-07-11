import { createHash, randomInt } from "crypto";

/** Generate a 12-digit WrapStar id (numeric, never starts with 0). */
export function generateWrapstarId(): string {
  let id = "";
  id += String(randomInt(1, 10));
  for (let i = 0; i < 11; i++) {
    id += String(randomInt(0, 10));
  }
  return id;
}

/** Stable 12-digit id derived from a legacy drv-* id (migration). */
export function wrapstarIdFromLegacy(legacyDriverId: string): string {
  const hash = createHash("sha256").update(`wrrapd-ws:${legacyDriverId}`).digest("hex");
  let digits = "";
  for (const ch of hash) {
    if (digits.length >= 12) break;
    const n = Number.parseInt(ch, 16);
    if (Number.isFinite(n)) digits += String(n % 10);
  }
  while (digits.length < 12) digits += "0";
  if (digits[0] === "0") digits = "4" + digits.slice(1);
  return digits.slice(0, 12);
}
