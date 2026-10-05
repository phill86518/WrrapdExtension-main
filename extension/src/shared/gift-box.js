/**
 * Loose-item box decisions stay on the server. This module only asks.
 */

const QUOTE_URL = "https://api.wrrapd.com/api/gift-box-quote";

let chargeUsd = 0;
const needsByTitle = new Map();

export function boxChargeUsd() {
  return chargeUsd;
}

export function itemNeedsBox(input) {
  const title = String(input?.title || "").trim().toLowerCase();
  if (!title) return input?.needsGiftBox === true && needsByTitle.get("") === true;
  return needsByTitle.get(title) === true;
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
  const response = await fetch(QUOTE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: list }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("box");
  chargeUsd = Number(body.boxChargeUsd) > 0 ? Number(body.boxChargeUsd) : 0;
  needsByTitle.clear();
  for (const row of Array.isArray(body.items) ? body.items : []) {
    needsByTitle.set(String(row.title || "").trim().toLowerCase(), row.needsBox === true);
  }
  return { boxCount: Number(body.boxCount) || 0, boxChargeUsd: chargeUsd };
}

export function countLooseBoxes(lines) {
  const list = Array.isArray(lines) ? lines : [];
  return list.filter((line) => itemNeedsBox(line)).length;
}
