"use client";

export function LogoutButton({ redirectPath = "/" }: { redirectPath?: string }) {
  return (
    <button
      className="rounded border px-3 py-1 text-sm"
      type="button"
      onClick={async () => {
        await fetch("/api/logout", { method: "POST" });
        window.location.assign(redirectPath);
      }}
    >
      Sign out
    </button>
  );
}
