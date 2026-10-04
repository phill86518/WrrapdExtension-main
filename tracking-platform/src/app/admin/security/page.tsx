import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { listAdminUsers } from "@/lib/admin-accounts";
import { AdminSecurityPanel } from "@/components/admin-security-panel";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  const session = await requireAdminSession();
  if (!session) redirect("/admin?next=/admin/security");
  const admins = (await listAdminUsers())
    .map((a) => ({
      email: a.email,
      name: a.name,
      disabled: Boolean(a.disabled),
      lastLoginAt: a.lastLoginAt || null,
      createdAt: a.createdAt,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-blue-800 underline">
          ← Command Center
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-[#0f172a]">Admin logins</h1>
        <p className="mt-1 text-sm text-slate-600">Each admin signs in with their own email, password, and authenticator code.</p>
      </div>
      <AdminSecurityPanel admins={admins} currentUserId={session.userId} />
    </div>
  );
}
