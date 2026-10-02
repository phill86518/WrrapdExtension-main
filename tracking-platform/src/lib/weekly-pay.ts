import { promises as fs } from "fs";
import path from "path";
import type { EarningsEntry, Order, WrapStarShift } from "./types";
import { normalizeOrderStatus } from "./types";
import { hourlyRateCents, type ContractorPayRole } from "./hourly-rates";
import { getPayoutConfig, getPayoutHold, upsertEarning } from "./finance";
import { listAllOrders } from "./data";
import { listWrapShifts } from "./shift-store";
import { listRegisteredWrapstars } from "./wrapstar-registry";
import { listDeliveryDrivers } from "./driver-registry";
import { listWrapriders } from "./wraprider-registry";
import { formatDateKeyNy, hourNy } from "./ny-date";
import {
  amountCentsForHours,
  paidDeliveryHours,
  paidWrapHours,
  payWeekContaining,
  payWeekId,
  type PayWeek,
} from "./pay-week";
import { getStripeConnectAccount, sendStripePayout, stripeConfigured } from "./stripe-connect";
import { trackingWeeklyPayCollection } from "./tracking-firestore";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "weekly-pay.json");

export type WeeklyPayStatus =
  | "unpaid"
  | "withheld"
  | "needs_bank"
  | "transferred"
  | "paid"
  | "failed";

export type WeeklyPayLine = {
  id: string;
  contractorId: string;
  name: string;
  role: ContractorPayRole;
  weekStart: string;
  weekEnd: string;
  hourlyRateCents: number;
  wrapHours: number;
  deliveryHours: number;
  paidHours: number;
  finishedGifts: number;
  deliveryWindows: number;
  amountCents: number;
  status: WeeklyPayStatus;
  stripeAccountId?: string;
  stripeTransferId?: string;
  stripePayoutId?: string;
  note?: string;
  updatedAt: string;
};

type RosterPerson = {
  contractorId: string;
  name: string;
  role: ContractorPayRole;
  homePostalCode: string;
  personRateCents?: number;
  wrapstarId?: string;
  courierId?: string;
  approved: boolean;
};

function shiftCounts(shifts: WrapStarShift[], orders: Order[], wrapstarId: string, week: PayWeek): { hours: number; gifts: number } {
  const relevant = shifts.filter((shift) => {
    if (shift.wrapstarId !== wrapstarId) return false;
    if (shift.status === "cancelled" || shift.status === "sheet") return false;
    const day = shift.dateKey || formatDateKeyNy(shift.startedAt);
    return day >= week.startKey && day <= week.endKey;
  });
  const covered = new Set<string>();
  let gifts = 0;
  let hours = 0;
  for (const shift of relevant) {
    let n = 0;
    for (const item of shift.items || []) {
      covered.add(item.orderId);
      if (item.phase === "wrapped" || item.phase === "done" || item.wrappedAt || item.labeledAt) n += 1;
    }
    gifts += n;
    hours += paidWrapHours(n);
  }
  const extrasByDay = new Map<string, number>();
  for (const order of orders) {
    if ((order.wrapstarId || order.driverId) !== wrapstarId) continue;
    if (covered.has(order.id)) continue;
    if (order.wrapPhase !== "complete" && !order.wrapFinishedAt) continue;
    const day = formatDateKeyNy(order.wrapFinishedAt || order.updatedAt);
    if (day < week.startKey || day > week.endKey) continue;
    extrasByDay.set(day, (extrasByDay.get(day) || 0) + Math.max(1, order.lineItems?.length || 1));
  }
  for (const n of extrasByDay.values()) {
    gifts += n;
    hours += paidWrapHours(n);
  }
  return { hours, gifts };
}

function deliveryCounts(orders: Order[], week: PayWeek): { hours: number; windows: number } {
  const buckets = new Map<string, number[]>();
  for (const order of orders) {
    const status = normalizeOrderStatus(order.status);
    if (status !== "delivered" && status !== "out_for_delivery") continue;
    const day = formatDateKeyNy(order.updatedAt);
    if (!day || day < week.startKey || day > week.endKey) continue;
    const windowId = `${day}-${hourNy(order.updatedAt) < 13 ? "am" : "pm"}`;
    const t = new Date(order.updatedAt).getTime();
    const list = buckets.get(windowId) || [];
    if (Number.isFinite(t)) list.push(t);
    buckets.set(windowId, list);
  }
  let hours = 0;
  for (const times of buckets.values()) {
    if (times.length === 0) {
      hours += 1;
      continue;
    }
    const span = (Math.max(...times) - Math.min(...times)) / 3_600_000;
    hours += paidDeliveryHours(span);
  }
  return { hours, windows: buckets.size };
}

