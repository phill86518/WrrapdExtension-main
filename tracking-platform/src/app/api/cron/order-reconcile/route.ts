import { NextResponse } from "next/server";
import { getPublicOrigin, sendTransactionalEmail } from "@/lib/customer-notify";
import { findPaidOrdersMissingFromCommandCenter, markPaidOrders } from "@/lib/pay-reconcile";

/**
 * Hourly: a paid order missing from Command Center emails ops once, then again in the 8 AM ET run
 * each day until it arrives or is marked handled. A failed check always emails. Header: x-cron-secret.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || (request.headers.get("x-cron-secret") || "") !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { missing, checked, error } = await findPaidOrdersMissingFromCommandCenter(30);
  const etHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(
      new Date(),
    ),
  );
  const fresh = missing.filter((m) => !m.alertedAt);
  const reminder = etHour === 8 && missing.length > 0;
  if (!error && !fresh.length && !reminder) {
    return NextResponse.json({ ok: true, checked, missing: missing.length, emailed: false });
  }
  const to =
    process.env.NOTIFY_OPS_ADMIN_EMAIL?.split(/[;,]/).map((s) => s.trim()).find((a) => a && a !== "orders@wrrapd.com") ||
    "admin@wrrapd.com";
  const origin = getPublicOrigin();
  const list = reminder ? missing : fresh;
  const html = error
    ? `<p>Command Center could not check the pay server for missing orders: ${error.replace(/</g, "&lt;")}.</p>`
    : `<p>These orders were charged but are not in Command Center. Open
<a href="${origin}/admin/orders">Orders</a> and click "Bring into Command Center", or "Mark handled" once it is refunded
or entered by hand.</p><ul>${list
        .map((m) => `<li>${m.orderNumber} · ${m.retailer} · ${m.customerEmail} · $${(m.amountCents / 100).toFixed(2)} · ${m.timestamp}</li>`)
        .join("")}</ul>`;
  const emailed = await sendTransactionalEmail({
    to,
    subject: error
      ? "Wrrapd: order check failed"
      : `Wrrapd: ${list.length} paid order(s) missing from Command Center${reminder ? " (daily reminder)" : ""}`,
    html,
  });
  if (emailed && fresh.length) await markPaidOrders(fresh.map((m) => m.orderNumber), "alerted").catch(() => null);
  return NextResponse.json({ ok: true, checked, missing: missing.length, error, emailed });
}
