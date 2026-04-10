import type { Order, Driver } from "./types";
import { formatDateKeyNy, hourNy } from "./ny-date";
import { isDriverAvailableOnDate, type ShiftKey } from "./availability-store";
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
    const shiftForOrder = (o: Order): ShiftKey => (hourNy(o.scheduledFor) < 13 ? "morning" : "afternoon");

    const approved: Driver[] = [];
    const forcedByDriver = new Map<string, string[]>();
    for (const d of driversSorted) {
      const p = await getDriverProfile(d.id);
      if (p.onboardingStatus !== "approved") continue;
      const forced = p.forcedAvailableDates ?? [];
      forcedByDriver.set(d.id, forced);

      let hasShiftCoverage = false;
      for (const o of dayOrders) {
        if (
          await isDriverAvailableOnDate(
            d.id,
            dateKey,
            shiftForOrder(o),
            now,
            forced
          )
        ) {
          hasShiftCoverage = true;
          break;
        }
      }
      if (hasShiftCoverage) approved.push(d);
    }

    if (approved.length === 0) {
      continue;
    }

    const assignOne = async (o: Order, driver: Driver) => {
      const avail = await isDriverAvailableOnDate(
        driver.id,
        dateKey,
        shiftForOrder(o),
        now,
        forcedByDriver.get(driver.id) ?? []
      );
      return avail;
    };

    const primary = approved[0];
    const secondary = approved[1];

    if (dayOrders.length <= MAX_PER_PRIMARY_DRIVER) {
      for (const o of dayOrders) {
        if (await assignOne(o, primary)) {
          result.set(o.id, { driverId: primary.id, driverName: primary.name });
        }
      }
    } else if (secondary) {
      for (let i = 0; i < dayOrders.length; i++) {
        const o = dayOrders[i]!;
        const pick = i < MAX_PER_PRIMARY_DRIVER ? primary : secondary;
        const other = pick.id === primary.id ? secondary : primary;
        if (await assignOne(o, pick)) {
          result.set(o.id, { driverId: pick.id, driverName: pick.name });
        } else if (await assignOne(o, other)) {
          result.set(o.id, { driverId: other.id, driverName: other.name });
        }
      }
    } else {
      for (const o of dayOrders) {
        if (await assignOne(o, primary)) {
          result.set(o.id, { driverId: primary.id, driverName: primary.name });
        }
      }
    }
  }

  return result;
}
