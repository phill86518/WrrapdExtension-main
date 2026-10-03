import { promises as fs } from "fs";
import path from "path";
import type { ContractorPayRole } from "./hourly-rates";
import { formatUsdCents } from "./finance";
import { listWeeklyPayLines, type WeeklyPayLine } from "./weekly-pay";
import { trackingTaxStatementsCollection } from "./tracking-firestore";
import { listRegisteredWrapstars } from "./wrapstar-registry";
import { listDeliveryDrivers } from "./driver-registry";
import { listWrapriders } from "./wraprider-registry";
import { sendTransactionalEmail } from "./customer-notify";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "tax-statements.json");

/** IRS 1099-NEC is required when nonemployee compensation paid in the year is at least this amount. */
export const NEC_THRESHOLD_CENTS = 60000;

export type TaxStatementRecord = {
  id: string;
  year: number;
  contractorId: string;
  role: ContractorPayRole;
  name: string;
  email?: string;
  grossCents: number;
  weekCount: number;
  form: "1099-NEC";
  emailedAt?: string;
  mailedAt?: string;
  updatedAt: string;
};

export type YearPaySummary = {
  year: number;
  paidCents: number;
  weekCount: number;
  lines: WeeklyPayLine[];
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function payYear(line: WeeklyPayLine): number | null {
  if (line.status !== "paid" && line.status !== "transferred") return null;
  const stamp = line.updatedAt || line.weekEnd;
  const year = Number(String(stamp).slice(0, 4));
  return Number.isInteger(year) && year >= 2000 ? year : null;
}

export function summarizeYears(lines: WeeklyPayLine[], now = new Date()): {
  ytdCents: number;
  lastYearCents: number;
  years: YearPaySummary[];
} {
  const current = now.getFullYear();
  const byYear = new Map<number, WeeklyPayLine[]>();
  for (const line of lines) {
    const year = payYear(line);
    if (!year) continue;
    const list = byYear.get(year) || [];
    list.push(line);
    byYear.set(year, list);
  }
  const years = [...byYear.entries()]
    .map(([year, rows]) => {
      rows.sort((a, b) => b.weekEnd.localeCompare(a.weekEnd));
      return {
        year,
        paidCents: rows.reduce((s, row) => s + row.amountCents, 0),
        weekCount: rows.length,
        lines: rows,
      };
    })
    .sort((a, b) => b.year - a.year);
  return {
    ytdCents: years.find((y) => y.year === current)?.paidCents || 0,
    lastYearCents: years.find((y) => y.year === current - 1)?.paidCents || 0,
    years,
  };
}

export async function payHistoryForContractor(contractorId: string, allLines?: WeeklyPayLine[]) {
  const lines = (allLines || (await listWeeklyPayLines())).filter((line) => line.contractorId === contractorId);
  return summarizeYears(lines);
}

export type ContractorPayPerson = {
  contractorId: string;
  name: string;
  role: ContractorPayRole;
  email?: string;
};

export async function listContractorPayPeople(): Promise<ContractorPayPerson[]> {
  const [wrapstars, drivers, wrapriders] = await Promise.all([
    listRegisteredWrapstars(),
    listDeliveryDrivers(),
    listWrapriders(),
  ]);
  const people: ContractorPayPerson[] = [];
  for (const person of wrapriders) {
    people.push({
      contractorId: person.id,
      name: person.name,
      role: "wraprider",
      email: person.email,
    });
  }
  for (const person of wrapstars) {
    if (person.hireRole === "wraprider") continue;
    people.push({
      contractorId: person.id,
      name: person.name,
      role: "wrapstar",
      email: person.email,
    });
  }
  for (const person of drivers) {
    if (person.hireRole === "wraprider") continue;
    people.push({
      contractorId: person.id,
      name: person.name,
      role: "joyrider",
      email: person.email,
    });
  }
  people.sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
  return people;
}

export function statementId(year: number, contractorId: string): string {
  return `${year}-${contractorId}`;
}

async function readLocal(): Promise<Record<string, TaxStatementRecord>> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, TaxStatementRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeLocal(map: Record<string, TaxStatementRecord>) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(map, null, 2));
}

export async function listTaxStatements(): Promise<TaxStatementRecord[]> {
  const col = trackingTaxStatementsCollection();
  if (col) {
    const snap = await col.get();
    return snap.docs.map((doc) => doc.data() as TaxStatementRecord);
  }
  return Object.values(await readLocal());
}

