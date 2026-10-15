/**
 * "We buy it for you" — public routes for wrrapd.com/buy/ and pay.wrrapd.com/buy/pay, and admin
 * routes for Command Center → We buy it. New routes only; existing routes are untouched.
 */
const path = require('path');
const store = require('./store');
const config = require('./config');
const resolveLink = require('./resolve-link');
const categories = require('./categories');
const retailers = require('./retailers');
const salesTax = require('../sales-tax-zip');
const terms = require('./terms');
const billing = require('./billing');
const quotes = require('./quotes');
const workflows = require('./workflows');
const runner = require('./runner');
const emails = require('./emails');
const flowerCatalog = require('../flowers/catalog');
const extensionConfig = require('../extension-config');
const { rateLimit } = require('../rate-limit');
const lineFacts = require('./line-facts');
const manual = require('./manual');

const INGEST_TAG = 'ingest-v2026-10-13-buy-for-you';
const BATCH_TTL_MS = 24 * 60 * 60 * 1000;
const CART_URL = 'https://www.wrrapd.com/buy/';
const APPROVE_URL = 'https://pay.wrrapd.com/buy/approve';
const REFRESH_VALID_MS = 10 * 60 * 1000;
const CHARGE_LOCK_MS = 2 * 60 * 1000;
const RETURN_DAYS = config.RETURN_WINDOW_DAYS;

const REASON_TEXT = {
    retailer_not_supported: 'Please paste a link from one of the stores listed.',
    not_a_product_page: 'Please paste the link to a single product page.',
    product_list: 'This link opens a list of items. Paste the link to one product.',
    not_a_link: 'Please paste a product link.',
    too_long: 'Please paste a product link.',
    duplicate: 'This item is already on your list.',
};

function cleanText(v, max) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanZip(v) {
    return String(v || '').replace(/\D/g, '').slice(0, 5);
}

function cleanPath(v) {
    const s = String(v || '').trim();
    return /^[A-Za-z0-9_\-./]{3,200}$/.test(s) && !s.includes('..') ? s : '';
}

function etParts(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZoneName: 'shortOffset',
    }).formatToParts(date);
    const get = (t) => (parts.find((p) => p.type === t) || {}).value;
    const off = (get('timeZoneName') || 'GMT-5').match(/GMT([+-]\d+)(?::(\d+))?/);
    const offsetMin = off ? Number(off[1]) * 60 + Math.sign(Number(off[1])) * Number(off[2] || 0) : -300;
    return { ymd: `${get('year')}-${get('month')}-${get('day')}`, offsetMin };
}

/** Last moment to ask for a return: 11:59:59 p.m. Eastern on the 15th calendar day after delivery. */
function returnDeadline(deliveredAtIso) {
    const t = Date.parse(deliveredAtIso || '');
    if (!Number.isFinite(t)) return null;
    const { ymd } = etParts(new Date(t));
    const [y, m, d] = ymd.split('-').map(Number);
    const noonUtc = new Date(Date.UTC(y, m - 1, d + RETURN_DAYS, 12));
    const { offsetMin } = etParts(noonUtc);
    const deadline = new Date(Date.UTC(y, m - 1, d + RETURN_DAYS, 23, 59, 59, 999) - offsetMin * 60000);
    return deadline.toISOString();
}

function lineQty(l) {
    return lineFacts.clampQty(l && l.qty);
}

/** An open cart expires a day after it starts, or a day after Wrrapd adds an item by hand. */
function openExpired(b, now = Date.now()) {
    const since = Math.max(Date.parse(b.createdAt) || 0, Date.parse(b.reopenedAt || '') || 0);
    return b.status === 'open' && now - since > BATCH_TTL_MS;
}

function shopperLink(base, b, extra) {
    const q = new URLSearchParams({ b: b.id, t: b.token, ...(extra || {}) });
    return `${base}?${q.toString()}`;
}

function sameLine(line, parsed, raw) {
    if (!line || line.removed) return false;
    if (parsed.ok && line.canonicalUrl && line.canonicalUrl === parsed.canonicalUrl) return true;
    const theirs = retailers.normalizeUrl(parsed.ok ? parsed.url : raw);
    return theirs && retailers.normalizeUrl(line.url) === theirs;
}

function hideExcludedTwins(lines, keep) {
    const key = retailers.normalizeUrl(keep.url);
    for (const other of lines) {
        if (other === keep || other.removed || other.state !== 'unavailable') continue;
        if (retailers.normalizeUrl(other.url) === key) other.removed = true;
    }
}

function countedItemCents(batch, retailer) {
    return (batch.lines || [])
        .filter((l) => l.retailer === retailer && !l.removed && l.state !== 'unavailable')
        .reduce((sum, l) => sum + ((l.product && l.product.pagePriceCents) || 0) * lineQty(l), 0);
}

/** Target's "ships free" line is free on a $35 order. Under that, it is not a $0 charge. */
function presentShip(batch, l, ship) {
    if (!ship || l.retailer !== 'target' || ship.cents !== 0) return ship;
    if (countedItemCents(batch, l.retailer) >= 3500) return ship;
    return { cents: null, arrivalDate: ship.arrivalDate || null, note: ship.note || 'Free on orders over $35' };
}

function publicLine(l, batch) {
    const p = l.product || null;
    const rawShip = p && p.standardShip && (p.standardShip.cents != null || p.standardShip.arrivalDate)
        ? { cents: p.standardShip.cents, arrivalDate: p.standardShip.arrivalDate || null, note: p.standardShip.note || '' }
        : (p && p.pageOffer && p.pageOffer.shippingOptions && p.pageOffer.shippingOptions[0]
            ? { cents: p.pageOffer.shippingOptions[0].cents, arrivalDate: p.pageOffer.shippingOptions[0].arrivalDate || null, note: '' }
            : null);
    return {
        id: l.id,
        url: l.url,
        retailer: l.retailer,
        retailerName: l.retailerName,
        state: l.removed ? 'removed' : l.state,
        message: l.state === 'unavailable' ? l.message || quotes.UNAVAILABLE : '',
        reason: l.state === 'unavailable' ? l.reason || '' : '',
        product: p
            ? {
                  title: p.title || '',
                  imageUrl: p.imageUrl || '',
                  isElectronics: p.isElectronics === true,
                  pagePriceCents: p.pagePriceCents || null,
                  standardShip: presentShip(batch, l, rawShip),
                  variantGroups: l.state === 'needs_variant' ? p.variantGroups || [] : [],
              }
            : null,
        variantLabel: l.variantLabel || '',
        qty: lineQty(l),
        wrap: l.wrap || null,
        manual: manual.shopperState(l),
    };
}

function publicGroup(g, batch) {
    const ready = g.state === 'ready' && g.quote;
    return {
        retailer: g.retailer,
        retailerName: g.retailerName,
        state: g.state,
        itemPrices: ready ? g.quote.itemPrices : {},
        shippingOptions: ready ? g.quote.shippingOptions.map((o) => ({ id: o.id, label: o.label, cents: o.cents, arrivalDate: o.arrivalDate })) : [],
        selectedShippingId: ready ? (billing.selectedOption(g) || {}).id || null : null,
        taxCents: ready ? billing.groupTax(g, billing.selectedOption(g)) : null,
        quotedAt: ready ? g.quote.at : null,
        lineIds: batch.lines.filter((l) => l.retailer === g.retailer && !l.removed).map((l) => l.id),
    };
}

function publicView(batch) {
    const cfg = config.load();
    const bill = batch.status === 'open' ? billing.computeBill(batch, cfg) : null;
    return {
        id: batch.id,
        status: batch.status,
        gifteeZip: batch.gifteeZip,
        hubCity: batch.hub ? `${batch.hub.city}, ${batch.hub.state}` : '',
        lines: batch.lines.map((l) => publicLine(l, batch)),
        groups: Object.values(batch.groups || {}).map((g) => publicGroup(g, batch)),
        termsAccepted: !!(batch.terms && batch.terms.version === terms.VERSION),
        electronicsAccepted: !!(batch.terms && batch.terms.electronicsAccepted),
        refresh: batch.refresh
            ? {
                  id: batch.refresh.id,
                  state: batch.refresh.state,
                  changes: batch.refresh.changes.map((c) => c.text),
                  changed: !!batch.refresh.changed,
                  billHash: batch.refresh.billHash || null,
                  doneAt: batch.refresh.doneAt || null,
                  error: batch.refresh.billError || null,
              }
            : null,
        bill: bill && bill.ok ? bill.bill : null,
        billError: bill && !bill.ok ? bill.message || bill.error : null,
        limits: { merchandiseCapCents: cfg.merchandiseCapCents, perItemCapCents: cfg.perItemCapCents },
        wrapPrices: billing.wrapPrices(batch),
        salesTaxPercent: (() => {
            const zip = batch.hub && (batch.hub.postalCode || batch.hub.zip);
            const percent = salesTax.getCombinedRateAsTaxPercent(zip);
            return percent == null ? 7.5 : percent;
        })(),
        orderNumber: batch.status === 'paid' || batch.status === 'closed' ? batch.id : null,
        paidBill: batch.paidBill || null,
        manualPending: batch.lines.some((l) => !l.removed && l.manual && (l.manual.state === 'requested' || l.manual.state === 'awaiting_approval')),
    };
}

function lineAllocation(paidBill, lineId) {
    const w = paidBill.wrap;
    const pl = w.perLine[lineId] || { wrapBaseCents: 0, wrapDiscountCents: 0, designCents: 0, boxCents: 0, flowersCents: 0 };
    const service = pl.wrapBaseCents - pl.wrapDiscountCents + pl.designCents + pl.boxCents + pl.flowersCents;
    const serviceAll = Object.values(w.perLine).reduce((s, x) => s + x.wrapBaseCents - x.wrapDiscountCents + x.designCents + x.boxCents + x.flowersCents, 0);
    const serviceTax = serviceAll > 0 ? Math.round((w.serviceTaxCents * service) / serviceAll) : 0;
    let merch = 0;
    let shipShare = 0;
    let taxShare = 0;
    for (const g of paidBill.groups) {
        const it = g.items.find((i) => i.lineId === lineId);
        if (!it) continue;
        merch = it.cents;
        const groupItems = g.items.reduce((s, i) => s + i.cents, 0);
        taxShare = groupItems > 0 ? Math.round((g.taxCents * it.cents) / groupItems) : 0;
        shipShare = groupItems > 0 ? Math.round((g.shipping.cents * it.cents) / groupItems) : 0;
    }
    return { merchCents: merch, retailerTaxCents: taxShare, shippingCents: shipShare, serviceCents: service, serviceTaxCents: serviceTax, flowersCents: pl.flowersCents, wrapCents: service - pl.flowersCents };
}

function refundedCents(batch) {
    return (batch.refunds || []).filter((r) => r.ok).reduce((s, r) => s + r.amountCents, 0);
}

