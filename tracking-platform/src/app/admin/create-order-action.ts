"use server";

import { createOrder } from "@/lib/data";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
    redirect(`/admin?createError=${encodeURIComponent(result.error)}`);
  }
  revalidatePath("/admin");
  redirect("/admin");
}
