"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { setPayoutHold } from "@/lib/finance";

/** Withhold or release payouts for a contractor id (and an optional linked roster id). */
export async function setPayoutHoldAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const id = String(formData.get("contractorId") || "").trim();
  if (!id) return;
  const held = String(formData.get("held") || "") === "1";
  const reason = String(formData.get("reason") || "");
  await setPayoutHold(id, held, reason);
  const also = String(formData.get("alsoId") || "").trim();
  if (also && also !== id) await setPayoutHold(also, held, reason);
  revalidatePath("/admin/finance");
  revalidatePath(`/admin/wrapstars/${id}`);
  revalidatePath(`/admin/drivers/${id}`);
  revalidatePath(`/admin/wrapriders/${id}`);
  if (also) revalidatePath(`/admin/wrapstars/${also}`);
}
