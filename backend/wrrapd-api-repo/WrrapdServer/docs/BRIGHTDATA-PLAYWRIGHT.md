# Bright Data + Playwright (Kohl's / hard retailers)

## Env (never commit)

```bash
BRIGHTDATA_API_KEY=your_api_token_here
BRIGHTDATA_UNLOCKER_ZONE=mcp_unlocker
BRIGHTDATA_KOHLS_DATASET_ID=gd_mlji2hi729x1g0vg4i
```

## Kohl's live product price (primary)

Pre-built scraper **Kohl's Products unified schema** (`gd_mlji2hi729x1g0vg4i`):

```bash
curl -X POST \
  "https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_mlji2hi729x1g0vg4i&format=json" \
  -H "Authorization: Bearer $BRIGHTDATA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"url":"https://www.kohls.com/product/prd-7513461/lifestride-london-3-womens-loafers.jsp?skuId=50653163"}]'
```

`lib/buy/brightdata.js` → `scrapeKohlsProduct()` runs that call. Shipping is often missing from the record; we keep Kohl's standard ship defaults ($8.95 / free over $49) until Browser API can compute ZIP-specific shipping.

## Web Unlocker (HTML fallback)

`POST https://api.brightdata.com/request` with `render: "true"`.  
Zone must be a **Web Unlocker** zone ([zones](https://brightdata.com/cp/zones)); MCP free tier often uses `mcp_unlocker`.

Restart after setting the key:

```bash
cd /home/phill/wrrapd-GCP/backend/wrrapd-api-repo/WrrapdServer
pm2 restart wrrapd-server
```

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