module.exports = function mountBuyForYou(app, deps) {
    const {
        helcim,
        ingestOrderIntoTracking,
        requireWrrapdAdminKey,
        clientIpForHelcim,
        helcimBillingFromClient,
        wrrapdIsoFromRetailerYmd,
        sendMail,
        publicWrrapdMediaUrl,
        normalizeCustomerEmail,
        getOrCreateWrrapdCustomerId,
        deliveryHubs,
        allowedZipCodesLib,
    } = deps;

    const commandCenterBase = () => {
        const explicit = String(process.env.COMMAND_CENTER_URL || '').trim();
        if (explicit) return explicit.replace(/\/$/, '');
        try {
            return new URL(process.env.TRACKING_INGEST_URL || '').origin;
        } catch (_) {
            return '';
        }
    };

    quotes.setAlert(async (kind, batch, retailerId) => {
        const cfg = config.load();
        const lines = batch.lines.filter((l) => (!retailerId || l.retailer === retailerId) && !l.removed && l.state !== 'unavailable');
        const titles = {
            quote_needed: `Quote desk: ${retailers.byId(retailerId)?.name || retailerId} cost page needed${batch.refresh && batch.refresh.state === 'running' ? ' (shopper is paying now)' : ''}`,
            paid: `We buy it: paid order ${batch.id} is ready to place`,
        };
        await sendMail({
            to: cfg.teamAlertEmails,
            subject: titles[kind] || `We buy it: ${kind}`,
            html: emails.teamAlertHtml({ title: titles[kind] || kind, batch, lines, link: `${commandCenterBase()}/admin/buy-for-you/${batch.id}` }),
        }).catch((e) => console.warn('[buy] team alert failed', e && e.message));
    });

    const api = (req, res) => {
        if (!req.isApiDomain) {
            res.status(403).json({ error: 'Forbidden' });
            return false;
        }
        res.set('Cache-Control', 'no-store');
        return true;
    };

    const loadForShopper = (req, res) => {
        const id = String(req.params.id || '');
        const token = String((req.body && req.body.t) || req.query.t || '');
        const batch = store.read(id);
        if (!batch || !store.tokenMatches(batch, token)) {
            res.status(404).json({ error: 'We could not find this order. Please start again.' });
            return null;
        }
        if (openExpired(batch)) {
            res.status(410).json({ error: 'This page has expired. Please start again.' });
            return null;
        }
        return batch;
    };

    const createLimiter = rateLimit({ name: 'buy-create', windowMs: 10 * 60 * 1000, max: 20 });
    const chargeLimiter = rateLimit({ name: 'buy-charge', windowMs: 10 * 60 * 1000, max: 10 });

    app.get('/api/buy/config', (req, res) => {
        if (!api(req, res)) return;
        const pub = config.publicConfig(req.query.preview);
        res.json({ ok: true, ...pub, occasions: extensionConfig.OCCASIONS });
    });

    app.get('/api/buy/terms', (req, res) => {
        if (!api(req, res)) return;
        res.json({ ok: true, ...terms.publicTerms() });
    });

    app.post('/api/buy/batches', createLimiter, async (req, res) => {
        if (!api(req, res)) return;
        const body = req.body || {};
        if (!config.openFor(body.preview)) return res.status(403).json({ error: 'This page is not open yet.' });
        const cfg = config.load();
        const zip = cleanZip(body.gifteeZip);
        if (zip.length !== 5) return res.status(400).json({ error: 'Please enter the giftee’s 5-digit ZIP code.' });
        if (!allowedZipCodesLib.isZipAllowed(zip)) {
            return res.status(400).json({ error: 'We are sorry. We do not deliver to this ZIP code yet.', code: 'zip_not_served' });
        }
        const hub = deliveryHubs.publicHubForZip(zip).hub;
        if (!hub) return res.status(503).json({ error: 'Please try again in a moment.' });
        const raw = (Array.isArray(body.links) ? body.links : []).map((s) => String(s || '').trim()).filter(Boolean);
        if (!raw.length) return res.status(400).json({ error: 'Please paste at least one product link.' });
        if (raw.length > cfg.maxLinks) return res.status(400).json({ error: `Please paste up to ${cfg.maxLinks} links.` });
        const now = new Date().toISOString();
        const opened = await Promise.all(raw.map((text) => resolveLink.resolveLink(text, cfg.allowedRetailers)));
        const byUrl = new Map();
        const notices = [];
        const lines = [];
        opened.forEach((parsed, i) => {
            const text = raw[i];
            const named = retailers.byId(parsed.retailer);
            const base = { id: `L${lines.length + 1}`, addedAt: now, url: text.slice(0, 2000), qty: 1, wrap: null };
            const existing = [...byUrl.values()].find((l) => sameLine(l, parsed, text));
            if (!parsed.ok) {
                if (existing) {
                    notices.push('You already have this item.');
                    return;
                }
                const rejected = {
                    ...base,
                    retailer: parsed.retailer || 'none',
                    retailerName: named ? named.name : '',
                    state: 'unavailable',
                    reason: parsed.reason,
                    message: REASON_TEXT[parsed.reason] || quotes.UNAVAILABLE,
                };
                byUrl.set(retailers.normalizeUrl(text), rejected);
                lines.push(rejected);
                return;
            }
            if (existing && existing.state === 'unavailable') {
                existing.url = parsed.url;
                existing.canonicalUrl = parsed.canonicalUrl;
                existing.productId = parsed.productId;
                existing.retailer = parsed.retailer;
                existing.retailerName = parsed.retailerName;
                existing.state = 'reading';
                existing.reason = '';
                existing.message = '';
                byUrl.set(parsed.canonicalUrl, existing);
                return;
            }
            if (existing) {
                const bumped = lineFacts.bumpQty(existing.qty, 1);
                existing.qty = bumped.qty;
                notices.push(bumped.notice);
                return;
            }
            const line = { ...base, url: parsed.url, canonicalUrl: parsed.canonicalUrl, productId: parsed.productId, retailer: parsed.retailer, retailerName: parsed.retailerName, state: 'reading' };
            byUrl.set(parsed.canonicalUrl, line);
            lines.push(line);
        });
        const batch = store.create({
            status: 'open',
            gifteeZip: zip,
            hub,
            lines,
            groups: {},
            terms: null,
            refresh: null,
            refunds: [],
            placements: {},
            bundles: {},
            returns: {},
            client: { ip: clientIpForHelcim(req), ua: cleanText(req.get('user-agent'), 300) },
        });
        await store.update(batch.id, (b) => {
            for (const id of [...new Set(b.lines.filter((l) => l.state !== 'unavailable').map((l) => l.retailer))]) quotes.ensureGroup(b, id);
            store.addLog(b, 'shopper', `Started with ${raw.length} link(s) for ZIP ${zip}; hub ${hub.displayName}`);
            return b;
        });
        quotes.processBatch(batch.id).catch((e) => console.error('[buy] processBatch', e && e.message));
        res.status(201).json({ ok: true, id: batch.id, token: batch.token, notice: lineFacts.noticeFor(notices), batch: publicView(store.read(batch.id)) });
    });

    app.get('/api/buy/batches/:id', async (req, res) => {
        if (!api(req, res)) return;
        const batch = loadForShopper(req, res);
        if (!batch) return;
        const swept = await quotes.sweep(batch.id);
        const view = swept || store.read(batch.id);
        if (view && view.lines.some((l) => l.state === 'reading')) {
            quotes.processBatch(view.id).catch((e) => console.error('[buy] processBatch', e && e.message));
        }
        res.json({ ok: true, batch: publicView(view) });
    });

    const shopperChange = (handler) => async (req, res) => {
        if (!api(req, res)) return;
        const batch = loadForShopper(req, res);
        if (!batch) return;
        if (batch.status !== 'open') return res.status(409).json({ error: 'This order is already paid.' });
        if (batch.refresh && batch.refresh.state === 'running') return res.status(409).json({ error: 'Checking the latest prices. One moment, please.' });
        try {
            const out = await handler(req, batch);
            if (out && out.error) return res.status(out.status || 400).json({ error: out.error });
            res.json({ ok: true, notice: (out && out.notice) || '', batch: publicView(store.read(batch.id)) });
        } catch (e) {
            console.error('[buy] shopper change', e);
            res.status(500).json({ error: 'Something went wrong. Please try again.' });
        }
    };

    app.post(
        '/api/buy/batches/:id/variant',
        shopperChange(async (req, batch) => {
            const lineId = String(req.body.lineId || '');
            const choices = req.body.choices && typeof req.body.choices === 'object' ? req.body.choices : {};
            let err = null;
            await store.update(batch.id, (b) => {
                const l = b.lines.find((x) => x.id === lineId);
                if (!l || l.state !== 'needs_variant' || !l.product) {
                    err = 'Please refresh the page.';
                    return null;
                }
                const picked = [];
                for (const g of l.product.variantGroups) {
                    const v = String(choices[g.name] || '');
                    if (!g.options.includes(v)) {
                        err = `Please choose a ${g.name.toLowerCase()}.`;
                        return null;
                    }
                    picked.push(v);
                }
                l.variantLabel = picked.join(', ');
                l.state = 'quoting';
                const g = quotes.ensureGroup(b, l.retailer);
                if (g.state !== 'waiting') g.state = 'waiting';
                return b;
            });
            if (err) return { error: err };
            await quotes.kickGroups(batch.id, 'initial');
            return null;
        }),
    );

    app.post(
        '/api/buy/batches/:id/qty',
        shopperChange(async (req, batch) => {
            const lineId = String(req.body.lineId || '');
            const qty = Math.round(Number(req.body.qty));
            if (!Number.isInteger(qty) || qty < 1 || qty > lineFacts.MAX_QTY) return { error: 'Please enter a quantity from 1 to 10.' };
            let err = null;
            await store.update(batch.id, (b) => {
                const l = b.lines.find((x) => x.id === lineId);
                if (!l || l.removed || l.state === 'unavailable') {
                    err = 'Please refresh the page.';
                    return null;
                }
                l.qty = qty;
                store.addLog(b, 'shopper', `${l.id} quantity ${qty}`);
                return b;
            });
            return err ? { error: err } : null;
        }),
    );

    app.post(
        '/api/buy/batches/:id/remove',
        shopperChange(async (req, batch) => {
            const lineId = String(req.body.lineId || '');
            let regroup = null;
            await store.update(batch.id, (b) => {
                const l = b.lines.find((x) => x.id === lineId);
                if (!l || l.removed) return null;
                l.removed = true;
                const g = b.groups[l.retailer];
                if (g && quotes.activeLines(b, l.retailer).length) {
                    g.state = 'waiting';
                    regroup = l.retailer;
                } else if (g) g.state = 'empty';
                store.addLog(b, 'shopper', `Removed ${l.id}`);
                return b;
            });
            if (regroup) await quotes.kickGroups(batch.id, 'initial');
            return null;
        }),
    );

    app.post(
        '/api/buy/batches/:id/manual',
        shopperChange(async (req, batch) => {
            const lineId = String(req.body.lineId || '');
            const email = cleanText(req.body.email, 120).toLowerCase();
            const line = batch.lines.find((l) => l.id === lineId);
            if (!line || !manual.canAsk(line)) return { error: 'Please refresh the page.' };
            const onlyItem = manual.otherActive(batch, lineId) === 0;
            if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Please enter a valid email.' };
            if (onlyItem && !email) return { error: 'Please enter your email.' };
            let saved = null;
            await store.update(batch.id, (b) => {
                const l = b.lines.find((x) => x.id === lineId);
                if (!l || !manual.canAsk(l)) return null;
                l.manual = { state: 'requested', requestedAt: new Date().toISOString(), email, onlyItem };
                store.addLog(b, 'shopper', `Asked Wrrapd to add ${l.id} manually (${l.reason})`);
                saved = { b, l };
                return b;
            });
            if (!saved) return { error: 'Please refresh the page.' };
            sendMail({
                to: [manual.ADMIN_EMAIL],
                subject: `Add it manually: ${saved.l.retailerName || saved.l.retailer} item for order ${batch.id}`,
                html: emails.manualRequestHtml({ batch: saved.b, line: saved.l, email, onlyItem, link: `${commandCenterBase()}/admin/buy-for-you/manual` }),
            }).catch((e) => console.warn('[buy] manual request email failed', batch.id, e && e.message));
            return {
                notice: onlyItem
                    ? 'Thank you! We will email you when this item is ready in your cart.'
                    : 'Thank you! Please finish your order. We will add this item to it and email you to approve it.',
            };
        }),
    );

    app.post(
        '/api/buy/batches/:id/zip',
        shopperChange(async (req, batch) => {
            if (batch.terms) return { error: 'The ZIP code is set for this order.' };
            const zip = cleanZip(req.body && req.body.gifteeZip);
            if (zip.length !== 5) return { error: 'Please enter the giftee’s 5-digit ZIP code.' };
            if (!allowedZipCodesLib.isZipAllowed(zip)) {
                return { error: 'We are sorry. We do not deliver to this ZIP code yet.' };
            }
            const hub = deliveryHubs.publicHubForZip(zip).hub;
            if (!hub) return { error: 'Please try again in a moment.' };
            if (zip === batch.gifteeZip) return null;
            await store.update(batch.id, (b) => {
                b.gifteeZip = zip;
                b.hub = hub;
                for (const g of Object.values(b.groups || {})) {
                    if (g.state === 'empty' || g.state === 'unavailable') continue;
                    g.quote = null;
                    g.selectedShippingId = null;
                    g.state = 'waiting';
                }
                for (const l of b.lines) {
                    if (l.removed || l.state === 'unavailable' || l.state === 'reading' || l.state === 'needs_variant') continue;
                    l.state = 'quoting';
                }
                store.addLog(b, 'shopper', `Giftee ZIP changed to ${zip}; hub ${hub.displayName}`);
                return b;
            });
            await quotes.kickGroups(batch.id, 'zip');
            return null;
        }),
    );

    app.post(
        '/api/buy/batches/:id/link',
        shopperChange(async (req, batch) => {
            if (batch.terms) return { error: 'Items are set for this order.' };
            const cfg = config.load();
            const raw = (Array.isArray(req.body && req.body.links) ? req.body.links : [req.body && req.body.url])
                .map((s) => String(s || '').trim())
                .filter(Boolean);
            if (!raw.length) return { error: 'Please paste a product link.' };
            const opened = await Promise.all(raw.map((text) => resolveLink.resolveLink(text, cfg.allowedRetailers)));
            const openCount = batch.lines.filter((l) => !l.removed).length;
            const extra = opened.filter((parsed, i) => !batch.lines.some((l) => sameLine(l, parsed, raw[i]))).length;
            if (openCount + extra > cfg.maxLinks) return { error: `Please paste up to ${cfg.maxLinks} links.` };
            let added = 0;
            let revived = 0;
            const notices = [];
            await store.update(batch.id, (b) => {
                const now = new Date().toISOString();
                opened.forEach((parsed, i) => {
                    const text = raw[i];
                    const named = retailers.byId(parsed.retailer);
                    const id = `L${b.lines.length + 1}`;
                    const base = { id, addedAt: now, url: text.slice(0, 2000), qty: 1, wrap: null };
                    const existing = b.lines.find((l) => sameLine(l, parsed, text));
                    if (!parsed.ok) {
                        if (existing) {
                            notices.push('You already have this item.');
                            return;
                        }
                        b.lines.push({
                            ...base,
                            retailer: parsed.retailer || 'none',
                            retailerName: named ? named.name : '',
                            state: 'unavailable',
                            reason: parsed.reason,
                            message: REASON_TEXT[parsed.reason] || quotes.UNAVAILABLE,
                        });
                        added += 1;
                        return;
                    }
                    if (existing) {
                        const failed = existing.state === 'unavailable' || !existing.product;
                        if (failed) {
                            existing.state = 'reading';
                            existing.reason = '';
                            existing.message = '';
                            existing.readFailure = '';
                            existing.product = null;
                            existing.variantLabel = '';
                            existing.url = parsed.url;
                            existing.canonicalUrl = parsed.canonicalUrl;
                            existing.productId = parsed.productId;
                            existing.retailer = parsed.retailer;
                            existing.retailerName = parsed.retailerName;
                            existing.readStartedAt = now;
                            existing.readTries = (existing.readTries || 0) + 1;
                            for (const other of b.lines) {
                                if (!other.removed && other.reason === 'duplicate' && parsed.productId && String(other.url || '').includes(parsed.productId)) other.removed = true;
                            }
                            quotes.ensureGroup(b, parsed.retailer).state = 'waiting';
                            hideExcludedTwins(b.lines, existing);
                            revived += 1;
                            return;
                        }
                        const bumped = lineFacts.bumpQty(existing.qty, 1);
                        existing.qty = bumped.qty;
                        hideExcludedTwins(b.lines, existing);
                        notices.push(bumped.notice);
                        return;
                    }
                    b.lines.push({
                        ...base,
                        url: parsed.url,
                        canonicalUrl: parsed.canonicalUrl,
                        productId: parsed.productId,
                        retailer: parsed.retailer,
                        retailerName: parsed.retailerName,
                        state: 'reading',
                        readStartedAt: now,
                    });
                    quotes.ensureGroup(b, parsed.retailer).state = 'waiting';
                    added += 1;
                });
                if (!added && !revived && !notices.length) return null;
                store.addLog(b, 'shopper', notices.length && !added && !revived ? `Increased quantity for a repeated link` : revived && !added ? `Read ${revived} link(s) again` : `Added ${raw.length} link(s)`);
                return b;
            });
            if (!added && !revived && !notices.length) return { error: 'This item is already on your list.' };
            if (added || revived) quotes.processBatch(batch.id).catch((e) => console.error('[buy] processBatch', e && e.message));
            return notices.length ? { notice: lineFacts.noticeFor(notices) } : null;
        }),
    );

    app.post(
        '/api/buy/batches/:id/shipping',
        shopperChange(async (req, batch) => {
            const retailerId = String(req.body.retailer || '');
            const optionId = String(req.body.optionId || '');
            let err = null;
            await store.update(batch.id, (b) => {
                const g = b.groups[retailerId];
                if (!g || g.state !== 'ready' || !g.quote.shippingOptions.some((o) => o.id === optionId)) {
                    err = 'Please refresh the page.';
                    return null;
                }
                g.selectedShippingId = optionId;
                return b;
            });
            return err ? { error: err } : null;
        }),
    );

    app.post(
        '/api/buy/batches/:id/accept',
        shopperChange(async (req, batch) => {
            const body = req.body || {};
            if (String(body.version || '') !== terms.VERSION) return { error: 'Please read the latest Terms and agree again.' };
            if (body.scrolledToEnd !== true || body.agreed !== true) return { error: 'Please read the Terms to the end and agree.' };
            const ready = billing.readyLines(batch);
            if (!ready.length) return { error: 'Add at least one item we can buy.' };
            const needsElectronics = ready.some((l) => l.product && l.product.isElectronics);
            if (needsElectronics && body.electronicsAccepted !== true) return { error: 'Please accept the electronics sentence.' };
            const email = cleanText(body.email, 120);
            await store.update(batch.id, (b) => {
                b.terms = {
                    version: terms.VERSION,
                    acceptedAt: new Date().toISOString(),
                    ip: clientIpForHelcim(req),
                    ua: cleanText(req.get('user-agent'), 300),
                    email: email.includes('@') ? email : '',
                    electronicsRequired: needsElectronics,
                    electronicsAccepted: needsElectronics ? true : false,
                    electronicsSentence: needsElectronics ? terms.ELECTRONICS_SENTENCE : '',
                    lines: billing.readyLines(b).map((l) => ({
                        id: l.id,
                        retailer: l.retailer,
                        productId: l.productId || '',
                        title: l.product.title,
                        variant: l.variantLabel || '',
                        priceCents: billing.linePriceCents(b, l),
                    })),
                };
                store.addLog(b, 'shopper', `Accepted ${terms.VERSION}${needsElectronics ? ' with the electronics sentence' : ''}`);
                return b;
            });
            return null;
        }),
    );

    app.post(
        '/api/buy/batches/:id/wrap',
        shopperChange(async (req, batch) => {
            const lineId = String(req.body.lineId || '');
            const w = req.body.wrap && typeof req.body.wrap === 'object' ? req.body.wrap : {};
            const line = batch.lines.find((l) => l.id === lineId);
            if (!line || line.removed || line.state === 'unavailable' || line.state === 'reading' || !line.product) return { error: 'Please wait while we add that to your gift-wrapping cart.' };
            if (!batch.terms || batch.terms.version !== terms.VERSION) return { error: 'Please agree to the Terms first.' };
            const occasion = cleanText(w.occasion, 60);
            if (!extensionConfig.OCCASIONS.includes(occasion)) return { error: 'Please choose an occasion.' };
            const style = billing.WRAP_STYLES.has(w.style) ? w.style : 'wrrapd';
            const out = { occasion, style, giftMessage: cleanText(w.giftMessage, 300), senderName: cleanText(w.senderName, 80), done: true };
            if (style === 'ai') {
                const p = cleanPath(w.aiDesign && w.aiDesign.filePath);
                if (!p) return { error: 'Please choose one of the AI designs.' };
                out.aiDesign = {
                    filePath: p,
                    title: cleanText(w.aiDesign.title, 120),
                    description: cleanText(w.aiDesign.description, 600),
                    imageUrl: publicWrrapdMediaUrl(p),
                };
            }
            if (style === 'upload') {
                const p = cleanPath(w.upload && w.upload.filePath);
                if (!p || !p.startsWith('designs/')) return { error: 'Please upload your design.' };
                out.upload = { filePath: p, fileName: cleanText(w.upload.fileName, 120) || p.split('/').pop(), imageUrl: publicWrrapdMediaUrl(p) };
            }
            if (w.flowers && w.flowers.offerId) {
                const chk = flowerCatalog.validateOfferAmount(String(w.flowers.offerId), Number(w.flowers.amount));
                if (!chk.ok) return { error: 'The flower choice expired. Please choose flowers again.' };
                out.flowers = {
                    offerId: String(w.flowers.offerId),
                    amount: chk.offer.chargedPrice,
                    imageUrl: chk.offer.imageUrl || '',
                    title: cleanText(w.flowers.title, 80) || 'Flowers',
                };
            }
            await store.update(batch.id, (b) => {
                const l = b.lines.find((x) => x.id === lineId);
                if (!l) return null;
                l.wrap = out;
                return b;
            });
            const after = billing.computeBill(store.read(batch.id), config.load());
            if (!after.ok && after.error === 'custom_design_unavailable') return { error: after.message };
            return null;
        }),
    );

    app.post('/api/buy/batches/:id/refresh', async (req, res) => {
        if (!api(req, res)) return;
        const batch = loadForShopper(req, res);
        if (!batch) return;
        if (batch.status !== 'open') return res.status(409).json({ error: 'This order is already paid.' });
        if (!batch.terms || batch.terms.version !== terms.VERSION) return res.status(400).json({ error: 'Please agree to the Terms first.' });
        const missing = billing.readyLines(batch).filter((l) => !l.wrap || !l.wrap.done);
        if (missing.length) return res.status(400).json({ error: 'Please finish the gift-wrap choices for every item.' });
        const { error } = await quotes.startBookingRefresh(batch.id);
        if (error === 'no_ready_items') return res.status(400).json({ error: 'Add at least one item we can buy.' });
        if (error) return res.status(409).json({ error: 'This order is already paid.' });
        res.json({ ok: true, batch: publicView(store.read(batch.id)) });
    });

    app.post('/api/buy/batches/:id/charge', chargeLimiter, async (req, res) => {
        if (!api(req, res)) return;
        if (!helcim.enabled()) return res.status(503).json({ error: 'Payment is not available. Please refresh the page.' });
        const batch = loadForShopper(req, res);
        if (!batch) return;
        if (batch.status === 'paid' || batch.status === 'closed') return res.json({ ok: true, orderNumber: batch.id, already: true });
        if (batch.status !== 'open') return res.status(409).json({ error: 'Please start again.' });
        const body = req.body || {};
        const cardToken = String(body.cardToken || '').trim();
        if (!cardToken || cardToken.length > 80) return res.status(400).json({ error: 'Card could not be verified. Check the card and try again.' });
        if (!batch.terms || batch.terms.version !== terms.VERSION || String(body.termsVersion || '') !== terms.VERSION) {
            return res.status(400).json({ error: 'Please agree to the Terms first.' });
        }
        const r = batch.refresh;
        if (!r || r.state !== 'done' || Date.now() - Date.parse(r.doneAt) > REFRESH_VALID_MS) {
            return res.status(409).json({ error: 'Prices need a fresh check. Please click Pay again.', code: 'refresh_needed' });
        }
        const cfg = config.load();
        const priced = billing.computeBill(batch, cfg);
        if (!priced.ok) return res.status(400).json({ error: priced.message || 'Your order could not be priced.' });
        const bill = priced.bill;
        if (bill.hash !== r.billHash || String(body.billHash || '') !== bill.hash) {
            return res.status(409).json({ error: 'Your total changed. Please review the new total and click Pay again.', code: 'bill_changed' });
        }
        const ready = billing.readyLines(batch);
        if (ready.some((l) => l.product.isElectronics) && !batch.terms.electronicsAccepted) {
            return res.status(400).json({ error: 'Please accept the electronics sentence.' });
        }
        if (ready.some((l) => !l.wrap || !l.wrap.done)) return res.status(400).json({ error: 'Please finish the gift-wrap choices for every item.' });
        const g = body.giftee && typeof body.giftee === 'object' ? body.giftee : {};
        const giftee = {
            name: cleanText(g.name, 80),
            line1: cleanText(g.line1, 120),
            line2: cleanText(g.line2, 120),
            city: cleanText(g.city, 80),
            state: cleanText(g.state, 2).toUpperCase(),
            postalCode: cleanZip(g.postalCode),
            phone: String(g.phone || '').replace(/\D/g, '').slice(0, 15),
        };
        if (!giftee.name || !giftee.line1 || !giftee.city || giftee.state.length !== 2) return res.status(400).json({ error: 'Please complete the giftee’s address.' });
        if (giftee.postalCode !== batch.gifteeZip) return res.status(400).json({ error: 'The giftee ZIP code must match the one you entered first.' });
        const gf = body.gifter && typeof body.gifter === 'object' ? body.gifter : {};
        const gifter = {
            name: cleanText(gf.name, 80),
            email: cleanText(gf.email, 120).toLowerCase(),
            phone: String(gf.phone || '').replace(/\D/g, '').slice(0, 15),
        };
        if (!gifter.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(gifter.email) || gifter.phone.length < 10) {
            return res.status(400).json({ error: 'Please enter your name, email, and phone.' });
        }
        const billingAddr = helcimBillingFromClient(body.billing);
        if (!billingAddr) return res.status(400).json({ error: 'Billing address is required.' });

        let locked = false;
        await store.update(batch.id, (b) => {
            if (b.status !== 'open') return null;
            if (b.charging && Date.now() - Date.parse(b.charging) < CHARGE_LOCK_MS) return null;
            b.charging = new Date().toISOString();
            locked = true;
            return b;
        });
        if (!locked) return res.status(409).json({ error: 'Your payment is already being processed.' });

        let result;
        try {
            result = await helcim.purchase({
                amountCents: bill.totalCents,
                cardToken,
                orderNumber: batch.id,
                billing: billingAddr,
                ipAddress: clientIpForHelcim(req),
                lineDescription: 'Wrrapd gift purchase and gift-wrap',
            });
        } catch (e) {
            await store.update(batch.id, (b) => {
                b.charging = null;
                return b;
            });
            console.error('[buy] charge error', batch.id, e && e.message);
            return res.status(500).json({ error: 'Payment could not complete. Please try again.' });
        }
        const data = (result && result.data) || {};
        if (!result.ok || !helcim.isApproved(data.status) || !data.transactionId) {
            await store.update(batch.id, (b) => {
                b.charging = null;
                store.addLog(b, 'helcim', `Card not approved: ${helcim.errorText(data)}`.slice(0, 200));
                return b;
            });
            return res.status(402).json({ error: helcim.errorText(data) });
        }
        const chargedCents = Math.round(Number(data.amount) * 100);
        const emailNorm = normalizeCustomerEmail(gifter.email);
        const saved = await store.update(batch.id, (b) => {
            b.status = 'paid';
            b.charging = null;
            b.orderNumber = b.id;
            b.paidBill = bill;
            b.payment = {
                transactionId: String(data.transactionId),
                amountCents: Number.isFinite(chargedCents) ? chargedCents : bill.totalCents,
                paidAt: new Date().toISOString(),
                gifterName: gifter.name,
                gifterFirstName: gifter.name.split(' ')[0],
                email: gifter.email,
                emailNorm,
                wrrapdCustomerId: emailNorm ? getOrCreateWrrapdCustomerId(emailNorm) : null,
                phone: gifter.phone,
                billing: billingAddr,
                giftee,
                ip: clientIpForHelcim(req),
            };
            b.terms.email = b.terms.email || gifter.email;
            for (const grp of bill.groups) {
                const gg = b.groups[grp.retailer];
                if (gg) gg.placement = { state: 'to_place' };
            }
            store.addLog(b, 'helcim', `Paid ${emails.usd(bill.totalCents)} (transaction ${data.transactionId})`);
            if (Number.isFinite(chargedCents) && Math.abs(chargedCents - bill.totalCents) > 1) {
                store.addLog(b, 'helcim', `Amount check: Helcim reported ${emails.usd(chargedCents)}`);
            }
            return b;
        });
        sendMail({
            to: [gifter.email],
            subject: `Your Wrrapd order ${batch.id}`,
            html: emails.receiptHtml({ batch: saved, bill }),
            from: process.env.SMTP_FROM_CUSTOMER?.trim() || 'Wrrapd Orders <orders@wrrapd.com>',
            replyTo: 'support@wrrapd.com',
        }).catch((e) => console.warn('[buy] receipt email failed', batch.id, e && e.message));
        sendTeam(saved);
        res.json({ ok: true, orderNumber: batch.id });
    });

    function sendTeam(batch) {
        const cfg = config.load();
        const lines = batch.lines.filter((l) => l.state === 'ready' && !l.removed);
        sendMail({
            to: cfg.teamAlertEmails,
            subject: `We buy it: paid order ${batch.id} is ready to place`,
            html: emails.teamAlertHtml({ title: 'Paid order ready to place', batch, lines, link: `${commandCenterBase()}/admin/buy-for-you/${batch.id}` }),
        }).catch((e) => console.warn('[buy] team alert failed', e && e.message));
    }

    app.get('/buy/pay', (req, res) => {
        if (!req.isPayDomain) return res.status(403).send('Access forbidden.');
        res.set('Cache-Control', 'no-store');
        res.sendFile(path.join(__dirname, '..', '..', 'public', 'buy-pay.html'));
    });

    // ---------- Items Wrrapd added by hand to a paid order ----------

    app.get('/buy/approve', (req, res) => {
        if (!req.isPayDomain) return res.status(403).send('Access forbidden.');
        res.set('Cache-Control', 'no-store');
        res.sendFile(path.join(__dirname, '..', '..', 'public', 'buy-approve.html'));
    });

    const loadAddOn = (req, res) => {
        const batch = store.read(String(req.params.id || ''));
        const token = String((req.body && req.body.t) || req.query.t || '');
        const addOn = batch && store.tokenMatches(batch, token) ? (batch.addOns || []).find((a) => a.id === String(req.params.aid || '')) : null;
        if (!addOn) {
            res.status(404).json({ error: 'We could not find this item. Please call (844) 638-5484.' });
            return null;
        }
        return { batch, addOn };
    };

    const addOnView = (batch, addOn) => {
        const p = batch.payment || {};
        const bill = p.billing || {};
        return {
            orderNumber: batch.id,
            addOn: manual.publicAddOn(addOn),
            gifteeName: (p.giftee && p.giftee.name) || '',
            gifterName: p.gifterName || '',
            email: p.email || '',
            phone: p.phone || '',
            billing: { name: bill.name || '', line1: bill.street1 || '', city: bill.city || '', state: bill.province || '', postalCode: bill.postalCode || '' },
        };
    };

    app.get('/api/buy/batches/:id/addons/:aid', (req, res) => {
        if (!api(req, res)) return;
        const found = loadAddOn(req, res);
        if (!found) return;
        res.json({ ok: true, ...addOnView(found.batch, found.addOn) });
    });

    app.post('/api/buy/batches/:id/addons/:aid/decline', async (req, res) => {
        if (!api(req, res)) return;
        const found = loadAddOn(req, res);
        if (!found) return;
        if (found.addOn.state !== 'awaiting_approval') return res.json({ ok: true, ...addOnView(found.batch, found.addOn) });
        const saved = await store.update(found.batch.id, (b) => {
            const a = (b.addOns || []).find((x) => x.id === found.addOn.id);
            if (!a || a.state !== 'awaiting_approval') return null;
            a.state = 'declined';
            a.declinedAt = new Date().toISOString();
            const l = b.lines.find((x) => x.id === a.lineId);
            if (l && l.manual) l.manual.state = 'declined';
            store.addLog(b, 'shopper', `Declined the item added by hand (${a.id})`);
            return b;
        });
        res.json({ ok: true, ...addOnView(saved, saved.addOns.find((x) => x.id === found.addOn.id)) });
    });

    app.post('/api/buy/batches/:id/addons/:aid/charge', chargeLimiter, async (req, res) => {
        if (!api(req, res)) return;
        if (!helcim.enabled()) return res.status(503).json({ error: 'Payment is not available. Please refresh the page.' });
        const found = loadAddOn(req, res);
        if (!found) return;
        const { batch, addOn } = found;
        if (addOn.state === 'paid' || addOn.state === 'placed') return res.json({ ok: true, already: true, ...addOnView(batch, addOn) });
        if (addOn.state !== 'awaiting_approval') return res.status(409).json({ error: 'This item is no longer waiting for approval.' });
        const body = req.body || {};
        const cardToken = String(body.cardToken || '').trim();
        if (!cardToken || cardToken.length > 80) return res.status(400).json({ error: 'Card could not be verified. Check the card and try again.' });
        if (Number(body.totalCents) !== addOn.totalCents) return res.status(409).json({ error: 'The total changed. Please refresh the page.' });
        const billingAddr = helcimBillingFromClient(body.billing);
        if (!billingAddr) return res.status(400).json({ error: 'Billing address is required.' });

        let locked = false;
        await store.update(batch.id, (b) => {
            const a = (b.addOns || []).find((x) => x.id === addOn.id);
            if (!a || a.state !== 'awaiting_approval') return null;
            if (a.charging && Date.now() - Date.parse(a.charging) < CHARGE_LOCK_MS) return null;
            a.charging = new Date().toISOString();
            locked = true;
            return b;
        });
        if (!locked) return res.status(409).json({ error: 'Your payment is already being processed.' });
        const unlock = (note) => store.update(batch.id, (b) => {
            const a = (b.addOns || []).find((x) => x.id === addOn.id);
            if (a) a.charging = null;
            if (note) store.addLog(b, 'helcim', note);
            return b;
        });

        let result;
        try {
            result = await helcim.purchase({
                amountCents: addOn.totalCents,
                cardToken,
                orderNumber: `${batch.id}-${addOn.id}`,
                billing: billingAddr,
                ipAddress: clientIpForHelcim(req),
                lineDescription: 'Wrrapd added item and gift-wrap',
            });
        } catch (e) {
            await unlock();
            console.error('[buy] add-on charge error', batch.id, addOn.id, e && e.message);
            return res.status(500).json({ error: 'Payment could not complete. Please try again.' });
        }
        const data = (result && result.data) || {};
        if (!result.ok || !helcim.isApproved(data.status) || !data.transactionId) {
            await unlock(`Add-on ${addOn.id}: card not approved: ${helcim.errorText(data)}`.slice(0, 200));
            return res.status(402).json({ error: helcim.errorText(data) });
        }
        const chargedCents = Math.round(Number(data.amount) * 100);
        const saved = await store.update(batch.id, (b) => {
            const a = b.addOns.find((x) => x.id === addOn.id);
            a.state = 'paid';
            a.charging = null;
            a.payment = {
                transactionId: String(data.transactionId),
                amountCents: Number.isFinite(chargedCents) ? chargedCents : a.totalCents,
                paidAt: new Date().toISOString(),
                billing: billingAddr,
                ip: clientIpForHelcim(req),
            };
            a.placement = { state: 'to_place' };
            const l = b.lines.find((x) => x.id === a.lineId);
            if (l && l.manual) l.manual.state = 'paid';
            store.addLog(b, 'helcim', `Add-on ${a.id} paid ${emails.usd(a.totalCents)} (transaction ${data.transactionId})`);
            return b;
        });
        const paidAddOn = saved.addOns.find((x) => x.id === addOn.id);
        const p = saved.payment || {};
        if (p.email) {
            sendMail({
                to: [p.email],
                subject: `Item added to your Wrrapd order ${batch.id}`,
                html: emails.addOnReceiptHtml({ batch: saved, addOn: paidAddOn }),
                from: process.env.SMTP_FROM_CUSTOMER?.trim() || 'Wrrapd Orders <orders@wrrapd.com>',
                replyTo: 'support@wrrapd.com',
            }).catch((e) => console.warn('[buy] add-on receipt failed', batch.id, e && e.message));
        }
        const cfg = config.load();
        sendMail({
            to: cfg.teamAlertEmails,
            subject: `We buy it: item added by hand to ${batch.id} is paid and ready to place`,
            html: emails.teamAlertHtml({
                title: `Paid add-on ready to place (${paidAddOn.retailerName})`,
                batch: saved,
                lines: [{ retailerName: paidAddOn.retailerName, product: { title: paidAddOn.item.title }, url: paidAddOn.item.productUrl }],
                link: `${commandCenterBase()}/admin/buy-for-you/manual`,
            }),
        }).catch((e) => console.warn('[buy] add-on team alert failed', e && e.message));
        res.json({ ok: true, ...addOnView(saved, paidAddOn) });
    });

    // ---------- Command Center (admin key) ----------

    const admin = (req, res) => {
        if (!req.isApiDomain) {
            res.status(403).json({ error: 'Forbidden' });
            return false;
        }
        res.set('Cache-Control', 'no-store');
        return requireWrrapdAdminKey(req, res);
    };

    const adminView = (b) => {
        const { token, ...rest } = b;
        return { ...rest, returnWindowDays: RETURN_DAYS, refundedCents: refundedCents(b) };
    };

    app.get('/api/admin/buy/config', (req, res) => {
        if (!admin(req, res)) return;
        const cfg = config.load({ force: true });
        res.json({
            ok: true,
            config: cfg,
            retailers: retailers.RETAILERS.map((r) => ({ id: r.id, name: r.name, runner: runner.status(r.id) })),
            termsVersion: terms.VERSION,
        });
    });

    app.post('/api/admin/buy/config', (req, res) => {
        if (!admin(req, res)) return;
        const saved = config.save(req.body && req.body.config, req.body && req.body.updatedBy);
        res.json({ ok: true, config: saved });
    });

    app.post('/api/admin/buy/batches/:id/product', async (req, res) => {
        if (!admin(req, res)) return;
        const batch = store.read(req.params.id);
        if (!batch || batch.status !== 'open') return res.status(404).json({ error: 'That order is not open.' });
        const body = req.body || {};
        const lineId = String(body.lineId || '').trim();
        const url = String(body.url || '').trim();
        let error = null;
        await store.update(batch.id, (b) => {
            if (b.status !== 'open') {
                error = 'That order is not open.';
                return null;
            }
            const line = b.lines.find((l) => (lineId && l.id === lineId) || (!lineId && url && (l.url === url || l.canonicalUrl === url)));
            if (!line) {
                error = 'That item is not on this order.';
                return null;
            }
            const result = quotes.acceptSupplied(line, body, config.load());
            if (!result.ok) {
                error = result.error;
                return result.changed ? b : null;
            }
            const g = quotes.ensureGroup(b, line.retailer);
            g.quote = null;
            g.selectedShippingId = null;
            g.state = 'waiting';
            store.addLog(b, 'supplied', `${line.retailerName || line.retailer}: details added for ${line.id}`);
            return b;
        });
        if (error) return res.status(400).json({ error });
        await quotes.kickGroups(batch.id, 'supplied');
        const fresh = store.read(batch.id);
        res.json({ ok: true, batch: adminView(fresh) });
    });

    app.post('/api/webhook/add-product', async (req, res) => {
        if (!admin(req, res)) return;
        const body = req.body || {};
        const title = String(body.title || '').trim();
        const price = body.price;
        const imageUrl = String(body.imageUrl || '').trim();
        const storeName = String(body.store || '').trim();
        if (!title) return res.status(400).json({ error: 'title is required.' });
        if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return res.status(400).json({ error: 'price must be a number greater than 0.' });
        if (!/^https:\/\//.test(imageUrl)) return res.status(400).json({ error: 'imageUrl must be an https link.' });
        const retailer = retailers.RETAILERS.find((r) => r.id === storeName.toLowerCase() || r.name.toLowerCase() === storeName.toLowerCase());
        if (!retailer) return res.status(400).json({ error: 'store is not a retailer we buy from.' });
        const batchId = String(body.batchId || '').trim();
        const lineId = String(body.lineId || '').trim();
        const url = String(body.url || '').trim();
        const batches = (batchId ? [store.read(batchId)] : store.list({ limit: 40 })).filter((b) => b && b.status === 'open');
        let found = null;
        for (const b of batches) {
            const lines = (b.lines || []).filter((l) => !l.removed && l.retailer === retailer.id);
            const line = lines.find((l) => lineId && l.id === lineId)
                || lines.find((l) => url && (l.url === url || l.canonicalUrl === url))
                || lines.find((l) => !l.product || !l.product.pagePriceCents)
                || lines[0];
            if (line) {
                found = { batch: b, line };
                break;
            }
        }
        if (!found) return res.status(404).json({ error: 'No open cart item matches that store.' });
        let error = null;
        let savedLine = null;
        let quote = false;
        await store.update(found.batch.id, (b) => {
            const line = b.lines.find((l) => l.id === found.line.id);
            if (!line || line.removed) {
                error = 'That item is not on this order.';
                return null;
            }
            const result = quotes.acceptSupplied(line, {
                ...body,
                title,
                price,
                imageUrl,
                store: retailer.name,
            }, config.load());
            savedLine = { id: line.id, state: line.state, message: line.message || '' };
            if (!result.ok && !result.changed) {
                error = result.error;
                return null;
            }
            if (result.ok && line.product && line.product.pageOffer) {
                const g = quotes.ensureGroup(b, line.retailer);
                g.quote = null;
                g.selectedShippingId = null;
                g.state = 'waiting';
                quote = true;
            }
            store.addLog(b, 'webhook', `${retailer.name}: product details added for ${line.id}`);
            return b;
        });
        if (error) return res.status(400).json({ error });
        if (quote) await quotes.kickGroups(found.batch.id, 'supplied');
        res.json({ ok: true, batchId: found.batch.id, lineId: savedLine.id, state: savedLine.state, message: savedLine.message });
    });

    app.get('/api/admin/buy/batches', async (req, res) => {
        if (!admin(req, res)) return;
        const rows = store.list({ limit: 300 });
        for (const b of rows) if (b.status === 'open') await quotes.sweep(b.id).catch(() => {});
        const fresh = store.list({ limit: 300 });
        res.json({
            ok: true,
            batches: fresh.map((b) => ({
                id: b.id,
                status: openExpired(b) ? 'expired' : b.status,
                createdAt: b.createdAt,
                updatedAt: b.updatedAt,
                gifteeZip: b.gifteeZip,
                hub: b.hub ? b.hub.displayName : '',
                lineCount: b.lines.filter((l) => !l.removed).length,
                readyCount: b.lines.filter((l) => l.state === 'ready' && !l.removed).length,
                groups: Object.values(b.groups || {}).map((g) => ({
                    retailer: g.retailer,
                    retailerName: g.retailerName,
                    state: g.state,
                    kind: g.kind || null,
                    deadlineAt: g.deadlineAt || null,
                    placement: g.placement || null,
                })),
                refreshRunning: !!(b.refresh && b.refresh.state === 'running'),
                totalCents: b.paidBill ? b.paidBill.totalCents : null,
                refundedCents: refundedCents(b),
                gifterName: b.payment ? b.payment.gifterName : '',
                email: b.payment ? b.payment.email : (b.terms && b.terms.email) || '',
                bundles: Object.values(b.bundles || {}).map((x) => ({ key: x.key, externalOrderId: x.externalOrderId, ok: !!(x.ingest && x.ingest.ok) })),
                manualOpen: b.lines.filter((l) => !l.removed && l.manual && ['requested', 'awaiting_approval', 'paid'].includes(l.manual.state)).length,
            })),
        });
    });

    const backfillCategories = async (rows) => {
        let budget = 8;
        for (const b of rows) {
            const missing = b.lines.filter((l) => l.product && !l.removed && l.product.amazonCategory === undefined);
            if (!missing.length || budget <= 0) continue;
            const found = {};
            for (const l of missing) {
                if (budget-- <= 0) break;
                const r = retailers.byId(l.retailer);
                found[l.id] = await categories
                    .categorize({ retailer: '', retailerName: r ? r.name : l.retailer, title: l.product.title, brand: l.product.brand, category: l.product.category })
                    .catch(() => null);
            }
            await store.update(b.id, (x) => {
                for (const l of x.lines) if (l.id in found && l.product) l.product.amazonCategory = found[l.id];
                return x;
            });
        }
    };

    app.get('/api/admin/buy/purchases', async (req, res) => {
        if (!admin(req, res)) return;
        const paid = () => store.list({ limit: 500 }).filter((b) => b.payment);
        await backfillCategories(paid());
        const items = [];
        for (const b of paid()) {
            const p = b.payment;
            const billItems = new Map();
            for (const g of (b.paidBill && b.paidBill.groups) || []) for (const it of g.items) billItems.set(it.lineId, { ...it, shipping: g.shipping });
            for (const l of b.lines) {
                const it = billItems.get(l.id);
                if (!it) continue;
                const placement = b.placements[l.retailer] || null;
                const bundle = Object.values(b.bundles || {}).find((x) => x.lineIds.includes(l.id)) || null;
                const ret = b.returns && b.returns[l.id];
                const r = retailers.byId(l.retailer);
                items.push({
                    batchId: b.id,
                    lineId: l.id,
                    title: l.product.title,
                    variant: l.variantLabel || '',
                    imageUrl: l.product.imageUrl || '',
                    productUrl: l.canonicalUrl || l.url || '',
                    brand: l.product.brand || '',
                    retailer: l.retailer,
                    retailerName: r ? r.name : l.retailer,
                    retailerCategory: l.product.category || '',
                    amazonCategory: l.product.amazonCategory || null,
                    itemPriceCents: it.cents,
                    shippingLabel: it.shipping ? it.shipping.label : '',
                    wrapCents: b.paidBill.wrap && b.paidBill.wrap.perLine && b.paidBill.wrap.perLine[l.id] ? b.paidBill.wrap.perLine[l.id].wrapBaseCents : null,
                    gifter: { name: p.gifterName || '', email: p.email || '', phone: p.phone || '' },
                    giftee: p.giftee || null,
                    status: l.cancelled ? 'cancelled' : ret && ret.refunded ? 'returned' : placement && placement.state === 'placed' ? 'placed' : 'to_place',
                    retailerOrderNumber: placement && placement.retailerOrderNumber ? placement.retailerOrderNumber : '',
                    externalOrderId: bundle ? bundle.externalOrderId : '',
                    sentToOrders: !!(bundle && bundle.ingest && bundle.ingest.ok),
                    dates: {
                        created: b.createdAt,
                        paid: p.paidAt || null,
                        placed: placement && placement.placedAt ? placement.placedAt : null,
                        hubArrival: (placement && placement.arrivalDate) || (it.shipping && it.shipping.arrivalDate) || null,
                        delivery: bundle && bundle.arrivalDate ? billing.ymdPlusOne(bundle.arrivalDate) : null,
                    },
                    addedManually: !!l.manual,
                });
            }
            for (const a of b.addOns || []) {
                if (!a.payment) continue;
                const l = b.lines.find((x) => x.id === a.lineId) || {};
                const placed = a.placement && a.placement.state === 'placed' ? a.placement : null;
                items.push({
                    batchId: b.id,
                    lineId: a.lineId,
                    title: a.item.title,
                    variant: a.item.variant || '',
                    imageUrl: a.item.imageUrl || '',
                    productUrl: a.item.productUrl || l.url || '',
                    brand: a.item.brand || '',
                    retailer: a.retailer,
                    retailerName: a.retailerName,
                    retailerCategory: a.item.category || '',
                    amazonCategory: (l.product && l.product.amazonCategory) || null,
                    itemPriceCents: a.item.cents,
                    shippingLabel: 'Standard shipping',
                    wrapCents: a.wrapBill.wrapBaseCents,
                    gifter: { name: p.gifterName || '', email: p.email || '', phone: p.phone || '' },
                    giftee: p.giftee || null,
                    status: placed ? 'placed' : 'to_place',
                    retailerOrderNumber: placed ? placed.retailerOrderNumber : '',
                    externalOrderId: a.externalOrderId || '',
                    sentToOrders: !!(a.ingest && a.ingest.ok),
                    dates: {
                        created: a.createdAt,
                        paid: a.payment.paidAt,
                        placed: placed ? placed.placedAt : null,
                        hubArrival: (placed && placed.arrivalDate) || a.shipping.arrivalDate || null,
                        delivery: placed ? billing.ymdPlusOne(placed.arrivalDate) : null,
                    },
                    addedManually: true,
                });
            }
        }
        items.sort((a, b) => String(b.dates.paid || '').localeCompare(String(a.dates.paid || '')));
        res.json({ ok: true, items, categories: categories.tree() });
    });

    app.get('/api/admin/buy/batches/:id', async (req, res) => {
        if (!admin(req, res)) return;
        const b = store.read(req.params.id);
        if (!b) return res.status(404).json({ error: 'Not found' });
        if (b.status === 'open') await quotes.sweep(b.id).catch(() => {});
        const fresh = store.read(req.params.id);
        const bill = fresh.status === 'open' ? billing.computeBill(fresh, config.load()) : null;
        const runnerStatus = Object.fromEntries(Object.keys(fresh.groups || {}).map((id) => [id, runner.status(id)]));
        res.json({ ok: true, batch: adminView(fresh), bill: bill && bill.ok ? bill.bill : null, billError: bill && !bill.ok ? bill.message : null, runner: runnerStatus, termsVersion: terms.VERSION });
    });

    app.post('/api/admin/buy/batches/:id/quote', async (req, res) => {
        if (!admin(req, res)) return;
        const body = req.body || {};
        const out = await quotes.applyQuote(String(req.params.id), String(body.retailer || ''), {
            itemPrices: body.itemPrices,
            shippingOptions: body.shippingOptions,
            taxCents: body.taxCents,
            retailerTotalCents: body.retailerTotalCents,
            note: body.note,
            lines: body.lines,
            unavailable: body.unavailable,
            unavailableReason: body.unavailableReason,
            source: 'person',
            by: cleanText(body.by, 80) || 'admin',
        });
        if (!out.ok) return res.status(400).json({ error: out.error });
        res.json({ ok: true, batch: adminView(out.batch) });
    });

    app.post('/api/admin/buy/batches/:id/unavailable', async (req, res) => {
        if (!admin(req, res)) return;
        const body = req.body || {};
        const retailerId = String(body.retailer || '');
        const saved = await store.update(String(req.params.id), (b) => {
            if (b.status !== 'open') return null;
            const g = b.groups[retailerId];
            if (!g) return null;
            const ids = Array.isArray(body.lineIds) && body.lineIds.length ? body.lineIds.map(String) : quotes.activeLines(b, retailerId).map((l) => l.id);
            for (const id of ids) {
                const l = b.lines.find((x) => x.id === id && x.retailer === retailerId);
                if (l) quotes.markUnavailable(l, cleanText(body.reason, 200) || 'desk_unavailable');
            }
            if (!quotes.activeLines(b, retailerId).length) g.state = 'unavailable';
            if (b.refresh && b.refresh.state === 'running') {
                for (const id of ids) {
                    const l = b.lines.find((x) => x.id === id);
                    if (l) b.refresh.changes.push({ lineId: id, kind: 'removed', text: `We can't buy ${l.product ? l.product.title : 'this item'} right now. It was removed from your bill.` });
                }
            }
            store.addLog(b, body.by || 'admin', `${g.retailerName}: marked ${ids.join(', ')} unavailable (${cleanText(body.reason, 120)})`);
            return b;
        });
        if (!saved) return res.status(400).json({ error: 'Could not update. The batch may be paid or closed.' });
        res.json({ ok: true, batch: adminView(saved) });
    });

    async function forwardRetailerRef(externalOrderId, retailerOrderNumber, retailerId) {
        const key = process.env.INGEST_API_KEY;
        const url = process.env.TRACKING_INGEST_URL || 'http://127.0.0.1:3000/api/orders/ingest';
        if (!key) return false;
        try {
            const resp = await fetch(url.replace(/\/ingest\/?$/, '/retailer-ref'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
                body: JSON.stringify({ externalOrderId, retailerOrderNumber, source: `buy-for-you:${retailerId}` }),
            });
            return resp.ok;
        } catch (_) {
            return false;
        }
    }

    function bundleIngestPayload(b, bundle) {
        const p = b.payment;
        const lines = bundle.lineIds.map((id) => b.lines.find((l) => l.id === id));
        const alloc = Object.fromEntries(lines.map((l) => [l.id, lineAllocation(b.paidBill, l.id)]));
        const lineItems = lines.map((l) => {
            const w = l.wrap || {};
            const pl = b.paidBill.wrap.perLine[l.id] || {};
            const design = w.aiDesign || w.upload || null;
            return {
                title: l.variantLabel ? `${l.product.title} (${l.variantLabel})` : l.product.title,
                asin: l.productId || '',
                imageUrl: l.product.imageUrl || '',
                wrappingOption: w.style || 'wrrapd',
                flowers: !!w.flowers,
                ...(w.flowers ? { flowerOfferId: w.flowers.offerId, flowerAmount: w.flowers.amount, flowerImageUrl: w.flowers.imageUrl || '', flowerDesign: w.flowers.title || 'Flowers' } : {}),
                ...(w.upload ? { uploadedDesignPath: w.upload.filePath, uploadedDesignFileName: w.upload.fileName } : {}),
                ...(design ? { wrappingDesignImageUrl: design.imageUrl, wrappingDesignStoragePath: design.filePath, wrappingDesignFileName: design.filePath.split('/').pop() } : {}),
                ...(w.aiDesign ? { aiDesignTitle: w.aiDesign.title, aiDesignDescription: w.aiDesign.description } : {}),
                giftMessage: w.giftMessage || '',
                senderName: w.senderName || '',
                occasion: w.occasion || '',
                itemCategory: (l.product.amazonCategory && l.product.amazonCategory.path) || l.product.category || '',
                packageDimensions: l.product.packageDimensions || '',
                wrapBaseCents: pl.wrapBaseCents,
                ...(pl.wrapDiscountCents ? { wrapDiscountCents: pl.wrapDiscountCents } : {}),
            };
        });
        const sum = (k) => lines.reduce((s, l) => s + alloc[l.id][k], 0);
        const retailerIds = [...new Set(lines.map((l) => l.retailer))];
        const refs = retailerIds.map((id) => `${retailers.byId(id).name} #${b.placements[id].retailerOrderNumber}`).join(', ');
        const giftee = p.giftee;
        const flowerPickup = [];
        for (const l of lines) {
            const fl = l.wrap && l.wrap.flowers;
            const offer = fl ? flowerCatalog.getOffer(String(fl.offerId)) : null;
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
        const scheduledFor = wrrapdIsoFromRetailerYmd(bundle.arrivalDate) || new Date(Date.now() + 2 * 86400000).toISOString();
        return {
            customerName: p.gifterName,
            customerPhone: p.phone,
            customerEmail: p.email,
            ...(p.emailNorm ? { customerEmailNorm: p.emailNorm } : {}),
            ...(p.wrrapdCustomerId ? { wrrapdCustomerId: p.wrrapdCustomerId } : {}),
            recipientName: giftee.name,
            addressLine1: giftee.line1,
            addressLine2: giftee.line2 || '',
            city: giftee.city,
            state: giftee.state,
            postalCode: giftee.postalCode,
            gifteeAddress: { name: giftee.name, line1: giftee.line1, line2: giftee.line2 || '', city: giftee.city, state: giftee.state, postalCode: giftee.postalCode },
            externalOrderId: bundle.externalOrderId,
            lineItems,
            wrapRevenueCents: sum('wrapCents'),
            flowersRevenueCents: sum('flowersCents'),
            orderValueCents: sum('merchCents') + sum('retailerTaxCents') + sum('shippingCents') + sum('serviceCents') + sum('serviceTaxCents'),
            retailer: retailers.byId(retailerIds[0]).trackingName,
            retailerEstimatedDeliveryDate: bundle.arrivalDate || undefined,
            scheduledFor,
            ...(flowerPickup.length ? { pickupFlowers: true, flowerPickup } : {}),
            sourceNote: `We-buy-it order ${b.id}; ${lines.length} item(s) bought by Wrrapd (${refs}); ${bundle.arrivalDate ? `hub arrival ${bundle.arrivalDate} → Wrrapd +1 day` : 'hub arrival date to confirm'}. Hub: ${b.hub.displayName} (${b.hub.postalCode}). [${INGEST_TAG}]`,
        };
    }

    /** Rebuilds same-arrival-day bundles from placed retailer orders and ingests any that changed. */
    async function ingestBundles(batchId, by) {
        const b = store.read(batchId);
        if (!b || !b.payment) return [];
        const placedLines = b.lines.filter((l) => l.state === 'ready' && !l.removed && b.placements[l.retailer] && b.placements[l.retailer].state === 'placed' && !l.cancelled);
        const groups = billing.bundlesFor(placedLines, (l) => b.placements[l.retailer].arrivalDate);
        const results = [];
        for (const g of groups) {
            const key = g.arrivalDate || 'unknown';
            const prev = b.bundles[key];
            const sameLines = prev && prev.ingest && prev.ingest.ok && JSON.stringify(prev.lineIds) === JSON.stringify(g.lineIds);
            if (sameLines) continue;
            const bundle = {
                key,
                arrivalDate: g.arrivalDate,
                lineIds: g.lineIds,
                externalOrderId: prev ? prev.externalOrderId : `${b.id}-${(g.arrivalDate || 'TBD').replace(/-/g, '')}`,
            };
            const payload = bundleIngestPayload(b, bundle);
            const r = await ingestOrderIntoTracking(payload);
            for (const id of [...new Set(g.lineIds.map((lid) => b.lines.find((l) => l.id === lid).retailer))]) {
                if (r.ok) await forwardRetailerRef(bundle.externalOrderId, b.placements[id].retailerOrderNumber, id);
            }
            results.push({ key, ok: !!r.ok, reason: r.reason || '' });
            await store.update(batchId, (x) => {
                x.bundles[key] = { ...bundle, ingest: { ok: !!r.ok, at: new Date().toISOString(), reason: r.ok ? '' : String(r.reason || 'unknown').slice(0, 300), by } };
                store.addLog(x, by, `Bundle ${key} (${g.lineIds.join(', ')}) ${r.ok ? 'sent to Command Center orders' : `ingest failed: ${String(r.reason).slice(0, 120)}`}`);
                return x;
            });
        }
        return results;
    }

    app.post('/api/admin/buy/batches/:id/placed', async (req, res) => {
        if (!admin(req, res)) return;
        const body = req.body || {};
        const retailerId = String(body.retailer || '');
        const ref = String(body.retailerOrderNumber || '').trim().replace(/^#/, '').replace(/\s+/g, '').toUpperCase();
        if (!/^[A-Z0-9][A-Z0-9-]{3,39}$/.test(ref)) return res.status(400).json({ error: 'Enter the retailer order number.' });
        const arrivalDate = String(body.arrivalDate || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(arrivalDate)) return res.status(400).json({ error: 'Enter the date the retailer says it reaches the hub.' });
        const total = Math.round(Number(body.retailerTotalCents));
        if (!Number.isFinite(total) || total <= 0) return res.status(400).json({ error: 'Enter the retailer order total.' });
        let err = null;
        await store.update(String(req.params.id), (b) => {
            if (b.status !== 'paid') {
                err = 'Only paid orders can be placed.';
                return null;
            }
            const grp = b.paidBill.groups.find((x) => x.retailer === retailerId);
            const g = b.groups[retailerId];
            if (!grp || !g) {
                err = 'That retailer is not on this order.';
                return null;
            }
            if (g.placement && g.placement.state === 'placed') {
                err = 'This retailer order is already recorded.';
                return null;
            }
            if (g.placement && g.placement.state === 'cancelled') {
                err = 'This retailer group was cancelled and refunded.';
                return null;
            }
            if (total > grp.subtotalCents) {
                err = `The retailer total is higher than what the shopper paid for ${grp.retailerName} (${emails.usd(grp.subtotalCents)}). Do not place it.`;
                return null;
            }
            b.placements[retailerId] = { state: 'placed', retailerOrderNumber: ref, retailerTotalCents: total, arrivalDate, placedAt: new Date().toISOString(), by: cleanText(body.by, 80) || 'admin' };
            g.placement = { state: 'placed' };
            store.addLog(b, body.by || 'admin', `${grp.retailerName} order #${ref} placed for ${emails.usd(total)}; hub arrival ${arrivalDate}`);
            return b;
        });
        if (err) return res.status(400).json({ error: err });
        const results = await ingestBundles(String(req.params.id), cleanText(body.by, 80) || 'admin');
        res.json({ ok: true, ingest: results, batch: adminView(store.read(String(req.params.id))) });
    });

    app.post('/api/admin/buy/batches/:id/retry-ingest', async (req, res) => {
        if (!admin(req, res)) return;
        const results = await ingestBundles(String(req.params.id), cleanText(req.body && req.body.by, 80) || 'admin');
        res.json({ ok: true, ingest: results, batch: adminView(store.read(String(req.params.id))) });
    });

    // ---------- Manual additions (Command Center) ----------

    app.get('/api/admin/buy/manual', (req, res) => {
        if (!admin(req, res)) return;
        const rows = [];
        for (const b of store.list({ limit: 1000 })) {
            for (const l of b.lines || []) {
                if (!l.manual) continue;
                const row = manual.adminRow(b, l, Date.now(), BATCH_TTL_MS);
                if (row.state === 'requested' && l.state !== 'unavailable' && !l.removed) row.state = 'read_ok';
                row.cartUrl = shopperLink(CART_URL, b);
                row.approveUrl = row.addOn ? shopperLink(APPROVE_URL, b, { a: row.addOn.id }) : '';
                rows.push(row);
            }
        }
        rows.sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));
        res.json({ ok: true, items: rows, retailers: retailers.RETAILERS.map((r) => ({ id: r.id, name: r.name })) });
    });

    const addOnIdFor = (b) => `A${(b.addOns || []).length + 1}`;

    app.post('/api/admin/buy/batches/:id/manual-add', async (req, res) => {
        if (!admin(req, res)) return;
        const body = req.body || {};
        const by = cleanText(body.by, 80) || 'admin';
        const lineId = String(body.lineId || '');
        const b0 = store.read(String(req.params.id));
        const l0 = b0 && b0.lines.find((l) => l.id === lineId);
        if (!l0 || !l0.manual) return res.status(404).json({ error: 'That request is not on this order.' });
        if (l0.manual.state !== 'requested') return res.status(400).json({ error: 'This item was already handled.' });
        if (l0.removed) return res.status(400).json({ error: 'The shopper removed this item.' });
        const cfg = config.load();
        const facts = {
            title: body.title,
            priceUsd: body.priceUsd,
            priceCents: body.priceCents,
            qty: body.qty,
            variantLabel: body.variantLabel,
            imageUrl: body.imageUrl,
            category: body.category,
            ...(body.shippingCents != null && body.shippingCents !== '' ? { shippingCents: body.shippingCents } : {}),
            ...(body.arrivalDate ? { arrivalDate: body.arrivalDate } : {}),
        };

        if (b0.status === 'open') {
            let error = null;
            const saved = await store.update(b0.id, (b) => {
                const l = b.lines.find((x) => x.id === lineId);
                if (b.status !== 'open' || !l || !l.manual || l.manual.state !== 'requested') {
                    error = 'This order changed. Please reload.';
                    return null;
                }
                const result = quotes.acceptSupplied(l, facts, cfg);
                if (!result.ok) {
                    error = result.error;
                    return null;
                }
                l.qty = lineFacts.clampQty(body.qty);
                l.manual = { ...l.manual, state: 'in_cart', addedAt: new Date().toISOString(), addedBy: by };
                const g = quotes.ensureGroup(b, l.retailer);
                g.quote = null;
                g.selectedShippingId = null;
                g.state = 'waiting';
                if (b.terms) b.terms = null;
                b.reopenedAt = new Date().toISOString();
                store.addLog(b, by, `Added ${l.id} by hand: ${l.product.title}`);
                return b;
            });
            if (error) return res.status(400).json({ error });
            await quotes.kickGroups(b0.id, 'supplied');
            const line = saved.lines.find((x) => x.id === lineId);
            const to = line.manual.email || (b0.terms && b0.terms.email) || '';
            if (to) {
                sendMail({
                    to: [to],
                    subject: 'Your item is in your Wrrapd cart',
                    html: emails.cartReadyHtml({ title: line.product.title, cartUrl: shopperLink(CART_URL, saved) }),
                    from: process.env.SMTP_FROM_CUSTOMER?.trim() || 'Wrrapd Orders <orders@wrrapd.com>',
                    replyTo: 'support@wrrapd.com',
                }).catch((e) => console.warn('[buy] cart-ready email failed', b0.id, e && e.message));
            }
            return res.json({ ok: true, mode: 'cart', emailed: !!to, batch: adminView(store.read(b0.id)) });
        }

        if (b0.status !== 'paid' || !b0.payment) return res.status(400).json({ error: 'This order is closed.' });
        const priced = manual.priceAddOn(b0, l0, facts, cfg);
        if (!priced.ok) return res.status(400).json({ error: priced.error });
        let error = null;
        let addOn = null;
        const saved = await store.update(b0.id, (b) => {
            const l = b.lines.find((x) => x.id === lineId);
            if (b.status !== 'paid' || !l || !l.manual || l.manual.state !== 'requested') {
                error = 'This order changed. Please reload.';
                return null;
            }
            b.addOns = b.addOns || [];
            addOn = { ...priced.addOn, id: addOnIdFor(b), createdAt: new Date().toISOString(), createdBy: by, approvalSentAt: null };
            b.addOns.push(addOn);
            l.product = priced.product;
            l.variantLabel = addOn.item.variant;
            l.manual = { ...l.manual, state: 'awaiting_approval', addedAt: addOn.createdAt, addedBy: by, addOnId: addOn.id };
            store.addLog(b, by, `Added ${l.id} by hand as add-on ${addOn.id} for ${emails.usd(addOn.totalCents)}; approval email sent`);
            return b;
        });
        if (error) return res.status(400).json({ error });
        const sent = await sendApproval(saved, addOn.id);
        res.json({ ok: true, mode: 'addon', emailed: sent, addOn: manual.publicAddOn(addOn), batch: adminView(store.read(b0.id)) });
    });

    async function sendApproval(b, addOnId) {
        const a = (b.addOns || []).find((x) => x.id === addOnId);
        const to = b.payment && b.payment.email;
        if (!a || !to) return false;
        try {
            await sendMail({
                to: [to],
                subject: `Please approve the item added to your Wrrapd order ${b.id}`,
                html: emails.addOnApprovalHtml({ batch: b, addOn: a, approveUrl: shopperLink(APPROVE_URL, b, { a: a.id }) }),
                from: process.env.SMTP_FROM_CUSTOMER?.trim() || 'Wrrapd Orders <orders@wrrapd.com>',
                replyTo: 'support@wrrapd.com',
            });
        } catch (e) {
            console.warn('[buy] approval email failed', b.id, e && e.message);
            return false;
        }
        await store.update(b.id, (x) => {
            const y = (x.addOns || []).find((z) => z.id === addOnId);
            if (y) y.approvalSentAt = new Date().toISOString();
            return x;
        });
        return true;
    }

    app.post('/api/admin/buy/batches/:id/addon-resend', async (req, res) => {
        if (!admin(req, res)) return;
        const b = store.read(String(req.params.id));
        const a = b && (b.addOns || []).find((x) => x.id === String((req.body || {}).addOnId || ''));
        if (!a || a.state !== 'awaiting_approval') return res.status(400).json({ error: 'That item is not waiting for approval.' });
        const sent = await sendApproval(b, a.id);
        if (!sent) return res.status(502).json({ error: 'The email did not send. Please try again.' });
        res.json({ ok: true, batch: adminView(store.read(b.id)) });
    });

    app.post('/api/admin/buy/batches/:id/manual-cancel', async (req, res) => {
        if (!admin(req, res)) return;
        const body = req.body || {};
        const by = cleanText(body.by, 80) || 'admin';
        const lineId = String(body.lineId || '');
        let error = null;
        let title = '';
        let to = '';
        const saved = await store.update(String(req.params.id), (b) => {
            const l = b.lines.find((x) => x.id === lineId);
            if (!l || !l.manual || !['requested', 'awaiting_approval'].includes(l.manual.state)) {
                error = 'Only a request or an item waiting for approval can be cancelled.';
                return null;
            }
            const a = (b.addOns || []).find((x) => x.lineId === lineId && x.state === 'awaiting_approval');
            if (a && a.charging) {
                error = 'The shopper is paying for it right now.';
                return null;
            }
            if (a) a.state = 'cancelled';
            l.manual = { ...l.manual, state: 'cancelled', note: cleanText(body.note, 300), cancelledAt: new Date().toISOString(), cancelledBy: by };
            title = (a && a.item.title) || (l.product && l.product.title) || '';
            to = l.manual.email || (b.payment && b.payment.email) || (b.terms && b.terms.email) || '';
            store.addLog(b, by, `Cancelled the manual request for ${l.id}`);
            return b;
        });
        if (error) return res.status(400).json({ error });
        if (to && body.tellShopper !== false) {
            sendMail({
                to: [to],
                subject: `About your Wrrapd order ${saved.id}`,
                html: emails.manualCancelledHtml({ batchId: saved.id, title }),
                from: process.env.SMTP_FROM_CUSTOMER?.trim() || 'Wrrapd Orders <orders@wrrapd.com>',
                replyTo: 'support@wrrapd.com',
            }).catch((e) => console.warn('[buy] manual cancel email failed', saved.id, e && e.message));
        }
        res.json({ ok: true, batch: adminView(saved) });
    });

    function addOnIngestPayload(b, a) {
        const p = b.payment;
        const w = a.wrap || {};
        const design = w.aiDesign || w.upload || null;
        const giftee = p.giftee;
        const r = retailers.byId(a.retailer);
        const l = b.lines.find((x) => x.id === a.lineId) || {};
        const arrival = a.placement.arrivalDate;
        return {
            customerName: p.gifterName,
            customerPhone: p.phone,
            customerEmail: p.email,
            ...(p.emailNorm ? { customerEmailNorm: p.emailNorm } : {}),
            ...(p.wrrapdCustomerId ? { wrrapdCustomerId: p.wrrapdCustomerId } : {}),
            recipientName: giftee.name,
            addressLine1: giftee.line1,
            addressLine2: giftee.line2 || '',
            city: giftee.city,
            state: giftee.state,
            postalCode: giftee.postalCode,
            gifteeAddress: { name: giftee.name, line1: giftee.line1, line2: giftee.line2 || '', city: giftee.city, state: giftee.state, postalCode: giftee.postalCode },
            externalOrderId: a.externalOrderId,
            lineItems: [{
                title: a.item.variant ? `${a.item.title} (${a.item.variant})` : a.item.title,
                asin: l.productId || '',
                imageUrl: a.item.imageUrl || '',
                wrappingOption: w.style || 'wrrapd',
                flowers: false,
                ...(w.upload ? { uploadedDesignPath: w.upload.filePath, uploadedDesignFileName: w.upload.fileName } : {}),
                ...(design ? { wrappingDesignImageUrl: design.imageUrl, wrappingDesignStoragePath: design.filePath, wrappingDesignFileName: String(design.filePath || '').split('/').pop() } : {}),
                ...(w.aiDesign ? { aiDesignTitle: w.aiDesign.title, aiDesignDescription: w.aiDesign.description } : {}),
                giftMessage: w.giftMessage || '',
                senderName: w.senderName || '',
                occasion: w.occasion || '',
                itemCategory: a.item.category || '',
                packageDimensions: '',
                wrapBaseCents: a.wrapBill.wrapBaseCents,
            }],
            wrapRevenueCents: a.wrapBill.giftWrapCents + a.wrapBill.designCents,
            flowersRevenueCents: 0,
            orderValueCents: a.totalCents,
            retailer: r ? r.trackingName : a.retailerName,
            retailerEstimatedDeliveryDate: arrival || undefined,
            scheduledFor: wrrapdIsoFromRetailerYmd(arrival) || new Date(Date.now() + 2 * 86400000).toISOString(),
            sourceNote: `We-buy-it order ${b.id}; item added by hand (${a.id}); bought by Wrrapd (${a.retailerName} #${a.placement.retailerOrderNumber}); hub arrival ${arrival} → Wrrapd +1 day. Deliver with the rest of ${b.id} when the dates match. Hub: ${b.hub.displayName} (${b.hub.postalCode}). [${INGEST_TAG}]`,
        };
    }

    async function ingestAddOn(batchId, addOnId, by) {
        const b = store.read(batchId);
        const a = b && (b.addOns || []).find((x) => x.id === addOnId);
        if (!a || !a.placement || a.placement.state !== 'placed') return { ok: false, reason: 'not_placed' };
        const r = await ingestOrderIntoTracking(addOnIngestPayload(b, a));
        if (r.ok) await forwardRetailerRef(a.externalOrderId, a.placement.retailerOrderNumber, a.retailer);
        await store.update(batchId, (x) => {
            const y = x.addOns.find((z) => z.id === addOnId);
            y.ingest = { ok: !!r.ok, at: new Date().toISOString(), reason: r.ok ? '' : String(r.reason || 'unknown').slice(0, 300), by };
            if (r.ok) {
                y.state = 'placed';
                const l = x.lines.find((z) => z.id === y.lineId);
                if (l && l.manual) l.manual.state = 'placed';
            }
            store.addLog(x, by, `Add-on ${addOnId} ${r.ok ? 'sent to Command Center orders' : `ingest failed: ${String(r.reason).slice(0, 120)}`}`);
            return x;
        });
        return { ok: !!r.ok, reason: r.reason || '' };
    }

    app.post('/api/admin/buy/batches/:id/addon-placed', async (req, res) => {
        if (!admin(req, res)) return;
        const body = req.body || {};
        const by = cleanText(body.by, 80) || 'admin';
        const addOnId = String(body.addOnId || '');
        const ref = String(body.retailerOrderNumber || '').trim().replace(/^#/, '').replace(/\s+/g, '').toUpperCase();
        if (!/^[A-Z0-9][A-Z0-9-]{3,39}$/.test(ref)) return res.status(400).json({ error: 'Enter the retailer order number.' });
        const arrivalDate = String(body.arrivalDate || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(arrivalDate)) return res.status(400).json({ error: 'Enter the date the retailer says it reaches the hub.' });
        const total = Math.round(Number(body.retailerTotalCents));
        if (!Number.isFinite(total) || total <= 0) return res.status(400).json({ error: 'Enter the retailer order total.' });
        let error = null;
        await store.update(String(req.params.id), (b) => {
            const a = (b.addOns || []).find((x) => x.id === addOnId);
            if (!a || a.state !== 'paid' || !a.placement || a.placement.state !== 'to_place') {
                error = 'Only a paid item can be placed.';
                return null;
            }
            if (total > a.retailerCents) {
                error = `The retailer total is higher than what the shopper paid for this item (${emails.usd(a.retailerCents)}). Do not place it.`;
                return null;
            }
            a.placement = { state: 'placed', retailerOrderNumber: ref, retailerTotalCents: total, arrivalDate, placedAt: new Date().toISOString(), by };
            a.externalOrderId = a.externalOrderId || `${b.id}-${a.id}`;
            store.addLog(b, by, `Add-on ${a.id}: ${a.retailerName} order #${ref} placed for ${emails.usd(total)}; hub arrival ${arrivalDate}`);
            return b;
        });
        if (error) return res.status(400).json({ error });
        const ingest = await ingestAddOn(String(req.params.id), addOnId, by);
        res.json({ ok: true, ingest: [{ key: addOnId, ...ingest }], batch: adminView(store.read(String(req.params.id))) });
    });

    app.post('/api/admin/buy/batches/:id/addon-ingest', async (req, res) => {
        if (!admin(req, res)) return;
        const by = cleanText(req.body && req.body.by, 80) || 'admin';
        const addOnId = String((req.body || {}).addOnId || '');
        const ingest = await ingestAddOn(String(req.params.id), addOnId, by);
        res.json({ ok: true, ingest: [{ key: addOnId, ...ingest }], batch: adminView(store.read(String(req.params.id))) });
    });

    async function refund(b, amountCents, { requestId, full, reason, by, kind, lineIds }) {
        const out = await helcim.refund({ transactionId: b.payment.transactionId, amountCents, ipAddress: '34.58.136.32', requestId, full });
        const d = (out && out.data) || {};
        const ok = !!(out && out.ok && helcim.isApproved(d.status) && d.transactionId);
        const rec = {
            id: requestId,
            ok,
            amountCents,
            kind,
            helcimKind: out && out.kind,
            reason: cleanText(reason, 300),
            by: cleanText(by, 80) || 'admin',
            at: new Date().toISOString(),
            lineIds: lineIds || [],
            error: ok ? '' : helcim.errorText((out && out.data) || {}),
        };
        await store.update(b.id, (x) => {
            x.refunds = [...(x.refunds || []), rec];
            store.addLog(x, rec.by, `${kind} refund ${emails.usd(amountCents)} ${ok ? 'done' : `failed: ${rec.error}`}`);
            return x;
        });
        return rec;
    }

    app.post('/api/admin/buy/batches/:id/cancel-group', async (req, res) => {
        if (!admin(req, res)) return;
        const body = req.body || {};
        const retailerId = String(body.retailer || '');
        const requestId = cleanText(body.requestId, 80);
        if (!requestId) return res.status(400).json({ error: 'requestId is required' });
        const b = store.read(String(req.params.id));
        if (!b || b.status !== 'paid') return res.status(400).json({ error: 'Only paid orders can be cancelled here.' });
        if ((b.refunds || []).some((r) => r.id === requestId && r.ok)) return res.json({ ok: true, already: true, batch: adminView(b) });
        const grp = b.paidBill.groups.find((x) => x.retailer === retailerId);
        const g = b.groups[retailerId];
        if (!grp || !g) return res.status(400).json({ error: 'That retailer is not on this order.' });
        if (g.placement && g.placement.state === 'cancelled') return res.status(400).json({ error: 'Already cancelled.' });
        const placed = g.placement && g.placement.state === 'placed';
        if (placed && body.retailerCancelled !== true) {
            return res.status(400).json({ error: 'This retailer order was placed. Cancel here only when the retailer cancelled and refunded Wrrapd.' });
        }
        const wrapDocumented = body.wrapDocumented === true;
        const lineIds = grp.items.map((i) => i.lineId);
        let amount = grp.subtotalCents;
        if (!wrapDocumented) {
            for (const id of lineIds) {
                const a = lineAllocation(b.paidBill, id);
                amount += a.serviceCents + a.serviceTaxCents;
            }
        }
        const remaining = b.payment.amountCents - refundedCents(b);
        amount = Math.min(amount, remaining);
        const others = b.paidBill.groups.filter((x) => x.retailer !== retailerId && !(b.groups[x.retailer].placement && b.groups[x.retailer].placement.state === 'cancelled'));
        const full = !others.length && amount >= remaining;
        const rec = await refund(b, full ? remaining : amount, { requestId, full, reason: body.reason, by: body.by, kind: 'retailer group', lineIds });
        if (rec.ok) {
            await store.update(b.id, (x) => {
                x.groups[retailerId].placement = { state: 'cancelled', at: rec.at, by: rec.by };
                for (const id of lineIds) {
                    const l = x.lines.find((y) => y.id === id);
                    if (l) l.cancelled = true;
                }
                if (Object.values(x.groups).every((gg) => !gg.placement || gg.placement.state === 'cancelled')) x.status = 'closed';
                return x;
            });
        }
        if (!rec.ok) return res.status(400).json({ error: rec.error || 'Refund failed', batch: adminView(store.read(b.id)) });
        res.json({ ok: true, refund: rec, batch: adminView(store.read(b.id)) });
    });

    app.post('/api/admin/buy/batches/:id/return-request', async (req, res) => {
        if (!admin(req, res)) return;
        const body = req.body || {};
        const lineId = String(body.lineId || '');
        const deadline = returnDeadline(body.deliveredAt);
        if (!deadline) return res.status(400).json({ error: 'This line has not been marked delivered.' });
        if (Date.now() > Date.parse(deadline)) return res.status(400).json({ error: `The 15-day return window closed at ${deadline}.` });
        const saved = await store.update(String(req.params.id), (b) => {
            const l = b.lines.find((x) => x.id === lineId);
            if (!l || !b.placements[l.retailer] || b.placements[l.retailer].state !== 'placed') return null;
            b.returns[lineId] = b.returns[lineId] || { requests: [] };
            b.returns[lineId].requests.push({
                at: new Date().toISOString(),
                deliveredAt: body.deliveredAt,
                deadline,
                caller: cleanText(body.caller, 120),
                condition: cleanText(body.condition, 300),
                note: cleanText(body.note, 500),
                by: cleanText(body.by, 80) || 'admin',
            });
            store.addLog(b, body.by || 'admin', `Return request logged for ${lineId} (window ends ${deadline})`);
            return b;
        });
        if (!saved) return res.status(400).json({ error: 'That line was not purchased.' });
        res.json({ ok: true, deadline, batch: adminView(saved) });
    });

    app.post('/api/admin/buy/batches/:id/return-refund', async (req, res) => {
        if (!admin(req, res)) return;
        const body = req.body || {};
        const lineId = String(body.lineId || '');
        const requestId = cleanText(body.requestId, 80);
        if (!requestId) return res.status(400).json({ error: 'requestId is required' });
        const b = store.read(String(req.params.id));
        if (!b || !b.payment) return res.status(400).json({ error: 'Not a paid order.' });
        const l = b.lines.find((x) => x.id === lineId);
        if (!l || !b.placements[l.retailer] || b.placements[l.retailer].state !== 'placed') return res.status(400).json({ error: 'That line was not purchased.' });
        const r = b.returns[lineId];
        const req0 = r && r.requests && r.requests.find((x) => Date.parse(x.at) <= Date.parse(x.deadline));
        if (!req0) return res.status(400).json({ error: 'No return request was logged inside the 15-day window.' });
        if (r.refunded) return res.status(400).json({ error: 'This line was already refunded.' });
        if (body.notNonReturnable !== true) return res.status(400).json({ error: 'Confirm the item is not in a non-returnable category.' });
        if (body.retailerAccepted !== true && body.backResalable !== true) {
            return res.status(400).json({ error: 'Record that the retailer accepted the return, or that the item is back with us in resalable condition.' });
        }
        const a = lineAllocation(b.paidBill, lineId);
        const amount = Math.min(a.merchCents + a.retailerTaxCents + (body.retailerRefundedShipping === true ? a.shippingCents : 0), b.payment.amountCents - refundedCents(b));
        if (amount <= 0) return res.status(400).json({ error: 'Nothing left to refund.' });
        const rec = await refund(b, amount, { requestId, full: false, reason: body.reason || 'Accepted return', by: body.by, kind: 'return', lineIds: [lineId] });
        if (!rec.ok) return res.status(400).json({ error: rec.error || 'Refund failed', batch: adminView(store.read(b.id)) });
        await store.update(b.id, (x) => {
            x.returns[lineId].refunded = { at: rec.at, amountCents: amount, by: rec.by, retailerAccepted: body.retailerAccepted === true, backResalable: body.backResalable === true };
            return x;
        });
        res.json({ ok: true, refund: rec, batch: adminView(store.read(b.id)) });
    });

    app.get('/api/admin/buy/return-deadline', (req, res) => {
        if (!admin(req, res)) return;
        res.json({ ok: true, deadline: returnDeadline(req.query.deliveredAt) });
    });

    app.get('/api/admin/buy/workflows', (req, res) => {
        if (!admin(req, res)) return;
        res.json({ ok: true, workflows: workflows.adminView(), actions: [...workflows.ACTIONS], purposes: [...workflows.PURPOSES] });
    });

    app.post('/api/admin/buy/workflows/:retailer/restore', (req, res) => {
        if (!admin(req, res)) return;
        const out = workflows.restore(String(req.params.retailer), req.body && req.body.version, cleanText(req.body && req.body.by, 80) || 'admin');
        if (!out.ok) return res.status(400).json({ error: out.error });
        res.json({ ok: true, current: out.current });
    });

    app.post('/api/admin/buy/workflows/:retailer/save', (req, res) => {
        if (!admin(req, res)) return;
        const body = req.body || {};
        const out = workflows.saveVersion(String(req.params.retailer), body.steps, {
            source: 'admin',
            savedBy: cleanText(body.by, 80) || 'admin',
            note: cleanText(body.note, 400),
            verified: body.verified === true,
        });
        if (!out.ok) return res.status(400).json({ error: out.error });
        res.json({ ok: true, current: out.current });
    });

    setInterval(() => {
        for (const b of store.list({ limit: 200 })) {
            if (b.status === 'open' && !openExpired(b)) quotes.sweep(b.id).catch(() => {});
        }
    }, 60 * 1000).unref();
};

module.exports.returnDeadline = returnDeadline;
module.exports.lineAllocation = lineAllocation;
