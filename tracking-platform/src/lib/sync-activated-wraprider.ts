import { metroForPostalCode } from "./metros";
import type { WrapriderApplication } from "./wraprider-applications-admin";
import { addWraprider, findWrapriderByEmail, updateWraprider } from "./wraprider-registry";
import { addWrapstar, findWrapstarByEmail, updateWrapstar } from "./wrapstar-registry";
import { setOnboardingStatus } from "./wrapstar-profiles";
import {
  addDeliveryDriver,
  findDeliveryDriverByEmail,
  updateDeliveryDriver,
} from "./driver-registry";
import { trySyncRosterPrinterSites } from "./printer-coverage-admin";
import {
  contractorRecordFromWrapriderApplication,
  getContractorRecord,
  saveContractorRecord,
} from "./contractor-records";

/**
 * After Command Center "Approve onboarding" on a WrapRider application (WP `activate` on the
 * WrapRider CPT):
 *
 *  1. Put them on the WrapRiders board (own roster, IDs prefix 6) — their Command Center home and
 *     the id their WrapRider App session (wraprider.wrrapd.com) is issued for.
 *  2. Create hidden CAPACITY rows on the WrapStar roster (8…) and DeliveryDriver roster (7…), both
 *     tagged `hireRole: "wraprider"`. These exist only so order allocation can hand them wrap
 *     jobs and deliveries — they are NOT logins: the WrapStar and JoyRider apps refuse them, and
 *     `/admin/wrapstars` / `/admin/drivers` filter them out.
 *  3. Migrate the contractor record under the WrapRider id (`wraprider:6…`) — the only record the
 *     WrapRider App reads.
 */
