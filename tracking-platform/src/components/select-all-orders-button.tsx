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
      className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:bg-zinc-50 active:bg-zinc-100"
    >
      {allChecked ? "Clear all" : "Select all"}
    </button>
  );
}
