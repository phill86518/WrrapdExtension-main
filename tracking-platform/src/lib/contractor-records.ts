import { promises as fs } from "fs";
import path from "path";
import type { DriverApplication } from "./driver-applications-admin";
import type { WrapstarApplication } from "./wrapstar-applications-admin";
import { trackingContractorRecordsCollection } from "./tracking-firestore";

/**
 * Contractor record — what "Approve onboarding" migrates from WordPress into the ops platform so the
 * WrapStar / JoyRider apps can show the relationship (Uber/DoorDash-style Account tab) without
 * calling WordPress on every page view.
 *
 * Sensitive payout data is summarised only (bank name, account type, last 4). Full routing/account
 * numbers stay in WordPress meta / GCS and are never copied here.
 */
export type ContractorRole = "wrapstar" | "driver";

export type ContractorDocument = {
  key: string;
  label: string;
  /** complete | pending */
  status: "complete" | "pending";
  /** ISO timestamp when known */
  at?: string;
  detail?: string;
};

export type ContractorRecord = {
  /** `${role}:${rosterId}` */
  id: string;
  role: ContractorRole;
  /** Roster id (10-digit WrapStar 8… / JoyRider 7…) */
  rosterId: string;
  /** WordPress application post id */
  applicationId: number;
  wpUserId: number;
  fullName: string;
  greetingName?: string;
  email: string;
  phoneMobile?: string;
  phoneWork?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  /** Application-derived attributes */
  attributes: Record<string, string>;
  documents: ContractorDocument[];
  payout: {
    method?: string;
    holderName?: string;
    bankName?: string;
    accountType?: string;
    accountLast4?: string;
    submittedAt?: string;
  };
  timeline: {
    submittedAt?: string;
    interviewAt?: string;
    approvedAt?: string;
    activatedAt?: string;
  };
  /** Onboarding step completion snapshot at approval time */
  onboardingSteps: Record<string, boolean>;
  /** Last successful sign-in on the contractor portal */
  lastLoginAt?: string;
  loginCount?: number;
  migratedAt: string;
  updatedAt: string;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "contractor-records.json");

type Store = Record<string, ContractorRecord>;

export function contractorRecordId(role: ContractorRole, rosterId: string): string {
  return `${role}:${rosterId}`;
}

async function readFileStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as Store;
  } catch {
    return {};
  }
}

async function writeFileStore(store: Store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(store, null, 2), "utf8");
}

