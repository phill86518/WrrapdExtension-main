"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import {
  dollarsToCents,
  postBuyAction,
  restoreWorkflow,
  saveBuyConfig,
  saveWorkflow,
  type BuyConfig,
  type WorkflowStep,
} from "@/lib/buy-for-you-admin";

const BASE = "/admin/buy-for-you";

async function adminName(next: string) {
  const session = await requireAdminSession();
  if (!session) redirect(`/admin?next=${encodeURIComponent(next)}`);
  return session.name || "admin";
}

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

function back(path: string, result: { ok: true; msg: string } | { ok: false; err: string }): never {
  revalidatePath(BASE);
  revalidatePath(path);
  const q = result.ok ? `msg=${encodeURIComponent(result.msg)}` : `err=${encodeURIComponent(result.err)}`;
  redirect(`${path}${path.includes("?") ? "&" : "?"}${q}`);
}

async function run(path: string, okMsg: string, fn: () => Promise<unknown>): Promise<never> {
  let result: { ok: true; msg: string } | { ok: false; err: string };
  try {
    await fn();
    result = { ok: true, msg: okMsg };
  } catch (e) {
    result = { ok: false, err: e instanceof Error ? e.message : "Something went wrong" };
  }
  back(path, result);
}

function batchPath(fd: FormData) {
  const id = str(fd, "batchId").toUpperCase();
  if (!/^WB-[A-Z0-9]{6,20}$/.test(id)) redirect(BASE);
  return { id, path: `${BASE}/${id}` };
}

export async function saveConfigAction(fd: FormData) {
  const path = `${BASE}/settings`;
  const by = await adminName(path);
  const cap = dollarsToCents(fd.get("merchandiseCap"));
  const itemCap = dollarsToCents(fd.get("perItemCap"));
  const config: Partial<BuyConfig> = {
    mode: (["off", "test", "live"].includes(str(fd, "mode")) ? str(fd, "mode") : "off") as BuyConfig["mode"],
    previewCode: str(fd, "previewCode"),
    maxLinks: Number(str(fd, "maxLinks")) || 5,
    ...(cap != null ? { merchandiseCapCents: cap } : {}),
    ...(itemCap != null ? { perItemCapCents: itemCap } : {}),
    quoteWaitMinutes: Number(str(fd, "quoteWaitMinutes")) || 20,
    allowElectronics: fd.get("allowElectronics") === "on",
    allowedRetailers: fd.getAll("allowedRetailers").map(String),
    automatedQuoteRetailers: fd.getAll("automatedQuoteRetailers").map(String),
    teamAlertEmails: str(fd, "teamAlertEmails")
      .split(/[\s,;]+/)
      .filter(Boolean),
  };
  await run(path, "Settings saved.", () => saveBuyConfig(config, by));
}

export async function quoteAction(fd: FormData) {
  const { id, path } = batchPath(fd);
  const by = await adminName(path);
  const retailer = str(fd, "retailer");
  const lineIds = str(fd, "lineIds").split(",").filter(Boolean);
  const itemPrices: Record<string, number | null> = {};
  const lines: Record<string, Record<string, unknown>> = {};
  const unavailable: string[] = [];
  for (const lid of lineIds) {
    if (fd.get(`drop_${lid}`) === "on") {
      unavailable.push(lid);
      continue;
    }
    itemPrices[lid] = dollarsToCents(fd.get(`price_${lid}`));
    const patch: Record<string, unknown> = { isElectronics: fd.get(`elec_${lid}`) === "on" };
    for (const k of ["title", "imageUrl", "variantLabel", "category"]) {
      const v = str(fd, `${k}_${lid}`);
      if (v) patch[k] = v;
    }
    lines[lid] = patch;
  }
  const shippingOptions = [0, 1, 2, 3]
    .map((i) => ({
      label: str(fd, `shipLabel_${i}`),
      cents: dollarsToCents(fd.get(`shipCost_${i}`)),
      arrivalDate: str(fd, `shipArrival_${i}`),
      taxCents: dollarsToCents(fd.get(`shipTax_${i}`)),
    }))
    .filter((o) => o.label || o.cents != null);
  await run(path, "Quote sent to the shopper.", () =>
    postBuyAction(id, "quote", {
      retailer,
      itemPrices,
      shippingOptions,
      taxCents: dollarsToCents(fd.get("taxCents")),
      retailerTotalCents: dollarsToCents(fd.get("retailerTotal")),
      note: str(fd, "note"),
      lines,
      unavailable,
      unavailableReason: "desk_unavailable",
      by,
    }),
  );
}

