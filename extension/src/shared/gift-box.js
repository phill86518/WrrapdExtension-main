/**
 * Whether a gift needs a cardboard box and tissue before the paper is cut.
 * Boxed retail packages (books, LEGO, laptops, headphones) do not.
 * Folded clothes always do — use a shirt box, not the garment measurements.
 */

export const BOX_CHARGE_USD = 0.99;

export function looseItemNeedsBox(input) {
  const title = String(input?.title || "");
  const category = String(input?.category || input?.itemCategory || "");
  const text = `${category} ${title}`.toLowerCase();
  if (input?.flowers === true) return false;
  if (!title.trim() && !category.trim()) return input?.needsGiftBox === true;
  if (/\b(bouquet|flowers)\b/.test(text)) return false;
  if (/\b(book|paperback|hardcover|novel|manga)\b/.test(text)) return false;
  if (/\b(lego|board game|jigsaw|puzzle|boxed set)\b/.test(text)) return false;
  if (/\b(laptop|monitor|printer|headphone|earbud|earbuds|speaker|tablet|kindle)\b/.test(text)) return false;
  return true;
}

export function countLooseBoxes(lines) {
  const list = Array.isArray(lines) ? lines : [];
  return list.filter((line) => looseItemNeedsBox(line)).length;
}
