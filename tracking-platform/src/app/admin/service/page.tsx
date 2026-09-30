import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ServiceDesk } from "@/components/service-desk";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminServicePage() {
  const session = await getSession();
  if (!session || session.role !== "admin") notFound();

  return (
    <Suspense fallback={<p className="text-sm text-[#0f172a]">Loading customer service…</p>}>
      <ServiceDesk />
    </Suspense>
  );
}
