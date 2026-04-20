export type DeliveryStatus =
  | "scheduled"
  | "assigned"
  | "en_route"
  | "delivered"
  | "cancelled";

export type OnboardingStatus = "pending" | "approved" | "rejected";

/** Immutable giftee row from pay-server ingest — preferred for portals + emails when present. */
export type IngestDeliverToSnapshot = {
  recipientName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
};

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
  driverId?: string;
  driverName?: string;
  status: DeliveryStatus;
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
  /** Per driver + calendar day (ET): optimized stop order (1 = first after leaving depot) */
  stopSequence?: number;
  customerEmail?: string;
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
  /**
   * Pay ingest only: canonical giftee snapshot (same resolution as thank-you / ops emails).
   * Survives staging re-ingest merges that would otherwise clobber top-level recipient fields.
   */
  ingestDeliverTo?: IngestDeliverToSnapshot;
};

export type Driver = {
  id: string;
  name: string;
  /** Lower sort = higher priority for auto-allocation */
  allocationRank: number;
};

export type DriverProfile = {
  driverId: string;
  onboardingStatus: OnboardingStatus;
  notes?: string;
  /** Admin: force available on YYYY-MM-DD even if driver missed deadline */
  forcedAvailableDates?: string[];
};

export type WeekAvailabilityRecord = {
  driverId: string;
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
