"use client";

import { useEffect, useState } from "react";
import { AdminCreateDeliveryForm } from "@/components/admin-create-delivery-form";

export function AdminCreateDeliverySection({
  createOrderAction,
  createError,
}: {
  createOrderAction: (formData: FormData) => void | Promise<void>;
  createError?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (createError) setOpen(true);
  }, [createError]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-700 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/40 ring-1 ring-white/30 transition hover:from-emerald-400 hover:to-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf8f4] active:scale-[0.98]"
      >
        <span className="text-lg leading-none font-light opacity-90">+</span>
        Manual delivery
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-delivery-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] transition-opacity"
            aria-label="Close dialog"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 max-h-[min(90vh,720px)] w-full max-w-2xl overflow-y-auto rounded-2xl border-2 border-[#1a3d2e]/35 bg-[#faf8f4] p-6 shadow-2xl shadow-black/25 ring-1 ring-white/50">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="manual-delivery-title" className="text-lg font-bold tracking-tight text-[#0f241c]">
                  Create scheduled delivery
                </h2>
                <p className="mt-0.5 text-sm font-medium text-[#2d4a38]">Rare manual entry for ops-created stops</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl p-2 text-[#2d5a47] transition hover:bg-[#1a3d2e]/10 hover:text-[#0f241c]"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <AdminCreateDeliveryForm action={createOrderAction} inModal />
            {createError && (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{createError}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
