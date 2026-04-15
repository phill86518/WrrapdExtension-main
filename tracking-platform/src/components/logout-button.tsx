"use client";

export function LogoutButton({ redirectPath = "/" }: { redirectPath?: string }) {
  return (
    <button
      className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50"
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
