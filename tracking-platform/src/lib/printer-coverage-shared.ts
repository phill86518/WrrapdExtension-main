/**
 * Client-safe types + constants for custom-design (printer) coverage.
 * No server imports here — this file is bundled into "use client" components.
 */

export type PrinterSite = {
  id: string;
  wrapstarId: string | null;
  name: string;
  postalCode: string;
  printerSize: string;
  /** Free-text machine, e.g. "Epson SureColor P6570D" */
  printerModel: string;
  printerLabel: string;
  active: boolean;
  source: "roster" | "manual";
  notes: string;
  updatedAt: string;
};

export type PrinterSiteReportRow = PrinterSite & {
  geo: { zip: string; state: string; county: string } | null;
  knownCentroid: boolean;
  coveredZipCount: number;
  coveredZips: Array<{ zip: string; distanceMiles: number; county: string | null; state: string | null }>;
};

export type PrinterZipChip = {
  postalCode: string;
  geo: { zip: string; state: string; county: string } | null;
  siteIds: string[];
  activeCount: number;
};

export type PrinterCoverageReport = {
  radiusMiles: number;
  updatedAt: string | null;
  notes: string | null;
  siteCount: number;
  activeSiteCount: number;
  coveredZipCount: number;
  coveredZips: string[];
  printerZips: PrinterZipChip[];
  sites: PrinterSiteReportRow[];
  printerSizeLabels: Record<string, string>;
  centroids: { version: string | null; source: string | null; zipCount: number };
};

export type PrinterZipCheck = {
  postalCode: string;
  available: boolean;
  radiusMiles: number;
  sites: Array<{
    id: string;
    wrapstarId: string | null;
    name: string;
    postalCode: string;
    printerSize: string;
    printerModel?: string;
    printerLabel: string;
    distanceMiles: number;
  }>;
  nearestOutOfRange: {
    id: string;
    name: string;
    postalCode: string;
    printerModel?: string;
    printerLabel: string;
    distanceMiles: number;
  } | null;
  geo: { zip: string; state: string; county: string } | null;
  knownCentroid: boolean;
};

/** Matches WordPress `wrrapd_wrapstars_printer_size_options()` and the pay server. */
export const PRINTER_SIZE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "under24", label: "Under 24 inches" },
  { value: "24", label: "24 inches" },
  { value: "36", label: "36 inches" },
  { value: "44plus", label: "44 inches or larger" },
];

export function printerSizeLabel(size?: string | null): string {
  const key = String(size || "").trim();
  if (!key) return "";
  return PRINTER_SIZE_OPTIONS.find((o) => o.value === key)?.label || key;
}

/** "Epson SureColor P6570D · 24 inches" style summary for popups and tables. */
export function printerSummary(site: { printerModel?: string; printerLabel?: string }): string {
  return [site.printerModel, site.printerLabel].filter(Boolean).join(" · ");
}
