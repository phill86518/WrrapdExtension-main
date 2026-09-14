import type { HourlyZipRate, PayoutConfig } from "./types";
import { getPayoutConfig } from "./finance";

export const DEFAULT_WRAPSTAR_HOURLY_CENTS = 2500;
export const DEFAULT_JOYRIDER_HOURLY_CENTS = 2200;
export const WRAPSTAR_PACE_GIFTS_PER_HOUR = 12;

export type ContractorPayRole = "wrapstar" | "joyrider";

function digitsZip(raw: string): string {
  return String(raw || "").replace(/\D/g, "").slice(0, 5);
}

/**
 * Resolve hourly rate in cents: exact ZIP → 3-digit prefix → role default.
 * See docs/CONTRACTOR-HOURLY-PAY.md.
 */
export function hourlyRateCents(
  cfg: PayoutConfig,
  role: ContractorPayRole,
  postalCode: string,
): number {
  const zip = digitsZip(postalCode);
  const rows = Array.isArray(cfg.hourlyByZip) ? cfg.hourlyByZip : [];
  const pick = (row: HourlyZipRate) =>
    role === "wrapstar" ? row.wrapstarCents : row.joyriderCents;

  if (zip.length === 5) {
    const exact = rows.find((r) => digitsZip(r.zip) === zip);
    if (exact) return pick(exact);
  }
  if (zip.length >= 3) {
    const prefix = zip.slice(0, 3);
    const pref = rows.find((r) => digitsZip(r.zip) === prefix);
    if (pref) return pick(pref);
  }
  return role === "wrapstar"
    ? cfg.wrapstarHourlyCents || DEFAULT_WRAPSTAR_HOURLY_CENTS
    : cfg.joyriderHourlyCents || DEFAULT_JOYRIDER_HOURLY_CENTS;
}

/** Reduction for a WrapStar hour that finished fewer than pace gifts. */
export function wrapstarPaceReductionCents(
  hourlyCents: number,
  giftsFinished: number,
  pace = WRAPSTAR_PACE_GIFTS_PER_HOUR,
): number {
  const finished = Math.max(0, Math.floor(giftsFinished));
  const shortfall = Math.max(0, pace - finished);
  if (shortfall === 0 || pace <= 0) return 0;
  return Math.round(shortfall * (hourlyCents / pace));
}

export async function hourlyRateCentsForZip(
  role: ContractorPayRole,
  postalCode: string,
): Promise<number> {
  const cfg = await getPayoutConfig();
  return hourlyRateCents(cfg, role, postalCode);
}

export function parseHourlyZipTable(raw: string): HourlyZipRate[] {
  const out: HourlyZipRate[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/[,\t ]+/).filter(Boolean);
    if (parts.length < 3) continue;
    const zip = digitsZip(parts[0] || "");
    if (zip.length !== 3 && zip.length !== 5) continue;
    const wrapstar = Math.round(Number(parts[1]) * 100);
    const joyrider = Math.round(Number(parts[2]) * 100);
    if (!Number.isFinite(wrapstar) || !Number.isFinite(joyrider)) continue;
    out.push({ zip, wrapstarCents: wrapstar, joyriderCents: joyrider });
  }
  return out;
}

export function formatHourlyZipTable(rows: HourlyZipRate[] | undefined): string {
  if (!rows?.length) return "";
  return rows
    .map(
      (r) =>
        `${r.zip} ${(r.wrapstarCents / 100).toFixed(2)} ${(r.joyriderCents / 100).toFixed(2)}`,
    )
    .join("\n");
}
