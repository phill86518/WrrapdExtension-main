import { AutoRefresh } from "@/components/auto-refresh";

export default function WrapriderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Wrap queue + pickup-ready deliveries both change while on shift. */}
      <AutoRefresh intervalMs={20_000} />
      {children}
    </>
  );
}