export async function unavailableAction(fd: FormData) {
  const { id, path } = batchPath(fd);
  const by = await adminName(path);
  await run(path, "Marked unavailable. The shopper sees it now.", () =>
    postBuyAction(id, "unavailable", { retailer: str(fd, "retailer"), reason: str(fd, "reason") || "desk_unavailable", by }),
  );
}

export async function placedAction(fd: FormData) {
  const { id, path } = batchPath(fd);
  const by = await adminName(path);
  await run(path, "Retailer order recorded and sent to Orders.", async () => {
    const out = await postBuyAction(id, "placed", {
      retailer: str(fd, "retailer"),
      retailerOrderNumber: str(fd, "retailerOrderNumber"),
      retailerTotalCents: dollarsToCents(fd.get("retailerTotal")),
      arrivalDate: str(fd, "arrivalDate"),
      by,
    });
    const failed = (out.ingest || []).filter((r) => !r.ok);
    if (failed.length) throw new Error(`Recorded, but sending to Orders failed: ${failed.map((f) => f.reason).join("; ")}. Use Retry.`);
  });
}

export async function retryIngestAction(fd: FormData) {
  const { id, path } = batchPath(fd);
  const by = await adminName(path);
  await run(path, "Orders are up to date.", async () => {
    const out = await postBuyAction(id, "retry-ingest", { by });
    const failed = (out.ingest || []).filter((r) => !r.ok);
    if (failed.length) throw new Error(`Still failing: ${failed.map((f) => f.reason).join("; ")}`);
  });
}

export async function cancelGroupAction(fd: FormData) {
  const { id, path } = batchPath(fd);
  const by = await adminName(path);
  if (str(fd, "confirm").toUpperCase() !== "REFUND") back(path, { ok: false, err: 'Type REFUND to confirm the cancellation.' });
  await run(path, "Cancelled and refunded.", () =>
    postBuyAction(id, "cancel-group", {
      retailer: str(fd, "retailer"),
      requestId: str(fd, "requestId"),
      retailerCancelled: fd.get("retailerCancelled") === "on",
      wrapDocumented: fd.get("wrapDocumented") === "on",
      reason: str(fd, "reason"),
      by,
    }),
  );
}

export async function returnRequestAction(fd: FormData) {
  const { id, path } = batchPath(fd);
  const by = await adminName(path);
  await run(path, "Return request logged.", () =>
    postBuyAction(id, "return-request", {
      lineId: str(fd, "lineId"),
      deliveredAt: str(fd, "deliveredAt"),
      caller: str(fd, "caller"),
      condition: str(fd, "condition"),
      note: str(fd, "note"),
      by,
    }),
  );
}

export async function returnRefundAction(fd: FormData) {
  const { id, path } = batchPath(fd);
  const by = await adminName(path);
  await run(path, "Return refunded.", () =>
    postBuyAction(id, "return-refund", {
      lineId: str(fd, "lineId"),
      requestId: str(fd, "requestId"),
      notNonReturnable: fd.get("notNonReturnable") === "on",
      retailerAccepted: fd.get("retailerAccepted") === "on",
      backResalable: fd.get("backResalable") === "on",
      retailerRefundedShipping: fd.get("retailerRefundedShipping") === "on",
      reason: str(fd, "reason"),
      by,
    }),
  );
}

function manualBatch(fd: FormData) {
  const path = `${BASE}/manual`;
  const id = str(fd, "batchId").toUpperCase();
  if (!/^WB-[A-Z0-9]{6,20}$/.test(id)) redirect(path);
  return { id, path };
}

