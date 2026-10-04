import { listAllOrders } from "@/lib/data";

const PAY_API = (process.env.WRRAPD_PAY_API_ORIGIN || "https://api.wrrapd.com").replace(/\/$/, "");

export type PaidOrderRow = {
  orderNumber: string;
  timestamp: string;
  amountCents: number;
  refundedCents: number;
  retailer: string;
  customerEmail: string;
  ingestOk: boolean | null;
  canResend: boolean;
};

/**
 * Paid orders on the pay server that have no Command Center order.
 * `error` is set when the pay server could not be asked (treat as unknown, not as "all good").
 */
export async function findPaidOrdersMissingFromCommandCenter(days = 30): Promise<{
  missing: PaidOrderRow[];
  checked: number;
  error?: string;
}> {
  const key = process.env.WRRAPD_PAY_INTERNAL_KEY?.trim();
  if (!key) return { missing: [], checked: 0, error: "WRRAPD_PAY_INTERNAL_KEY is not set" };
  let paid: PaidOrderRow[];
  try {
    const res = await fetch(`${PAY_API}/api/internal/paid-orders?days=${days}`, {
      headers: { "X-Wrrapd-Internal-Key": key },
      cache: "no-store",
    });
    if (!res.ok) return { missing: [], checked: 0, error: `pay server ${res.status}` };
    paid = ((await res.json()) as { orders?: PaidOrderRow[] }).orders || [];
  } catch (e) {
    return { missing: [], checked: 0, error: e instanceof Error ? e.message : String(e) };
  }
  const known = new Set(
    (await listAllOrders()).map((o) => (o.externalOrderId || "").trim().toUpperCase()).filter(Boolean),
  );
  const missing = paid.filter((p) => !known.has(p.orderNumber.trim().toUpperCase()));
  return { missing, checked: paid.length };
}

export async function resendPaidOrder(orderNumber: string): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.WRRAPD_PAY_INTERNAL_KEY?.trim();
  if (!key) return { ok: false, error: "WRRAPD_PAY_INTERNAL_KEY is not set" };
  const res = await fetch(`${PAY_API}/api/internal/resend-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Wrrapd-Internal-Key": key },
    body: JSON.stringify({ orderNumber }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return res.ok ? { ok: true } : { ok: false, error: data.error || `pay server ${res.status}` };
}
