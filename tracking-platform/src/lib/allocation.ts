import type { DeliveryDriver, FulfillmentMode, Order, WrapStar } from "./types";
import { orderWrapstarId } from "./types";
import { formatDateKeyNy } from "./ny-date";
import { wrrapdScheduledInstantIsoForUi } from "./order-schedule-display";
import { getWrapstarProfile } from "./wrapstar-profiles";
import { approxCoordsForZip, haversineKm, normalizeZip } from "./zip-centroids-jax";
import { distanceBetweenZipsMiles } from "./zip-centroids-us";

/** Giftee ZIP must be within this radius of the WrapStar home ZIP (or listed service ZIP). */
export const ALLOCATION_RADIUS_MILES = 15;
const KM_PER_MILE = 1.609344;
import {
  countWrapOnlyInMetro,
  isDriverNetworkUnlocked,
  isWrapOnly,
  metroForPostalCode,
} from "./metros";
import { listDeliveryDrivers } from "./driver-registry";
import { isDriverAvailableOnDate, type ShiftKey } from "./availability-store";
import { formatInTimeZone } from "date-fns-tz";

const MAX_PREFERRED_LOAD = 10;

function shiftForScheduledOrder(order: Order): ShiftKey {
  const iso = wrrapdScheduledInstantIsoForUi(order);
  const hour = Number(formatInTimeZone(new Date(iso), "America/New_York", "H"));
  return hour < 13 ? "morning" : "afternoon";
}

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
  distanceMiles: number;
  fulfillmentMode: FulfillmentMode;
  courierDriverId?: string;
  courierDriverName?: string;
};

function milesBetweenOrderAndWrapstar(
  orderPostalCode: string,
  orderState: string | undefined,
  wrapstarPostalCode: string,
  servicePostalCodes: string[] | undefined,
): number {
  const orderZip = normalizeZip(orderPostalCode);
  const service = (servicePostalCodes || []).map(normalizeZip);
  if (orderZip && service.includes(orderZip)) return 0;
  const census = distanceBetweenZipsMiles(orderPostalCode, wrapstarPostalCode);
  if (census != null) return census;
  const km = haversineKm(
    approxCoordsForZip(orderPostalCode, orderState),
    approxCoordsForZip(wrapstarPostalCode),
  );
  return km / KM_PER_MILE;
}

