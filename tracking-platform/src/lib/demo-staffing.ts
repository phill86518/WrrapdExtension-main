import { metroForPostalCode } from "./metros";
import {
  DEMO_DRIVER_ATL_ID,
  DEMO_DRIVER_JAX_ID,
  ensureDemoDeliveryDrivers,
} from "./driver-registry";
import { ensureDemoWrapstarApprovals } from "./wrapstar-profiles";
import { demoTaylorWrapstarId } from "./wrapstar-registry";

/** Seed demo WrapStars/Drivers used by Command Center dropdowns. */
export async function ensureDemoStaffing(): Promise<void> {
  await Promise.all([ensureDemoWrapstarApprovals(), ensureDemoDeliveryDrivers()]);
}

export function defaultDemoWrapstarId(): string {
  return demoTaylorWrapstarId();
}

/** Pick Jacksonville or Atlanta demo Driver from order ZIP (default Jax). */
export function defaultDemoDriverIdForPostal(postalCode: string): string {
  const metro = metroForPostalCode(postalCode);
  if (metro?.id === "atlanta") return DEMO_DRIVER_ATL_ID;
  return DEMO_DRIVER_JAX_ID;
}

export { DEMO_DRIVER_ATL_ID, DEMO_DRIVER_JAX_ID };
