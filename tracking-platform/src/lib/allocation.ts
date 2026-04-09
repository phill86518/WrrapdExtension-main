import type { Order, Driver } from "./types";
import { formatDateKeyNy } from "./ny-date";
import { isDriverAvailableOnDate } from "./availability-store";
import { getDriverProfile } from "./driver-profiles";

const MAX_PER_PRIMARY_DRIVER = 10;

type AllocInput = {
  orders: Order[];
  drivers: Driver[];
  now?: Date;
};

/**
 * Minimize drivers: one driver handles a day until count > 10, then second driver takes overflow.
 * Only **approved** drivers participate; Roger (lowest allocationRank) first.
 */
export async function computeAssignmentsForOrders(
  input: AllocInput
): Promise<Map<string, { driverId: string; driverName: string }>> {
  const now = input.now ?? new Date();
  const driversSorted = [...input.drivers].sort((a, b) => a.allocationRank - b.allocationRank);
  const result = new Map<string, { driverId: string; driverName: string }>();

  const schedulable = input.orders.filter((o) => o.status === "scheduled" || o.status === "assigned");
  const byDay = new Map<string, Order[]>();
  for (const o of schedulable) {
    const key = formatDateKeyNy(o.scheduledFor);
    const list = byDay.get(key) ?? [];
    list.push(o);
    byDay.set(key, list);
  }

  for (const [, dayOrders] of byDay) {
    dayOrders.sort((a, b) => a.id.localeCompare(b.id));
    const dateKey = formatDateKeyNy(dayOrders[0].scheduledFor);

    const approved: Driver[] = [];
    for (const d of driversSorted) {
      const p = await getDriverProfile(d.id);
      if (p.onboardingStatus !== "approved") continue;
      const avail = await isDriverAvailableOnDate(
        d.id,
        dateKey,
        now,
        p.forcedAvailableDates ?? []
      );
      if (avail) approved.push(d);
    }

    if (approved.length === 0) {
      continue;
    }

    const primary = approved[0];
    const secondary = approved[1];

    if (dayOrders.length <= MAX_PER_PRIMARY_DRIVER) {
      for (const o of dayOrders) {
        result.set(o.id, { driverId: primary.id, driverName: primary.name });
      }
    } else if (secondary) {
      dayOrders.forEach((o, i) => {
        const pick = i < MAX_PER_PRIMARY_DRIVER ? primary : secondary;
        result.set(o.id, { driverId: pick.id, driverName: pick.name });
      });
    } else {
      for (const o of dayOrders) {
        result.set(o.id, { driverId: primary.id, driverName: primary.name });
      }
    }
  }

  return result;
}