function clean<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = clean(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export async function getContractorRecord(
  role: ContractorRole,
  rosterId: string,
): Promise<ContractorRecord | null> {
  const id = contractorRecordId(role, rosterId);
  const col = trackingContractorRecordsCollection();
  if (col) {
    const snap = await col.doc(id).get();
    return snap.exists ? (snap.data() as ContractorRecord) : null;
  }
  const store = await readFileStore();
  return store[id] ?? null;
}

export async function saveContractorRecord(record: ContractorRecord): Promise<void> {
  const cleaned = clean(record);
  const col = trackingContractorRecordsCollection();
  if (col) {
    await col.doc(record.id).set(cleaned, { merge: true });
    return;
  }
  const store = await readFileStore();
  store[record.id] = { ...(store[record.id] ?? {}), ...cleaned };
  await writeFileStore(store);
}

export async function touchContractorLogin(role: ContractorRole, rosterId: string): Promise<void> {
  const existing = await getContractorRecord(role, rosterId);
  if (!existing) return;
  const now = new Date().toISOString();
  await saveContractorRecord({
    ...existing,
    lastLoginAt: now,
    loginCount: (existing.loginCount ?? 0) + 1,
    updatedAt: now,
  });
}

function yesNo(v: string | undefined): string {
  if (!v) return "";
  return v === "yes" ? "Yes" : v === "no" ? "No" : v;
}

function doc(
  key: string,
  label: string,
  complete: boolean,
  at?: string,
  detail?: string,
): ContractorDocument {
  return clean({
    key,
    label,
    status: complete ? "complete" : "pending",
    at: at || undefined,
    detail: detail || undefined,
  });
}

/** Build the WrapStar contractor record from the WordPress application at activation time. */
export function contractorRecordFromWrapstarApplication(
  app: WrapstarApplication,
  rosterId: string,
  previous?: ContractorRecord | null,
): ContractorRecord {
  const now = new Date().toISOString();
  const ob = app.onboarding ?? {};
  const steps = app.onboardingStepsComplete ?? {};
  const bgClear = ob.bgStatus === "clear";
  const documents: ContractorDocument[] = [
    doc("agreement", "Independent Contractor Agreement", !!steps.agreement),
    doc(
      "policies",
      "WrapStar Standards & Policies",
      !!ob.policiesSignedAt || !!steps.policies,
      ob.policiesSignedAt,
      ob.policiesSignature ? `Signed as ${ob.policiesSignature}` : undefined,
    ),
    doc(
      "orientation",
      "Orientation & Quiz",
      !!steps.orientation,
      undefined,
      ob.orientationScore ? `Score ${ob.orientationScore}` : undefined,
    ),
    doc(
      "background",
      "Background check",
      bgClear,
      ob.bgConsentAt,
      bgClear ? "Clear" : ob.bgConsentAt ? "Authorized · in progress" : undefined,
    ),
    doc(
      "insurance",
      "Proof of insurance",
      !!ob.hasInsuranceFile,
      undefined,
      [ob.insuranceCarrier, ob.insuranceExpires ? `expires ${ob.insuranceExpires}` : ""]
        .filter(Boolean)
        .join(" · ") || undefined,
    ),
    doc("identity", "Identity verification", !!ob.identityConfirmedAt, ob.identityConfirmedAt),
    doc("w9", "W-9", !!steps.w9),
    doc("tax_1099", "Tax acknowledgments (1099)", !!ob.taxAckAt, ob.taxAckAt),
  ];
  const attributes: Record<string, string> = clean({
    "Can deliver": yesNo(app.canDeliver),
    "Has vehicle": yesNo(app.hasVehicle),
    "Delivery range": app.deliveryMaxDistance || "",
    "Large-format printer": yesNo(app.hasLargeFormatPrinter),
    "Printer size": app.hasLargeFormatPrinter === "yes" ? app.printerSize || "" : "",
    "Wrapping location": ob.workspaceAddress || "",
    "Handoff windows": (ob.workspaceWindows || []).join(", "),
    "Business structure": app.businessStructure || "",
  });
  for (const k of Object.keys(attributes)) if (!attributes[k]) delete attributes[k];

  return clean({
    id: contractorRecordId("wrapstar", rosterId),
    role: "wrapstar",
    rosterId,
    applicationId: app.id,
    wpUserId: app.userId,
    fullName: app.fullName || app.email,
    greetingName: app.greetingName || app.nickname || app.firstName || undefined,
    email: app.email.toLowerCase(),
    phoneMobile: app.phoneMobile || undefined,
    phoneWork: app.phoneWork || undefined,
    addressLine1: app.addressLine1 || undefined,
    addressLine2: app.addressLine2 || undefined,
    city: app.city || undefined,
    state: app.state || undefined,
    postalCode: app.postalCode || undefined,
    attributes,
    documents,
    payout: clean({
      method: ob.payoutMethod || undefined,
      holderName: ob.payoutHolderName || undefined,
      bankName: ob.payoutBankName || undefined,
      accountType: ob.payoutAccountType || undefined,
      accountLast4: ob.payoutAccountLast4 || undefined,
      submittedAt: ob.payoutSubmittedAt || undefined,
    }),
    timeline: clean({
      submittedAt: app.submittedAt || undefined,
      interviewAt: app.interviewAt || undefined,
      approvedAt: app.approvedAt || undefined,
      activatedAt: app.activatedAt || now,
    }),
    onboardingSteps: steps,
    lastLoginAt: previous?.lastLoginAt,
    loginCount: previous?.loginCount,
    migratedAt: previous?.migratedAt || now,
    updatedAt: now,
  });
}

/** Build the JoyRider contractor record from the WordPress driver application at activation time. */
export function contractorRecordFromDriverApplication(
  app: DriverApplication,
  rosterId: string,
  previous?: ContractorRecord | null,
): ContractorRecord {
  const now = new Date().toISOString();
  const steps = app.onboardingStepsComplete ?? {};
  const documents: ContractorDocument[] = [
    doc("license", "Driver license", !!app.hasIdFile),
    doc("agreement", "Driver Independent Contractor Agreement", !!steps.agreement),
    doc("policies", "Policies & Safety", !!steps.policies),
    doc("orientation", "Orientation & Quiz", !!steps.orientation),
    doc("background", "Background check", !!steps.background),
    doc("insurance", "Vehicle insurance", !!steps.insurance),
    doc("identity", "Identity & license", !!steps.identity),
    doc("w9", "W-9", !!steps.w9),
    doc("tax_1099", "Tax acknowledgments (1099)", !!steps.tax_1099),
  ];
  const attributes: Record<string, string> = {
    Vehicle: app.vehicleType || "",
    "Has vehicle": yesNo(app.hasVehicle),
    "Valid license": yesNo(app.hasValidLicense),
    "Clean driving record": yesNo(app.cleanDrivingRecord),
    Availability: app.availability || "",
  };
  for (const k of Object.keys(attributes)) if (!attributes[k]) delete attributes[k];

  return clean({
    id: contractorRecordId("driver", rosterId),
    role: "driver",
    rosterId,
    applicationId: app.id,
    wpUserId: app.userId,
    fullName: app.fullName || app.email,
    greetingName: app.greetingName || app.nickname || app.firstName || undefined,
    email: app.email.toLowerCase(),
    phoneMobile: app.phoneMobile || undefined,
    addressLine1: app.addressLine1 || undefined,
    addressLine2: app.addressLine2 || undefined,
    city: app.city || undefined,
    state: app.state || undefined,
    postalCode: app.postalCode || undefined,
    attributes,
    documents,
    payout: clean({
      method: steps.bank_payout ? "connect" : undefined,
    }),
    timeline: clean({
      submittedAt: app.submittedAt || undefined,
      interviewAt: app.interviewAt || undefined,
      approvedAt: app.approvedAt || undefined,
      activatedAt: app.activatedAt || now,
    }),
    onboardingSteps: steps,
    lastLoginAt: previous?.lastLoginAt,
    loginCount: previous?.loginCount,
    migratedAt: previous?.migratedAt || now,
    updatedAt: now,
  });
}
