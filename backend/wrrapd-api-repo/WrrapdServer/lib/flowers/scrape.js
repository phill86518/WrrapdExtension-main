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

function fetchText(url, opts = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      reject(e);
      return;
    }
    const req = lib.get(
      url,
      {
        timeout: opts.timeout || 15000,
        headers: {
          'User-Agent':
            opts.userAgent ||
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          ...(opts.headers || {}),
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 8) {
          let next = res.headers.location;
          if (next.startsWith('/')) next = `${parsed.origin}${next}`;
          res.resume();
          fetchText(next, opts, redirects + 1).then(resolve, reject);
          return;
        }
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () =>
          resolve({ status: res.statusCode || 0, body: data, finalUrl: url }),
        );
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

function isApparelNoise(title) {
  return /\b(t-?shirt|tee|shirt|hoodie|apparel|clothing|dress|pants|socks)\b/i.test(
    String(title || ''),
  );
}

function isBouquetish(title) {
  const t = String(title || '').toLowerCase();
  if (!t) return false;
  if (isApparelNoise(t)) return false;
  if (/candle|card|balloon|chocolate|plush|mug|frame/.test(t)) return false;
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

/**
 * Known Member's Mark floral SKUs that appear on
 * https://www.samsclub.com/search?q=bouquet&max_price=20
 * Used when PerimeterX blocks live HTML from the GCP host.
 * Images are on the public CDN (not bot-gated).
 */
const SAMS_SEARCH_FALLBACK = [
  {
    sku: '13612912757',
    title: "Member's Mark Jumbo Premium Bouquet, color and variety may vary",
    retailPrice: 16.87,
    imageUrl:
      'https://i5.samsclubimages.com/asr/691be988-4d94-4cdd-9276-9085f22651aa.7500796e6775de91a4794a3e528443ca.jpeg',
    productUrl:
      'https://www.samsclub.com/ip/Member-s-Mark-Jumbo-Premium-Bouquet-color-and-variety-may-vary/13612912757',
  },
  {
    sku: '13779216052',
    title: "Member's Mark Premium Assorted Rose Plus Bouquet, color and variety may vary",
    retailPrice: 19.76,
    imageUrl:
      'https://i5.samsclubimages.com/asr/2d9be757-a32b-4b2e-b90a-ac47998100ea.26c59be3fbb3a82de0b416333f4b47a1.jpeg',
    productUrl:
      'https://www.samsclub.com/ip/Member-s-Mark-Premium-Assorted-Rose-Plus-Bouquet-color-and-variety-may-vary/13779216052',
  },
  {
    sku: '18312501615',
    title: "Member's Mark Premium Roses, 18 stems, choose color",
    retailPrice: 15.74,
    imageUrl:
      'https://i5.samsclubimages.com/asr/8e869f81-010d-4e54-8595-74a6a0a1151d.ee3761f7831a9ce6776b9a006d24f2a0.jpeg',
    productUrl:
      'https://www.samsclub.com/ip/Member-s-Mark-Premium-Roses-18-stems-choose-color/18312501615',
  },
];

function samsCandidateFromParts({ sku, title, retailPrice, imageUrl, productUrl }) {
  if (!isBouquetish(title) || isApparelNoise(title)) return null;
  if (retailPrice == null || retailPrice >= CAP_SAMS_ROSES || retailPrice < 5) return null;
  if (!imageUrl) return null;
  return {
    retailer: 'sams',
    sku: String(sku || title).slice(0, 64),
    title: String(title).slice(0, 120),
    imageUrl: String(imageUrl),
    retailPrice,
    productUrl:
      productUrl ||
      (sku
        ? `https://www.samsclub.com/ip/${encodeURIComponent(String(sku))}`
        : 'https://www.samsclub.com/search?q=bouquet&max_price=20'),
    isRose: isRoseTitle(title),
  };
}

function parseSamsNextData(html) {
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return [];
  let j;
  try {
    j = JSON.parse(m[1]);
  } catch {
    return [];
  }
  const stacks =
    j?.props?.pageProps?.initialData?.searchResult?.itemStacks ||
    j?.props?.pageProps?.initialData?.contentLayout?.pageMetadata ||
    [];
  const items = [];
  const stackList = Array.isArray(stacks) ? stacks : [];
  for (const stack of stackList) {
    for (const p of stack?.items || []) {
      if (!p || p.__typename === 'AdPlaceholder') continue;
      const title = p.name || p.title || '';
      const price =
        parseMoney(p.price) ||
        parseMoney(p.priceInfo?.linePrice) ||
        parseMoney(p.priceInfo?.linePriceDisplay);
      const image =
        p.imageInfo?.thumbnailUrl ||
        p.image ||
        p.imageInfo?.allImages?.[0]?.url ||
        null;
      const sku = String(p.usItemId || p.id || '');
      const href = p.canonicalUrl
        ? `https://www.samsclub.com${String(p.canonicalUrl).split('?')[0]}`
        : null;
      const c = samsCandidateFromParts({
        sku,
        title,
        retailPrice: price,
        imageUrl: image,
        productUrl: href,
      });
      if (c) items.push(c);
    }
  }
  return items;
}

/** Parse product tiles from the search DOM the user captured. */
function parseSamsHtmlTiles(html) {
  const out = [];
  const tileRe =
    /role="group"[^>]*data-item-id="([^"]+)"[^>]*data-dca-id="(\d+)"[\s\S]*?(?=role="group"|id="results-container"|<\/section>)/gi;
  let m;
  const chunks = [];
  // Prefer splitting on gpt-main product groups
  const parts = html.split(/data-test-id="gpt-main"/i);
  for (let i = 1; i < parts.length; i++) {
    chunks.push(parts[i].slice(0, 4500));
  }
  if (!chunks.length) {
    while ((m = tileRe.exec(html)) && chunks.length < 24) {
      chunks.push(m[0]);
    }
  }
  for (const chunk of chunks) {
    const title =
      (chunk.match(/data-automation-id="product-title"[^>]*>([^<]+)</i) || [])[1] ||
      (chunk.match(/<h3[^>]*>([^<]*bouquet[^<]*)<\/h3>/i) || [])[1] ||
      '';
    const price =
      parseMoney((chunk.match(/current price\s*\$?\s*([0-9.]+)/i) || [])[1]) ||
      parseMoney(
        (chunk.match(/data-test-id="gpt-main-price-display"[\s\S]*?<span class="f1">(\d+)<\/span>\s*<span[^>]*>(\d+)<\/span>/i) ||
          [])
          .slice(1)
          .join('.'),
      );
    const image =
      (chunk.match(/data-testid="productTileImage"[^>]*src="([^"]+)"/i) ||
        chunk.match(/src="(https:\/\/i5\.samsclubimages\.com\/[^"]+)"/i) ||
        [])[1] || null;
    const sku =
      (chunk.match(/data-dca-id="(\d+)"/i) ||
        chunk.match(/\/ip\/[^/]+\/(\d+)/i) ||
        [])[1] || '';
    const path = (chunk.match(/href="(\/ip\/[^"?]+)/i) || [])[1];
    const c = samsCandidateFromParts({
      sku,
      title: title.trim(),
      retailPrice: price,
      imageUrl: image ? image.replace(/&amp;/g, '&') : null,
      productUrl: path ? `https://www.samsclub.com${path}` : null,
    });
    if (c) out.push(c);
  }
  return out;
}

