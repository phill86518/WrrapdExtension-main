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
      className="rounded-md border border-amber-700 bg-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-200 active:translate-y-px"
    >
      {allChecked ? "Clear all" : "Select all"}
    </button>
  );
}
