export type UnitPrices = {
  giftWrapBase: number;
  customDesignAi: number;
  customDesignUpload: number;
  flowers: number;
};

export type PricingRuleWhen = {
  states?: string[];
  counties?: string[]; // "DUVAL,FL"
  postalCodePrefixes?: string[];
  countries?: string[];
  dateRanges?: Array<{ start: string; end: string }>;
};

export type PricingRule = {
  id: string;
  label?: string;
  when: PricingRuleWhen;
  unitPrices?: UnitPrices;
  multiplier?: number;
};

export type VolumeDiscount = {
  twoItemsPercent: number;
  threeToNineItemsPercent: number;
  tenPlusItemsPercent: number;
};

export const ZERO_VOLUME_DISCOUNT: VolumeDiscount = {
  twoItemsPercent: 0,
  threeToNineItemsPercent: 0,
  tenPlusItemsPercent: 0,
};

export type PricingConfig = {
  version: string;
  defaultUnitPrices: UnitPrices;
  globalMultiplier: number;
  rules: PricingRule[];
  retailers: Record<string, UnitPrices>;
  volumeDiscount: VolumeDiscount;
};

function wholePercent(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(99, Math.round(n));
}

export function normalizeVolumeDiscount(raw: unknown): VolumeDiscount {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    twoItemsPercent: wholePercent(src.twoItemsPercent),
    threeToNineItemsPercent: wholePercent(src.threeToNineItemsPercent),
    tenPlusItemsPercent: wholePercent(src.tenPlusItemsPercent),
  };
}

/** 10+ ≥ 3–9 ≥ 2. Null when the order is valid. */
export function volumeDiscountOrderError(tiers: VolumeDiscount): string | null {
  const t = normalizeVolumeDiscount(tiers);
  if (t.threeToNineItemsPercent < t.twoItemsPercent) {
    return '"3 to 9 items" discount must be greater than or equal to "2 items" discount.';
  }
  if (t.tenPlusItemsPercent < t.threeToNineItemsPercent) {
    return '"10+ items" discount must be greater than or equal to "3 to 9 items" discount.';
  }
  return null;
}

function withVolumeDiscount(cfg: PricingConfig): PricingConfig {
  cfg.volumeDiscount = normalizeVolumeDiscount(cfg.volumeDiscount);
  return cfg;
}

export type ZipCountyIndex = {
  version: string | null;
  source: string | null;
  zipCount: number;
  countiesByState: Record<string, string[]>;
};

function apiBase(): string {
  return (process.env.WRRAPD_API_BASE_URL || "https://api.wrrapd.com").replace(/\/$/, "");
}

function adminHeaders(): HeadersInit {
  const key = (process.env.WRRAPD_ADMIN_API_KEY || "").trim();
  if (!key) {
    throw new Error("WRRAPD_ADMIN_API_KEY is not set on the tracking platform");
  }
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export async function fetchWrrapdPricingConfig(): Promise<PricingConfig> {
  const r = await fetch(`${apiBase()}/api/admin/pricing-config`, {
    headers: adminHeaders(),
    cache: "no-store",
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `HTTP ${r.status}`);
  }
  if (!body.config || typeof body.config !== "object") {
    throw new Error("Invalid pricing config response");
  }
  const cfg = body.config as PricingConfig;
  cfg.rules = Array.isArray(cfg.rules) ? (cfg.rules as PricingRule[]) : [];
  return withVolumeDiscount(cfg);
}

export async function saveWrrapdPricingConfig(config: PricingConfig): Promise<PricingConfig> {
  const r = await fetch(`${apiBase()}/api/admin/pricing-config`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({ config }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `HTTP ${r.status}`);
  }
  if (!body.config || typeof body.config !== "object") {
    throw new Error("Invalid save response");
  }
  const cfg = body.config as PricingConfig;
  cfg.rules = Array.isArray(cfg.rules) ? (cfg.rules as PricingRule[]) : [];
  return withVolumeDiscount(cfg);
}

export async function saveWrrapdVolumeDiscount(volumeDiscount: VolumeDiscount): Promise<PricingConfig> {
  const orderErr = volumeDiscountOrderError(volumeDiscount);
  if (orderErr) throw new Error(orderErr);
  const r = await fetch(`${apiBase()}/api/admin/volume-discount`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({ volumeDiscount: normalizeVolumeDiscount(volumeDiscount) }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `HTTP ${r.status}`);
  }
  if (!body.config || typeof body.config !== "object") {
    throw new Error("Invalid save response");
  }
  const cfg = body.config as PricingConfig;
  cfg.rules = Array.isArray(cfg.rules) ? (cfg.rules as PricingRule[]) : [];
  return withVolumeDiscount(cfg);
}

export async function fetchZipCountyIndex(): Promise<ZipCountyIndex> {
  const r = await fetch(`${apiBase()}/api/admin/zip-county-index`, {
    headers: adminHeaders(),
    cache: "no-store",
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `HTTP ${r.status}`);
  }
  return body.index as ZipCountyIndex;
}

export const RETAILER_LABELS: Record<string, string> = {
  amazon: "Amazon",
  lego: "LEGO",
  etsy: "Etsy",
  walmart: "Walmart",
  nordstrom: "Nordstrom",
  sephora: "Sephora",
  target: "Target",
  ulta: "Ulta",
  kohls: "Kohl's",
  bestbuy: "Best Buy",
};

export function priceFieldKeys(): (keyof UnitPrices)[] {
  return ["giftWrapBase", "customDesignAi", "customDesignUpload", "flowers"];
}

export function priceFieldLabel(key: keyof UnitPrices): string {
  switch (key) {
    case "giftWrapBase":
      return "Gift wrap base";
    case "customDesignAi":
      return "AI design add-on";
    case "customDesignUpload":
      return "Custom upload add-on";
    case "flowers":
      return "Flowers";
    default:
      return key;
  }
}
