"use client";

export function LogoutButton({ redirectPath = "/" }: { redirectPath?: string }) {
  return (
    <button
      className="inline-flex items-center justify-center rounded-xl border-2 border-[#1a3d2e]/60 bg-white px-5 py-2.5 text-sm font-bold text-[#0f241c] shadow-md transition hover:bg-[#1a3d2e]/10 hover:border-[#1a3d2e] active:scale-[0.98]"
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
