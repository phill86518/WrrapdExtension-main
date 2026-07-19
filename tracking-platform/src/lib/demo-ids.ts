import { metroForPostalCode } from "./metros";
import { DEMO_EMPLOYEE_IDS } from "./employee-id";

/**
 * Client-safe demo staffing IDs (structured 10-digit employee IDs).
 * Roger / Taylor / Drivers match employee-id DEMO_EMPLOYEE_IDS.
 */
export const DEMO_TAYLOR_WRAPSTAR_ID = DEMO_EMPLOYEE_IDS.wrapstarTaylor;
export const DEMO_ROGER_WRAPSTAR_ID = DEMO_EMPLOYEE_IDS.wrapstarRoger;
export const DEMO_DRIVER_JAX_ID = DEMO_EMPLOYEE_IDS.driverDevon;
export const DEMO_DRIVER_ATL_ID = DEMO_EMPLOYEE_IDS.driverMorgan;

export function defaultDemoWrapstarId(): string {
  return DEMO_TAYLOR_WRAPSTAR_ID;
}

/** Pick Jacksonville or Atlanta demo Driver from order ZIP (default Jax). */
export function defaultDemoDriverIdForPostal(postalCode: string): string {
  const metro = metroForPostalCode(postalCode);
  if (metro?.id === "atlanta") return DEMO_DRIVER_ATL_ID;
  return DEMO_DRIVER_JAX_ID;
}
