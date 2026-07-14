import { metroForPostalCode } from "./metros";
import type { WrapstarApplication } from "./wrapstar-applications-admin";
import { addWrapstar, findWrapstarByEmail, updateWrapstar } from "./wrapstar-registry";
import { setOnboardingStatus } from "./wrapstar-profiles";

/** After WP Activate: ensure ops WrapStar roster has this person with delivery flags. */
export async function syncActivatedApplicationToOpsRoster(
  app: WrapstarApplication,
): Promise<{ ok: true; wrapstarId: string } | { ok: false; error: string }> {
  const canDeliver = app.canDeliver === "yes";
  const hasVehicle = app.hasVehicle === "yes";
  const metro = metroForPostalCode(app.postalCode);
  const existing = await findWrapstarByEmail(app.email);

  if (existing) {
    const updated = await updateWrapstar(existing.id, {
      name: app.fullName || existing.name,
      homePostalCode: app.postalCode || existing.homePostalCode,
      email: app.email,
      phone: app.phoneMobile || existing.phone,
      canDeliver,
      wrapOnly: !canDeliver,
      hasVehicle,
      deliveryMaxDistance: app.deliveryMaxDistance || undefined,
      metroId: metro?.id,
    });
    if (!updated.ok) return updated;
    await setOnboardingStatus(existing.id, "approved", `Activated from application #${app.id}`);
    return { ok: true, wrapstarId: existing.id };
  }

  const created = await addWrapstar({
    name: app.fullName || app.email,
    homePostalCode: app.postalCode,
    email: app.email,
    phone: app.phoneMobile,
    canDeliver,
    wrapOnly: !canDeliver,
    hasVehicle,
    deliveryMaxDistance: app.deliveryMaxDistance || undefined,
    metroId: metro?.id,
  });
  if (!created.ok) return created;
  await setOnboardingStatus(created.wrapstar.id, "approved", `Activated from application #${app.id}`);
  return { ok: true, wrapstarId: created.wrapstar.id };
}