async function pickCourierForOrder(
  order: Order,
  wrapstar: WrapStar,
  deliveryDrivers: DeliveryDriver[],
  wrapstars: WrapStar[],
  now: Date,
): Promise<{ courierDriverId?: string; courierDriverName?: string; fulfillmentMode: FulfillmentMode }> {
  if (!isWrapOnly(wrapstar)) {
    return { fulfillmentMode: "self_delivery" };
  }

  const dateKey = formatDateKeyNy(wrrapdScheduledInstantIsoForUi(order));
  const shift = shiftForScheduledOrder(order);

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
      const avail = await isDriverAvailableOnDate(preferred.id, dateKey, shift, now);
      if (avail) {
        return {
          fulfillmentMode: "driver_final_mile",
          courierDriverId: preferred.id,
          courierDriverName: preferred.name,
        };
      }
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

  const availableDrivers: DeliveryDriver[] = [];
  for (const d of approvedDrivers) {
    if (await isDriverAvailableOnDate(d.id, dateKey, shift, now)) {
      availableDrivers.push(d);
    }
  }
  const pool = availableDrivers.length > 0 ? availableDrivers : approvedDrivers;

  const orderCoords = approxCoordsForZip(order.postalCode, order.state);
  const orderZip = normalizeZip(order.postalCode);
  pool.sort((a, b) => {
    const aService = (a.servicePostalCodes || []).map(normalizeZip).includes(orderZip);
    const bService = (b.servicePostalCodes || []).map(normalizeZip).includes(orderZip);
    if (aService !== bService) return aService ? -1 : 1;
    const da = haversineKm(orderCoords, approxCoordsForZip(a.homePostalCode));
    const db = haversineKm(orderCoords, approxCoordsForZip(b.homePostalCode));
    return da - db;
  });
  const pick = pool[0]!;
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
  const now = input.now ?? new Date();

  const soloId =
    process.env.TRACKING_SOLO_WRAPSTAR_ID?.trim() ||
    process.env.TRACKING_SOLO_DRIVER_ID?.trim();

  const approved: WrapStar[] = [];
  const forcedByWrapstar = new Map<string, string[]>();
  for (const w of wrapstars) {
    const p = await getWrapstarProfile(w.id);
    if (p.onboardingStatus === "approved" && normalizeZip(w.homePostalCode).length === 5) {
      approved.push(w);
      forcedByWrapstar.set(w.id, p.forcedAvailableDates || []);
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

  const finalize = async (o: Order, ws: WrapStar, distanceMiles: number): Promise<AssignmentResult> => {
    const courier = await pickCourierForOrder(o, ws, deliveryDrivers, wrapstars, now);
    return {
      wrapstarId: ws.id,
      wrapstarName: ws.name,
      driverId: ws.id,
      driverName: ws.name,
      distanceKm: distanceMiles * KM_PER_MILE,
      distanceMiles,
      ...courier,
    };
  };

  for (const o of schedulable) {
    if (o.assignmentSource === "manual" && orderWrapstarId(o)) {
      const wsId = orderWrapstarId(o)!;
      const ws = approved.find((w) => w.id === wsId) || wrapstars.find((w) => w.id === wsId);
      if (ws) {
        if (o.courierDriverId && o.assignmentSource === "manual") {
          result.set(o.id, {
            wrapstarId: ws.id,
            wrapstarName: ws.name,
            driverId: ws.id,
            driverName: ws.name,
            distanceKm: 0,
            distanceMiles: 0,
            fulfillmentMode: o.fulfillmentMode || "driver_final_mile",
            courierDriverId: o.courierDriverId,
            courierDriverName: o.courierDriverName,
          });
        } else {
          result.set(o.id, await finalize(o, ws, 0));
        }
      }
      continue;
    }

    if (soloId) {
      const solo = approved.find((w) => w.id === soloId || w.legacyDriverId === soloId);
      if (solo) {
        const soloMiles = milesBetweenOrderAndWrapstar(
          o.postalCode,
          o.state,
          solo.homePostalCode,
          solo.servicePostalCodes,
        );
        if (soloMiles <= ALLOCATION_RADIUS_MILES) {
          result.set(o.id, await finalize(o, solo, soloMiles));
          const dateKey = formatDateKeyNy(wrrapdScheduledInstantIsoForUi(o));
          bumpLoad(solo.id, dateKey);
          continue;
        }
      }
    }

    const dateKey = formatDateKeyNy(wrrapdScheduledInstantIsoForUi(o));
    const shift = shiftForScheduledOrder(o);
    const dayLoads = loadByDay.get(dateKey) ?? new Map<string, number>();

    type Scored = { ws: WrapStar; distanceMiles: number; load: number; hybrid: boolean };
    const scored: Scored[] = [];
    for (const ws of approved) {
      const distanceMiles = milesBetweenOrderAndWrapstar(
        o.postalCode,
        o.state,
        ws.homePostalCode,
        ws.servicePostalCodes,
      );
      if (distanceMiles > ALLOCATION_RADIUS_MILES) continue;
      const avail = await isDriverAvailableOnDate(
        ws.id,
        dateKey,
        shift,
        now,
        forcedByWrapstar.get(ws.id) || [],
      );
      if (!avail) continue;
      scored.push({
        ws,
        distanceMiles,
        load: dayLoads.get(ws.id) ?? 0,
        hybrid: !isWrapOnly(ws),
      });
    }

    scored.sort((a, b) => {
      const aOver = a.load >= MAX_PREFERRED_LOAD ? 1 : 0;
      const bOver = b.load >= MAX_PREFERRED_LOAD ? 1 : 0;
      if (aOver !== bOver) return aOver - bOver;
      if (a.hybrid !== b.hybrid) {
        const distGap = Math.abs(a.distanceMiles - b.distanceMiles);
        if (distGap <= 9) return a.hybrid ? -1 : 1;
      }
      if (a.distanceMiles !== b.distanceMiles) return a.distanceMiles - b.distanceMiles;
      if (a.hybrid !== b.hybrid) return a.hybrid ? -1 : 1;
      if (a.ws.allocationRank !== b.ws.allocationRank) {
        return a.ws.allocationRank - b.ws.allocationRank;
      }
      return a.load - b.load;
    });

    const pick = scored[0];
    if (!pick) continue;
    result.set(o.id, await finalize(o, pick.ws, pick.distanceMiles));
    bumpLoad(pick.ws.id, dateKey);
  }

  return result;
}
