import { promises as fs } from "fs";
import path from "path";
import Stripe from "stripe";
import { trackingStripeAccountsCollection } from "./tracking-firestore";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "stripe-accounts.json");

export type StripeConnectAccount = {
  contractorId: string;
  role: "wrapstar" | "joyrider" | "wraprider";
  stripeAccountId: string;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  bankLast4: string;
  updatedAt: string;
};

export function stripeSecret(): string {
  return (process.env.STRIPE_SECRET_KEY || "").trim();
}

export function stripeConfigured(): boolean {
  return stripeSecret().startsWith("sk_");
}

function stripe(): Stripe {
  const key = stripeSecret();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  return new Stripe(key);
}

export function trackingPublicOrigin(request?: Request): string {
  const env =
    process.env.TRACKING_PUBLIC_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_TRACKING_BASE_URL?.trim() ||
    process.env.WRRAPD_PUBLIC_TRACKING_URL?.trim() ||
    "";
  if (env) return env.replace(/\/$/, "");
  if (!request) return "";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  if (!host) return "";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

async function readLocal(): Promise<Record<string, StripeConnectAccount>> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, StripeConnectAccount>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeLocal(map: Record<string, StripeConnectAccount>) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(map, null, 2));
}

export async function getStripeConnectAccount(contractorId: string): Promise<StripeConnectAccount | null> {
  const id = contractorId.trim();
  if (!id) return null;
  const col = trackingStripeAccountsCollection();
  if (col) {
    const snap = await col.doc(id).get();
    if (!snap.exists) return null;
    return snap.data() as StripeConnectAccount;
  }
  const map = await readLocal();
  return map[id] || null;
}

async function saveAccount(row: StripeConnectAccount): Promise<void> {
  const col = trackingStripeAccountsCollection();
  if (col) {
    await col.doc(row.contractorId).set(row);
    return;
  }
  const map = await readLocal();
  map[row.contractorId] = row;
  await writeLocal(map);
}

function bankLast4(account: Stripe.Account): string {
  const bank = account.external_accounts?.data?.find((a) => a.object === "bank_account");
  if (bank && "last4" in bank && bank.last4) return String(bank.last4);
  return "";
}

export async function refreshStripeConnectAccount(contractorId: string): Promise<StripeConnectAccount | null> {
  const existing = await getStripeConnectAccount(contractorId);
  if (!existing || !stripeConfigured()) return existing;
  const account = await stripe().accounts.retrieve(existing.stripeAccountId);
  const next: StripeConnectAccount = {
    ...existing,
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    bankLast4: bankLast4(account) || existing.bankLast4,
    updatedAt: new Date().toISOString(),
  };
  await saveAccount(next);
  return next;
}

export async function upsertFromStripeAccount(account: Stripe.Account): Promise<void> {
  const contractorId = account.metadata?.contractorId || "";
  const role = account.metadata?.role;
  if (!contractorId) return;
  if (role !== "wrapstar" && role !== "joyrider" && role !== "wraprider") return;
  const prev = await getStripeConnectAccount(contractorId);
  await saveAccount({
    contractorId,
    role,
    stripeAccountId: account.id,
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    bankLast4: bankLast4(account) || prev?.bankLast4 || "",
    updatedAt: new Date().toISOString(),
  });
}

export async function createConnectOnboardingLink(input: {
  contractorId: string;
  role: "wrapstar" | "joyrider" | "wraprider";
  email?: string;
  name?: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<string> {
  const client = stripe();
  let row = await getStripeConnectAccount(input.contractorId);
  if (!row) {
    const account = await client.accounts.create({
      type: "express",
      country: "US",
      email: input.email || undefined,
      business_type: "individual",
      capabilities: { transfers: { requested: true } },
      business_profile: { name: input.name || undefined, product_description: "Wrrapd contractor" },
      settings: { payouts: { schedule: { interval: "manual" } } },
      metadata: { contractorId: input.contractorId, role: input.role },
    });
    row = {
      contractorId: input.contractorId,
      role: input.role,
      stripeAccountId: account.id,
      payoutsEnabled: Boolean(account.payouts_enabled),
      detailsSubmitted: Boolean(account.details_submitted),
      bankLast4: "",
      updatedAt: new Date().toISOString(),
    };
    await saveAccount(row);
  }
  const link = await client.accountLinks.create({
    account: row.stripeAccountId,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}

export async function sendStripePayout(input: {
  stripeAccountId: string;
  amountCents: number;
  description: string;
  idempotencyKey: string;
}): Promise<{ transferId: string; payoutId: string }> {
  const client = stripe();
  try {
    await client.accounts.update(input.stripeAccountId, {
      settings: { payouts: { schedule: { interval: "manual" } } },
    });
  } catch {
    // Account may still be finishing onboarding. The payout call reports the real error.
  }
  const transfer = await client.transfers.create(
    {
      amount: input.amountCents,
      currency: "usd",
      destination: input.stripeAccountId,
      description: input.description,
    },
    { idempotencyKey: `${input.idempotencyKey}-transfer` },
  );
  const payout = await client.payouts.create(
    {
      amount: input.amountCents,
      currency: "usd",
      description: input.description,
      statement_descriptor: "WRRAPD",
    },
    { stripeAccount: input.stripeAccountId, idempotencyKey: `${input.idempotencyKey}-payout` },
  );
  return { transferId: transfer.id, payoutId: payout.id };
}

export function constructStripeEvent(rawBody: string, signature: string): Stripe.Event {
  const secret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
  return stripe().webhooks.constructEvent(rawBody, signature, secret);
}
