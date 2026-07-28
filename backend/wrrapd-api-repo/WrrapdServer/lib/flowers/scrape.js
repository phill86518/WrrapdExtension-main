/**
 * Live floral product fetch for nearby Publix / Target / Sam's stores.
 * Best-effort HTTP; returns candidates with image + retail price.
 */
const https = require('https');
const http = require('http');

const MARKUP = 1.49;
const CAP_PUBLIX = 17;
const CAP_TARGET = 17;
const CAP_SAMS_ROSES = 20;

function fetchText(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        timeout: opts.timeout || 12000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; WrrapdBot/3.0; +https://www.wrrapd.com)',
          Accept: 'application/json,text/html,*/*',
          ...(opts.headers || {}),
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchText(res.headers.location, opts).then(resolve, reject);
          res.resume();
          return;
        }
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

function parseMoney(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 100) / 100;
  const m = String(v || '').replace(/[^0-9.]/g, '');
  const n = parseFloat(m);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function isRoseTitle(title) {
  return /\brose|\broses\b/i.test(String(title || ''));
}

function isBouquetish(title) {
  const t = String(title || '').toLowerCase();
  if (!t) return false;
  if (/vase|plant|orchid|succulent|candle|card|balloon|chocolate/.test(t)) return false;
  return /bouquet|floral|flower|roses?|tulip|lily|carnation|mixed|arrangement|stems?/.test(t);
}

async function scrapeTarget(store) {
  const zip = store.postalCode || '32256';
  const url =
    `https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2` +
    `?key=ff457966e64d5e877fdbad070f276d18ecec4a01` +
    `&keyword=bouquet+flowers` +
    `&channel=WEB&count=24&default_purchasability_filter=true` +
    `&offset=0&page=%2Fs%2Fbouquet+flowers` +
    `&pricing_store_id=3991` +
    `&store_ids=3991` +
    `&visitor_id=wrrapd` +
    `&zip=${encodeURIComponent(zip)}`;
  try {
    const { status, body } = await fetchText(url);
    if (status !== 200) throw new Error(`HTTP ${status}`);
    const j = JSON.parse(body);
    const products = j?.data?.search?.products || [];
    const out = [];
    for (const p of products) {
      const item = p?.item || p;
      const title =
        item?.product_description?.title ||
        item?.title ||
        p?.product_description?.title ||
        '';
      if (!isBouquetish(title)) continue;
      const price =
        parseMoney(item?.price?.current_retail) ||
        parseMoney(item?.price?.reg_retail) ||
        parseMoney(p?.price?.current_retail);
      if (price == null || price >= CAP_TARGET || price < 5) continue;
      const image =
        item?.enrichment?.images?.primary_image_url ||
        item?.enrichment?.images?.alternate_image_urls?.[0] ||
        null;
      if (!image) continue;
      const tcin = item?.tcin || item?.parent?.tcin || '';
      out.push({
        retailer: 'target',
        sku: String(tcin || title).slice(0, 64),
        title: String(title).slice(0, 120),
        imageUrl: image,
        retailPrice: price,
        productUrl: tcin ? `https://www.target.com/p/-/A-${tcin}` : 'https://www.target.com/s/bouquet+flowers',
        isRose: isRoseTitle(title),
      });
    }
    return out;
  } catch (e) {
    console.warn('[flowers-scrape] target failed', store.storeId, e.message);
    return [];
  }
}

async function scrapePublix(store) {
  // Publix storefront APIs vary by region; try product search, then empty → catalog fill.
  const q = encodeURIComponent('flower bouquet');
  const url = `https://services.publix.com/api/v3/product/Search?storeNumber=1&keyword=${q}&rowCount=24`;
  try {
    const { status, body } = await fetchText(url, {
      headers: { Accept: 'application/json' },
    });
    if (status !== 200) throw new Error(`HTTP ${status}`);
    const j = JSON.parse(body);
    const products = j?.Products || j?.products || j?.items || [];
    const out = [];
    for (const p of products) {
      const title = p?.Name || p?.name || p?.title || '';
      if (!isBouquetish(title)) continue;
      const price =
        parseMoney(p?.Price) ||
        parseMoney(p?.price) ||
        parseMoney(p?.RegularPrice) ||
        parseMoney(p?.SalePrice);
      if (price == null || price >= CAP_PUBLIX || price < 5) continue;
      const image = p?.ImageUrl || p?.imageUrl || p?.Image || null;
      if (!image) continue;
      out.push({
        retailer: 'publix',
        sku: String(p?.ProductId || p?.id || title).slice(0, 64),
        title: String(title).slice(0, 120),
        imageUrl: String(image),
        retailPrice: price,
        productUrl: 'https://www.publix.com/shop',
        isRose: isRoseTitle(title),
      });
    }
    return out;
  } catch (e) {
    console.warn('[flowers-scrape] publix failed', store.storeId, e.message);
    return [];
  }
}

