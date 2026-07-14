import { promises as fs } from "fs";
import path from "path";
import type { CollectionReference } from "firebase-admin/firestore";
import type { WrapStar } from "./types";
import { getFirestoreDb } from "./firebase-admin";
import { trackingWrapstarsCollection, trackingDriversCollection } from "./tracking-firestore";
import { generateWrapstarId, wrapstarIdFromLegacy } from "./wrapstar-id";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "wrapstars.json");
const LEGACY_FILE = path.join(DATA_DIR, "drivers.json");

const ROGER_ID = wrapstarIdFromLegacy("drv-1");
const TAYLOR_ID = wrapstarIdFromLegacy("drv-2");

const DEFAULT_WRAPSTARS: WrapStar[] = [
  {
    id: ROGER_ID,
    displayId: ROGER_ID,
    name: "Roger",
    homePostalCode: "32218",
    allocationRank: 0,
    legacyDriverId: "drv-1",
    canDeliver: true,
    hasVehicle: true,
    wrapOnly: false,
    metroId: "jacksonville",
  },
  {
    id: TAYLOR_ID,
    displayId: TAYLOR_ID,
    name: "Taylor",
    homePostalCode: "32256",
    allocationRank: 1,
    legacyDriverId: "drv-2",
    canDeliver: true,
    hasVehicle: true,
    wrapOnly: false,
    metroId: "jacksonville",
  },
];

