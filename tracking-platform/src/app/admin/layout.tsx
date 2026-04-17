import { AutoRefresh } from "@/components/auto-refresh";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AutoRefresh intervalMs={600_000} />
      {children}
    </>
  );
}
