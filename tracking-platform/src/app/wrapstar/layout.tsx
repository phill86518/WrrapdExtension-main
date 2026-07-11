import { AutoRefresh } from "@/components/auto-refresh";

export default function WrapstarLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AutoRefresh intervalMs={600_000} />
      {children}
    </>
  );
}