async function readLocal(): Promise<Record<string, WeeklyPayLine>> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, WeeklyPayLine>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeLocal(map: Record<string, WeeklyPayLine>) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(map, null, 2));
}

async function loadStored(): Promise<Record<string, WeeklyPayLine>> {
  const col = trackingWeeklyPayCollection();
  if (col) {
    const snap = await col.get();
    const out: Record<string, WeeklyPayLine> = {};
    snap.forEach((doc) => {
      out[doc.id] = doc.data() as WeeklyPayLine;
    });
    return out;
  }
  return readLocal();
}

async function saveLine(line: WeeklyPayLine): Promise<void> {
  const col = trackingWeeklyPayCollection();
  if (col) {
    await col.doc(line.id).set(line);
    return;
  }
  const map = await readLocal();
  map[line.id] = line;
  await writeLocal(map);
}

async function roster(): Promise<RosterPerson[]> {
  const [wrapstars, drivers, wrapriders] = await Promise.all([
    listRegisteredWrapstars(),
    listDeliveryDrivers(),
    listWrapriders(),
  ]);
  const people: RosterPerson[] = [];
  for (const person of wrapriders) {
    people.push({
      contractorId: person.id,
      name: person.name,
      role: "wraprider",
      homePostalCode: person.homePostalCode,
      personRateCents: person.hourlyRateCents,
      wrapstarId: person.wrapstarId,
      courierId: person.courierDriverId,
      approved: person.status === "approved",
    });
  }
  for (const person of wrapstars) {
    if (person.hireRole === "wraprider") continue;
    people.push({
      contractorId: person.id,
      name: person.name,
      role: "wrapstar",
      homePostalCode: person.homePostalCode,
      personRateCents: person.hourlyRateCents,
      wrapstarId: person.id,
      approved: true,
    });
  }
  for (const person of drivers) {
    if (person.hireRole === "wraprider") continue;
    people.push({
      contractorId: person.id,
      name: person.name,
      role: "joyrider",
      homePostalCode: person.homePostalCode,
      personRateCents: person.hourlyRateCents,
      courierId: person.id,
      approved: person.status === "approved",
    });
  }
  return people.filter((p) => p.approved);
}

export async function previewWeeklyPay(now: Date = new Date()): Promise<{
  week: PayWeek;
  lines: WeeklyPayLine[];
  stripeReady: boolean;
}> {
  const week = payWeekContaining(now);
  const cfg = await getPayoutConfig();
  const [people, shifts, orders, stored] = await Promise.all([
    roster(),
    listWrapShifts(500),
    listAllOrders(),
    loadStored(),
  ]);
  const lines: WeeklyPayLine[] = [];
  for (const person of people) {
    const id = payWeekId(week, person.contractorId);
    const saved = stored[id];
    if (saved && (saved.status === "paid" || saved.status === "transferred")) {
      lines.push(saved);
      continue;
    }
    const wrap = person.wrapstarId
      ? shiftCounts(
          shifts,
          orders,
          person.wrapstarId,
          week,
        )
      : { hours: 0, gifts: 0 };
    const delivery = person.courierId
      ? deliveryCounts(
          orders.filter((o) => o.courierDriverId === person.courierId),
          week,
        )
      : { hours: 0, windows: 0 };
    const wrapHours = person.role === "joyrider" ? 0 : wrap.hours;
    const deliveryHours = person.role === "wrapstar" ? 0 : delivery.hours;
    const paidHours = wrapHours + deliveryHours;
    const hourlyRateCentsValue = hourlyRateCents(cfg, person.role, person.homePostalCode, person.personRateCents);
    const amountCents = amountCentsForHours(paidHours, hourlyRateCentsValue);
    const hold =
      (await getPayoutHold(person.contractorId)) ||
      (person.wrapstarId ? await getPayoutHold(person.wrapstarId) : null);
    const bank = await getStripeConnectAccount(person.contractorId);
    let status: WeeklyPayStatus = saved?.status === "failed" ? "failed" : "unpaid";
    let note = saved?.note;
    if (hold?.held) {
      status = "withheld";
      note = hold.reason || "Payouts withheld";
    } else if (amountCents > 0 && !bank?.payoutsEnabled) {
      status = "needs_bank";
      note = bank ? "Bank setup is not finished" : "No bank connected";
    }
    lines.push({
      id,
      contractorId: person.contractorId,
      name: person.name,
      role: person.role,
      weekStart: week.startKey,
      weekEnd: week.endKey,
      hourlyRateCents: hourlyRateCentsValue,
      wrapHours,
      deliveryHours,
      paidHours,
      finishedGifts: person.role === "joyrider" ? 0 : wrap.gifts,
      deliveryWindows: person.role === "wrapstar" ? 0 : delivery.windows,
      amountCents,
      status,
      stripeAccountId: bank?.stripeAccountId,
      stripeTransferId: saved?.stripeTransferId,
      stripePayoutId: saved?.stripePayoutId,
      note,
      updatedAt: new Date().toISOString(),
    });
  }
  lines.sort((a, b) => b.amountCents - a.amountCents || a.name.localeCompare(b.name));
  return { week, lines, stripeReady: stripeConfigured() };
}