export async function syncActivatedApplicationToWrapriderRoster(
  app: WrapriderApplication,
  opts?: { hourlyRateCents?: number },
): Promise<{ ok: true; wrapriderId: string } | { ok: false; error: string }> {
  const metro = metroForPostalCode(app.postalCode);
  const hasVehicle = app.hasVehicle === "yes";
  const hasPrinter = app.hasLargeFormatPrinter === "yes";
  const printerSize = hasPrinter ? app.printerSize || undefined : undefined;
  const notes = `Activated from WrapRider application #${app.id}`;
  const rate =
    typeof opts?.hourlyRateCents === "number" && opts.hourlyRateCents > 0
      ? Math.round(opts.hourlyRateCents)
      : undefined;

  // 1. WrapRiders board row (prefix 6).
  let wrapriderId: string;
  const existingWr = await findWrapriderByEmail(app.email);
  if (existingWr) {
    const updated = await updateWraprider(existingWr.id, {
      name: app.fullName || existingWr.name,
      homePostalCode: app.postalCode || existingWr.homePostalCode,
      email: app.email,
      phone: app.phoneMobile || existingWr.phone,
      metroId: metro?.id,
      status: "approved",
      applicationId: app.id,
      vehicleType: app.vehicleType || existingWr.vehicleType,
      hasPrinter,
      printerSize,
      notes: existingWr.notes ? `${existingWr.notes} · ${notes}` : notes,
      ...(rate ? { hourlyRateCents: rate } : {}),
    });
    if (!updated.ok) return updated;
    wrapriderId = existingWr.id;
  } else {
    const created = await addWraprider({
      name: app.fullName || app.email,
      homePostalCode: app.postalCode,
      email: app.email,
      phone: app.phoneMobile,
      metroId: metro?.id,
      status: "approved",
      applicationId: app.id,
      vehicleType: app.vehicleType || undefined,
      hasPrinter,
      printerSize,
      notes,
      ...(rate ? { hourlyRateCents: rate } : {}),
    });
    if (!created.ok) return created;
    wrapriderId = created.wraprider.id;
  }

  // 2a. Wrap CAPACITY row (WrapStar roster, hidden from /admin/wrapstars; not a login).
  let wrapstarId: string | undefined;
  try {
    const existingWs = await findWrapstarByEmail(app.email);
    if (existingWs) {
      const r = await updateWrapstar(existingWs.id, {
        name: app.fullName || existingWs.name,
        homePostalCode: app.postalCode || existingWs.homePostalCode,
        email: app.email,
        phone: app.phoneMobile || existingWs.phone,
        canDeliver: true,
        wrapOnly: false,
        hasVehicle,
        deliveryMaxDistance: app.deliveryMaxDistance || undefined,
        metroId: metro?.id,
        hasPrinter,
        printerSize: printerSize ?? "",
        hireRole: "wraprider",
        wrapriderId,
        ...(rate ? { hourlyRateCents: rate } : {}),
      });
      if (r.ok) wrapstarId = existingWs.id;
      else console.error("[activate wraprider] wrap-app row update failed", r.error);
    } else {
      const r = await addWrapstar({
        name: app.fullName || app.email,
        homePostalCode: app.postalCode,
        email: app.email,
        phone: app.phoneMobile,
        canDeliver: true,
        wrapOnly: false,
        hasVehicle,
        deliveryMaxDistance: app.deliveryMaxDistance || undefined,
        metroId: metro?.id,
        hasPrinter,
        printerSize,
        hireRole: "wraprider",
        wrapriderId,
        ...(rate ? { hourlyRateCents: rate } : {}),
      });
      if (r.ok) wrapstarId = r.wrapstar.id;
      else console.error("[activate wraprider] wrap-app row create failed", r.error);
    }
    if (wrapstarId) await setOnboardingStatus(wrapstarId, "approved", notes);
  } catch (err) {
    console.error("[activate wraprider] wrap-app roster sync failed", err);
  }

  // 2b. Delivery CAPACITY row (DeliveryDriver roster, hidden from /admin/drivers; not a login).
  let courierDriverId: string | undefined;
  try {
    const existingDrv = await findDeliveryDriverByEmail(app.email);
    if (existingDrv) {
      const r = await updateDeliveryDriver(existingDrv.id, {
        name: app.fullName || existingDrv.name,
        homePostalCode: app.postalCode || existingDrv.homePostalCode,
        email: app.email,
        phone: app.phoneMobile || existingDrv.phone,
        metroId: metro?.id,
        status: "approved",
        hireRole: "wraprider",
        wrapriderId,
        notes: existingDrv.notes ? `${existingDrv.notes} · ${notes}` : notes,
        ...(rate ? { hourlyRateCents: rate } : {}),
      });
      if (r.ok) courierDriverId = existingDrv.id;
      else console.error("[activate wraprider] courier-app row update failed", r.error);
    } else {
      const r = await addDeliveryDriver({
        name: app.fullName || app.email,
        homePostalCode: app.postalCode,
        email: app.email,
        phone: app.phoneMobile,
        metroId: metro?.id,
        status: "approved",
        hireRole: "wraprider",
        wrapriderId,
        notes,
        ...(rate ? { hourlyRateCents: rate } : {}),
      });
      if (r.ok) courierDriverId = r.driver.id;
      else console.error("[activate wraprider] courier-app row create failed", r.error);
    }
  } catch (err) {
    console.error("[activate wraprider] courier-app roster sync failed", err);
  }

  // Link both app ids back onto the WrapRider row.
  if (wrapstarId || courierDriverId) {
    const linked = await updateWraprider(wrapriderId, {
      ...(wrapstarId ? { wrapstarId } : {}),
      ...(courierDriverId ? { courierDriverId } : {}),
    });
    if (!linked.ok) console.error("[activate wraprider] link ids failed", linked.error);
  }

  // 3. Contractor record under the WrapRider's own id — what the WrapRider App shows.
  try {
    const previous = await getContractorRecord("wraprider", wrapriderId);
    await saveContractorRecord(
      contractorRecordFromWrapriderApplication(app, "wraprider", wrapriderId, wrapriderId, previous),
    );
  } catch (err) {
    console.error("[activate wraprider] contractor record migration failed", err);
  }

  // Printer coverage follows the WrapStar roster row (same as wrap-only WrapStars).
  if (wrapstarId && hasPrinter) {
    await trySyncRosterPrinterSites(`activate wraprider #${app.id}`);
  }
  return { ok: true, wrapriderId };
}
