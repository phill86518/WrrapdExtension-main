import type { Order, WrapOrderPhase } from "./types";

/** Client-safe helpers (no Node / Firestore imports). */

export function isCustomPrintDesign(order: Order): boolean {
  return Boolean(
    order.lineItems?.some(
      (li) =>
        li.wrappingOption === "ai" ||
        li.wrappingOption === "upload" ||
        li.wrappingDesignImageUrl ||
        li.wrappingDesignStoragePath ||
        li.uploadedDesignPath,
    ),
  );
}

export function wrapPhaseLabel(phase: WrapOrderPhase | undefined): string {
  switch (phase) {
    case "recording":
      return "Recording";
    case "label_ready":
      return "Print barcode";
    case "complete":
      return "Done";
    default:
      return "Queued";
  }
}
