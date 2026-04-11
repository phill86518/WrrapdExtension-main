import { Buffer } from "node:buffer";
import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function normalizePemString(s: string): string {
  let t = s.trim();
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  t = t.trim();
  t = t.replace(/\\n/g, "\n");
  t = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return t;
}

/**
 * Prefer FIREBASE_PRIVATE_KEY_BASE64 (single line, Secret Manager–friendly).
 * Otherwise FIREBASE_PRIVATE_KEY (PEM or .env-style \n escapes).
 */
function getPrivateKey() {
  const b64 = process.env.FIREBASE_PRIVATE_KEY_BASE64?.trim();
  if (b64) {
    try {
      const pem = Buffer.from(b64, "base64").toString("utf8");
      return normalizePemString(pem);
    } catch (err) {
      console.error("[firebase-admin] FIREBASE_PRIVATE_KEY_BASE64 decode failed:", err);
      return undefined;
    }
  }

  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw) return undefined;
  return normalizePemString(raw);
}

/** True if either private-key env form is non-empty (for startup guard). */
export function isFirebasePrivateKeyConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PRIVATE_KEY_BASE64?.trim() || process.env.FIREBASE_PRIVATE_KEY?.trim(),
  );
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
