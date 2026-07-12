export type OrderStatus =
  | "pending"
  | "scheduled"
  | "assigned"
  | "accepted"
  | "in_progress"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "refunded"
  /** @deprecated Prefer in_progress — kept for legacy Firestore rows */
  | "en_route";

/** @deprecated Use OrderStatus */
export type DeliveryStatus = OrderStatus;

export type OnboardingStatus = "pending" | "approved" | "rejected";

export type AssignmentSource = "auto" | "manual";

/** Where the shopper placed the underlying gift order (multi-retailer ingest + ops). */
export type OrderRetailer =
  | "Amazon"
  | "Target"
  | "Lego"
  | "Ulta"
  | "Walmart"
  | "Nordstrom"
  | "Kohl's"
  | "Sephora"
  | "Best Buy"
  | "Etsy";

export type OrderLineItem = {
  asin?: string;
  title?: string;
  imageUrl?: string;
  /** Legacy: wrrapd | upload | ai */
  wrappingOption?: string;
  flowers?: boolean;
  /** e.g. flowers-1 … from extension */
  flowerDesign?: string;
  uploadedDesignPath?: string;
  uploadedDesignFileName?: string;
  /** HTTPS URL for gift-wrap design preview (AI or upload) — email / admin */
  wrappingDesignImageUrl?: string;
  /** GCS object path in wrrapd-media (print / large-format workflow) */
  wrappingDesignStoragePath?: string;
  /** Basename for printer / ops */
  wrappingDesignFileName?: string;
  aiDesignTitle?: string;
  aiDesignDescription?: string;
  giftMessage?: string;
  senderName?: string;
  occasion?: string;
  /** Optional unit price in USD cents when known from checkout */
  unitPriceCents?: number;
};

export type Order = {
  /**
   * Wrrapd-internal primary key (Firestore document id), e.g. `wrr-` + hex, generated at ingest/create.
   * Unrelated to Amazon’s order id; see `externalOrderId` for partner-facing reference.
   */
  id: string;
  customerName: string;
  customerPhone: string;
  recipientName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  scheduledFor: string;
  /** Assigned WrapStar (12-digit id). */
  wrapstarId?: string;
  wrapstarName?: string;
  /**
   * @deprecated Prefer wrapstarId — kept for legacy Firestore / route code during migration.
   */
  driverId?: string;
  /** @deprecated Prefer wrapstarName */
  driverName?: string;
  assignmentSource?: AssignmentSource;
  status: OrderStatus;
  trackingToken: string;
  etaMinutes?: number;
  latestLocation?: {
    lat: number;
    lng: number;
    updatedAt: string;
  };
  proofPhotoUrl?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
  /** Amazon ship day + 1 in production; test phase uses planner dates */
  sourceNote?: string;
  /**
   * Partner-facing reference when set (e.g. Amazon checkout id). Distinct from `id`.
   * UI should prefer this for labels when present; `id` remains the system key for APIs.
   */
  externalOrderId?: string;
  /** Per WrapStar + calendar day (ET): optimized stop order (1 = first after leaving depot) */
  stopSequence?: number;
  customerEmail?: string;
  /** Lowercase trimmed gifter email — join key for WordPress / future “my orders” (pay server Phase 1). */
  customerEmailNorm?: string;
  /** Stable id per `customerEmailNorm` from pay server `customers/email_to_customer_id.json`. */
  wrrapdCustomerId?: string;
  /** Amazon header "Deliver to {Name}" — used for thank-you salutation when set */
  customerGreetingName?: string;
  /** Amazon YYYY-MM-DD values seen at ingest when customer must choose combined vs fastest Wrrapd */
  amazonDeliveryDatesSnapshot?: string[];
  deliveryPreferencePending?: boolean;
  /** ISO instant — respond by this time (EOD Eastern on order day) */
  deliveryPreferenceRespondBy?: string;
  /** Secret link segment for /delivery-choice */
  deliveryPreferenceToken?: string;
  /** together | earliest | together_deadline_default | set by customer */
  deliveryPreferenceChoice?: string;
  /** Wrapped items included in this Wrrapd order (for notifications + ops context). */
  lineItems?: OrderLineItem[];
  /** E-tailer attribution; omit on legacy rows (treat as unknown / Amazon-only flows historically). */
  retailer?: OrderRetailer;
  /**
   * Non-Amazon retailer's OWN promised delivery date (YYYY-MM-DD, Eastern) captured at checkout.
   * When present, customer notifications show this date + 1 day; when absent, safe wording is used.
   */
  retailerEstimatedDeliveryDate?: string;
  /** Order merchandise / wrap value in USD cents when known from checkout ingest. */
  orderValueCents?: number;
  /** Gift-wrap + AI + upload revenue (pre-tax) in cents from checkout. */
  wrapRevenueCents?: number;
  /** Flowers revenue (pre-tax) in cents from checkout. */
  flowersRevenueCents?: number;
};

