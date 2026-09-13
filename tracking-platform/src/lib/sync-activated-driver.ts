import { metroForPostalCode } from "./metros";
import type { DriverApplication } from "./driver-applications-admin";
import {
  addDeliveryDriver,
  findDeliveryDriverByEmail,
  updateDeliveryDriver,
} from "./driver-registry";
import {
  contractorRecordFromDriverApplication,
  getContractorRecord,
  saveContractorRecord,
} from "./contractor-records";

/**
 * After Command Center "Approve onboarding" (WP `activate`): ensure the DeliveryDriver ops roster
 * has this JoyRider and migrate the contractor record for joyrider.wrrapd.com.
 */
export async function syncActivatedApplicationToDriverRoster(
  app: DriverApplication,
): Promise<{ ok: true; driverId: string } | { ok: false; error: string }> {
  const metro = metroForPostalCode(app.postalCode);
  const existing = await findDeliveryDriverByEmail(app.email);
  const notes = `Activated from JoyRider application #${app.id}`;

  let driverId: string;
  if (existing) {
    const updated = await updateDeliveryDriver(existing.id, {
      name: app.fullName || existing.name,
      homePostalCode: app.postalCode || existing.homePostalCode,
      email: app.email,
      phone: app.phoneMobile || existing.phone,
      metroId: metro?.id,
      status: "approved",
      notes: existing.notes ? `${existing.notes} · ${notes}` : notes,
    });
    if (!updated.ok) return updated;
    driverId = existing.id;
  } else {
    const created = await addDeliveryDriver({
      name: app.fullName || app.email,
      homePostalCode: app.postalCode,
      email: app.email,
      phone: app.phoneMobile,
      metroId: metro?.id,
      status: "approved",
      notes,
    });
    if (!created.ok) return created;
    driverId = created.driver.id;
  }

  try {
    const previous = await getContractorRecord("driver", driverId);
    await saveContractorRecord(contractorRecordFromDriverApplication(app, driverId, previous));
  } catch (err) {
    console.error("[activate] JoyRider contractor record migration failed", err);
  }
  return { ok: true, driverId };
}
