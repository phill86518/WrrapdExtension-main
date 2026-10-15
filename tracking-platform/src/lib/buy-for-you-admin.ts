/** Command Center → "We buy it" module. Reads and writes the pay server's /api/admin/buy/* routes. */

export type BuyConfig = {
  mode: "off" | "test" | "live";
  previewCode: string;
  maxLinks: number;
  merchandiseCapCents: number;
  perItemCapCents: number;
  quoteWaitMinutes: number;
  allowElectronics: boolean;
  allowedRetailers: string[];
  automatedQuoteRetailers: string[];
  teamAlertEmails: string[];
  returnWindowDays: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type RunnerStatus = { playwright: boolean; signedInProfile: boolean; ready: boolean };

export type ShippingOption = {
  id: string;
  label: string;
  cents: number;
  arrivalDate: string | null;
  taxCents?: number | null;
};

export type BuyQuote = {
  itemPrices: Record<string, number>;
  shippingOptions: ShippingOption[];
  taxCents: number | null;
  retailerTotalCents: number | null;
  note?: string;
  at: string;
  source: "runner" | "person";
  by: string;
};

export type BuyGroup = {
  retailer: string;
  retailerName: string;
  state: "waiting" | "quoting" | "needs_person" | "ready" | "unavailable" | "empty";
  kind?: "initial" | "booking";
  quote: BuyQuote | null;
  previousQuote?: BuyQuote | null;
  selectedShippingId: string | null;
  requestedAt?: string;
  deadlineAt?: string;
  runner?: { at: string; ok: boolean; reason: string; failedStep: number | null } | null;
  placement?: { state: "to_place" | "placed" | "cancelled" } | null;
};

export type WrapChoice = {
  occasion: string;
  style: "wrrapd" | "ai" | "upload";
  giftMessage: string;
  senderName: string;
  done: boolean;
  aiDesign?: { filePath: string; title: string; description: string; imageUrl: string };
  upload?: { filePath: string; fileName: string; imageUrl: string };
  flowers?: { offerId: string; amount: number; imageUrl: string; title: string };
};

export type BuyLine = {
  id: string;
  url: string;
  canonicalUrl?: string;
  productId?: string;
  retailer: string;
  retailerName: string;
  state: "reading" | "needs_variant" | "quoting" | "ready" | "unavailable";
  reason?: string;
  message?: string;
  readFailure?: string;
  removed?: boolean;
  cancelled?: boolean;
  variantLabel?: string;
  product: {
    title: string;
    brand?: string;
    imageUrl?: string;
    category?: string;
    amazonCategory?: AmazonCategory | null;
    isElectronics?: boolean;
    pagePriceCents?: number | null;
    variantGroups?: Array<{ name: string; options: string[]; selected: string | null }>;
    readBy?: string;
  } | null;
  wrap: WrapChoice | null;
};

export type BillGroup = {
  retailer: string;
  retailerName: string;
  items: Array<{ lineId: string; title: string; variant: string; cents: number }>;
  shipping: { id: string; label: string; cents: number; arrivalDate: string | null };
  taxCents: number;
  subtotalCents: number;
};

export type Bill = {
  groups: BillGroup[];
  merchandiseCents: number;
  retailerCents: number;
  totalCents: number;
  wrap: {
    giftWrapCents: number;
    giftWrapCount: number;
    discountCents: number;
    designAiCents: number;
    designUploadCents: number;
    flowersCents: number;
    boxCents: number;
    serviceTaxCents: number;
    totalCents: number;
  };
  bundles: Array<{ arrivalDate: string | null; deliveryDate: string | null; lineIds: string[]; titles: string[] }>;
};

export type BuyBatch = {
  id: string;
  status: "open" | "paid" | "closed";
  createdAt: string;
  updatedAt: string;
  gifteeZip: string;
  hub: { displayName: string; addressLine1: string; addressLine2?: string; city: string; state: string; postalCode: string; phone?: string };
  lines: BuyLine[];
  groups: Record<string, BuyGroup>;
  terms: {
    version: string;
    acceptedAt: string;
    ip: string;
    email: string;
    electronicsRequired: boolean;
    electronicsAccepted: boolean;
  } | null;
  refresh: { state: "running" | "done"; startedAt: string; doneAt?: string; changes: Array<{ text: string }>; retailers: string[] } | null;
  paidBill?: Bill;
  payment?: {
    transactionId: string;
    amountCents: number;
    paidAt: string;
    gifterName: string;
    email: string;
    phone: string;
    giftee: { name: string; line1: string; line2?: string; city: string; state: string; postalCode: string; phone?: string };
  };
  placements: Record<string, { state: "placed"; retailerOrderNumber: string; retailerTotalCents: number; arrivalDate: string; placedAt: string; by: string }>;
  bundles: Record<string, { key: string; arrivalDate: string | null; lineIds: string[]; externalOrderId: string; ingest?: { ok: boolean; at: string; reason: string } }>;
  returns: Record<string, { requests: Array<{ at: string; deliveredAt: string; deadline: string; caller: string; condition: string; note: string; by: string }>; refunded?: { at: string; amountCents: number; by: string } }>;
  refunds: Array<{ id: string; ok: boolean; amountCents: number; kind: string; reason: string; by: string; at: string; error: string; lineIds: string[] }>;
  log: Array<{ at: string; who: string; what: string }>;
  refundedCents: number;
  returnWindowDays: number;
};

export type BuyBatchSummary = {
  id: string;
  status: "open" | "paid" | "closed" | "expired";
  createdAt: string;
  updatedAt: string;
  gifteeZip: string;
  hub: string;
  lineCount: number;
  readyCount: number;
  groups: Array<{
    retailer: string;
    retailerName: string;
    state: BuyGroup["state"];
    kind: string | null;
    deadlineAt: string | null;
    placement: { state: string } | null;
  }>;
  refreshRunning: boolean;
  totalCents: number | null;
  refundedCents: number;
  gifterName: string;
  email: string;
  bundles: Array<{ key: string; externalOrderId: string; ok: boolean }>;
  manualOpen?: number;
};

export type ManualState =
  | "requested"
  | "read_ok"
  | "in_cart"
  | "paid_with_order"
  | "awaiting_approval"
  | "paid"
  | "placed"
  | "declined"
  | "cancelled"
  | "removed";

export type ManualAddOn = {
  id: string;
  lineId: string;
  state: "awaiting_approval" | "paid" | "placed" | "declined" | "cancelled";
  retailerName: string;
  item: { title: string; imageUrl: string; variant: string; unitCents: number; qty: number; cents: number };
  shipping: { cents: number; arrivalDate: string | null };
  taxCents: number;
  wrapBill: { giftWrapCents: number; designCents: number; serviceTaxCents: number; totalCents: number; wrapBaseCents: number };
  wrapStyle: string;
  totalCents: number;
  paidAt: string | null;
  placement: { state: "to_place" | "placed"; retailerOrderNumber?: string; retailerTotalCents?: number; arrivalDate?: string; placedAt?: string } | null;
  ingest: { ok: boolean; at: string; reason: string } | null;
  approvalSentAt: string | null;
  declinedAt: string | null;
};

export type ManualRow = {
  batchId: string;
  lineId: string;
  url: string;
  retailer: string;
  retailerName: string;
  reason: string;
  state: ManualState;
  requestedAt: string | null;
  addedAt: string | null;
  addedBy: string;
  onlyItem: boolean;
  email: string;
  gifterName: string;
  batchStatus: "open" | "paid" | "closed" | "expired";
  gifteeZip: string;
  hub: string;
  otherItems: number;
  product: { title: string; imageUrl: string; pagePriceCents: number | null; variant: string } | null;
  addOn: ManualAddOn | null;
  note: string;
  cartUrl: string;
  approveUrl: string;
};

export async function listManualAdditions() {
  return (await call<{ items: ManualRow[] }>("/api/admin/buy/manual")).items;
}

export type WorkflowStep = {
  action: string;
  purpose: string;
  target?: { selector?: string; text?: string; role?: string };
  value?: string;
  optional?: boolean;
};

export type WorkflowVersion = {
  version: number;
  steps?: WorkflowStep[];
  stepCount?: number;
  source: string;
  note: string;
  savedAt: string;
  savedBy: string;
  retiredAt?: string;
  verified: boolean;
  successCount: number;
  failCount: number;
  lastSuccessAt?: string | null;
  lastFailure?: { at: string; step: number | null; reason: string } | null;
};

export type RetailerWorkflow = {
  retailer: string;
  name: string;
  current: WorkflowVersion;
  history: WorkflowVersion[];
  runs: Array<{ at: string; ok: boolean; version: number; batchId: string | null; healed: boolean; step?: number | null; reason?: string }>;
};

function apiBase(): string {
  return (process.env.WRRAPD_API_BASE_URL || "https://api.wrrapd.com").replace(/\/$/, "");
}

function adminHeaders(): HeadersInit {
  const key = (process.env.WRRAPD_ADMIN_API_KEY || "").trim();
  if (!key) throw new Error("WRRAPD_ADMIN_API_KEY is not set on the tracking platform");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: adminHeaders(),
    cache: "no-store",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || `Pay server ${res.status}`);
  return j;
}

