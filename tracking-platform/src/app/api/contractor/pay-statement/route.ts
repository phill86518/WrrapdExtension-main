import { getSession } from "@/lib/auth";
import { payHistoryForContractor, statementHtml, listContractorPayPeople } from "@/lib/contractor-pay-history";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Sign in required.", { status: 401 });
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  const requested = String(url.searchParams.get("contractorId") || session.userId || "");
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return new Response("Choose a calendar year.", { status: 400 });
  }
  if (session.role !== "admin" && requested !== session.userId) {
    return new Response("That statement belongs to someone else.", { status: 403 });
  }
  const people = await listContractorPayPeople();
  const person = people.find((p) => p.contractorId === requested);
  if (!person) return new Response("Contractor not found.", { status: 404 });
  const history = await payHistoryForContractor(requested);
  const bucket = history.years.find((y) => y.year === year);
  const html = statementHtml({
    name: person.name,
    role: person.role,
    year,
    grossCents: bucket?.paidCents || 0,
    lines: bucket?.lines || [],
  });
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
