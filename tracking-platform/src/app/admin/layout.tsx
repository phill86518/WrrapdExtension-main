import { AutoRefresh } from "@/components/auto-refresh";
import { AdminShell } from "@/components/admin-shell";
import { getSession } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const signedIn = Boolean(session && session.role === "admin");

  return (
    <>
      {/* Ops need wrap-phase updates promptly (WrapStar start/finish/end video). */}
      <AutoRefresh intervalMs={20_000} />
      {signedIn ? <AdminShell>{children}</AdminShell> : children}
    </>
  );
}
