/**
 * Proximity flower catalog: nearest stores → scrape → Grok rank → public choices.
 * Public titles are always anonymous ("Bouquet #N"). Real product names stay on
 * the server-side offer for admin / ops only.
 * On scrape failure or short live lists: pad with classic Publix-style bouquets.
 */
const crypto = require('crypto');
const storesLib = require('./stores');
const scrape = require('./scrape');
const grok = require('../grok-client');
const wrrapdPricing = require('../wrrapd-pricing');

const CACHE_TTL_MS = 40 * 60 * 1000;
const MIN_CHOICES = 4;
const MAX_CHOICES = 8;
const CLASSIC_DISCLAIMER =
  'Actual bouquets might differ slightly from the photos shown.';

/** @type {Map<string, { at: number, status: string, choices: any[], offers: Map<string, any>, message?: string, source?: string, disclaimer?: string }>} */
const zipCache = new Map();
/** Global offer lookup for checkout validation */
const offerById = new Map();

function chargedPrice(retail) {
  return Math.round((Number(retail) + scrape.MARKUP) * 100) / 100;
}

/** Shopper-facing choice — never expose retailer product names. */
function publicChoice(offer, index) {
  return {
    offerId: offer.offerId,
    title: `Bouquet #${index + 1}`,
    imageUrl: offer.imageUrl,
    price: offer.chargedPrice,
    designKey: offer.designKey || null,
  };
}

function flowerUnitPriceForZip(postalCode) {
  try {
    const r = wrrapdPricing.resolveWrrapdUnitPrices({ postalCode: postalCode }, '');
    const n = Number(r?.unitPrices?.flowers);
    return Number.isFinite(n) && n > 0 ? n : 17.99;
  } catch {
    return 17.99;
  }
}

function deterministicSelect(byRetailerCandidates) {
  // Target disabled as a floral supplier (Publix + Sam's only for now).
  const publix = (byRetailerCandidates.publix || []).filter((c) => c.retailPrice < scrape.CAP_PUBLIX);
  const sams = (byRetailerCandidates.sams || []).filter(
    (c) => c.isRose && c.retailPrice < scrape.CAP_SAMS_ROSES,
  );

  const hasP = publix.length > 0;
  const hasS = sams.length > 0;

  let wantP = 0;
  let wantS = 0;
  if (hasP && hasS) {
    wantP = 5;
    wantS = 2;
  } else if (hasP) {
    wantP = 8;
  } else if (hasS) {
    wantS = 8;
  }

  const pick = (arr, n) => arr.slice(0, n);
  let selected = [...pick(publix, wantP), ...pick(sams, wantS)];

  const used = new Set(selected.map((c) => `${c.retailer}:${c.sku}`));
  const pool = [...publix, ...sams].filter((c) => !used.has(`${c.retailer}:${c.sku}`));
  while (selected.length < MIN_CHOICES && pool.length) {
    selected.push(pool.shift());
  }
  if (selected.length > MAX_CHOICES) selected = selected.slice(0, MAX_CHOICES);
  return selected;
}

/**
 * Pad short live lists with classic Publix-style bouquets (extension flowers-1..4).
 * Prefer the nearby Publix store for attribution when available.
 */
function padWithClassicPublix(selected, byRetailer, unit) {
  const list = Array.isArray(selected) ? [...selected] : [];
  if (list.length >= MIN_CHOICES) return list;

  const preferStore = byRetailer.publix || byRetailer.sams || null;
  const classic = scrape.classicFourBouquets(preferStore, unit);
  const usedKeys = new Set(
    list.map((c) => c.designKey || `${c.retailer}:${c.sku}`).filter(Boolean),
  );

  for (const c of classic) {
    if (list.length >= MIN_CHOICES) break;
    const key = c.designKey || `${c.retailer}:${c.sku}`;
    if (usedKeys.has(key)) continue;
    list.push(c);
    usedKeys.add(key);
  }
  // If still short (unlikely), append remaining classic even with key overlap.
  for (const c of classic) {
    if (list.length >= MIN_CHOICES) break;
    if (list.some((x) => x.designKey && x.designKey === c.designKey)) continue;
    list.push(c);
  }
  return list.slice(0, MAX_CHOICES);
}

