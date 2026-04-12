import { NextRequest, NextResponse } from "next/server";
import { createOrder } from "@/lib/data";
import { orderIngestFieldGuide, parseIngestOrderPayload } from "@/lib/order-ingest";

function getIngestKey(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || null;
  }
  const headerKey = request.headers.get("x-ingest-key");
  return headerKey?.trim() || null;
}

/**
 * POST JSON order payloads from the Chrome extension, checkout, or partners.
 * Auth: Authorization: Bearer <INGEST_API_KEY> or X-Ingest-Key: <INGEST_API_KEY>
 */
export async function POST(request: NextRequest) {
  const expected = process.env.INGEST_API_KEY?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "Order ingest is not configured (set INGEST_API_KEY)" },
      { status: 503 },
    );
  }
  const key = getIngestKey(request);
  if (!key || key !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseIngestOrderPayload(body);
  if (!parsed.ok) {
    return NextResponse.json(
      {
        error: parsed.message,
        missingFields: parsed.missingFields,
        invalidFields: parsed.invalidFields,
        fieldGuide: orderIngestFieldGuide(),
      },
      { status: 400 },
    );
  }

  try {
    const result = await createOrder(parsed.normalized);
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          missingFields: [] as string[],
          invalidFields: [] as string[],
          hint: "Fix scheduledFor (ISO or yyyy-MM-ddTHH:mm in America/New_York) and business rules (not in past).",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      order: result.order,
      trackingUrlPath: `/track/${result.order.trackingToken}`,
      notStoredYet: orderIngestFieldGuide().notStored,
    });
  } catch (err) {
    console.error("[orders/ingest] createOrder threw:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Ingest failed (server error)", detail: message },
      { status: 500 },
    );
  }
}
