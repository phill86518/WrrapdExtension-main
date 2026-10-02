import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { EarningsEntry, Order, PayoutBatch, PayoutConfig } from "./types";
import { orderWrapstarId } from "./types";
import {
  trackingEarningsCollection,
  trackingPayoutConfigDoc,
  trackingPayoutHoldsCollection,
  trackingPayoutsCollection,
} from "./tracking-firestore";

const DATA_DIR = path.join(process.cwd(), ".data");
const EARNINGS_FILE = path.join(DATA_DIR, "earnings.json");
const PAYOUTS_FILE = path.join(DATA_DIR, "payouts.json");
const CONFIG_FILE = path.join(DATA_DIR, "payout-config.json");
const HOLDS_FILE = path.join(DATA_DIR, "payout-holds.json");

export type PayoutHold = {
  contractorId: string;
  held: boolean;
  reason: string;
  updatedAt: string;
};

const DEFAULT_CONFIG: PayoutConfig = {
  basePayCents: 1800,
  peakMultiplier: 1.25,
  tipPassthrough: false,
  platformFeeCents: 0,
  platformTakeWrapPercent: 28,
  platformTakeFlowersPercent: 15,
  wrapstarHourlyCents: 3000,
  joyriderHourlyCents: 3000,
  wrapriderHourlyCents: 3000,
  wrapstarPaceGiftsPerHour: 12,
  hourlyByZip: [],
  weeklyPayoutMode: "manual",
  updatedAt: new Date().toISOString(),
};

