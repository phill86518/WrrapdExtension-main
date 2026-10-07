require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const FormData = require('form-data');
const Mailgun = require('mailgun.js');
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const https = require('https');
const http = require('http');
const wrrapdPricing = require(path.join(__dirname, 'lib', 'wrrapd-pricing'));
const salesTaxZip = require(path.join(__dirname, 'lib', 'sales-tax-zip'));
const allowedZipCodesLib = require(path.join(__dirname, 'lib', 'allowed-zip-codes'));
const printerCoverage = require(path.join(__dirname, 'lib', 'printer-coverage'));
const grokClient = require(path.join(__dirname, 'lib', 'grok-client'));
const flowerStores = require(path.join(__dirname, 'lib', 'flowers', 'stores'));
const flowerCatalog = require(path.join(__dirname, 'lib', 'flowers', 'catalog'));
const orderEmails = require(path.join(__dirname, 'lib', 'order-emails'));
const helcim = require(path.join(__dirname, 'lib', 'helcim'));
const w9 = require(path.join(__dirname, 'lib', 'w9'));
const facebookScheduler = require(path.join(__dirname, 'lib', 'facebook-scheduler'));
const extensionInstalls = require(path.join(__dirname, 'lib', 'extension-installs'));
const retiredExtension = require(path.join(__dirname, 'lib', 'retired-extension'));
const shopperTerms = require(path.join(__dirname, 'lib', 'shopper-terms'));
const extensionConfig = require(path.join(__dirname, 'lib', 'extension-config'));
const deliveryHubs = require(path.join(__dirname, 'lib', 'delivery-hubs'));
const giftBox = require(path.join(__dirname, 'lib', 'gift-box'));

// Initialize Google Cloud Storage
let storageOptions = {
    projectId: process.env.GCS_PROJECT_ID
};

// If GOOGLE_APPLICATION_CREDENTIALS is set in the .env file and starts with ./
// use the keyFilename option for local file path
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && 
    process.env.GOOGLE_APPLICATION_CREDENTIALS.startsWith('./')) {
    storageOptions.keyFilename = path.join(__dirname, process.env.GOOGLE_APPLICATION_CREDENTIALS.substring(2));
}

const storage = new Storage(storageOptions);

const app = express();
app.set('trust proxy', 1);

// Browsers may call this API only from Wrrapd sites, the extension, and the retailer pages
// the extension runs on (content-script fetches carry the retailer page's origin).
// Server-to-server calls send no Origin and are unaffected.
const CORS_ALLOWED_HOST = new RegExp(
    '^(?:[a-z0-9-]+\\.)*(?:' +
        [
            'wrrapd\\.com',
            'amazon\\.(?:com|ca|co\\.uk|de|fr|es|it|nl|co\\.jp|in|com\\.au|com\\.br|com\\.mx)',
            'bestbuy\\.com',
            'etsy\\.com',
            'kohls\\.com',
            'lego\\.com',
            'nordstrom\\.com',
            'sephora\\.com',
            'target\\.com',
            'ulta\\.com',
            'walmart\\.com',
        ].join('|') +
        ')$',
);

function corsOriginAllowed(origin) {
    if (origin.startsWith('chrome-extension://')) return true;
    try {
        const u = new URL(origin);
        return u.protocol === 'https:' && CORS_ALLOWED_HOST.test(u.hostname);
    } catch (_) {
        return false;
    }
}

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        callback(null, corsOriginAllowed(origin));
    },
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With'],
    preflightContinue: false,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

const { rateLimit } = require('./lib/rate-limit');
const globalLimiter = rateLimit({ name: 'all', windowMs: 5 * 60 * 1000, max: 900 });
app.use((req, res, next) =>
    req.path.startsWith('/api/wrapstars-wp-bridge') || req.path.startsWith('/api/internal')
        ? next()
        : globalLimiter(req, res, next),
);
const payLimiter = rateLimit({ name: 'pay', windowMs: 10 * 60 * 1000, max: 20 });
for (const p of [
    '/api/helcim-purchase',
    '/create-payment-intent',
    '/create-checkout-session',
    '/process-payment',
    '/api/proxy-tracking-ingest',
    '/api/retailer-order-ref',
]) {
    app.post(p, payLimiter);
}
app.post('/api/checkout-quote', rateLimit({ name: 'quote', windowMs: 10 * 60 * 1000, max: 120 }));
app.use('/api/internal', rateLimit({ name: 'internal', windowMs: 10 * 60 * 1000, max: 1200 }));

// Pay pages: register before body parsers and static (CORS already handles OPTIONS preflight).
app.use((req, res, next) => {
    if (req.hostname === 'pay.wrrapd.com') {
        req.isPayDomain = true;
    } else if (req.hostname === 'api.wrrapd.com') {
        req.isApiDomain = true;
    }
    next();
});

app.get('/success', (req, res) => {
    if (!req.isPayDomain) {
        return res.status(403).send('Access forbidden.');
    }
    res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

app.get('/cancel', (req, res) => {
    if (!req.isPayDomain) {
        return res.status(403).send('Access forbidden.');
    }
    res.sendFile(path.join(__dirname, 'public', 'cancel.html'));
});

function sendPayCheckout(req, res) {
    if (!req.isPayDomain) {
        return res.status(403).send('Access forbidden.');
    }
    if (retiredExtension.checkoutQueryHasRetiredHub(req)) {
        return res.status(403).type('html').send(retiredExtension.retiredExtensionHtml());
    }
    return res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
}

app.get('/checkout', sendPayCheckout);

app.get('/checkout/lego', sendPayCheckout);

/**
 * Generic per-retailer checkout (e.g. /checkout/sephora, /checkout/walmart).
 * checkout.html reads the retailer from the path and adapts (split first/last
 * name for non-Amazon retailers). Retailer slug must be simple alphanumerics.
 */
app.get('/checkout/:retailer', (req, res) => {
    if (!/^[a-z0-9_-]{2,32}$/i.test(String(req.params.retailer || ''))) {
        return res.status(404).send('Unknown checkout.');
    }
    return sendPayCheckout(req, res);
});

/**
 * Helcim webhook (configure in Helcim → Integrations → Webhooks, URL https://api.wrrapd.com/api/payment-events —
 * Helcim rejects URLs containing "helcim"; the old path stays as an alias). Verifier token in
 * HELCIM_WEBHOOK_VERIFIER_TOKEN. Refunds or reversals made in the Helcim dashboard are recorded on the matching
 * order so Command Center and support see them.
 */
app.post(['/api/payment-events', '/api/helcim-webhook'], express.raw({ type: '*/*', limit: '64kb' }), async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const verified = helcim.verifyWebhook({
        rawBody,
        webhookId: req.get('webhook-id'),
        webhookTimestamp: req.get('webhook-timestamp'),
        webhookSignature: req.get('webhook-signature'),
    });
    if (!verified) return res.status(401).json({ error: 'Bad signature' });
    let evt = {};
    try {
        evt = JSON.parse(rawBody);
    } catch (_) {
        return res.status(400).json({ error: 'Bad JSON' });
    }
    res.status(200).json({ ok: true });
    try {
        if (evt.type !== 'cardTransaction' || !evt.id) return;
        const txn = await helcim.getTransaction(evt.id);
        const d = (txn && txn.data) || {};
        const type = String(d.type || '').toLowerCase();
        fs.appendFileSync(
            path.join(__dirname, 'logs', 'helcim-webhooks.jsonl'),
            `${JSON.stringify({ at: new Date().toISOString(), id: evt.id, type, status: d.status, amount: d.amount, invoiceNumber: d.invoiceNumber || null })}\n`,
        );
        if ((type === 'refund' || type === 'reverse') && helcim.isApproved(d.status) && d.invoiceNumber) {
            recordRefundOnOrder(String(d.invoiceNumber), {
                id: String(d.transactionId || evt.id),
                amountCents: Math.round(Number(d.amount) * 100),
                kind: type,
                reason: 'Helcim dashboard',
                by: 'helcim-webhook',
            });
        }
    } catch (e) {
        console.error('[helcim-webhook]', e && e.message ? e.message : e);
    }
});

// Increase body size limit to handle large base64 images (50MB)
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

const RETIRED_EXTENSION_POSTS = new Set([
    '/api/helcim-purchase',
    '/api/checkout-quote',
    '/process-payment',
    '/create-payment-intent',
    '/create-checkout-session',
    '/api/store-final-shipping-address',
]);
app.use((req, res, next) => {
    if (req.method !== 'POST' || !RETIRED_EXTENSION_POSTS.has(req.path)) return next();
    if (!retiredExtension.bodyHasRetiredHub(req.body)) return next();
    return res.status(403).json({
        error: 'Please install the current Wrrapd extension, then try again.',
    });
});

app.get('/api/extension-config', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    res.set('Cache-Control', 'no-store');
    return res.status(200).json(extensionConfig.publicExtensionConfig());
});

/** Hub closest to the giftee ZIP — the ship-to the extension fills into the retailer checkout. */
app.get('/api/delivery-hub', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    res.set('Cache-Control', 'no-store');
    const zip = typeof req.query.postalCode === 'string' ? req.query.postalCode : '';
    try {
        return res.status(200).json({ ok: true, ...deliveryHubs.publicHubForZip(zip) });
    } catch (e) {
        console.error('[delivery-hub] lookup failed', e && e.message ? e.message : e);
        return res.status(500).json({ error: 'Hub lookup failed' });
    }
});

app.post('/api/gift-box-quote', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const items = Array.isArray(req.body && req.body.items) ? req.body.items.slice(0, 40) : [];
    const quoted = items.map((item) => ({
        title: String((item && item.title) || '').slice(0, 300),
        needsBox: giftBox.looseItemNeedsBox(item),
    }));
    const boxCount = quoted.filter((row) => row.needsBox).length;
    return res.status(200).json({
        ok: true,
        boxChargeUsd: giftBox.BOX_CHARGE_USD,
        boxCount,
        items: quoted,
    });
});

app.get('/api/shopper-terms', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).send('Access forbidden.');
    }
    const retailer = String(req.query.retailer || 'the retailer').trim().slice(0, 40) || 'the retailer';
    res.set('Cache-Control', 'public, max-age=300');
    return res.status(200).json({ html: shopperTerms.shopperTermsHtml(retailer) });
});

const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
    username: 'api',
    key: process.env.MAILGUN_API_KEY
});

const nodemailer = require('nodemailer');

function smtpReadyForPay() {
    const h = process.env.SMTP_HOST?.trim();
    const u = process.env.SMTP_USER?.trim();
    const p = process.env.SMTP_PASS?.trim();
    return !!(h && u && p);
}

function createPaySmtpTransport() {
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    const secure =
        process.env.SMTP_SECURE === 'false'
            ? false
            : process.env.SMTP_SECURE === 'true'
              ? true
              : port === 465;
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST.trim(),
        port,
        secure,
        auth: {
            user: process.env.SMTP_USER.trim(),
            pass: process.env.SMTP_PASS.trim(),
        },
    });
}

/** Mailgun inline shape { filename, data } → nodemailer cid attachments (HTML uses cid:filename). */
function inlineToNodemailer(inlineArr) {
    if (!inlineArr || inlineArr.length === 0) return undefined;
    return inlineArr.map((a) => ({
        filename: a.filename,
        content: a.data,
        cid: a.filename,
    }));
}

/**
 * Order confirmation emails: SMTP (e.g. SiteGround) if SMTP_HOST+SMTP_USER+SMTP_PASS set, else Mailgun.
 */
async function sendProcessPaymentPairEmails(opts) {
    const {
        adminRecipients,
        adminFrom,
        adminSubject,
        adminHtml,
        adminAttachments,
        customerTo,
        customerFrom,
        customerSubject,
        customerHtml,
        customerAttachments,
        customerReplyTo,
    } = opts;

    const smtpOnly = process.env.FORCE_SMTP_ONLY === 'true';
    const liveAdminTo = orderEmails.filterLiveRecipients(adminRecipients);
    if (smtpReadyForPay()) {
        const transporter = createPaySmtpTransport();
        return Promise.allSettled([
            transporter.sendMail({
                from: adminFrom,
                to: liveAdminTo,
                subject: adminSubject,
                html: adminHtml,
                attachments: inlineToNodemailer(adminAttachments),
            }),
            transporter.sendMail({
                from: customerFrom,
                to: customerTo,
                subject: customerSubject,
                html: customerHtml,
                replyTo: customerReplyTo || undefined,
                attachments: inlineToNodemailer(customerAttachments),
            }),
        ]);
    }

    if (smtpOnly) {
        return [
            { status: 'rejected', reason: new Error('SMTP required (FORCE_SMTP_ONLY=true) but SMTP env missing') },
            { status: 'rejected', reason: new Error('SMTP required (FORCE_SMTP_ONLY=true) but SMTP env missing') },
        ];
    }

    return Promise.allSettled([
        mg.messages.create(process.env.MAILGUN_DOMAIN, {
            from: adminFrom,
            to: liveAdminTo,
            subject: adminSubject,
            html: adminHtml,
            ...(adminAttachments.length > 0 ? { inline: adminAttachments } : {}),
        }),
        mg.messages.create(process.env.MAILGUN_DOMAIN, {
            from: customerFrom,
            to: customerTo,
            subject: customerSubject,
            html: customerHtml,
            'h:Reply-To': customerReplyTo,
            'h:X-Mailgun-Attachments': 'inline',
            'o:tag': 'order-confirmation',
            'o:tracking': false,
            ...(customerAttachments.length > 0 ? { inline: customerAttachments } : {}),
        }),
    ]);
}

app.use(express.static(path.join(__dirname, 'public')));

// Warm flower store index in background (CSV → JSON + zip coords)
flowerStores
    .ensureIndex()
    .then((idx) => console.log('[flowers-stores] ready', idx?.counts || {}))
    .catch((e) => console.warn('[flowers-stores] warm failed', e.message));

/** Public: resolved unit prices for checkout UI (Amazon extension + pay.wrrapd.com). */
app.get('/api/pricing-preview', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const geo = {
        postalCode: typeof req.query.postalCode === 'string' ? req.query.postalCode : '',
        state: typeof req.query.state === 'string' ? req.query.state : '',
        country: typeof req.query.country === 'string' ? req.query.country : '',
    };
    const retailer = typeof req.query.retailer === 'string' ? req.query.retailer : '';
    const r = wrrapdPricing.resolveWrrapdUnitPrices(geo, retailer);
    const zip5 = String(geo.postalCode || '32226')
        .replace(/\D/g, '')
        .slice(0, 5) || '32226';
    let estimatedSalesTaxPercent = salesTaxZip.getCombinedRateAsTaxPercent(zip5);
    if (estimatedSalesTaxPercent === null) estimatedSalesTaxPercent = 7.5;
    // Custom-design paper (upload / AI) only where an active WrapStar printer is within radius
    // of the giftee ZIP. No ZIP → not available (fail closed).
    const requestedZip = String(geo.postalCode || '').replace(/\D/g, '').slice(0, 5);
    const customDesign = requestedZip.length === 5
        ? printerCoverage.publicAvailability(requestedZip)
        : { postalCode: '', available: false, radiusMiles: printerCoverage.getRadiusMiles() };
    res.status(200).json({
        ok: true,
        unitPrices: r.unitPrices,
        configVersion: r.configVersion,
        appliedRuleIds: r.appliedRuleIds,
        timeZone: r.timeZone,
        retailer: r.retailer,
        geo: r.geo || null,
        customDesign,
        ...(estimatedSalesTaxPercent !== null ? { estimatedSalesTaxPercent } : {}),
    });
});

/** Public: is custom-printed wrapping paper (upload / AI design) available for a giftee ZIP? */
app.get('/api/custom-design-availability', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const zip = typeof req.query.postalCode === 'string' ? req.query.postalCode : '';
    res.status(200).json({ ok: true, ...printerCoverage.publicAvailability(zip) });
});

const EXTENSION_RETAILER_ORIGIN =
    /^https:\/\/(www\.)?(amazon\.(com|ca|co\.uk|de|fr|es|it|nl|co\.jp|in|com\.au|com\.br|mx)|target\.com|lego\.com|ulta\.com|walmart\.com|nordstrom\.com|kohls\.com|sephora\.com|bestbuy\.com|etsy\.com)(:\d+)?$/i;

function isExtensionRetailerOrigin(origin) {
    return typeof origin === 'string' && EXTENSION_RETAILER_ORIGIN.test(origin);
}

/** Server-side Gemini proxy for Amazon DOM selector hints — keys stay on the server. */
app.options('/api/dom-selector', (req, res) => {
    if (!req.isApiDomain) return res.status(403).end();
    const origin = req.headers.origin || '';
    if (origin && !isExtensionRetailerOrigin(origin)) return res.status(403).end();
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
});

app.post('/api/dom-selector', async (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const origin = req.headers.origin || '';
    if (origin && !isExtensionRetailerOrigin(origin)) {
        return res.status(403).json({ error: 'Forbidden origin' });
    }
    if (origin) {
        res.header('Access-Control-Allow-Origin', origin);
    }

    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt || prompt.length > 12000) {
        return res.status(400).json({ error: 'Invalid prompt' });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
        return res.status(503).json({ error: 'Service unavailable' });
    }

    try {
        const upstream = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                }),
            },
        );
        if (!upstream.ok) {
            return res.status(502).json({ error: 'Upstream error' });
        }
        const data = await upstream.json();
        const text =
            data?.candidates?.[0]?.content?.parts?.[0]?.text != null
                ? String(data.candidates[0].content.parts[0].text).trim()
                : null;
        return res.status(200).json({ ok: true, text });
    } catch (err) {
        console.error('[dom-selector] Gemini proxy error:', err?.message || err);
        return res.status(500).json({ error: 'Internal error' });
    }
});

function requireWrrapdAdminKey(req, res) {
    const expected = (process.env.WRRAPD_ADMIN_API_KEY || '').trim();
    if (!expected) {
        res.status(503).json({ error: 'WRRAPD_ADMIN_API_KEY is not configured on the server' });
        return false;
    }
    const auth = String(req.headers.authorization || '').trim();
    if (auth !== `Bearer ${expected}`) {
        res.status(401).json({ error: 'Unauthorized' });
        return false;
    }
    return true;
}

/** Admin: read dynamic pricing config (all retailers). */
app.get('/api/admin/pricing-config', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    res.status(200).json({ ok: true, config: wrrapdPricing.getPricingConfigForAdmin() });
});

/** Admin: save dynamic pricing config (all retailers). */
app.put('/api/admin/pricing-config', express.json(), (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    try {
        const saved = wrrapdPricing.savePricingConfigFromAdmin(req.body && req.body.config ? req.body.config : req.body);
        res.status(200).json({ ok: true, config: saved });
    } catch (e) {
        console.error('[admin/pricing-config] save failed', e);
        res.status(500).json({ error: 'Failed to save pricing config' });
    }
});

/** Admin: ZIP → county index for geo pricing UI. */
app.get('/api/admin/zip-county-index', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    res.status(200).json({ ok: true, index: wrrapdPricing.zipCounty.getAdminIndex() });
});

/** Admin: lookup county for a ZIP (preview). */
app.get('/api/admin/zip-county-lookup', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    const zip = typeof req.query.postalCode === 'string' ? req.query.postalCode : '';
    const hit = wrrapdPricing.zipCounty.lookupZip(zip);
    res.status(200).json({ ok: true, result: hit });
});

/** Admin: read delivery allowlist. */
app.get('/api/admin/allowed-zip-codes', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    const data = allowedZipCodesLib.loadAllowedZipCodes({ force: true });
    res.status(200).json({
        ok: true,
        allowedZipCodes: data.allowedZipCodes,
        count: data.allowedZipCodes.length,
        updatedAt: data.updatedAt,
        notes: data.notes,
    });
});

/** Admin: replace entire delivery allowlist. */
app.put('/api/admin/allowed-zip-codes', express.json({ limit: '5mb' }), (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    try {
        const body = req.body || {};
        const list = Array.isArray(body.allowedZipCodes) ? body.allowedZipCodes : null;
        if (!list) {
            return res.status(400).json({ error: 'allowedZipCodes array required' });
        }
        const saved = allowedZipCodesLib.saveAllowedZipCodes(list, { notes: body.notes });
        res.status(200).json({
            ok: true,
            allowedZipCodes: saved.allowedZipCodes,
            count: saved.allowedZipCodes.length,
            updatedAt: saved.updatedAt,
            notes: saved.notes,
        });
    } catch (e) {
        console.error('[admin/allowed-zip-codes] save failed', e);
        res.status(500).json({ error: 'Failed to save allowed ZIP codes' });
    }
});

/** Admin: add ZIPs to the allowlist (merge). */
app.post('/api/admin/allowed-zip-codes/add', express.json({ limit: '2mb' }), (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    try {
        const raw = req.body && (req.body.zipCodes || req.body.allowedZipCodes || req.body.zips);
        const list = Array.isArray(raw)
            ? raw
            : String(raw || '')
                  .split(/[\s,;]+/)
                  .filter(Boolean);
        const before = allowedZipCodesLib.loadAllowedZipCodes({ force: true }).allowedZipCodes.length;
        const saved = allowedZipCodesLib.addZips(list);
        res.status(200).json({
            ok: true,
            added: Math.max(0, saved.allowedZipCodes.length - before),
            allowedZipCodes: saved.allowedZipCodes,
            count: saved.allowedZipCodes.length,
            updatedAt: saved.updatedAt,
        });
    } catch (e) {
        console.error('[admin/allowed-zip-codes/add] failed', e);
        res.status(500).json({ error: 'Failed to add ZIP codes' });
    }
});

/** Admin: remove ZIPs from the allowlist. */
app.post('/api/admin/allowed-zip-codes/remove', express.json({ limit: '2mb' }), (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    try {
        const raw = req.body && (req.body.zipCodes || req.body.allowedZipCodes || req.body.zips);
        const list = Array.isArray(raw)
            ? raw
            : String(raw || '')
                  .split(/[\s,;]+/)
                  .filter(Boolean);
        const before = allowedZipCodesLib.loadAllowedZipCodes({ force: true }).allowedZipCodes.length;
        const saved = allowedZipCodesLib.removeZips(list);
        res.status(200).json({
            ok: true,
            removed: Math.max(0, before - saved.allowedZipCodes.length),
            allowedZipCodes: saved.allowedZipCodes,
            count: saved.allowedZipCodes.length,
            updatedAt: saved.updatedAt,
        });
    } catch (e) {
        console.error('[admin/allowed-zip-codes/remove] failed', e);
        res.status(500).json({ error: 'Failed to remove ZIP codes' });
    }
});

/** Admin: check whether a ZIP is currently allowed. */
app.get('/api/admin/allowed-zip-codes/check', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    const zip = typeof req.query.postalCode === 'string' ? req.query.postalCode : '';
    res.status(200).json({ ok: true, result: allowedZipCodesLib.checkZip(zip) });
});

/** Admin: seed allowlist from zip-county index for given states (default FL,GA). */
app.post('/api/admin/allowed-zip-codes/seed-states', express.json(), (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    try {
        const states = Array.isArray(req.body?.states) && req.body.states.length
            ? req.body.states
            : ['FL', 'GA'];
        const saved = allowedZipCodesLib.seedStates(states, { notes: req.body?.notes });
        res.status(200).json({
            ok: true,
            states,
            allowedZipCodes: saved.allowedZipCodes,
            count: saved.allowedZipCodes.length,
            updatedAt: saved.updatedAt,
            notes: saved.notes,
        });
    } catch (e) {
        console.error('[admin/allowed-zip-codes/seed-states] failed', e);
        res.status(500).json({ error: 'Failed to seed ZIP codes' });
    }
});

