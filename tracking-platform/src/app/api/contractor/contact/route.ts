import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getContractorRecord, saveContractorRecord } from "@/lib/contractor-records";
import { updatePortalContact, type PortalContactFields } from "@/lib/wp-portal-account";

const FIELDS: (keyof PortalContactFields)[] = [
  "nickname",
  "phoneMobile",
  "phoneWork",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
];

/**
 * Active WrapStar / JoyRider updates phone + mailing address from inside the portal app.
 * Writes to the WordPress application (source of truth) and mirrors onto the contractor record.
 * Email (the login) is not editable here.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "wrapstar" && session.role !== "driver")) {
    return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const fields: PortalContactFields = {};
  for (const key of FIELDS) {
    if (typeof body[key] === "string") {
      fields[key] = (body[key] as string).trim().slice(0, 160);
    }
  }
  if (fields.state) fields.state = fields.state.toUpperCase().slice(0, 2);
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to save." }, { status: 400 });
  }

  const record = await getContractorRecord(session.role, session.userId).catch(() => null);
  if (!record?.email) {
    return NextResponse.json(
      { ok: false, error: "Your account record is not ready yet. Please contact Wrrapd support." },
      { status: 409 },
    );
  }

  const result = await updatePortalContact(record.email, session.role, fields);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status === 400 || result.status === 403 ? result.status : 502 },
    );
  }

  const contact = result.contact || fields;
  const now = new Date().toISOString();
  await saveContractorRecord({
    ...record,
    greetingName: contact.nickname || record.greetingName,
    phoneMobile: contact.phoneMobile ?? record.phoneMobile,
    phoneWork: contact.phoneWork ?? record.phoneWork,
    addressLine1: contact.addressLine1 ?? record.addressLine1,
    addressLine2: contact.addressLine2 ?? record.addressLine2,
    city: contact.city ?? record.city,
    state: contact.state ?? record.state,
    postalCode: contact.postalCode ?? record.postalCode,
    updatedAt: now,
  }).catch((err) => console.error("[contractor/contact] record mirror failed", err));

  return NextResponse.json({ ok: true, contact });
}