export async function fetchBuyConfig() {
  return call<{ config: BuyConfig; retailers: Array<{ id: string; name: string; runner: RunnerStatus }>; termsVersion: string }>(
    "/api/admin/buy/config",
  );
}

export async function saveBuyConfig(config: Partial<BuyConfig>, updatedBy: string) {
  return (await call<{ config: BuyConfig }>("/api/admin/buy/config", { config, updatedBy })).config;
}

export async function listBuyBatches() {
  return (await call<{ batches: BuyBatchSummary[] }>("/api/admin/buy/batches")).batches;
}

export async function getBuyBatch(id: string) {
  return call<{ batch: BuyBatch; bill: Bill | null; billError: string | null; runner: Record<string, RunnerStatus>; termsVersion: string }>(
    `/api/admin/buy/batches/${encodeURIComponent(id)}`,
  );
}

export async function postBuyAction(id: string, action: string, body: Record<string, unknown>) {
  return call<{ batch?: BuyBatch; ingest?: Array<{ key: string; ok: boolean; reason: string }>; deadline?: string }>(
    `/api/admin/buy/batches/${encodeURIComponent(id)}/${action}`,
    body,
  );
}

export type AmazonCategory = { department: string; subcategory: string; path: string; source: "amazon_page" | "grok" };

