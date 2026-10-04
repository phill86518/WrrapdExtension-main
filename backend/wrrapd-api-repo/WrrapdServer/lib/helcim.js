/**
 * Helcim Payment API (server only).
 * Card numbers stay in the browser via Helcim.js. This module charges a cardToken
 * and reads the resulting purchase back.
 */
const crypto = require('crypto');

const HELCIM_API = 'https://api.helcim.com/v2';

function apiToken() {
    return String(process.env.HELCIM_API_TOKEN || '').trim();
}

function jsToken() {
    return String(process.env.HELCIM_JS_TOKEN || '').trim();
}

function enabled() {
    return Boolean(apiToken() && jsToken());
}

function isApproved(status) {
    const s = String(status || '').toUpperCase();
    return s === 'APPROVED' || s === 'APPROVAL';
}

function idempotencyKey(orderNumber, cardToken) {
    const hex = crypto
        .createHash('sha256')
        .update(`${String(orderNumber)}|${String(cardToken)}`)
        .digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function helcimFetch(path, { method, body, idempotencyKey: idemKey } = {}) {
    const headers = {
        'api-token': apiToken(),
        Accept: 'application/json',
    };
    if (body) headers['Content-Type'] = 'application/json';
    if (idemKey) headers['idempotency-key'] = idemKey;
    const res = await fetch(HELCIM_API + path, {
        method: method || 'GET',
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch (_) {
        data = { errors: [text.slice(0, 300)] };
    }
    return { ok: res.ok, status: res.status, data: data || {} };
}

function errorText(data) {
    if (!data || typeof data !== 'object') return 'Payment was declined';
    if (Array.isArray(data.errors) && data.errors.length) {
        return data.errors.map((e) => (typeof e === 'string' ? e : e && (e.message || e.error) || '')).filter(Boolean).join(' ')
            || 'Payment was declined';
    }
    if (typeof data.error === 'string' && data.error.trim()) return data.error.trim();
    if (data.errors && typeof data.errors === 'object') {
        const parts = Object.values(data.errors).map((v) => (typeof v === 'string' ? v : '')).filter(Boolean);
        if (parts.length) return parts.join(' ');
    }
    return 'Payment was declined';
}

async function purchase({ amountCents, cardToken, orderNumber, billing, ipAddress }) {
    const amount = Math.round(Number(amountCents)) / 100;
    const invoiceNumber = String(orderNumber || '').trim().slice(0, 40);
    const body = {
        ipAddress: String(ipAddress || '').trim() || '0.0.0.0',
        ecommerce: true,
        currency: 'USD',
        amount,
        cardData: { cardToken: String(cardToken) },
        billingAddress: billing,
        invoice: {
            invoiceNumber,
            notes: 'Wrrapd',
            lineItems: [{ description: 'Wrrapd gift wrap', quantity: 1, price: amount }],
        },
    };
    return helcimFetch('/payment/purchase', {
        method: 'POST',
        body,
        idempotencyKey: idempotencyKey(invoiceNumber || 'order', cardToken),
    });
}

async function getTransaction(transactionId) {
    const id = String(transactionId || '').replace(/\D/g, '');
    if (!id) return { ok: false, status: 400, data: { errors: ['Missing transaction'] } };
    return helcimFetch(`/card-transactions/${id}`);
}

function uuidFrom(seed) {
    const hex = crypto.createHash('sha256').update(String(seed)).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Refund a settled purchase. Helcim only refunds settled batches; a purchase still in the
 * open batch must be reversed instead (full amount only), so a full refund falls back to reverse.
 * `requestId` makes retries of the same refund request idempotent.
 */
async function refund({ transactionId, amountCents, ipAddress, requestId, full }) {
    const id = Number(String(transactionId || '').replace(/\D/g, ''));
    if (!id) return { ok: false, status: 400, data: { errors: ['Missing transaction'] } };
    const ip = String(ipAddress || '').trim() || '0.0.0.0';
    const r = await helcimFetch('/payment/refund', {
        method: 'POST',
        body: {
            originalTransactionId: id,
            amount: Math.round(Number(amountCents)) / 100,
            ipAddress: ip,
            ecommerce: true,
        },
        idempotencyKey: uuidFrom(`refund|${requestId}`),
    });
    if (r.ok || !full) return { ...r, kind: 'refund' };
    const why = errorText(r.data).toLowerCase();
    if (!/settle|batch|open/.test(why)) return { ...r, kind: 'refund' };
    const rev = await helcimFetch('/payment/reverse', {
        method: 'POST',
        body: { cardTransactionId: id, ipAddress: ip, ecommerce: true },
        idempotencyKey: uuidFrom(`reverse|${requestId}`),
    });
    return { ...rev, kind: 'reverse' };
}

/**
 * Helcim webhook signature: base64(HMAC-SHA256(base64decode(verifierToken), `${id}.${timestamp}.${body}`)).
 * Header may hold several space-separated "v1,<sig>" values.
 */
function verifyWebhook({ rawBody, webhookId, webhookTimestamp, webhookSignature }) {
    const token = String(process.env.HELCIM_WEBHOOK_VERIFIER_TOKEN || '').trim();
    if (!token || !rawBody || !webhookId || !webhookTimestamp || !webhookSignature) return false;
    const ts = Number(webhookTimestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 600) return false;
    const expected = crypto
        .createHmac('sha256', Buffer.from(token, 'base64'))
        .update(`${webhookId}.${webhookTimestamp}.${rawBody}`)
        .digest('base64');
    return String(webhookSignature)
        .split(' ')
        .map((part) => part.replace(/^v\d+,/, ''))
        .some((sig) => {
            const a = Buffer.from(sig);
            const b = Buffer.from(expected);
            return a.length === b.length && crypto.timingSafeEqual(a, b);
        });
}

module.exports = {
    apiToken,
    jsToken,
    enabled,
    isApproved,
    errorText,
    purchase,
    getTransaction,
    refund,
    verifyWebhook,
};