app.post('/api/admin/allowed-zip-codes/seed-launch-metros', express.json(), (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    try {
        const saved = allowedZipCodesLib.seedLaunchMetros({ notes: req.body?.notes });
        res.status(200).json({
            ok: true,
            allowedZipCodes: saved.allowedZipCodes,
            count: saved.allowedZipCodes.length,
            updatedAt: saved.updatedAt,
            notes: saved.notes,
            counties: allowedZipCodesLib.LAUNCH_METRO_COUNTIES,
        });
    } catch (e) {
        console.error('[admin/allowed-zip-codes/seed-launch-metros] failed', e);
        res.status(500).json({ error: 'Failed to seed launch metro ZIP codes' });
    }
});

// ─── Delivery hubs — admin ────────────────────────────────────────────────────

function deliveryHubReport() {
    deliveryHubs.loadHubs({ force: true });
    return deliveryHubs.getAdminReport(allowedZipCodesLib.loadAllowedZipCodes().allowedZipCodes);
}

/** Admin: hubs + how many allowed giftee ZIPs each one serves. */
app.get('/api/admin/delivery-hubs', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    try {
        res.status(200).json({ ok: true, report: deliveryHubReport() });
    } catch (e) {
        console.error('[admin/delivery-hubs] report failed', e);
        res.status(500).json({ error: 'Failed to load delivery hubs' });
    }
});

/** Admin: add a hub, or edit one by id. */
app.post('/api/admin/delivery-hubs/upsert', express.json(), (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const { hub } = deliveryHubs.upsertHub({
            id: body.id,
            name: body.name,
            kind: body.kind,
            organization: body.organization,
            recipientFirstName: body.recipientFirstName,
            recipientLastName: body.recipientLastName,
            addressLine1: body.addressLine1,
            addressLine2: body.addressLine2,
            city: body.city,
            state: body.state,
            postalCode: body.postalCode,
            phone: body.phone,
            active: body.active,
            notes: body.notes,
        });
        res.status(200).json({ ok: true, hub, report: deliveryHubReport() });
    } catch (e) {
        console.error('[admin/delivery-hubs/upsert] failed', e && e.message ? e.message : e);
        res.status(400).json({ error: e && e.message ? e.message : 'Failed to save hub' });
    }
});

app.post('/api/admin/delivery-hubs/remove', express.json(), (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    try {
        const { removed } = deliveryHubs.removeHub(req.body && req.body.id);
        res.status(200).json({ ok: true, removed, report: deliveryHubReport() });
    } catch (e) {
        res.status(400).json({ error: e && e.message ? e.message : 'Failed to remove hub' });
    }
});

/** Admin: pause / resume a hub without deleting it. */
app.post('/api/admin/delivery-hubs/active', express.json(), (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    try {
        const { updated } = deliveryHubs.setHubActive(req.body && req.body.id, req.body && req.body.active !== false);
        res.status(200).json({ ok: true, updated, report: deliveryHubReport() });
    } catch (e) {
        res.status(400).json({ error: e && e.message ? e.message : 'Failed to update hub' });
    }
});

/** Admin: hub used when a giftee ZIP has no known location. */
app.post('/api/admin/delivery-hubs/default', express.json(), (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    try {
        deliveryHubs.setDefaultHub(req.body && req.body.id);
        res.status(200).json({ ok: true, report: deliveryHubReport() });
    } catch (e) {
        res.status(400).json({ error: e && e.message ? e.message : 'Failed to set default hub' });
    }
});

/** Admin: which hub serves a giftee ZIP, and how far every hub is. */
app.get('/api/admin/delivery-hubs/check', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    const zip = typeof req.query.postalCode === 'string' ? req.query.postalCode : '';
    res.status(200).json({ ok: true, result: deliveryHubs.checkZip(zip) });
});

// ─── Custom-design (printer) coverage — admin ─────────────────────────────────

/** Admin: full printer-site + coverage report for the Command Center dashboard. */
app.get('/api/admin/printer-sites', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    try {
        printerCoverage.loadSites({ force: true });
        res.status(200).json({ ok: true, report: printerCoverage.getAdminReport() });
    } catch (e) {
        console.error('[admin/printer-sites] report failed', e);
        res.status(500).json({ error: 'Failed to build printer coverage report' });
    }
});

/** Admin: add / update one printer site (manual or roster). */
app.post('/api/admin/printer-sites/upsert', express.json(), (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const { site } = printerCoverage.upsertSite({
            id: body.id,
            wrapstarId: body.wrapstarId,
            name: body.name,
            postalCode: body.postalCode,
            printerSize: body.printerSize,
            printerModel: body.printerModel,
            printerLabel: body.printerLabel,
            active: body.active,
            source: body.source,
            notes: body.notes,
        });
        res.status(200).json({ ok: true, site, report: printerCoverage.getAdminReport() });
    } catch (e) {
        console.error('[admin/printer-sites/upsert] failed', e);
        res.status(400).json({ error: e && e.message ? e.message : 'Failed to save printer site' });
    }
});

/** Admin: remove a printer site by id (or wrapstarId). */
app.post('/api/admin/printer-sites/remove', express.json(), (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    try {
        const { removed } = printerCoverage.removeSite(req.body && req.body.id);
        res.status(200).json({ ok: true, removed, report: printerCoverage.getAdminReport() });
    } catch (e) {
        console.error('[admin/printer-sites/remove] failed', e);
        res.status(500).json({ error: 'Failed to remove printer site' });
    }
});

/** Admin: pause / resume a printer site without deleting it. */
app.post('/api/admin/printer-sites/active', express.json(), (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    try {
        const { updated } = printerCoverage.setSiteActive(req.body && req.body.id, req.body && req.body.active !== false);
        res.status(200).json({ ok: true, updated, report: printerCoverage.getAdminReport() });
    } catch (e) {
        console.error('[admin/printer-sites/active] failed', e);
        res.status(500).json({ error: 'Failed to update printer site' });
    }
});

/** Admin: set the coverage radius (miles) applied to every printer site. */
app.post('/api/admin/printer-sites/radius', express.json(), (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    try {
        printerCoverage.setRadiusMiles(req.body && req.body.radiusMiles, { notes: req.body && req.body.notes });
        res.status(200).json({ ok: true, report: printerCoverage.getAdminReport() });
    } catch (e) {
        console.error('[admin/printer-sites/radius] failed', e);
        res.status(500).json({ error: 'Failed to set coverage radius' });
    }
});

/**
 * Admin: replace all roster-sourced sites with the tracking platform's approved
 * WrapStars that own a printer (manual sites are kept).
 */
app.put('/api/admin/printer-sites/roster', express.json({ limit: '2mb' }), (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    try {
        const sites = Array.isArray(req.body && req.body.sites) ? req.body.sites : null;
        if (!sites) {
            return res.status(400).json({ error: 'sites array required' });
        }
        printerCoverage.replaceRosterSites(sites, { notes: req.body && req.body.notes });
        res.status(200).json({ ok: true, report: printerCoverage.getAdminReport() });
    } catch (e) {
        console.error('[admin/printer-sites/roster] failed', e);
        res.status(500).json({ error: 'Failed to sync roster printer sites' });
    }
});

/** Admin: which printer sites cover a giftee ZIP (nearest first)? */
app.get('/api/admin/printer-sites/check', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    const zip = typeof req.query.postalCode === 'string' ? req.query.postalCode : '';
    res.status(200).json({ ok: true, result: printerCoverage.checkZip(zip) });
});

/** Admin: preview ZIPs within a radius of any ZIP (before adding a site). */
app.get('/api/admin/printer-sites/radius-preview', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    const zip = typeof req.query.postalCode === 'string' ? req.query.postalCode : '';
    const radius = req.query.radiusMiles != null ? Number(req.query.radiusMiles) : printerCoverage.getRadiusMiles();
    const zips = require(path.join(__dirname, 'lib', 'zip-centroids')).zipsWithinRadius(zip, radius);
    res.status(200).json({ ok: true, postalCode: printerCoverage.normZip(zip), radiusMiles: radius, count: zips.length, zips });
});

app.post('/api/admin/retailer-stores/reload', express.json(), async (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    try {
        const idx = await flowerStores.buildIndexFromCsvs();
        res.status(200).json({ ok: true, counts: idx.counts, updatedAt: idx.updatedAt });
    } catch (e) {
        console.error('[admin/retailer-stores/reload] failed', e);
        res.status(500).json({ error: 'Failed to rebuild store index' });
    }
});

app.get('/api/admin/retailer-stores', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    const idx = flowerStores.loadIndex();
    res.status(200).json({
        ok: true,
        counts: idx?.counts || null,
        updatedAt: idx?.updatedAt || null,
        maxMiles: flowerStores.MAX_MILES,
    });
});

app.post('/api/flowers/prefetch', express.json(), async (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    try {
        const postalCode = String(req.body?.postalCode || req.query?.postalCode || '');
        const r = await flowerCatalog.prefetch(postalCode);
        res.status(200).json(r);
    } catch (e) {
        console.error('[flowers/prefetch]', e);
        res.status(500).json({ ok: false, error: 'prefetch_failed' });
    }
});

app.get('/api/flowers/catalog', async (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    try {
        const postalCode = String(req.query?.postalCode || '');
        const r = await flowerCatalog.buildCatalogForZip(postalCode);
        res.status(200).json(r);
    } catch (e) {
        console.error('[flowers/catalog]', e);
        res.status(500).json({
            status: 'unavailable',
            choices: [],
            message:
                'We apologize — floral delivery is not currently available for this ZIP code. Gift wrapping is still available.',
        });
    }
});

/**
 * Server-priced checkout total. Same rules for the quote and the Helcim charge.
 * @returns {{ ok: true, amountCents: number, pricingDebug: object|null } | { ok: false, status: number, body: object }}
 */
function resolveCheckoutCharge(body, logLabel) {
    const source = body && typeof body === 'object' ? body : {};
    const { total, orderNumber, pricingCart } = source;
    if (pricingCart != null && typeof pricingCart === 'object') {
        const cart = wrrapdPricing.sanitizePricingCartFromRequest(pricingCart);
        if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
            return { ok: false, status: 400, body: { error: 'pricingCart.items required' } };
        }
        for (const item of cart.items) {
            for (const opt of item.options || []) {
                if (!opt.checkbox_flowers) continue;
                if (!opt.flower_offer_id) {
                    opt.flower_amount = null;
                    continue;
                }
                const chk = flowerCatalog.validateOfferAmount(opt.flower_offer_id, opt.flower_amount);
                if (!chk.ok) {
                    return {
                        ok: false,
                        status: 400,
                        body: {
                            error: 'Flower offer price mismatch or expired — refresh Add Flowers and try again',
                            detail: chk.error,
                            expected: chk.expected,
                        },
                    };
                }
                opt.flower_amount = chk.offer.chargedPrice;
            }
        }
        const validated = wrrapdPricing.computeTotalCentsFromPricingCart(cart);
        if (!validated.ok) {
            return { ok: false, status: 400, body: { error: validated.error || 'Invalid cart total' } };
        }
        const subSum =
            validated.breakdown.giftWrapTotal +
            validated.breakdown.designAiTotal +
            validated.breakdown.designUploadTotal +
            validated.breakdown.flowersTotal;
        if (!Number.isFinite(subSum) || subSum <= 0) {
            return { ok: false, status: 400, body: { error: 'Zero or invalid Wrrapd subtotal' } };
        }
        const amountCents = validated.cents;
        const pricingDebug = {
            configVersion: validated.configVersion,
            appliedRuleIds: validated.appliedRuleIds,
            serverCents: amountCents,
        };
        if (total != null && total !== '') {
            const clientCents = Math.round(Number(total));
            if (Number.isFinite(clientCents) && Math.abs(clientCents - amountCents) > 1) {
                console.warn(`[${logLabel}] client/server total mismatch`, {
                    orderNumber: orderNumber || null,
                    clientCents,
                    serverCents: amountCents,
                    postalCode: cart.postalCode,
                    retailer: cart.retailer,
                });
                pricingDebug.clientCents = clientCents;
                pricingDebug.adjusted = true;
            }
        }
        return { ok: true, amountCents, pricingDebug };
    }
    console.warn(`[${logLabel}] rejected: no pricingCart`, { orderNumber: orderNumber || null });
    return {
        ok: false,
        status: 400,
        body: { error: 'Your cart could not be priced. Please refresh the page and try again.' },
    };
}

function helcimBillingFromClient(raw) {
    const b = raw && typeof raw === 'object' ? raw : {};
    const addr = b.address && typeof b.address === 'object' ? b.address : {};
    const name = String(b.name || '').trim().slice(0, 80);
    const street1 = String(addr.line1 || '').trim().slice(0, 120);
    const street2 = String(addr.line2 || '').trim().slice(0, 120);
    const postal = String(addr.postal_code || addr.postalCode || '').replace(/\D/g, '').slice(0, 10);
    const province = String(addr.state || '').trim().slice(0, 2).toUpperCase();
    const city = String(addr.city || '').trim().slice(0, 80);
    const phoneDigits = String(b.phone || '').replace(/\D/g, '').slice(0, 15);
    const email = String(b.email || '').trim().slice(0, 120);
    if (!name || !street1 || postal.length < 5) return null;
    const out = {
        name,
        street1,
        city,
        province,
        country: 'USA',
        postalCode: postal,
    };
    if (street2) out.street2 = street2;
    if (phoneDigits.length >= 10) out.phone = phoneDigits;
    if (email.includes('@')) out.email = email;
    return out;
}

function clientIpForHelcim(req) {
    const xf = req.headers['x-forwarded-for'];
    const first = typeof xf === 'string' ? xf.split(',')[0] : '';
    return String(first || req.ip || '').replace(/^::ffff:/, '').trim() || '0.0.0.0';
}

app.get('/api/helcim-checkout-config', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).send('Access forbidden.');
    }
    if (!helcim.enabled()) {
        return res.status(503).json({ enabled: false });
    }
    return res.status(200).json({ enabled: true, jsToken: helcim.jsToken() });
});

app.post('/api/checkout-quote', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).send('Access forbidden.');
    }
    const priced = resolveCheckoutCharge(req.body || {}, 'checkout-quote');
    if (!priced.ok) return res.status(priced.status).json(priced.body);
    return res.status(200).json({
        serverCents: priced.amountCents,
        ...(priced.pricingDebug ? { pricing: priced.pricingDebug } : {}),
    });
});

app.post('/api/helcim-purchase', async (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).send('Access forbidden.');
    }
    if (!helcim.enabled()) {
        return res.status(503).json({ error: 'Payment is not available. Please refresh the page.' });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const cardToken = String(body.cardToken || '').trim();
    if (!cardToken || cardToken.length > 80) {
        return res.status(400).json({ error: 'Card could not be verified. Check the card and try again.' });
    }
    const priced = resolveCheckoutCharge(body, 'helcim-purchase');
    if (!priced.ok) return res.status(priced.status).json(priced.body);
    const billing = helcimBillingFromClient(body.billing);
    if (!billing) {
        return res.status(400).json({ error: 'Billing address is required.' });
    }
    try {
        const result = await helcim.purchase({
            amountCents: priced.amountCents,
            cardToken,
            orderNumber: body.orderNumber,
            billing,
            ipAddress: clientIpForHelcim(req),
        });
        const data = result.data || {};
        if (!result.ok || !helcim.isApproved(data.status) || !data.transactionId) {
            console.warn('[helcim-purchase] not approved', {
                http: result.status,
                orderNumber: body.orderNumber || null,
                helcimStatus: data.status || null,
            });
            return res.status(402).json({ error: helcim.errorText(data) });
        }
        const chargedCents = Math.round(Number(data.amount) * 100);
        if (Number.isFinite(chargedCents) && Math.abs(chargedCents - priced.amountCents) > 1) {
            console.error('[helcim-purchase] amount mismatch', {
                transactionId: data.transactionId,
                chargedCents,
                expectedCents: priced.amountCents,
            });
        }
        return res.status(200).json({
            paymentIntentId: String(data.transactionId),
            ...(priced.pricingDebug ? { pricing: priced.pricingDebug } : {}),
        });
    } catch (error) {
        console.error('[helcim-purchase]', error);
        return res.status(500).json({ error: 'Payment could not complete. Please try again.' });
    }
});

// Endpoint specific to api.wrrapd.com
app.post('/create-payment-intent', async (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).send('Access forbidden.');
    }

    const { orderNumber } = req.body || {};

    try {
        const priced = resolveCheckoutCharge(req.body || {}, 'create-payment-intent');
        if (!priced.ok) return res.status(priced.status).json(priced.body);
        const { amountCents, pricingDebug } = priced;

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountCents,
            currency: 'usd',
            payment_method_types: ['card'],
            metadata: {
                orderNumber: orderNumber || 'N/A',
                ...(pricingDebug && pricingDebug.configVersion
                    ? { wrrapdPriceVersion: String(pricingDebug.configVersion).slice(0, 80) }
                    : {}),
            },
        });

        res.status(200).json({
            clientSecret: paymentIntent.client_secret,
            ...(pricingDebug ? { pricing: pricingDebug } : {}),
        });
    } catch (error) {
        console.error('Error creating PaymentIntent:', error);
        res.status(500).json({ error: 'Failed to create PaymentIntent' });
    }
});

// Stripe-hosted Checkout — no Stripe.js / Elements on our page (avoids iframe/popup issues)
app.post('/create-checkout-session', async (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).send('Access forbidden.');
    }

    const { orderNumber, customerEmail } = req.body || {};

    try {
        const priced = resolveCheckoutCharge(req.body || {}, 'create-checkout-session');
        if (!priced.ok) return res.status(priced.status).json(priced.body);

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        unit_amount: priced.amountCents,
                        product_data: {
                            name: `Wrrapd Gift Wrap — Order ${orderNumber || 'N/A'}`,
                        },
                    },
                    quantity: 1,
                },
            ],
            success_url: 'https://pay.wrrapd.com/success?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'https://pay.wrrapd.com/cancel',
            customer_email:
                typeof customerEmail === 'string' && customerEmail.includes('@') ? customerEmail.trim() : undefined,
            phone_number_collection: { enabled: true },
            metadata: {
                orderNumber: orderNumber || 'N/A',
            },
            payment_intent_data: {
                metadata: {
                    orderNumber: orderNumber || 'N/A',
                },
            },
        });

        res.status(200).json({ url: session.url });
    } catch (error) {
        console.error('Error creating Checkout Session:', error);
        res.status(500).json({ error: 'Failed to create Checkout Session' });
    }
});

app.get('/api/checkout-session-complete', async (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).send('Access forbidden.');
    }

    const sessionId = req.query.session_id;
    if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ error: 'Missing session_id' });
    }

    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['payment_intent'],
        });

        const pi = session.payment_intent;
        const paymentIntentId = typeof pi === 'string' ? pi : pi && pi.id;

        if (!paymentIntentId) {
            return res.status(400).json({ error: 'No payment intent on session' });
        }

        const cd = session.customer_details || {};

        res.status(200).json({
            paymentIntentId,
            paymentStatus: session.payment_status,
            customerEmail: cd.email || '',
            customerPhone: cd.phone || '',
        });
    } catch (error) {
        console.error('checkout-session-complete error:', error);
        res.status(500).json({ error: error.message || 'Failed to retrieve session' });
    }
});

