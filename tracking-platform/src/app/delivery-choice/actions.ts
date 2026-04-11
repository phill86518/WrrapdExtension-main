"use server";

import { resolveDeliveryPreferenceByToken } from "@/lib/data";
import { redirect } from "next/navigation";

export async function submitDeliveryPreference(formData: FormData) {
  const token = String(formData.get("token") || "").trim();
  const choice = String(formData.get("choice") || "").trim();
  if (!token || (choice !== "together" && choice !== "earliest")) {
    redirect(`/delivery-choice?t=${encodeURIComponent(token)}&err=${encodeURIComponent("Please choose an option.")}`);
  }
  const r = await resolveDeliveryPreferenceByToken(token, choice as "together" | "earliest");
  if (!r.ok) {
    redirect(`/delivery-choice?t=${encodeURIComponent(token)}&err=${encodeURIComponent(r.error)}`);
  }
  redirect(`/track/${r.order.trackingToken}?pref=1`);
}
