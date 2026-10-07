/**
 * Delivery hubs — Command Center client for the pay server's `/api/admin/delivery-hubs*`.
 * The extension asks api.wrrapd.com for the hub closest to each giftee ZIP; this module
 * manages the hub list that answer comes from.
 */

export type DeliveryHubKind = "premium-po-box" | "po-box" | "street";

export type DeliveryHubRow = {
  id: string;
  name: string;
  kind: DeliveryHubKind;
  organization: string;
  recipientFirstName: string;
  recipientLastName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  active: boolean;
  notes: string;
  updatedAt: string;
  isDefault: boolean;
  shipLines: string[];
  geo: { zip: string; state: string; county: string } | null;
  knownCentroid: boolean;
  servedAllowedZipCount: number;
  farthestServedMiles: number;
};

export type DeliveryHubReport = {
  updatedAt: string | null;
  defaultHubId: string;
  kinds: Record<DeliveryHubKind, string>;
  allowedZipCount: number;
  hubs: DeliveryHubRow[];
};

export type DeliveryHubCheck = {
  postalCode: string;
  knownCentroid: boolean;
  geo: { zip: string; state: string; county: string } | null;
  hubId: string;
  hubName: string;
  matched: "nearest" | "default";
  distanceMiles: number | null;
  distances: { id: string; name: string; postalCode: string; active: boolean; distanceMiles: number | null }[];
};

export type DeliveryHubInput = {
  id?: string;
  name: string;
  kind: DeliveryHubKind;
  organization?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  phone?: string;
  notes?: string;
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

async function parseReport(r: Response): Promise<DeliveryHubReport> {
  const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `HTTP ${r.status}`);
  }
  if (!body.report || typeof body.report !== "object") {
    throw new Error("Pay server returned no hub report");
  }
  return body.report as DeliveryHubReport;
}

async function post(pathName: string, body: unknown): Promise<DeliveryHubReport> {
  const r = await fetch(`${apiBase()}${pathName}`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  return parseReport(r);
}

export async function fetchDeliveryHubReport(): Promise<DeliveryHubReport> {
  const r = await fetch(`${apiBase()}/api/admin/delivery-hubs`, {
    headers: adminHeaders(),
    cache: "no-store",
  });
  return parseReport(r);
}

export function upsertDeliveryHub(input: DeliveryHubInput): Promise<DeliveryHubReport> {
  return post("/api/admin/delivery-hubs/upsert", input);
}

export function removeDeliveryHub(id: string): Promise<DeliveryHubReport> {
  return post("/api/admin/delivery-hubs/remove", { id });
}

export function setDeliveryHubActive(id: string, active: boolean): Promise<DeliveryHubReport> {
  return post("/api/admin/delivery-hubs/active", { id, active });
}

export function setDefaultDeliveryHub(id: string): Promise<DeliveryHubReport> {
  return post("/api/admin/delivery-hubs/default", { id });
}

export async function checkDeliveryHubZip(postalCode: string): Promise<DeliveryHubCheck> {
  const u = new URL(`${apiBase()}/api/admin/delivery-hubs/check`);
  u.searchParams.set("postalCode", postalCode);
  const r = await fetch(u.toString(), { headers: adminHeaders(), cache: "no-store" });
  const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `HTTP ${r.status}`);
  }
  return body.result as DeliveryHubCheck;
}