/** Public HTTPS URL for objects stored in bucket `wrrapd-media` (path may be `folder/file.png`). */
function publicWrrapdMediaUrl(objectPath) {
    if (!objectPath || typeof objectPath !== 'string') return '';
    const trimmed = objectPath.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    let p = trimmed.replace(/^gs:\/\/[^/]+\//, '');
    if (p.startsWith('wrrapd-media/')) p = p.slice('wrrapd-media/'.length);
    if (!p) return '';
    return `https://storage.googleapis.com/wrrapd-media/${p.split('/').map(encodeURIComponent).join('/')}`;
}

// Helper function to download image from GCS for email attachment
const getImageForEmail = async (filePath) => {
    if (!filePath) return null;
    
    console.log(`Attempting to download image from path: ${filePath}`);
    
    try {
        // Check if file exists first
        const [exists] = await storage.bucket('wrrapd-media').file(filePath).exists();
        if (!exists) {
            console.error(`File does not exist in bucket: ${filePath}`);
            return null;
        }
        
        // Download the file from GCS
        const [fileContent] = await storage.bucket('wrrapd-media').file(filePath).download();
        
        console.log(`Successfully downloaded file: ${filePath}, size: ${fileContent.length} bytes`);
        
        return {
            contentType: filePath.toLowerCase().endsWith('.png') ? 'image/png' : 
                         filePath.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg',
            data: fileContent
        };
    } catch (error) {
        console.error(`Error downloading image ${filePath}:`, error);
        return null;
    }
};

/** Lowercase trimmed email for cross-system joins (WordPress, future claim API). */
function normalizeCustomerEmail(email) {
    if (email == null || typeof email !== 'string') return null;
    const t = email.trim().toLowerCase();
    return t.includes('@') ? t : null;
}

/**
 * Stable Wrrapd customer id per normalized email (Phase 1 — guest → account backfill prep).
 * Persists under `customers/email_to_customer_id.json` next to `orders/`.
 */
function getOrCreateWrrapdCustomerId(emailNorm) {
    if (!emailNorm) return null;
    const customersDir = path.join(__dirname, 'customers');
    const indexPath = path.join(customersDir, 'email_to_customer_id.json');
    try {
        if (!fs.existsSync(customersDir)) {
            fs.mkdirSync(customersDir, { recursive: true });
        }
        let map = {};
        if (fs.existsSync(indexPath)) {
            try {
                map = JSON.parse(fs.readFileSync(indexPath, 'utf8')) || {};
            } catch (_) {
                map = {};
            }
        }
        if (map[emailNorm] && typeof map[emailNorm] === 'string') {
            return map[emailNorm];
        }
        const id =
            typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `wc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
        map[emailNorm] = id;
        fs.writeFileSync(indexPath, JSON.stringify(map, null, 2), 'utf8');
        return id;
    } catch (e) {
        console.error('[customers] getOrCreateWrrapdCustomerId failed:', e && e.message ? e.message : e);
        return null;
    }
}

const CHECKOUT_INVOICE_AGGREGATE_CODES = new Set([
    'WRPD_GIFT_WRAP_BASE',
    'WRPD_CUSTOM_DESIGN_AI',
    'WRPD_CUSTOM_DESIGN_UPLOAD',
    'WRPD_FLOWERS',
    'WRPD_BOX_CHARGE',
    'WRPD_SUBTOTAL_BEFORE_TAX',
    'WRPD_ESTIMATED_TAX',
    'WRPD_ORDER_TOTAL',
]);

function sanitizeMoneyField(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return Math.round(v * 100) / 100;
}

/** Pay UI used "AmazonFlowers" / … as internal keys; flowers are a Wrrapd add-on, not Amazon retail. */
function normalizeCheckoutInvoiceLineLabelForStorage(label) {
    if (typeof label !== 'string') return '';
    const s = label.trim();
    if (/gift\s*wrap\s*wrrapd|wrapwrrapd|wrrapd\s*:\s*wrrapd/i.test(s)) {
        return 'Gift wrap';
    }
    if (/^Lego\s*Flowers/i.test(s)) return 'Flowers add-on';
    if (/^Lego\s*AI/i.test(s)) return 'AI design add-on';
    if (/^Lego\s*Wrrapd/i.test(s)) return 'Gift wrap';
    const mFlowers = /^AmazonFlowers\s*:\s*(.*)$/i.exec(s);
    if (mFlowers) {
        const rest = mFlowers[1].trim();
        if (!rest || /^flowers-\d+$/i.test(rest)) return 'Flowers add-on';
        return `Flowers: ${rest}`;
    }
    if (/^AmazonFlowers$/i.test(s)) return 'Flowers add-on';
    const mAi = /^AmazonAI\s*:\s*(.*)$/i.exec(s);
    if (mAi) {
        return 'AI design add-on';
    }
    const mW = /^AmazonWrrapd\s*:\s*(.*)$/i.exec(s);
    if (mW) {
        return 'Gift wrap';
    }
    return s;
}

function sanitizeCheckoutInvoiceCompleteForStorage(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.schemaVersion !== 1) return null;
    const currency = raw.currency === 'USD' ? 'USD' : null;
    if (!currency) return null;
    const trRaw = raw.taxRatePercent;
    if (typeof trRaw !== 'number' || !Number.isFinite(trRaw) || trRaw < 0 || trRaw > 100) return null;
    const taxRatePercent = Math.round(trRaw * 1000) / 1000;
    const priceCatalog =
        raw.priceCatalog && typeof raw.priceCatalog === 'object'
            ? {
                  giftWrapBase: sanitizeMoneyField(raw.priceCatalog.giftWrapBase),
                  customDesignAi: sanitizeMoneyField(raw.priceCatalog.customDesignAi),
                  customDesignUpload: sanitizeMoneyField(raw.priceCatalog.customDesignUpload),
                  flowers: sanitizeMoneyField(raw.priceCatalog.flowers),
              }
            : null;
    const aggIn = Array.isArray(raw.aggregateLines) ? raw.aggregateLines : [];
    const aggregateLines = [];
    for (const row of aggIn.slice(0, 24)) {
        if (!row || typeof row !== 'object') continue;
        const code = typeof row.code === 'string' ? row.code.trim().slice(0, 48) : '';
        if (!CHECKOUT_INVOICE_AGGREGATE_CODES.has(code)) continue;
        const label = typeof row.label === 'string' ? row.label.trim().slice(0, 160) : '';
        const amount = sanitizeMoneyField(row.amount);
        if (amount === null) continue;
        const o = { code, amount };
        if (label) o.label = label;
        const qty = row.quantity;
        if (typeof qty === 'number' && Number.isFinite(qty) && qty >= 0 && qty <= 9999) {
            o.quantity = Math.floor(qty);
        }
        const unitPrice = sanitizeMoneyField(row.unitPrice);
        if (unitPrice !== null) o.unitPrice = unitPrice;
        aggregateLines.push(o);
    }
    if (aggregateLines.length !== CHECKOUT_INVOICE_AGGREGATE_CODES.size) return null;
    if (new Set(aggregateLines.map((l) => l.code)).size !== CHECKOUT_INVOICE_AGGREGATE_CODES.size) return null;

    const subtotal = sanitizeMoneyField(raw.subtotal);
    const estimatedTax = sanitizeMoneyField(raw.estimatedTax);
    const total = sanitizeMoneyField(raw.total);
    if (subtotal === null || estimatedTax === null || total === null) return null;

    const perIn = Array.isArray(raw.perOptionLines) ? raw.perOptionLines : [];
    const perOptionLines = [];
    for (const row of perIn.slice(0, 200)) {
        if (!row || typeof row !== 'object') continue;
        const asin =
            row.asin != null && String(row.asin).trim() !== ''
                ? String(row.asin).trim().slice(0, 20)
                : null;
        const productTitle =
            typeof row.productTitle === 'string' ? row.productTitle.trim().slice(0, 300) : null;
        const optionIndex =
            typeof row.optionIndex === 'number' && Number.isFinite(row.optionIndex) && row.optionIndex >= 0
                ? Math.floor(row.optionIndex)
                : null;
        if (optionIndex === null || optionIndex > 500) continue;
        perOptionLines.push({
            ...(asin ? { asin } : {}),
            ...(productTitle ? { productTitle } : {}),
            optionIndex,
            checkbox_wrrapd: row.checkbox_wrrapd === true,
            selected_wrapping_option:
                row.selected_wrapping_option != null ? String(row.selected_wrapping_option).slice(0, 32) : null,
            checkbox_flowers: row.checkbox_flowers === true,
            giftWrapBase: sanitizeMoneyField(row.giftWrapBase) ?? 0,
            customDesignAi: sanitizeMoneyField(row.customDesignAi) ?? 0,
            customDesignUpload: sanitizeMoneyField(row.customDesignUpload) ?? 0,
            flowers: sanitizeMoneyField(row.flowers) ?? 0,
        });
    }

    return {
        schemaVersion: 1,
        currency,
        taxRatePercent,
        ...(priceCatalog &&
        priceCatalog.giftWrapBase != null &&
        priceCatalog.customDesignAi != null &&
        priceCatalog.customDesignUpload != null &&
        priceCatalog.flowers != null
            ? { priceCatalog }
            : {}),
        aggregateLines,
        perOptionLines,
        subtotal,
        estimatedTax,
        total,
    };
}

function sanitizeCheckoutInvoiceForStorage(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const linesIn = Array.isArray(raw.lines) ? raw.lines : [];
    const outLines = [];
    for (const row of linesIn.slice(0, 40)) {
        if (!row || typeof row !== 'object') continue;
        const label =
            typeof row.label === 'string'
                ? normalizeCheckoutInvoiceLineLabelForStorage(row.label).trim().slice(0, 160)
                : '';
        if (!label) continue;
        const amount =
            typeof row.amount === 'number' && Number.isFinite(row.amount)
                ? Math.round(row.amount * 100) / 100
                : null;
        const o = { label };
        if (amount !== null) o.amount = amount;
        outLines.push(o);
    }
    const num = (x) =>
        typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 100) / 100 : null;
    const complete = sanitizeCheckoutInvoiceCompleteForStorage(raw.complete);
    const out = {
        lines: outLines,
        subtotal: num(raw.subtotal),
        estimatedTax: num(raw.estimatedTax),
        total: num(raw.total),
    };
    if (complete) out.complete = complete;
    return out;
}

/** Pre-tax wrap (base+AI+upload) and flowers totals in cents from checkout invoice aggregates. */
function revenueCentsFromCheckoutInvoice(checkoutInvoice) {
    const complete =
        sanitizeCheckoutInvoiceCompleteForStorage(checkoutInvoice) ||
        (checkoutInvoice &&
        checkoutInvoice.complete &&
        sanitizeCheckoutInvoiceCompleteForStorage(checkoutInvoice.complete));
    const lines = complete && Array.isArray(complete.aggregateLines) ? complete.aggregateLines : null;
    if (!lines) {
        return { wrapRevenueCents: null, flowersRevenueCents: null, orderValueCents: null };
    }
    let wrap = 0;
    let flowers = 0;
    for (const row of lines) {
        const code = row && row.code;
        const amount = typeof row.amount === 'number' ? row.amount : null;
        if (amount == null || !Number.isFinite(amount)) continue;
        const cents = Math.round(amount * 100);
        if (
            code === 'WRPD_GIFT_WRAP_BASE' ||
            code === 'WRPD_CUSTOM_DESIGN_AI' ||
            code === 'WRPD_CUSTOM_DESIGN_UPLOAD'
        ) {
            wrap += cents;
        } else if (code === 'WRPD_FLOWERS') {
            flowers += cents;
        }
    }
    return {
        wrapRevenueCents: wrap,
        flowersRevenueCents: flowers,
        orderValueCents: wrap + flowers,
    };
}

/** Canonical sales channel for saved JSON + tracking ingest (`name_of_retailer` mirrors this string). */
function normalizePayRetailer(body) {
    const raw =
        (body && typeof body.retailer === 'string' && body.retailer) ||
        (body && typeof body.name_of_retailer === 'string' && body.name_of_retailer) ||
        '';
    const lo = String(raw).trim().toLowerCase().replace(/['’]/g, '');
    if (lo === 'lego') return 'Lego';
    if (lo === 'target') return 'Target';
    if (lo === 'ulta') return 'Ulta';
    if (lo === 'walmart') return 'Walmart';
    if (lo === 'nordstrom') return 'Nordstrom';
    if (lo === 'kohls') return 'Kohls';
    if (lo === 'sephora') return 'Sephora';
    if (lo === 'bestbuy' || lo === 'best buy') return 'Best Buy';
    if (lo === 'etsy') return 'Etsy';
    return 'Amazon';
}

/** Wrrapd scheduled instant = retailer's promised delivery day + 1, nominal 2:00 PM Eastern. */
function wrrapdIsoFromRetailerYmd(ymd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return null;
    const [y, m, d] = ymd.split('-').map(Number);
    // 18:00Z ≈ 2:00 PM ET; +1 calendar day via Date.UTC normalization.
    return new Date(Date.UTC(y, m - 1, d + 1, 18, 0, 0)).toISOString();
}

// Function to save order data to a JSON file
const saveOrderToJsonFile = (orderData, paymentData, customerData, orderNumber, checkoutInvoice, payRetailer) => {
    const channel = normalizePayRetailer({ retailer: payRetailer });
    // Create 'orders' directory if it doesn't exist
    const ordersDir = path.join(__dirname, 'orders');
    if (!fs.existsSync(ordersDir)) {
        fs.mkdirSync(ordersDir);
    }

    // Create a timestamp for the filename
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filename = `order_${timestamp}.json`;
    const filePath = path.join(ordersDir, filename);

    const customerEmailNorm = normalizeCustomerEmail(
        customerData && customerData.email != null ? String(customerData.email) : '',
    );
    const wrrapdCustomerId = getOrCreateWrrapdCustomerId(customerEmailNorm);

    // Prepare the data to be saved
    const ci = sanitizeCheckoutInvoiceForStorage(checkoutInvoice);
    const hasCheckoutInvoice =
        ci &&
        ((Array.isArray(ci.lines) && ci.lines.length > 0) ||
            (ci.complete && ci.complete.aggregateLines && ci.complete.aggregateLines.length > 0));
    const saveData = {
        orderNumber: orderNumber,
        timestamp: new Date().toISOString(),
        retailer: channel,
        name_of_retailer: channel,
        orderItems: orderData,
        payment: {
            id: paymentData.id,
            amount: paymentData.amount,
            status: paymentData.status
        },
        customer: {
            email: customerData.email,
            phone: customerData.phone,
            ...(customerEmailNorm ? { emailNorm: customerEmailNorm } : {}),
        },
        ...(customerEmailNorm ? { customerEmailNorm } : {}),
        ...(wrrapdCustomerId ? { wrrapdCustomerId } : {}),
        ...(hasCheckoutInvoice ? { checkoutInvoice: ci } : {}),
    };

    // Write the data to the file
    fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2));
    
    console.log(`Order data saved to ${filePath}`);
    return filePath;
};

function normalizeOrderItems(orderData) {
    const srcItems = Array.isArray(orderData)
        ? orderData
        : (!orderData || typeof orderData !== 'object')
            ? []
            : Object.values(orderData);

    const out = [];
    for (const item of srcItems) {
        if (!item || typeof item !== 'object') continue;
        const options = Array.isArray(item.options) ? item.options : [];
        if (!options.length && Array.isArray(orderData)) {
            // Legacy array payloads may already be flattened as one row per selected Wrrapd item.
            if (item.checkbox_wrrapd === true) {
                out.push({ ...item, checkbox_wrrapd: true });
            }
            continue;
        }
        for (const option of options) {
            if (!option || typeof option !== 'object') continue;
            const wrapVal = String(option.selected_wrapping_option || '').toLowerCase();
            const isOurWrappingChoice =
                wrapVal === 'wrrapd' || wrapVal === 'ai' || wrapVal === 'upload';
            const hasDesignData =
                !!option.selected_ai_design ||
                !!option.uploaded_design_path ||
                !!option.file_data_url ||
                option.checkbox_flowers === true;
            // Do not treat Amazon-only gift bag / other Amazon UI selections as Wrrapd rows.
            const isWrrapdLike =
                option.checkbox_wrrapd === true ||
                (hasDesignData && isOurWrappingChoice);
            if (!isWrrapdLike) continue;
            out.push({
                asin: item.asin,
                title: item.title,
                imageUrl: item.imageUrl || null,
                checkbox_wrrapd: option.checkbox_wrrapd === true,
                checkbox_flowers: option.checkbox_flowers,
                selected_flower_design: option.selected_flower_design || null,
                flower_offer_id: option.flower_offer_id || null,
                flower_amount: option.flower_amount != null ? option.flower_amount : null,
                flower_title: option.flower_title || null,
                flower_image_url: option.flower_image_url || null,
                selected_wrapping_option: option.selected_wrapping_option,
                selected_ai_design: option.selected_ai_design || null,
                uploaded_design_path: option.uploaded_design_path || null,
                uploaded_design_name: option.uploaded_design_name || null,
                occasion: option.occasion || null,
                shippingAddress: option.shippingAddress,
                finalShippingAddress: option.finalShippingAddress || null,
                gifteeRecipientAddress: option.gifteeRecipientAddress || null,
                deliveryInstructions: option.deliveryInstructions || null,
                giftMessage: option.giftMessage || null,
                senderName: option.senderName || null,
                wrrapdHint: option.wrrapdHint || item.wrrapdHint || null,
                amazonDeliveryDate: option.amazonDeliveryDate || item.amazonDeliveryDate || null,
                deliveryDate: option.deliveryDate || item.deliveryDate || null,
                estimatedDeliveryDate: option.estimatedDeliveryDate || item.estimatedDeliveryDate || null,
                arrivalDate: option.arrivalDate || item.arrivalDate || null,
                shippingDate: option.shippingDate || item.shippingDate || null,
                packageDimensions: item.packageDimensions || null,
                productDimensions: item.productDimensions || null,
                itemCategory: item.itemCategory || null,
            });
        }
    }
    return out;
}

function findExistingOrderByPaymentIntent(paymentIntentId) {
    const ordersDir = path.join(__dirname, 'orders');
    if (!fs.existsSync(ordersDir)) return null;
    const files = fs.readdirSync(ordersDir).filter((f) => f.startsWith('order_') && f.endsWith('.json'));
    for (const file of files) {
        try {
            const raw = fs.readFileSync(path.join(ordersDir, file), 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && parsed.payment && parsed.payment.id === paymentIntentId) {
                return { file, data: parsed };
            }
        } catch (_) {
            // ignore malformed historical files
        }
    }
    return null;
}

const PAID_ORDER_INGEST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Saved order with a confirmed payment, created in the last 7 days; null otherwise. */
function findRecentPaidOrderByNumber(orderNumber) {
    const want = String(orderNumber || '').trim();
    if (!/^[A-Z]{2}-[0-9A-Z]{9}-[0-9A-Z]{6}$/.test(want)) return null;
    const ordersDir = path.join(__dirname, 'orders');
    if (!fs.existsSync(ordersDir)) return null;
    const cutoff = Date.now() - PAID_ORDER_INGEST_WINDOW_MS;
    for (const file of fs.readdirSync(ordersDir)) {
        if (!file.startsWith('order_') || !file.endsWith('.json')) continue;
        try {
            const fp = path.join(ordersDir, file);
            if (fs.statSync(fp).mtimeMs < cutoff) continue;
            const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));
            if (parsed && String(parsed.orderNumber || '').trim() === want && parsed.payment && parsed.payment.id) {
                return parsed;
            }
        } catch (_) {
            // ignore malformed historical files
        }
    }
    return null;
}

/** Normalized gifter email on a persisted order JSON (Phase 1 + legacy `customer.email`). */
function orderRecordEmailNorm(record) {
    if (!record || typeof record !== 'object') return null;
    if (typeof record.customerEmailNorm === 'string' && record.customerEmailNorm.trim()) {
        return record.customerEmailNorm.trim().toLowerCase();
    }
    const nested =
        record.customer && typeof record.customer === 'object' && record.customer.emailNorm;
    if (typeof nested === 'string' && nested.trim()) {
        return nested.trim().toLowerCase();
    }
    if (record.customer && record.customer.email != null) {
        return normalizeCustomerEmail(String(record.customer.email));
    }
    return null;
}

function internalClaimSecretMatches(headerVal) {
    const expected = (process.env.WRRAPD_INTERNAL_CLAIM_SECRET || '').trim();
    if (!expected) return false;
    const got = (headerVal || '').trim();
    if (got.length !== expected.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(got, 'utf8'), Buffer.from(expected, 'utf8'));
    } catch (_) {
        return false;
    }
}

/**
 * Phase 2 — attach WordPress user id to on-disk orders for a normalized email (idempotent).
 * @returns {{ scanned: number, matched: number, applied: number, skippedAlready: number, conflicts: object[], details: object[] }}
 */
function claimOrdersByEmailForWpUser(emailNorm, wpUserId, dryRun) {
    const widStr = String(wpUserId).trim();
    const ordersDir = path.join(__dirname, 'orders');
    const out = {
        scanned: 0,
        matched: 0,
        applied: 0,
        skippedAlready: 0,
        conflicts: [],
        details: [],
    };
    if (!fs.existsSync(ordersDir)) {
        return out;
    }
    const files = fs.readdirSync(ordersDir).filter((f) => f.startsWith('order_') && f.endsWith('.json'));
    for (const file of files) {
        out.scanned++;
        const fp = path.join(ordersDir, file);
        let raw;
        try {
            raw = fs.readFileSync(fp, 'utf8');
        } catch (_) {
            continue;
        }
        let data;
        try {
            data = JSON.parse(raw);
        } catch (_) {
            continue;
        }
        const norm = orderRecordEmailNorm(data);
        if (!norm || norm !== emailNorm) continue;
        out.matched++;
        const on = data.orderNumber != null ? String(data.orderNumber) : null;
        if (data.claimedWpUserId != null && String(data.claimedWpUserId).trim() !== '') {
            if (String(data.claimedWpUserId) === widStr) {
                out.skippedAlready++;
                out.details.push({ file, orderNumber: on, action: 'already_claimed' });
                continue;
            }
            out.conflicts.push({
                file,
                orderNumber: on,
                existingWpUserId: String(data.claimedWpUserId),
            });
            out.details.push({ file, orderNumber: on, action: 'conflict' });
            continue;
        }
        if (dryRun) {
            out.details.push({ file, orderNumber: on, action: 'would_claim' });
            continue;
        }
        const next = {
            ...data,
            claimedWpUserId: widStr,
            claimedAt: new Date().toISOString(),
        };
        fs.writeFileSync(fp, JSON.stringify(next, null, 2), 'utf8');
        out.applied++;
        out.details.push({ file, orderNumber: on, action: 'claimed' });
    }
    return out;
}

/**
 * Whether this order should appear in "my orders" for the given WP user + account email.
 * Includes rows claimed by this user, or same gifter email with no claim / own claim.
 */
function orderVisibleToWpUser(data, emailNorm, wpUserId) {
    const widRaw = data.claimedWpUserId;
    const wid = widRaw != null && String(widRaw).trim() !== '' ? String(widRaw).trim() : '';
    const norm = orderRecordEmailNorm(data);
    if (wid === wpUserId) return true;
    if (emailNorm && norm === emailNorm) {
        if (!wid || wid === wpUserId) return true;
    }
    return false;
}

/** One row per Wrrapd gift line (same normalization as payment ingest) for WP “rich” table. */
/** Canonical occasion labels — must stay in sync with wrrapd_occasion_canonical() in the WP plugin. */
const CANONICAL_OCCASIONS = new Set([
    'Birthday', 'Christmas', 'Anniversary', "Father's Day", "Mother's Day",
    "Valentine's Day", 'Graduation', 'Thank you', 'Thanksgiving', 'Easter',
    'Hanukkah', 'Wedding', 'Retirement', 'July Fourth', 'Corporate Gift',
    "St. Patrick's Day", 'Diwali', 'Ramadan / Eid', 'Chinese New Year',
    'Housewarming', 'New baby', 'Sympathy', 'Get well', 'Congratulations',
    'Just because', 'Other',
]);

/**
 * Return the occasion only if it exactly matches a canonical label (case-insensitive).
 * Freetext AI prompts or custom strings are discarded (returned as null) so they
 * never surface in the Occasion dropdown on the website.
 */
function sanitizeOccasion(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    for (const canonical of CANONICAL_OCCASIONS) {
        if (canonical.toLowerCase() === s.toLowerCase()) return canonical;
    }
    return null; // freetext / AI prompt — discard
}

function summarizeWrrapdLinesFromOrderRecord(data) {
    const flat = normalizeOrderItems(data && data.orderItems);
    return flat.map((row) => {
        const fa = row.finalShippingAddress || row.shippingAddress || row.gifteeRecipientAddress;
        let gifteeName = null;
        if (fa && typeof fa === 'object' && fa.name != null) {
            const n = String(fa.name).trim();
            gifteeName = n || null;
        }
        let designSummary = null;
        if (row.selected_ai_design) {
            const s = String(row.selected_ai_design).trim();
            designSummary = s ? `AI design: ${s.slice(0, 120)}${s.length > 120 ? '…' : ''}` : 'AI design';
        } else if (row.uploaded_design_name) {
            designSummary = `Upload: ${String(row.uploaded_design_name).trim()}`;
        } else if (row.checkbox_flowers) {
            designSummary = row.selected_flower_design && /^Bouquet\s*#\s*\d+$/i.test(String(row.selected_flower_design).trim())
                ? `Flowers: ${String(row.selected_flower_design).trim()}`
                : 'Flowers add-on';
        } else if (row.selected_wrapping_option) {
            designSummary = String(row.selected_wrapping_option).trim();
        }
        const gm = row.giftMessage != null ? String(row.giftMessage).trim() : '';
        let designPreviewUrl = null;
        if (row.selected_ai_design && typeof row.selected_ai_design === 'object') {
            const im = row.selected_ai_design.imageUrl;
            if (typeof im === 'string' && (im.startsWith('http://') || im.startsWith('https://'))) {
                designPreviewUrl = im;
            }
            if (!designPreviewUrl) {
                const gcs = row.selected_ai_design.gcsUrl;
                if (typeof gcs === 'string' && (gcs.startsWith('http://') || gcs.startsWith('https://'))) {
                    designPreviewUrl = gcs;
                }
            }
        }
        let designLabel = null;
        if (row.selected_ai_design && typeof row.selected_ai_design === 'object') {
            const t = row.selected_ai_design.title;
            designLabel =
                typeof t === 'string' && t.trim()
                    ? `AI: ${t.trim().slice(0, 80)}`
                    : 'AI-generated wrap';
        } else if (row.uploaded_design_name) {
            designLabel = `Upload: ${String(row.uploaded_design_name).trim()}`;
        } else if (row.checkbox_flowers) {
            designLabel = row.selected_flower_design && /^Bouquet\s*#\s*\d+$/i.test(String(row.selected_flower_design).trim())
                ? `Flowers: ${String(row.selected_flower_design).trim()}`
                : 'Flowers add-on';
        } else if (row.selected_wrapping_option) {
            designLabel = `Wrrapd: ${String(row.selected_wrapping_option).trim()}`;
        }
        const deliveryHint =
            row.amazonDeliveryDate ||
            row.deliveryDate ||
            row.estimatedDeliveryDate ||
            row.arrivalDate ||
            row.shippingDate ||
            null;
        return {
            productId: row.asin ? String(row.asin).trim().slice(0, 48) : null,
            asin: row.asin || null,
            productTitle: row.title ? String(row.title).trim().slice(0, 200) : null,
            productImageUrl:
                row.imageUrl && (String(row.imageUrl).startsWith('http://') || String(row.imageUrl).startsWith('https://'))
                    ? String(row.imageUrl).trim()
                    : null,
            occasion: sanitizeOccasion(row.occasion),
            designSummary,
            designLabel,
            designPreviewUrl,
            flowers: row.checkbox_flowers === true,
            // Customer/tracking summary: anonymous Bouquet #N only — never retailer SKU titles.
            flowerOption: (() => {
                const label =
                    row.selected_flower_design != null && String(row.selected_flower_design).trim() !== ''
                        ? String(row.selected_flower_design).trim()
                        : row.flower_title
                          ? String(row.flower_title).trim()
                          : '';
                if (/^Bouquet\s*#\s*\d+$/i.test(label)) return label.slice(0, 32);
                if (row.checkbox_flowers) return 'Flowers';
                return null;
            })(),
            deliveryHint: deliveryHint != null ? String(deliveryHint).trim().slice(0, 200) : null,
            gifteeName,
            giftMessageSnippet: gm ? gm.slice(0, 160) + (gm.length > 160 ? '…' : '') : null,
            giftMessage: gm.length > 6000 ? `${gm.slice(0, 6000)}…` : gm,
        };
    });
}

function summarizeOrderForWpList(data) {
    const items = data.orderItems;
    let lineItemCount = 0;
    if (Array.isArray(items)) lineItemCount = items.length;
    else if (items && typeof items === 'object') lineItemCount = Object.keys(items).length;
    const pay = data.payment && typeof data.payment === 'object' ? data.payment : null;
    const lines = summarizeWrrapdLinesFromOrderRecord(data);
    const persistedCi = sanitizeCheckoutInvoiceForStorage(data.checkoutInvoice);
    const persistedComplete =
        persistedCi && persistedCi.complete && persistedCi.complete.aggregateLines
            ? persistedCi.complete
            : null;
    /** Payment summary uses checkoutInvoice only; do not send design narrative as invoice rows. */
    const invoiceLines = [];
    const retailerRaw = data.retailer || data.name_of_retailer || data.Retailer || data.merchant || data.store || '';
    return {
        orderNumber: data.orderNumber != null ? String(data.orderNumber) : null,
        timestamp: data.timestamp || null,
        retailer: typeof retailerRaw === 'string' ? retailerRaw.trim() : '',
        payment: pay
            ? {
                  amount: pay.amount,
                  status: pay.status,
                  id: pay.id,
              }
            : null,
        customerEmailNorm: orderRecordEmailNorm(data),
        wrrapdCustomerId: data.wrrapdCustomerId || null,
        claimedWpUserId: data.claimedWpUserId != null ? String(data.claimedWpUserId) : null,
        claimedAt: data.claimedAt || null,
        lineItemCount,
        wrrapdLineCount: lines.length,
        lines,
        invoiceLines,
        checkoutInvoice:
            persistedCi &&
            ((persistedCi.lines && persistedCi.lines.length) || (persistedComplete && persistedComplete.aggregateLines))
                ? persistedCi
                : null,
        checkoutInvoiceComplete: persistedComplete,
    };
}

/**
 * @returns {{ orders: object[], scanned: number }}
 */
function listOrdersJsonForWpUser(emailNorm, wpUserId) {
    const widStr = String(wpUserId).trim();
    const out = { orders: [], scanned: 0 };
    const ordersDir = path.join(__dirname, 'orders');
    if (!fs.existsSync(ordersDir)) return out;
    // Only top-level files — the deleted/ subfolder is intentionally excluded.
    const files = fs.readdirSync(ordersDir).filter((f) => f.startsWith('order_') && f.endsWith('.json'));
    for (const file of files) {
        out.scanned++;
        const fp = path.join(ordersDir, file);
        let data;
        try {
            data = JSON.parse(fs.readFileSync(fp, 'utf8'));
        } catch (_) {
            continue;
        }
        // Skip soft-deleted orders.
        if (data.deleted === true) continue;
        if (!orderVisibleToWpUser(data, emailNorm, widStr)) continue;
        out.orders.push(summarizeOrderForWpList(data));
    }
    out.orders.sort((a, b) => {
        const ta = parseDateCandidate(a.timestamp)?.getTime() || 0;
        const tb = parseDateCandidate(b.timestamp)?.getTime() || 0;
        return tb - ta;
    });
    return out;
}

function parseDateCandidate(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const t = raw.trim();
    if (!t) return null;
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) return d;
    return null;
}

const WRRAPD_INGEST_VERSION = 'ingest-v2026-04-22-wrrapd-shipment-checked-radio-only';

/**
 * Amazon "arriving …" strings are shopper-local (Eastern). Never use UTC midnight YYYY-MM-DD
 * from toISOString() — it shifts the calendar day backward vs NY.
 */
function amazonCalendarYmdFromDeliveryField(raw) {
    if (raw == null) return null;
    const t = typeof raw === 'string' ? raw.trim() : '';
    if (!t) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const emb = t.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (emb) return emb[1];
    const d = parseDateCandidate(t);
    if (!d || Number.isNaN(d.getTime())) return null;
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(d);
        const y = parts.find((p) => p.type === 'year')?.value;
        const m = parts.find((p) => p.type === 'month')?.value;
        const day = parts.find((p) => p.type === 'day')?.value;
        if (!y || !m || !day) return null;
        return `${y}-${m}-${day}`;
    } catch (_) {
        return null;
    }
}

function computeScheduledForPlusOne(orderItem) {
    const cands = [
        orderItem && orderItem.amazonDeliveryDate,
        orderItem && orderItem.deliveryDate,
        orderItem && orderItem.estimatedDeliveryDate,
        orderItem && orderItem.arrivalDate,
        orderItem && orderItem.shippingDate,
    ];
    let base = null;
    for (const c of cands) {
        const d = parseDateCandidate(c);
        if (d) {
            base = d;
            break;
        }
    }
    if (!base) {
        // Fallback when Amazon date wasn't captured in payload yet
        base = new Date();
    }
    const plusOne = new Date(base.getTime());
    plusOne.setDate(plusOne.getDate() + 1);
    return plusOne.toISOString();
}

function inferAmazonDateKeyFromItems(items) {
    for (const item of items || []) {
        const key = amazonDateKeyFromItem(item);
        if (key) return key;
    }
    const todayNy = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
    return todayNy;
}

function computeScheduledForPlusOneFromItems(items) {
    const dates = [];
    for (const item of items || []) {
        const cands = [
            item && item.amazonDeliveryDate,
            item && item.deliveryDate,
            item && item.estimatedDeliveryDate,
            item && item.arrivalDate,
            item && item.shippingDate,
        ];
        for (const c of cands) {
            const d = parseDateCandidate(c);
            if (d) {
                dates.push(d);
                break;
            }
        }
    }
    if (!dates.length) {
        return computeScheduledForPlusOne((items && items[0]) || null);
    }
    dates.sort((a, b) => a.getTime() - b.getTime());
    // Wrrapd +1 after the **latest** Amazon promise when multiple lines differ (matches extension "latest" grouping).
    const base = dates[dates.length - 1];
    const plusOne = new Date(base.getTime());
    plusOne.setDate(plusOne.getDate() + 1);
    return plusOne.toISOString();
}

function amazonDateKeyFromItem(orderItem) {
    if (!orderItem) return null;
    const cands = [
        orderItem.amazonDeliveryDate,
        orderItem.deliveryDate,
        orderItem.estimatedDeliveryDate,
        orderItem.arrivalDate,
        orderItem.shippingDate,
    ];
    for (const c of cands) {
        const key = amazonCalendarYmdFromDeliveryField(typeof c === 'string' ? c : '');
        if (key) return key;
    }
    return null;
}

function splitStreet(rawStreet) {
    if (!rawStreet || typeof rawStreet !== 'string') return { line1: '', line2: '' };
    const parts = rawStreet.split(',').map((x) => x.trim()).filter(Boolean);
    return {
        line1: parts[0] || rawStreet.trim(),
        line2: parts.slice(1).join(', '),
    };
}

function isLikelyWrrapdWarehouseAddressObj(addr) {
    if (!addr || typeof addr !== 'object') return false;
    const blob = `${addr.name || ''} ${addr.street || ''} ${addr.line1 || ''}`.toLowerCase();
    return (
        deliveryHubs.isHubAddress(addr) ||
        blob.includes('wrrapd') ||
        blob.includes('26067') ||
        blob.includes('150 busch') ||
        (blob.includes('32226') && blob.includes('jacksonville'))
    );
}

/** Normalize to { name, street, city, state, postalCode, country } for ingest + emails. */
function normalizeAddressShape(addr) {
    if (!addr || typeof addr !== 'object') return {};
    const street = String(addr.street || addr.line1 || '').trim();
    const firstName =
        addr.firstName != null ? String(addr.firstName).trim() : '';
    const lastName = addr.lastName != null ? String(addr.lastName).trim() : '';
    const name =
        (addr.name != null ? String(addr.name).trim() : '') ||
        [firstName, lastName].filter(Boolean).join(' ');
    return {
        name,
        firstName,
        lastName,
        street,
        line1: addr.line1 != null ? String(addr.line1).trim() : street,
        line2: addr.line2 != null ? String(addr.line2).trim() : '',
        city: String(addr.city || '').trim(),
        state: String(addr.state || '').trim(),
        postalCode: String(addr.postalCode || addr.postal_code || '').trim(),
        country: addr.country != null ? String(addr.country).trim() : '',
    };
}

/** Same shape as checkout `finalShippingAddressForServer` / process-payment body. */
function coerceFinalShippingFromPaymentPayload(f) {
    if (!f || typeof f !== 'object') return null;
    const street = typeof f.street === 'string' ? f.street.trim() : '';
    const postal =
        (typeof f.postalCode === 'string' && f.postalCode.trim()) ||
        (typeof f.postal_code === 'string' && f.postal_code.trim()) ||
        '';
    const streetOrLine1 =
        street || (typeof f.line1 === 'string' ? f.line1.trim() : '');
    if (!streetOrLine1 && !postal) return null;
    const firstName = typeof f.firstName === 'string' ? f.firstName.trim() : '';
    const lastName = typeof f.lastName === 'string' ? f.lastName.trim() : '';
    const name =
        (typeof f.name === 'string' ? f.name.trim() : '') ||
        [firstName, lastName].filter(Boolean).join(' ');
    return {
        name,
        firstName,
        lastName,
        street: streetOrLine1,
        city: typeof f.city === 'string' ? f.city : '',
        state: typeof f.state === 'string' ? f.state : '',
        postalCode: postal,
        country: typeof f.country === 'string' && f.country.trim() ? f.country.trim() : 'US',
    };
}

function pendingFinalShippingFilePath(orderNumber) {
    const safe = String(orderNumber || '').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const ordersDir = path.join(__dirname, 'orders');
    return path.join(ordersDir, `.pending-final-shipping-${safe}.json`);
}

function persistPendingFinalShippingToDisk(orderNumber, finalShippingAddress) {
    try {
        const ordersDir = path.join(__dirname, 'orders');
        if (!fs.existsSync(ordersDir)) {
            fs.mkdirSync(ordersDir, { recursive: true });
        }
        const p = pendingFinalShippingFilePath(orderNumber);
        fs.writeFileSync(
            p,
            JSON.stringify({ storedAt: Date.now(), finalShippingAddress }),
            'utf8',
        );
    } catch (e) {
        console.error('[API] persistPendingFinalShippingToDisk:', e && e.message ? e.message : e);
    }
}

function unlinkPendingFinalShippingFile(orderNumber) {
    try {
        const p = pendingFinalShippingFilePath(orderNumber);
        if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (_) {
        /* ignore */
    }
}

function readAndConsumePendingFinalShippingFromDisk(orderNumber) {
    try {
        const p = pendingFinalShippingFilePath(orderNumber);
        if (!fs.existsSync(p)) return null;
        const raw = fs.readFileSync(p, 'utf8');
        fs.unlinkSync(p);
        const j = JSON.parse(raw);
        if (!j || typeof j !== 'object' || !j.finalShippingAddress) return null;
        return j.finalShippingAddress;
    } catch (e) {
        console.error('[process-payment] read pending final shipping file:', e && e.message ? e.message : e);
        return null;
    }
}

/**
 * Giftee row for tracking ingest, thank-you path, and legacy pay emails.
 *
 * **Checkout wins:** `finalShippingAddressFromCheckout` comes from (in order) the checkout postMessage
 * on `process-payment`, the store-final in-memory map, or a disk pending file from store-final (PM2-safe).
 * Only if that is missing or unusable do we fall back to extension/Amazon snapshots.
 */
function pickTrackingRecipientAddressForIngest({ wrappedOnly, finalShippingAddressFromCheckout, gifteeOriginalAddress }) {
    const tryAddr = (a) => {
        const n = normalizeAddressShape(a);
        if (!n.street && !n.line1) return null;
        if (isLikelyWrrapdWarehouseAddressObj(n)) return null;
        return n;
    };
    let u;
    u = tryAddr(finalShippingAddressFromCheckout);
    if (u) return u;
    u = tryAddr(gifteeOriginalAddress);
    if (u) return u;
    for (const it of wrappedOnly || []) {
        u = tryAddr(it && it.gifteeRecipientAddress);
        if (u) return u;
    }
    for (const it of wrappedOnly || []) {
        u = tryAddr(it && it.shippingAddress);
        if (u) return u;
    }
    const first = (wrappedOnly && wrappedOnly[0]) || {};
    u = tryAddr(first.finalShippingAddress) || tryAddr(first.shippingAddress);
    if (u) return u;
    return normalizeAddressShape(finalShippingAddressFromCheckout || first.finalShippingAddress || first.shippingAddress || {});
}

/** Align extension line suffix (`…-01`) with base Amazon ref for tracking ingest dedupe. */
function canonicalTrackingExternalOrderId(raw) {
    if (!raw || typeof raw !== 'string') return raw;
    const s = raw.trim();
    const parts = s.split('-');
    if (parts.length >= 4 && /^\d{1,4}$/.test(parts[parts.length - 1])) {
        return parts.slice(0, -1).join('-');
    }
    return s;
}

async function ingestOrderIntoTracking(orderPayload) {
    const ingestKey = process.env.INGEST_API_KEY;
    const ingestUrl = process.env.TRACKING_INGEST_URL || 'http://127.0.0.1:3000/api/orders/ingest';
    if (!ingestKey) {
        return { ok: false, skipped: true, reason: 'INGEST_API_KEY missing' };
    }

    const payload =
        orderPayload && typeof orderPayload.externalOrderId === 'string'
            ? {
                  ...orderPayload,
                  externalOrderId: canonicalTrackingExternalOrderId(orderPayload.externalOrderId),
              }
            : orderPayload;

    try {
        const resp = await fetch(ingestUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ingestKey}`,
            },
            body: JSON.stringify(payload),
        });
        const text = await resp.text();
        if (!resp.ok) {
            return { ok: false, skipped: false, reason: `ingest ${resp.status}: ${text.substring(0, 1200)}` };
        }
        let notify;
        try {
            const j = JSON.parse(text);
            if (j && typeof j === 'object' && j.notify) notify = j.notify;
        } catch (_) { /* ignore */ }
        return { ok: true, skipped: false, notify };
    } catch (e) {
        return { ok: false, skipped: false, reason: e && e.message ? e.message : String(e) };
    }
}

