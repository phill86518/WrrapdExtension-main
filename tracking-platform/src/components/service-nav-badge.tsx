"use client";

import { useEffect, useState } from "react";

export function ServiceNavBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/service", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { summary?: { needsReply?: number } };
        if (!cancelled) setCount(data.summary?.needsReply || 0);
      } catch {
        /* nav badge is optional */
      }
    };
    void load();
    const timer = window.setInterval(load, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (count <= 0) return null;
  return (
    <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
