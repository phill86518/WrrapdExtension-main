import type { Order, WrapStar } from "./types";
import { orderWrapstarId } from "./types";
import { formatDateKeyNy } from "./ny-date";
import { wrrapdScheduledInstantIsoForUi } from "./order-schedule-display";
import { getWrapstarProfile } from "./wrapstar-profiles";
import { approxCoordsForZip, haversineKm, normalizeZip } from "./zip-centroids-jax";

const MAX_PREFERRED_LOAD = 10;

type AllocInput = {
  orders: Order[];
  wrapstars: WrapStar[];
  /** @deprecated Prefer wrapstars */
  drivers?: WrapStar[];
  now?: Date;
};

export type AssignmentResult = {
  wrapstarId: string;
  wrapstarName: string;
  /** Compat aliases */
  driverId: string;
  driverName: string;
  distanceKm: number;
};

/**
 * ZIP-proximity allocation: assign each schedulable order to the approved WrapStar
 * whose homePostalCode is closest to the giftee delivery postalCode.
 * Ties → allocationRank, then lower same-day open load.
 * Soft capacity preference (~10/day) but never leave unassigned if any approved WrapStar exists.
 * Manual assignments (assignmentSource === "manual") are preserved.
 */
export async function computeAssignmentsForOrders(
  input: AllocInput,
): Promise<Map<string, AssignmentResult>> {
  const wrapstars = input.wrapstars?.length ? input.wrapstars : input.drivers || [];
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

  // Same-day open load counts (assigned/in_progress/etc. already on wrapstars)
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

  for (const o of schedulable) {
    if (o.assignmentSource === "manual" && orderWrapstarId(o)) {
      const wsId = orderWrapstarId(o)!;
      const ws = approved.find((w) => w.id === wsId) || wrapstars.find((w) => w.id === wsId);
      if (ws) {
        result.set(o.id, {
          wrapstarId: ws.id,
          wrapstarName: ws.name,
          driverId: ws.id,
          driverName: ws.name,
          distanceKm: 0,
        });
      }
      continue;
    }

    if (soloId) {
      const solo = approved.find((w) => w.id === soloId || w.legacyDriverId === soloId);
      if (solo) {
        result.set(o.id, {
          wrapstarId: solo.id,
          wrapstarName: solo.name,
          driverId: solo.id,
          driverName: solo.name,
          distanceKm: 0,
        });
        const dateKey = formatDateKeyNy(wrrapdScheduledInstantIsoForUi(o));
        bumpLoad(solo.id, dateKey);
        continue;
      }
    }

    const orderCoords = approxCoordsForZip(o.postalCode, o.state);
    const dateKey = formatDateKeyNy(wrrapdScheduledInstantIsoForUi(o));
    const dayLoads = loadByDay.get(dateKey) ?? new Map<string, number>();

    type Scored = { ws: WrapStar; distanceKm: number; load: number };
    const scored: Scored[] = approved.map((ws) => {
      const home = approxCoordsForZip(ws.homePostalCode);
      // Prefer servicePostalCodes exact match as zero-distance boost
      const service = (ws.servicePostalCodes || []).map(normalizeZip);
      const orderZip = normalizeZip(o.postalCode);
      const distanceKm = service.includes(orderZip)
        ? 0
        : haversineKm(orderCoords, home);
      return { ws, distanceKm, load: dayLoads.get(ws.id) ?? 0 };
    });

    scored.sort((a, b) => {
      // Prefer under capacity
      const aOver = a.load >= MAX_PREFERRED_LOAD ? 1 : 0;
      const bOver = b.load >= MAX_PREFERRED_LOAD ? 1 : 0;
      if (aOver !== bOver) return aOver - bOver;
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
      if (a.ws.allocationRank !== b.ws.allocationRank) {
        return a.ws.allocationRank - b.ws.allocationRank;
      }
      return a.load - b.load;
    });

    const pick = scored[0];
    if (!pick) continue;
    result.set(o.id, {
      wrapstarId: pick.ws.id,
      wrapstarName: pick.ws.name,
      driverId: pick.ws.id,
      driverName: pick.ws.name,
      distanceKm: pick.distanceKm,
    });
    bumpLoad(pick.ws.id, dateKey);
  }

  return result;
}