/**
 * WrapStars ops bridge — Cloud Run Applications → this VM → SiteGround apply.wrrapd.com.
 *
 * SiteGround often blocks Cloud Run egress; the VM IP can reach WordPress. Set tracking
 * WRRAPD_WRAPSTARS_WP_BASE_URL=https://api.wrrapd.com/api/wrapstars-wp-bridge
 *
 * Forwards /api/wrapstars-wp-bridge/wp-json/wrrapd/v1/... to
 * https://apply.wrrapd.com/wp-json/wrrapd/v1/... (preserves ops API key header).
 */
app.use('/api/wrapstars-wp-bridge', async (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const origin = (process.env.WRRAPD_WRAPSTARS_WP_ORIGIN || 'https://apply.wrrapd.com').replace(/\/$/, '');
    const targetUrl = origin + (req.url || '/');
    if (!targetUrl.startsWith(origin + '/wp-json/wrrapd/v1/')) {
        return res.status(400).json({ error: 'Only wrrapd/v1 WrapStars ops routes may be bridged.' });
    }

    const headers = { Accept: 'application/json' };
    const opsKey = req.get('x-wrrapd-wrapstars-ops-key');
    if (opsKey) headers['X-Wrrapd-Wrapstars-Ops-Key'] = opsKey;
    const auth = req.get('authorization');
    if (auth) headers.Authorization = auth;

    const init = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(req.body && typeof req.body === 'object' ? req.body : {});
    }

    try {
        const upstream = await fetch(targetUrl, init);
        const text = await upstream.text();
        const ct = upstream.headers.get('content-type') || 'application/json';
        res.status(upstream.status).set('Content-Type', ct).send(text);
    } catch (err) {
        console.error('[wrapstars-wp-bridge]', err?.message || err);
        res.status(502).json({
            error: 'WrapStars WordPress bridge failed',
            detail: err?.message || String(err),
        });
    }
});

/**
 * Chrome extension (Amazon checkout): forwards order payloads to tracking ingest using server-side INGEST_API_KEY.
 * No secret in the browser — same env as process-payment.
 */
app.post('/api/proxy-tracking-ingest', async (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const orders = req.body && req.body.orders;
    if (!Array.isArray(orders) || orders.length === 0 || orders.length > 40) {
        return res.status(400).json({ error: 'Expected JSON body: { orders: [ {...}, ... ] }' });
    }
    // The extension cannot hold a secret, so each line must belong to a paid order this server
    // already saved; contact details always come from that saved order, never from the request.
    const trusted = internalClaimSecretMatches(String(req.get('x-wrrapd-internal-key') || ''));
    const paidByNumber = new Map();
    if (!trusted) {
        for (const o of orders) {
            const num = canonicalTrackingExternalOrderId(String((o && o.externalOrderId) || ''));
            if (!paidByNumber.has(num)) paidByNumber.set(num, findRecentPaidOrderByNumber(num));
            if (!paidByNumber.get(num)) {
                return res.status(403).json({ error: 'Order not found or not paid' });
            }
        }
    }
    const results = [];
    for (let i = 0; i < orders.length; i++) {
        const paid = trusted
            ? null
            : paidByNumber.get(canonicalTrackingExternalOrderId(String(orders[i].externalOrderId || '')));
        const payload = {
            ...orders[i],
            ...(paid
                ? {
                      customerEmail: paid.customer && paid.customer.email,
                      customerPhone: paid.customer && paid.customer.phone,
                  }
                : {}),
            // Staging button should never customer-spam; production customer email comes from process-payment ingest.
            skipCustomerNotifications: true,
        };
        const r = await ingestOrderIntoTracking(payload);
        results.push({ index: i, ok: r.ok, skipped: r.skipped, reason: r.reason, notify: r.notify });
    }
    const allOk = results.every((row) => row.ok);
    res.status(200).json({ ok: allOk, results });
});

/**
 * Phase 2 — WordPress (or other trusted backend) calls this with a shared secret to stamp
 * `claimedWpUserId` + `claimedAt` on all `orders/order_*.json` rows matching the gifter email.
 * Host: **api.wrrapd.com** only. Header: **X-Wrrapd-Internal-Key** (must match **WRRAPD_INTERNAL_CLAIM_SECRET**).
 * Body JSON: `{ "emailNorm"?: string, "email"?: string, "wpUserId": string|number, "dryRun"?: boolean }`
 */
app.post('/api/internal/claim-orders-by-email', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const configured = (process.env.WRRAPD_INTERNAL_CLAIM_SECRET || '').trim();
    if (!configured) {
        return res.status(503).json({
            error: 'Not configured',
            hint: 'Set WRRAPD_INTERNAL_CLAIM_SECRET on wrrapd-server, then restart PM2.',
        });
    }
    const hk = req.headers['x-wrrapd-internal-key'];
    const headerKey = typeof hk === 'string' ? hk : (Array.isArray(hk) ? hk[0] : '');
    if (!internalClaimSecretMatches(headerKey)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const dryRun = body.dryRun === true || body.dryRun === 'true';
    let emailNorm = typeof body.emailNorm === 'string' ? normalizeCustomerEmail(body.emailNorm) : null;
    if (!emailNorm && body.email != null) {
        emailNorm = normalizeCustomerEmail(String(body.email));
    }
    if (!emailNorm) {
        return res.status(400).json({ error: 'Provide email or emailNorm' });
    }
    if (body.wpUserId == null || String(body.wpUserId).trim() === '') {
        return res.status(400).json({ error: 'wpUserId required' });
    }
    const wpUserId = String(body.wpUserId).trim();
    const result = claimOrdersByEmailForWpUser(emailNorm, wpUserId, dryRun);
    res.status(200).json({
        ok: true,
        emailNorm,
        wpUserId,
        dryRun,
        ...result,
    });
});

/**
 * Phase 3 — WordPress (trusted server) lists pay-server orders for the logged-in shopper.
 * Same host + header as claim. Body: `{ "wpUserId", "email" | "emailNorm" }` — both required
 * so callers cannot list by wpUserId alone without knowing the account email.
 */
app.post('/api/internal/orders-for-wp-user', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const configured = (process.env.WRRAPD_INTERNAL_CLAIM_SECRET || '').trim();
    if (!configured) {
        return res.status(503).json({
            error: 'Not configured',
            hint: 'Set WRRAPD_INTERNAL_CLAIM_SECRET on wrrapd-server, then restart PM2.',
        });
    }
    const hk = req.headers['x-wrrapd-internal-key'];
    const headerKey = typeof hk === 'string' ? hk : (Array.isArray(hk) ? hk[0] : '');
    if (!internalClaimSecretMatches(headerKey)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    let emailNorm = typeof body.emailNorm === 'string' ? normalizeCustomerEmail(body.emailNorm) : null;
    if (!emailNorm && body.email != null) {
        emailNorm = normalizeCustomerEmail(String(body.email));
    }
    if (!emailNorm) {
        return res.status(400).json({ error: 'Provide email or emailNorm' });
    }
    if (body.wpUserId == null || String(body.wpUserId).trim() === '') {
        return res.status(400).json({ error: 'wpUserId required' });
    }
    const wpUserId = String(body.wpUserId).trim();
    const { orders, scanned } = listOrdersJsonForWpUser(emailNorm, wpUserId);
    res.status(200).json({ ok: true, emailNorm, wpUserId, scanned, count: orders.length, orders });
});

