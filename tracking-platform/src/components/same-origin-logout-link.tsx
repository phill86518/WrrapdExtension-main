"use client";

import { useState } from "react";

/** Same behavior as LogoutButton — never uses GET /api/logout (GET does not clear session). */
export function SameOriginLogoutLink({
  redirectPath,
  className,
  children,
}: {
  redirectPath: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/logout", { method: "POST", credentials: "include", cache: "no-store" });
        } finally {
          window.location.assign(redirectPath);
        }
      }}
    >
      {children}
    </button>
  );
}
