import { promises as fs } from "fs";
import path from "path";
import type { DriverProfile, OnboardingStatus } from "./types";

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

export async function readDriverProfiles(): Promise<Store> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Store;
    return { ...defaultProfiles, ...parsed };
  } catch {
    return { ...defaultProfiles };
  }
}

async function writeAll(store: Store) {
  await ensureDir();
  await fs.writeFile(FILE, JSON.stringify(store, null, 2), "utf8");
}

export async function getDriverProfile(driverId: string): Promise<DriverProfile> {
  const all = await readDriverProfiles();
  return all[driverId] ?? defaultProfiles[driverId] ?? {
    driverId,
    onboardingStatus: "pending",
  };
}

export async function setOnboardingStatus(
  driverId: string,
  status: OnboardingStatus,
  notes?: string
): Promise<DriverProfile> {
  const all = await readDriverProfiles();
  const prev = all[driverId] ?? { driverId, onboardingStatus: "pending" as const };
  all[driverId] = {
    ...prev,
    onboardingStatus: status,
    ...(notes !== undefined ? { notes } : {}),
  };
  await writeAll(all);
  return all[driverId];
}

export async function setForcedAvailableDates(
  driverId: string,
  dates: string[]
): Promise<DriverProfile> {
  const all = await readDriverProfiles();
  const prev = all[driverId] ?? { driverId, onboardingStatus: "pending" as const };
  all[driverId] = { ...prev, forcedAvailableDates: dates };
  await writeAll(all);
  return all[driverId];
}
