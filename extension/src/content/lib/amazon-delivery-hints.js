/**
 * Scrapes Amazon checkout (Chewbacca / item blocks) for Wrrapd warehouse line items.
 * sessionStorage wrrapd-amazon-delivery-hints-v1 → { amazonDeliveryDays, wrrapdAmazonGrouping }
 *
 * Multi-date → grouping "pending": server emails/SMS customer; default schedule = combined (last Amazon date).
 */

const STORAGE_KEY = 'wrrapd-amazon-delivery-hints-v1';

function isWrrapdItemContainer(container) {
  const containerText = container.textContent || '';
  const hasWrrapdRecipient =
    containerText.includes('Delivering to Wrrapd') ||
    (containerText.includes('Wrrapd') && containerText.includes('PO BOX 26067')) ||
    (containerText.includes('Wrrapd') && containerText.includes('32226-6067')) ||
    (containerText.includes('Wrrapd') && containerText.includes('JACKSONVILLE')) ||
    containerText.includes('Wrrapd PO BOX 26067');
  const hasNonWrrapdRecipient =
    containerText.includes('Delivering to') &&
    !containerText.includes('Wrrapd') &&
    containerText.match(/Delivering to\s+[A-Z][a-z]+/);
  return hasWrrapdRecipient && !hasNonWrrapdRecipient;
}

const MONTHS = [
  ['january', 0],
  ['february', 1],
  ['march', 2],
  ['april', 3],
  ['may', 4],
  ['june', 5],
  ['july', 6],
  ['august', 7],
  ['september', 8],
  ['october', 9],
  ['november', 10],
  ['december', 11],
  ['jan', 0],
  ['feb', 1],
  ['mar', 2],
  ['apr', 3],
  ['jun', 5],
  ['jul', 6],
  ['aug', 7],
  ['sep', 8],
  ['oct', 9],
  ['nov', 10],
  ['dec', 11],
];

function ymdTodayNy() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function ymdTomorrowNy() {
  const t = Date.now() + 86400000;
  return new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function parseMonthDayYear(text, ref = new Date()) {
  const re =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:,?\s*(\d{4}))?\b/i;
  const m = text.match(re);
  if (!m) return null;
  const monStr = m[1].toLowerCase().replace(/\.$/, '');
  const day = parseInt(m[2], 10);
  let year = m[3] ? parseInt(m[3], 10) : ref.getFullYear();
  let month = -1;
  for (const [name, idx] of MONTHS) {
    if (monStr === name || monStr.startsWith(name)) {
      month = idx;
      break;
    }
  }
  if (month < 0 || day < 1 || day > 31) return null;
  if (!m[3]) {
    const candidate = new Date(year, month, day);
    const skew = ref.getTime() - candidate.getTime();
    if (skew > 90 * 86400000) year += 1;
    else if (skew < -300 * 86400000) year -= 1;
  }
  const d = new Date(year, month, day);
  if (d.getMonth() !== month || d.getDate() !== day) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function parseArrivingOrToday(text) {
  const t = (text || '').trim();
  if (/^Arriving\s+Today\b/i.test(t) || /\bToday\b/i.test(t.substring(0, 25))) return ymdTodayNy();
  if (/^Arriving\s+Tomorrow\b/i.test(t) || /^\s*Tomorrow\b/i.test(t)) return ymdTomorrowNy();
  const cal = parseMonthDayYear(t);
  if (cal) return cal;
  const m = t.match(/Arriving\s+([A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4})/i);
  if (m) return parseMonthDayYear(m[1]);
  return null;
}

function extractFromPostData(itemContainer) {
  const keys = new Set();
  for (const el of itemContainer.querySelectorAll('[data-postdata]')) {
    const raw = el.getAttribute('data-postdata');
    if (!raw) continue;
    try {
      const j = JSON.parse(raw);
      const pm = j.promiseMinShipmentDate ?? j.promiseMaxShipmentDate;
      if (pm != null) {
        const ms = typeof pm === 'string' ? parseInt(pm, 10, 10) : Number(pm);
        if (Number.isFinite(ms)) {
          const ymd = new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
          if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) keys.add(ymd);
        }
      }
    } catch (_) {
      /* ignore */
    }
  }
  return keys;
}

/**
 * Prefer headline / column delivery copy over `data-postdata` shipment timestamps.
 * Mixing both often produced a date **one day after** the Amazon-shown "Arriving …" line,
 * which then became **+2 calendar days** after the server applies Wrrapd's +1 rule.
 */
function extractDateKeysFromContainer(itemContainer) {
  const keys = new Set();

  for (const el of itemContainer.querySelectorAll(
    'h2.address-promise-text .break-word, h2.address-promise-text span.break-word, .address-promise-text .break-word',
  )) {
    const k = parseArrivingOrToday(el.textContent || '');
    if (k) keys.add(k);
  }

  const radios = Array.from(itemContainer.querySelectorAll('input[type="radio"]'));
  for (const r of radios) {
    if (!r.checked) continue;
    const label = r.closest('label');
    const scope = label || r.parentElement;
    const col = scope?.querySelector('.col-delivery-message');
    const t = col?.textContent || scope?.textContent || '';
    const k = parseMonthDayYear(t) || parseArrivingOrToday(t);
    if (k) keys.add(k);
  }

  for (const el of itemContainer.querySelectorAll('.col-delivery-message span, .delivery-message-rush span')) {
    const t = el.textContent || '';
    if (t.length > 120) continue;
    const k = parseMonthDayYear(t) || parseArrivingOrToday(t);
    if (k) keys.add(k);
  }

  if (keys.size === 0) {
    for (const k of extractFromPostData(itemContainer)) keys.add(k);
  }

  return [...keys];
}

function collectOrderItemRoots() {
  const selectors = [
    '[id^="checkout-item-block-"]',
    '.checkout-experience-item-block',
    '[id^="item-"]',
    '[data-testid*="item"]',
    '.spc-order-item',
    '[class*="order-item"]',
  ];
  const seen = new Set();
  const out = [];
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      if (seen.has(el)) continue;
      seen.add(el);
      out.push(el);
    }
  }
  return out;
}

function refreshWrrapdAmazonDeliveryHints() {
  try {
    if (!location.hostname.includes('amazon.com')) return;
    const roots = collectOrderItemRoots();
    const allKeys = new Set();
    for (const root of roots) {
      if (!isWrrapdItemContainer(root)) continue;
      for (const k of extractDateKeysFromContainer(root)) allKeys.add(k);
    }
    const sorted = [...allKeys].sort();
    const grouping = sorted.length > 1 ? 'pending' : 'earliest';
    const payload = {
      amazonDeliveryDays: sorted,
      wrrapdAmazonGrouping: grouping,
      updatedAt: Date.now(),
      href: location.href,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('[wrrapd-amazon-delivery-hints]', e);
  }
}

function shouldWatchPage() {
  const p = `${location.pathname}${location.search}`.toLowerCase();
  return (
    p.includes('checkout') ||
    p.includes('buy') ||
    p.includes('order') ||
    p.includes('cart') ||
    p.includes('gp/')
  );
}

function bootAmazonDeliveryHints() {
  if (!shouldWatchPage()) return;
  refreshWrrapdAmazonDeliveryHints();
  const t = setInterval(refreshWrrapdAmazonDeliveryHints, 2500);
  setTimeout(() => clearInterval(t), 180000);
  try {
    const obs = new MutationObserver(() => refreshWrrapdAmazonDeliveryHints());
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 120000);
  } catch (_) {
    /* ignore */
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootAmazonDeliveryHints);
  } else {
    bootAmazonDeliveryHints();
  }
}
