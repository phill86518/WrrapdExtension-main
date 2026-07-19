/**
 * WrapStar / Driver employee-ID state digits (01–50).
 * Used as positions 4–5 of the 10-digit ID.
 */
export const US_STATE_NUMBER: Record<string, string> = {
  AL: "01",
  AK: "02",
  AZ: "03",
  AR: "04",
  CA: "05",
  CO: "06",
  CT: "07",
  DE: "08",
  FL: "09",
  GA: "10",
  HI: "11",
  ID: "12",
  IL: "13",
  IN: "14",
  IA: "15",
  KS: "16",
  KY: "17",
  LA: "18",
  ME: "19",
  MD: "20",
  MA: "21",
  MI: "22",
  MN: "23",
  MS: "24",
  MO: "25",
  MT: "26",
  NE: "27",
  NV: "28",
  NH: "29",
  NJ: "30",
  NM: "31",
  NY: "32",
  NC: "33",
  ND: "34",
  OH: "35",
  OK: "36",
  OR: "37",
  PA: "38",
  RI: "39",
  SC: "40",
  SD: "41",
  TN: "42",
  TX: "43",
  UT: "44",
  VT: "45",
  VA: "46",
  WA: "47",
  WV: "48",
  WI: "49",
  WY: "50",
};

export const STATE_NUMBER_TO_ABBR: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATE_NUMBER).map(([abbr, num]) => [num, abbr]),
);

type ZipRange = { lo: number; hi: number; state: string };

/** USPS ZIP3 ranges → state (contiguous blocks; first match wins). */
const ZIP3_RANGES: ZipRange[] = [
  { lo: 995, hi: 999, state: "AK" },
  { lo: 350, hi: 369, state: "AL" },
  { lo: 716, hi: 729, state: "AR" },
  { lo: 850, hi: 865, state: "AZ" },
  { lo: 900, hi: 961, state: "CA" },
  { lo: 800, hi: 816, state: "CO" },
  { lo: 60, hi: 69, state: "CT" },
  { lo: 197, hi: 199, state: "DE" },
  { lo: 320, hi: 349, state: "FL" },
  { lo: 300, hi: 319, state: "GA" },
  { lo: 398, hi: 399, state: "GA" },
  { lo: 967, hi: 968, state: "HI" },
  { lo: 500, hi: 528, state: "IA" },
  { lo: 832, hi: 838, state: "ID" },
  { lo: 600, hi: 629, state: "IL" },
  { lo: 460, hi: 479, state: "IN" },
  { lo: 660, hi: 679, state: "KS" },
  { lo: 400, hi: 427, state: "KY" },
  { lo: 700, hi: 715, state: "LA" },
  { lo: 10, hi: 27, state: "MA" },
  { lo: 55, hi: 55, state: "MA" },
  { lo: 206, hi: 219, state: "MD" },
  { lo: 39, hi: 49, state: "ME" },
  { lo: 480, hi: 499, state: "MI" },
  { lo: 550, hi: 567, state: "MN" },
  { lo: 630, hi: 658, state: "MO" },
  { lo: 386, hi: 397, state: "MS" },
  { lo: 590, hi: 599, state: "MT" },
  { lo: 270, hi: 289, state: "NC" },
  { lo: 580, hi: 588, state: "ND" },
  { lo: 680, hi: 693, state: "NE" },
  { lo: 30, hi: 38, state: "NH" },
  { lo: 70, hi: 89, state: "NJ" },
  { lo: 870, hi: 884, state: "NM" },
  { lo: 889, hi: 898, state: "NV" },
  { lo: 100, hi: 149, state: "NY" },
  { lo: 430, hi: 459, state: "OH" },
  { lo: 730, hi: 749, state: "OK" },
  { lo: 970, hi: 979, state: "OR" },
  { lo: 150, hi: 196, state: "PA" },
  { lo: 28, hi: 29, state: "RI" },
  { lo: 290, hi: 299, state: "SC" },
  { lo: 570, hi: 577, state: "SD" },
  { lo: 370, hi: 385, state: "TN" },
  { lo: 750, hi: 799, state: "TX" },
  { lo: 885, hi: 885, state: "TX" },
  { lo: 840, hi: 847, state: "UT" },
  { lo: 220, hi: 246, state: "VA" },
  { lo: 50, hi: 54, state: "VT" },
  { lo: 56, hi: 59, state: "VT" },
  { lo: 980, hi: 994, state: "WA" },
  { lo: 530, hi: 549, state: "WI" },
  { lo: 247, hi: 268, state: "WV" },
  { lo: 820, hi: 831, state: "WY" },
  // DC → treat as Maryland for employee ID table (no DC row)
  { lo: 200, hi: 205, state: "MD" },
];

/** Resolve USPS state abbreviation from a 5-digit ZIP. */
export function stateAbbrFromZip(postalCode: string): string | null {
  const zip = postalCode.replace(/\D/g, "").slice(0, 5);
  if (zip.length < 3) return null;
  const z3 = Number.parseInt(zip.slice(0, 3), 10);
  if (!Number.isFinite(z3)) return null;
  for (const r of ZIP3_RANGES) {
    if (z3 >= r.lo && z3 <= r.hi) return r.state;
  }
  return null;
}

export function stateNumberFromZip(postalCode: string): string | null {
  const abbr = stateAbbrFromZip(postalCode);
  if (!abbr) return null;
  return US_STATE_NUMBER[abbr] ?? null;
}
