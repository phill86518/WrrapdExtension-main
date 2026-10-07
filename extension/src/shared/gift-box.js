/**
 * Loose-item box decisions stay on the server. This module only asks.
 */

const QUOTE_URL = "https://api.wrrapd.com/api/gift-box-quote";

let chargeUsd = 0;
const needsByTitle = new Map();

export function boxChargeUsd() {
  return chargeUsd;
}

function boxKey(title, flowers) {
  return `${flowers === true ? 1 : 0}|${String(title || "").slice(0, 300).trim().toLowerCase()}`;
}

export function itemNeedsBox(input) {
  return needsByTitle.get(boxKey(input?.title, input?.flowers)) === true;
}

/** @deprecated use itemNeedsBox. Kept so older call shapes still compile during this version. */
export function looseItemNeedsBox(input) {
  return itemNeedsBox(input);
}

export async function refreshBoxQuote(items) {
  const list = (Array.isArray(items) ? items : []).slice(0, 40).map((item) => ({
    title: String(item?.title || "").slice(0, 300),
    category: String(item?.category || item?.itemCategory || "").slice(0, 120),
    flowers: item?.flowers === true,
    needsGiftBox: item?.needsGiftBox === true,
  }));
  if (!list.length) return { boxCount: 0, boxChargeUsd: chargeUsd };
  const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(4000) : undefined;
  const response = await fetch(QUOTE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "omit",
    body: JSON.stringify({ items: list }),
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("box");
  chargeUsd = Number(body.boxChargeUsd) > 0 ? Number(body.boxChargeUsd) : 0;
  needsByTitle.clear();
  const rows = Array.isArray(body.items) ? body.items : [];
  list.forEach((item, i) => {
    needsByTitle.set(boxKey(item.title, item.flowers), rows[i]?.needsBox === true);
  });
  return { boxCount: Number(body.boxCount) || 0, boxChargeUsd: chargeUsd };
}

export function countLooseBoxes(lines) {
  const list = Array.isArray(lines) ? lines : [];
  return list.filter((line) => itemNeedsBox(line)).length;
}
