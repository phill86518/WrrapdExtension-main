export type DeliveryStatus =
  | "scheduled"
  | "assigned"
  | "en_route"
  | "delivered"
  | "cancelled";

export type OnboardingStatus = "pending" | "approved" | "rejected";

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
  /** Per driver + calendar day (ET): optimized stop order (1 = first after leaving depot) */
  stopSequence?: number;
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
  /** calendar date YYYY-MM-DD -> available */
  days: Record<string, boolean>;
};

export type OrdersFilePayload = {
  version: number;
  orders: Order[];
};
