import { promises as fs } from "fs";
import type { CollectionReference } from "firebase-admin/firestore";
import path from "path";
import type { OnboardingStatus, WrapStarProfile } from "./types";
import { trackingWrapstarProfilesCollection } from "./tracking-firestore";
import { wrapstarIdFromLegacy } from "./wrapstar-id";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "wrapstar-profiles.json");
const LEGACY_FILE = path.join(DATA_DIR, "driver-profiles.json");

type Store = Record<string, WrapStarProfile>;

const ROGER_ID = wrapstarIdFromLegacy("drv-1");
const TAYLOR_ID = wrapstarIdFromLegacy("drv-2");

const defaultProfiles: Store = {
  [ROGER_ID]: {
    wrapstarId: ROGER_ID,
    driverId: ROGER_ID,
    onboardingStatus: "approved",
    notes: "Founder — Roger",
  },
  [TAYLOR_ID]: {
    wrapstarId: TAYLOR_ID,
    driverId: TAYLOR_ID,
    onboardingStatus: "approved",
    notes: "Demo WrapStar — Taylor (Jacksonville)",
  },
};

function normalizeProfile(id: string, raw: Partial<WrapStarProfile>): WrapStarProfile {
  const wrapTake =
    typeof raw.platformTakeWrapPercent === "number" && Number.isFinite(raw.platformTakeWrapPercent)
      ? Math.min(100, Math.max(0, raw.platformTakeWrapPercent))
      : undefined;
  const flowerTake =
    typeof raw.platformTakeFlowersPercent === "number" &&
    Number.isFinite(raw.platformTakeFlowersPercent)
      ? Math.min(100, Math.max(0, raw.platformTakeFlowersPercent))
      : undefined;
  return {
    wrapstarId: raw.wrapstarId || raw.driverId || id,
    driverId: raw.driverId || raw.wrapstarId || id,
    onboardingStatus: raw.onboardingStatus || "pending",
    notes: raw.notes,
    forcedAvailableDates: raw.forcedAvailableDates,
    ...(wrapTake !== undefined ? { platformTakeWrapPercent: wrapTake } : {}),
    ...(flowerTake !== undefined ? { platformTakeFlowersPercent: flowerTake } : {}),
  };
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function writeAllFile(store: Store) {
  await ensureDir();
  await fs.writeFile(FILE, JSON.stringify(store, null, 2), "utf8");
}

async function seedFirestoreProfilesIfMissing(col: CollectionReference | null) {
  if (!col) return;
  for (const [id, prof] of Object.entries(defaultProfiles)) {
    const snap = await col.doc(id).get();
    if (!snap.exists) {
      await col.doc(id).set(prof);
    }
  }
}

async function readStoreFromFirestore(): Promise<Store> {
  const col = trackingWrapstarProfilesCollection();
  if (!col) return { ...defaultProfiles };
  await seedFirestoreProfilesIfMissing(col);
  const snap = await col.get();
  const merged: Store = { ...defaultProfiles };
  for (const doc of snap.docs) {
    merged[doc.id] = normalizeProfile(doc.id, doc.data() as WrapStarProfile);
  }
  return merged;
}

export async function readWrapstarProfiles(): Promise<Store> {
  const col = trackingWrapstarProfilesCollection();
  if (col) {
    return readStoreFromFirestore();
  }
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Store;
    const merged: Store = { ...defaultProfiles };
    for (const [id, p] of Object.entries(parsed)) {
      merged[id] = normalizeProfile(id, p);
    }
    return merged;
  } catch {
    try {
      const legacy = await fs.readFile(LEGACY_FILE, "utf8");
      const parsed = JSON.parse(legacy) as Record<string, WrapStarProfile & { driverId?: string }>;
      const migrated: Store = { ...defaultProfiles };
      for (const [legacyId, p] of Object.entries(parsed)) {
        const id = legacyId.startsWith("drv-") ? wrapstarIdFromLegacy(legacyId) : legacyId;
        migrated[id] = normalizeProfile(id, { ...p, wrapstarId: id, driverId: id });
      }
      await writeAllFile(migrated);
      return migrated;
    } catch {
      return { ...defaultProfiles };
    }
  }
}

