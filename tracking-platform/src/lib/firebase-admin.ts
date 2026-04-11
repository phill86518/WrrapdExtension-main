import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function getPrivateKey() {
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw) return undefined;
  let s = raw.trim();
  // Strip UTF-8 BOM if Secret Manager / Windows added it (breaks PEM parsing).
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  s = s.trim();
  // .env-style: literal backslash-n in one line → real newlines
  s = s.replace(/\\n/g, "\n");
  // If the secret was stored with Windows CRLF only, normalize
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return s;
}

function initFirebaseApp(): App | null {
  if (getApps().length) return getApps()[0]!;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  try {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  } catch (err) {
    console.error("[firebase-admin] initializeApp failed (check FIREBASE_PRIVATE_KEY newlines / PEM):", err);
    return null;
  }
}

export function getFirestoreDb() {
  const app = initFirebaseApp();
  if (!app) return null;
  const databaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID?.trim() || "(default)";
  try {
    return databaseId === "(default)" ? getFirestore(app) : getFirestore(app, databaseId);
  } catch (err) {
    console.error(
      `[firebase-admin] getFirestore failed (check FIREBASE_FIRESTORE_DATABASE_ID; databaseId=${databaseId}):`,
      err,
    );
    return null;
  }
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
