import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Legacy path — WrapStars directory lives at /admin/wrapstars. */
export default async function AdminDriversRedirectPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();
  redirect("/admin/wrapstars");
}
