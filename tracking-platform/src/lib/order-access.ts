import type { Session } from "@/lib/auth";
import { getOrderById } from "@/lib/data";
import type { Order } from "@/lib/types";
import { orderWrapstarId } from "@/lib/types";

/** Whether this session may mutate delivery status / proof / location for the order. */
export function canMutateOrderDelivery(session: Session, order: Order): boolean {
  if (session.role === "admin") return true;
  if (session.role === "wrapstar") {
    return orderWrapstarId(order) === session.userId;
  }
  if (session.role === "driver") {
    // Courier final-mile, or hybrid self-delivery when WrapStar uses role driver (legacy).
    if (order.courierDriverId === session.userId) return true;
    if (
      order.fulfillmentMode === "self_delivery" &&
      orderWrapstarId(order) === session.userId
    ) {
      return true;
    }
  }
  return false;
}

export async function loadOrderIfMutable(
  session: Session,
  orderId: string,
): Promise<Order | null> {
  const order = await getOrderById(orderId);
  if (!order) return null;
  if (!canMutateOrderDelivery(session, order)) return null;
  return order;
}
