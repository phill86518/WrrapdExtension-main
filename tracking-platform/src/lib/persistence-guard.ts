/**
 * Cloud Run sets K_SERVICE. Without Firestore, orders/drivers survive scale-to-zero
 * but local disk does not — require Firebase Admin env vars there.
 */
export function assertCloudRunPersistence(): void {
  const onCloudRun = Boolean(process.env.K_SERVICE);
  const forced = process.env.TRACKING_REQUIRE_FIRESTORE === "true";
  if (!onCloudRun && !forced) return;

  const allowEphemeral = process.env.TRACKING_ALLOW_EPHEMERAL === "true";
  if (allowEphemeral) return;

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (projectId && clientEmail && privateKey) return;

  throw new Error(
    "Tracking platform: Firestore is required on Cloud Run (local disk is ephemeral). " +
      "Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY on the Cloud Run service. " +
      "Create a Firebase service account key with Cloud Datastore User (or Firebase Admin). " +
      "Optional escape hatch for emergencies only: TRACKING_ALLOW_EPHEMERAL=true (not for production).",
  );
}
