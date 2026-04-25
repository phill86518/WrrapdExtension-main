require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const FormData = require('form-data');
const Mailgun = require('mailgun.js');
const OpenAI = require('openai');
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const https = require('https');
const http = require('http');
const wrrapdPricing = require(path.join(__dirname, 'lib', 'wrrapd-pricing'));

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

// Configure CORS to allow requests from Amazon domains
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'https://www.amazon.com',
            'https://www.amazon.ca',
            'https://www.amazon.co.uk',
            'https://www.amazon.de',
            'https://www.amazon.fr',
            'https://www.amazon.es',
            'https://www.amazon.it',
            'https://www.amazon.nl',
            'https://www.amazon.co.jp',
            'https://www.amazon.in',
            'https://www.amazon.com.au',
            'https://www.amazon.com.br',
            'https://www.amazon.mx'
        ];
        
        if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('amazon.com')) {
            callback(null, true);
        } else {
            callback(null, true); // Allow all for now, can restrict later
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With'],
    preflightContinue: false,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

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

app.get('/checkout', (req, res) => {
    if (!req.isPayDomain) {
        return res.status(403).send('Access forbidden.');
    }
    res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});

app.get('/checkout/lego', (req, res) => {
    if (!req.isPayDomain) {
        return res.status(403).send('Access forbidden.');
    }
    res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});

// Increase body size limit to handle large base64 images (50MB)
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

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
    if (smtpReadyForPay()) {
        const transporter = createPaySmtpTransport();
        return Promise.allSettled([
            transporter.sendMail({
                from: adminFrom,
                to: adminRecipients,
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
            to: adminRecipients,
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
            'o:tracking': true,
            ...(customerAttachments.length > 0 ? { inline: customerAttachments } : {}),
        }),
    ]);
}

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

app.use(express.static(path.join(__dirname, 'public')));

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
    const r = wrrapdPricing.resolveWrrapdUnitPrices(geo);
    res.status(200).json({
        ok: true,
        unitPrices: r.unitPrices,
        configVersion: r.configVersion,
        appliedRuleIds: r.appliedRuleIds,
        timeZone: r.timeZone,
    });
});

// Endpoint specific to api.wrrapd.com
app.post('/create-payment-intent', async (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).send('Access forbidden.');
    }

    const { total, orderNumber, pricingCart } = req.body || {};

    try {
        let amountCents;
        let pricingDebug = null;
        if (pricingCart != null && typeof pricingCart === 'object') {
            const cart = wrrapdPricing.sanitizePricingCartFromRequest(pricingCart);
            if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
                return res.status(400).json({ error: 'pricingCart.items required' });
            }
            const validated = wrrapdPricing.computeTotalCentsFromPricingCart(cart);
            if (!validated.ok) {
                return res.status(400).json({ error: validated.error || 'Invalid cart total' });
            }
            const subSum =
                validated.breakdown.giftWrapTotal +
                validated.breakdown.designAiTotal +
                validated.breakdown.designUploadTotal +
                validated.breakdown.flowersTotal;
            if (!Number.isFinite(subSum) || subSum <= 0) {
                return res.status(400).json({ error: 'Zero or invalid Wrrapd subtotal' });
            }
            amountCents = validated.cents;
            pricingDebug = {
                configVersion: validated.configVersion,
                appliedRuleIds: validated.appliedRuleIds,
                serverCents: amountCents,
            };
            if (total != null && total !== '') {
                const clientCents = Math.round(Number(total));
                if (Number.isFinite(clientCents) && Math.abs(clientCents - amountCents) > 1) {
                    return res.status(400).json({
                        error: 'Total does not match server pricing',
                        serverCents: amountCents,
                        clientCents,
                    });
                }
            }
        } else {
            const n = Math.round(Number(total));
            if (!Number.isFinite(n) || n <= 0) {
                return res.status(400).json({ error: 'Invalid total amount' });
            }
            amountCents = n;
        }

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

    const { total, orderNumber, customerEmail } = req.body;

    try {
        if (!total || total <= 0) {
            return res.status(400).json({ error: 'Invalid total amount' });
        }

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        unit_amount: total,
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
        res.status(500).json({ error: error.message || 'Failed to create Checkout Session' });
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
    'WRPD_SUBTOTAL_BEFORE_TAX',
    'WRPD_ESTIMATED_TAX',
    'WRPD_ORDER_TOTAL',
]);

