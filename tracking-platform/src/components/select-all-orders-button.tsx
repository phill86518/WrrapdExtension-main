"use client";

import { useState } from "react";

export function SelectAllOrdersButton({ formId }: { formId: string }) {
  const [allChecked, setAllChecked] = useState(false);

  const toggle = () => {
    const boxes = Array.from(
      document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="orderIds"][form="${formId}"]`),
    );
    if (!boxes.length) return;
    const next = !allChecked;
    boxes.forEach((box) => {
      box.checked = next;
    });
    setAllChecked(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-slate-900"
    >
      {allChecked ? "Clear all" : "Select all"}
    </button>
  );
}
