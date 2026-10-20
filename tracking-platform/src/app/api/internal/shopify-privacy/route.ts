import { NextResponse } from "next/server";
import {
  collectShopifyCustomerData,
  redactShopifyCustomer,
  redactShopifyShop,
} from "@/lib/shopify-privacy";

/**
 * Shopify mandatory privacy webhooks → Command Center.
 * Auth: Authorization: Bearer <INGEST_API_KEY>
 * Body: { topic, shop, payload }
 *
 * HARD BOUNDARY: Only mutates / returns orders with retailer === "Shopify".
 * Never touches Chrome extension or website orders, even if emails collide.
 */
export async function POST(request: Request) {
  const expected = process.env.INGEST_API_KEY?.trim();
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!expected || bearer !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { topic?: string; shop?: string; payload?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const topic = String(body.topic || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "/");
  const shop = String(body.shop || body.payload?.shop_domain || "").trim();
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  const email = String(
    (payload.customer as { email?: string } | undefined)?.email || payload.email || "",
  )
    .trim()
    .toLowerCase();

  if (!shop) {
    return NextResponse.json(
      { ok: false, error: "shop required", scope: "shopify-only" },
      { status: 400 },
    );
  }

  if (topic === "customers/data_request" || topic === "customers_data_request") {
    const data = await collectShopifyCustomerData({ shop, email });
    return NextResponse.json({
      ok: true,
      topic: "customers/data_request",
      ...data,
      note: "Shopify channel only. Extension/website orders are excluded even if email matches.",
    });
  }

  if (topic === "customers/redact" || topic === "customers_redact") {
    const result = await redactShopifyCustomer({ shop, email });
    return NextResponse.json({ ok: true, topic: "customers/redact", ...result });
  }

  if (topic === "shop/redact" || topic === "shop_redact") {
    const result = await redactShopifyShop(shop);
    return NextResponse.json({ ok: true, topic: "shop/redact", ...result });
  }

  return NextResponse.json({ ok: false, error: `Unknown topic: ${topic}` }, { status: 400 });
}
