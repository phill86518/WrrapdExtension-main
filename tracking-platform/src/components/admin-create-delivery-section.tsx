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
        className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-indigo-600 to-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:from-indigo-500 hover:to-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
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
          <div className="relative z-10 max-h-[min(90vh,720px)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xl shadow-slate-900/15">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="manual-delivery-title" className="text-lg font-semibold tracking-tight text-slate-900">
                  Create scheduled delivery
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">Rare manual entry for ops-created stops</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
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
