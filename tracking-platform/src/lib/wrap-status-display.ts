import type { Order, WrapOrderPhase } from "./types";
import { resolveFulfillmentMode } from "./types";

export function wrapPhaseBadgeClass(phase: WrapOrderPhase | undefined): string {
  switch (phase) {
    case "complete":
      return "bg-emerald-100 text-emerald-900";
    case "recording":
    case "label_ready":
      return "bg-amber-100 text-amber-950";
    case "queued":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-slate-100 text-slate-500";
  }
}

export function wrapPhaseLabel(phase: WrapOrderPhase | undefined): string {
  switch (phase) {
    case "queued":
      return "Queued";
    case "recording":
      return "Recording";
    case "label_ready":
      return "Label ready — end video next";
    case "complete":
      return "Wrap complete";
    default:
      return "Not started";
  }
}

/** True when WrapStar is assigned and courier is required but missing. */
export function orderNeedsCourierStaffing(order: Order): boolean {
  const mode = resolveFulfillmentMode(order, null);
  return mode === "driver_final_mile" && !order.courierDriverId;
}

export function orderStaffingGap(order: Order): "wrapstar" | "courier" | "both" | null {
  const missingWs = !order.wrapstarId && !order.driverId;
  const missingCourier = orderNeedsCourierStaffing(order);
  if (missingWs && missingCourier) return "both";
  if (missingWs) return "wrapstar";
  if (missingCourier) return "courier";
  return null;
}
