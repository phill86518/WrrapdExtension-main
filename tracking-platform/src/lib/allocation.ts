import type { DeliveryDriver, FulfillmentMode, Order, WrapStar } from "./types";
import { orderWrapstarId } from "./types";
import { formatDateKeyNy } from "./ny-date";
import { wrrapdScheduledInstantIsoForUi } from "./order-schedule-display";
import { getWrapstarProfile } from "./wrapstar-profiles";
import { approxCoordsForZip, haversineKm, normalizeZip } from "./zip-centroids-jax";
import {
  countWrapOnlyInMetro,
  isDriverNetworkUnlocked,
  isWrapOnly,
  metroForPostalCode,
} from "./metros";
import { listDeliveryDrivers } from "./driver-registry";

const MAX_PREFERRED_LOAD = 10;

type AllocInput = {
  orders: Order[];
  wrapstars: WrapStar[];
  /** @deprecated Prefer wrapstars */
  drivers?: WrapStar[];
  deliveryDrivers?: DeliveryDriver[];
  now?: Date;
};

export type AssignmentResult = {
  wrapstarId: string;
  wrapstarName: string;
  /** Compat aliases — still mirror WrapStar id for legacy route code */
  driverId: string;
  driverName: string;
  distanceKm: number;
  fulfillmentMode: FulfillmentMode;
  courierDriverId?: string;
  courierDriverName?: string;
};

function pickCourierForOrder(
  order: Order,
  wrapstar: WrapStar,
  deliveryDrivers: DeliveryDriver[],
  wrapstars: WrapStar[],
): { courierDriverId?: string; courierDriverName?: string; fulfillmentMode: FulfillmentMode } {
  if (!isWrapOnly(wrapstar)) {
    return { fulfillmentMode: "self_delivery" };
  }

  const metro =
    (wrapstar.metroId && metroForPostalCode(wrapstar.homePostalCode)?.id === wrapstar.metroId
      ? metroForPostalCode(wrapstar.homePostalCode)
      : null) ||
    metroForPostalCode(order.postalCode) ||
    metroForPostalCode(wrapstar.homePostalCode);

  if (wrapstar.assignedDriverId) {
    const preferred = deliveryDrivers.find(
      (d) => d.id === wrapstar.assignedDriverId && d.status === "approved",
    );
    if (preferred) {
      return {
        fulfillmentMode: "driver_final_mile",
        courierDriverId: preferred.id,
        courierDriverName: preferred.name,
      };
    }
  }

  if (!metro) {
    return { fulfillmentMode: "driver_final_mile" };
  }

  const wrapOnlyCount = countWrapOnlyInMetro(metro.id, wrapstars);
  if (!isDriverNetworkUnlocked(metro.id, wrapOnlyCount)) {
    return { fulfillmentMode: "driver_final_mile" };
  }

  const approvedDrivers = deliveryDrivers.filter(
    (d) => d.status === "approved" && d.metroId === metro.id,
  );
  if (approvedDrivers.length === 0) {
    return { fulfillmentMode: "driver_final_mile" };
  }

  const orderCoords = approxCoordsForZip(order.postalCode, order.state);
  const orderZip = normalizeZip(order.postalCode);
  approvedDrivers.sort((a, b) => {
    const aService = (a.servicePostalCodes || []).map(normalizeZip).includes(orderZip);
    const bService = (b.servicePostalCodes || []).map(normalizeZip).includes(orderZip);
    if (aService !== bService) return aService ? -1 : 1;
    const da = haversineKm(orderCoords, approxCoordsForZip(a.homePostalCode));
    const db = haversineKm(orderCoords, approxCoordsForZip(b.homePostalCode));
    return da - db;
  });
  const pick = approvedDrivers[0]!;
  return {
    fulfillmentMode: "driver_final_mile",
    courierDriverId: pick.id,
    courierDriverName: pick.name,
  };
}

/**
 * ZIP-proximity allocation with hybrid vs wrap-only+Driver staffing.
 * Prefer hybrid (self-delivery) WrapStars when equally viable; wrap-only gets a
 * courier when the metro driver network is unlocked (≥3 wrap-only) or assignedDriverId is set.
 * Manual assignments (assignmentSource === "manual") are preserved for WrapStar;
 * courier may still be auto-filled when wrap-only.
 */