export async function previewForContractor(contractorId: string, now: Date = new Date()): Promise<WeeklyPayLine | null> {
  const { lines } = await previewWeeklyPay(now);
  return lines.find((line) => line.contractorId === contractorId) || null;
}

function earningFor(line: WeeklyPayLine, status: EarningsEntry["status"]): EarningsEntry {
  return {
    id: `earn-week-${line.weekStart}-${line.contractorId}`,
    orderId: `week:${line.weekStart}`,
    wrapstarId: line.contractorId,
    wrapstarName: line.name,
    basePayCents: line.amountCents,
    peakBonusCents: 0,
    tipsCents: 0,
    feesCents: 0,
    netCents: line.amountCents,
    currency: "USD",
    earnedAt: new Date().toISOString(),
    status,
    payoutId: line.stripePayoutId,
  };
}

/** Thursday evening run: transfer each unpaid week to Stripe, then pay the bank. */
export async function runWeeklyPayouts(now: Date = new Date()): Promise<{
  week: PayWeek;
  results: Array<{ contractorId: string; name: string; status: WeeklyPayStatus; note?: string }>;
}> {
  const preview = await previewWeeklyPay(now);
  const results: Array<{ contractorId: string; name: string; status: WeeklyPayStatus; note?: string }> = [];
  for (const line of preview.lines) {
    if (line.status === "paid" || line.status === "transferred") {
      results.push({ contractorId: line.contractorId, name: line.name, status: line.status });
      continue;
    }
    if (line.amountCents <= 0) continue;
    if (line.status === "withheld" || line.status === "needs_bank") {
      await saveLine(line);
      if (line.status === "withheld") await upsertEarning(earningFor(line, "unpaid"));
      results.push({ contractorId: line.contractorId, name: line.name, status: line.status, note: line.note });
      continue;
    }
    if (!preview.stripeReady || !line.stripeAccountId) {
      const skipped: WeeklyPayLine = { ...line, status: "needs_bank", note: "Stripe is not configured", updatedAt: new Date().toISOString() };
      await saveLine(skipped);
      results.push({ contractorId: line.contractorId, name: line.name, status: "needs_bank", note: skipped.note });
      continue;
    }
    try {
      const sent = await sendStripePayout({
        stripeAccountId: line.stripeAccountId,
        amountCents: line.amountCents,
        description: `Wrrapd ${line.weekStart} to ${line.weekEnd}`,
        idempotencyKey: `weekly-${line.id}`,
      });
      const paid: WeeklyPayLine = {
        ...line,
        status: "paid",
        stripeTransferId: sent.transferId,
        stripePayoutId: sent.payoutId,
        note: "Sent Thursday evening for Friday bank deposit",
        updatedAt: new Date().toISOString(),
      };
      await saveLine(paid);
      await upsertEarning(earningFor(paid, "paid"));
      results.push({ contractorId: line.contractorId, name: line.name, status: "paid" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Stripe payout failed";
      const failed: WeeklyPayLine = { ...line, status: "failed", note: message, updatedAt: new Date().toISOString() };
      await saveLine(failed);
      await upsertEarning(earningFor(failed, "unpaid"));
      results.push({ contractorId: line.contractorId, name: line.name, status: "failed", note: message });
    }
  }
  return { week: preview.week, results };
}
