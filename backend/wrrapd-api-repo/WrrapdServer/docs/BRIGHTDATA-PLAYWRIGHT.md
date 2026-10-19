# Bright Data + Playwright (Kohl's / hard retailers)

## Strategy (Akamai — Kohl's)

Kohl's sits behind **Akamai**, not Cloudflare. Detection changes often; a DIY stack
(`curl_cffi` TLS spoof + Playwright stealth + rotating residentials) needs ongoing
reverse engineering. For Wrrapd we **buy** the hard part: Bright Data Web Unlocker,
Scraping Browser, and the Kohl's dataset. Keep open-source Playwright only for
signed-in quote profiles on a machine with a real display.

We already capture the shopper IP on the batch (`client.ip`). That is useful for
Helcim / fraud and for knowing mobile vs home — it is **not** something Bright Data
can exit as. Arbitrary home IPs are not in their peer pool; forcing `state`/`city` on
our Unlocker zone returns HTTP 407, and Scraping Browser city pins can return
`no_peers`. Stick to `BRIGHTDATA_COUNTRY=us`. Delivery ZIP (e.g. 32218 Jacksonville)
is set inside the Scraping Browser page via `prepareKohlsDelivery`.

## Env (never commit)

```bash
BRIGHTDATA_API_KEY=your_api_token_here
BRIGHTDATA_UNLOCKER_ZONE=web_unlocker1   # zone name from Bright Data CP
BRIGHTDATA_KOHLS_DATASET_ID=gd_mjwhpd7x2m0n36whj8
WRRAPD_HOME_IP=73.53.188.4              # Jacksonville FL home — reference / logging only
BRIGHTDATA_COUNTRY=us
```

## Kohl's live product price (primary)

Pre-built scraper **Kohls.com → Collect by URL** (`gd_mjwhpd7x2m0n36whj8`): price plus `shipping_options` (cost and delivery). The unified-schema scraper (`gd_mlji2hi729x1g0vg4i`) has a sale price and no shipping.

```bash
curl -X POST \
  "https://api.brightdata.com/datasets/v3/trigger?dataset_id=gd_mjwhpd7x2m0n36whj8&format=json&include_errors=true" \
  -H "Authorization: Bearer $BRIGHTDATA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url":"https://www.kohls.com/product/prd-7513461/lifestride-london-3-womens-loafers.jsp?skuId=50653163"}]'
```

Poll `GET /datasets/v3/progress/{snapshot_id}` until `ready`, then download  
`GET /datasets/v3/snapshot/{snapshot_id}?format=json`.

`lib/buy/brightdata.js` → `scrapeKohlsProduct()` runs that flow. When Kohl's returns  
`error_code: blocked`, the buy reader falls through to **Gemini** (and Unlocker HTML if a zone exists).

Shipping is often missing from the record; we keep Kohl's standard ship defaults ($8.95 / free over $49) until Browser API can compute ZIP-specific shipping.

## Web Unlocker (HTML fallback) — create a zone

Account status with only a Scraper API token and **no zones** looks like:

`can_make_requests: false`, `auth_fail_reason: zone_not_found`

1. Open [Bright Data Zones](https://brightdata.com/cp/zones) (or Web Unlocker quickstart).
2. Create a **Web Unlocker** zone (name e.g. `wrrapd_unlocker` or `mcp_unlocker`).
3. Token must allow **Admin/Ops** to create zones via API; otherwise create in the CP UI.
4. Set `BRIGHTDATA_UNLOCKER_ZONE` to that exact zone name.
5. Restart:

```bash
cd /home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer
pm2 restart wrrapd-server
```

`POST https://api.brightdata.com/request` with `render: "true"` and that zone.

## Cursor MCP (agent tools)

Same API token. Sync launcher into Cursor (token stays in `.env`):

```bash
node scripts/sync-brightdata-mcp.js
```

Then reload MCP servers in Cursor. Tools: `scrape_as_markdown`, `scrape_as_html`, etc.

## Playwright (signed-in quote runner)

```bash
cd /home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer
npm install playwright
npx playwright install chromium
node scripts/buy-browser-login.js kohls
```

Sign in as the Wrrapd Kohl's account, then close the window. Profile is saved under  
`data/buy-browser-profiles/kohls/` (gitignored).  
Command Center → Buy for you → Settings shows when the runner is ready.