async function grokRank(postalCode, byRetailerCandidates, storesNearby) {
  if (!grok.isConfigured()) return null;
  const compact = {};
  for (const r of ['publix', 'sams']) {
    compact[r] = (byRetailerCandidates[r] || []).slice(0, 12).map((c) => ({
      sku: c.sku,
      title: c.title,
      retailPrice: c.retailPrice,
      isRose: !!c.isRose,
    }));
  }
  const storeSummary = Object.fromEntries(
    Object.entries(storesNearby)
      .filter(([k, s]) => s && k !== 'target')
      .map(([k, s]) => [k, { miles: s.miles, city: s.city, storeId: s.storeId }]),
  );
  try {
    const { content } = await grok.chatCompletions({
      temperature: 0.3,
      max_tokens: 900,
      messages: [
        {
          role: 'system',
          content:
            'You are Wrrapd floral merchandising. Pick bouquet SKUs for a giftee ZIP from candidate lists. Prefer Publix; Sam\'s Club only for rose bouquets. Return JSON only: {"picks":[{"retailer":"publix|sams","sku":"..."}]} with 5–8 picks. Respect caps: Publix under $17, Sam\'s roses under $20. Never invent SKUs.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            postalCode,
            nearbyStores: storeSummary,
            candidates: compact,
            idealCounts: { publix: 5, samsRoses: 2 },
          }),
        },
      ],
    });
    const parsed = grok.parseJsonContent(content);
    const picks = Array.isArray(parsed?.picks) ? parsed.picks : [];
    const byKey = {};
    for (const r of ['publix', 'sams']) {
      for (const c of byRetailerCandidates[r] || []) {
        byKey[`${r}:${c.sku}`] = c;
      }
    }
    const selected = [];
    for (const p of picks) {
      const key = `${p.retailer}:${p.sku}`;
      if (byKey[key]) selected.push(byKey[key]);
    }
    if (selected.length >= MIN_CHOICES) return selected.slice(0, MAX_CHOICES);
    return null;
  } catch (e) {
    console.warn('[flowers-catalog] grok rank failed', e.message);
    return null;
  }
}

function toOffers(selected) {
  const offers = [];
  for (const c of selected) {
    // Deterministic ID (no Date.now): same SKU/price → same offer across cache rebuilds
    // so the shopper's selected price still validates at payment time.
    const offerId = crypto
      .createHash('sha256')
      .update(
        `${c.retailer}|${c.storeId || ''}|${c.sku}|${Number(c.retailPrice)}|${c.classicBackup ? 'classic' : 'live'}`,
      )
      .digest('hex')
      .slice(0, 24);
    const charged =
      c.chargedPrice != null && Number.isFinite(Number(c.chargedPrice))
        ? Math.round(Number(c.chargedPrice) * 100) / 100
        : chargedPrice(c.retailPrice);
    const offer = {
      offerId,
      retailer: c.retailer,
      storeId: c.storeId,
      storeName: c.storeName,
      address: c.storeAddress,
      city: c.storeCity,
      state: c.storeState,
      postalCode: c.storePostalCode,
      miles: c.miles,
      sku: c.sku,
      designKey: c.designKey || null,
      title: c.title,
      imageUrl: c.imageUrl,
      productUrl: c.productUrl,
      retailPrice: c.retailPrice,
      chargedPrice: charged,
      isRose: !!c.isRose,
      classicBackup: !!c.classicBackup,
      createdAt: new Date().toISOString(),
    };
    offerById.set(offerId, offer);
    offers.push(offer);
  }
  return offers;
}

function cachePayload(zip, payload, offerMap) {
  zipCache.set(zip, { at: Date.now(), ...payload, offers: offerMap || new Map() });
  return payload;
}

function rehydrateOffersFromCache(cached) {
  const map = cached && cached.offers;
  if (!map) return;
  if (map instanceof Map) {
    for (const [id, o] of map) {
      if (id && o) offerById.set(String(id), o);
    }
    return;
  }
  if (typeof map === 'object') {
    for (const [id, o] of Object.entries(map)) {
      if (id && o) offerById.set(String(id), o);
    }
  }
}