export type BuyPurchase = {
  batchId: string;
  lineId: string;
  title: string;
  variant: string;
  imageUrl: string;
  productUrl: string;
  brand: string;
  retailer: string;
  retailerName: string;
  retailerCategory: string;
  amazonCategory: AmazonCategory | null;
  itemPriceCents: number;
  shippingLabel: string;
  wrapCents: number | null;
  gifter: { name: string; email: string; phone: string };
  giftee: { name: string; line1: string; line2?: string; city: string; state: string; postalCode: string; phone?: string } | null;
  status: "to_place" | "placed" | "cancelled" | "returned";
  retailerOrderNumber: string;
  externalOrderId: string;
  sentToOrders: boolean;
  dates: { created: string; paid: string | null; placed: string | null; hubArrival: string | null; delivery: string | null };
  addedManually?: boolean;
};

export async function listBuyPurchases() {
  return call<{ items: BuyPurchase[]; categories: Record<string, string[]> }>("/api/admin/buy/purchases");
}

export function ymdLabel(ymd?: string | null): string {
  if (!ymd) return "—";
  const d = new Date(`${ymd}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString("en-US", { timeZone: "UTC", dateStyle: "medium" });
}

export async function fetchWorkflows() {
  return call<{ workflows: RetailerWorkflow[]; actions: string[]; purposes: string[] }>("/api/admin/buy/workflows");
}

export async function restoreWorkflow(retailer: string, version: number, by: string) {
  return call(`/api/admin/buy/workflows/${encodeURIComponent(retailer)}/restore`, { version, by });
}

export async function saveWorkflow(retailer: string, steps: WorkflowStep[], note: string, verified: boolean, by: string) {
  return call(`/api/admin/buy/workflows/${encodeURIComponent(retailer)}/save`, { steps, note, verified, by });
}

export function usd(cents: number | null | undefined): string {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export function dollarsToCents(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function isPast(iso?: string | null): boolean {
  return !!iso && Date.parse(iso) < Date.now();
}

export function etTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
}