/** Old starter placeholders → current $30/hr default (only when still at retired amounts). */
function migrateRetiredHourlyDefaults(cfg: PayoutConfig): PayoutConfig {
  const next = { ...cfg };
  if (next.wrapstarHourlyCents === 2500) next.wrapstarHourlyCents = 3000;
  if (next.joyriderHourlyCents === 2200) next.joyriderHourlyCents = 3000;
  if (
    next.wrapriderHourlyCents == null ||
    next.wrapriderHourlyCents === 0 ||
    next.wrapriderHourlyCents === 2400
  ) {
    next.wrapriderHourlyCents = 3000;
  }
  if (next.weeklyPayoutMode !== "automatic") next.weeklyPayoutMode = "manual";
  return next;
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function getPayoutConfig(): Promise<PayoutConfig> {
  const ref = trackingPayoutConfigDoc();
  if (ref) {
    const snap = await ref.get();
    if (snap.exists) {
      return migrateRetiredHourlyDefaults({ ...DEFAULT_CONFIG, ...(snap.data() as PayoutConfig) });
    }
    await ref.set(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf8");
    return migrateRetiredHourlyDefaults({ ...DEFAULT_CONFIG, ...(JSON.parse(raw) as PayoutConfig) });
  } catch {
    await ensureDir();
    await fs.writeFile(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  }
}

export async function savePayoutConfig(
  patch: Partial<Omit<PayoutConfig, "updatedAt">>,
): Promise<PayoutConfig> {
  const prev = await getPayoutConfig();
  const next: PayoutConfig = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const ref = trackingPayoutConfigDoc();
  if (ref) {
    await ref.set(next);
    return next;
  }
  await ensureDir();
  await fs.writeFile(CONFIG_FILE, JSON.stringify(next, null, 2));
  return next;
}

function normalizeHold(contractorId: string, raw: Partial<PayoutHold> | undefined): PayoutHold | null {
  if (!raw) return null;
  return {
    contractorId,
    held: !!raw.held,
    reason: typeof raw.reason === "string" ? raw.reason : "",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  };
}

async function readHoldsLocal(): Promise<Record<string, PayoutHold>> {
  try {
    const raw = await fs.readFile(HOLDS_FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, Partial<PayoutHold>>;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, PayoutHold> = {};
    for (const [id, row] of Object.entries(parsed)) {
      const hold = normalizeHold(id, row);
      if (hold) out[id] = hold;
    }
    return out;
  } catch {
    return {};
  }
}

/** Command Center withhold flag. Held funds stay in unpaid earnings. */
export async function getPayoutHold(contractorId: string): Promise<PayoutHold | null> {
  const id = contractorId.trim();
  if (!id) return null;
  const col = trackingPayoutHoldsCollection();
  if (col) {
    const snap = await col.doc(id).get();
    if (!snap.exists) return null;
    return normalizeHold(id, snap.data() as Partial<PayoutHold>);
  }
  const map = await readHoldsLocal();
  return map[id] || null;
}

export async function listPayoutHolds(): Promise<Record<string, PayoutHold>> {
  const col = trackingPayoutHoldsCollection();
  if (col) {
    const snap = await col.get();
    const out: Record<string, PayoutHold> = {};
    snap.forEach((doc) => {
      const hold = normalizeHold(doc.id, doc.data() as Partial<PayoutHold>);
      if (hold) out[doc.id] = hold;
    });
    return out;
  }
  return readHoldsLocal();
}

export async function setPayoutHold(
  contractorId: string,
  held: boolean,
  reason: string,
): Promise<PayoutHold> {
  const id = contractorId.trim();
  const next: PayoutHold = {
    contractorId: id,
    held,
    reason: reason.trim(),
    updatedAt: new Date().toISOString(),
  };
  const col = trackingPayoutHoldsCollection();
  if (col) {
    await col.doc(id).set(next);
    return next;
  }
  const map = await readHoldsLocal();
  map[id] = next;
  await ensureDir();
  await fs.writeFile(HOLDS_FILE, JSON.stringify(map, null, 2));
  return next;
}

async function listEarningsLocal(): Promise<EarningsEntry[]> {
  try {
    const raw = await fs.readFile(EARNINGS_FILE, "utf8");
    const parsed = JSON.parse(raw) as EarningsEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeEarningsLocal(list: EarningsEntry[]) {
  await ensureDir();
  await fs.writeFile(EARNINGS_FILE, JSON.stringify(list, null, 2));
}

export async function listEarnings(): Promise<EarningsEntry[]> {
  const col = trackingEarningsCollection();
  if (col) {
    const snap = await col.get();
    return snap.docs.map((d) => d.data() as EarningsEntry);
  }
  return listEarningsLocal();
}

export async function listEarningsForWrapstar(wrapstarId: string): Promise<EarningsEntry[]> {
  const all = await listEarnings();
  return all
    .filter((e) => e.wrapstarId === wrapstarId)
    .sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
}

function isWeeklyLedgerRow(entry: Pick<EarningsEntry, "id" | "orderId">): boolean {
  return entry.orderId.startsWith("week:") || entry.id.startsWith("earn-week-");
}

/** Live pay is the Thursday Stripe week. Existing per-order rows stay; new deliveries do not add another payable. */
export async function createEarningsForDeliveredOrder(order: Order): Promise<EarningsEntry | null> {
  const wsId = orderWrapstarId(order);
  if (!wsId) return null;
  const existing = (await listEarnings()).find((e) => e.orderId === order.id);
  return existing || null;
}

async function listPayoutsLocal(): Promise<PayoutBatch[]> {
  try {
    const raw = await fs.readFile(PAYOUTS_FILE, "utf8");
    const parsed = JSON.parse(raw) as PayoutBatch[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writePayoutsLocal(list: PayoutBatch[]) {
  await ensureDir();
  await fs.writeFile(PAYOUTS_FILE, JSON.stringify(list, null, 2));
}

export async function listPayouts(): Promise<PayoutBatch[]> {
  const col = trackingPayoutsCollection();
  if (col) {
    const snap = await col.get();
    return snap.docs
      .map((d) => d.data() as PayoutBatch)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return (await listPayoutsLocal()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function walletForWrapstar(wrapstarId: string): Promise<{
  unpaidCents: number;
  paidCents: number;
  lifetimeCents: number;
  unpaidCount: number;
}> {
  const earnings = await listEarningsForWrapstar(wrapstarId);
  let unpaidCents = 0;
  let paidCents = 0;
  let unpaidCount = 0;
  for (const e of earnings) {
    if (isWeeklyLedgerRow(e)) continue;
    if (e.status === "unpaid" || e.status === "included_in_payout") {
      unpaidCents += e.netCents;
      if (e.status === "unpaid") unpaidCount += 1;
    }
    if (e.status === "paid") paidCents += e.netCents;
  }
  return {
    unpaidCents,
    paidCents,
    lifetimeCents: unpaidCents + paidCents,
    unpaidCount,
  };
}

/** Create a pending payout batch for all unpaid earnings of a WrapStar. */
export async function createPayoutBatch(wrapstarId: string): Promise<
  { ok: true; payout: PayoutBatch } | { ok: false; error: string }
> {
  const hold = await getPayoutHold(wrapstarId);
  if (hold?.held) {
    return {
      ok: false,
      error: "Payouts are withheld for this contractor. Release the hold before creating a batch. Unpaid earnings stay unpaid.",
    };
  }
  const unpaid = (await listEarningsForWrapstar(wrapstarId)).filter(
    (e) => e.status === "unpaid" && !isWeeklyLedgerRow(e),
  );
  if (unpaid.length === 0) return { ok: false, error: "No unpaid earnings for this WrapStar." };

  const netCents = unpaid.reduce((s, e) => s + e.netCents, 0);
  const payout: PayoutBatch = {
    id: `pay-${randomBytes(6).toString("hex")}`,
    wrapstarId,
    wrapstarName: unpaid[0]!.wrapstarName,
    earningIds: unpaid.map((e) => e.id),
    grossCents: unpaid.reduce((s, e) => s + e.basePayCents + e.peakBonusCents + e.tipsCents, 0),
    netCents,
    currency: "USD",
    status: "pending",
    method: "manual_ach_export",
    createdAt: new Date().toISOString(),
  };

  const col = trackingPayoutsCollection();
  const earnCol = trackingEarningsCollection();
  if (col && earnCol) {
    await col.doc(payout.id).set(payout);
    await Promise.all(
      unpaid.map((e) =>
        earnCol.doc(e.id).set({ ...e, status: "included_in_payout", payoutId: payout.id }),
      ),
    );
    return { ok: true, payout };
  }

  const payouts = await listPayoutsLocal();
  payouts.push(payout);
  await writePayoutsLocal(payouts);
  const earnings = await listEarningsLocal();
  for (const e of earnings) {
    if (unpaid.some((u) => u.id === e.id)) {
      e.status = "included_in_payout";
      e.payoutId = payout.id;
    }
  }
  await writeEarningsLocal(earnings);
  return { ok: true, payout };
}

export async function markPayoutPaid(
  payoutId: string,
  reference?: string,
): Promise<{ ok: true; payout: PayoutBatch } | { ok: false; error: string }> {
  const payoutsCol = trackingPayoutsCollection();
  const earnCol = trackingEarningsCollection();

  let payout: PayoutBatch | undefined;
  if (payoutsCol) {
    const snap = await payoutsCol.doc(payoutId).get();
    if (!snap.exists) return { ok: false, error: "Payout not found." };
    payout = snap.data() as PayoutBatch;
  } else {
    payout = (await listPayoutsLocal()).find((p) => p.id === payoutId);
    if (!payout) return { ok: false, error: "Payout not found." };
  }

  const next: PayoutBatch = {
    ...payout,
    status: "paid",
    paidAt: new Date().toISOString(),
    reference: reference?.trim() || payout.reference,
  };

  if (payoutsCol && earnCol) {
    await payoutsCol.doc(payoutId).set(next);
    await Promise.all(
      next.earningIds.map(async (eid) => {
        const es = await earnCol.doc(eid).get();
        if (!es.exists) return;
        const e = es.data() as EarningsEntry;
        await earnCol.doc(eid).set({ ...e, status: "paid", payoutId });
      }),
    );
    return { ok: true, payout: next };
  }

  const payouts = await listPayoutsLocal();
  const idx = payouts.findIndex((p) => p.id === payoutId);
  if (idx >= 0) payouts[idx] = next;
  await writePayoutsLocal(payouts);
  const earnings = await listEarningsLocal();
  for (const e of earnings) {
    if (next.earningIds.includes(e.id)) {
      e.status = "paid";
      e.payoutId = payoutId;
    }
  }
  await writeEarningsLocal(earnings);
  return { ok: true, payout: next };
}

/** CSV rows for ACH / accounting export of a payout batch. */
export function payoutBatchToCsv(payout: PayoutBatch, earnings: EarningsEntry[]): string {
  const lines = [
    "payout_id,wrapstar_id,wrapstar_name,status,method,reference,net_cents,created_at,paid_at,order_id,earning_id,base_pay_cents,peak_bonus_cents,tips_cents,fees_cents,earning_net_cents,earned_at",
  ];
  for (const e of earnings.filter((x) => payout.earningIds.includes(x.id))) {
    lines.push(
      [
        payout.id,
        payout.wrapstarId,
        csvEscape(payout.wrapstarName),
        payout.status,
        payout.method,
        csvEscape(payout.reference || ""),
        String(payout.netCents),
        payout.createdAt,
        payout.paidAt || "",
        e.orderId,
        e.id,
        String(e.basePayCents),
        String(e.peakBonusCents),
        String(e.tipsCents),
        String(e.feesCents),
        String(e.netCents),
        e.earnedAt,
      ].join(","),
    );
  }
  return lines.join("\n");
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Payment rail stub — Stripe Connect later. */
export interface PaymentRail {
  name: string;
  initiatePayout(payout: PayoutBatch): Promise<{ ok: boolean; reference?: string; error?: string }>;
}

export class ManualAchExportRail implements PaymentRail {
  name = "manual_ach_export";
  async initiatePayout(payout: PayoutBatch) {
    return { ok: true, reference: `ACH-EXPORT-${payout.id}` };
  }
}

export function getPaymentRail(): PaymentRail {
  return new ManualAchExportRail();
}

export async function upsertEarning(entry: EarningsEntry): Promise<void> {
  const col = trackingEarningsCollection();
  if (col) {
    await col.doc(entry.id).set(entry);
    return;
  }
  const list = await listEarningsLocal();
  const idx = list.findIndex((e) => e.id === entry.id);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  await writeEarningsLocal(list);
}

export function formatUsdCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
