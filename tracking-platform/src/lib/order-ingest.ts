import type { CreateOrderInput } from "@/lib/data";
import type { Order, OrderLineItem } from "@/lib/types";
import {
  endOfCalendarDayAmericaNewYorkIso,
  wrrapdScheduledInstantFromAmazonDeliveryDateKey,
} from "@/lib/scheduling";

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
  /** Amazon UI calendar date (YYYY-MM-DD, Eastern). Server sets Wrrapd day = +1 at 14:00 ET. */
  amazonDeliveryDay?: unknown;
  /** Multiple Wrrapd line items with different Amazon dates; use with wrrapdAmazonGrouping. */
  amazonDeliveryDays?: unknown;
  /**
   * `earliest` — schedule after the **first** Amazon date (fastest Wrrapd delivery).
   * `together` / extension `latest` — schedule after the **last** Amazon date (+1 Wrrapd day @ 14:00 ET).
   * `separate` — not supported in a single ingest body; submit one request per Amazon date.
   */
  wrrapdAmazonGrouping?: unknown;
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
  /** Wrrapd checkout: wins over recipientName + shippingAddress for giftee row (admin/driver/emails). */
  gifteeAddress?: {
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
    email?: unknown;
  };
  customerEmail?: unknown;
  /** Lowercase trimmed gifter email (optional; derived from customerEmail when omitted). */
  customerEmailNorm?: unknown;
  /** Stable Wrrapd customer id from pay server (optional). */
  wrrapdCustomerId?: unknown;
  /** First name from Amazon "Deliver to …" header (extension) */
  greetingFirstName?: unknown;
  skipCustomerNotifications?: unknown;
  lineItems?: unknown;
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

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function isValidYyyyMmDd(key: string): boolean {
  if (!YMD.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parseAmazonGrouping(v: unknown): "together" | "earliest" | "separate" | "pending" | undefined {
  const s = str(v)?.toLowerCase();
  if (s === "together" || s === "single-trip" || s === "latest") return "together";
  if (s === "earliest" || s === "fastest" || s === "first") return "earliest";
  if (s === "separate") return "separate";
  if (s === "pending" || s === "ask_customer" || s === "deferred") return "pending";
  return undefined;
}

function parseAmazonDateKeys(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const x of v) {
    const k = str(x);
    if (k && isValidYyyyMmDd(k)) out.push(k);
  }
  return out.length ? out : undefined;
}

function parseLineItems(v: unknown, invalidFields: string[]): OrderLineItem[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) {
    invalidFields.push("lineItems");
    return undefined;
  }
  const out: OrderLineItem[] = [];
  for (const it of v) {
    if (!it || typeof it !== "object" || Array.isArray(it)) {
      invalidFields.push("lineItems");
      continue;
    }
    const row = it as Record<string, unknown>;
    const title = str(row.title);
    const asin = str(row.asin);
    const imageUrl = str(row.imageUrl);
    const wrappingOption = str(row.wrappingOption);
    if (!title && !asin && !imageUrl && !wrappingOption) continue;
    const flowers = row.flowers === true || row.flowers === "true";
    const flowerDesign = str(row.flowerDesign);
    const uploadedDesignPath = str(row.uploadedDesignPath);
    const uploadedDesignFileName = str(row.uploadedDesignFileName);
    const wrappingDesignImageUrl = str(row.wrappingDesignImageUrl);
    const wrappingDesignStoragePath = str(row.wrappingDesignStoragePath);
    const wrappingDesignFileName = str(row.wrappingDesignFileName);
    const aiDesignTitle = str(row.aiDesignTitle);
    const aiDesignDescription = str(row.aiDesignDescription);
    const giftMessage = str(row.giftMessage);
    const senderName = str(row.senderName);
    const occasion = str(row.occasion);
    out.push({
      ...(asin ? { asin } : {}),
      ...(title ? { title } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(wrappingOption ? { wrappingOption } : {}),
      ...(flowers ? { flowers: true } : {}),
      ...(flowerDesign ? { flowerDesign } : {}),
      ...(uploadedDesignPath ? { uploadedDesignPath } : {}),
      ...(uploadedDesignFileName ? { uploadedDesignFileName } : {}),
      ...(wrappingDesignImageUrl ? { wrappingDesignImageUrl } : {}),
      ...(wrappingDesignStoragePath ? { wrappingDesignStoragePath } : {}),
      ...(wrappingDesignFileName ? { wrappingDesignFileName } : {}),
      ...(aiDesignTitle ? { aiDesignTitle } : {}),
      ...(aiDesignDescription ? { aiDesignDescription } : {}),
      ...(giftMessage ? { giftMessage } : {}),
      ...(senderName ? { senderName } : {}),
      ...(occasion ? { occasion } : {}),
    });
  }
  return out.length ? out : undefined;
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
  if (p.gifteeAddress !== undefined && (typeof p.gifteeAddress !== "object" || p.gifteeAddress === null)) {
    invalidFields.push("gifteeAddress");
  }
  if (p.buyer !== undefined && (typeof p.buyer !== "object" || p.buyer === null)) {
    invalidFields.push("buyer");
  }

  const sa = p.shippingAddress && typeof p.shippingAddress === "object" ? p.shippingAddress : undefined;
  const ga =
    p.gifteeAddress && typeof p.gifteeAddress === "object" && !Array.isArray(p.gifteeAddress)
      ? p.gifteeAddress
      : undefined;

  const customerName =
    str(p.customerName) ||
    str(p.buyer && typeof p.buyer === "object" ? p.buyer.name : undefined);
  const customerPhone =
    str(p.customerPhone) ||
    str(p.buyer && typeof p.buyer === "object" ? p.buyer.phone : undefined);
  const recipientName =
    str(ga?.name) ||
    str(p.recipientName) ||
    str(sa?.name) ||
    customerName;
  const customerEmail =
    str(p.customerEmail) ||
    str(p.buyer && typeof p.buyer === "object" ? (p.buyer as { email?: unknown }).email : undefined);
  const customerEmailNorm =
    str(p.customerEmailNorm)?.toLowerCase() ||
    (customerEmail ? customerEmail.toLowerCase() : undefined);
  const wrrapdCustomerId = str((p as { wrrapdCustomerId?: unknown }).wrrapdCustomerId);
  const customerGreetingName = str((p as { greetingFirstName?: unknown }).greetingFirstName);
  const addressLine1 = str(ga?.line1) || str(p.addressLine1) || str(sa?.line1);
  const addressLine2 = str(ga?.line2) || str(p.addressLine2) || str(sa?.line2);
  const city = str(ga?.city) || str(p.city) || str(sa?.city);
  const state = str(ga?.state) || str(p.state) || str(sa?.state);
  const postalCode =
    str(ga?.postalCode) ||
    str(ga?.zip) ||
    str(p.postalCode) ||
    str(p.zipCode) ||
    str(sa?.postalCode) ||
    str(sa?.zip);
  /**
   * `deliveryDate` is usually Amazon’s “Arriving …” calendar day — never use it as final `scheduledFor`
   * when we have `amazonDeliveryDay(s)` (those drive Wrrapd +1 in America/New_York).
   *
   * When Amazon calendar key(s) are present, **always** derive `scheduledFor` from them. A client
   * may still send `scheduledFor` at Amazon +0 (same calendar day as Amazon); honoring it bypassed
   * the +1 rule and made emails, admin, and driver show the wrong Wrrapd day.
   */
  const explicitScheduledFor = str(p.scheduledFor);
  let scheduledFor: string | undefined = explicitScheduledFor;
  const deliveryDateStr = str(p.deliveryDate);

  const amazonDaySingle = str(p.amazonDeliveryDay);
  const amazonDaysArr = parseAmazonDateKeys(p.amazonDeliveryDays);
  const groupingExplicit = parseAmazonGrouping(p.wrrapdAmazonGrouping);

  let deliveryPreferencePending = false;
  let deliveryPreferenceRespondBy: string | undefined;
  let amazonDeliveryDatesSnapshot: string[] | undefined;

  if (amazonDaySingle && !isValidYyyyMmDd(amazonDaySingle)) {
    invalidFields.push("amazonDeliveryDay");
  }

  if ((amazonDaySingle || amazonDaysArr?.length) && !invalidFields.includes("amazonDeliveryDay")) {
    const keys: string[] = [];
    if (amazonDaysArr?.length) {
      keys.push(...[...new Set(amazonDaysArr)].sort());
    } else if (amazonDaySingle) {
      keys.push(amazonDaySingle);
    }
    if (keys.length > 1 && groupingExplicit === "separate") {
      return {
        ok: false,
        missingFields: [],
        invalidFields: ["wrrapdAmazonGrouping", "amazonDeliveryDays"],
        message:
          "wrrapdAmazonGrouping=separate requires one ingest per Amazon delivery date (single amazonDeliveryDay per request).",
      };
    }
    const needsCustomerChoice =
      keys.length > 1 && (groupingExplicit === undefined || groupingExplicit === "pending");
    // Default to earliest Amazon day (+1 → fastest Wrrapd). "Together" / last-day is explicit only.
    const pick =
      keys.length <= 1
        ? keys[0]!
        : groupingExplicit === "together"
          ? keys[keys.length - 1]!
          : keys[0]!;
    // Persist Amazon anchor day(s) on every ingest so emails can repair display vs `scheduledFor`.
    amazonDeliveryDatesSnapshot = [...keys];
    if (needsCustomerChoice && keys.length > 1) {
      deliveryPreferencePending = true;
      deliveryPreferenceRespondBy = endOfCalendarDayAmericaNewYorkIso();
    }
    try {
      scheduledFor = wrrapdScheduledInstantFromAmazonDeliveryDateKey(pick);
    } catch {
      invalidFields.push("amazonDeliveryDay");
    }
  }

  if (!scheduledFor) {
    scheduledFor = deliveryDateStr;
  }

  const externalOrderId = str(p.externalOrderId) || str(p.orderNumber);
  let sourceNote = str(p.sourceNote);
  const lineItems = parseLineItems(p.lineItems, invalidFields);
  const skipCustomerNotifications = p.skipCustomerNotifications === true;

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
        invalidFields.length > 0 && missingFields.length === 0
          ? "Invalid field values"
          : missingFields.length > 0
            ? "Missing required fields (after alias mapping)"
            : "Invalid payload",
    };
  }

  if (!sourceNote && (amazonDaySingle || amazonDaysArr?.length)) {
    const daysLabel = amazonDaysArr?.length ? amazonDaysArr.join(", ") : amazonDaySingle!;
    sourceNote = deliveryPreferencePending
      ? `Amazon deliveries ${daysLabel} — provisional Wrrapd schedule uses earliest Amazon date (fastest +1); customer may choose one-trip after last Amazon date by ${deliveryPreferenceRespondBy} ET.`
      : `Amazon delivery ${daysLabel} → Wrrapd +1 day @ 14:00 ET`;
  } else if (!sourceNote && externalOrderId) {
    sourceNote = `Ingested order ${externalOrderId}`;
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
      ...(sourceNote ? { sourceNote } : {}),
      ...(customerEmail ? { customerEmail } : {}),
      ...(customerEmailNorm ? { customerEmailNorm } : {}),
      ...(wrrapdCustomerId ? { wrrapdCustomerId } : {}),
      ...(customerGreetingName ? { customerGreetingName } : {}),
      ...(lineItems?.length ? { lineItems } : {}),
      ...(skipCustomerNotifications ? { skipCustomerNotifications: true } : {}),
      ...(deliveryPreferencePending
        ? {
            deliveryPreferencePending: true,
            deliveryPreferenceRespondBy,
          }
        : {}),
      ...(amazonDeliveryDatesSnapshot?.length
        ? { amazonDeliveryDatesSnapshot: [...amazonDeliveryDatesSnapshot] }
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
      "customerEmail",
      "customerEmailNorm",
      "wrrapdCustomerId",
      "customerGreetingName",
      "recipientName",
      "addressLine1",
      "addressLine2",
      "city",
      "state",
      "postalCode",
      "scheduledFor",
      "sourceNote",
      "externalOrderId",
      "amazonDeliveryDatesSnapshot",
      "deliveryPreferencePending",
      "deliveryPreferenceRespondBy",
      "deliveryPreferenceToken",
    ],
    acceptedAliases: {
      zipCode: "postalCode",
      scheduledFor:
        "optional; when amazonDeliveryDay(s) are present they always define the Wrrapd day (+1 ET) and this field is ignored",
      deliveryDate:
        "fallback when no scheduledFor and no amazonDeliveryDay(s); ignored when Amazon keys are present (+1 ET rule applies)",
      amazonDeliveryDay: "YYYY-MM-DD Eastern → Wrrapd scheduled +1 day 14:00 ET",
      amazonDeliveryDays: "array of YYYY-MM-DD with wrrapdAmazonGrouping",
      wrrapdAmazonGrouping: "earliest | together | separate | pending (email/SMS choice)",
      customerEmail: "thank-you + delivery-choice emails",
      customerEmailNorm: "optional; defaults to lowercase customerEmail when omitted",
      wrrapdCustomerId: "optional stable id from pay server (Phase 1 customer registry)",
      greetingFirstName: "customerGreetingName (Amazon Deliver-to first name)",
      "buyer.email": "customerEmail",
      orderNumber: "externalOrderId (+ sourceNote)",
      "shippingAddress.line1": "addressLine1",
      "shippingAddress.name": "recipientName (fallback)",
      "gifteeAddress.*": "preferred giftee from Wrrapd checkout (overrides shippingAddress + top-level name/address)",
      "buyer.name": "customerName",
      "buyer.phone": "customerPhone",
    },
    notStored: EXTENSION_FIELDS_NOT_ON_ORDER,
  };
}
