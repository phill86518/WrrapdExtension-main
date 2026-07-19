import type { CollectionReference, DocumentReference } from "firebase-admin/firestore";
import { getFirestoreDb } from "./firebase-admin";

/** Namespaced collections so this app can share a Firebase project safely. */
export const TRACKING_COLLECTIONS = {
  deliveryDrivers: "tracking_delivery_drivers",
  wrapstars: "tracking_wrapstars",
  wrapstarProfiles: "tracking_wrapstar_profiles",
  /** Legacy — still read during WrapStar migration */
  drivers: "tracking_drivers",
  driverProfiles: "tracking_driver_profiles",
  weekAvailability: "tracking_week_availability",
  runtime: "tracking_runtime",
  earnings: "tracking_earnings",
  payouts: "tracking_payouts",
  payoutConfig: "tracking_payout_config",
  wrapstarShifts: "tracking_wrapstar_shifts",
  wrapstarShiftGifts: "tracking_wrapstar_shift_gifts",
  wrapstarShiftVideos: "tracking_wrapstar_shift_videos",
} as const;

export function trackingWrapstarsCollection(): CollectionReference | null {
  const db = getFirestoreDb();
  return db ? db.collection(TRACKING_COLLECTIONS.wrapstars) : null;
}

export function trackingWrapstarProfilesCollection(): CollectionReference | null {
  const db = getFirestoreDb();
  return db ? db.collection(TRACKING_COLLECTIONS.wrapstarProfiles) : null;
}

/** Real courier / final-mile Drivers (not WrapStars). */
export function trackingDeliveryDriversCollection(): CollectionReference | null {
  const db = getFirestoreDb();
  return db ? db.collection(TRACKING_COLLECTIONS.deliveryDrivers) : null;
}

/** @deprecated Use trackingWrapstarsCollection — legacy alias */
export function trackingDriversCollection(): CollectionReference | null {
  return trackingWrapstarsCollection();
}

/** @deprecated Use trackingWrapstarProfilesCollection */
export function trackingDriverProfilesCollection(): CollectionReference | null {
  return trackingWrapstarProfilesCollection();
}

export function trackingWeekAvailabilityCollection(): CollectionReference | null {
  const db = getFirestoreDb();
  return db ? db.collection(TRACKING_COLLECTIONS.weekAvailability) : null;
}

export function trackingRuntimeDoc(): DocumentReference | null {
  const db = getFirestoreDb();
  return db ? db.collection(TRACKING_COLLECTIONS.runtime).doc("config") : null;
}

export function trackingEarningsCollection(): CollectionReference | null {
  const db = getFirestoreDb();
  return db ? db.collection(TRACKING_COLLECTIONS.earnings) : null;
}

export function trackingPayoutsCollection(): CollectionReference | null {
  const db = getFirestoreDb();
  return db ? db.collection(TRACKING_COLLECTIONS.payouts) : null;
}

export function trackingPayoutConfigDoc(): DocumentReference | null {
  const db = getFirestoreDb();
  return db ? db.collection(TRACKING_COLLECTIONS.payoutConfig).doc("default") : null;
}

export function trackingWrapstarShiftsCollection(): CollectionReference | null {
  const db = getFirestoreDb();
  return db ? db.collection(TRACKING_COLLECTIONS.wrapstarShifts) : null;
}

export function trackingWrapstarShiftGiftsCollection(): CollectionReference | null {
  const db = getFirestoreDb();
  return db ? db.collection(TRACKING_COLLECTIONS.wrapstarShiftGifts) : null;
}

export function trackingWrapstarShiftVideosCollection(): CollectionReference | null {
  const db = getFirestoreDb();
  return db ? db.collection(TRACKING_COLLECTIONS.wrapstarShiftVideos) : null;
}