/**
 * Mark one or more pay-server order JSON files as deleted.
 * Moves each file to orders/deleted/<filename> and stamps "deleted":true inside.
 * Same auth as other internal endpoints: api.wrrapd.com + X-Wrrapd-Internal-Key.
 * Body: { "orderNumbers": ["100-1a59021-...", ...] }
 */
app.post('/api/internal/delete-orders', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const configured = (process.env.WRRAPD_INTERNAL_CLAIM_SECRET || '').trim();
    if (!configured) {
        return res.status(503).json({ error: 'Not configured', hint: 'Set WRRAPD_INTERNAL_CLAIM_SECRET.' });
    }
    const hk = req.headers['x-wrrapd-internal-key'];
    const headerKey = typeof hk === 'string' ? hk : (Array.isArray(hk) ? hk[0] : '');
    if (!internalClaimSecretMatches(headerKey)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const nums = Array.isArray(body.orderNumbers) ? body.orderNumbers.map(String) : [];
    if (!nums.length) {
        return res.status(400).json({ error: 'orderNumbers array required' });
    }
    const ordersDir = path.join(__dirname, 'orders');
    const deletedDir = path.join(ordersDir, 'deleted');
    if (!fs.existsSync(deletedDir)) fs.mkdirSync(deletedDir, { recursive: true });
    const results = [];
    const files = fs.existsSync(ordersDir)
        ? fs.readdirSync(ordersDir).filter((f) => f.startsWith('order_') && f.endsWith('.json'))
        : [];
    for (const orderNumber of nums) {
        let matched = false;
        for (const file of files) {
            const fp = path.join(ordersDir, file);
            let data;
            try { data = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) { continue; }
            const num = data.orderNumber != null ? String(data.orderNumber).trim() : '';
            if (num !== orderNumber.trim()) continue;
            data.deleted = true;
            data.deletedAt = new Date().toISOString();
            const dest = path.join(deletedDir, file);
            try {
                fs.writeFileSync(dest, JSON.stringify(data, null, 2));
                fs.unlinkSync(fp);
                results.push({ orderNumber, status: 'deleted', file });
            } catch (err) {
                results.push({ orderNumber, status: 'error', error: String(err) });
            }
            matched = true;
            break;
        }
        if (!matched) results.push({ orderNumber, status: 'not_found' });
    }
    return res.status(200).json({ ok: true, results });
});

function findOrderFileByNumber(orderNumber) {
    const want = String(orderNumber || '').trim();
    const ordersDir = path.join(__dirname, 'orders');
    if (!want || !fs.existsSync(ordersDir)) return null;
    for (const file of fs.readdirSync(ordersDir)) {
        if (!file.startsWith('order_') || !file.endsWith('.json')) continue;
        const fp = path.join(ordersDir, file);
        try {
            const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
            if (data && String(data.orderNumber || '').trim() === want) return { fp, data };
        } catch (_) {
            // ignore malformed historical files
        }
    }
    return null;
}

/** Append a refund to the order JSON (idempotent on refund id). Returns the updated order or null. */
function recordRefundOnOrder(orderNumber, refund) {
    const hit = findOrderFileByNumber(orderNumber);
    if (!hit) return null;
    const refunds = Array.isArray(hit.data.refunds) ? hit.data.refunds : [];
    if (!refunds.some((r) => r && r.id === refund.id)) {
        refunds.push({ ...refund, at: refund.at || new Date().toISOString() });
    }
    hit.data.refunds = refunds;
    hit.data.refundedCents = refunds.reduce((s, r) => s + (Number(r.amountCents) || 0), 0);
    const tmp = `${hit.fp}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(hit.data, null, 2));
    fs.renameSync(tmp, hit.fp);
    return hit.data;
}

/** Records the Command Center hand-off on the order JSON so failed sends can be retried and audited. */
function setOrderIngestState(orderNumber, patch) {
    const hit = findOrderFileByNumber(orderNumber);
    if (!hit) return null;
    const prev = hit.data.trackingIngest && typeof hit.data.trackingIngest === 'object' ? hit.data.trackingIngest : {};
    hit.data.trackingIngest = { ...prev, ...patch, at: new Date().toISOString() };
    const tmp = `${hit.fp}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(hit.data, null, 2));
    fs.renameSync(tmp, hit.fp);
    return hit.data;
}

/** Re-sends a saved order to Command Center. Customer emails already went out from the pay server, so skip them. */
async function resendOrderToTracking(orderNumber) {
    const hit = findOrderFileByNumber(orderNumber);
    const ti = hit && hit.data.trackingIngest;
    if (!ti || !ti.payload) return { ok: false, reason: 'No saved order details to resend' };
    const r = await ingestOrderIntoTracking({ ...ti.payload, skipCustomerNotifications: true });
    setOrderIngestState(orderNumber, {
        ok: !!r.ok,
        attempts: (Number(ti.attempts) || 1) + 1,
        reason: r.ok ? '' : String(r.reason || 'unknown').slice(0, 300),
    });
    return r;
}

const INGEST_RETRY_MAX_ATTEMPTS = 288;
let ingestRetryRunning = false;
async function retryFailedTrackingIngests() {
    if (ingestRetryRunning) return;
    ingestRetryRunning = true;
    try {
        const ordersDir = path.join(__dirname, 'orders');
        if (!fs.existsSync(ordersDir)) return;
        for (const file of fs.readdirSync(ordersDir)) {
            if (!file.startsWith('order_') || !file.endsWith('.json')) continue;
            let data;
            try {
                data = JSON.parse(fs.readFileSync(path.join(ordersDir, file), 'utf8'));
            } catch (_) {
                continue;
            }
            const ti = data && data.trackingIngest;
            if (!ti || ti.ok !== false || !ti.payload || (Number(ti.attempts) || 0) >= INGEST_RETRY_MAX_ATTEMPTS) continue;
            const r = await resendOrderToTracking(data.orderNumber);
            console.log(`[ingest-retry] ${data.orderNumber} ${r.ok ? 'delivered to Command Center' : `still failing: ${r.reason}`}`);
        }
    } finally {
        ingestRetryRunning = false;
    }
}
setInterval(() => {
    retryFailedTrackingIngests().catch((e) => console.error('[ingest-retry]', e));
}, 5 * 60 * 1000).unref();

/** Command Center reconciliation: every paid order on this server in the last `days` days. */
app.get('/api/internal/paid-orders', (req, res) => {
    if (!req.isApiDomain || !internalClaimSecretMatches(String(req.get('x-wrrapd-internal-key') || ''))) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const cutoff = Date.now() - days * 86400000;
    const ordersDir = path.join(__dirname, 'orders');
    const orders = [];
    if (fs.existsSync(ordersDir)) {
        for (const file of fs.readdirSync(ordersDir)) {
            if (!file.startsWith('order_') || !file.endsWith('.json')) continue;
            try {
                const d = JSON.parse(fs.readFileSync(path.join(ordersDir, file), 'utf8'));
                const ts = Date.parse(d.timestamp || '');
                if (!d.orderNumber || !d.payment || !d.payment.id || !(ts >= cutoff) || d.reconcileHandled) continue;
                orders.push({
                    orderNumber: d.orderNumber,
                    timestamp: d.timestamp,
                    amountCents: Math.round(Number(d.payment.amount) || 0),
                    refundedCents: Math.round(Number(d.refundedCents) || 0),
                    retailer: d.retailer || '',
                    customerEmail: (d.customer && d.customer.email) || '',
                    ingestOk: d.trackingIngest ? d.trackingIngest.ok !== false : null,
                    canResend: !!(d.trackingIngest && d.trackingIngest.payload),
                    itemCount: Array.isArray(d.orderItems) ? d.orderItems.length : 0,
                    alertedAt: d.reconcileAlertedAt || null,
                });
            } catch (_) {
                // ignore malformed historical files
            }
        }
    }
    orders.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    res.json({ orders });
});

app.post('/api/internal/resend-order', async (req, res) => {
    if (!req.isApiDomain || !internalClaimSecretMatches(String(req.get('x-wrrapd-internal-key') || ''))) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const orderNumber = String((req.body && req.body.orderNumber) || '').trim();
    if (!orderNumber) return res.status(400).json({ error: 'orderNumber required' });
    const r = await resendOrderToTracking(orderNumber);
    if (!r.ok) return res.status(502).json({ error: r.reason || 'Resend failed' });
    res.json({ ok: true });
});

function w9SubmitKeyMatches(req) {
    const got = String(
        req.get('x-wrrapd-ops-key') || req.get('x-wrrapd-wrapstars-ops-key') || '',
    ).trim();
    const candidates = [
        process.env.W9_SUBMIT_KEY,
        process.env.WRRAPD_WRAPSTARS_OPS_API_KEY,
        process.env.WRRAPD_ADMIN_API_KEY,
    ]
        .map((s) => String(s || '').trim())
        .filter(Boolean);
    return candidates.some((expected) => {
        if (!got || got.length !== expected.length) return false;
        return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
    });
}

/** WordPress onboarding (server-side) → electronic W-9. Body: { suite, applicationId, email, ip, userAgent, fields }. */
app.post('/api/w9/submit', express.json({ limit: '64kb' }), async (req, res) => {
    if (!req.isApiDomain || !w9SubmitKeyMatches(req)) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const b = req.body || {};
        const r = await w9.submit({
            suite: String(b.suite || ''),
            applicationId: String(b.applicationId || ''),
            email: String(b.email || ''),
            ip: String(b.ip || ''),
            userAgent: String(b.userAgent || ''),
            fields: b.fields,
        });
        if (!r.ok) return res.status(400).json({ error: r.error });
        const { ip, userAgent, ...safe } = r.w9;
        res.json({ ok: true, w9: safe });
    } catch (e) {
        console.error('[w9] submit failed', e && e.message);
        res.status(500).json({ error: 'The W-9 could not be saved. Please try again.' });
    }
});

/** Signed W-9 PDF: WordPress (the signer's own copy, ops key) or Command Center (internal key). */
app.get('/api/w9/:id/pdf', (req, res) => {
    const internal = internalClaimSecretMatches(String(req.get('x-wrrapd-internal-key') || ''));
    if (!req.isApiDomain || !(internal || w9SubmitKeyMatches(req))) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const hit = w9.readPdf(req.params.id);
        if (!hit) return res.status(404).json({ error: 'Not found' });
        const owner = String(req.query.email || '').trim().toLowerCase();
        if (!internal && owner !== hit.row.email) return res.status(404).json({ error: 'Not found' });
        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', `inline; filename="W-9-${hit.row.name.replace(/[^A-Za-z0-9]+/g, '-')}.pdf"`);
        res.set('Cache-Control', 'no-store');
        res.send(hit.pdf);
    } catch (e) {
        console.error('[w9] read failed', req.params.id, e && e.message);
        res.status(500).json({ error: 'The W-9 could not be opened.' });
    }
});

/** Command Center: W-9s on file (no TIN beyond the last four). Query: email (optional). */
app.get('/api/internal/w9', (req, res) => {
    if (!req.isApiDomain || !internalClaimSecretMatches(String(req.get('x-wrrapd-internal-key') || ''))) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const rows = w9.list({ email: String(req.query.email || '') }).map(({ userAgent, ...r }) => r);
    res.json({ w9s: rows });
});

/**
 * Body: { orderNumbers: string[], action: 'alerted' | 'handled', note?, by? }.
 * 'alerted' records that ops was emailed; 'handled' (note required) removes the order from reconciliation.
 */
