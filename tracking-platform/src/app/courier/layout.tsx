import { AutoRefresh } from "@/components/auto-refresh";

export default function CourierLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Pickup-ready jobs appear when WrapStar finishes wrapping / ends video. */}
      <AutoRefresh intervalMs={20_000} />
      {children}
    </>
  );
}
