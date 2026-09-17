import {
  DEMO_DRIVER_ATL_ID,
  DEMO_DRIVER_JAX_ID,
  defaultDemoDriverIdForPostal,
  defaultDemoWrapstarId,
} from "./demo-ids";
import { ensureDemoDeliveryDrivers } from "./driver-registry";
import { ensureDemoWrapstarApprovals } from "./wrapstar-profiles";
import { ensureDemoWrapriders } from "./wraprider-registry";

/** Seed demo WrapStars / JoyRiders / WrapRiders used by Command Center. */
export async function ensureDemoStaffing(): Promise<void> {
  await Promise.all([
    ensureDemoWrapstarApprovals(),
    ensureDemoDeliveryDrivers(),
    ensureDemoWrapriders(),
  ]);
}

export {
  DEMO_DRIVER_ATL_ID,
  DEMO_DRIVER_JAX_ID,
  defaultDemoDriverIdForPostal,
  defaultDemoWrapstarId,
};