app.post('/api/internal/reconcile-mark', (req, res) => {
    if (!req.isApiDomain || !internalClaimSecretMatches(String(req.get('x-wrrapd-internal-key') || ''))) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const body = req.body || {};
    const action = String(body.action || '');
    const note = String(body.note || '').trim().slice(0, 500);
    const by = String(body.by || '').trim().slice(0, 80);
    const numbers = (Array.isArray(body.orderNumbers) ? body.orderNumbers : [])
        .map((n) => String(n || '').trim())
        .filter(Boolean)
        .slice(0, 100);
    if (!numbers.length || !['alerted', 'handled'].includes(action)) {
        return res.status(400).json({ error: 'orderNumbers and action required' });
    }
    if (action === 'handled' && !note) return res.status(400).json({ error: 'A note is required' });
    const updated = [];
    for (const n of numbers) {
        const hit = findOrderFileByNumber(n);
        if (!hit) continue;
        const at = new Date().toISOString();
        if (action === 'alerted') hit.data.reconcileAlertedAt = at;
        else hit.data.reconcileHandled = { at, by, note };
        const tmp = `${hit.fp}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(hit.data, null, 2));
        fs.renameSync(tmp, hit.fp);
        updated.push(n);
    }
    res.json({ ok: true, updated });
});

/**
 * Extension → retailer order number read from the retailer's confirmation page after Pay Wrrapd.
 * Body: { orderNumber, retailerOrderNumber, retailer }. The Wrrapd order must be paid and recent.
 */
app.post('/api/retailer-order-ref', async (req, res) => {
    if (!req.isApiDomain) return res.status(403).json({ error: 'Forbidden' });
    const body = req.body || {};
    const orderNumber = String(body.orderNumber || '').trim();
    const ref = String(body.retailerOrderNumber || '').trim().replace(/^#/, '').replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{3,39}$/.test(ref)) return res.status(400).json({ error: 'Invalid retailer order number' });
    const paid = findRecentPaidOrderByNumber(orderNumber);
    if (!paid) return res.status(404).json({ error: 'Order not found' });
    const hit = findOrderFileByNumber(orderNumber);
    if (!hit) return res.status(404).json({ error: 'Order not found' });
    const refs = Array.isArray(hit.data.retailerOrderNumbers) ? hit.data.retailerOrderNumbers : [];
    if (!refs.includes(ref) && refs.length < 6) {
        refs.push(ref);
        hit.data.retailerOrderNumbers = refs;
        const tmp = `${hit.fp}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(hit.data, null, 2));
        fs.renameSync(tmp, hit.fp);
    }
    const ingestKey = process.env.INGEST_API_KEY;
    const ingestUrl = process.env.TRACKING_INGEST_URL || 'http://127.0.0.1:3000/api/orders/ingest';
    let forwarded = false;
    if (ingestKey) {
        try {
            const resp = await fetch(ingestUrl.replace(/\/ingest\/?$/, '/retailer-ref'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ingestKey}` },
                body: JSON.stringify({
                    externalOrderId: orderNumber,
                    retailerOrderNumber: ref,
                    source: `extension:${String(body.retailer || '').slice(0, 20)}`,
                }),
            });
            forwarded = resp.ok;
            if (!resp.ok) console.warn('[retailer-order-ref] tracking forward', resp.status, orderNumber);
        } catch (e) {
            console.warn('[retailer-order-ref] tracking forward failed', e && e.message);
        }
    }
    return res.json({ ok: true, forwarded });
});

/**
 * Command Center → refund a paid order (Helcim or legacy Stripe). Auth: X-Wrrapd-Internal-Key.
 * Body: { orderNumber, amountCents?, reason, requestedBy, requestId }. Omit amountCents for the full remaining amount.
 */
app.post('/api/internal/refund-order', async (req, res) => {
    if (!req.isApiDomain) return res.status(403).json({ error: 'Forbidden' });
    if (!internalClaimSecretMatches(String(req.get('x-wrrapd-internal-key') || ''))) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const orderNumber = String(body.orderNumber || '').trim();
    const reason = String(body.reason || '').trim().slice(0, 300);
    const requestedBy = String(body.requestedBy || '').trim().slice(0, 120) || 'command-center';
    const requestId = String(body.requestId || '').trim().slice(0, 80);
    if (!orderNumber || !reason || !requestId) {
        return res.status(400).json({ error: 'orderNumber, reason and requestId are required' });
    }
    const hit = findOrderFileByNumber(orderNumber);
    const paymentId = hit && hit.data.payment && String(hit.data.payment.id || '');
    const paidCents = hit && hit.data.payment ? Math.round(Number(hit.data.payment.amount) || 0) : 0;
    if (!hit || !paymentId || paidCents <= 0) return res.status(404).json({ error: 'Paid order not found' });
    const already = Math.round(Number(hit.data.refundedCents) || 0);
    const remaining = paidCents - already;
    const amountCents = body.amountCents == null ? remaining : Math.round(Number(body.amountCents));
    if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > remaining) {
        return res.status(400).json({ error: `Refund must be between $0.01 and $${(remaining / 100).toFixed(2)}` });
    }
    const full = amountCents === remaining && already === 0;
    try {
        let refundId;
        let kind;
        if (paymentId.startsWith('pi_')) {
            const r = await stripe.refunds.create(
                { payment_intent: paymentId, amount: amountCents, metadata: { orderNumber, reason: reason.slice(0, 200) } },
                { idempotencyKey: `wrrapd-refund-${requestId}` },
            );
            refundId = r.id;
            kind = 'stripe-refund';
        } else {
            if (!helcim.enabled()) return res.status(503).json({ error: 'Helcim is not configured' });
            const r = await helcim.refund({ transactionId: paymentId, amountCents, ipAddress: '34.58.136.32', requestId, full });
            const d = r.data || {};
            if (!r.ok || !helcim.isApproved(d.status) || !d.transactionId) {
                console.warn('[refund-order] Helcim refused', { orderNumber, http: r.status, kind: r.kind });
                return res.status(402).json({ error: helcim.errorText(d) });
            }
            refundId = String(d.transactionId);
            kind = r.kind;
        }
        const updated = recordRefundOnOrder(orderNumber, { id: refundId, amountCents, kind, reason, by: requestedBy });
        console.log(`[refund-order] ${orderNumber} ${kind} ${amountCents}c by ${requestedBy}`);
        return res.status(200).json({
            ok: true,
            refundId,
            kind,
            amountCents,
            refundedCents: updated ? updated.refundedCents : already + amountCents,
            paidCents,
        });
    } catch (e) {
        console.error('[refund-order]', e && e.message ? e.message : e);
        return res.status(500).json({ error: 'Refund failed. Nothing was refunded — try again or use the Helcim dashboard.' });
    }
});

/** Command Center → anonymous extension installs (id, version, first/last seen; email only after a paid order). */
app.get('/api/internal/extension-installs', (req, res) => {
    if (!req.isApiDomain) return res.status(403).json({ error: 'Forbidden' });
    if (!internalClaimSecretMatches(String(req.get('x-wrrapd-internal-key') || ''))) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.json({ installs: extensionInstalls.listInstalls() });
});

app.post('/extension-heartbeat', (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ ok: false });
    }
    const saved = extensionInstalls.recordHeartbeat(req.body || {});
    return res.status(saved ? 200 : 400).json({ ok: saved });
});

app.post('/process-payment', async (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).send('Access forbidden.');
    }

    const {
        paymentIntentId,
        orderData,
        customerEmail,
        customerPhone,
        orderNumber,
        billingDetails,
        greetingFirstName,
        amazonDeliveryHints,
        gifteeOriginalAddress,
        finalShippingAddress: finalShippingAddressFromClient,
        checkoutInvoice,
    } = req.body;

    // Validate that all parameters are present
    if (!paymentIntentId || !customerEmail || !customerPhone || !orderNumber) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }
    extensionInstalls.attachPayer(req.body && req.body.installId, customerEmail);

    const normalizedOrderData = normalizeOrderItems(orderData);
    const payRetailer = normalizePayRetailer(req.body);

    // Checkout giftee source (priority):
    // 1) process-payment body from checkout postMessage (always tied to this payment; survives PM2 multi-worker).
    // 2) in-memory map from store-final-shipping-address on this worker.
    // 3) disk file written by store-final (shared across workers on this host).
    const fromClient = coerceFinalShippingFromPaymentPayload(finalShippingAddressFromClient);
    let fromGlobal = null;
    if (global.finalShippingAddresses && global.finalShippingAddresses[orderNumber]) {
        fromGlobal = coerceFinalShippingFromPaymentPayload(global.finalShippingAddresses[orderNumber]);
        delete global.finalShippingAddresses[orderNumber];
    }
    let fromDisk = null;
    if (!fromClient && !fromGlobal) {
        fromDisk = coerceFinalShippingFromPaymentPayload(
            readAndConsumePendingFinalShippingFromDisk(orderNumber),
        );
    } else {
        unlinkPendingFinalShippingFile(orderNumber);
    }
    let finalShippingAddressFromCheckout = fromClient || fromGlobal || fromDisk;
    if (finalShippingAddressFromCheckout) {
        const src = fromClient ? 'postMessage body' : fromGlobal ? 'memory' : 'disk';
        console.log(`[process-payment] Final shipping (giftee) for order ${orderNumber} from ${src}`);
    }

    // Checkout is source of truth for gift delivery — overwrite Amazon-scraped finalShippingAddress on every line item
    if (finalShippingAddressFromCheckout) {
        const snap = finalShippingAddressFromCheckout;
        for (const it of normalizedOrderData) {
            it.finalShippingAddress = {
                name: snap.name,
                firstName: snap.firstName || '',
                lastName: snap.lastName || '',
                street: snap.street,
                city: snap.city,
                state: snap.state,
                postalCode: snap.postalCode,
                country: snap.country,
            };
        }
    }

    const gifterFullName =
        typeof req.body.gifterFullName === 'string' ? req.body.gifterFullName.trim() : '';

    try {
        // New checkout charges are Helcim transaction ids. In-flight Stripe
        // checkouts still send a PaymentIntent id (pi_…).
        let paymentIntent;
        if (String(paymentIntentId).startsWith('pi_')) {
            paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            if (paymentIntent.status !== 'succeeded') {
                return res.status(400).json({ error: 'Payment not confirmed' });
            }
        } else {
            const txn = await helcim.getTransaction(paymentIntentId);
            const data = txn.data || {};
            const purchaseType = String(data.type || '').toLowerCase() === 'purchase';
            if (!txn.ok || !helcim.isApproved(data.status) || !purchaseType || !data.transactionId) {
                return res.status(400).json({ error: 'Payment not confirmed' });
            }
            paymentIntent = {
                id: String(data.transactionId),
                amount: Math.round(Number(data.amount) * 100),
                status: 'succeeded',
            };
        }

        const existingOrder = findExistingOrderByPaymentIntent(paymentIntentId);
        if (existingOrder) {
            console.log(`[process-payment] Duplicate callback ignored for ${paymentIntentId}; already saved in ${existingOrder.file}`);
            return res.status(200).json({
                success: true,
                message: 'Payment already processed',
                orderNumber: existingOrder.data.orderNumber || orderNumber,
                alreadyProcessed: true,
            });
        }

        // Process the order information
        const amount = (paymentIntent.amount / 100).toFixed(2);

        console.log('Order Data (normalized):', normalizedOrderData);
        console.log(`Using order number: ${orderNumber}`);

        // Save order data to a local JSON file
        saveOrderToJsonFile(
            normalizedOrderData,
            paymentIntent,
            {
                email: customerEmail,
                phone: customerPhone,
            },
            orderNumber,
            checkoutInvoice,
            payRetailer,
        );
        
        // Generate QR code for the order
        const qrData = {
            orderNumber,
            timestamp: new Date().toISOString(),
            amount,
            items: normalizedOrderData.length
        };
        
        // Create a temporary file for the QR code
        const qrTempPath = path.join(__dirname, `temp_qr_${orderNumber}.png`);
        
        // Generate the QR code as a PNG file
        await QRCode.toFile(qrTempPath, JSON.stringify(qrData), {
            errorCorrectionLevel: 'H',
            type: 'png',
            margin: 1,
            width: 300
        });
        
        // Upload the QR code to Google Cloud Storage
        const qrDestPath = `qr-codes/${orderNumber}.png`;
        await storage.bucket('wrrapd-media').upload(qrTempPath, {
            destination: qrDestPath,
            metadata: {
                contentType: 'image/png',
            },
        });
        
        // Delete the temporary file after upload
        fs.unlinkSync(qrTempPath);
        
        console.log(`QR code generated and uploaded to gs://wrrapd-media/${qrDestPath}`);

        // Collect images for both emails
        const adminAttachments = [];
        const customerAttachments = [];
        
        // Process order items to collect images and build custom design HTML
        const processedItems = await Promise.all(normalizedOrderData.map(async (item, index) => {
            if (finalShippingAddressFromCheckout && !item.finalShippingAddress) {
                item.finalShippingAddress = finalShippingAddressFromCheckout;
            }
            
            // Format Wrrapd shipping address (where item is sent for wrapping)
            const shippingAddress = item.shippingAddress 
                ? `
                    ${item.shippingAddress.name || 'N/A'},<br>
                    ${item.shippingAddress.street || 'N/A'},<br>
                    ${item.shippingAddress.city || 'N/A'}, 
                    ${item.shippingAddress.state || 'N/A'}, 
                    ${item.shippingAddress.postalCode || 'N/A'},<br>
                    ${item.shippingAddress.country || 'N/A'}
                `
                : 'Wrrapd Inc., 7901 4th St N, Ste 300, St. Petersburg, FL 33702, US';

            // Format delivery instructions if they exist
            let deliveryInstructionsFormatted = '';
            if (item.deliveryInstructions) {
                deliveryInstructionsFormatted = `
                    <strong>Delivery Instructions:</strong><br>
                    ${item.deliveryInstructions.propertyType ? `Property Type: ${item.deliveryInstructions.propertyType}<br>` : ''}
                    ${item.deliveryInstructions.securityCode ? `Security Code: ${item.deliveryInstructions.securityCode}<br>` : ''}
                    ${item.deliveryInstructions.callBox ? `Call Box: ${item.deliveryInstructions.callBox}<br>` : ''}
                    ${item.deliveryInstructions.preferredLocation ? `Preferred Location: ${item.deliveryInstructions.preferredLocation}<br>` : ''}
                    ${item.deliveryInstructions.businessHours ? `Business Hours: ${item.deliveryInstructions.businessHours}<br>` : ''}
                    ${item.deliveryInstructions.additionalInstructions ? `Additional Instructions: ${item.deliveryInstructions.additionalInstructions}` : ''}
                `;
            }

            // Format AI design if it exists
            let aiDesignFormatted = 'None';
            let aiDesignPath = null;
            let aiDesignFilename = null;
            if (item.selected_ai_design && typeof item.selected_ai_design === 'object') {
                aiDesignFormatted = `<strong>${item.selected_ai_design.title}</strong><br>${item.selected_ai_design.description}`;
                // Get AI design path from gcsPath if available
                if (item.selected_ai_design.gcsPath) {
                    aiDesignPath = item.selected_ai_design.gcsPath;
                    aiDesignFilename = aiDesignPath.split('/').pop();
                }
            }

            // Check if there's a custom design and prepare to attach it
            let adminCustomDesignHtml = 'None';
            let customerCustomDesignHtml = '';
            
            // Handle AI design image attachment
            let adminAiDesignHtml = '';
            let customerAiDesignHtml = '';
            if (item.selected_wrapping_option === 'ai') {
                if (aiDesignPath) {
                    const aiImageData = await getImageForEmail(aiDesignPath);
                    
                    if (aiImageData) {
                        // Add attachments for admin email
                        adminAttachments.push({
                            filename: aiDesignFilename,
                            data: aiImageData.data
                        });
                        
                        // Add attachments for customer email
                        customerAttachments.push({
                            filename: aiDesignFilename,
                            data: aiImageData.data
                        });
                        
                        // Create HTML with CID references
                        adminAiDesignHtml = `
                            <div style="margin-top: 15px;">
                                <h4 style="margin-top: 0;">AI Design Image</h4>
                                <p><strong>Filename:</strong> ${aiDesignFilename}</p>
                                <p><strong>Path:</strong> ${aiDesignPath}</p>
                                <img src="cid:${aiDesignFilename}" alt="AI Design" style="max-width: 200px; max-height: 200px; border: 1px solid #ddd;">
                            </div>
                        `;
                        
                        customerAiDesignHtml = `
                            <div style="margin-top: 15px; margin-bottom: 15px;">
                                <p><strong>Your AI Generated Design:</strong></p>
                                <img src="cid:${aiDesignFilename}" alt="Your AI Design" style="max-width: 300px; max-height: 300px; border: 1px solid #ddd;">
                            </div>
                        `;
                    } else {
                        // Image couldn't be loaded, but still show the info
                        adminAiDesignHtml = `
                            <div style="margin-top: 15px;">
                                <h4 style="margin-top: 0;">AI Design</h4>
                                <p><strong>Filename:</strong> ${aiDesignFilename || 'N/A'}</p>
                                <p><strong>Path:</strong> ${aiDesignPath || 'N/A'}</p>
                                <p><em>Note: AI design image should be available in the media bucket at the path above.</em></p>
                            </div>
                        `;
                    }
                } else {
                    // No path available, but still show what we have
                    adminAiDesignHtml = `
                        <div style="margin-top: 15px;">
                            <h4 style="margin-top: 0;">AI Design</h4>
                            <p><strong>Title:</strong> ${item.selected_ai_design?.title || 'N/A'}</p>
                            <p><strong>Description:</strong> ${item.selected_ai_design?.description || 'N/A'}</p>
                            <p><em>Note: AI design image path not available in order data.</em></p>
                        </div>
                    `;
                }
            }
            
            if (item.uploaded_design_path && item.selected_wrapping_option === 'upload') {
                const imageData = await getImageForEmail(item.uploaded_design_path);
                
                if (imageData) {
                    // Extract the original filename from the path
                    const originalFilename = item.uploaded_design_path.split('/').pop();
                    
                    // Add attachments for admin email
                    adminAttachments.push({
                        filename: originalFilename,
                        data: imageData.data
                    });
                    
                    // Add attachments for customer email
                    customerAttachments.push({
                        filename: originalFilename,
                        data: imageData.data
                    });
                    
                    // Create HTML with CID references
                    adminCustomDesignHtml = `
                        <p>Custom Design:</p>
                        <img src="cid:${originalFilename}" alt="Custom Design" style="max-width: 100px; max-height: 100px;">
                    `;
                    
                    customerCustomDesignHtml = `
                        <div style="margin-top: 15px; margin-bottom: 15px;">
                            <p><strong>Your Custom Design:</strong></p>
                            <img src="cid:${originalFilename}" alt="Your Custom Design" style="max-width: 300px; max-height: 300px; border: 1px solid #ddd;">
                        </div>
                    `;
                }
            }

            // Handle product image display (without attachment)
            let adminProductImageHtml = '';
            let customerProductImageHtml = '';
            
            if (item.imageUrl) {
                // Just reference the image directly instead of downloading and attaching it
                adminProductImageHtml = `
                    <div style="margin-right: 20px; margin-bottom: 15px;">
                        <img src="${item.imageUrl}" alt="Product image" style="max-width: 150px; max-height: 150px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                `;
                
                customerProductImageHtml = `
                    <div style="margin-right: 20px; margin-bottom: 15px;">
                        <img src="${item.imageUrl}" alt="Product image" style="max-width: 150px; max-height: 150px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                `;
            }

            // Return the processed data for admin and customer emails
            return {
                adminRow: `
                    <div style="border: 1px solid #e1e1e1; margin-bottom: 20px; padding: 15px; border-radius: 5px;">
                        <div style="display: flex; flex-wrap: wrap;">
                            ${adminProductImageHtml}
                            <div style="flex: 1; min-width: 300px;">
                                <h3 style="margin-top: 0;">Item: ${item.title}</h3>
                                <p><strong>ASIN:</strong> ${item.asin}</p>
                                <p><strong>Flowers:</strong> ${item.checkbox_flowers ? 'Yes' : 'No'}</p>
                                ${(() => {
                                    const offer = item.flower_offer_id
                                        ? flowerCatalog.getOffer(String(item.flower_offer_id))
                                        : null;
                                    const real =
                                        (offer && offer.title) ||
                                        item.flower_title ||
                                        item.selected_flower_design ||
                                        '';
                                    return real
                                        ? `<p><strong>Flower product (ops):</strong> ${String(real).replace(/</g, '&lt;')}</p>`
                                        : '';
                                })()}
                                ${item.selected_wrapping_option ? `<p><strong>Wrapping Option:</strong> ${item.selected_wrapping_option}</p>` : ''}
                                
                                ${item.selected_wrapping_option === 'ai' && item.selected_ai_design ? 
                                  `<div style="margin: 10px 0;">
                                     <p><strong>AI Design:</strong> ${item.selected_ai_design.title}</p>
                                     <p style="margin-left: 15px;">${item.selected_ai_design.description}</p>
                                     ${aiDesignFilename ? `<p><strong>AI Design Filename:</strong> ${aiDesignFilename}</p>` : ''}
                                   </div>` : 
                                  ''}
                                
                                ${item.occasion ? `<p><strong>Occasion:</strong> ${item.occasion}</p>` : ''}
                                
                                ${item.senderName ? `<p><strong>From:</strong> ${item.senderName}</p>` : ''}
                                ${item.giftMessage ? 
                                  `<div style="margin: 10px 0; padding: 10px; background-color: #f5f5f5; border-radius: 5px; font-style: italic;">
                                     <p style="margin: 0;"><strong>Gift Message:</strong> "${item.giftMessage}"</p>
                                   </div>` : 
                                  ''}
                            </div>
                        </div>
                        
                        <div style="margin-top: 15px; padding: 10px; background-color: #f9f9f9; border-radius: 5px;">
                            <h4 style="margin-top: 0;">Shipping Address (Wrrapd)</h4>
                            <p style="white-space: pre-line;">${shippingAddress.replace(/<br>/g, "\n")}</p>
                        </div>
                        
                        <!-- Final Shipping Address removed from per-item - shown once at order level -->
                        
                        ${deliveryInstructionsFormatted ? 
                          `<div style="margin-top: 15px; padding: 10px; background-color: #f9f9f9; border-radius: 5px;">
                             <h4 style="margin-top: 0;">Delivery Instructions</h4>
                             ${deliveryInstructionsFormatted.replace('<strong>Delivery Instructions:</strong><br>', '')}
                           </div>` : 
                          ''}
                        
                        ${item.selected_wrapping_option === 'ai' ? adminAiDesignHtml : ''}
                        ${item.uploaded_design_path && item.selected_wrapping_option === 'upload' ?
                          `<div style="margin-top: 15px;">
                             <h4 style="margin-top: 0;">Custom Design</h4>
                             ${adminCustomDesignHtml.replace('<p>Custom Design:</p>', '')}
                           </div>` :
                          ''}
                    </div>
                `,
                customerRow: `
                    <div style="border: 1px solid #e1e1e1; margin-bottom: 20px; padding: 15px; border-radius: 5px;">
                        <div style="display: flex; flex-wrap: wrap;">
                            ${customerProductImageHtml}
                            <div style="flex: 1; min-width: 300px;">
                                <h3 style="margin-top: 0;">${item.title}</h3>
                                
                                ${item.senderName ? `<p><strong>From:</strong> ${item.senderName}</p>` : ''}
                                ${item.giftMessage ? 
                                  `<div style="margin: 10px 0; padding: 10px; background-color: #f5f5f5; border-radius: 5px; font-style: italic; border-left: 3px solid #ccc;">
                                     <p style="margin: 0;"><strong>Your Gift Message:</strong> "${item.giftMessage}"</p>
                                   </div>` : 
                                  ''}
                            </div>
                        </div>
                        
                        <div style="margin: 10px 0; padding: 10px; background-color: #f9f9f9; border-radius: 5px;">
                            <h4 style="margin-top: 0;">Wrapping Details</h4>
                            <p><strong>Flowers:</strong> ${item.checkbox_flowers ? 'Yes' : 'No'}</p>
                            <p><strong>Wrapping Paper:</strong> ${
                                item.selected_wrapping_option === 'ai' ? 'AI Generated Design' :
                                item.selected_wrapping_option === 'wrrapd' ? 'Selected by Wrrapd' :
                                item.selected_wrapping_option === 'upload' ? 'Your Own Design' :
                                item.selected_wrapping_option || 'None'
                            }</p>
                            ${item.selected_wrapping_option === 'ai' && item.selected_ai_design ? 
                              `<p><strong>Design Details:</strong> ${item.selected_ai_design.title} - ${item.selected_ai_design.description}</p>` : 
                              ''}
                            ${customerAiDesignHtml}
                            ${customerCustomDesignHtml}
                        </div>
                        
                        <!-- Final Shipping Address removed from per-item - shown once at order level in Customer Information section -->
                        
                        ${deliveryInstructionsFormatted ? 
                          `<div style="margin-top: 15px; padding: 10px; background-color: #f9f9f9; border-radius: 5px;">
                             <h4 style="margin-top: 0;">Delivery Instructions</h4>
                             ${deliveryInstructionsFormatted.replace('<strong>Delivery Instructions:</strong><br>', '')}
                           </div>` : 
                          ''}
                    </div>
                `
            };
        }));

        const nonBlockingWarnings = [];

        /** Giftee row for ingest + legacy pay emails when ingest does not run or fails (block scope below). */
        let trackingGifteeForEmail = normalizeAddressShape({});
        /** When true, tracking Cloud Run already sent thank-you + ops emails — skip legacy pair from this server. */
        let trackingIngestHandledNotifications = false;
        let fallbackEmailContext = {
            recipientName: '',
            addressLine1: '',
            addressLine2: '',
            city: '',
            state: '',
            postalCode: '',
            scheduledEtLabel: '',
            lineItems: [],
            retailer: payRetailer || '',
            customerName: '',
            sourceNote: '',
            wrapRevenueCents: null,
            flowersRevenueCents: null,
            orderValueCents: null,
            ingestFailedReason: '',
        };

        // Ingest ONE tracking order for this checkout (prevents multi-email fan-out).
        if (normalizedOrderData.length > 0) {
            const wrappedOnly = normalizedOrderData.filter((it) => it && it.checkbox_wrrapd === true);
            const firstItem = wrappedOnly[0] || normalizedOrderData[0] || {};
            const customerName =
                gifterFullName ||
                (billingDetails && billingDetails.name) ||
                (customerEmail && customerEmail.split('@')[0]) ||
                'Customer';
            /**
             * Firestore/admin/driver must match what the shopper typed on pay.wrrapd.com checkout.
             * When we have checkout POST / postMessage / disk final shipping, use ONLY that — do not
             * fall through to Amazon line items (Roger / default address) for ingest.
             */
            let finalAddr = null;
            if (finalShippingAddressFromCheckout) {
                const n = normalizeAddressShape(finalShippingAddressFromCheckout);
                if ((n.street || n.line1) && !isLikelyWrrapdWarehouseAddressObj(n)) {
                    finalAddr = n;
                }
            }
            if (!finalAddr) {
                finalAddr = pickTrackingRecipientAddressForIngest({
                    wrappedOnly,
                    finalShippingAddressFromCheckout: null,
                    gifteeOriginalAddress,
                });
            }
            trackingGifteeForEmail = finalAddr;
            const streetParts = splitStreet(finalAddr.street || finalAddr.line1 || '');
            const recipientName = (finalAddr.name && String(finalAddr.name).trim()) || customerName;
            const lineItems = wrappedOnly.map((it) => {
                const ai =
                    it.selected_ai_design && typeof it.selected_ai_design === 'object'
                        ? it.selected_ai_design
                        : null;
                const pathStr = it.uploaded_design_path ? String(it.uploaded_design_path) : '';
                const uploadName =
                    (it.uploaded_design_name && String(it.uploaded_design_name)) ||
                    (pathStr ? pathStr.split('/').pop() : '') ||
                    '';
                const aiGcs = ai && ai.gcsPath ? String(ai.gcsPath) : '';
                const designStoragePath = aiGcs || pathStr || '';
                const designFileName = designStoragePath ? designStoragePath.split('/').pop() || '' : '';
                const designImageUrl =
                    publicWrrapdMediaUrl(aiGcs) ||
                    publicWrrapdMediaUrl(pathStr) ||
                    '';
                return {
                    title: it.title || 'Wrapped item',
                    asin: it.asin || '',
                    imageUrl: it.imageUrl || '',
                    wrappingOption: it.selected_wrapping_option || '',
                    flowers: !!it.checkbox_flowers,
                    // Admin/ops + console: prefer real product title from the live offer.
                    // Customer-facing emails never use this for naming (thank-you shows "Flowers" only).
                    flowerDesign: (() => {
                      const offer = it.flower_offer_id
                        ? flowerCatalog.getOffer(String(it.flower_offer_id))
                        : null;
                      if (offer?.title) return String(offer.title);
                      if (it.flower_title) return String(it.flower_title);
                      if (it.selected_flower_design) return String(it.selected_flower_design);
                      return '';
                    })(),
                    flowerOfferId: it.flower_offer_id ? String(it.flower_offer_id) : '',
                    flowerAmount:
                        it.flower_amount != null && Number.isFinite(Number(it.flower_amount))
                            ? Number(it.flower_amount)
                            : undefined,
                    flowerImageUrl: it.flower_image_url ? String(it.flower_image_url) : '',
                    uploadedDesignPath: pathStr,
                    uploadedDesignFileName: uploadName,
                    wrappingDesignImageUrl: designImageUrl || undefined,
                    wrappingDesignStoragePath: designStoragePath || undefined,
                    wrappingDesignFileName: designFileName || uploadName || undefined,
                    aiDesignTitle: ai && ai.title ? String(ai.title) : '',
                    aiDesignDescription: ai && ai.description ? String(ai.description) : '',
                    giftMessage: it.giftMessage ? String(it.giftMessage) : '',
                    senderName: it.senderName ? String(it.senderName) : '',
                    occasion: it.occasion ? String(it.occasion) : '',
                    packageDimensions: it.packageDimensions ? String(it.packageDimensions) : '',
                    productDimensions: it.productDimensions ? String(it.productDimensions) : '',
                    itemCategory: it.itemCategory ? String(it.itemCategory) : '',
                };
            });
            const wrappedAmazonDays = [...new Set(
                wrappedOnly
                    .map((it) => amazonDateKeyFromItem(it))
                    .filter((d) => !!d)
            )].sort();
            const hintedAmazonDays = (
                amazonDeliveryHints &&
                Array.isArray(amazonDeliveryHints.amazonDeliveryDays)
            )
                ? [...new Set(
                    amazonDeliveryHints.amazonDeliveryDays
                        .map((d) => (typeof d === 'string' ? d.trim() : ''))
                        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
                )].sort()
                : [];
            /**
             * Prefer extension/checkout `amazonDeliveryHints` (headline + selected radio) over
             * per-line `amazonDateKeyFromItem` scrapes. Amazon line payloads often carry UTC-midnight
             * instants that format one calendar day *earlier* in Eastern than the UI "Arriving …" date,
             * which made Wrrapd +1 land on the wrong day (e.g. Apr 22 vs headline Apr 23 → expect Apr 24).
             */
            const effectiveAmazonDays = hintedAmazonDays.length ? hintedAmazonDays : wrappedAmazonDays;
            const hintedGroupingRaw =
                amazonDeliveryHints && typeof amazonDeliveryHints.wrrapdAmazonGrouping === 'string'
                    ? amazonDeliveryHints.wrrapdAmazonGrouping.trim().toLowerCase()
                    : '';
            const hintedGrouping =
                hintedGroupingRaw === 'earliest' || hintedGroupingRaw === 'fastest' || hintedGroupingRaw === 'first'
                    ? 'earliest'
                    : 'latest';
            const fallbackAmazonDay = inferAmazonDateKeyFromItems(wrappedOnly.length ? wrappedOnly : normalizedOrderData);
            const payEmailNorm = normalizeCustomerEmail(customerEmail);
            const payWrrapdCustomerId = getOrCreateWrrapdCustomerId(payEmailNorm);
            const revenue = revenueCentsFromCheckoutInvoice(checkoutInvoice);
            const chargedTotalCents = Math.round(Number(paymentIntent && paymentIntent.amount));
            if (Number.isFinite(chargedTotalCents) && chargedTotalCents > 0) {
                revenue.orderValueCents = chargedTotalCents;
            }
            const ingestCommon = {
                customerName,
                customerPhone,
                customerEmail,
                ...(payEmailNorm ? { customerEmailNorm: payEmailNorm } : {}),
                ...(payWrrapdCustomerId ? { wrrapdCustomerId: payWrrapdCustomerId } : {}),
                recipientName,
                addressLine1: streetParts.line1 || finalAddr.line1 || 'N/A',
                addressLine2: streetParts.line2 || finalAddr.line2 || '',
                city: finalAddr.city || firstItem.city || 'N/A',
                state: finalAddr.state || firstItem.state || 'N/A',
                postalCode: finalAddr.postalCode || finalAddr.postal_code || firstItem.postalCode || '00000',
                /** Tracking ingest prefers this over shippingAddress / Amazon aliases (order-ingest). */
                gifteeAddress: {
                    name: recipientName,
                    line1: streetParts.line1 || finalAddr.line1 || 'N/A',
                    line2: streetParts.line2 || finalAddr.line2 || '',
                    city: finalAddr.city || firstItem.city || 'N/A',
                    state: finalAddr.state || firstItem.state || 'N/A',
                    postalCode: finalAddr.postalCode || finalAddr.postal_code || firstItem.postalCode || '00000',
                },
                externalOrderId: canonicalTrackingExternalOrderId(orderNumber),
                lineItems,
                ...(revenue.wrapRevenueCents != null ? { wrapRevenueCents: revenue.wrapRevenueCents } : {}),
                ...(revenue.flowersRevenueCents != null
                    ? { flowersRevenueCents: revenue.flowersRevenueCents }
                    : {}),
                ...(revenue.orderValueCents != null ? { orderValueCents: revenue.orderValueCents } : {}),
            };
            const flowerPickup = [];
            for (const it of wrappedOnly) {
                if (!it.checkbox_flowers || !it.flower_offer_id) continue;
                const offer = flowerCatalog.getOffer(String(it.flower_offer_id));
                if (!offer) continue;
                flowerPickup.push({
                    retailer: offer.retailer,
                    storeName: offer.storeName,
                    address: offer.address,
                    city: offer.city,
                    state: offer.state,
                    postalCode: offer.postalCode,
                    productTitle: offer.title,
                    retailPrice: offer.retailPrice,
                    chargedPrice: offer.chargedPrice,
                    sku: offer.sku,
                    productUrl: offer.productUrl,
                    imageUrl: offer.imageUrl,
                });
            }
            if (flowerPickup.length) {
                ingestCommon.pickupFlowers = true;
                ingestCommon.flowerPickup = flowerPickup;
            }
            let ingestPayload;
            if (payRetailer === 'Lego') {
                const legoScheduled =
                    (typeof req.body.scheduledFor === 'string' && req.body.scheduledFor.trim()) ||
                    (typeof req.body.deliveryDate === 'string' && req.body.deliveryDate.trim()) ||
                    new Date(Date.now() + 5 * 86400000).toISOString();
                ingestPayload = {
                    ...ingestCommon,
                    retailer: 'Lego',
                    sourceNote: `Lego order ${orderNumber}; ${wrappedOnly.length} Wrrapd item(s). [${WRRAPD_INGEST_VERSION}]`,
                    scheduledFor: legoScheduled,
                };
            } else if (payRetailer === 'Amazon') {
                ingestPayload = {
                    ...ingestCommon,
                    retailer: 'Amazon',
                    sourceNote: `Amazon order ${orderNumber}; ${wrappedOnly.length} Wrrapd item(s); Amazon dates ${
                        effectiveAmazonDays.join(', ') || fallbackAmazonDay
                    }; Wrrapd +1 (${
                        hintedGrouping === 'earliest' ? 'after earliest' : 'after latest'
                    } Amazon day). [${WRRAPD_INGEST_VERSION}]`,
                    ...(effectiveAmazonDays.length > 0
                        ? {
                            amazonDeliveryDays: effectiveAmazonDays,
                            wrrapdAmazonGrouping: hintedGrouping === 'earliest' ? 'earliest' : 'latest',
                        }
                        : {
                            // Always prefer Amazon date key input so tracking computes +1 day in America/New_York.
                            amazonDeliveryDay: fallbackAmazonDay,
                        }),
                };
            } else {
                /**
                 * Non-Amazon retailers (Target, Walmart, Nordstrom, Kohls, Sephora, Best Buy, Ulta, Etsy).
                 * We can only schedule from the retailer's OWN promised delivery date when the extension
                 * captured one at checkout. Wrrapd delivers that date + 1. When no date was captured we do
                 * NOT fabricate a concrete date — the email falls back to safe wording, and scheduledFor is
                 * a placeholder ops can adjust. Crucially: never route these through the Amazon +1 machinery
                 * (it would trigger Amazon "choose your delivery date" flows).
                 */
                const retailerDays = [...new Set(
                    wrappedOnly.map((it) => amazonDateKeyFromItem(it)).filter((d) => !!d)
                )].sort();
                const retailerDeliveryYmd = retailerDays.length ? retailerDays[retailerDays.length - 1] : null;
                const scheduledForNonAmazon =
                    wrrapdIsoFromRetailerYmd(retailerDeliveryYmd) ||
                    new Date(Date.now() + 86400000).toISOString();
                ingestPayload = {
                    ...ingestCommon,
                    retailer: payRetailer,
                    sourceNote: retailerDeliveryYmd
                        ? `${payRetailer} order ${orderNumber}; ${wrappedOnly.length} Wrrapd item(s); ${payRetailer} delivery ${retailerDeliveryYmd} → Wrrapd +1 day. [${WRRAPD_INGEST_VERSION}]`
                        : `${payRetailer} order ${orderNumber}; ${wrappedOnly.length} Wrrapd item(s); no retailer delivery date captured → Wrrapd schedules retailer date + 1. [${WRRAPD_INGEST_VERSION}]`,
                    scheduledFor: scheduledForNonAmazon,
                    ...(retailerDeliveryYmd ? { retailerEstimatedDeliveryDate: retailerDeliveryYmd } : {}),
                };
            }
            try {
                const servingHub = deliveryHubs.nearestHub(ingestCommon.gifteeAddress.postalCode).hub;
                if (servingHub) {
                    ingestPayload.sourceNote = `${ingestPayload.sourceNote} Hub: ${servingHub.name} (${servingHub.postalCode}).`;
                }
            } catch (e) {
                console.error('[process-payment] hub lookup for order note failed', orderNumber, e && e.message);
            }
            const ingestResult = await ingestOrderIntoTracking(ingestPayload);
            try {
                setOrderIngestState(orderNumber, {
                    ok: !!ingestResult.ok,
                    attempts: 1,
                    reason: ingestResult.ok ? '' : String(ingestResult.reason || 'unknown').slice(0, 300),
                    payload: ingestPayload,
                });
            } catch (e) {
                console.error('[process-payment] could not record Command Center hand-off', orderNumber, e && e.message);
            }
            const retailerYmd =
                ingestPayload.retailerEstimatedDeliveryDate ||
                (Array.isArray(ingestPayload.amazonDeliveryDays) &&
                    ingestPayload.amazonDeliveryDays[ingestPayload.amazonDeliveryDays.length - 1]) ||
                ingestPayload.amazonDeliveryDay ||
                '';
            fallbackEmailContext = {
                recipientName,
                addressLine1: ingestCommon.addressLine1,
                addressLine2: ingestCommon.addressLine2,
                city: ingestCommon.city,
                state: ingestCommon.state,
                postalCode: ingestCommon.postalCode,
                scheduledEtLabel: orderEmails.deliveryWindowLabel(payRetailer, retailerYmd),
                lineItems: lineItems.length ? lineItems : wrappedOnly.map((it) => ({
                    title: it.title || 'Wrapped item',
                    asin: it.asin || '',
                    imageUrl: it.imageUrl || '',
                    wrappingOption: it.selected_wrapping_option || '',
                    flowers: !!it.checkbox_flowers,
                    occasion: it.occasion || '',
                    giftMessage: it.giftMessage || '',
                    senderName: it.senderName || '',
                })),
                retailer: payRetailer || '',
                customerName,
                sourceNote: ingestPayload.sourceNote || '',
                wrapRevenueCents: ingestCommon.wrapRevenueCents,
                flowersRevenueCents: ingestCommon.flowersRevenueCents,
                orderValueCents: ingestCommon.orderValueCents,
                ingestFailedReason: '',
            };
            if (!ingestResult.ok) {
                nonBlockingWarnings.push(`tracking ingest failed: ${ingestResult.reason}`);
                fallbackEmailContext.ingestFailedReason = ingestResult.reason || 'unknown';
            } else {
                trackingIngestHandledNotifications = true;
            }
        }

        const gifteeName =
            fallbackEmailContext.recipientName ||
            (trackingGifteeForEmail.name && String(trackingGifteeForEmail.name).trim()) ||
            '—';
        const gifteeStreet =
            fallbackEmailContext.addressLine1 ||
            trackingGifteeForEmail.street ||
            trackingGifteeForEmail.line1 ||
            '';
        const gifteeCity = fallbackEmailContext.city || trackingGifteeForEmail.city || '';
        const gifteeState = fallbackEmailContext.state || trackingGifteeForEmail.state || '';
        const gifteeZip =
            fallbackEmailContext.postalCode ||
            trackingGifteeForEmail.postalCode ||
            '';
        const customerAddressLine = [gifteeStreet, [gifteeCity, gifteeState, gifteeZip].filter(Boolean).join(', ')]
            .filter(Boolean)
            .join(', ');
        const thankYouLineItems =
            fallbackEmailContext.lineItems && fallbackEmailContext.lineItems.length
                ? fallbackEmailContext.lineItems
                : normalizedOrderData.map((it) => ({
                      title: it.title || 'Wrapped item',
                      asin: it.asin || '',
                      imageUrl: it.imageUrl || '',
                      wrappingOption: it.selected_wrapping_option || '',
                      flowers: !!it.checkbox_flowers,
                      occasion: it.occasion || '',
                      giftMessage: it.giftMessage || '',
                      senderName: it.senderName || '',
                  }));
        const gifterName =
            fallbackEmailContext.customerName ||
            gifterFullName ||
            (billingDetails && billingDetails.name) ||
            customerEmail;
        const scheduledEtLabel =
            fallbackEmailContext.scheduledEtLabel ||
            orderEmails.deliveryWindowLabel(payRetailer, '');

        const customerEmailBody = orderEmails.thankYouEmailHtml({
            customerName: gifterName,
            customerGreetingName: greetingFirstName || gifterName,
            orderId: orderNumber,
            recipientName: gifteeName,
            addressLine: customerAddressLine,
            scheduledEtLabel,
            lineItems: thankYouLineItems,
        });
        const adminEmailBody = orderEmails.adminNewOrderEmailHtml({
            publicOrderRef: orderNumber,
            customerName: gifterName,
            customerPhone,
            customerEmail,
            recipientName: gifteeName,
            addressLine1: gifteeStreet,
            addressLine2: fallbackEmailContext.addressLine2,
            city: gifteeCity,
            state: gifteeState,
            postalCode: gifteeZip,
            scheduledEtLabel,
            sourceNote: fallbackEmailContext.sourceNote,
            lineItems: thankYouLineItems,
            retailer: payRetailer || fallbackEmailContext.retailer,
            amountPaidLabel: `$${amount}`,
            wrapRevenueCents: fallbackEmailContext.wrapRevenueCents,
            flowersRevenueCents: fallbackEmailContext.flowersRevenueCents,
            orderValueCents: fallbackEmailContext.orderValueCents,
            ingestFailedReason: fallbackEmailContext.ingestFailedReason,
            allocationNote: fallbackEmailContext.ingestFailedReason
                ? 'Tracking ingest failed — allocate in Command Center after the order is recovered.'
                : 'Review proposed allocation in Command Center → Allocations.',
        });

        // Same subject + branded bodies as Cloud Run. Skip only when tracking already sent them.
        if (!trackingIngestHandledNotifications) {
            const emailResults = await sendProcessPaymentPairEmails({
                adminRecipients: ['admin@wrrapd.com'],
                adminFrom:
                    (smtpReadyForPay() && process.env.SMTP_FROM_ADMIN?.trim()) ||
                    'Wrrapd <noreply@wrrapd.com>',
                adminSubject: orderEmails.adminNewOrderSubject(orderNumber),
                adminHtml: adminEmailBody,
                adminAttachments,
                customerTo: customerEmail,
                customerFrom:
                    (smtpReadyForPay() && process.env.SMTP_FROM_CUSTOMER?.trim()) ||
                    'Wrrapd Orders <orders@wrrapd.com>',
                customerSubject: orderEmails.thankYouSubject(orderNumber),
                customerHtml: customerEmailBody,
                customerAttachments,
                customerReplyTo: 'support@wrrapd.com',
            });

            emailResults.forEach((r, idx) => {
                if (r.status === 'rejected') {
                    const label = idx === 0 ? 'admin email' : 'customer email';
                    const msg = r.reason && r.reason.message ? r.reason.message : String(r.reason);
                    nonBlockingWarnings.push(`${label} failed: ${msg}`);
                }
            });
        } else {
            console.info(
                `[process-payment] Skipping legacy pay-server email pair for ${orderNumber} (tracking ingest sent notifications).`,
            );
        }

        if (nonBlockingWarnings.length > 0) {
            console.warn(`[process-payment] non-blocking warnings for ${orderNumber}:`, nonBlockingWarnings);
        }

        // Respond to client
        res.status(200).json({
            success: true,
            message: 'Payment and order processed successfully',
            orderNumber: orderNumber,
            warnings: nonBlockingWarnings,
        });
    } catch (error) {
        console.error('Error processing payment:', error);
        res.status(500).json({ error: 'Failed to process payment' });
    }
});

// Handle OPTIONS preflight for /generate-ideas (redundant but explicit)
app.options('/generate-ideas', (req, res) => {
    console.log('[generate-ideas] OPTIONS preflight request received');
    console.log('[generate-ideas] Origin:', req.headers.origin);
    console.log('[generate-ideas] Headers:', JSON.stringify(req.headers));
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, X-Requested-With');
    res.header('Access-Control-Max-Age', '86400');
    res.status(204).send();
    console.log('[generate-ideas] OPTIONS response sent with status 204');
});

const GENERIC_WRAP_TITLE_WORDS = new Set([
    'confetti', 'botanical', 'modern', 'lines', 'classic', 'elegant', 'festive', 'pattern', 'wrap', 'design',
]);

function isGenericWrapTitle(title) {
    const words = String(title || '').toLowerCase().split(/[\s\-–—]+/).filter(Boolean);
    if (words.length <= 2 && words.some((w) => GENERIC_WRAP_TITLE_WORDS.has(w))) return true;
    return words.length === 1 && GENERIC_WRAP_TITLE_WORDS.has(words[0]);
}

function sanitizeDesignIdeas(rawDesigns) {
    if (!Array.isArray(rawDesigns)) return [];
    return rawDesigns
        .map((d) => ({
            title: String(d?.title || '').trim(),
            description: String(d?.description || '').trim(),
        }))
        .filter((d) => d.title.length >= 8 && d.description.length >= 40 && !isGenericWrapTitle(d.title))
        .slice(0, 3);
}

function buildOccasionFallbackDesigns(occasion, productTitle) {
    const topic = String(occasion || 'gift').trim() || 'gift';
    const product = String(productTitle || '').trim();
    const productBit = product ? ` for ${product}` : '';
    const lo = topic.toLowerCase();
    if (/\bbirthday\b|\bturning\s+\d+|\b\d+(?:st|nd|rd|th)\b/.test(lo)) {
        return [
            {
                title: 'Midnight Galaxy Birthday',
                description: `Deep navy wrapping paper scattered with gold star clusters and tiny planet rings${productBit}. Playful but polished — a seamless repeat that feels celebratory without cartoon balloons.`,
            },
            {
                title: 'Confetti Streamer Parade',
                description: `Diagonal ribbon streamers in coral, teal, and butter yellow over a cream ground${productBit}. Energetic birthday motion with crisp edges and balanced white space for a premium look.`,
            },
            {
                title: 'Hand-Drawn Candle Glow',
                description: `Warm watercolor-style birthday candles and soft wax drips in peach and lilac on matte ivory${productBit}. Cozy, handmade feeling with subtle texture — ideal for an intimate celebration.`,
            },
        ];
    }
    if (/\bwedding\b|\bbridal\b|\banniversary\b|\bengagement\b/.test(lo)) {
        return [
            {
                title: 'Pressed Peony Garland',
                description: `Blush and ivory peony silhouettes linked by delicate gold vine lines${productBit}. Romantic and airy — a seamless floral repeat suited to formal gifting.`,
            },
            {
                title: 'Champagne Foil Toasts',
                description: `Champagne bubbles rising through soft taupe linen texture with muted gold foil accents${productBit}. Understated luxury without glitter overload.`,
            },
            {
                title: 'Monogram Wreath Frame',
                description: `Laurel wreath corners framing a blank center panel on warm white paper${productBit}. Classic wedding stationery energy translated into wrap — elegant negative space.`,
            },
        ];
    }
    if (/\bbaby\b|\bshower\b|\bnursery\b|\bnewborn\b/.test(lo)) {
        return [
            {
                title: 'Cloud and Star Lullaby',
                description: `Powder blue clouds with tiny brass stars on a soft grey ground${productBit}. Gentle nursery palette with a seamless, calming repeat.`,
            },
            {
                title: 'Woodland Critter Trail',
                description: `Tiny fox, fawn, and hedgehog footprints winding through sage and oatmeal tones${productBit}. Storybook charm with muted earth colors — not overly cute.`,
            },
            {
                title: 'Rainbow Arc Patchwork',
                description: `Rounded rainbow arcs in muted terracotta, mustard, and dusty rose on cream${productBit}. Modern baby aesthetic — playful geometry without primary-color chaos.`,
            },
        ];
    }
    if (/\bchristmas\b|\bholiday\b|\bhanukkah\b|\bwinter\b|\bkwanzaa\b/.test(lo)) {
        return [
            {
                title: 'Evergreen Plaid Glow',
                description: `Forest green and cranberry plaid with fine gold thread lines${productBit}. Cozy holiday warmth with a tailored, boutique feel.`,
            },
            {
                title: 'Snowflake Constellation',
                description: `Geometric snowflakes in ice blue and silver on deep midnight paper${productBit}. Wintry and crisp — high contrast without busy clutter.`,
            },
            {
                title: 'Citrus Pomander Spice',
                description: `Dried orange slices, cloves, and cinnamon stick motifs in burnt orange and brown${productBit}. Old-world holiday scent visual — artisan market vibe.`,
            },
        ];
    }
    if (/\bgraduation\b|\bgraduate\b|\bcommencement\b/.test(lo)) {
        return [
            {
                title: 'Cap Toss Horizon',
                description: `Tiny mortarboards drifting across a dawn gradient from navy to gold${productBit}. Aspirational and clean — celebrates achievement without clip-art.`,
            },
            {
                title: 'Laurel Achievement Band',
                description: `Interlocking laurel bands in emerald and antique gold on ivory${productBit}. Timeless academic honor styling with strong horizontal rhythm.`,
            },
            {
                title: 'Future Map Grid',
                description: `Subtle topographic map lines and compass roses in charcoal and sage${productBit}. Forward-looking, adventurous tone for a new chapter.`,
            },
        ];
    }
    return [
        {
            title: 'Watercolor Storybook Bloom',
            description: `Loose peony and eucalyptus washes in dusty rose and sage on textured cream paper${productBit}. Thoughtful, artisan wrap inspired by "${topic}" — soft edges, seamless floral repeat.`,
        },
        {
            title: 'Art Deco Fan Mosaic',
            description: `Fan-shaped geometric tiles in teal, brass, and blush forming a rhythmic pattern${productBit}. Bold but refined — tailored to "${topic}" with vintage glamour.`,
        },
        {
            title: 'Hand-Lettered Ribbon Script',
            description: `Flowing satin ribbon loops and subtle script curves (no readable words) in wine and gold on matte white${productBit}. Personal and celebratory for "${topic}" without literal text on the paper.`,
        },
    ];
}

app.post('/generate-ideas', async (req, res) => {
    // Set CORS headers IMMEDIATELY for ALL responses (including errors)
    const origin = req.headers.origin || '*';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, X-Requested-With');
    
    // Set a longer timeout for this endpoint (5 minutes for 3 image generations)
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000);
    
    console.log('[generate-ideas] POST request received. Origin:', origin);
    console.log('[generate-ideas] Request headers:', JSON.stringify(req.headers));
    
    if (!req.isApiDomain) {
        console.warn('[generate-ideas] Request not from api.wrrapd.com, hostname:', req.hostname);
        return res.status(403).json({ error: 'Access forbidden.' });
    }

    const { occasion, productTitle, retailer } = req.body;

    if (!occasion) {
        return res.status(400).json({ error: 'Occasion is required' });
    }

    try {
        const safeOccasion = String(occasion || 'gift').trim() || 'gift';
        const safeProduct = String(productTitle || '').trim();
        const safeRetailer = String(retailer || '').trim();
        console.log(`[generate-ideas] Received occasion: ${safeOccasion}`, {
            productTitle: safeProduct || '(none)',
            retailer: safeRetailer || '(none)',
        });

        // Step 1: Generate text descriptions using xAI Grok
        console.log('[generate-ideas] Generating design descriptions with Grok...');
        let designs = [];
        try {
            if (!grokClient.isConfigured()) {
                throw new Error('XAI_API_KEY is not configured');
            }
            const userBrief = [
                `Occasion / creative brief: ${safeOccasion}`,
                safeProduct ? `Product being wrapped: ${safeProduct}` : '',
                safeRetailer ? `Purchased from: ${safeRetailer}` : '',
                'Return exactly 3 distinct wrapping-paper concepts with evocative multi-word titles (never a single generic word like Confetti, Botanical, or Modern Lines).',
                'Each description must specify colors, motifs, layout, and mood in 2 vivid sentences suitable for a seamless gift-wrap repeat.',
                'Respond with JSON only: {"designs":[{"title":"...","description":"..."}]}',
            ].filter(Boolean).join('\n');

            const { content: rawContent } = await grokClient.chatCompletions({
                temperature: 0.85,
                max_tokens: 700,
                messages: [{
                    role: "system",
                    content: [
                        'You are an expert gift-wrap art director for Wrrapd.',
                        'Invent three premium, occasion-specific wrapping paper patterns a customer would proudly choose.',
                        'Titles must be 3–6 words, concrete and memorable — never "[Occasion] Confetti/Botanical/Modern Lines".',
                        'Descriptions must mention specific colors, shapes, and textures; avoid vague one-word themes.',
                        'Output valid JSON only with a designs array of title+description objects.',
                    ].join(' '),
                }, {
                    role: "user",
                    content: userBrief,
                }],
            });

            const designsData = grokClient.parseJsonContent(rawContent);
            designs = sanitizeDesignIdeas(designsData?.designs);
        } catch (grokError) {
            console.error('[generate-ideas] Grok structured output failed; using fallback text designs:', grokError.message);
        }

        if (!Array.isArray(designs) || designs.length < 3) {
            designs = buildOccasionFallbackDesigns(safeOccasion, safeProduct);
        }

        console.log(`[generate-ideas] Generated ${designs.length} design descriptions`);

        // Step 2: Generate images for each design using Stability AI
        const designsWithImages = [];
        
        for (let i = 0; i < designs.length; i++) {
            const design = designs[i];
            console.log(`[generate-ideas] Generating image ${i + 1}/3 for: ${design.title}`);
            
            try {
                // Create a refined prompt for Stability AI with "tileable" keyword
                const imagePrompt = `${design.description}. Tileable, seamless, repeating pattern for gift-wrapping paper. No text, no symbols, no gift boxes.`;
                
                console.log(`[generate-ideas] Stability AI prompt: ${imagePrompt.substring(0, 100)}...`);
                
                // Generate image using Stability AI Stable Image Core
                const stabilityApiKey = process.env.STABILITY_API_KEY;
                if (!stabilityApiKey) {
                    throw new Error('STABILITY_API_KEY not configured in .env file');
                }
                
                // Generate initial 1.5-megapixel image using Stable Image Core
                const formData = new FormData();
                formData.append('prompt', imagePrompt);
                formData.append('output_format', 'png');
                formData.append('mode', 'text-to-image');
                
                const generateResponse = await new Promise((resolve, reject) => {
                    const req = https.request({
                        hostname: 'api.stability.ai',
                        path: '/v2beta/stable-image/generate/core',
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${stabilityApiKey}`,
                            'Accept': 'application/json',
                            ...formData.getHeaders()
                        }
                    }, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            try {
                                if (res.statusCode === 200) {
                                    const parsed = JSON.parse(data);
                                    resolve({ status: 200, data: parsed });
                                } else {
                                    console.error(`[generate-ideas] Stability AI error response: ${data}`);
                                    reject(new Error(`Stability AI generation failed: ${res.statusCode} ${data.substring(0, 200)}`));
                                }
                            } catch (parseError) {
                                reject(new Error(`Failed to parse Stability AI response: ${parseError.message}`));
                            }
                        });
                    });
                    req.on('error', (error) => {
                        console.error(`[generate-ideas] Stability AI request error:`, error);
                        reject(error);
                    });
                    req.setTimeout(120000, () => {
                        req.destroy();
                        reject(new Error('Stability AI request timeout'));
                    });
                    formData.pipe(req);
                });

                // Get the image from response - Stable Image Core returns base64
                let imageBase64;
                if (generateResponse.data && generateResponse.data.image) {
                    imageBase64 = generateResponse.data.image;
                } else if (generateResponse.data && generateResponse.data.artifacts && generateResponse.data.artifacts[0]) {
                    // Alternative response format
                    imageBase64 = generateResponse.data.artifacts[0].base64;
                } else {
                    console.error(`[generate-ideas] Unexpected Stability AI response format:`, JSON.stringify(generateResponse.data).substring(0, 500));
                    throw new Error('No image returned from Stability AI - unexpected response format');
                }
                
                // Create data URL for display in extension
                const imageUrl = `data:image/png;base64,${imageBase64}`;
                
                console.log(`[generate-ideas] ✓ Image ${i + 1} generated (1.5MP) - will be upscaled when selected`);

                // Add imageUrl and base64 to the design (base64 needed for upscaling when selected)
                designsWithImages.push({
                    title: design.title,
                    description: design.description,
                    imageUrl: imageUrl,
                    imageBase64: imageBase64 // Store for upscaling when selected
                });

                // Small delay between image generations to avoid rate limits
                if (i < designs.length - 1) {
                    console.log('[generate-ideas] Waiting 2 seconds before next image...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

            } catch (imageError) {
                console.error(`[generate-ideas] Error generating image for design ${i + 1}:`, imageError);
                console.error(`[generate-ideas] Error stack:`, imageError.stack);
                // Still add the design without image if generation fails
                // This prevents the entire request from failing
                designsWithImages.push({
                    title: design.title,
                    description: design.description,
                    imageUrl: null,
                    imageBase64: null,
                    error: imageError.message
                });
            }
        }

        // Step 3: Return the response with images
        const responseData = {
            designs: designsWithImages
        };

        console.log(`[generate-ideas] Successfully generated ${designsWithImages.length} designs with images`);
        
        // Ensure CORS headers are set on success response
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, X-Requested-With');
        
        // Return double-stringified JSON (as expected by the extension)
        res.status(200).json(JSON.stringify(responseData));
        console.log('[generate-ideas] Response sent successfully');

    } catch (error) {
        console.error('[generate-ideas] Error generating design ideas:', error);
        console.error('[generate-ideas] Error message:', error.message);
        console.error('[generate-ideas] Error stack:', error.stack);
        
        // Ensure CORS headers are set on error response (CRITICAL - must be set before sending)
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, X-Requested-With');
        res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.status(500).json({ error: 'Failed to generate design ideas' });
    }
});


// Add the new upload URL generation endpoint
app.post('/api/get-upload-url', async (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).send('Access forbidden.');
    }

    const { filename, contentType, fileSize } = req.body;

    // Basic validation
    if (!filename || !contentType) {
        return res.status(400).json({ error: 'Missing filename or contentType' });
    }

    // Check that file is an image type
    const validContentTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validContentTypes.includes(contentType)) {
        return res.status(400).json({ error: 'Invalid content type. Only jpg, png, and webp are allowed.' });
    }

    // Check file size (5MB limit)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
    if (fileSize && fileSize > MAX_FILE_SIZE) {
        return res.status(400).json({ error: 'File size exceeds the 5MB limit.' });
    }

    // Use the provided filename directly without adding a timestamp
    const filePath = `designs/${filename}`;

    try {
        // Get a signed URL for uploading
        const [signedUrl] = await storage.bucket('wrrapd-media').file(filePath).getSignedUrl({
            version: 'v4',
            action: 'write',
            expires: Date.now() + 10 * 60 * 1000, // 10 minutes
            contentType: contentType,
            method: 'PUT',
        });

        // Return the URL and path to the client
        res.status(200).json({
            signedUrl,
            filePath
        });
    } catch (error) {
        console.error('Error generating signed URL:', error);
        res.status(500).json({ error: 'Failed to generate upload URL' });
    }
});

/** Plain-text sidecar next to each pattern image (same basename, .txt). */
function buildPatternDescriptionFileText({
    designTitle,
    designDescription,
    itemTitle,
    orderNumber,
    asin,
    index,
    prompt,
    shouldUpscale,
    isSelectedForOrder,
}) {
    const idx =
        index !== undefined && index !== null && index !== ''
            ? String(index)
            : 'N/A';
    return [
        designDescription ? String(designDescription).trim() : '(no description)',
        '',
        '---',
        `designTitle: ${designTitle}`,
        `itemTitle: ${itemTitle || 'N/A'}`,
        `orderNumber: ${orderNumber || 'N/A'}`,
        `asin: ${asin || 'N/A'}`,
        `optionIndex: ${idx}`,
        `prompt: ${prompt || 'N/A'}`,
        `upscaledForPrint: ${shouldUpscale ? 'yes' : 'no'}`,
        `selectedForOrder: ${isSelectedForOrder ? 'yes' : 'no'}`,
        `uploadedAt: ${new Date().toISOString()}`,
    ].join('\n');
}

async function savePatternTextSidecar(bucket, pngObjectPath, text) {
    const txtPath = pngObjectPath.replace(/\.png$/i, '.txt');
    await bucket.file(txtPath).save(Buffer.from(text, 'utf8'), {
        metadata: { contentType: 'text/plain; charset=utf-8' },
        resumable: false,
    });
    return txtPath;
}

// Handle OPTIONS preflight for /api/save-ai-design
app.options('/api/save-ai-design', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(204).send();
});

// Endpoint to save AI-generated design image to GCS
app.post('/api/save-ai-design', async (req, res) => {
    // Set CORS headers for all responses
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (!req.isApiDomain) {
        return res.status(403).send('Access forbidden.');
    }

    const {
        imageBase64,
        imageUrl,
        designTitle,
        designDescription,
        orderNumber,
        itemTitle,
        prompt,
        folder = 'designs',
        asin,
        index,
        shouldUpscale = false,
    } = req.body;

    if ((!imageBase64 && !imageUrl) || !designTitle) {
        return res.status(400).json({ error: 'Missing imageBase64/imageUrl or designTitle' });
    }

    try {
        console.log(`[save-ai-design] Saving design "${designTitle}"`);
        console.log(`[save-ai-design] Folder: ${folder}, OrderNumber: ${orderNumber || 'N/A'}, Upscale: ${shouldUpscale}`);

        let imageBuffer;
        let finalImageBase64 = imageBase64;

        // If this is the selected design, upscale it first using Fast Upscaler
        if (shouldUpscale && imageBase64) {
            console.log(`[save-ai-design] Upscaling selected design using Fast Upscaler...`);
            
            const stabilityApiKey = process.env.STABILITY_API_KEY;
            if (!stabilityApiKey) {
                console.warn(`[save-ai-design] STABILITY_API_KEY not configured, saving original image without upscaling`);
            } else {
                try {
                    const upscaleFormData = new FormData();
                    upscaleFormData.append('image', Buffer.from(imageBase64, 'base64'), {
                        filename: 'image.png',
                        contentType: 'image/png'
                    });

                    const upscaleResponse = await new Promise((resolve, reject) => {
                        const req = https.request({
                            hostname: 'api.stability.ai',
                            path: '/v2beta/stable-image/upscale/fast',
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${stabilityApiKey}`,
                                'Accept': 'application/json',
                                ...upscaleFormData.getHeaders()
                            }
                        }, (res) => {
                            let data = '';
                            res.on('data', chunk => data += chunk);
                            res.on('end', () => {
                                try {
                                    if (res.statusCode === 200) {
                                        const parsed = JSON.parse(data);
                                        resolve({ status: 200, data: parsed });
                                    } else {
                                        console.error(`[save-ai-design] Stability AI upscale error response (${res.statusCode}): ${data.substring(0, 500)}`);
                                        reject(new Error(`Stability AI upscale failed: ${res.statusCode} ${data.substring(0, 200)}`));
                                    }
                                } catch (parseError) {
                                    console.error(`[save-ai-design] Failed to parse upscale response: ${parseError.message}, data: ${data.substring(0, 200)}`);
                                    reject(new Error(`Failed to parse Stability AI upscale response: ${parseError.message}`));
                                }
                            });
                        });
                        req.on('error', (error) => {
                            console.error(`[save-ai-design] Stability AI upscale request error:`, error);
                            reject(error);
                        });
                        req.setTimeout(120000, () => {
                            req.destroy();
                            reject(new Error('Stability AI upscale request timeout'));
                        });
                        upscaleFormData.pipe(req);
                    });

                    // Get the upscaled image from response
                    if (upscaleResponse.data && upscaleResponse.data.image) {
                        finalImageBase64 = upscaleResponse.data.image;
                        console.log(`[save-ai-design] ✓ Design upscaled to 4x (up to 4MP)`);
                    } else {
                        console.error(`[save-ai-design] Unexpected upscale response format:`, JSON.stringify(upscaleResponse.data).substring(0, 500));
                        throw new Error('No image returned from Stability AI upscaler - unexpected response format');
                    }
                } catch (upscaleError) {
                    // If upscaling fails, log the error but continue with the original image
                    console.error(`[save-ai-design] Upscaling failed, saving original image instead:`, upscaleError.message);
                    console.error(`[save-ai-design] Upscale error stack:`, upscaleError.stack);
                    // Keep finalImageBase64 as the original imageBase64 (already set above)
                    // This allows the save to continue with the original 1.5MP image
                }
            }
        } else if (!finalImageBase64 && imageUrl) {
            // Fallback: Download from URL if base64 not provided (for backward compatibility)
            console.log(`[save-ai-design] Downloading image from URL (fallback)...`);
            const url = new URL(imageUrl);
            const client = url.protocol === 'https:' ? https : http;
            
            const downloadedBuffer = await new Promise((resolve, reject) => {
                client.get(url.href, (response) => {
                    if (response.statusCode !== 200) {
                        reject(new Error(`Failed to download image: ${response.statusCode} ${response.statusMessage}`));
                        return;
                    }
                    const chunks = [];
                    response.on('data', (chunk) => chunks.push(chunk));
                    response.on('end', () => resolve(Buffer.concat(chunks)));
                    response.on('error', reject);
                }).on('error', reject);
            });
            
            imageBuffer = downloadedBuffer;
        } else if (!finalImageBase64) {
            throw new Error('No image data provided (neither imageBase64 nor imageUrl)');
        }

        // Convert base64 to buffer if we have base64
        if (finalImageBase64 && !imageBuffer) {
            imageBuffer = Buffer.from(finalImageBase64, 'base64');
        }
        
        const contentType = 'image/png';
        const isUnusedSlot = typeof folder === 'string' && folder.includes('unused');
        const isSelectedForOrder = Boolean(
            orderNumber && asin && index !== undefined && index !== null,
        );

        // Every image lives under generated_patterns/all/ (+ unused subfolder for non-picks).
        // The customer's chosen wrap (upscaled when configured) is also copied to generated_patterns/for_print/.
        const archiveDir = isUnusedSlot
            ? 'generated_patterns/all/unused'
            : 'generated_patterns/all';

        let filename;
        if (orderNumber && asin && index !== undefined && index !== null) {
            const paddedIndex = String(index).padStart(2, '0');
            filename = `${orderNumber}-${asin}-${paddedIndex}.png`;
        } else {
            const timestamp = Date.now();
            const sanitizedTitle = designTitle.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            filename = `ai-design-${sanitizedTitle}-${timestamp}.png`;
        }

        const archivePngPath = `${archiveDir}/${filename}`;

        const bucket = storage.bucket('wrrapd-media');
        const descText = buildPatternDescriptionFileText({
            designTitle,
            designDescription,
            itemTitle,
            orderNumber,
            asin,
            index,
            prompt,
            shouldUpscale,
            isSelectedForOrder,
        });

        const pngCustomMeta = {
            designTitle,
            designDescription: designDescription || '',
            orderNumber: orderNumber || 'unused',
            itemTitle: itemTitle || 'N/A',
            asin: asin || 'N/A',
            prompt: prompt || 'N/A',
            source: 'stability-ai',
            upscaled: shouldUpscale ? 'true' : 'false',
            uploadedAt: new Date().toISOString(),
            isSelected: isSelectedForOrder ? 'true' : 'false',
            archivePath: archivePngPath,
        };

        let finalArchivePath = archivePngPath;
        let archiveFile = bucket.file(archivePngPath);

        try {
            await archiveFile.save(imageBuffer, {
                metadata: {
                    contentType: contentType,
                    metadata: pngCustomMeta,
                },
                resumable: false,
            });
        } catch (saveError) {
            if (saveError.message && saveError.message.includes('storage.objects.delete')) {
                console.warn(`[save-ai-design] Delete permission error detected, using unique filename instead...`);
                const timestamp = Date.now();
                const pathParts = archivePngPath.split('/');
                const fileNameParts = pathParts[pathParts.length - 1].split('.');
                const baseName = fileNameParts[0];
                const extension = fileNameParts[1] || 'png';
                finalArchivePath = `${pathParts.slice(0, -1).join('/')}/${baseName}-${timestamp}.${extension}`;
                archiveFile = bucket.file(finalArchivePath);
                await archiveFile.save(imageBuffer, {
                    metadata: {
                        contentType: contentType,
                        metadata: { ...pngCustomMeta, archivePath: finalArchivePath },
                    },
                    resumable: false,
                });
                console.log(`[save-ai-design] Saved with unique filename: ${finalArchivePath}`);
            } else {
                throw saveError;
            }
        }

        const archiveTxtPath = await savePatternTextSidecar(
            bucket,
            finalArchivePath,
            descText,
        );

        let forPrintPath = null;
        let forPrintTxtPath = null;
        if (isSelectedForOrder) {
            const baseName = path.posix.basename(finalArchivePath);
            forPrintPath = `generated_patterns/for_print/${baseName}`;
            const forPrintFile = bucket.file(forPrintPath);
            await forPrintFile.save(imageBuffer, {
                metadata: {
                    contentType: contentType,
                    metadata: {
                        ...pngCustomMeta,
                        archivePath: finalArchivePath,
                        forPrintPath,
                    },
                },
                resumable: false,
            });
            forPrintTxtPath = await savePatternTextSidecar(bucket, forPrintPath, descText);
        }

        const primaryFile = isSelectedForOrder
            ? bucket.file(forPrintPath)
            : archiveFile;
        const primaryPath = isSelectedForOrder ? forPrintPath : finalArchivePath;

        const [signedUrl] = await primaryFile.getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });

        console.log(
            `[save-ai-design] archive=${finalArchivePath} txt=${archiveTxtPath}` +
                (forPrintPath ? ` for_print=${forPrintPath} txt=${forPrintTxtPath}` : ''),
        );

        res.status(200).json({
            success: true,
            filePath: primaryPath,
            archivePath: finalArchivePath,
            archiveTxtPath,
            forPrintPath: forPrintPath || undefined,
            forPrintTxtPath: forPrintTxtPath || undefined,
            publicUrl: signedUrl,
        });

    } catch (error) {
        console.error('[save-ai-design] Error saving AI design:', error);
        console.error('[save-ai-design] Error message:', error.message);
        console.error('[save-ai-design] Error stack:', error.stack);
        // Ensure CORS headers are set even on error
        res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.status(500).json({ 
            error: 'Failed to save AI design image',
            details: error.message 
        });
    }
});

