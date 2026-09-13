"use server";

import {
  approveProposedAllocation,
  assignCourierDriver,
  assignWrapstar,
  holdAllocationUnallocated,
} from "@/lib/data";
import { findWrapstarById } from "@/lib/wrapstar-registry";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function revalidateAllocations() {
  revalidatePath("/admin/allocations");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/orders/calendar");
  revalidatePath("/admin");
}

export async function approveProposedAction(formData: FormData) {
  const orderId = String(formData.get("orderId") || "").trim();
  if (!orderId) redirect("/admin/allocations?error=Missing+order");
  const saved = await approveProposedAllocation(orderId, "admin");
  if (!saved) {
    redirect("/admin/allocations?error=Nothing+to+approve+on+that+order");
  }
  revalidateAllocations();
  redirect("/admin/allocations?ok=approved");
}

export async function holdUnallocatedAction(formData: FormData) {
  const orderId = String(formData.get("orderId") || "").trim();
  if (!orderId) redirect("/admin/allocations?error=Missing+order");
  await holdAllocationUnallocated(orderId, "admin");
  revalidateAllocations();
  redirect("/admin/allocations?ok=held");
}

export async function manualAssignAction(formData: FormData) {
  const orderId = String(formData.get("orderId") || "").trim();
  const wrapstarId = String(formData.get("wrapstarId") || "").trim();
  const courierRaw = String(formData.get("courierDriverId") || "").trim();
  if (!orderId || !wrapstarId) {
    redirect("/admin/allocations?error=Choose+a+WrapStar");
  }
  const wrapstar = await findWrapstarById(wrapstarId);
  const wrapOnly = Boolean(wrapstar?.wrapOnly || wrapstar?.canDeliver === false);
  if (wrapOnly && !courierRaw) {
    redirect("/admin/allocations?error=Wrap-only+WrapStars+need+a+JoyRider");
  }
  await assignWrapstar(orderId, wrapstarId, "admin");
  if (courierRaw) {
    await assignCourierDriver(orderId, courierRaw, "admin");
  } else {
    await assignCourierDriver(orderId, "", "admin");
  }
  revalidateAllocations();
  redirect("/admin/allocations?ok=manual");
}
