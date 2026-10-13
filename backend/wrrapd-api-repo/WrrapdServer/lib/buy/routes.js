/**
 * "We buy it for you" — public routes for wrrapd.com/buy/ and pay.wrrapd.com/buy/pay, and admin
 * routes for Command Center → We buy it. New routes only; existing routes are untouched.
 */
const path = require('path');
const store = require('./store');
const config = require('./config');
const resolveLink = require('./resolve-link');
const retailers = require('./retailers');
const terms = require('./terms');
const billing = require('./billing');
const quotes = require('./quotes');
const workflows = require('./workflows');
const runner = require('./runner');
const emails = require('./emails');
const flowerCatalog = require('../flowers/catalog');
const extensionConfig = require('../extension-config');
const { rateLimit } = require('../rate-limit');

const INGEST_TAG = 'ingest-v2026-10-13-buy-for-you';
const BATCH_TTL_MS = 24 * 60 * 60 * 1000;
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

function publicLine(l) {
    const p = l.product || null;
    return {
        id: l.id,
        url: l.url,
        retailer: l.retailer,
        retailerName: l.retailerName,
        state: l.removed ? 'removed' : l.state,
        message: l.state === 'unavailable' ? l.message || quotes.UNAVAILABLE : '',
        product: p
            ? {
                  title: p.title || '',
                  imageUrl: p.imageUrl || '',
                  isElectronics: p.isElectronics === true,
                  pagePriceCents: p.pagePriceCents || null,
                  pageNotes: Array.isArray(p.pageNotes) ? p.pageNotes.slice(0, 2) : [],
                  variantGroups: l.state === 'needs_variant' ? p.variantGroups || [] : [],
              }
            : null,
        variantLabel: l.variantLabel || '',
        wrap: l.wrap || null,
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
        lines: batch.lines.map(publicLine),
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
        orderNumber: batch.status === 'paid' || batch.status === 'closed' ? batch.id : null,
        paidBill: batch.paidBill || null,
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
        if (batch.status === 'open' && Date.now() - Date.parse(batch.createdAt) > BATCH_TTL_MS) {
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
        const seen = new Set();
        const now = new Date().toISOString();
        const opened = await Promise.all(raw.map((text) => resolveLink.resolveLink(text, cfg.allowedRetailers)));
        const lines = opened.map((parsed, i) => {
            const text = raw[i];
            const named = retailers.byId(parsed.retailer);
            const base = { id: `L${i + 1}`, addedAt: now, url: text.slice(0, 2000), wrap: null };
            if (!parsed.ok) {
                return {
                    ...base,
                    retailer: parsed.retailer || 'none',
                    retailerName: named ? named.name : '',
                    state: 'unavailable',
                    reason: parsed.reason,
                    message: REASON_TEXT[parsed.reason] || quotes.UNAVAILABLE,
                };
            }
            if (seen.has(parsed.canonicalUrl)) {
                return { ...base, retailer: parsed.retailer, retailerName: parsed.retailerName, state: 'unavailable', reason: 'duplicate', message: REASON_TEXT.duplicate };
            }
            seen.add(parsed.canonicalUrl);
            return { ...base, url: parsed.url, canonicalUrl: parsed.canonicalUrl, productId: parsed.productId, retailer: parsed.retailer, retailerName: parsed.retailerName, state: 'reading' };
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
        res.status(201).json({ ok: true, id: batch.id, token: batch.token, batch: publicView(store.read(batch.id)) });
    });

    app.get('/api/buy/batches/:id', async (req, res) => {
        if (!api(req, res)) return;
        const batch = loadForShopper(req, res);
        if (!batch) return;
        const swept = await quotes.sweep(batch.id);
        res.json({ ok: true, batch: publicView(swept || store.read(batch.id)) });
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
            res.json({ ok: true, batch: publicView(store.read(batch.id)) });
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
                    picked.push(`${g.name}: ${v}`);
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
            const text = String((req.body && req.body.url) || '').trim();
            if (!text) return { error: 'Please paste a product link.' };
            const openCount = batch.lines.filter((l) => !l.removed).length;
            if (openCount >= cfg.maxLinks) return { error: `Please paste up to ${cfg.maxLinks} links.` };
            const parsed = await resolveLink.resolveLink(text, cfg.allowedRetailers);
            const named = retailers.byId(parsed.retailer);
            await store.update(batch.id, (b) => {
                const id = `L${b.lines.length + 1}`;
                const base = { id, addedAt: new Date().toISOString(), url: text.slice(0, 2000), wrap: null };
                if (!parsed.ok) {
                    b.lines.push({
                        ...base,
                        retailer: parsed.retailer || 'none',
                        retailerName: named ? named.name : '',
                        state: 'unavailable',
                        reason: parsed.reason,
                        message: REASON_TEXT[parsed.reason] || quotes.UNAVAILABLE,
                    });
                } else if (b.lines.some((l) => !l.removed && l.canonicalUrl === parsed.canonicalUrl)) {
                    b.lines.push({
                        ...base,
                        retailer: parsed.retailer,
                        retailerName: parsed.retailerName,
                        state: 'unavailable',
                        reason: 'duplicate',
                        message: REASON_TEXT.duplicate,
                    });
                } else {
                    b.lines.push({
                        ...base,
                        url: parsed.url,
                        canonicalUrl: parsed.canonicalUrl,
                        productId: parsed.productId,
                        retailer: parsed.retailer,
                        retailerName: parsed.retailerName,
                        state: 'reading',
                    });
                    quotes.ensureGroup(b, parsed.retailer);
                }
                store.addLog(b, 'shopper', `Added a link (${id})`);
                return b;
            });
            quotes.processBatch(batch.id).catch((e) => console.error('[buy] processBatch', e && e.message));
            return null;
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
            if (!line || line.state !== 'ready' || line.removed) return { error: 'Please refresh the page.' };
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

    app.get('/api/admin/buy/batches', async (req, res) => {
        if (!admin(req, res)) return;
        const rows = store.list({ limit: 300 });
        for (const b of rows) if (b.status === 'open') await quotes.sweep(b.id).catch(() => {});
        const fresh = store.list({ limit: 300 });
        res.json({
            ok: true,
            batches: fresh.map((b) => ({
                id: b.id,
                status: b.status === 'open' && Date.now() - Date.parse(b.createdAt) > BATCH_TTL_MS ? 'expired' : b.status,
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
            })),
        });
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
                itemCategory: l.product.category || '',
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
            if (b.status === 'open' && Date.now() - Date.parse(b.createdAt) < BATCH_TTL_MS) quotes.sweep(b.id).catch(() => {});
        }
    }, 60 * 1000).unref();
};

module.exports.returnDeadline = returnDeadline;
module.exports.lineAllocation = lineAllocation;