app.get('/flowers.json', (req, res) => {
    if (!req.isApiDomain) return res.status(403).send('Access forbidden.');
    
    const filePath = path.join(__dirname, 'data/flowers.json');
    res.sendFile(filePath);
});

// Endpoint to store Final shipping address (called directly from checkout.html)
app.post('/api/store-final-shipping-address', (req, res) => {
    // Set CORS headers
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (!req.isApiDomain) {
        return res.status(403).send('Access forbidden.');
    }
    
    const { orderNumber, finalShippingAddress } = req.body;
    
    if (!orderNumber || !finalShippingAddress) {
        return res.status(400).json({ error: 'Missing orderNumber or finalShippingAddress' });
    }
    
    // Store in a simple in-memory cache (or you could use Redis/database)
    // This will be retrieved when process-payment is called
    if (!global.finalShippingAddresses) {
        global.finalShippingAddresses = {};
    }
    
    global.finalShippingAddresses[orderNumber] = finalShippingAddress;
    persistPendingFinalShippingToDisk(orderNumber, finalShippingAddress);
    console.log(`[API] Stored Final shipping address for order ${orderNumber} (memory + disk)`);
    
    res.status(200).json({ success: true });
});

// Endpoint to get allowed zip codes
app.get('/api/allowed-zip-codes', (req, res) => {
    // Allow CORS for this endpoint (needed for checkout.html + extension)
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Cache-Control', 'no-store');
    res.header('Content-Type', 'application/json');
    try {
        const data = allowedZipCodesLib.loadAllowedZipCodes();
        res.status(200).json({
            allowedZipCodes: data.allowedZipCodes,
            count: data.allowedZipCodes.length,
            updatedAt: data.updatedAt,
        });
    } catch (e) {
        console.error('[API] allowed-zip-codes failed', e);
        res.status(500).json({ error: 'Failed to load zip codes' });
    }
});

