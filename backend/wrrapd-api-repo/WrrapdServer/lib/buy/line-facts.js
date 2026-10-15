/** Shared cart-line rules: quantity 1–10, and the size/color phrase shown on the item. */

const MAX_QTY = 10;

function clampQty(n) {
    const v = Math.round(Number(n));
    if (!Number.isInteger(v) || v < 1) return 1;
    return Math.min(MAX_QTY, v);
}

/** Adds copies of an item that is already on the list. */
function bumpQty(current, add) {
    const prev = clampQty(current);
    const extra = Math.max(1, Math.round(Number(add)) || 1);
    const qty = Math.min(MAX_QTY, prev + extra);
    const notice = prev >= MAX_QTY
        ? `You already have ${MAX_QTY} of this item.`
        : `You already have this item. Quantity is now ${qty}.`;
    return { qty, notice };
}

function noticeFor(list) {
    const notices = (list || []).filter(Boolean);
    if (notices.length <= 1) return notices[0] || '';
    if (notices.every((m) => m === notices[0])) return notices[0];
    return 'You already have these items. Quantities were increased.';
}

/** Selected size, color, and similar choices, as "Small, Black". */
function variantPhrase(groups) {
    return (groups || [])
        .filter((g) => g && g.selected && Array.isArray(g.options) && g.options.includes(g.selected))
        .map((g) => String(g.selected).trim())
        .filter(Boolean)
        .join(', ')
        .slice(0, 200);
}

module.exports = { MAX_QTY, clampQty, bumpQty, noticeFor, variantPhrase };
