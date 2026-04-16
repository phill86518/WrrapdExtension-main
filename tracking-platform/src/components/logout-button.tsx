"use client";

export function LogoutButton({ redirectPath = "/" }: { redirectPath?: string }) {
  return (
    <button
      className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
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
