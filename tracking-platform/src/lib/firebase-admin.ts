import { Buffer } from "node:buffer";
import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

/**
 * gRPC metadata must be printable ASCII on one line. Secret Manager / console
 * pastes often add \n, \r, or wrapping quotes — that triggers:
 * "Metadata string value \"projects/...\" contains illegal characters".
 */
export function sanitizeFirebaseEnvScalar(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  let s = value.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/\r\n/g, "").replace(/\n/g, "").replace(/\r/g, "");
  return s.length ? s : undefined;
}

/** Accept `wrrapd-db01` or accidental full resource path from Firebase Console. */
function normalizeFirestoreDatabaseId(raw: string | undefined): string {
  const cleaned = sanitizeFirebaseEnvScalar(raw);
  if (!cleaned || cleaned === "(default)") return "(default)";
  const fromPath = cleaned.match(/\/databases\/([^/]+)\/?$/);
  if (fromPath) return fromPath[1]!;
  const split = cleaned.split("/databases/");
  if (split.length === 2) return split[1]!.split("/")[0]!;
  return cleaned;
}

function normalizePemString(s: string): string {
  let t = s.trim();
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  t = t.trim();
  t = t.replace(/\\n/g, "\n");
  t = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return t;
}

function looksLikePemPrivateKey(s: string): boolean {
  return (
    s.includes("BEGIN PRIVATE KEY") || s.includes("BEGIN RSA PRIVATE KEY")
  );
}

/**
 * Prefer FIREBASE_PRIVATE_KEY_BASE64 (single line, Secret Manager–friendly).
 * If set but decodes to non-PEM garbage, fall through to FIREBASE_PRIVATE_KEY.
 * Otherwise FIREBASE_PRIVATE_KEY (PEM or .env-style \n escapes).
 */
function getPrivateKey() {
  const b64 = process.env.FIREBASE_PRIVATE_KEY_BASE64?.trim();
  if (b64) {
    try {
      const pem = Buffer.from(b64, "base64").toString("utf8");
      const normalized = normalizePemString(pem);
      if (looksLikePemPrivateKey(normalized)) {
        return normalized;
      }
      console.error(
        "[firebase-admin] FIREBASE_PRIVATE_KEY_BASE64 decoded but missing PEM private-key header; trying FIREBASE_PRIVATE_KEY if set",
      );
    } catch (err) {
      console.error("[firebase-admin] FIREBASE_PRIVATE_KEY_BASE64 decode failed:", err);
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

  const projectId = sanitizeFirebaseEnvScalar(process.env.FIREBASE_PROJECT_ID);
  const clientEmail = sanitizeFirebaseEnvScalar(process.env.FIREBASE_CLIENT_EMAIL);
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

/** Cached Firestore; `.settings()` runs once before any reads/writes. */
let firestoreSingleton: Firestore | null | undefined;

/**
 * Firestore rejects writes that include `undefined` field values. Optional Order fields
 * (e.g. addressLine2) used to 500 ingest — enable ignoreUndefinedProperties on the client.
 */
export function getFirestoreDb(): Firestore | null {
  if (firestoreSingleton !== undefined) {
    return firestoreSingleton;
  }
  const app = initFirebaseApp();
  if (!app) {
    firestoreSingleton = null;
    return null;
  }
  const databaseId = normalizeFirestoreDatabaseId(
    process.env.FIREBASE_FIRESTORE_DATABASE_ID,
  );
  try {
    const db =
      databaseId === "(default)" ? getFirestore(app) : getFirestore(app, databaseId);
    try {
      db.settings({ ignoreUndefinedProperties: true });
    } catch (settingsErr) {
      console.warn(
        "[firebase-admin] Firestore.settings(ignoreUndefinedProperties) skipped:",
        settingsErr,
      );
    }
    firestoreSingleton = db;
    return firestoreSingleton;
  } catch (err) {
    console.error(
      `[firebase-admin] getFirestore failed (check FIREBASE_FIRESTORE_DATABASE_ID; databaseId=${databaseId}):`,
      err,
    );
    firestoreSingleton = null;
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
