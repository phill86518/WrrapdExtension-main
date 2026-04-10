import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function getPrivateKey() {
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw) return undefined;
  return raw.replace(/\\n/g, "\n");
}

function initFirebaseApp(): App | null {
  if (getApps().length) return getApps()[0]!;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export function getFirestoreDb() {
  const app = initFirebaseApp();
  if (!app) return null;
  return getFirestore(app);
}

export function getStorageBucket() {
  const app = initFirebaseApp();
  if (!app) return null;
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.GCS_BACKUP_BUCKET;
  try {
    return bucketName ? getStorage(app).bucket(bucketName) : getStorage(app).bucket();
  } catch {
    return null;
  }
}
