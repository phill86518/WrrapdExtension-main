/**
 * Merchant wrap-enabled flag — Prisma locally, Firestore on Cloud Run.
 */
import { prisma, useFirestore } from "./shopify.server";

async function firestoreDb() {
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
}

export async function getShopSettings(shop) {
  if (useFirestore) {
    const db = await firestoreDb();
    const snap = await db.collection("shopify_app_shop_settings").doc(shop).get();
    if (snap.exists) return snap.data();
    const created = { shop, wrapEnabled: true };
    await db.collection("shopify_app_shop_settings").doc(shop).set(created);
    return created;
  }
  let settings = await prisma.shopSettings.findUnique({ where: { shop } });
  if (!settings) {
    settings = await prisma.shopSettings.create({
      data: { shop, wrapEnabled: true },
    });
  }
  return settings;
}

export async function setShopWrapEnabled(shop, wrapEnabled) {
  if (useFirestore) {
    const db = await firestoreDb();
    const row = { shop, wrapEnabled: !!wrapEnabled };
    await db.collection("shopify_app_shop_settings").doc(shop).set(row, { merge: true });
    return row;
  }
  return prisma.shopSettings.upsert({
    where: { shop },
    create: { shop, wrapEnabled: !!wrapEnabled },
    update: { wrapEnabled: !!wrapEnabled },
  });
}
