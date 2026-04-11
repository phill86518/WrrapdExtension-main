"use client";

import { useEffect, useState } from "react";

/** Logout URL using the browser’s real origin (avoids bad Host/localhost from the server). */
export function SameOriginLogoutLink({
  redirectPath,
  className,
  children,
}: {
  redirectPath: string;
  className?: string;
  children: React.ReactNode;
}) {
  const qs = `?redirect=${encodeURIComponent(redirectPath)}`;
  const [href, setHref] = useState(`/api/logout${qs}`);

  useEffect(() => {
    setHref(`${window.location.origin}/api/logout${qs}`);
  }, [qs]);

  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
