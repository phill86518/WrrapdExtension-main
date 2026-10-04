import { NextResponse } from "next/server";
import { getPublicOrigin, sendTransactionalEmail } from "@/lib/customer-notify";
import { findPaidOrdersMissingFromCommandCenter } from "@/lib/pay-reconcile";

/**
 * Hourly: any order the pay server charged that is not in Command Center emails ops.
 * A failed check also emails, so silence always means "checked and complete". Header: x-cron-secret.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || (request.headers.get("x-cron-secret") || "") !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { missing, checked, error } = await findPaidOrdersMissingFromCommandCenter(30);
  if (!error && !missing.length) return NextResponse.json({ ok: true, checked, missing: 0 });
  const to =
    process.env.NOTIFY_OPS_ADMIN_EMAIL?.split(/[;,]/).map((s) => s.trim()).find((a) => a && a !== "orders@wrrapd.com") ||
    "admin@wrrapd.com";
  const origin = getPublicOrigin();
  const html = error
    ? `<p>Command Center could not check the pay server for missing orders: ${error.replace(/</g, "&lt;")}.</p>`
    : `<p>These orders were charged but are not in Command Center. The pay server keeps retrying; you can also open
<a href="${origin}/admin/orders">Orders</a> and click "Bring into Command Center".</p><ul>${missing
        .map((m) => `<li>${m.orderNumber} · ${m.retailer} · ${m.customerEmail} · $${(m.amountCents / 100).toFixed(2)} · ${m.timestamp}</li>`)
        .join("")}</ul>`;
  const emailed = await sendTransactionalEmail({
    to,
    subject: error ? "Wrrapd: order check failed" : `Wrrapd: ${missing.length} paid order(s) missing from Command Center`,
    html,
  });
  return NextResponse.json({ ok: true, checked, missing: missing.length, error, emailed });
}
