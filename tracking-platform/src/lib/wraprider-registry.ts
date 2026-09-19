import { promises as fs } from "fs";
import path from "path";
import type { MetroId, OnboardingStatus, WrapRider } from "./types";
import { trackingWrapridersCollection } from "./tracking-firestore";
import { metroForPostalCode, getMetro } from "./metros";
import { allocateEmployeeId, DEMO_EMPLOYEE_IDS } from "./employee-id";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "wrapriders.json");

const DEFAULT_WRAPRIDERS: WrapRider[] = [
  {
    id: DEMO_EMPLOYEE_IDS.wrapriderAlex,
    displayId: DEMO_EMPLOYEE_IDS.wrapriderAlex,
    name: "Alex Rivera",
    homePostalCode: "32218",
    metroId: "jacksonville",
    status: "approved",
    notes: "Demo WrapRider — Jacksonville (6260981201)",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

function nowIso() {
  return new Date().toISOString();
}

function normalizeWrapRider(raw: Partial<WrapRider> & { id?: string; name?: string }): WrapRider | null {
  if (!raw?.id || !raw?.name) return null;
  const homePostalCode = String(raw.homePostalCode || "").replace(/\D/g, "").slice(0, 5);
  if (homePostalCode.length !== 5) return null;
  const metroId = (raw.metroId || metroForPostalCode(homePostalCode)?.id) as MetroId | undefined;
  const status = (raw.status || "pending") as OnboardingStatus;
  const createdAt = raw.createdAt || nowIso();
  return {
    id: String(raw.id),
    displayId: String(raw.displayId || raw.id),
    name: String(raw.name).trim(),
    homePostalCode,
    metroId,
    status: ["pending", "approved", "rejected"].includes(status) ? status : "pending",
    email: raw.email?.trim() || undefined,
    phone: raw.phone?.trim() || undefined,
    notes: raw.notes?.trim() || undefined,
    applicationId: typeof raw.applicationId === "number" ? raw.applicationId : undefined,
    wrapstarId: raw.wrapstarId || undefined,
    courierDriverId: raw.courierDriverId || undefined,
    vehicleType: raw.vehicleType || undefined,
    hasPrinter: raw.hasPrinter,
    printerSize: raw.printerSize || undefined,
    ...(typeof raw.hourlyRateCents === "number" && raw.hourlyRateCents > 0
      ? { hourlyRateCents: Math.round(raw.hourlyRateCents) }
      : {}),
    createdAt,
    updatedAt: raw.updatedAt || createdAt,
  };
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function writeFile(list: WrapRider[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(FILE, JSON.stringify(list, null, 2), "utf8");
}

async function readLocal(): Promise<WrapRider[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as WrapRider[];
    return (Array.isArray(parsed) ? parsed : [])
      .map((d) => normalizeWrapRider(d))
      .filter((x): x is WrapRider => !!x);
  } catch {
    return [];
  }
}

export async function ensureDemoWrapriders(): Promise<WrapRider[]> {
  const existing = await listWrapridersRaw();
  const byId = new Map(existing.map((d) => [d.id, d]));
  let changed = false;
  for (const demo of DEFAULT_WRAPRIDERS) {
    if (!byId.has(demo.id)) {
      byId.set(demo.id, demo);
      changed = true;
    }
  }
  const next = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (!changed && existing.length > 0) return next;

  const col = trackingWrapridersCollection();
  if (col) {
    for (const demo of DEFAULT_WRAPRIDERS) {
      const doc = await col.doc(demo.id).get();
      if (!doc.exists) await col.doc(demo.id).set(demo);
    }
    const snap = await col.get();
    return snap.docs
      .map((d) => normalizeWrapRider(d.data() as WrapRider))
      .filter((x): x is WrapRider => !!x)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  if (changed || existing.length === 0) await writeFile(next);
  return next;
}

async function listWrapridersRaw(): Promise<WrapRider[]> {
  const col = trackingWrapridersCollection();
  if (col) {
    const snap = await col.get();
    return snap.docs
      .map((doc) => normalizeWrapRider(doc.data() as WrapRider))
      .filter((x): x is WrapRider => !!x);
  }
  return readLocal();
}

export async function listWrapriders(): Promise<WrapRider[]> {
  await ensureDemoWrapriders();
  return (await listWrapridersRaw()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function findWrapriderById(id: string): Promise<WrapRider | undefined> {
  const all = await listWrapriders();
  return all.find((d) => d.id === id || d.displayId === id);
}

export async function findWrapriderByEmail(email: string): Promise<WrapRider | undefined> {
  const needle = email.trim().toLowerCase();
  if (!needle) return undefined;
  const all = await listWrapriders();
  return all.find((d) => (d.email || "").trim().toLowerCase() === needle);
}

export async function addWraprider(input: {
  name: string;
  homePostalCode: string;
  metroId?: MetroId;
  email?: string;
  phone?: string;
  notes?: string;
  status?: OnboardingStatus;
  applicationId?: number;
  wrapstarId?: string;
  courierDriverId?: string;
  vehicleType?: string;
  hasPrinter?: boolean;
  printerSize?: string;
  hourlyRateCents?: number;
}): Promise<{ ok: true; wraprider: WrapRider } | { ok: false; error: string }> {
  const clean = input.name.trim();
  if (!clean) return { ok: false, error: "WrapRider name is required." };
  const zip = input.homePostalCode.replace(/\D/g, "").slice(0, 5);
  if (zip.length !== 5) return { ok: false, error: "A valid 5-digit home ZIP is required." };
  const metroId = input.metroId || metroForPostalCode(zip)?.id;
  if (!metroId || !getMetro(metroId)) {
    return { ok: false, error: "Home ZIP is outside launch metros (set metro manually if needed)." };
  }

  const all = await listWrapriders();
  if (input.email?.trim()) {
    const em = input.email.trim().toLowerCase();
    if (all.some((d) => (d.email || "").trim().toLowerCase() === em)) {
      return { ok: false, error: "A WrapRider with this email already exists." };
    }
  }

  const idResult = allocateEmployeeId(
    "6",
    zip,
    all.map((d) => d.id),
  );
  if (!idResult.ok) return { ok: false, error: idResult.error };
  const ts = nowIso();
  const wraprider: WrapRider = {
    id: idResult.id,
    displayId: idResult.id,
    name: clean,
    homePostalCode: zip,
    metroId,
    status: input.status || "pending",
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    applicationId: input.applicationId,
    wrapstarId: input.wrapstarId,
    courierDriverId: input.courierDriverId,
    vehicleType: input.vehicleType,
    hasPrinter: input.hasPrinter,
    printerSize: input.printerSize,
    ...(typeof input.hourlyRateCents === "number" && input.hourlyRateCents > 0
      ? { hourlyRateCents: Math.round(input.hourlyRateCents) }
      : {}),
    createdAt: ts,
    updatedAt: ts,
  };

  const col = trackingWrapridersCollection();
  if (col) {
    await col.doc(wraprider.id).set(wraprider);
    return { ok: true, wraprider };
  }
  await writeFile([...all, wraprider].sort((a, b) => a.name.localeCompare(b.name)));
  return { ok: true, wraprider };
}

export async function updateWraprider(
  wrapriderId: string,
  patch: Partial<
    Pick<
      WrapRider,
      | "name"
      | "homePostalCode"
      | "email"
      | "phone"
      | "notes"
      | "status"
      | "metroId"
      | "applicationId"
      | "wrapstarId"
      | "courierDriverId"
      | "vehicleType"
      | "hasPrinter"
      | "printerSize"
      | "hourlyRateCents"
    >
  >,
): Promise<{ ok: true; wraprider: WrapRider } | { ok: false; error: string }> {
  const all = await listWrapriders();
  const idx = all.findIndex((d) => d.id === wrapriderId);
  if (idx < 0) return { ok: false, error: "WrapRider not found." };
  const prev = all[idx]!;
  const zip = patch.homePostalCode
    ? patch.homePostalCode.replace(/\D/g, "").slice(0, 5)
    : prev.homePostalCode;
  if (zip.length !== 5) return { ok: false, error: "A valid 5-digit home ZIP is required." };
  const metroId = patch.metroId || metroForPostalCode(zip)?.id || prev.metroId;

  const next: WrapRider = {
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

  const col = trackingWrapridersCollection();
  if (col) {
    await col.doc(next.id).set(next);
    return { ok: true, wraprider: next };
  }
  const list = [...all];
  list[idx] = next;
  await writeFile(list.sort((a, b) => a.name.localeCompare(b.name)));
  return { ok: true, wraprider: next };
}

export async function deleteWraprider(
  wrapriderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const all = await listWrapriders();
  const found = all.find((d) => d.id === wrapriderId);
  if (!found) return { ok: false, error: "WrapRider not found." };
  if (found.id === DEMO_EMPLOYEE_IDS.wrapriderAlex) {
    return { ok: false, error: "Demo WrapRider is protected." };
  }
  const col = trackingWrapridersCollection();
  if (col) {
    await col.doc(wrapriderId).delete();
    return { ok: true };
  }
  await writeFile(all.filter((d) => d.id !== wrapriderId));
  return { ok: true };
}
