import type { Order } from "./types";
import { formatDateKeyNy } from "./ny-date";
import { DEFAULT_DEPOT, approxCoordsForOrder } from "./zip-centroids-jax";

type LatLng = { lat: number; lng: number };

const ROUTE_STATUSES = new Set<Order["status"]>(["scheduled", "assigned", "en_route"]);

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function openPathLength(depot: LatLng, route: Order[]): number {
  if (route.length === 0) return 0;
  let sum = haversineKm(depot, approxCoordsForOrder(route[0]));
  for (let i = 0; i < route.length - 1; i++) {
    sum += haversineKm(approxCoordsForOrder(route[i]), approxCoordsForOrder(route[i + 1]));
  }
  return sum;
}

/** Greedy nearest neighbor from depot, stable ties by order id. */
function nearestNeighborOrder(orders: Order[]): Order[] {
  if (orders.length <= 1) {
    return [...orders].sort((a, b) => a.id.localeCompare(b.id));
  }
  const depot = DEFAULT_DEPOT;
  const remaining = [...orders];
  const result: Order[] = [];
  let current: LatLng = depot;
  while (remaining.length) {
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const p = approxCoordsForOrder(remaining[i]);
      const d = haversineKm(current, p);
      if (d < bestD - 1e-9 || (Math.abs(d - bestD) < 1e-9 && remaining[i].id < remaining[bestIdx].id)) {
        bestD = d;
        bestIdx = i;
      }
    }
    const [next] = remaining.splice(bestIdx, 1);
    result.push(next);
    current = approxCoordsForOrder(next);
  }
  return result;
}

/** Simple 2-opt on an open path (common last-mile heuristic; not exact TSP). */
function twoOptOpenPath(route: Order[]): Order[] {
  const depot = DEFAULT_DEPOT;
  let r = [...route];
  let bestLen = openPathLength(depot, r);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 100) {
    improved = false;
    for (let i = 0; i < r.length; i++) {
      for (let k = i + 1; k < r.length; k++) {
        const cand = [...r.slice(0, i), ...r.slice(i, k + 1).reverse(), ...r.slice(k + 1)];
        const len = openPathLength(depot, cand);
        if (len + 1e-6 < bestLen) {
          r = cand;
          bestLen = len;
          improved = true;
        }
      }
    }
  }
  return r;
}

function optimizeStopOrderForGroup(orders: Order[]): Order[] {
  if (orders.length === 0) return orders;
  const nn = nearestNeighborOrder(orders);
  return orders.length > 3 ? twoOptOpenPath(nn) : nn;
}

/**
 * Assigns `stopSequence` (1-based) per driver per Eastern calendar day for active routing statuses.
 * Clears `stopSequence` on other orders (e.g. delivered).
 */
export function assignStopSequences(orders: Order[]): Order[] {
  const byKey = new Map<string, Order[]>();
  for (const o of orders) {
    if (!o.driverId || !ROUTE_STATUSES.has(o.status)) continue;
    const day = formatDateKeyNy(o.scheduledFor);
    const key = `${o.driverId}|${day}`;
    const list = byKey.get(key) ?? [];
    list.push(o);
    byKey.set(key, list);
  }

  const sequenceById = new Map<string, number>();
  for (const [, group] of byKey) {
    const optimized = optimizeStopOrderForGroup(group);
    optimized.forEach((o, idx) => sequenceById.set(o.id, idx + 1));
  }

  return orders.map((o) => {
    const seq = sequenceById.get(o.id);
    if (seq !== undefined) {
      return { ...o, stopSequence: seq };
    }
    if (o.stopSequence === undefined) return o;
    const rest = { ...o };
    delete rest.stopSequence;
    return rest;
  });
}