function normalizeWrapStar(raw: Partial<WrapStar> & { id?: string; name?: string }): WrapStar | null {
  if (!raw?.id || !raw?.name) return null;
  const id = String(raw.id);
  const homePostalCode = String(raw.homePostalCode || "32218").replace(/\D/g, "").slice(0, 5) || "32218";
  const canDeliver = raw.canDeliver !== false;
  const wrapOnly = raw.wrapOnly === true || canDeliver === false;
  return {
    id,
    displayId: String(raw.displayId || id),
    name: String(raw.name),
    homePostalCode,
    servicePostalCodes: Array.isArray(raw.servicePostalCodes) ? raw.servicePostalCodes : undefined,
    allocationRank: typeof raw.allocationRank === "number" ? raw.allocationRank : 0,
    email: raw.email,
    phone: raw.phone,
    legacyDriverId: raw.legacyDriverId,
    canDeliver: wrapOnly ? false : canDeliver,
    hasVehicle: raw.hasVehicle,
    deliveryMaxDistance: raw.deliveryMaxDistance,
    wrapOnly,
    assignedDriverId: raw.assignedDriverId,
    metroId: raw.metroId,
  };
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function writeWrapstarsFile(list: WrapStar[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(FILE, JSON.stringify(list, null, 2), "utf8");
}

async function migrateLegacyDriversFile(): Promise<WrapStar[] | null> {
  try {
    const raw = await fs.readFile(LEGACY_FILE, "utf8");
    const parsed = JSON.parse(raw) as Array<{ id: string; name: string; allocationRank?: number }>;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map((d, i) => {
      const id = d.id.startsWith("drv-") ? wrapstarIdFromLegacy(d.id) : d.id;
      return normalizeWrapStar({
        id,
        displayId: id,
        name: d.name,
        homePostalCode: d.id === "drv-1" ? "32218" : "32256",
        allocationRank: d.allocationRank ?? i,
        legacyDriverId: d.id.startsWith("drv-") ? d.id : undefined,
      })!;
    });
  } catch {
    return null;
  }
}

async function seedFirestoreWrapstarsIfEmpty(col: CollectionReference) {
  const snap = await col.limit(1).get();
  if (!snap.empty) return;

  // Try migrate from legacy tracking_drivers collection
  const legacyCol = getFirestoreDb()?.collection("tracking_drivers") ?? null;
  const db = getFirestoreDb();
  if (!db) return;

  if (legacyCol) {
    const legacySnap = await legacyCol.get();
    if (!legacySnap.empty) {
      const batch = db.batch();
      for (const doc of legacySnap.docs) {
        const d = doc.data() as { id?: string; name?: string; allocationRank?: number };
        const legacyId = d.id || doc.id;
        const id = legacyId.startsWith("drv-") ? wrapstarIdFromLegacy(legacyId) : legacyId;
        const ws = normalizeWrapStar({
          id,
          displayId: id,
          name: d.name || "WrapStar",
          homePostalCode: legacyId === "drv-1" ? "32218" : "32256",
          allocationRank: d.allocationRank ?? 0,
          legacyDriverId: legacyId.startsWith("drv-") ? legacyId : undefined,
        });
        if (ws) batch.set(col.doc(ws.id), ws);
      }
      await batch.commit();
      return;
    }
  }

  const batch = db.batch();
  for (const d of DEFAULT_WRAPSTARS) {
    batch.set(col.doc(d.id), d);
  }
  await batch.commit();
}

export async function listRegisteredWrapstars(): Promise<WrapStar[]> {
  const col = trackingWrapstarsCollection();
  if (col) {
    await seedFirestoreWrapstarsIfEmpty(col);
    const snap = await col.get();
    const list = snap.docs
      .map((doc) => normalizeWrapStar(doc.data() as WrapStar))
      .filter((x): x is WrapStar => !!x);
    if (list.length === 0) return [...DEFAULT_WRAPSTARS];
    return list.sort((a, b) => a.allocationRank - b.allocationRank);
  }

  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as WrapStar[];
    const list = (Array.isArray(parsed) ? parsed : [])
      .map((d) => normalizeWrapStar(d))
      .filter((x): x is WrapStar => !!x);
    if (list.length === 0) {
      const migrated = await migrateLegacyDriversFile();
      if (migrated?.length) {
        await writeWrapstarsFile(migrated);
        return migrated.sort((a, b) => a.allocationRank - b.allocationRank);
      }
      return [...DEFAULT_WRAPSTARS];
    }
    return list.sort((a, b) => a.allocationRank - b.allocationRank);
  } catch {
    const migrated = await migrateLegacyDriversFile();
    if (migrated?.length) {
      await writeWrapstarsFile(migrated);
      return migrated.sort((a, b) => a.allocationRank - b.allocationRank);
    }
    await writeWrapstarsFile(DEFAULT_WRAPSTARS);
    return [...DEFAULT_WRAPSTARS];
  }
}

export async function findWrapstarById(wrapstarId: string): Promise<WrapStar | undefined> {
  const all = await listRegisteredWrapstars();
  return all.find((d) => d.id === wrapstarId || d.legacyDriverId === wrapstarId || d.displayId === wrapstarId);
}

export async function findWrapstarByName(inputName: string): Promise<WrapStar | undefined> {
  const n = inputName.trim().toLowerCase();
  const all = await listRegisteredWrapstars();
  return all.find((d) => d.name.trim().toLowerCase() === n);
}

export async function addWrapstar(input: {
  name: string;
  homePostalCode: string;
  email?: string;
  phone?: string;
}): Promise<{ ok: true; wrapstar: WrapStar } | { ok: false; error: string }> {
  const clean = input.name.trim();
  if (!clean) return { ok: false, error: "WrapStar name is required." };
  const zip = input.homePostalCode.replace(/\D/g, "").slice(0, 5);
  if (zip.length !== 5) return { ok: false, error: "A valid 5-digit home ZIP is required." };

  const all = await listRegisteredWrapstars();
  if (all.some((d) => d.name.trim().toLowerCase() === clean.toLowerCase())) {
    return { ok: false, error: "A WrapStar with this name already exists." };
  }
  const maxRank = all.reduce((m, d) => Math.max(m, d.allocationRank), -1);
  let id = generateWrapstarId();
  while (all.some((d) => d.id === id)) id = generateWrapstarId();

  const wrapstar: WrapStar = {
    id,
    displayId: id,
    name: clean,
    homePostalCode: zip,
    allocationRank: maxRank + 1,
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
  };

  const col = trackingWrapstarsCollection();
  if (col) {
    await col.doc(wrapstar.id).set(wrapstar);
    return { ok: true, wrapstar };
  }

  const next = [...all, wrapstar].sort((a, b) => a.allocationRank - b.allocationRank);
  await writeWrapstarsFile(next);
  return { ok: true, wrapstar };
}

export async function updateWrapstar(
  wrapstarId: string,
  patch: Partial<
    Pick<
      WrapStar,
      | "name"
      | "homePostalCode"
      | "email"
      | "phone"
      | "servicePostalCodes"
      | "canDeliver"
      | "hasVehicle"
      | "deliveryMaxDistance"
      | "wrapOnly"
      | "assignedDriverId"
      | "metroId"
    >
  >,
): Promise<{ ok: true; wrapstar: WrapStar } | { ok: false; error: string }> {
  const all = await listRegisteredWrapstars();
  const idx = all.findIndex((d) => d.id === wrapstarId);
  if (idx < 0) return { ok: false, error: "WrapStar not found." };
  const prev = all[idx]!;
  const canDeliver =
    patch.canDeliver !== undefined
      ? patch.canDeliver
      : patch.wrapOnly !== undefined
        ? !patch.wrapOnly
        : prev.canDeliver !== false;
  const wrapOnly = patch.wrapOnly !== undefined ? patch.wrapOnly : !canDeliver;
  const nextWs: WrapStar = {
    ...prev,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.homePostalCode !== undefined
      ? { homePostalCode: patch.homePostalCode.replace(/\D/g, "").slice(0, 5) }
      : {}),
    ...(patch.email !== undefined ? { email: patch.email.trim() || undefined } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone.trim() || undefined } : {}),
    ...(patch.servicePostalCodes !== undefined ? { servicePostalCodes: patch.servicePostalCodes } : {}),
    canDeliver: wrapOnly ? false : canDeliver,
    wrapOnly,
    ...(patch.hasVehicle !== undefined ? { hasVehicle: patch.hasVehicle } : {}),
    ...(patch.deliveryMaxDistance !== undefined
      ? { deliveryMaxDistance: patch.deliveryMaxDistance || undefined }
      : {}),
    ...(patch.assignedDriverId !== undefined
      ? { assignedDriverId: patch.assignedDriverId || undefined }
      : {}),
    ...(patch.metroId !== undefined ? { metroId: patch.metroId } : {}),
  };
  if (!nextWs.homePostalCode || nextWs.homePostalCode.length !== 5) {
    return { ok: false, error: "A valid 5-digit home ZIP is required." };
  }

  const col = trackingWrapstarsCollection();
  if (col) {
    await col.doc(wrapstarId).set(nextWs);
    return { ok: true, wrapstar: nextWs };
  }
  all[idx] = nextWs;
  await writeWrapstarsFile(all);
  return { ok: true, wrapstar: nextWs };
}

