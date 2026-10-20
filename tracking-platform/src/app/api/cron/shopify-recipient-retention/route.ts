import { NextResponse } from "next/server";
import { purgeShopifyRecipientsPastRetention } from "@/lib/shopify-privacy";

/**
 * Shopify App channel ONLY.
 * Anonymize recipient PII on orders with retailer === "Shopify" that were delivered
 * 12+ months ago. Does not touch Chrome extension, website, Amazon, or any other channel.
 *
 * Header: x-cron-secret matching CRON_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const sent = request.headers.get("x-cron-secret") || "";
  if (!secret || sent !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await purgeShopifyRecipientsPastRetention();
  return NextResponse.json({
    ok: true,
    ...result,
    note: "Chrome extension and website orders are never modified by this job.",
  });
}
