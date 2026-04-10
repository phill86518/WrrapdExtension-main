import { promises as fs } from "fs";
import path from "path";
import type { Driver } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "drivers.json");

const DEFAULT_DRIVERS: Driver[] = [
  { id: "drv-1", name: "Roger", allocationRank: 0 },
  { id: "drv-2", name: "Taylor", allocationRank: 1 },
];

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function writeDrivers(drivers: Driver[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(FILE, JSON.stringify(drivers, null, 2), "utf8");
}

export async function listRegisteredDrivers(): Promise<Driver[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Driver[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [...DEFAULT_DRIVERS];
    }
    return parsed.sort((a, b) => a.allocationRank - b.allocationRank);
  } catch {
    await writeDrivers(DEFAULT_DRIVERS);
    return [...DEFAULT_DRIVERS];
  }
}

export async function findDriverById(driverId: string): Promise<Driver | undefined> {
  const all = await listRegisteredDrivers();
  return all.find((d) => d.id === driverId);
}

export async function findDriverByName(inputName: string): Promise<Driver | undefined> {
  const n = inputName.trim().toLowerCase();
  const all = await listRegisteredDrivers();
  return all.find((d) => d.name.trim().toLowerCase() === n);
}

export async function addDriver(name: string): Promise<{ ok: true; driver: Driver } | { ok: false; error: string }> {
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Driver name is required." };
  const all = await listRegisteredDrivers();
  if (all.some((d) => d.name.trim().toLowerCase() === clean.toLowerCase())) {
    return { ok: false, error: "A driver with this name already exists." };
  }
  const maxRank = all.reduce((m, d) => Math.max(m, d.allocationRank), -1);
  const maxId = all.reduce((m, d) => {
    const n2 = Number.parseInt(d.id.replace("drv-", ""), 10);
    return Number.isFinite(n2) ? Math.max(m, n2) : m;
  }, 0);
  const driver: Driver = {
    id: `drv-${maxId + 1}`,
    name: clean,
    allocationRank: maxRank + 1,
  };
  const next = [...all, driver].sort((a, b) => a.allocationRank - b.allocationRank);
  await writeDrivers(next);
  return { ok: true, driver };
}

export async function deleteDriver(driverId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (driverId === "drv-1") {
    return { ok: false, error: "Primary founder driver (Roger) cannot be deleted." };
  }
  const all = await listRegisteredDrivers();
  if (!all.some((d) => d.id === driverId)) {
    return { ok: false, error: "Driver not found." };
  }
  const next = all.filter((d) => d.id !== driverId);
  const reRanked = next
    .sort((a, b) => a.allocationRank - b.allocationRank)
    .map((d, i) => ({ ...d, allocationRank: i }));
  await writeDrivers(reRanked);
  return { ok: true };
}