async function saveTaxStatement(row: TaxStatementRecord): Promise<void> {
  const col = trackingTaxStatementsCollection();
  if (col) {
    await col.doc(row.id).set(row);
    return;
  }
  const map = await readLocal();
  map[row.id] = row;
  await writeLocal(map);
}

export async function upsertTaxStatement(input: {
  year: number;
  contractorId: string;
}): Promise<TaxStatementRecord | null> {
  const people = await listContractorPayPeople();
  const person = people.find((p) => p.contractorId === input.contractorId);
  if (!person) return null;
  const history = await payHistoryForContractor(input.contractorId);
  const year = history.years.find((y) => y.year === input.year);
  const existing = (await listTaxStatements()).find((row) => row.id === statementId(input.year, input.contractorId));
  const row: TaxStatementRecord = {
    id: statementId(input.year, input.contractorId),
    year: input.year,
    contractorId: input.contractorId,
    role: person.role,
    name: person.name,
    email: person.email,
    grossCents: year?.paidCents || 0,
    weekCount: year?.weekCount || 0,
    form: "1099-NEC",
    emailedAt: existing?.emailedAt,
    mailedAt: existing?.mailedAt,
    updatedAt: new Date().toISOString(),
  };
  await saveTaxStatement(row);
  return row;
}

export function statementHtml(input: {
  name: string;
  role: string;
  year: number;
  grossCents: number;
  lines: WeeklyPayLine[];
}): string {
  const rows = input.lines
    .map(
      (line) =>
        `<tr><td>${esc(line.weekStart)} – ${esc(line.weekEnd)}</td><td>${esc(line.status)}</td><td style="text-align:right">${esc(formatUsdCents(line.amountCents))}</td></tr>`,
    )
    .join("");
  const required = input.grossCents >= NEC_THRESHOLD_CENTS;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${input.year} pay statement</title>
<style>
  body { font-family: Georgia, serif; color: #111; margin: 32px; }
  h1 { font-size: 22px; margin-bottom: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  td, th { border-bottom: 1px solid #ddd; padding: 6px 4px; font-size: 14px; text-align: left; }
  .total { font-size: 20px; margin-top: 16px; }
  .note { font-size: 13px; color: #333; margin-top: 16px; max-width: 640px; }
  @media print { body { margin: 0.5in; } }
</style></head><body>
<h1>Wrrapd ${input.year} pay statement</h1>
<p>${esc(input.name)} · ${esc(input.role)}</p>
<p class="total">Paid in ${input.year}: ${esc(formatUsdCents(input.grossCents))}</p>
<table>
  <thead><tr><th>Pay week</th><th>Status</th><th>Amount</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="3">No payouts recorded for ${input.year}.</td></tr>`}</tbody>
</table>
<p class="note">${
    required
      ? `This copy is for your records. Nonemployee compensation of ${esc(formatUsdCents(input.grossCents))} meets the threshold for a Form 1099-NEC. Wrrapd keeps this statement for the year. It is not an IRS filing receipt.`
      : `This copy is for your records. The amount paid in ${input.year} is under the Form 1099-NEC threshold. Wrrapd still keeps this statement.`
  }</p>
</body></html>`;
}

export async function emailTaxStatement(input: {
  year: number;
  contractorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await upsertTaxStatement(input);
  if (!row) return { ok: false, error: "Contractor not found." };
  if (!row.email) return { ok: false, error: "This contractor has no email on file." };
  const history = await payHistoryForContractor(input.contractorId);
  const year = history.years.find((y) => y.year === input.year);
  const html = statementHtml({
    name: row.name,
    role: row.role,
    year: input.year,
    grossCents: row.grossCents,
    lines: year?.lines || [],
  });
  const sent = await sendTransactionalEmail({
    to: row.email,
    subject: `Your ${input.year} Wrrapd pay statement`,
    html,
  });
  if (!sent) return { ok: false, error: "Email could not be sent." };
  row.emailedAt = new Date().toISOString();
  row.updatedAt = row.emailedAt;
  await saveTaxStatement(row);
  return { ok: true };
}

export async function markTaxStatementMailed(input: {
  year: number;
  contractorId: string;
}): Promise<TaxStatementRecord | null> {
  const row = await upsertTaxStatement(input);
  if (!row) return null;
  row.mailedAt = new Date().toISOString();
  row.updatedAt = row.mailedAt;
  await saveTaxStatement(row);
  return row;
}
