import type { Session } from "@/lib/auth";
import { getOrderById } from "@/lib/data";
import type { Order } from "@/lib/types";
import { orderWrapstarId } from "@/lib/types";
import { findWrapriderById } from "@/lib/wraprider-registry";

/**
 * Ids this session may act as on an order. WrapStar / JoyRider sessions act as themselves.
 * A WrapRider session (third role, own login) acts through its linked wrap (8…) and delivery
 * (7…) capacity ids — the ids order allocation assigns to. It never becomes a wrapstar/driver session.
 */
export async function actorIdsForSession(
  session: Session,
): Promise<{ wrapstarId?: string; courierDriverId?: string }> {
  if (session.role === "wrapstar") return { wrapstarId: session.userId };
  if (session.role === "driver") return { courierDriverId: session.userId };
  if (session.role === "wraprider") {
    const wr = await findWrapriderById(session.userId);
    return { wrapstarId: wr?.wrapstarId, courierDriverId: wr?.courierDriverId };
  }
  return {};
}

/** Whether this session may mutate delivery status / proof / location for the order. */
export async function canMutateOrderDelivery(session: Session, order: Order): Promise<boolean> {
  if (session.role === "admin") return true;
  const ids = await actorIdsForSession(session);
  if (session.role === "wrapstar") {
    return !!ids.wrapstarId && orderWrapstarId(order) === ids.wrapstarId;
  }
  if (session.role === "driver" || session.role === "wraprider") {
    // Courier final-mile, or self-delivery when the same contractor wraps and delivers.
    if (ids.courierDriverId && order.courierDriverId === ids.courierDriverId) return true;
    if (
      order.fulfillmentMode === "self_delivery" &&
      ids.wrapstarId &&
      orderWrapstarId(order) === ids.wrapstarId
    ) {
      return true;
    }
    if (ids.wrapstarId && session.role === "wraprider" && orderWrapstarId(order) === ids.wrapstarId) {
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
  if (!(await canMutateOrderDelivery(session, order))) return null;
  return order;
}
