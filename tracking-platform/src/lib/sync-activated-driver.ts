import { metroForPostalCode } from "./metros";
import type { DriverApplication } from "./driver-applications-admin";
import {
  addDeliveryDriver,
  findDeliveryDriverByEmail,
  updateDeliveryDriver,
} from "./driver-registry";

/** After WP Activate: ensure DeliveryDriver ops roster has this courier. */
export async function syncActivatedApplicationToDriverRoster(
  app: DriverApplication,
): Promise<{ ok: true; driverId: string } | { ok: false; error: string }> {
  const metro = metroForPostalCode(app.postalCode);
  const existing = await findDeliveryDriverByEmail(app.email);
  const notes = `Activated from Driver application #${app.id}`;

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
    return { ok: true, driverId: existing.id };
  }

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
  return { ok: true, driverId: created.driver.id };
}