function sanitizeMoneyField(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return Math.round(v * 100) / 100;
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
        const label = typeof row.label === 'string' ? row.label.trim().slice(0, 160) : '';
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

/** Canonical sales channel for saved JSON + tracking ingest (`name_of_retailer` mirrors this string). */
function normalizePayRetailer(body) {
    const raw =
        (body && typeof body.retailer === 'string' && body.retailer) ||
        (body && typeof body.name_of_retailer === 'string' && body.name_of_retailer) ||
        '';
    const lo = String(raw).trim().toLowerCase();
    if (lo === 'lego') return 'Lego';
    if (lo === 'target') return 'Target';
    return 'Amazon';
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
                amazonDeliveryDate: option.amazonDeliveryDate || item.amazonDeliveryDate || null,
                deliveryDate: option.deliveryDate || item.deliveryDate || null,
                estimatedDeliveryDate: option.estimatedDeliveryDate || item.estimatedDeliveryDate || null,
                arrivalDate: option.arrivalDate || item.arrivalDate || null,
                shippingDate: option.shippingDate || item.shippingDate || null,
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
            designSummary = row.selected_flower_design
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
            designLabel = row.selected_flower_design
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
            asin: row.asin || null,
            productTitle: row.title ? String(row.title).trim().slice(0, 200) : null,
            productImageUrl:
                row.imageUrl && (String(row.imageUrl).startsWith('http://') || String(row.imageUrl).startsWith('https://'))
                    ? String(row.imageUrl).trim()
                    : null,
            occasion: row.occasion ? String(row.occasion).trim() : null,
            designSummary,
            designLabel,
            designPreviewUrl,
            flowers: row.checkbox_flowers === true,
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
    /** Short invoice-style rows when checkout snapshot was not stored (no Amazon product titles). */
    const invoiceLines = lines.map((ln, idx) => {
        const raw =
            (ln.designLabel && String(ln.designLabel).trim()) ||
            (ln.designSummary && String(ln.designSummary).trim()) ||
            '';
        const detail = raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
        return {
            label: 'Gift wrap',
            detail: detail || `Gift ${idx + 1}`,
        };
    });
    return {
        orderNumber: data.orderNumber != null ? String(data.orderNumber) : null,
        timestamp: data.timestamp || null,
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
        blob.includes('wrrapd') ||
        (blob.includes('po box') && blob.includes('26067')) ||
        (blob.includes('32226') && blob.includes('jacksonville'))
    );
}

/** Normalize to { name, street, city, state, postalCode, country } for ingest + emails. */
function normalizeAddressShape(addr) {
    if (!addr || typeof addr !== 'object') return {};
    const street = String(addr.street || addr.line1 || '').trim();
    return {
        name: addr.name != null ? String(addr.name).trim() : '',
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
    return {
        name: typeof f.name === 'string' ? f.name : '',
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
 * Chrome extension (Amazon checkout): forwards order payloads to tracking ingest using server-side INGEST_API_KEY.
 * No secret in the browser — same env as process-payment.
 */
app.post('/api/proxy-tracking-ingest', async (req, res) => {
    if (!req.isApiDomain) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const orders = req.body && req.body.orders;
    if (!Array.isArray(orders) || orders.length === 0) {
        return res.status(400).json({ error: 'Expected JSON body: { orders: [ {...}, ... ] }' });
    }
    const results = [];
    for (let i = 0; i < orders.length; i++) {
        const payload = {
            ...orders[i],
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
        // Verify the PaymentIntent with Stripe
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status !== 'succeeded') {
            return res.status(400).json({ error: 'Payment not confirmed' });
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
                : 'Wrrapd PO BOX 26067, JACKSONVILLE, FL, 32226-6067, US';

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
                                ${item.selected_flower_design ? `<p><strong>Flower Design:</strong> ${item.selected_flower_design}</p>` : ''}
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
                    flowerDesign: it.selected_flower_design ? String(it.selected_flower_design) : '',
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
            };
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
            } else {
                const trackingRetailer = payRetailer === 'Target' ? 'Target' : 'Amazon';
                ingestPayload = {
                    ...ingestCommon,
                    retailer: trackingRetailer,
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
            }
            const ingestResult = await ingestOrderIntoTracking(ingestPayload);
            if (!ingestResult.ok) {
                nonBlockingWarnings.push(`tracking ingest failed: ${ingestResult.reason}`);
            } else {
                trackingIngestHandledNotifications = true;
            }
        }

        // Admin email template (legacy pay server path — only if tracking did not already notify)
        const adminEmailBody = `
            <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
                <h1 style="color: #333;">New Payment Received</h1>
                <p>A payment of <strong>$${amount}</strong> has been successfully processed.</p>
                <p><strong>Order Number:</strong> ${orderNumber}</p>
                
                <div style="margin: 20px 0; padding: 15px; background-color: #f2f2f2; border-radius: 5px;">
                    <h2 style="margin-top: 0; color: #333;">Customer Information</h2>
                    <p><strong>Name (Giftee):</strong> ${(trackingGifteeForEmail.name && String(trackingGifteeForEmail.name).trim()) || billingDetails?.name || 'N/A'}</p>
                    <p><strong>Email (Gifter):</strong> ${customerEmail}</p>
                    <p><strong>Phone (Gifter):</strong> ${customerPhone}</p>
                    ${
                        trackingGifteeForEmail && (trackingGifteeForEmail.street || trackingGifteeForEmail.line1)
                            ? `<p><strong>Delivery address (Giftee):</strong> ${trackingGifteeForEmail.name || 'N/A'}, ${trackingGifteeForEmail.street || trackingGifteeForEmail.line1 || 'N/A'}, ${trackingGifteeForEmail.city || 'N/A'}, ${trackingGifteeForEmail.state || 'N/A'} ${trackingGifteeForEmail.postalCode || 'N/A'}${trackingGifteeForEmail.country ? `, ${trackingGifteeForEmail.country}` : ''}</p>`
                            : ''
                    }
                    ${billingDetails && billingDetails.address && (!finalShippingAddressFromCheckout || 
                      (billingDetails.address.line1 !== finalShippingAddressFromCheckout.street?.split(',')[0]?.trim())) ? 
                      `<p><strong>Billing Address (Gifter):</strong> ${billingDetails.name || 'N/A'}, ${billingDetails.address.line1 || 'N/A'}${billingDetails.address.line2 ? ', ' + billingDetails.address.line2 : ''}, ${billingDetails.address.city || 'N/A'}, ${billingDetails.address.state || 'N/A'} ${billingDetails.address.postal_code || 'N/A'}, ${billingDetails.address.country || 'N/A'}</p>` : 
                      ''}
                </div>
                
                <h2 style="color: #333;">Order Items</h2>
                ${processedItems.map(item => item.adminRow).join('')}
            </div>
        `;
        
        // Customer email template
        const customerEmailBody = `
            <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
                <h1 style="color: #333;">Thank you for your order!</h1>
                <p>We've received your payment of <strong>$${amount}</strong>.</p>
                <p><strong>Order Number:</strong> ${orderNumber}</p>
                
                <h2 style="color: #333;">Order Items</h2>
                ${processedItems.map(item => item.customerRow).join('')}
                
                <p>We'll start processing your order right away!</p>
                <p>If you have any questions, please don't hesitate to contact us.</p>
                <br>
                <p>Best regards,</p>
                <p>The Wrrapd Team</p>
            </div>
        `;

        // Legacy SMTP pair ("New order #…" / "Your Wrrapd Order Confirmation #…") — skip when tracking ingest
        // succeeded; Cloud Run already sent "New Wrrapd order …" + "Thank you — Wrrapd order …".
        if (!trackingIngestHandledNotifications) {
            const emailResults = await sendProcessPaymentPairEmails({
                adminRecipients: ['angel@wrrapd.com', 'admin@wrrapd.com'],
                adminFrom:
                    (smtpReadyForPay() && process.env.SMTP_FROM_ADMIN?.trim()) ||
                    'Wrrapd <noreply@wrrapd.com>',
                adminSubject: `New order #${orderNumber}`,
                adminHtml: adminEmailBody,
                adminAttachments,
                customerTo: customerEmail,
                customerFrom:
                    (smtpReadyForPay() && process.env.SMTP_FROM_CUSTOMER?.trim()) ||
                    'Wrrapd Orders <orders@wrrapd.com>',
                customerSubject: `Your Wrrapd Order Confirmation #${orderNumber}`,
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

// Updated /generate-ideas endpoint for server.js
// Replace the existing endpoint (lines 501-570 approximately) with this code

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

    const { occasion } = req.body;

    if (!occasion) {
        return res.status(400).json({ error: 'Occasion is required' });
    }

    try {
	            console.log(`[generate-ideas] Received occasion: ${occasion}`);

	            // Step 1: Generate text descriptions using GPT-4o
        console.log('[generate-ideas] Generating design descriptions...');
        let designs = [];
        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{
                    role: "system",
                    content: "You are a creative gift wrapping designer. Generate 3 unique wrapping paper design ideas. Keep each description brief and impactful - maximum two short sentences per design."
                }, {
                    role: "user",
                    content: `Generate 3 concise wrapping paper designs for this occasion: ${occasion}`
                }],
                temperature: 0.7,
                max_tokens: 200,
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: "wrapping_paper_designs",
                        schema: {
                            type: "object",
                            properties: {
                                designs: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            title: {
                                                type: "string",
                                                description: "A short, catchy title for the wrapping paper design"
                                            },
                                            description: {
                                                type: "string",
                                                description: "A detailed description of the wrapping paper design"
                                            }
                                        },
                                        required: ["title", "description"],
                                        additionalProperties: false
                                    }
                                }
                            },
                            required: ["designs"],
                            additionalProperties: false
                        },
                        strict: true
                    }
                }
            });

            const rawContent = completion?.choices?.[0]?.message?.content;
            if (typeof rawContent !== 'string' || !rawContent.trim()) {
                throw new Error('OpenAI returned empty structured content');
            }
            const designsData = JSON.parse(rawContent);
            designs = Array.isArray(designsData?.designs) ? designsData.designs : [];
        } catch (openAiError) {
            console.error('[generate-ideas] OpenAI structured output failed; using fallback text designs:', openAiError.message);
        }

        // Always return useful choices even when OpenAI structured output is unavailable.
        if (!Array.isArray(designs) || designs.length === 0) {
            const safeOccasion = String(occasion || 'gift').trim() || 'gift';
            designs = [
                {
                    title: `${safeOccasion} Confetti`,
                    description: `Playful repeating confetti and ribbon motifs inspired by ${safeOccasion}. Balanced colors, clean shapes, seamless pattern.`
                },
                {
                    title: `${safeOccasion} Botanical`,
                    description: `Soft floral and leaf geometry themed for ${safeOccasion}. Elegant spacing, subtle contrast, seamless wrapping-paper texture.`
                },
                {
                    title: `${safeOccasion} Modern Lines`,
                    description: `Modern abstract lines and geometric accents for ${safeOccasion}. Contemporary palette, high legibility, seamless repeat.`
                }
            ];
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
    // Allow CORS for this endpoint (needed for checkout.html)
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Content-Type', 'application/json');
    
    const filePath = path.join(__dirname, 'data/allowed-zip-codes.json');
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
        console.error('[API] allowed-zip-codes.json not found at:', filePath);
        return res.status(404).json({ error: 'Zip codes file not found' });
    }
    
    res.sendFile(filePath);
});

// Also serve it as a static file for direct access
app.get('/data/allowed-zip-codes.json', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Content-Type', 'application/json');
    
    const filePath = path.join(__dirname, 'data/allowed-zip-codes.json');
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Zip codes file not found' });
    }
    
    res.sendFile(filePath);
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

// Health check endpoint for PM2 monitoring
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
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
