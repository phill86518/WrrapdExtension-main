/**
 * Proximity flower catalog: nearest stores → scrape → Grok rank → public choices.
 */
const crypto = require('crypto');
const storesLib = require('./stores');
const scrape = require('./scrape');
const grok = require('../grok-client');

const CACHE_TTL_MS = 40 * 60 * 1000;
/** @type {Map<string, { at: number, status: string, choices: any[], offers: Map<string, any>, message?: string }>} */
const zipCache = new Map();
/** Global offer lookup for checkout validation */
const offerById = new Map();

function chargedPrice(retail) {
  return Math.round((Number(retail) + scrape.MARKUP) * 100) / 100;
}

function publicChoice(offer) {
  return {
    offerId: offer.offerId,
    title: offer.title,
    imageUrl: offer.imageUrl,
    price: offer.chargedPrice,
  };
}

function deterministicSelect(byRetailerCandidates) {
  const publix = (byRetailerCandidates.publix || []).filter((c) => c.retailPrice < scrape.CAP_PUBLIX);
  const target = (byRetailerCandidates.target || []).filter((c) => c.retailPrice < scrape.CAP_TARGET);
  const sams = (byRetailerCandidates.sams || []).filter(
    (c) => c.isRose && c.retailPrice < scrape.CAP_SAMS_ROSES,
  );

  const hasP = publix.length > 0;
  const hasT = target.length > 0;
  const hasS = sams.length > 0;

  let wantP = 0;
  let wantT = 0;
  let wantS = 0;
  if (hasP && hasT && hasS) {
    wantP = 3;
    wantT = 3;
    wantS = 2;
  } else if (hasP && hasT) {
    wantP = 4;
    wantT = 4;
  } else if (hasP && hasS) {
    wantP = 5;
    wantS = 2;
  } else if (hasT && hasS) {
    wantT = 5;
    wantS = 2;
  } else if (hasP) {
    wantP = 8;
  } else if (hasT) {
    wantT = 8;
  } else if (hasS) {
    wantS = 8;
  }

  const pick = (arr, n) => arr.slice(0, n);
  let selected = [...pick(publix, wantP), ...pick(target, wantT), ...pick(sams, wantS)];

  // Fill to min 5 from remaining preferred order
  const used = new Set(selected.map((c) => `${c.retailer}:${c.sku}`));
  const pool = [...publix, ...target, ...sams].filter((c) => !used.has(`${c.retailer}:${c.sku}`));
  while (selected.length < 5 && pool.length) {
    selected.push(pool.shift());
  }
  if (selected.length > 8) selected = selected.slice(0, 8);
  return selected;
}

async function grokRank(postalCode, byRetailerCandidates, storesNearby) {
  if (!grok.isConfigured()) return null;
  const compact = {};
  for (const r of ['publix', 'target', 'sams']) {
    compact[r] = (byRetailerCandidates[r] || []).slice(0, 12).map((c, i) => ({
      i,
      sku: c.sku,
      title: c.title,
      retailPrice: c.retailPrice,
      isRose: !!c.isRose,
    }));
  }
  const storeSummary = Object.fromEntries(
    Object.entries(storesNearby)
      .filter(([, s]) => s)
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
            'You are Wrrapd floral merchandising. Pick bouquet SKUs for a giftee ZIP from candidate lists. Prefer Publix, then Target; Sam\'s Club only for rose bouquets. Return JSON only: {"picks":[{"retailer":"publix|target|sams","sku":"..."}]} with 5–8 picks. Respect caps: Publix/Target under $17, Sam\'s roses under $20. Never invent SKUs.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            postalCode,
            nearbyStores: storeSummary,
            candidates: compact,
            idealCounts: { publix: 3, target: 3, samsRoses: 2 },
          }),
        },
      ],
    });
    const parsed = grok.parseJsonContent(content);
    const picks = Array.isArray(parsed?.picks) ? parsed.picks : [];
    const byKey = {};
    for (const r of ['publix', 'target', 'sams']) {
      for (const c of byRetailerCandidates[r] || []) {
        byKey[`${r}:${c.sku}`] = c;
      }
    }
    const selected = [];
    for (const p of picks) {
      const key = `${p.retailer}:${p.sku}`;
      if (byKey[key]) selected.push(byKey[key]);
    }
    if (selected.length >= 5) return selected.slice(0, 8);
    return null;
  } catch (e) {
    console.warn('[flowers-catalog] grok rank failed', e.message);
    return null;
  }
}

function toOffers(selected) {
  const offers = [];
  for (const c of selected) {
    const offerId = crypto
      .createHash('sha256')
      .update(
        `${c.retailer}|${c.storeId}|${c.sku}|${c.retailPrice}|${Date.now().toString(36)}`,
      )
      .digest('hex')
      .slice(0, 24);
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
      title: c.title,
      imageUrl: c.imageUrl,
      productUrl: c.productUrl,
      retailPrice: c.retailPrice,
      chargedPrice: chargedPrice(c.retailPrice),
      isRose: !!c.isRose,
      createdAt: new Date().toISOString(),
    };
    offerById.set(offerId, offer);
    offers.push(offer);
  }
  return offers;
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
    return {
      status: cached.status,
      choices: cached.choices,
      message: cached.message,
    };
  }

  const { byRetailer } = await storesLib.nearestStoresForZip(zip);
  const active = Object.entries(byRetailer).filter(([, s]) => s);
  if (!active.length) {
    const payload = {
      status: 'unavailable',
      choices: [],
      message:
        'We apologize — floral delivery is not currently available for this ZIP code. Gift wrapping is still available.',
    };
    zipCache.set(zip, { at: Date.now(), ...payload, offers: new Map() });
    return payload;
  }

  const byRetailerCandidates = { publix: [], target: [], sams: [] };
  await Promise.all(
    active.map(async ([retailer, store]) => {
      const items = await scrape.fetchBouquetsForStore(store);
      byRetailerCandidates[retailer] = items;
    }),
  );

  let selected = await grokRank(zip, byRetailerCandidates, byRetailer);
  if (!selected || selected.length < 5) {
    selected = deterministicSelect(byRetailerCandidates);
  }

  if (!selected || selected.length < 5) {
    const payload = {
      status: 'unavailable',
      choices: [],
      message:
        'We apologize — floral delivery is not currently available for this ZIP code. Gift wrapping is still available.',
    };
    zipCache.set(zip, { at: Date.now(), ...payload, offers: new Map() });
    return payload;
  }

  const offers = toOffers(selected);
  const choices = offers.map(publicChoice);
  const payload = { status: 'ok', choices, message: null };
  const offerMap = new Map(offers.map((o) => [o.offerId, o]));
  zipCache.set(zip, { at: Date.now(), ...payload, offers: offerMap });
  return payload;
}

function prefetch(postalCode) {
  const zip = storesLib.normZip(postalCode);
  if (zip.length !== 5) return Promise.resolve({ ok: false, error: 'invalid_zip' });
  const existing = zipCache.get(zip);
  if (existing && Date.now() - existing.at < CACHE_TTL_MS) {
    return Promise.resolve({ ok: true, cached: true, status: existing.status });
  }
  return buildCatalogForZip(zip).then((r) => ({
    ok: true,
    cached: false,
    status: r.status,
    count: r.choices?.length || 0,
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