export async function getWrapstarProfile(wrapstarId: string): Promise<WrapStarProfile> {
  const resolved =
    wrapstarId.startsWith("drv-") ? wrapstarIdFromLegacy(wrapstarId) : wrapstarId;
  const col = trackingWrapstarProfilesCollection();
  if (col) {
    await seedFirestoreProfilesIfMissing(col);
    const snap = await col.doc(resolved).get();
    if (snap.exists) return normalizeProfile(resolved, snap.data() as WrapStarProfile);
    return (
      defaultProfiles[resolved] ?? {
        wrapstarId: resolved,
        driverId: resolved,
        onboardingStatus: "pending",
      }
    );
  }
  const all = await readWrapstarProfiles();
  return (
    all[resolved] ??
    defaultProfiles[resolved] ?? {
      wrapstarId: resolved,
      driverId: resolved,
      onboardingStatus: "pending",
    }
  );
}

export async function setOnboardingStatus(
  wrapstarId: string,
  status: OnboardingStatus,
  notes?: string,
): Promise<WrapStarProfile> {
  const resolved =
    wrapstarId.startsWith("drv-") ? wrapstarIdFromLegacy(wrapstarId) : wrapstarId;
  const col = trackingWrapstarProfilesCollection();
  const prev = await getWrapstarProfile(resolved);
  const next: WrapStarProfile = {
    ...prev,
    wrapstarId: resolved,
    driverId: resolved,
    onboardingStatus: status,
    ...(notes !== undefined ? { notes } : {}),
  };
  if (col) {
    await col.doc(resolved).set(next);
    return next;
  }
  const all = await readWrapstarProfiles();
  all[resolved] = next;
  await writeAllFile(all);
  return next;
}

/** Idempotent: Taylor is always approved for Command Center demos. */
export async function ensureDemoWrapstarApprovals(): Promise<void> {
  const taylor = await getWrapstarProfile(TAYLOR_ID);
  if (taylor.onboardingStatus !== "approved") {
    await setOnboardingStatus(TAYLOR_ID, "approved", "Demo WrapStar — Taylor (Jacksonville)");
  }
  const roger = await getWrapstarProfile(ROGER_ID);
  if (roger.onboardingStatus !== "approved") {
    await setOnboardingStatus(ROGER_ID, "approved", "Founder — Roger");
  }
}

export async function setForcedAvailableDates(
  wrapstarId: string,
  dates: string[],
): Promise<WrapStarProfile> {
  const resolved =
    wrapstarId.startsWith("drv-") ? wrapstarIdFromLegacy(wrapstarId) : wrapstarId;
  const col = trackingWrapstarProfilesCollection();
  const prev = await getWrapstarProfile(resolved);
  const next: WrapStarProfile = {
    ...prev,
    wrapstarId: resolved,
    driverId: resolved,
    forcedAvailableDates: dates,
  };
  if (col) {
    await col.doc(resolved).set(next);
    return next;
  }
  const all = await readWrapstarProfiles();
  all[resolved] = next;
  await writeAllFile(all);
  return next;
}

export async function setWrapstarPayoutTakes(
  wrapstarId: string,
  takes: {
    platformTakeWrapPercent?: number | null;
    platformTakeFlowersPercent?: number | null;
  },
): Promise<WrapStarProfile> {
  const resolved =
    wrapstarId.startsWith("drv-") ? wrapstarIdFromLegacy(wrapstarId) : wrapstarId;
  const col = trackingWrapstarProfilesCollection();
  const prev = await getWrapstarProfile(resolved);
  const next: WrapStarProfile = {
    ...prev,
    wrapstarId: resolved,
    driverId: resolved,
  };
  if (takes.platformTakeWrapPercent === null) {
    delete next.platformTakeWrapPercent;
  } else if (typeof takes.platformTakeWrapPercent === "number") {
    next.platformTakeWrapPercent = Math.min(100, Math.max(0, takes.platformTakeWrapPercent));
  }
  if (takes.platformTakeFlowersPercent === null) {
    delete next.platformTakeFlowersPercent;
  } else if (typeof takes.platformTakeFlowersPercent === "number") {
    next.platformTakeFlowersPercent = Math.min(
      100,
      Math.max(0, takes.platformTakeFlowersPercent),
    );
  }
  if (col) {
    await col.doc(resolved).set(next);
    return next;
  }
  const all = await readWrapstarProfiles();
  all[resolved] = next;
  await writeAllFile(all);
  return next;
}

// Compat
export const readDriverProfiles = readWrapstarProfiles;
export const getDriverProfile = getWrapstarProfile;
