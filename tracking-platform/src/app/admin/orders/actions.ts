"use server";

import {
  assignCourierDriver,
  assignWrapstar,
  createOrder,
  deleteOrders,
  reopenOrderAsAssigned,
  updateOrderStatus,
} from "@/lib/data";
import { findWrapstarById } from "@/lib/wrapstar-registry";
import { defaultDemoWrapstarId } from "@/lib/demo-staffing";
import type { OrderStatus } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function revalidateOrders() {
  revalidatePath("/admin/orders");
  revalidatePath("/admin/orders/calendar");
  revalidatePath("/admin");
}

export async function createOrderAction(formData: FormData) {
  const result = await createOrder({
    customerName: String(formData.get("customerName") || ""),
    customerPhone: String(formData.get("customerPhone") || ""),
    recipientName: String(formData.get("recipientName") || ""),
    addressLine1: String(formData.get("addressLine1") || ""),
    city: String(formData.get("city") || ""),
    state: String(formData.get("state") || ""),
    postalCode: String(formData.get("postalCode") || "").trim(),
    scheduledFor: String(formData.get("scheduledFor") || ""),
    skipCustomerNotifications: true,
  });
  if (!result.ok) {
    redirect(`/admin/orders?createError=${encodeURIComponent(result.error)}`);
  }
  revalidateOrders();
  redirect("/admin/orders");
}

export async function updateStatusAction(formData: FormData) {
  await updateOrderStatus(
    String(formData.get("orderId") || ""),
    String(formData.get("status") || "assigned") as OrderStatus,
    "admin",
  );
  revalidateOrders();
}

/**
 * Assign WrapStar + optional courier Driver.
 * Hybrid (can deliver): empty courier → self_delivery.
 * Wrap-only: courier required server-side.
 */
export async function assignStaffAction(formData: FormData) {
  const orderId = String(formData.get("orderId") || "");
  const wrapstarId = String(formData.get("wrapstarId") || "").trim() || defaultDemoWrapstarId();
  const courierRaw = String(formData.get("courierDriverId") || "").trim();

  const wrapstar = await findWrapstarById(wrapstarId);
  const wrapOnly = Boolean(wrapstar?.wrapOnly || wrapstar?.canDeliver === false);

  if (wrapOnly && !courierRaw) {
    redirect(
      `/admin/orders?assignError=${encodeURIComponent(
        "Wrap-only WrapStars need a courier Driver assigned.",
      )}`,
    );
  }

  await assignWrapstar(orderId, wrapstarId, "admin");

  if (courierRaw) {
    await assignCourierDriver(orderId, courierRaw, "admin");
  } else {
    // Hybrid: no courier → self-delivery
    await assignCourierDriver(orderId, "", "admin");
  }
  revalidateOrders();
}

export async function reopenAssignedAction(formData: FormData) {
  await reopenOrderAsAssigned(String(formData.get("orderId") || ""), "admin");
  revalidateOrders();
}

export async function deleteSelectedOrdersAction(formData: FormData) {
  const ids = formData
    .getAll("orderIds")
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  if (!ids.length) return;
  await deleteOrders(ids, "admin");
  revalidateOrders();
}
