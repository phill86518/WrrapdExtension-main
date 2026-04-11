import { promises as fs } from "fs";
import type { CollectionReference } from "firebase-admin/firestore";
import path from "path";
import type { DriverProfile, OnboardingStatus } from "./types";
import { trackingDriverProfilesCollection } from "./tracking-firestore";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "driver-profiles.json");

type Store = Record<string, DriverProfile>;

const defaultProfiles: Store = {
  "drv-1": {
    driverId: "drv-1",
    onboardingStatus: "approved",
    notes: "Founder — Roger",
  },
  "drv-2": {
    driverId: "drv-2",
    onboardingStatus: "pending",
    notes: "Taylor — pending onboarding",
  },
};

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
  const col = trackingDriverProfilesCollection();
  if (!col) return { ...defaultProfiles };
  await seedFirestoreProfilesIfMissing(col);
  const snap = await col.get();
  const merged: Store = { ...defaultProfiles };
  for (const doc of snap.docs) {
    merged[doc.id] = doc.data() as DriverProfile;
  }
  return merged;
}

export async function readDriverProfiles(): Promise<Store> {
  const col = trackingDriverProfilesCollection();
  if (col) {
    return readStoreFromFirestore();
  }
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Store;
    return { ...defaultProfiles, ...parsed };
  } catch {
    return { ...defaultProfiles };
  }
}

export async function getDriverProfile(driverId: string): Promise<DriverProfile> {
  const col = trackingDriverProfilesCollection();
  if (col) {
    await seedFirestoreProfilesIfMissing(col);
    const snap = await col.doc(driverId).get();
    if (snap.exists) return snap.data() as DriverProfile;
    return (
      defaultProfiles[driverId] ?? {
        driverId,
        onboardingStatus: "pending",
      }
    );
  }
  const all = await readDriverProfiles();
  return all[driverId] ?? defaultProfiles[driverId] ?? {
    driverId,
    onboardingStatus: "pending",
  };
}

export async function setOnboardingStatus(
  driverId: string,
  status: OnboardingStatus,
  notes?: string,
): Promise<DriverProfile> {
  const col = trackingDriverProfilesCollection();
  const prev = await getDriverProfile(driverId);
  const next: DriverProfile = {
    ...prev,
    onboardingStatus: status,
    ...(notes !== undefined ? { notes } : {}),
  };
  if (col) {
    await col.doc(driverId).set(next);
    return next;
  }
  const all = await readDriverProfiles();
  all[driverId] = next;
  await writeAllFile(all);
  return next;
}

export async function setForcedAvailableDates(driverId: string, dates: string[]): Promise<DriverProfile> {
  const col = trackingDriverProfilesCollection();
  const prev = await getDriverProfile(driverId);
  const next: DriverProfile = { ...prev, forcedAvailableDates: dates };
  if (col) {
    await col.doc(driverId).set(next);
    return next;
  }
  const all = await readDriverProfiles();
  all[driverId] = next;
  await writeAllFile(all);
  return next;
}
