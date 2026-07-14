import {
  DEMO_DRIVER_ATL_ID,
  DEMO_DRIVER_JAX_ID,
  defaultDemoDriverIdForPostal,
  defaultDemoWrapstarId,
} from "./demo-ids";
import { ensureDemoDeliveryDrivers } from "./driver-registry";
import { ensureDemoWrapstarApprovals } from "./wrapstar-profiles";

/** Seed demo WrapStars/Drivers used by Command Center dropdowns. */
export async function ensureDemoStaffing(): Promise<void> {
  await Promise.all([ensureDemoWrapstarApprovals(), ensureDemoDeliveryDrivers()]);
}

export {
  DEMO_DRIVER_ATL_ID,
  DEMO_DRIVER_JAX_ID,
  defaultDemoDriverIdForPostal,
  defaultDemoWrapstarId,
};