async function buildCatalogForZip(postalCode) {
  const zip = storesLib.normZip(postalCode);
  if (zip.length !== 5) {
    return {
      status: 'unavailable',
      choices: [],
      message: 'Please enter a valid 5-digit ZIP code.',
    };
  }

  const cached = zipCache.get(zip);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    rehydrateOffersFromCache(cached);
    return {
      status: cached.status,
      choices: cached.choices,
      message: cached.message,
      source: cached.source,
      disclaimer: cached.disclaimer,
    };
  }

  const { byRetailer } = await storesLib.nearestStoresForZip(zip);
  const active = Object.entries(byRetailer).filter(([, s]) => s);
  if (!active.length) {
    return cachePayload(zip, {
      status: 'unavailable',
      choices: [],
      message:
        'We apologize — floral delivery is not currently available for this ZIP code. Gift wrapping is still available.',
    });
  }

  const byRetailerCandidates = { publix: [], sams: [] };
  let anyLive = false;
  let anyScrapeFailed = false;
  await Promise.all(
    active
      .filter(([retailer]) => retailer === 'publix' || retailer === 'sams')
      .map(async ([retailer, store]) => {
        const result = await scrape.fetchBouquetsForStore(store);
        if (result.scrapeFailed) anyScrapeFailed = true;
        if (result.items?.length) {
          anyLive = true;
          byRetailerCandidates[retailer] = result.items;
        }
      }),
  );

  let selected = null;
  let source = 'live';
  let disclaimer = null;
  const unit = flowerUnitPriceForZip(zip);

  if (anyLive) {
    selected = await grokRank(zip, byRetailerCandidates, byRetailer);
    if (!selected || selected.length < MIN_CHOICES) {
      selected = deterministicSelect(byRetailerCandidates);
    }
  }

  // Zero live picks → full classic backup (Publix-attributed when Publix is nearby).
  if (!selected || !selected.length) {
    const preferStore =
      byRetailer.publix || byRetailer.sams || active.find(([, s]) => s)?.[1] || active[0][1];
    selected = scrape.classicFourBouquets(preferStore, unit);
    source = 'classic_backup';
    disclaimer = CLASSIC_DISCLAIMER;
    console.warn(
      '[flowers-catalog] using classic 4-bouquet backup for',
      zip,
      'scrapeFailed=',
      anyScrapeFailed,
      'publixNearby=',
      !!byRetailer.publix,
    );
  } else {
    // Short live lists (e.g. Sam's-only roses when Publix 403s): pad with classic Publix designs.
    const beforePad = selected.length;
    selected = padWithClassicPublix(selected, byRetailer, unit);
    if (selected.some((c) => c.classicBackup)) {
      disclaimer = CLASSIC_DISCLAIMER;
      if (beforePad < MIN_CHOICES) {
        source = 'live_padded';
        console.warn(
          '[flowers-catalog] padded to',
          selected.length,
          'with classic Publix for',
          zip,
          'liveWas=',
          beforePad,
          'publixLive=',
          (byRetailerCandidates.publix || []).length,
          'samsLive=',
          (byRetailerCandidates.sams || []).length,
        );
      }
    }
  }

  const offers = toOffers(selected);
  const choices = offers.map((o, i) => publicChoice(o, i));
  const payload = {
    status: 'ok',
    choices,
    message: null,
    source,
    disclaimer,
  };
  const offerMap = new Map(offers.map((o) => [o.offerId, o]));
  return cachePayload(zip, payload, offerMap);
}

function prefetch(postalCode) {
  const zip = storesLib.normZip(postalCode);
  if (zip.length !== 5) return Promise.resolve({ ok: false, error: 'invalid_zip' });
  const existing = zipCache.get(zip);
  if (existing && Date.now() - existing.at < CACHE_TTL_MS) {
    rehydrateOffersFromCache(existing);
    return Promise.resolve({
      ok: true,
      cached: true,
      status: existing.status,
      source: existing.source,
      count: existing.choices?.length || 0,
    });
  }
  return buildCatalogForZip(zip).then((r) => ({
    ok: true,
    cached: false,
    status: r.status,
    count: r.choices?.length || 0,
    source: r.source,
  }));
}

function getOffer(offerId) {
  return offerById.get(String(offerId || '')) || null;
}

function validateOfferAmount(offerId, amount) {
  const o = getOffer(offerId);
  if (!o) return { ok: false, error: 'unknown_offer' };
  const a = Math.round(Number(amount) * 100) / 100;
  if (Math.abs(a - o.chargedPrice) > 0.02) {
    return { ok: false, error: 'amount_mismatch', expected: o.chargedPrice };
  }
  return { ok: true, offer: o };
}

module.exports = {
  MARKUP: scrape.MARKUP,
  buildCatalogForZip,
  prefetch,
  getOffer,
  validateOfferAmount,
  chargedPrice,
};
