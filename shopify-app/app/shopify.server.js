/**
 * Shopify app server wiring — Wrrapd Inc.
 * Partner login: admin@wrrapd.com · Support: help@wrrapd.com
 *
 * Cloud Run: Firestore sessions (FIREBASE_* set) — never loads Prisma engines.
 * Local `shopify app dev`: Prisma SQLite.
 */
import { createRequire } from "node:module";
import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { FirestoreSessionStorage } from "./firestore-session.server";

const require = createRequire(import.meta.url);

export const useFirestore = Boolean(
  process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.FIREBASE_CLIENT_EMAIL,
);

/** @type {import('@prisma/client').PrismaClient | null} */
export let prisma = null;

/** @type {import('@shopify/shopify-app-session-storage').SessionStorage} */
export let sessionStorage;

if (useFirestore) {
  sessionStorage = new FirestoreSessionStorage();
} else {
  const { PrismaSessionStorage } = require("@shopify/shopify-app-session-storage-prisma");
  const { PrismaClient } = require("@prisma/client");
  prisma = new PrismaClient();
  sessionStorage = new PrismaSessionStorage(prisma);
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: (process.env.SCOPES || "").split(",").filter(Boolean),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage,
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;

/** Clear merchant sessions + settings after uninstall. */
export async function clearShopData(shop) {
  if (!shop) return;
  if (sessionStorage?.findSessionsByShop && sessionStorage?.deleteSessions) {
    const existing = (await sessionStorage.findSessionsByShop(shop)) || [];
    const ids = existing.map((s) => s.id).filter(Boolean);
    if (ids.length) await sessionStorage.deleteSessions(ids);
  }
  if (useFirestore) {
    try {
      const { getApps } = await import("firebase-admin/app");
      const { getFirestore } = await import("firebase-admin/firestore");
      if (getApps().length) {
        await getFirestore().collection("shopify_app_shop_settings").doc(shop).delete();
      }
    } catch (_) {
      /* ignore */
    }
  }
  if (prisma) {
    await prisma.session.deleteMany({ where: { shop } }).catch(() => undefined);
    await prisma.shopSettings.deleteMany({ where: { shop } }).catch(() => undefined);
  }
}
