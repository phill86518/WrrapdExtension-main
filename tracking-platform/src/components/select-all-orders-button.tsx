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
      className="inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-[#1a3d2e] to-[#0f241c] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#0f172a]/40 ring-1 ring-white/20 transition hover:from-[#234d3c] hover:to-[#1a3d2e] active:scale-[0.98]"
    >
      {allChecked ? "Clear all" : "Select all"}
    </button>
  );
}
