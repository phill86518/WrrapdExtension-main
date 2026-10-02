import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { constructStripeEvent, upsertFromStripeAccount } from "@/lib/stripe-connect";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature") || "";
  const raw = await request.text();
  try {
    const event = constructStripeEvent(raw, signature);
    if (event.type === "account.updated") {
      await upsertFromStripeAccount(event.data.object as Stripe.Account);
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid webhook";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
