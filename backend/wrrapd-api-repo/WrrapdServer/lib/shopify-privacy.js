/**
 * Shopify mandatory privacy webhooks — forwarded from the Remix app after HMAC verify.
 * Developer: Wrrapd Inc. · Support: help@wrrapd.com
 *
 * Topics: customers/data_request, customers/redact, shop/redact
 *
 * HARD BOUNDARY: This path only exists for the Shopify app channel. It must never
 * drive retention or redaction of Chrome extension, website, or other-retailer data.
 * Tracking enforces retailer === "Shopify" on every mutate.
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'data', 'shopify-privacy');

function str(v, max = 500) {
  if (v == null) return '';
  return String(v).trim().slice(0, max);
}

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (_) {
    /* ignore */
  }
}

function appendAudit(entry) {
  ensureLogDir();
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(LOG_DIR, `privacy-${day}.jsonl`);
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n';
  try {
    fs.appendFileSync(file, line, 'utf8');
  } catch (e) {
    console.error('[shopify-privacy] audit write failed', e && e.message);
  }
}

/**
 * Forward privacy action to Command Center (tracking Cloud Run).
 * @param {object} body
 */
async function forwardToTracking(body) {
  const ingestKey = process.env.INGEST_API_KEY;
  const base =
    process.env.TRACKING_PRIVACY_URL ||
    process.env.TRACKING_INGEST_URL ||
    'http://127.0.0.1:3000/api/orders/ingest';
  // Derive privacy endpoint from ingest URL when not set.
  let url = process.env.TRACKING_PRIVACY_URL;
  if (!url) {
    const ingestUrl = process.env.TRACKING_INGEST_URL || 'http://127.0.0.1:3000/api/orders/ingest';
    url = String(ingestUrl).replace(/\/api\/orders\/ingest\/?$/, '/api/internal/shopify-privacy');
    if (url === ingestUrl) {
      url = 'https://wrrapd-tracking-639608249439.us-central1.run.app/api/internal/shopify-privacy';
    }
  }
  if (!ingestKey) {
    return { ok: false, reason: 'INGEST_API_KEY missing' };
  }
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ingestKey}`,
      },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    let parsed = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch (_) {
      parsed = { raw: text.slice(0, 500) };
    }
    if (!resp.ok) {
      return { ok: false, reason: `tracking ${resp.status}`, body: parsed };
    }
    return { ok: true, body: parsed };
  } catch (e) {
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  }
}

/**
 * @param {{ topic: string, shop: string, payload: object }} input
 */
async function handlePrivacyWebhook(input) {
  const topic = str(input?.topic, 80).toLowerCase().replace(/\//g, '_');
  const shop = str(input?.shop, 200);
  const payload = input?.payload && typeof input.payload === 'object' ? input.payload : {};

  const customerEmail = str(payload.customer?.email || payload.email, 200).toLowerCase();
  const customerId = str(payload.customer?.id || payload.customer_id, 40);
  const shopDomain = str(payload.shop_domain || shop, 200);

  appendAudit({
    topic,
    shop: shopDomain || shop,
    customerEmail: customerEmail || undefined,
    customerId: customerId || undefined,
    ordersRequested: payload.orders_requested || payload.orders_to_redact || undefined,
    dataRequestId: payload.data_request?.id,
  });

  const tracking = await forwardToTracking({
    topic: str(input?.topic, 80),
    shop: shopDomain || shop,
    payload,
  });

  if (!tracking.ok) {
    console.error('[shopify-privacy] tracking forward failed', topic, shop, tracking.reason);
  }

  // Shopify only requires HTTP 200 within the SLA; fulfillment of data_request
  // may be async (email help@). Redact is best-effort via tracking.
  return {
    ok: true,
    topic,
    shop: shopDomain || shop,
    trackingOk: !!tracking.ok,
    tracking,
  };
}

module.exports = {
  handlePrivacyWebhook,
  appendAudit,
  forwardToTracking,
};
