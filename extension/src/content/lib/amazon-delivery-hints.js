/**
 * Scrapes Amazon checkout (Chewbacca / item blocks) for **Wrrapd line items only**.
 * Uses `localStorage` `wrrapd-items` (same Wrrapd rules as `buildWrrapdOrderDataFromLocalStorage`) so
 * delivery radios / copy for non-Wrrapd items never affect `amazonDeliveryDays`.
 *
 * sessionStorage wrrapd-amazon-delivery-hints-v1 → { amazonDeliveryDays, wrrapdAmazonGrouping }
 *
 * Multi-date → sorted ascending (oldest first); server +1 uses earliest by default.
 */

const STORAGE_KEY = 'wrrapd-amazon-delivery-hints-v1';

function normalizeAsin(raw) {
  const t = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (t.length === 10) return t;
  return null;
}

/**
 * ASINs that are Wrrapd gift-wrap lines in the current cart (mirrors content-legacy buildWrrapd filter).
 * @returns {Set<string>}
 */
function readWrrapdCheckoutAsinsFromLocalStorage() {
  const out = new Set();
  try {
    const raw = localStorage.getItem('wrrapd-items');
    if (!raw) return out;
    const parsedItems = JSON.parse(raw);
    if (!parsedItems || typeof parsedItems !== 'object') return out;
    const itemList = Array.isArray(parsedItems) ? parsedItems : Object.values(parsedItems);
    for (const item of itemList) {
      if (!item || !item.options) continue;
      const asin = normalizeAsin(item.asin != null ? String(item.asin) : '');
      if (!asin) continue;
      for (const option of item.options) {
        if (!option) continue;
        const wrapVal = String(option.selected_wrapping_option || '').toLowerCase();
        const isOurWrappingChoice =
          wrapVal === 'wrrapd' || wrapVal === 'ai' || wrapVal === 'upload';
        const hasDesignData =
          !!option.selected_ai_design ||
          !!option.uploaded_design_path ||
          !!option.file_data_url ||
          option.checkbox_flowers === true;
        const isWrrapdLike =
          option.checkbox_wrrapd === true || (hasDesignData && isOurWrappingChoice);
        if (isWrrapdLike) out.add(asin);
      }
    }
  } catch (_) {
    /* ignore */
  }
  return out;
}

/**
 * Best-effort ASIN for an Amazon checkout line block (Chewbacca / item tile).
 * @param {Element} root
 * @returns {string | null}
 */
function extractAsinFromCheckoutItemRoot(root) {
  if (!root || root.nodeType !== 1) return null;
  const seen = root.querySelectorAll('[data-asin]');
  for (const el of seen) {
    const a = normalizeAsin(el.getAttribute('data-asin'));
    if (a) return a;
  }
  for (const aEl of root.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"], a[href*="asin="]')) {
    const href = aEl.getAttribute('href') || '';
    const m1 = href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (m1) return normalizeAsin(m1[1]);
    const m2 = href.match(/[?&]asin=([A-Z0-9]{10})/i);
    if (m2) return normalizeAsin(m2[1]);
  }
  const id = root.getAttribute('id') || '';
  if (id.includes('checkout-item-block') || id.startsWith('item-')) {
    for (const part of id.split(/[-_]/)) {
      const a = normalizeAsin(part);
      if (a) return a;
    }
  }
  return null;
}

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
  const test = new Date(year, month, day);
  if (test.getMonth() !== month || test.getDate() !== day) return null;
  /** Do not round-trip through Date getters for the string (browser TZ vs intended calendar). */
  const mo = String(month + 1).padStart(2, '0');
  const da = String(day).padStart(2, '0');
  return `${year}-${mo}-${da}`;
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

/** Epoch ms from Amazon is often UTC-midnight anchored; formatting that instant in NY can be the *previous* Eastern calendar day. */
function ymdFromEpochMsNy(ms) {
  const d = new Date(typeof ms === 'string' ? parseInt(ms, 10) : ms);
  if (Number.isNaN(d.getTime())) return null;
  const u = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0);
  const ymd = new Date(u).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
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
          const ymd = ymdFromEpochMsNy(ms);
          if (ymd) keys.add(ymd);
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
    [
      'h2.address-promise-text .break-word',
      'h2.address-promise-text span.break-word',
      '.address-promise-text .break-word',
      '[data-testid*="delivery-promise"] .break-word',
      '[data-testid*="DeliveryPromise"] .break-word',
      '.checkout-experience-delivery-promise .break-word',
    ].join(', '),
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

/** Coalesced refresh so MutationObserver storms on Amazon checkout do not peg the main thread. */
let wrrapdHintsRefreshScheduled = false;
function refreshWrrapdAmazonDeliveryHints() {
  try {
    if (!location.hostname.includes('amazon.com')) return;
    const wrrapdAsins = readWrrapdCheckoutAsinsFromLocalStorage();
    const grouping = 'earliest';
    if (wrrapdAsins.size === 0) {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (_) {
        /* ignore */
      }
      return;
    }

    const roots = collectOrderItemRoots();
    const allKeys = new Set();
    for (const root of roots) {
      const domAsin = extractAsinFromCheckoutItemRoot(root);
      if (!domAsin || !wrrapdAsins.has(domAsin)) continue;
      if (!isWrrapdItemContainer(root)) continue;
      for (const k of extractDateKeysFromContainer(root)) allKeys.add(k);
    }
    const sorted = [...allKeys].sort();
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

function scheduleRefreshWrrapdAmazonDeliveryHints() {
  if (wrrapdHintsRefreshScheduled) return;
  wrrapdHintsRefreshScheduled = true;
  setTimeout(() => {
    wrrapdHintsRefreshScheduled = false;
    refreshWrrapdAmazonDeliveryHints();
  }, 450);
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
  scheduleRefreshWrrapdAmazonDeliveryHints();
  const t = setInterval(() => scheduleRefreshWrrapdAmazonDeliveryHints(), 2500);
  setTimeout(() => clearInterval(t), 180000);
  try {
    const obs = new MutationObserver(() => scheduleRefreshWrrapdAmazonDeliveryHints());
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
