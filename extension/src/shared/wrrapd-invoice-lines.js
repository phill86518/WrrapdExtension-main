/**
 * Customer-facing Wrrapd payment summary line items (shared across retailers).
 * AI/upload fees are rolled into the gift-wrap line label, not separate rows.
 */

/**
 * @param {Array<{ wrapPref?: string, flowers?: boolean }>} choices
 * @param {{ giftWrapBase: number, customDesignAi: number, customDesignUpload: number, flowers: number }} unitPrices
 * @returns {Array<{ label: string, amount: string }>}
 */
export function buildGiftWrapInvoiceRows(choices, unitPrices) {
  const p = unitPrices;
  const list = Array.isArray(choices) && choices.length > 0 ? choices : [{ wrapPref: "wrrapd", flowers: false }];

  let stdCount = 0;
  let aiCount = 0;
  let uploadCount = 0;
  let flowerCount = 0;

  for (const ch of list) {
    const wrap = ch.wrapPref || "wrrapd";
    if (wrap === "ai") aiCount++;
    else if (wrap === "upload") uploadCount++;
    else stdCount++;
    if (ch.flowers) flowerCount++;
  }

  /** @type {Array<{ label: string, amount: string }>} */
  const rows = [];

  if (stdCount > 0) {
    const xN = stdCount > 1 ? ` (×${stdCount})` : "";
    rows.push({
      label: `Gift-wrapping${xN}`,
      amount: `$${(p.giftWrapBase * stdCount).toFixed(2)}`,
    });
  }
  if (aiCount > 0) {
    const xN = aiCount > 1 ? ` (×${aiCount})` : "";
    const unit = p.giftWrapBase + p.customDesignAi;
    rows.push({
      label: `Gift-wrapping (AI assisted)${xN}`,
      amount: `$${(unit * aiCount).toFixed(2)}`,
    });
  }
  if (uploadCount > 0) {
    const xN = uploadCount > 1 ? ` (×${uploadCount})` : "";
    const unit = p.giftWrapBase + p.customDesignUpload;
    rows.push({
      label: `Gift-wrapping (custom)${xN}`,
      amount: `$${(unit * uploadCount).toFixed(2)}`,
    });
  }
  if (flowerCount > 0) {
    const xF = flowerCount > 1 ? ` (×${flowerCount})` : "";
    rows.push({
      label: `Flowers${xF}`,
      amount: `$${(p.flowers * flowerCount).toFixed(2)}`,
    });
  }

  return rows;
}