// Also serve it as a static file for direct access
app.get('/data/allowed-zip-codes.json', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Content-Type', 'application/json');
    res.header('Cache-Control', 'no-store');
    try {
        const data = allowedZipCodesLib.loadAllowedZipCodes();
        res.status(200).json({
            allowedZipCodes: data.allowedZipCodes,
            count: data.allowedZipCodes.length,
            updatedAt: data.updatedAt,
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load zip codes' });
    }
});

// Endpoint to get valid addresses for dropdown
app.get('/api/valid-addresses', (req, res) => {
    // Set CORS headers
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (!req.isApiDomain) {
        return res.status(403).send('Access forbidden.');
    }
    
    // TODO: Replace this with actual address directory from database or file
    // For now, return a sample structure - you'll need to populate this with your valid addresses
    // This should be a comprehensive list of all valid addresses where Wrrapd can deliver
    const validAddresses = [
        // Example addresses - replace with your actual valid address directory
        // Format: { line1: 'Street Address', city: 'City', state: 'State Code', postalCode: 'ZIP', country: 'US' }
        { line1: '123 ABRACADABRA LN', city: 'JACKSONVILLE', state: 'FL', postalCode: '32222', country: 'US' },
        { line1: '117 W DUVAL ST STE 300', city: 'JACKSONVILLE', state: 'FL', postalCode: '32202', country: 'US' },
        // Add more valid addresses here from your directory
    ];
    
    res.status(200).json(validAddresses);
});

function facebookAdminHost(req) {
    if (req.isApiDomain) return true;
    return req.hostname === 'localhost' || req.hostname === '127.0.0.1';
}

app.get('/api/admin/facebook/status', (req, res) => {
    if (!facebookAdminHost(req)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    res.json(facebookScheduler.status());
});

app.post('/api/admin/facebook/publish', (req, res) => {
    if (!facebookAdminHost(req)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!requireWrrapdAdminKey(req, res)) return;
    const preview = facebookScheduler.status();
    if (!req.body || req.body.publish !== true) {
        return res.json({ preview: true, ...preview });
    }
    if (!preview.nextPost) {
        return res.status(409).json({ error: 'No Facebook post is scheduled for today', ...preview });
    }
    if (preview.alreadyPostedToday) {
        return res.status(409).json({ error: 'Already posted today', lastPost: preview.lastPost });
    }
    if (!preview.ready) {
        return res.status(503).json({
            error: 'Set META_PAGE_ID, META_PAGE_ACCESS_TOKEN, and FACEBOOK_POST_ENABLED=true',
            configured: preview.configured,
            enabled: preview.enabled,
        });
    }
    facebookScheduler
        .publishSelected({
            ...preview.nextPost,
            dateKey: preview.today,
        })
        .then((result) => {
            res.json({ posted: true, facebookId: result.id, id: preview.nextPost.id });
        })
        .catch((err) => {
            console.error('[facebook] Manual publish failed:', err.message || err);
            res.status(502).json({ error: err.message || 'Publish failed' });
        });
});

// Health check endpoint for PM2 monitoring
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

/** Uptime-checked: 503 when scripts/backup-orders.sh has not succeeded in the last 3 hours. */
app.get('/health/backup', (req, res) => {
    let last = null;
    try {
        last = fs.readFileSync(path.join(__dirname, 'logs', 'last-backup-ok.txt'), 'utf8').trim();
    } catch (_) {
        last = null;
    }
    const ageMs = last ? Date.now() - Date.parse(last) : Infinity;
    const ok = Number.isFinite(ageMs) && ageMs < 3 * 60 * 60 * 1000;
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'stale', lastBackupAt: last });
});

// Handle uncaught errors to prevent server crashes
process.on('uncaughtException', (error) => {
    console.error('[SERVER] Uncaught Exception:', error);
    console.error('[SERVER] Stack:', error.stack);
    // Log to file if possible
    try {
        const errorLog = `[${new Date().toISOString()}] Uncaught Exception: ${error.message}\n${error.stack}\n\n`;
        fs.appendFileSync(path.join(__dirname, 'error.log'), errorLog);
    } catch (e) {
        console.error('[SERVER] Could not write to error.log:', e);
    }
    // Don't exit - keep server running, but log the error
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[SERVER] Unhandled Rejection at:', promise, 'reason:', reason);
    // Log to file if possible
    try {
        const errorLog = `[${new Date().toISOString()}] Unhandled Rejection: ${reason}\n${reason?.stack || ''}\n\n`;
        fs.appendFileSync(path.join(__dirname, 'error.log'), errorLog);
    } catch (e) {
        console.error('[SERVER] Could not write to error.log:', e);
    }
    // Don't exit - keep server running
});

// Handle SIGTERM gracefully (for PM2 restarts)
process.on('SIGTERM', () => {
    console.log('[SERVER] SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('[SERVER] Server closed');
        process.exit(0);
    });
});

// Monitor memory usage and log warnings
setInterval(() => {
    const memUsage = process.memoryUsage();
    const memMB = {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
    };
    
    // Warn if memory usage is high
    if (memMB.heapUsed > 400) {
        console.warn(`[SERVER] High memory usage: ${memMB.heapUsed}MB heap used, ${memMB.rss}MB RSS`);
    }
}, 60000); // Check every minute

const PORT = 8080;
const server = app.listen(PORT, () => {
    console.log(`[SERVER] Server running on port ${PORT}`);
    console.log(`[SERVER] CORS enabled for Amazon domains`);
    console.log(`[SERVER] OPTIONS handler configured for all routes`);
    console.log(`[SERVER] Health check available at /health`);
    console.log(`[SERVER] Facebook poster: Tue/Thu/Sat 10:15am America/New_York`);
    setInterval(() => {
        facebookScheduler.tick().catch((err) => {
            console.error('[facebook] tick error:', err.message || err);
        });
    }, 60000);
    facebookScheduler.tick().catch((err) => {
        console.error('[facebook] tick error:', err.message || err);
    });
    console.log(`[SERVER] Process PID: ${process.pid}`);
    // Signal to PM2 that server is ready
    if (process.send) {
        process.send('ready');
    }
});

// Set server timeout to 10 minutes (for long image generation)
server.timeout = 600000;
server.keepAliveTimeout = 65000; // Keep connections alive
server.headersTimeout = 66000; // Slightly longer than keepAliveTimeout

// Handle server errors
server.on('error', (error) => {
    console.error('[SERVER] Server error:', error);
    const errorLog = `[${new Date().toISOString()}] Server Error: ${error.message}\n${error.stack}\n\n`;
    try {
        fs.appendFileSync(path.join(__dirname, 'error.log'), errorLog);
    } catch (e) {
        // If we can't write to file, just log to console
        console.error('[SERVER] Could not write to error.log:', e);
    }
});

// Handle client connection errors
server.on('clientError', (error, socket) => {
    console.error('[SERVER] Client error:', error.message);
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
