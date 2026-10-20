/**
 * Firestore-backed Shopify session storage for Cloud Run (same GCP project as tracking).
 */
import { Session } from "@shopify/shopify-api";

let dbPromise = null;

async function getDb() {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
    if (!projectId) return null;
    const { initializeApp, getApps, cert } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    if (!getApps().length) {
      const email = process.env.FIREBASE_CLIENT_EMAIL;
      let key = process.env.FIREBASE_PRIVATE_KEY || "";
      if (process.env.FIREBASE_PRIVATE_KEY_BASE64) {
        key = Buffer.from(process.env.FIREBASE_PRIVATE_KEY_BASE64, "base64").toString("utf8");
      }
      key = key.replace(/\\n/g, "\n");
      if (email && key) {
        initializeApp({ credential: cert({ projectId, clientEmail: email, privateKey: key }) });
      } else {
        initializeApp({ projectId });
      }
    }
    return getFirestore();
  })();
  return dbPromise;
}

function col(db) {
  return db.collection("shopify_app_sessions");
}

function toSession(data) {
  if (!data || !data.id) return undefined;
  return new Session({
    id: String(data.id),
    shop: String(data.shop || ""),
    state: String(data.state || ""),
    isOnline: Boolean(data.isOnline),
    scope: data.scope != null ? String(data.scope) : undefined,
    expires: data.expires ? new Date(data.expires) : undefined,
    accessToken: data.accessToken != null ? String(data.accessToken) : undefined,
    userId: data.userId != null ? data.userId : undefined,
    firstName: data.firstName != null ? String(data.firstName) : undefined,
    lastName: data.lastName != null ? String(data.lastName) : undefined,
    email: data.email != null ? String(data.email) : undefined,
    accountOwner: data.accountOwner != null ? Boolean(data.accountOwner) : undefined,
    locale: data.locale != null ? String(data.locale) : undefined,
    collaborator: data.collaborator != null ? Boolean(data.collaborator) : undefined,
    emailVerified: data.emailVerified != null ? Boolean(data.emailVerified) : undefined,
  });
}

export class FirestoreSessionStorage {
  async storeSession(session) {
    const db = await getDb();
    if (!db) return false;
    const obj = session.toObject();
    if (obj.expires instanceof Date) obj.expires = obj.expires.toISOString();
    await col(db).doc(session.id).set(obj);
    return true;
  }

  async loadSession(id) {
    const db = await getDb();
    if (!db) return undefined;
    const snap = await col(db).doc(id).get();
    if (!snap.exists) return undefined;
    return toSession(snap.data());
  }

  async deleteSession(id) {
    const db = await getDb();
    if (!db) return true;
    await col(db).doc(id).delete();
    return true;
  }

  async deleteSessions(ids) {
    const db = await getDb();
    if (!db) return true;
    const batch = db.batch();
    for (const id of ids) batch.delete(col(db).doc(id));
    await batch.commit();
    return true;
  }

  async findSessionsByShop(shop) {
    const db = await getDb();
    if (!db) return [];
    const snap = await col(db).where("shop", "==", shop).get();
    return snap.docs.map((d) => toSession(d.data())).filter(Boolean);
  }
}

export async function firestoreSessionsAvailable() {
  return !!(await getDb());
}
