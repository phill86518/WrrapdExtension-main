import type { HourlyZipRate, PayoutConfig } from "./types";
import { getPayoutConfig } from "./finance";

export const DEFAULT_WRAPSTAR_HOURLY_CENTS = 2500;
export const DEFAULT_JOYRIDER_HOURLY_CENTS = 2200;
/** WrapRider — third hire track with its own hourly rate (not a blend of the other two). */
export const DEFAULT_WRAPRIDER_HOURLY_CENTS = 2400;
export const WRAPSTAR_PACE_GIFTS_PER_HOUR = 12;

/** Three distinct pay structures — one per hire track. */
export type ContractorPayRole = "wrapstar" | "joyrider" | "wraprider";

function digitsZip(raw: string): string {
  return String(raw || "").replace(/\D/g, "").slice(0, 5);
}

function roleDefaultCents(cfg: PayoutConfig, role: ContractorPayRole): number {
  if (role === "wrapstar") return cfg.wrapstarHourlyCents || DEFAULT_WRAPSTAR_HOURLY_CENTS;
  if (role === "joyrider") return cfg.joyriderHourlyCents || DEFAULT_JOYRIDER_HOURLY_CENTS;
  return cfg.wrapriderHourlyCents || DEFAULT_WRAPRIDER_HOURLY_CENTS;
}

function rowCents(row: HourlyZipRate, role: ContractorPayRole): number | undefined {
  if (role === "wrapstar") return row.wrapstarCents;
  if (role === "joyrider") return row.joyriderCents;
  // Legacy 3-column rows have no WrapRider value → fall through to the role default.
  return typeof row.wrapriderCents === "number" && row.wrapriderCents > 0
    ? row.wrapriderCents
    : undefined;
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

  if (zip.length === 5) {
    const exact = rows.find((r) => digitsZip(r.zip) === zip);
    const v = exact ? rowCents(exact, role) : undefined;
    if (v !== undefined) return v;
  }
  if (zip.length >= 3) {
    const prefix = zip.slice(0, 3);
    const pref = rows.find((r) => digitsZip(r.zip) === prefix);
    const v = pref ? rowCents(pref, role) : undefined;
    if (v !== undefined) return v;
  }
  return roleDefaultCents(cfg, role);
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

/**
 * ZIP table: `ZIP WrapStar$ JoyRider$ [WrapRider$]` — one row per line. The fourth column is
 * optional; rows without it use the WrapRider default.
 */
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
    const row: HourlyZipRate = { zip, wrapstarCents: wrapstar, joyriderCents: joyrider };
    if (parts.length >= 4) {
      const wraprider = Math.round(Number(parts[3]) * 100);
      if (Number.isFinite(wraprider) && wraprider > 0) row.wrapriderCents = wraprider;
    }
    out.push(row);
  }
  return out;
}

export function formatHourlyZipTable(rows: HourlyZipRate[] | undefined): string {
  if (!rows?.length) return "";
  return rows
    .map((r) => {
      const base = `${r.zip} ${(r.wrapstarCents / 100).toFixed(2)} ${(r.joyriderCents / 100).toFixed(2)}`;
      return typeof r.wrapriderCents === "number" && r.wrapriderCents > 0
        ? `${base} ${(r.wrapriderCents / 100).toFixed(2)}`
        : base;
    })
    .join("\n");
}