async function scrapeSams(store) {
  const url =
    'https://www.samsclub.com/api/node/vivaldi/browse/v2/search' +
    '?q=rose%20bouquet&limit=24&offset=0&searchType=products';
  try {
    const { status, body } = await fetchText(url);
    if (status !== 200) throw new Error(`HTTP ${status}`);
    const j = JSON.parse(body);
    const products =
      j?.payload?.records || j?.payload?.products || j?.products || j?.items || [];
    const out = [];
    for (const p of products) {
      const title =
        p?.productName || p?.name || p?.title || p?.attributes?.product_name || '';
      if (!isRoseTitle(title) && !isBouquetish(title)) continue;
      if (!isRoseTitle(title)) continue;
      const price =
        parseMoney(p?.priceInfo?.finalPrice) ||
        parseMoney(p?.price?.finalPrice) ||
        parseMoney(p?.price) ||
        parseMoney(p?.listPrice);
      if (price == null || price >= CAP_SAMS_ROSES || price < 5) continue;
      const image =
        p?.imageInfo?.thumbnailUrl ||
        p?.imageUrl ||
        (p?.skuId
          ? `https://scene7.samsclub.com/is/image/samsclub/${p.skuId}_A?$DT_PDP_BB$`
          : null);
      if (!image) continue;
      const sku = String(p?.skuId || p?.id || title).slice(0, 64);
      out.push({
        retailer: 'sams',
        sku,
        title: String(title).slice(0, 120),
        imageUrl: String(image),
        retailPrice: price,
        productUrl: sku
          ? `https://www.samsclub.com/ip/${sku}`
          : 'https://www.samsclub.com/s/rose%20bouquet',
        isRose: true,
      });
    }
    return out;
  } catch (e) {
    console.warn('[flowers-scrape] sams failed', store.storeId, e.message);
    return [];
  }
}

/**
 * Classic Wrrapd 4-bouquet backup (same designs as the extension assets).
 * Used when live retailer scrape fails (e.g. HTTP 403).
 * Price = Wrrapd flowers unit price (geo), not retail+$1.49.
 */
function classicFourBouquets(store, flowerUnitPrice) {
  const price = Number(flowerUnitPrice);
  const charged = Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : 17.99;
  const images = [
    'https://scene7.samsclub.com/is/image/samsclub/0002005943541_A?$DT_PDP_BB$',
    'https://scene7.samsclub.com/is/image/samsclub/0002371100828_A?$DT_PDP_BB$',
    'https://scene7.samsclub.com/is/image/samsclub/0002005929934_A?$DT_PDP_BB$',
    'https://scene7.samsclub.com/is/image/samsclub/0002005930392_A?$DT_PDP_BB$',
  ];
  const s = store || {};
  return [1, 2, 3, 4].map((n, i) => ({
    retailer: s.retailer || 'publix',
    sku: `flowers-${n}`,
    designKey: `flowers-${n}`,
    title: `Bouquet ${n}`,
    imageUrl: images[i],
    retailPrice: charged,
    chargedPrice: charged,
    productUrl: 'https://www.wrrapd.com/',
    isRose: false,
    classicBackup: true,
    storeId: s.storeId,
    storeName: s.storeName,
    storeAddress: s.address,
    storeCity: s.city,
    storeState: s.state,
    storePostalCode: s.postalCode,
    miles: s.miles,
  }));
}

async function fetchBouquetsForStore(store) {
  if (!store?.retailer) return { items: [], scrapeFailed: true };
  let items = [];
  let scrapeFailed = false;
  try {
    if (store.retailer === 'target') items = await scrapeTarget(store);
    else if (store.retailer === 'publix') items = await scrapePublix(store);
    else if (store.retailer === 'sams') items = await scrapeSams(store);
    if (!items.length) scrapeFailed = true;
  } catch (e) {
    scrapeFailed = true;
    console.warn('[flowers-scrape] exception', store.retailer, e.message);
  }
  if (scrapeFailed) {
    console.warn('[flowers-scrape] live scrape empty/failed for', store.retailer, store.storeId);
  }
  return {
    scrapeFailed,
    items: items.map((it) => ({
      ...it,
      live: true,
      storeId: store.storeId,
      storeName: store.storeName,
      storeAddress: store.address,
      storeCity: store.city,
      storeState: store.state,
      storePostalCode: store.postalCode,
      miles: store.miles,
    })),
  };
}

module.exports = {
  MARKUP,
  CAP_PUBLIX,
  CAP_TARGET,
  CAP_SAMS_ROSES,
  fetchBouquetsForStore,
  classicFourBouquets,
};
