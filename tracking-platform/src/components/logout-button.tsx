"use client";

export function LogoutButton({
  redirectPath = "/",
  label = "Log out",
  className = "",
  variant = "default",
}: {
  redirectPath?: string;
  label?: string;
  className?: string;
  variant?: "default" | "gold";
}) {
  const tone =
    variant === "gold"
      ? "h-14 w-full border-[#f6b933] bg-[#f6b933] text-lg text-[#0f0351] hover:bg-[#e5aa22]"
      : "border-[#1a3d2e]/60 bg-white text-[#0f241c] hover:bg-[#1a3d2e]/10 hover:border-[#1a3d2e]";
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl border-2 px-5 py-2.5 text-sm font-bold shadow-md transition active:scale-[0.98] ${tone} ${className}`}
      type="button"
      onClick={async () => {
        await fetch("/api/logout", { method: "POST", credentials: "include", cache: "no-store" });
        window.location.assign(redirectPath);
      }}
    >
      {label}
    </button>
  );
}
