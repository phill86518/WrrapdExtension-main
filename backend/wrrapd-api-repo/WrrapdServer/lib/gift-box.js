/**
 * Same loose-item rule as extension/src/shared/gift-box.js.
 * Boxed retail packages do not get the box charge. Clothes and other loose items do.
 */

const BOX_CHARGE_USD = 0.99;

function looseItemNeedsBox(input) {
    const title = String((input && input.title) || "");
    const category = String((input && (input.category || input.itemCategory)) || "");
    const text = `${category} ${title}`.toLowerCase();
    if (input && input.flowers === true) return false;
    if (!title.trim() && !category.trim()) return !!(input && input.needsGiftBox === true);
    if (/\b(bouquet|flowers)\b/.test(text)) return false;
    if (/\b(book|paperback|hardcover|novel|manga)\b/.test(text)) return false;
    if (/\b(lego|board game|jigsaw|puzzle|boxed set)\b/.test(text)) return false;
    if (/\b(laptop|monitor|printer|headphone|earbud|earbuds|speaker|tablet|kindle)\b/.test(text)) return false;
    return true;
}

module.exports = { BOX_CHARGE_USD, looseItemNeedsBox };
