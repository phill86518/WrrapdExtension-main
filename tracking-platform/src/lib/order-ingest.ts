import type { CreateOrderInput } from "@/lib/data";
import type { Order } from "@/lib/types";

/** Raw JSON from extension / website / partners (all fields optional until validated). */
export type IngestOrderPayload = {
  customerName?: unknown;
  customerPhone?: unknown;
  recipientName?: unknown;
  addressLine1?: unknown;
  addressLine2?: unknown;
  city?: unknown;
  state?: unknown;
  postalCode?: unknown;
  zipCode?: unknown;
  scheduledFor?: unknown;
  deliveryDate?: unknown;
  orderNumber?: unknown;
  externalOrderId?: unknown;
  sourceNote?: unknown;
  shippingAddress?: {
    name?: unknown;
    line1?: unknown;
    line2?: unknown;
    city?: unknown;
    state?: unknown;
    postalCode?: unknown;
    zip?: unknown;
  };
  buyer?: {
    name?: unknown;
    phone?: unknown;
  };
};

export type IngestSuccess = {
  ok: true;
  normalized: CreateOrderInput;
};

export type IngestFailure = {
  ok: false;
  missingFields: string[];
  invalidFields: string[];
  message: string;
};

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

/**
 * Maps extension/checkout-style payloads onto createOrder input.
 * Reports missing required logical fields and invalid nested shapes.
 */
export function parseIngestOrderPayload(body: unknown): IngestSuccess | IngestFailure {
  const invalidFields: string[] = [];
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      missingFields: ["body"],
      invalidFields: ["body"],
      message: "JSON object body required",
    };
  }

  const p = body as IngestOrderPayload;
  if (p.shippingAddress !== undefined && (typeof p.shippingAddress !== "object" || p.shippingAddress === null)) {
    invalidFields.push("shippingAddress");
  }
  if (p.buyer !== undefined && (typeof p.buyer !== "object" || p.buyer === null)) {
    invalidFields.push("buyer");
  }

  const sa = p.shippingAddress && typeof p.shippingAddress === "object" ? p.shippingAddress : undefined;

  const customerName =
    str(p.customerName) ||
    str(p.buyer && typeof p.buyer === "object" ? p.buyer.name : undefined);
  const customerPhone =
    str(p.customerPhone) ||
    str(p.buyer && typeof p.buyer === "object" ? p.buyer.phone : undefined);
  const recipientName =
    str(p.recipientName) || str(sa?.name) || customerName;
  const addressLine1 = str(p.addressLine1) || str(sa?.line1);
  const addressLine2 = str(p.addressLine2) || str(sa?.line2);
  const city = str(p.city) || str(sa?.city);
  const state = str(p.state) || str(sa?.state);
  const postalCode =
    str(p.postalCode) || str(p.zipCode) || str(sa?.postalCode) || str(sa?.zip);
  const scheduledFor = str(p.scheduledFor) || str(p.deliveryDate);

  const externalOrderId = str(p.externalOrderId) || str(p.orderNumber);
  const sourceNote = str(p.sourceNote);

  const missingFields: string[] = [];
  if (!customerName) missingFields.push("customerName");
  if (!customerPhone) missingFields.push("customerPhone");
  if (!recipientName) missingFields.push("recipientName");
  if (!addressLine1) missingFields.push("addressLine1");
  if (!city) missingFields.push("city");
  if (!state) missingFields.push("state");
  if (!postalCode) missingFields.push("postalCode");
  if (!scheduledFor) missingFields.push("scheduledFor");

  if (invalidFields.length || missingFields.length) {
    return {
      ok: false,
      missingFields,
      invalidFields,
      message:
        missingFields.length > 0
          ? "Missing required fields (after alias mapping)"
          : "Invalid payload",
    };
  }

  return {
    ok: true,
    normalized: {
      customerName: customerName!,
      customerPhone: customerPhone!,
      recipientName: recipientName!,
      addressLine1: addressLine1!,
      addressLine2,
      city: city!,
      state: state!,
      postalCode: postalCode!,
      scheduledFor: scheduledFor!,
      ...(externalOrderId ? { externalOrderId } : {}),
      ...(sourceNote
        ? { sourceNote }
        : externalOrderId
          ? { sourceNote: `Ingested order ${externalOrderId}` }
          : {}),
    },
  };
}

/** Fields commonly produced by the Chrome extension / Amazon flows that we do not persist on Order yet. */
export const EXTENSION_FIELDS_NOT_ON_ORDER: string[] = [
  "asin",
  "itemTitle",
  "lineItems",
  "occasion",
  "selected_ai_design",
  "imageBase64",
  "designTitle",
  "prompt",
  "gemini-api-key",
  "wrrapd-order-number (localStorage only unless sent as orderNumber)",
];

export function orderIngestFieldGuide(): {
  storedOnOrder: (keyof Order)[];
  acceptedAliases: Record<string, string>;
  notStored: string[];
} {
  return {
    storedOnOrder: [
      "customerName",
      "customerPhone",
      "recipientName",
      "addressLine1",
      "addressLine2",
      "city",
      "state",
      "postalCode",
      "scheduledFor",
      "sourceNote",
      "externalOrderId",
    ],
    acceptedAliases: {
      zipCode: "postalCode",
      deliveryDate: "scheduledFor",
      orderNumber: "externalOrderId (+ sourceNote)",
      "shippingAddress.line1": "addressLine1",
      "shippingAddress.name": "recipientName (fallback)",
      "buyer.name": "customerName",
      "buyer.phone": "customerPhone",
    },
    notStored: EXTENSION_FIELDS_NOT_ON_ORDER,
  };
}
