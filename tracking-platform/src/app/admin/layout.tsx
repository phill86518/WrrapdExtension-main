import { AutoRefresh } from "@/components/auto-refresh";
import { AdminShell } from "@/components/admin-shell";
import { getSession } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const signedIn = Boolean(session && session.role === "admin");

  return (
    <>
      <AutoRefresh intervalMs={600_000} />
      {signedIn ? <AdminShell>{children}</AdminShell> : children}
    </>
  );
}