function dedupeSams(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it.sku || it.title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

async function scrapeSams(store) {
  const zip = store.postalCode || '32218';
  const searchUrl = 'https://www.samsclub.com/search?q=bouquet&max_price=20';
  try {
    const { status, body, finalUrl } = await fetchText(searchUrl, {
      headers: {
        Cookie: `hasLocData=1; assortmentStoreId=8253; locDataV3=${encodeURIComponent(
          JSON.stringify({ postalCode: zip, intent: 'PICKUP' }),
        )}`,
        Referer: 'https://www.samsclub.com/',
      },
    });
    const blocked =
      status === 412 ||
      /are-you-human|not a robot|PerimeterX|px-captcha/i.test(body || '') ||
      /are-you-human/i.test(String(finalUrl || ''));
    if (!blocked && status === 200 && body) {
      let items = parseSamsNextData(body);
      if (!items.length) items = parseSamsHtmlTiles(body);
      items = dedupeSams(items);
      if (items.length) {
        console.log('[flowers-scrape] sams live search ok', items.length, 'for', zip);
        return items;
      }
    } else {
      console.warn(
        '[flowers-scrape] sams search blocked/empty',
        store.storeId,
        'status=',
        status,
        blocked ? 'bot-wall' : '',
      );
    }
  } catch (e) {
    console.warn('[flowers-scrape] sams fetch failed', store.storeId, e.message);
  }

  // Bot wall: serve the exact floral SKUs from the max_price=20 bouquet search.
  const fallback = SAMS_SEARCH_FALLBACK.map((row) => samsCandidateFromParts(row)).filter(
    Boolean,
  );
  console.warn(
    '[flowers-scrape] sams using search-page fallback catalog',
    fallback.length,
    'for',
    store.storeId,
  );
  return fallback;
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
  // Target paused as floral supplier (function kept for possible reactivation).
  if (store.retailer === 'target') return { items: [], scrapeFailed: false };
  let items = [];
  let scrapeFailed = false;
  try {
    if (store.retailer === 'publix') items = await scrapePublix(store);
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