export async function computeAssignmentsForOrders(
  input: AllocInput,
): Promise<Map<string, AssignmentResult>> {
  const wrapstars = input.wrapstars?.length ? input.wrapstars : input.drivers || [];
  const deliveryDrivers = input.deliveryDrivers ?? (await listDeliveryDrivers());
  const result = new Map<string, AssignmentResult>();

  const soloId =
    process.env.TRACKING_SOLO_WRAPSTAR_ID?.trim() ||
    process.env.TRACKING_SOLO_DRIVER_ID?.trim();

  const approved: WrapStar[] = [];
  for (const w of wrapstars) {
    const p = await getWrapstarProfile(w.id);
    if (p.onboardingStatus === "approved" && normalizeZip(w.homePostalCode).length === 5) {
      approved.push(w);
    }
  }
  if (approved.length === 0) return result;

  const schedulable = input.orders.filter((o) => {
    const st = o.status;
    return st === "pending" || st === "scheduled" || st === "assigned";
  });

  const loadByDay = new Map<string, Map<string, number>>();
  const bumpLoad = (wsId: string, dateKey: string) => {
    const day = loadByDay.get(dateKey) ?? new Map<string, number>();
    day.set(wsId, (day.get(wsId) ?? 0) + 1);
    loadByDay.set(dateKey, day);
  };

  for (const o of input.orders) {
    const wsId = orderWrapstarId(o);
    if (!wsId) continue;
    if (["cancelled", "refunded", "delivered"].includes(o.status)) continue;
    const dateKey = formatDateKeyNy(wrrapdScheduledInstantIsoForUi(o));
    bumpLoad(wsId, dateKey);
  }

  const finalize = (o: Order, ws: WrapStar, distanceKm: number): AssignmentResult => {
    const courier = pickCourierForOrder(o, ws, deliveryDrivers, wrapstars);
    return {
      wrapstarId: ws.id,
      wrapstarName: ws.name,
      driverId: ws.id,
      driverName: ws.name,
      distanceKm,
      ...courier,
    };
  };

  for (const o of schedulable) {
    if (o.assignmentSource === "manual" && orderWrapstarId(o)) {
      const wsId = orderWrapstarId(o)!;
      const ws = approved.find((w) => w.id === wsId) || wrapstars.find((w) => w.id === wsId);
      if (ws) {
        // Preserve manual courier if set; otherwise fill for wrap-only
        if (o.courierDriverId && o.assignmentSource === "manual") {
          result.set(o.id, {
            wrapstarId: ws.id,
            wrapstarName: ws.name,
            driverId: ws.id,
            driverName: ws.name,
            distanceKm: 0,
            fulfillmentMode: o.fulfillmentMode || "driver_final_mile",
            courierDriverId: o.courierDriverId,
            courierDriverName: o.courierDriverName,
          });
        } else {
          result.set(o.id, finalize(o, ws, 0));
        }
      }
      continue;
    }

    if (soloId) {
      const solo = approved.find((w) => w.id === soloId || w.legacyDriverId === soloId);
      if (solo) {
        result.set(o.id, finalize(o, solo, 0));
        const dateKey = formatDateKeyNy(wrrapdScheduledInstantIsoForUi(o));
        bumpLoad(solo.id, dateKey);
        continue;
      }
    }

    const orderCoords = approxCoordsForZip(o.postalCode, o.state);
    const dateKey = formatDateKeyNy(wrrapdScheduledInstantIsoForUi(o));
    const dayLoads = loadByDay.get(dateKey) ?? new Map<string, number>();

    type Scored = { ws: WrapStar; distanceKm: number; load: number; hybrid: boolean };
    const scored: Scored[] = approved.map((ws) => {
      const home = approxCoordsForZip(ws.homePostalCode);
      const service = (ws.servicePostalCodes || []).map(normalizeZip);
      const orderZip = normalizeZip(o.postalCode);
      const distanceKm = service.includes(orderZip) ? 0 : haversineKm(orderCoords, home);
      return {
        ws,
        distanceKm,
        load: dayLoads.get(ws.id) ?? 0,
        hybrid: !isWrapOnly(ws),
      };
    });

    scored.sort((a, b) => {
      const aOver = a.load >= MAX_PREFERRED_LOAD ? 1 : 0;
      const bOver = b.load >= MAX_PREFERRED_LOAD ? 1 : 0;
      if (aOver !== bOver) return aOver - bOver;
      // Prefer hybrid self-delivery when distances are within 15 km
      if (a.hybrid !== b.hybrid) {
        const distGap = Math.abs(a.distanceKm - b.distanceKm);
        if (distGap <= 15) return a.hybrid ? -1 : 1;
      }
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
      if (a.hybrid !== b.hybrid) return a.hybrid ? -1 : 1;
      if (a.ws.allocationRank !== b.ws.allocationRank) {
        return a.ws.allocationRank - b.ws.allocationRank;
      }
      return a.load - b.load;
    });

    const pick = scored[0];
    if (!pick) continue;
    result.set(o.id, finalize(o, pick.ws, pick.distanceKm));
    bumpLoad(pick.ws.id, dateKey);
  }

  return result;
}
