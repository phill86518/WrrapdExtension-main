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

/** Last-resort public floral SKUs (still under caps) when live scrape returns empty. */
function fallbackCatalog(retailer) {
  const mixed = [
    {
      title: 'Mixed Seasonal Bouquet',
      imageUrl: 'https://scene7.samsclub.com/is/image/samsclub/0002005943541_A?$DT_PDP_BB$',
      retailPrice: 12.98,
      isRose: false,
    },
    {
      title: 'Garden Fresh Bouquet',
      imageUrl: 'https://scene7.samsclub.com/is/image/samsclub/0002371100828_A?$DT_PDP_BB$',
      retailPrice: 14.98,
      isRose: false,
    },
    {
      title: 'Bright Celebration Bouquet',
      imageUrl: 'https://scene7.samsclub.com/is/image/samsclub/0002005929934_A?$DT_PDP_BB$',
      retailPrice: 15.98,
      isRose: false,
    },
    {
      title: 'Soft Pastel Bouquet',
      imageUrl: 'https://scene7.samsclub.com/is/image/samsclub/0002005930392_A?$DT_PDP_BB$',
      retailPrice: 13.98,
      isRose: false,
    },
    {
      title: 'Sunshine Mixed Bouquet',
      imageUrl: 'https://scene7.samsclub.com/is/image/samsclub/0002005943541_A?$DT_PDP_BB$',
      retailPrice: 11.98,
      isRose: false,
    },
    {
      title: 'Blush Garden Bouquet',
      imageUrl: 'https://scene7.samsclub.com/is/image/samsclub/0002371100828_A?$DT_PDP_BB$',
      retailPrice: 16.48,
      isRose: false,
    },
    {
      title: 'Market Fresh Bouquet',
      imageUrl: 'https://scene7.samsclub.com/is/image/samsclub/0002005929934_A?$DT_PDP_BB$',
      retailPrice: 10.98,
      isRose: false,
    },
    {
      title: 'Everyday Joy Bouquet',
      imageUrl: 'https://scene7.samsclub.com/is/image/samsclub/0002005930392_A?$DT_PDP_BB$',
      retailPrice: 15.48,
      isRose: false,
    },
  ];
  const roses = [
    {
      title: 'Classic Red Rose Bouquet',
      imageUrl: 'https://scene7.samsclub.com/is/image/samsclub/0002371100828_E?$DT_PDP_BB$',
      retailPrice: 18.98,
      isRose: true,
    },
    {
      title: 'Dozen Long-Stem Roses',
      imageUrl: 'https://scene7.samsclub.com/is/image/samsclub/0002005943541_A?$DT_PDP_BB$',
      retailPrice: 19.48,
      isRose: true,
    },
    {
      title: 'Romantic Rose Bouquet',
      imageUrl: 'https://scene7.samsclub.com/is/image/samsclub/0002371100828_E?$DT_PDP_BB$',
      retailPrice: 17.98,
      isRose: true,
    },
    {
      title: 'Premium Rose Bouquet',
      imageUrl: 'https://scene7.samsclub.com/is/image/samsclub/0002005943541_A?$DT_PDP_BB$',
      retailPrice: 16.98,
      isRose: true,
    },
    {
      title: 'Sweetheart Rose Bouquet',
      imageUrl: 'https://scene7.samsclub.com/is/image/samsclub/0002371100828_E?$DT_PDP_BB$',
      retailPrice: 15.98,
      isRose: true,
    },
  ];
  const base = retailer === 'sams' ? roses : [...mixed, ...roses.filter((b) => b.retailPrice < CAP_PUBLIX)];
  const cap = retailer === 'sams' ? CAP_SAMS_ROSES : retailer === 'target' ? CAP_TARGET : CAP_PUBLIX;
  return base
    .filter((b) => b.retailPrice < cap)
    .filter((b) => (retailer === 'sams' ? b.isRose : true))
    .map((b, i) => ({
      retailer,
      sku: `fallback-${retailer}-${i + 1}`,
      title: b.title,
      imageUrl: b.imageUrl,
      retailPrice: b.retailPrice,
      productUrl: `https://www.wrrapd.com/`,
      isRose: b.isRose,
      fallback: true,
    }));
}

async function fetchBouquetsForStore(store) {
  if (!store?.retailer) return [];
  let items = [];
  if (store.retailer === 'target') items = await scrapeTarget(store);
  else if (store.retailer === 'publix') items = await scrapePublix(store);
  else if (store.retailer === 'sams') items = await scrapeSams(store);
  if (!items.length) {
    items = fallbackCatalog(store.retailer);
    console.warn('[flowers-scrape] using fallback catalog for', store.retailer, store.storeId);
  }
  return items.map((it) => ({
    ...it,
    storeId: store.storeId,
    storeName: store.storeName,
    storeAddress: store.address,
    storeCity: store.city,
    storeState: store.state,
    storePostalCode: store.postalCode,
    miles: store.miles,
  }));
}

module.exports = {
  MARKUP,
  CAP_PUBLIX,
  CAP_TARGET,
  CAP_SAMS_ROSES,
  fetchBouquetsForStore,
  fallbackCatalog,
};
