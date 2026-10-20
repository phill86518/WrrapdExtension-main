/**
 * Nearby floral grocers outside the FL/GA Publix and Sam's index:
 * Whole Foods, Trader Joe's, Food Emporium, and Lidl.
 * Lidl and Trader Joe's use their public store finders. Whole Foods and
 * Food Emporium use the public Photon place search, then the same mile cutoff.
 */
const https = require('https');

const LIDL_STORES_URL =
  'https://live.api.schwarz/odj/stores-api/v2/myapi/stores-frontend/stores?country_code=US&limit=250';
/** Public key shipped in lidl.com's store-search script. */
const LIDL_STORE_FINDER_KEY = '16QaHsGX3Uc3JLhNlS2ZG1CmosbzVPs2';
const TRADERJOES_LOCATOR = 'https://locations.traderjoes.com/rest/locatorsearch';
/** Public key shipped in the Trader Joe's store-finder page. */
const TRADERJOES_APPKEY = 'A458FCEA-30C0-11E7-85D4-58D1A38844B8';
const LIDL_CACHE_MS = 6 * 60 * 60 * 1000;

const STATE_ABBR = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY',
};

let lidlCache = null;

function requestJson(url, { method = 'GET', headers = {}, body = null, timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      reject(e);
      return;
    }
    const payload = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        timeout,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; WrrapdFloral/1.0)',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
            : {}),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function stateAbbr(value) {
  const raw = String(value || '').trim();
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return STATE_ABBR[raw.toLowerCase()] || '';
}

function postal5(value) {
  const z = String(value || '').replace(/\D/g, '').slice(0, 5);
  return z.length === 5 ? z : '';
}

function chainFromPlaceName(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  if (/^whole foods( market)?$/i.test(n)) return 'wholefoods';
  if (/^trader joe'?s$/i.test(n)) return 'traderjoes';
  if (/^(the )?food emporium$/i.test(n)) return 'foodemporium';
  if (/^lidl$/i.test(n)) return 'lidl';
  return '';
}

function storeRecord({ retailer, storeId, storeName, address, city, state, postalCode, lat, lng }) {
  if (!retailer || !storeName || lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    retailer,
    storeId: storeId || `${retailer}-${lat.toFixed(4)}-${lng.toFixed(4)}`,
    storeName,
    address: address || '',
    city: city || '',
    state: stateAbbr(state),
    postalCode: postal5(postalCode),
    lat,
    lng,
  };
}

function lidlItemToStore(item) {
  if (!item || item.objectType && item.objectType !== 'STORE') return null;
  const status = String(item.status?.name || '').toLowerCase();
  if (status && status !== 'open') return null;
  const address = item.address || {};
  const street = [address.streetNumber, address.streetName].filter(Boolean).join(' ').trim();
  const name = String(item.storeName || '').trim();
  return storeRecord({
    retailer: 'lidl',
    storeId: item.objectNumber ? `lidl-${item.objectNumber}` : '',
    storeName: /^lidl\b/i.test(name) ? name : `Lidl ${name}`.trim(),
    address: street,
    city: address.city,
    state: address.state,
    postalCode: address.zip,
    lat: Number(address.latitude),
    lng: Number(address.longitude),
  });
}

function traderJoesItemToStore(item) {
  if (!item) return null;
  const name = String(item.name || '').trim();
  return storeRecord({
    retailer: 'traderjoes',
    storeId: item.clientkey ? `traderjoes-${item.clientkey}` : `traderjoes-${item.uid || ''}`,
    storeName: /^trader joe/i.test(name) ? name : `Trader Joe's ${name}`.trim(),
    address: item.address1,
    city: item.city,
    state: item.state,
    postalCode: item.postalcode,
    lat: Number(item.latitude),
    lng: Number(item.longitude),
  });
}

function photonFeatureToStore(feature) {
  const props = feature?.properties || {};
  const retailer = chainFromPlaceName(props.name);
  if (!retailer || retailer === 'lidl' || retailer === 'traderjoes') return null;
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const street = [props.housenumber, props.street].filter(Boolean).join(' ').trim();
  const label =
    retailer === 'wholefoods' ? 'Whole Foods' : 'Food Emporium';
  return storeRecord({
    retailer,
    storeId: '',
    storeName: props.city ? `${label} ${props.city}` : label,
    address: street,
    city: props.city,
    state: props.state,
    postalCode: props.postcode,
    lat: Number(coords[1]),
    lng: Number(coords[0]),
  });
}

function nearestOf(stores, origin, maxMiles, haversineMiles) {
  const best = new Map();
  for (const store of stores) {
    if (!store || store.lat == null || store.lng == null) continue;
    const miles = Math.round(haversineMiles(origin.lat, origin.lng, store.lat, store.lng) * 100) / 100;
    if (miles > maxMiles) continue;
    const prev = best.get(store.retailer);
    if (!prev || miles < prev.miles) best.set(store.retailer, { ...store, miles });
  }
  return [...best.values()];
}

async function fetchLidlStores() {
  if (lidlCache && Date.now() - lidlCache.at < LIDL_CACHE_MS) return lidlCache.stores;
  const json = await requestJson(LIDL_STORES_URL, {
    headers: { 'x-apikey': LIDL_STORE_FINDER_KEY },
  });
  const stores = (json?.items || []).map(lidlItemToStore).filter(Boolean);
  lidlCache = { at: Date.now(), stores };
  return stores;
}

async function fetchTraderJoes(origin, maxMiles) {
  const radius = String(Math.max(1, Math.ceil(maxMiles)));
  const json = await requestJson(TRADERJOES_LOCATOR, {
    method: 'POST',
    body: {
      request: {
        appkey: TRADERJOES_APPKEY,
        formdata: {
          geoip: false,
          dataview: 'store_default',
          limit: 8,
          geolocs: {
            geoloc: [
              {
                addressline: `${origin.lat},${origin.lng}`,
                country: 'US',
                latitude: origin.lat,
                longitude: origin.lng,
              },
            ],
          },
          searchradius: radius,
        },
      },
    },
  });
  const collection = json?.response?.collection;
  const items = Array.isArray(collection) ? collection : Object.values(collection || {});
  return items.map(traderJoesItemToStore).filter(Boolean);
}

async function fetchPhoton(query, origin) {
  const url =
    'https://photon.komoot.io/api/?q=' +
    encodeURIComponent(query) +
    `&lat=${encodeURIComponent(origin.lat)}&lon=${encodeURIComponent(origin.lng)}&limit=8&lang=en`;
  const json = await requestJson(url);
  return (json?.features || []).map(photonFeatureToStore).filter(Boolean);
}

async function searchGroceryFlorists(origin, maxMiles, haversineMiles) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  const jobs = [
    fetchLidlStores(),
    fetchTraderJoes(origin, maxMiles),
    fetchPhoton('Whole Foods', origin),
    fetchPhoton('Food Emporium', origin),
  ];
  const settled = await Promise.allSettled(jobs);
  const found = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') found.push(...result.value);
    else console.warn('[flowers-grocery] search failed', result.reason?.message || result.reason);
  }
  return nearestOf(found, origin, maxMiles, haversineMiles);
}

module.exports = {
  chainFromPlaceName,
  lidlItemToStore,
  traderJoesItemToStore,
  photonFeatureToStore,
  nearestOf,
  searchGroceryFlorists,
};
