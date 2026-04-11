import type { CollectionReference, DocumentReference } from "firebase-admin/firestore";
import { getFirestoreDb } from "./firebase-admin";

/** Namespaced collections so this app can share a Firebase project safely. */
export const TRACKING_COLLECTIONS = {
  drivers: "tracking_drivers",
  driverProfiles: "tracking_driver_profiles",
  weekAvailability: "tracking_week_availability",
  runtime: "tracking_runtime",
} as const;

export function trackingDriversCollection(): CollectionReference | null {
  const db = getFirestoreDb();
  return db ? db.collection(TRACKING_COLLECTIONS.drivers) : null;
}

export function trackingDriverProfilesCollection(): CollectionReference | null {
  const db = getFirestoreDb();
  return db ? db.collection(TRACKING_COLLECTIONS.driverProfiles) : null;
}

export function trackingWeekAvailabilityCollection(): CollectionReference | null {
  const db = getFirestoreDb();
  return db ? db.collection(TRACKING_COLLECTIONS.weekAvailability) : null;
}

export function trackingRuntimeDoc(): DocumentReference | null {
  const db = getFirestoreDb();
  return db ? db.collection(TRACKING_COLLECTIONS.runtime).doc("config") : null;
}