export type WrapStar = {
  /** 12-digit system identifier */
  id: string;
  displayId: string;
  name: string;
  /** Home / base ZIP for proximity allocation */
  homePostalCode: string;
  servicePostalCodes?: string[];
  /** Tie-breaker only (lower = preferred when distances equal) */
  allocationRank: number;
  email?: string;
  phone?: string;
  /** Legacy drv-* id if migrated */
  legacyDriverId?: string;
};

/** @deprecated Use WrapStar */
export type Driver = WrapStar;

export type WrapStarProfile = {
  wrapstarId: string;
  /** @deprecated Prefer wrapstarId */
  driverId?: string;
  onboardingStatus: OnboardingStatus;
  notes?: string;
  /** Admin: force available on YYYY-MM-DD even if WrapStar missed deadline */
  forcedAvailableDates?: string[];
};

/** @deprecated Use WrapStarProfile */
export type DriverProfile = WrapStarProfile;

export type WeekAvailabilityRecord = {
  wrapstarId?: string;
  /** @deprecated Prefer wrapstarId */
  driverId?: string;
  /** ISO date YYYY-MM-DD of the Monday starting that work week */
  weekStartMonday: string;
  submittedAt: string;
  /** calendar date YYYY-MM-DD -> shift availability */
  days: Record<string, DayShiftAvailability>;
};

export type DayShiftAvailability = {
  morning: boolean; // 7:00 AM - 1:00 PM
  afternoon: boolean; // 1:00 PM - 7:00 PM
};

export type OrdersFilePayload = {
  version: number;
  orders: Order[];
};

export type EarningsEntry = {
  id: string;
  orderId: string;
  wrapstarId: string;
  wrapstarName: string;
  basePayCents: number;
  peakBonusCents: number;
  tipsCents: number;
  feesCents: number;
  netCents: number;
  currency: "USD";
  earnedAt: string;
  payoutId?: string;
  status: "unpaid" | "included_in_payout" | "paid";
  /** Gross wrap revenue used for % split (cents). */
  wrapRevenueCents?: number;
  /** Gross flowers revenue used for % split (cents). */
  flowersRevenueCents?: number;
  /** Platform keep on wrap (cents). */
  platformWrapTakeCents?: number;
  /** Platform keep on flowers (cents). */
  platformFlowersTakeCents?: number;
};

export type PayoutBatch = {
  id: string;
  wrapstarId: string;
  wrapstarName: string;
  earningIds: string[];
  grossCents: number;
  netCents: number;
  currency: "USD";
  status: "pending" | "paid" | "failed";
  method: "manual_ach_export" | "stripe_connect";
  reference?: string;
  createdAt: string;
  paidAt?: string;
  periodStart?: string;
  periodEnd?: string;
};

export type PayoutConfig = {
  /** Fallback flat WrapStar pay when order has no wrap/flower revenue breakdown. */
  basePayCents: number;
  peakMultiplier: number;
  tipPassthrough: boolean;
  platformFeeCents: number;
  /**
   * Platform keep on gift-wrap gross (base + AI + upload). WrapStar gets the rest.
   * Default 28.
   */
  platformTakeWrapPercent: number;
  /**
   * Platform keep on flowers gross. WrapStar gets the rest.
   * Default 15.
   */
  platformTakeFlowersPercent: number;
  updatedAt: string;
};

/** Normalize legacy en_route → in_progress for UI/logic. */
export function normalizeOrderStatus(status: string | undefined): OrderStatus {
  if (status === "en_route") return "in_progress";
  const allowed: OrderStatus[] = [
    "pending",
    "scheduled",
    "assigned",
    "accepted",
    "in_progress",
    "out_for_delivery",
    "delivered",
    "cancelled",
    "refunded",
    "en_route",
  ];
  if (status && (allowed as string[]).includes(status)) return status as OrderStatus;
  return "scheduled";
}

/** Prefer wrapstarId; fall back to legacy driverId. */
export function orderWrapstarId(o: Pick<Order, "wrapstarId" | "driverId">): string | undefined {
  return o.wrapstarId || o.driverId;
}

export function orderWrapstarName(o: Pick<Order, "wrapstarName" | "driverName">): string | undefined {
  return o.wrapstarName || o.driverName;
}