export async function manualAddAction(fd: FormData) {
  const { id, path } = manualBatch(fd);
  const by = await adminName(path);
  const price = dollarsToCents(fd.get("price"));
  if (!price) back(path, { ok: false, err: "Enter the item price." });
  const ship = dollarsToCents(fd.get("shipping"));
  let result: { ok: true; msg: string } | { ok: false; err: string };
  try {
    const out = (await postBuyAction(id, "manual-add", {
      lineId: str(fd, "lineId"),
      title: str(fd, "title"),
      priceCents: price,
      qty: Number(str(fd, "qty")) || 1,
      variantLabel: str(fd, "variantLabel"),
      imageUrl: str(fd, "imageUrl"),
      category: str(fd, "category"),
      ...(ship != null ? { shippingCents: ship } : {}),
      arrivalDate: str(fd, "arrivalDate"),
      by,
    })) as { mode?: string; emailed?: boolean };
    const msg =
      out.mode === "addon"
        ? out.emailed
          ? "Added. The shopper was emailed to approve and pay."
          : "Added, but the approval email did not send. Use Resend."
        : out.emailed
          ? "Added to the open cart. The shopper was emailed a link to their cart."
          : "Added to the open cart.";
    result = { ok: true, msg };
  } catch (e) {
    result = { ok: false, err: e instanceof Error ? e.message : "Something went wrong" };
  }
  back(path, result);
}

export async function manualCancelAction(fd: FormData) {
  const { id, path } = manualBatch(fd);
  const by = await adminName(path);
  await run(path, "Request closed.", () =>
    postBuyAction(id, "manual-cancel", { lineId: str(fd, "lineId"), note: str(fd, "note"), tellShopper: fd.get("tellShopper") === "on", by }),
  );
}

export async function addOnResendAction(fd: FormData) {
  const { id, path } = manualBatch(fd);
  await adminName(path);
  await run(path, "Approval email sent again.", () => postBuyAction(id, "addon-resend", { addOnId: str(fd, "addOnId") }));
}

export async function addOnPlacedAction(fd: FormData) {
  const { id, path } = manualBatch(fd);
  const by = await adminName(path);
  await run(path, "Retailer order recorded and sent to Orders.", async () => {
    const out = await postBuyAction(id, "addon-placed", {
      addOnId: str(fd, "addOnId"),
      retailerOrderNumber: str(fd, "retailerOrderNumber"),
      retailerTotalCents: dollarsToCents(fd.get("retailerTotal")),
      arrivalDate: str(fd, "arrivalDate"),
      by,
    });
    const failed = (out.ingest || []).filter((r) => !r.ok);
    if (failed.length) throw new Error(`Recorded, but sending to Orders failed: ${failed.map((f) => f.reason).join("; ")}. Use Retry.`);
  });
}

export async function addOnIngestAction(fd: FormData) {
  const { id, path } = manualBatch(fd);
  const by = await adminName(path);
  await run(path, "Sent to Orders.", async () => {
    const out = await postBuyAction(id, "addon-ingest", { addOnId: str(fd, "addOnId"), by });
    const failed = (out.ingest || []).filter((r) => !r.ok);
    if (failed.length) throw new Error(`Still failing: ${failed.map((f) => f.reason).join("; ")}`);
  });
}

export async function restoreWorkflowAction(fd: FormData) {
  const path = `${BASE}/settings`;
  const by = await adminName(path);
  const retailer = str(fd, "retailer");
  const version = Number(str(fd, "version"));
  await run(path, `Restored version ${version}.`, () => restoreWorkflow(retailer, version, by));
}

export async function saveWorkflowAction(fd: FormData) {
  const path = `${BASE}/settings`;
  const by = await adminName(path);
  let steps: WorkflowStep[];
  try {
    steps = JSON.parse(str(fd, "steps"));
    if (!Array.isArray(steps)) throw new Error();
  } catch {
    back(path, { ok: false, err: "Steps must be a JSON list." });
  }
  await run(path, "New workflow version saved.", () =>
    saveWorkflow(str(fd, "retailer"), steps, str(fd, "note"), fd.get("verified") === "on", by),
  );
}
