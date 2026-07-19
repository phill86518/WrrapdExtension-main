import { promises as fs } from "fs";
import path from "path";
import type { DeliveryDriver, MetroId, OnboardingStatus } from "./types";
import { trackingDeliveryDriversCollection } from "./tracking-firestore";
import { metroForPostalCode, getMetro } from "./metros";
import { DEMO_DRIVER_ATL_ID, DEMO_DRIVER_JAX_ID } from "./demo-ids";
import { allocateEmployeeId, DEMO_EMPLOYEE_IDS } from "./employee-id";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "delivery-drivers.json");

export { DEMO_DRIVER_JAX_ID, DEMO_DRIVER_ATL_ID };

const RILEY_ID = DEMO_EMPLOYEE_IDS.driverRiley;

const DEFAULT_DELIVERY_DRIVERS: DeliveryDriver[] = [
  {
    id: DEMO_EMPLOYEE_IDS.driverDevon,
    displayId: DEMO_EMPLOYEE_IDS.driverDevon,
    name: "Devon Blake",
    homePostalCode: "32218",
    metroId: "jacksonville",
    status: "approved",
    notes: "Demo Driver — Jacksonville (7260981201)",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: DEMO_EMPLOYEE_IDS.driverMorgan,
    displayId: DEMO_EMPLOYEE_IDS.driverMorgan,
    name: "Morgan Ellis",
    homePostalCode: "30309",
    metroId: "atlanta",
    status: "approved",
    notes: "Demo Driver — Atlanta (7261090301)",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: RILEY_ID,
    displayId: RILEY_ID,
    name: "Riley Quinn",
    homePostalCode: "32256",
    metroId: "jacksonville",
    status: "approved",
    notes: "Demo Driver — Jacksonville Southside (7260965201)",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

function nowIso() {
  return new Date().toISOString();
}

function normalizeDeliveryDriver(raw: Partial<DeliveryDriver> & { id?: string; name?: string }): DeliveryDriver | null {
  if (!raw?.id || !raw?.name) return null;
  const homePostalCode = String(raw.homePostalCode || "").replace(/\D/g, "").slice(0, 5);
  if (homePostalCode.length !== 5) return null;
  const metroId = (raw.metroId || metroForPostalCode(homePostalCode)?.id) as MetroId | undefined;
  if (!metroId || !getMetro(metroId)) return null;
  const status = (raw.status || "pending") as OnboardingStatus;
  const createdAt = raw.createdAt || nowIso();
  return {
    id: String(raw.id),
    displayId: String(raw.displayId || raw.id),
    name: String(raw.name).trim(),
    homePostalCode,
    servicePostalCodes: Array.isArray(raw.servicePostalCodes) ? raw.servicePostalCodes : undefined,
    metroId,
    status: ["pending", "approved", "rejected"].includes(status) ? status : "pending",
    email: raw.email?.trim() || undefined,
    phone: raw.phone?.trim() || undefined,
    notes: raw.notes?.trim() || undefined,
    createdAt,
    updatedAt: raw.updatedAt || createdAt,
  };
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function writeFile(list: DeliveryDriver[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(FILE, JSON.stringify(list, null, 2), "utf8");
}

async function readLocal(): Promise<DeliveryDriver[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as DeliveryDriver[];
    return (Array.isArray(parsed) ? parsed : [])
      .map((d) => normalizeDeliveryDriver(d))
      .filter((x): x is DeliveryDriver => !!x);
  } catch {
    return [];
  }
}

/** Ensure demo Drivers exist (idempotent). */
export async function ensureDemoDeliveryDrivers(): Promise<DeliveryDriver[]> {
  const existing = await listDeliveryDriversRaw();
  const byId = new Map(existing.map((d) => [d.id, d]));
  let changed = false;
  for (const demo of DEFAULT_DELIVERY_DRIVERS) {
    if (!byId.has(demo.id)) {
      byId.set(demo.id, demo);
      changed = true;
    }
  }
  const next = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (!changed && existing.length > 0) return next;

  const col = trackingDeliveryDriversCollection();
  if (col) {
    for (const demo of DEFAULT_DELIVERY_DRIVERS) {
      const doc = await col.doc(demo.id).get();
      if (!doc.exists) await col.doc(demo.id).set(demo);
    }
    const snap = await col.get();
    return snap.docs
      .map((d) => normalizeDeliveryDriver(d.data() as DeliveryDriver))
      .filter((x): x is DeliveryDriver => !!x)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  if (changed || existing.length === 0) await writeFile(next);
  return next;
}

async function listDeliveryDriversRaw(): Promise<DeliveryDriver[]> {
  const col = trackingDeliveryDriversCollection();
  if (col) {
    const snap = await col.get();
    return snap.docs
      .map((doc) => normalizeDeliveryDriver(doc.data() as DeliveryDriver))
      .filter((x): x is DeliveryDriver => !!x);
  }
  return readLocal();
}

export async function listDeliveryDrivers(): Promise<DeliveryDriver[]> {
  await ensureDemoDeliveryDrivers();
  return (await listDeliveryDriversRaw()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function findDeliveryDriverById(id: string): Promise<DeliveryDriver | undefined> {
  const all = await listDeliveryDrivers();
  return all.find((d) => d.id === id || d.displayId === id);
}

export async function addDeliveryDriver(input: {
  name: string;
  homePostalCode: string;
  metroId?: MetroId;
  email?: string;
  phone?: string;
  notes?: string;
  status?: OnboardingStatus;
  servicePostalCodes?: string[];
}): Promise<{ ok: true; driver: DeliveryDriver } | { ok: false; error: string }> {
  const clean = input.name.trim();
  if (!clean) return { ok: false, error: "Driver name is required." };
  const zip = input.homePostalCode.replace(/\D/g, "").slice(0, 5);
  if (zip.length !== 5) return { ok: false, error: "A valid 5-digit home ZIP is required." };
  const metroId = input.metroId || metroForPostalCode(zip)?.id;
  if (!metroId || !getMetro(metroId)) {
    return { ok: false, error: "Home ZIP is outside launch metros (set metro manually if needed)." };
  }

  const all = await listDeliveryDrivers();
  if (all.some((d) => d.name.trim().toLowerCase() === clean.toLowerCase())) {
    return { ok: false, error: "A Driver with this name already exists." };
  }

  const idResult = allocateEmployeeId(
    "7",
    zip,
    all.map((d) => d.id),
  );
  if (!idResult.ok) return { ok: false, error: idResult.error };
  const id = idResult.id;
  const ts = nowIso();
  const driver: DeliveryDriver = {
    id,
    displayId: id,
    name: clean,
    homePostalCode: zip,
    metroId,
    status: input.status || "pending",
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    servicePostalCodes: input.servicePostalCodes,
    createdAt: ts,
    updatedAt: ts,
  };

  const col = trackingDeliveryDriversCollection();
  if (col) {
    await col.doc(driver.id).set(driver);
    return { ok: true, driver };
  }
  await writeFile([...all, driver].sort((a, b) => a.name.localeCompare(b.name)));
  return { ok: true, driver };
}

export async function updateDeliveryDriver(
  driverId: string,
  patch: Partial<
    Pick<
      DeliveryDriver,
      "name" | "homePostalCode" | "email" | "phone" | "notes" | "status" | "servicePostalCodes" | "metroId"
    >
  >,
): Promise<{ ok: true; driver: DeliveryDriver } | { ok: false; error: string }> {
  const all = await listDeliveryDrivers();
  const idx = all.findIndex((d) => d.id === driverId);
  if (idx < 0) return { ok: false, error: "Driver not found." };
  const prev = all[idx]!;
  const zip = patch.homePostalCode
    ? patch.homePostalCode.replace(/\D/g, "").slice(0, 5)
    : prev.homePostalCode;
  if (zip.length !== 5) return { ok: false, error: "A valid 5-digit home ZIP is required." };
  const metroId = patch.metroId || metroForPostalCode(zip)?.id || prev.metroId;
  if (!getMetro(metroId)) return { ok: false, error: "Invalid metro." };

  const next: DeliveryDriver = {
    ...prev,
    ...patch,
    homePostalCode: zip,
    metroId,
    name: patch.name?.trim() || prev.name,
    email: patch.email !== undefined ? patch.email.trim() || undefined : prev.email,
    phone: patch.phone !== undefined ? patch.phone.trim() || undefined : prev.phone,
    notes: patch.notes !== undefined ? patch.notes.trim() || undefined : prev.notes,
    updatedAt: nowIso(),
  };

  const col = trackingDeliveryDriversCollection();
  if (col) {
    await col.doc(next.id).set(next);
    return { ok: true, driver: next };
  }
  const list = [...all];
  list[idx] = next;
  await writeFile(list.sort((a, b) => a.name.localeCompare(b.name)));
  return { ok: true, driver: next };
}

export async function deleteDeliveryDriver(
  driverId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (
    driverId === DEMO_EMPLOYEE_IDS.driverDevon ||
    driverId === DEMO_EMPLOYEE_IDS.driverMorgan
  ) {
    return { ok: false, error: "Demo Drivers cannot be deleted." };
  }
  const all = await listDeliveryDrivers();
  if (!all.some((d) => d.id === driverId)) return { ok: false, error: "Driver not found." };
  const next = all.filter((d) => d.id !== driverId);
  const col = trackingDeliveryDriversCollection();
  if (col) {
    await col.doc(driverId).delete();
    return { ok: true };
  }
  await writeFile(next);
  return { ok: true };
}
