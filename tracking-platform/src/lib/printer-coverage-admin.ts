/**
 * Custom-design (printed wrapping paper) coverage — Command Center client for the
 * pay server's `/api/admin/printer-sites*` endpoints.
 *
 * Source of truth for "is upload / AI design available for this giftee ZIP?" lives on
 * api.wrrapd.com (the extension calls it from `/api/pricing-preview`). This module lets
 * the Command Center manage printer sites and keep them in sync with the WrapStar roster.
 */
import { listRegisteredWrapstars } from "./wrapstar-registry";
import { readWrapstarProfiles } from "./wrapstar-profiles";

import {
  printerSizeLabel,
  type PrinterCoverageReport,
  type PrinterZipCheck,
} from "./printer-coverage-shared";

// Client-safe types/constants live in ./printer-coverage-shared (no firebase-admin there).
export * from "./printer-coverage-shared";

function apiBase(): string {
  return (process.env.WRRAPD_API_BASE_URL || "https://api.wrrapd.com").replace(/\/$/, "");
}

function adminHeaders(): HeadersInit {
  const key = (process.env.WRRAPD_ADMIN_API_KEY || "").trim();
  if (!key) {
    throw new Error("WRRAPD_ADMIN_API_KEY is not set on the tracking platform");
  }
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function parseReport(r: Response): Promise<PrinterCoverageReport> {
  const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `HTTP ${r.status}`);
  }
  if (!body.report || typeof body.report !== "object") {
    throw new Error("Pay server returned no coverage report");
  }
  return body.report as PrinterCoverageReport;
}

export async function fetchPrinterCoverageReport(): Promise<PrinterCoverageReport> {
  const r = await fetch(`${apiBase()}/api/admin/printer-sites`, {
    headers: adminHeaders(),
    cache: "no-store",
  });
  return parseReport(r);
}

export async function upsertPrinterSite(input: {
  id?: string;
  wrapstarId?: string | null;
  name: string;
  postalCode: string;
  printerSize?: string;
  printerModel?: string;
  active?: boolean;
  source?: "roster" | "manual";
  notes?: string;
}): Promise<PrinterCoverageReport> {
  const r = await fetch(`${apiBase()}/api/admin/printer-sites/upsert`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(input),
  });
  return parseReport(r);
}

export async function removePrinterSite(id: string): Promise<PrinterCoverageReport> {
  const r = await fetch(`${apiBase()}/api/admin/printer-sites/remove`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ id }),
  });
  return parseReport(r);
}

export async function setPrinterSiteActive(id: string, active: boolean): Promise<PrinterCoverageReport> {
  const r = await fetch(`${apiBase()}/api/admin/printer-sites/active`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ id, active }),
  });
  return parseReport(r);
}

export async function setPrinterCoverageRadius(radiusMiles: number): Promise<PrinterCoverageReport> {
  const r = await fetch(`${apiBase()}/api/admin/printer-sites/radius`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ radiusMiles }),
  });
  return parseReport(r);
}

export async function checkPrinterCoverageZip(postalCode: string): Promise<PrinterZipCheck> {
  const u = new URL(`${apiBase()}/api/admin/printer-sites/check`);
  u.searchParams.set("postalCode", postalCode);
  const r = await fetch(u.toString(), { headers: adminHeaders(), cache: "no-store" });
  const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `HTTP ${r.status}`);
  }
  return body.result as PrinterZipCheck;
}

/**
 * Build roster printer sites from approved WrapStars who own a printer and push them to
 * the pay server (replaces roster-sourced sites; manual sites are preserved).
 */
export async function syncRosterPrinterSites(): Promise<PrinterCoverageReport> {
  const [wrapstars, profiles] = await Promise.all([listRegisteredWrapstars(), readWrapstarProfiles()]);
  const sites = wrapstars
    .filter((w) => w.hasPrinter === true && w.homePostalCode?.length === 5)
    .map((w) => {
      const approved = (profiles[w.id]?.onboardingStatus ?? "pending") === "approved";
      return {
        id: `ws-${w.id}`,
        wrapstarId: w.id,
        name: w.name,
        postalCode: w.homePostalCode,
        printerSize: w.printerSize || "",
        printerLabel: printerSizeLabel(w.printerSize),
        // Only approved WrapStars turn custom design on; others are listed but paused.
        active: approved ? undefined : false,
        source: "roster" as const,
        notes: approved ? "" : `Onboarding: ${profiles[w.id]?.onboardingStatus ?? "pending"}`,
      };
    });
  const r = await fetch(`${apiBase()}/api/admin/printer-sites/roster`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({
      sites,
      notes: `Roster sync ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC — ${sites.length} WrapStar printer site(s).`,
    }),
  });
  return parseReport(r);
}

/** Fire-and-forget variant for activation / profile-save hooks (never throws). */
export async function trySyncRosterPrinterSites(context: string): Promise<void> {
  try {
    await syncRosterPrinterSites();
  } catch (e) {
    console.warn(`[printer-coverage] roster sync skipped (${context}):`, e instanceof Error ? e.message : e);
  }
}
