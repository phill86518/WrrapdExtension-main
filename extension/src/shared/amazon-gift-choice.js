/**
 * A saved Amazon gift may drive the payment summary only when the shopper
 * chose Wrrapd, the choice is still fresh, and that product is in this order.
 * Account switches are detected by the caller (the Hello greeting changed).
 */

export const AMAZON_GIFT_CHOICE_TTL_MS = 30 * 60 * 1000;

function optionOn(value) {
  return value === true || value === 1 || value === 'true' || value === '1';
}

export function optionHasWrrapdCharges(opt) {
  if (!opt || typeof opt !== 'object') return false;
  return optionOn(opt.checkbox_wrrapd) || optionOn(opt.checkbox_flowers);
}

export function giftChoiceIsCurrent(meta, now, visibleGreeting) {
  if (!meta || typeof meta.touchedAt !== 'number' || !Number.isFinite(meta.touchedAt)) return false;
  if (now - meta.touchedAt > AMAZON_GIFT_CHOICE_TTL_MS) return false;
  const saved = String(meta.greeting || '').trim().toLowerCase();
  const current = String(visibleGreeting || '').trim().toLowerCase();
  if (saved && current && saved !== current) return false;
  return true;
}

/**
 * Charged line counts only when this checkout shows that product: its ASIN
 * (Amazon keeps it in hidden `asin_*` spans on payment) or the start of its title.
 */
export function savedChargedItemIsInCheckout(item, title, page) {
  if (!item || !Array.isArray(item.options)) return false;
  if (!item.options.some(optionHasWrrapdCharges)) return false;
  const asin = String(item.asin || '').trim().toUpperCase();
  const asins = page?.asins instanceof Set ? page.asins : new Set(page?.asins || []);
  const rawText = String(page?.text || '');
  if (/^[A-Z0-9]{10}$/.test(asin)) {
    if (asins.has(asin)) return true;
    if (new RegExp(`(^|[^A-Z0-9])${asin}([^A-Z0-9]|$)`).test(rawText.toUpperCase())) return true;
  }
  const text = rawText.replace(/\s+/g, ' ').toLowerCase();
  const prefix = String(title || item.title || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 24);
  return prefix.length >= 12 && text.includes(prefix);
}

export function selectAmazonCheckoutGiftItems(allItems, page, meta, now, visibleGreeting) {
  if (!giftChoiceIsCurrent(meta, now, visibleGreeting)) return {};
  const out = {};
  for (const [title, item] of Object.entries(allItems || {})) {
    if (savedChargedItemIsInCheckout(item, title, page)) out[title] = item;
  }
  return out;
}
