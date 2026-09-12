import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AdminPrinterCoverage } from "@/components/admin-printer-coverage";
import { WrrapdLogo } from "@/components/wrrapd-logo";
import { getSession } from "@/lib/auth";
import {
  checkPrinterCoverageZip,
  fetchPrinterCoverageReport,
  removePrinterSite,
  setPrinterCoverageRadius,
  setPrinterSiteActive,
  syncRosterPrinterSites,
  upsertPrinterSite,
  type PrinterCoverageReport,
} from "@/lib/printer-coverage-admin";
import { listRegisteredWrapstars } from "@/lib/wrapstar-registry";
import { readWrapstarProfiles } from "@/lib/wrapstar-profiles";

export const dynamic = "force-dynamic";

type ReportResult = { ok: true; report: PrinterCoverageReport } | { ok: false; error: string };

async function guard(): Promise<string | null> {
  const session = await getSession();
  if (!session || session.role !== "admin") return "Unauthorized";
  return null;
}

function fail(e: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false as const, error: e instanceof Error ? e.message : fallback };
}

async function syncRosterAction(): Promise<ReportResult> {
  "use server";
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  try {
    const report = await syncRosterPrinterSites();
    revalidatePath("/admin/printer-coverage");
    return { ok: true, report };
  } catch (e) {
    return fail(e, "Failed to sync roster printer sites");
  }
}

async function upsertAction(input: {
  id?: string;
  name: string;
  postalCode: string;
  printerSize?: string;
  notes?: string;
}): Promise<ReportResult> {
  "use server";
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  try {
    const report = await upsertPrinterSite({ ...input, source: "manual", active: true });
    revalidatePath("/admin/printer-coverage");
    return { ok: true, report };
  } catch (e) {
    return fail(e, "Failed to save printer site");
  }
}

async function removeAction(id: string): Promise<ReportResult> {
  "use server";
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  try {
    const report = await removePrinterSite(id);
    revalidatePath("/admin/printer-coverage");
    return { ok: true, report };
  } catch (e) {
    return fail(e, "Failed to remove printer site");
  }
}

async function setActiveAction(id: string, active: boolean): Promise<ReportResult> {
  "use server";
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  try {
    const report = await setPrinterSiteActive(id, active);
    revalidatePath("/admin/printer-coverage");
    return { ok: true, report };
  } catch (e) {
    return fail(e, "Failed to update printer site");
  }
}

async function setRadiusAction(radiusMiles: number): Promise<ReportResult> {
  "use server";
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  try {
    const report = await setPrinterCoverageRadius(radiusMiles);
    revalidatePath("/admin/printer-coverage");
    return { ok: true, report };
  } catch (e) {
    return fail(e, "Failed to set coverage radius");
  }
}

async function checkAction(zip: string) {
  "use server";
  const denied = await guard();
  if (denied) return { ok: false as const, error: denied };
  try {
    const result = await checkPrinterCoverageZip(zip);
    return { ok: true as const, result };
  } catch (e) {
    return fail(e, "Failed to check ZIP");
  }
}

export default async function AdminPrinterCoveragePage() {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();

  let initial: PrinterCoverageReport | null = null;
  let loadError: string | null = null;
  try {
    initial = await fetchPrinterCoverageReport();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Failed to load printer coverage";
  }

  // Roster context: WrapStars flagged with a printer and whether they're approved yet.
  let rosterPrinters: Array<{ id: string; name: string; homePostalCode: string; printerSize?: string; status: string }> = [];
  try {
    const [wrapstars, profiles] = await Promise.all([listRegisteredWrapstars(), readWrapstarProfiles()]);
    rosterPrinters = wrapstars
      .filter((w) => w.hasPrinter === true)
      .map((w) => ({
        id: w.id,
        name: w.name,
        homePostalCode: w.homePostalCode,
        printerSize: w.printerSize,
        status: profiles[w.id]?.onboardingStatus ?? "pending",
      }));
  } catch {
    /* roster unavailable — page still works from the pay-server report */
  }

  return (
    <div className="mx-auto max-w-6xl">
      <WrrapdLogo className="mt-2 h-10 w-auto max-w-[180px] object-contain object-left" />
      <h1 className="mt-2 text-3xl font-semibold">Custom-design coverage</h1>
      <p className="mt-1 text-sm text-slate-600">
        “Upload my own design” and “Generate a design with AI” only appear in the Wrrapd gift modal when an
        approved WrapStar with a large-format printer sits within the coverage radius of the giftee ZIP.
        Printer flags come from the apply form (
        <Link href="/admin/applications?status=all" className="font-medium text-blue-700 underline">
          Applications
        </Link>
        ) and the{" "}
        <Link href="/admin/wrapstars" className="font-medium text-blue-700 underline">
          WrapStars
        </Link>{" "}
        roster; the pay server (api.wrrapd.com) answers the shopper-facing question.
      </p>

      {loadError && (
        <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Could not load coverage: {loadError}. Ensure{" "}
          <code className="rounded bg-red-100 px-1">WRRAPD_ADMIN_API_KEY</code> matches on the tracking platform
          and pay server, and that <code className="rounded bg-red-100 px-1">wrrapd-server</code> was restarted
          with the printer-coverage endpoints.
        </p>
      )}

      {initial ? (
        <AdminPrinterCoverage
          initial={initial}
          rosterPrinters={rosterPrinters}
          onSyncRoster={syncRosterAction}
          onUpsert={upsertAction}
          onRemove={removeAction}
          onSetActive={setActiveAction}
          onSetRadius={setRadiusAction}
          onCheck={checkAction}
        />
      ) : null}
    </div>
  );
}
