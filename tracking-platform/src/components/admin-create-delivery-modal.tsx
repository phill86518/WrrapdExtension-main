"use client";

import { useEffect, useState } from "react";
import { AdminCreateDeliveryForm } from "@/components/admin-create-delivery-form";

export function AdminCreateDeliveryModal({
  action,
  createError,
}: {
  action: (formData: FormData) => void | Promise<void>;
  createError?: string | null;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (createError) setOpen(true);
  }, [createError]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-zinc-800 to-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-zinc-900/25 ring-1 ring-white/10 transition hover:from-zinc-700 hover:to-zinc-800 hover:shadow-lg hover:shadow-zinc-900/30"
      >
        <span className="text-lg leading-none opacity-90">+</span>
        Create manual delivery
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/60 p-4 backdrop-blur-sm sm:items-center"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[min(90vh,720px)] w-full max-w-xl overflow-y-auto rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xl shadow-zinc-900/20"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-create-delivery-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="admin-create-delivery-title" className="text-lg font-semibold tracking-tight text-zinc-900">
                  Create manual delivery
                </h2>
                <p className="mt-1 text-sm text-zinc-500">Rare ops entry — same fields as a scheduled stop.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
                aria-label="Close"
              >
                <span className="block text-xl leading-none">×</span>
              </button>
            </div>
            <AdminCreateDeliveryForm action={action} />
            {createError && (
              <p className="mt-4 rounded-xl border border-red-200/80 bg-red-50 px-3 py-2 text-sm text-red-900">
                {createError}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
