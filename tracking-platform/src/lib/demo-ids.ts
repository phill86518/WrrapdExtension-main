import { metroForPostalCode } from "./metros";

/**
 * Client-safe demo staffing IDs (no firebase-admin / Node crypto).
 * Taylor id must stay equal to wrapstarIdFromLegacy("drv-2").
 */
export const DEMO_TAYLOR_WRAPSTAR_ID = "595302260328";
export const DEMO_DRIVER_JAX_ID = "dd-demo-jax";
export const DEMO_DRIVER_ATL_ID = "dd-demo-atl";

export function defaultDemoWrapstarId(): string {
  return DEMO_TAYLOR_WRAPSTAR_ID;
}

/** Pick Jacksonville or Atlanta demo Driver from order ZIP (default Jax). */
export function defaultDemoDriverIdForPostal(postalCode: string): string {
  const metro = metroForPostalCode(postalCode);
  if (metro?.id === "atlanta") return DEMO_DRIVER_ATL_ID;
  return DEMO_DRIVER_JAX_ID;
}