export async function deleteWrapstar(wrapstarId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (wrapstarId === ROGER_ID || wrapstarId === "drv-1") {
    return { ok: false, error: "Primary founder WrapStar (Roger) cannot be deleted." };
  }
  const all = await listRegisteredWrapstars();
  if (!all.some((d) => d.id === wrapstarId)) {
    return { ok: false, error: "WrapStar not found." };
  }
  const next = all
    .filter((d) => d.id !== wrapstarId)
    .sort((a, b) => a.allocationRank - b.allocationRank)
    .map((d, i) => ({ ...d, allocationRank: i }));

  const col = trackingWrapstarsCollection();
  const db = getFirestoreDb();
  if (col && db) {
    const batch = db.batch();
    batch.delete(col.doc(wrapstarId));
    for (const d of next) {
      batch.set(col.doc(d.id), d);
    }
    await batch.commit();
    return { ok: true };
  }

  await writeWrapstarsFile(next);
  return { ok: true };
}

/** Founder WrapStar id (Roger) — for UI protection. */
export function founderWrapstarId(): string {
  return ROGER_ID;
}

/** Demo WrapStar (Taylor / Jacksonville) — default assignment pick. */
export function demoTaylorWrapstarId(): string {
  return TAYLOR_ID;
}

// ---- Compatibility shims (Driver naming) ----

export async function listRegisteredDrivers(): Promise<WrapStar[]> {
  return listRegisteredWrapstars();
}

export async function findDriverById(driverId: string): Promise<WrapStar | undefined> {
  return findWrapstarById(driverId);
}

export async function findDriverByName(inputName: string): Promise<WrapStar | undefined> {
  return findWrapstarByName(inputName);
}

export async function addDriver(name: string): Promise<{ ok: true; driver: WrapStar } | { ok: false; error: string }> {
  const r = await addWrapstar({ name, homePostalCode: "32218" });
  if (!r.ok) return r;
  return { ok: true, driver: r.wrapstar };
}

export async function deleteDriver(driverId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return deleteWrapstar(driverId);
}

// silence unused import when firestore not configured for legacy path
void trackingDriversCollection;
