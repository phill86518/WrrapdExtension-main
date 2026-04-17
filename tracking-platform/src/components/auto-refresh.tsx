"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Keeps server-rendered admin/driver views fresh (no WebSocket: interval + tab focus). */
export function AutoRefresh({ intervalMs = 600_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      router.refresh();
    }, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs]);

  return null;
}
