import { wrrapdIsAmazonAccountSignedIn } from './amazon-account-signed-in.js';

/**
 * Scrapes Amazon checkout for **Wrrapd-address line items only** (never other recipients’ dates).
 * sessionStorage wrrapd-amazon-delivery-hints-v1 → { amazonDeliveryDays, wrrapdAmazonGrouping }
 *
 * Per Wrrapd shipment: use the **checked** delivery-speed radio’s date (Amazon’s chosen option).
 * Multiple Wrrapd lines → collect those dates, sort, grouping "latest" (max Amazon day + 1 on server).
 * Calendar keys are YYYY-MM-DD (nominal 2:00 p.m. America/New_York downstream).
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
  if (!hasWrrapdRecipient) return false;
  /** Reject merged DOM regions that also describe shipment to someone other than Wrrapd. */
  if (/Delivering to\s/i.test(containerText)) {
    const deliverMatches = [...containerText.matchAll(/Delivering to\s+([^,\n]+)/gi)];
    for (const m of deliverMatches) {
      const frag = (m[1] || '').trim();
      if (!frag) continue;
      if (!/^Wrrapd\b/i.test(frag)) return false;
    }
  }
  return true;
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
 * Only the **selected** delivery option counts (checked radio). Do not scrape unselected
 * speed tiers or sibling non-Wrrapd blocks — that pulled Roger’s Apr 23/27 into Wrrapd’s hint array.
 */
function extractDateKeysFromContainer(itemContainer) {
  const keys = new Set();

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

  if (keys.size === 0) {
    for (const el of itemContainer.querySelectorAll(
      'h2.address-promise-text .break-word, h2.address-promise-text span.break-word, .address-promise-text .break-word',
    )) {
      const k = parseArrivingOrToday(el.textContent || '');
      if (k) {
        keys.add(k);
        break;
      }
    }
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

/** Prefer per-shipment checkout rows so we do not merge another recipient’s item tree. */
function collectWrrapdOrderItemRoots() {
  const roots = new Set();
  for (const el of document.querySelectorAll('[id^="checkout-item-block-"], .checkout-experience-item-block')) {
    if (isWrrapdItemContainer(el)) roots.add(el);
  }
  if (roots.size > 0) return [...roots];
  return collectOrderItemRoots().filter((el) => isWrrapdItemContainer(el));
}

function refreshWrrapdAmazonDeliveryHints() {
  try {
    if (!location.hostname.includes('amazon.com')) return;
    if (!wrrapdIsAmazonAccountSignedIn()) {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (_) {
        /* ignore */
      }
      return;
    }
    const roots = collectWrrapdOrderItemRoots();
    const allKeys = new Set();
    for (const root of roots) {
      for (const k of extractDateKeysFromContainer(root)) allKeys.add(k);
    }
    const sorted = [...allKeys].sort();
    const grouping = 'latest';
    const payload = {
      amazonDeliveryDays: sorted,
      wrrapdAmazonGrouping: grouping,
      updatedAt: Date.now(),
      href: location.href,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {
    /* ignore scrape errors */
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

if (typeof window !== 'undefined') {
  window.__WRRAPD_REFRESH_AMAZON_DELIVERY_HINTS__ = refreshWrrapdAmazonDeliveryHints;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootAmazonDeliveryHints);
  } else {
    bootAmazonDeliveryHints();
  }
}
