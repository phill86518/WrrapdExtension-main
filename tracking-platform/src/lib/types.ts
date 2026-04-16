export type DeliveryStatus =
  | "scheduled"
  | "assigned"
  | "en_route"
  | "delivered"
  | "cancelled";

export type OnboardingStatus = "pending" | "approved" | "rejected";

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
  aiDesignTitle?: string;
  aiDesignDescription?: string;
  giftMessage?: string;
  senderName?: string;
  occasion?: string;
};

export type Order = {
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
  /** Wrrapd / Amazon style id when ingested from extension or partner (optional) */
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
