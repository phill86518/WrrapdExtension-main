import { giftBoxForLine, wrappingPaperName } from "./gift-box";
import type { InventoryNeed } from "./inventory-model";
import { formatDateKeyNy } from "./ny-date";
import { wrrapdScheduledInstantIsoForUi } from "./order-schedule-display";
import type { Order, OrderStatus, WrapRider, WrapStar } from "./types";
import { orderWrapstarId } from "./types";

const CLOSED: ReadonlySet<OrderStatus> = new Set(["delivered", "cancelled", "refunded"]);

export type InventoryPerson = {
  id: string;
  name: string;
  role: "WrapStar" | "WrapRider";
  /** Order.wrapstarId this person wraps. */
  orderOwnerId: string;
};

export type { InventoryNeed };

export function inventoryPeopleFromRosters(wrapstars: WrapStar[], wrapriders: WrapRider[]): InventoryPerson[] {
  const riderWrapIds = new Set(
    wrapriders.map((person) => person.wrapstarId).filter((id): id is string => Boolean(id)),
  );
  const people: InventoryPerson[] = [];
  for (const person of wrapriders) {
    if (person.status !== "approved" || !person.wrapstarId) continue;
    people.push({
      id: person.id,
      name: person.name,
      role: "WrapRider",
      orderOwnerId: person.wrapstarId,
    });
  }
  for (const person of wrapstars) {
    if (person.hireRole === "wraprider") continue;
    if (riderWrapIds.has(person.id)) continue;
    people.push({
      id: person.id,
      name: person.name,
      role: "WrapStar",
      orderOwnerId: person.id,
    });
  }
  return people;
}

/** Live supplies for gifts that are not yet delivered. */
export function inventoryNeedsFromOrders(orders: Order[], people: InventoryPerson[]): InventoryNeed[] {
  const byOwner = new Map(people.map((person) => [person.orderOwnerId, person]));
  const needs: InventoryNeed[] = [];
  for (const order of orders) {
    if (CLOSED.has(order.status)) continue;
    const dateKey = formatDateKeyNy(wrrapdScheduledInstantIsoForUi(order));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    const owner = orderWrapstarId(order) || "";
    const person = owner ? byOwner.get(owner) : undefined;
    const lines = order.lineItems?.length ? order.lineItems : [{ title: order.recipientName || "Gift" }];
    for (const line of lines) {
      const box = giftBoxForLine(line);
      needs.push({
        dateKey,
        personId: person?.id || (owner ? owner : "unassigned"),
        personName: person?.name || "Unassigned",
        role: person?.role || "Unassigned",
        paper: wrappingPaperName(line),
        boxSize: box.needsBox ? box.boxSize : "",
        tissue: box.needsBox ? 1 : 0,
      });
    }
  }
  return needs;
}
