/**
 * Quote engine for a batch: read each product page, then get one retailer cost-page quote per
 * retailer (automated runner when switched on and ready, otherwise the Command Center quote desk).
 * Rows that cannot be confirmed in time become unavailable and are shown to the shopper at once.
 */
const store = require('./store');
const config = require('./config');
const retailers = require('./retailers');
const pageReader = require('./page-reader');
const suppliedProduct = require('./supplied-product');
const runner = require('./runner');
const billing = require('./billing');
const salesTax = require('../sales-tax-zip');

const UNAVAILABLE = "We can't buy this item right now.";
const READ_STUCK_MS = 3 * 60 * 1000;
const readingBatches = new Set();
let alertFn = async () => {};

function setAlert(fn) {
    alertFn = typeof fn === 'function' ? fn : alertFn;
}

function activeLines(batch, retailerId) {
    return batch.lines.filter((l) => l.retailer === retailerId && !l.removed && l.state !== 'unavailable');
}

function money(cents) {
    return `$${(Number(cents) / 100).toFixed(2)}`;
}

function overLimitMessage(priceCents, capCents) {
    return `This item is over the purchase limit (${money(priceCents)} versus ${money(capCents)}).`;
}

function markUnavailable(line, reason, message) {
    line.state = 'unavailable';
    line.reason = String(reason || 'unavailable').slice(0, 200);
    line.message = message || UNAVAILABLE;
}

function ensureGroup(batch, retailerId) {
    batch.groups = batch.groups || {};
    if (!batch.groups[retailerId]) {
        const r = retailers.byId(retailerId);
        batch.groups[retailerId] = {
            retailer: retailerId,
            retailerName: r ? r.name : retailerId,
            state: 'waiting',
            quote: null,
            history: [],
            selectedShippingId: null,
        };
    }
    return batch.groups[retailerId];
}

/** Opens a quote request for a retailer group (initial, after a change, or at the booking click). */
function openQuoteRequest(batch, retailerId, kind) {
    const g = ensureGroup(batch, retailerId);
    const lines = activeLines(batch, retailerId);
    if (!lines.length) {
        g.state = 'empty';
        return null;
    }
    if (lines.some((l) => l.state === 'reading' || l.state === 'needs_variant')) {
        g.state = 'waiting';
        return null;
    }
    const cfg = config.load();
    const now = Date.now();
    if (g.quote) g.history = [...(g.history || []), g.quote].slice(-10);
    g.previousQuote = g.quote || g.previousQuote || null;
    g.quote = null;
    g.state = 'quoting';
    g.kind = kind;
    g.requestedAt = new Date(now).toISOString();
    g.deadlineAt = new Date(now + cfg.quoteWaitMinutes * 60000).toISOString();
    g.runner = null;
    for (const l of lines) l.state = 'quoting';
    const auto = cfg.automatedQuoteRetailers.includes(retailerId) && runner.status(retailerId).ready;
    if (!auto) g.state = 'needs_person';
    return { retailerId, auto, kind };
}

function salesTaxPercent(batch) {
    const zip = batch.hub && (batch.hub.postalCode || batch.hub.zip);
    const percent = salesTax.getCombinedRateAsTaxPercent(zip);
    return percent == null ? 7.5 : percent;
}

/** One regular shipping price per item, read off the product page. Tax is the hub ZIP rate. */
function pageOfferQuote(batch, retailerId) {
    const lines = activeLines(batch, retailerId);
    if (!lines.length || lines.some((l) => l.state === 'reading' || l.state === 'needs_variant')) return null;
    const itemPrices = {};
    let ship = 0;
    let arrival = null;
    for (const l of lines) {
        const offer = l.product && l.product.pageOffer;
        const opt = offer && offer.shippingOptions && offer.shippingOptions[0];
        if (!offer || !offer.itemPriceCents || !opt || opt.cents == null) return null;
        if (l.retailer === 'target' && opt.cents === 0) {
            const merch = lines.reduce((s, row) => s + ((row.product && row.product.pagePriceCents) || 0), 0);
            if (merch < 3500) return null;
        }
        itemPrices[l.id] = offer.itemPriceCents;
        ship += opt.cents;
        if (opt.arrivalDate && (!arrival || opt.arrivalDate > arrival)) arrival = opt.arrivalDate;
    }
    const merch = Object.values(itemPrices).reduce((s, c) => s + c, 0);
    return {
        itemPrices,
        shippingOptions: [{ label: 'Standard shipping', cents: ship, arrivalDate: arrival }],
        taxCents: Math.round((merch + ship) * salesTaxPercent(batch) / 100),
        source: 'page',
        by: 'page',
    };
}

async function dispatch(batchId, req) {
    if (!req) return;
    if (!req.auto) {
        const b = store.read(batchId);
        const offer = b && pageOfferQuote(b, req.retailerId);
        if (offer) {
            const out = await applyQuote(batchId, req.retailerId, offer);
            if (out && out.ok) return;
        }
        const after = store.read(batchId);
        if (after) await alertFn('quote_needed', after, req.retailerId).catch(() => {});
        return;
    }
    const b = store.read(batchId);
    if (!b) return;
    const lines = activeLines(b, req.retailerId).map((l) => ({ id: l.id, url: l.url, variantLabel: l.variantLabel || '', title: l.product ? l.product.title : '' }));
    const r = retailers.byId(req.retailerId);
    const result = await runner.quote({ retailer: req.retailerId, lines, hub: b.hub, batchId, allowedHosts: r.hosts });
    if (result.ok) {
        await applyQuote(batchId, req.retailerId, { ...result.quote, source: 'runner', by: 'runner' });
        return;
    }
    const after = await store.update(batchId, (batch) => {
        const g = batch.groups[req.retailerId];
        if (!g || g.state !== 'quoting') return null;
        g.state = 'needs_person';
        g.runner = { at: new Date().toISOString(), ok: false, reason: result.reason, failedStep: result.failedStep ?? null };
        store.addLog(batch, 'runner', `${g.retailerName}: automated quote failed (${result.reason}); sent to the quote desk`);
        return batch;
    });
    if (after) await alertFn('quote_needed', after, req.retailerId).catch(() => {});
}

/** Starts quote requests for every group that is ready for one. */
async function kickGroups(batchId, kind) {
    const reqs = [];
    await store.update(batchId, (batch) => {
        for (const retailerId of [...new Set(batch.lines.map((l) => l.retailer))].filter((id) => retailers.byId(id))) {
            const g = ensureGroup(batch, retailerId);
            if (g.state === 'empty' && activeLines(batch, retailerId).length) g.state = 'waiting';
            if (g.state !== 'waiting') continue;
            const req = openQuoteRequest(batch, retailerId, kind || 'initial');
            if (req) reqs.push(req);
        }
        return batch;
    });
    for (const req of reqs) dispatch(batchId, req).catch((e) => console.error('[buy] dispatch', e && e.message));
}

function applyRead(line, read, cfg) {
    if (!read.ok) {
        if (read.reason === 'product_list') return markUnavailable(line, 'product_list', 'This link opens a list of items. Paste the link to one product.');
        if (!read.needsPerson || read.reason === 'blocked' || read.reason === 'no_title') return markUnavailable(line, read.reason);
        line.product = null;
        line.readFailure = read.reason;
        line.state = 'quoting';
        return;
    }
    const p = read.product;
    line.product = p;
    if (p.inStock === false) return markUnavailable(line, 'out_of_stock');
    if (p.isElectronics && !cfg.allowElectronics) return markUnavailable(line, 'electronics_blocked');
    if (p.pagePriceCents && p.pagePriceCents > cfg.perItemCapCents) {
        return markUnavailable(line, 'over_item_limit', overLimitMessage(p.pagePriceCents, cfg.perItemCapCents));
    }
    const open = (p.variantGroups || []).filter((g) => !g.selected || !g.options.includes(g.selected));
    if (!p.pagePriceCents) {
        line.variantLabel = p.choicePrompt || 'Choose a size and color on the product page, then add the link again.';
        line.state = open.length ? 'needs_variant' : 'quoting';
        return;
    }
    if (open.length) {
        line.state = 'needs_variant';
        return;
    }
    line.variantLabel = p.variantGroups.map((g) => `${g.name}: ${g.selected}`).join(', ');
    line.state = 'quoting';
}

/** Writes product facts from outside the page reader onto a cart line. */
function acceptSupplied(line, facts, cfg) {
    const built = suppliedProduct.build(facts);
    if (!built.ok) return built;
    line.removed = false;
    line.reason = '';
    line.message = '';
    line.readFailure = '';
    applyRead(line, { ok: true, product: built.product }, cfg || config.load());
    if (line.state === 'unavailable') return { ok: false, error: line.message || UNAVAILABLE, changed: true };
    if (built.variantLabel) line.variantLabel = built.variantLabel;
    return { ok: true };
}

/** Reads every product page in the batch (two at a time), then requests quotes. */
async function processBatch(batchId) {
    if (readingBatches.has(batchId)) return;
    readingBatches.add(batchId);
    try {
        await processBatchBody(batchId);
    } finally {
        readingBatches.delete(batchId);
    }
}

async function processBatchBody(batchId) {
    const batch = store.read(batchId);
    if (!batch) return;
    const cfg = config.load();
    const todo = batch.lines.filter((l) => l.state === 'reading');
    let i = 0;
    const worker = async () => {
        while (i < todo.length) {
            const line = todo[i++];
            let read;
            try {
                const hub = batch.hub || {};
                read = await pageReader.readProduct({
                    retailer: line.retailer,
                    url: line.url,
                    zip: hub.postalCode || hub.zip || batch.gifteeZip,
                    state: hub.state,
                    batchId,
                    lineId: line.id,
                });
            } catch (e) {
                read = { ok: false, reason: `read_error: ${e && e.message}`, needsPerson: true };
            }
            await store.update(batchId, (b) => {
                const l = b.lines.find((x) => x.id === line.id);
                if (!l || l.state !== 'reading') return null;
                applyRead(l, read, cfg);
                return b;
            });
            await kickGroups(batchId, 'initial');
        }
    };
    await Promise.all([worker(), worker()]);
    await kickGroups(batchId, 'initial');
}

function cleanCents(v) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 && n < 10000000 ? n : null;
}

function cleanQuote(input, lines) {
    const q = input && typeof input === 'object' ? input : {};
    const itemPrices = {};
    for (const l of lines) {
        const c = cleanCents(q.itemPrices && q.itemPrices[l.id]);
        if (c == null || c === 0) return { ok: false, error: `Missing item price for ${l.product ? l.product.title : l.url}` };
        itemPrices[l.id] = c;
    }
    const options = (Array.isArray(q.shippingOptions) ? q.shippingOptions : []).slice(0, 6).map((o, i) => ({
        id: `s${i + 1}`,
        label: String((o && o.label) || '').trim().slice(0, 80) || 'Standard shipping',
        cents: cleanCents(o && o.cents),
        arrivalDate: /^\d{4}-\d{2}-\d{2}$/.test(String((o && o.arrivalDate) || '')) ? o.arrivalDate : null,
        taxCents: o && o.taxCents != null && o.taxCents !== '' ? cleanCents(o.taxCents) : null,
    }));
    if (!options.length || options.some((o) => o.cents == null)) return { ok: false, error: 'Add at least one shipping option with its price (0 for free).' };
    const taxCents = cleanCents(q.taxCents);
    if (taxCents == null && options.some((o) => o.taxCents == null)) return { ok: false, error: 'Retailer tax is required.' };
    return {
        ok: true,
        quote: {
            itemPrices,
            shippingOptions: options,
            taxCents,
            retailerTotalCents: cleanCents(q.retailerTotalCents),
            note: String(q.note || '').slice(0, 400),
        },
    };
}

function maybeFinishRefresh(batch) {
    const r = batch.refresh;
    if (!r || r.state !== 'running') return;
    const pending = r.retailers.filter((id) => {
        const g = batch.groups[id];
        return g && (g.state === 'quoting' || g.state === 'needs_person' || g.state === 'waiting');
    });
    if (pending.length) return;
    r.state = 'done';
    r.doneAt = new Date().toISOString();
    const cfg = config.load();
    const priced = billing.computeBill(batch, cfg);
    r.billHash = priced.ok ? priced.bill.hash : null;
    r.billError = priced.ok ? null : priced.message || priced.error;
    r.totalCents = priced.ok ? priced.bill.totalCents : null;
    r.changed = r.billHash !== r.startBillHash || r.changes.length > 0;
}

/**
 * Applies a cost-page quote (from the runner or the desk). `input.unavailable` lists line ids
 * the desk could not confirm; those rows flip to unavailable.
 */
async function applyQuote(batchId, retailerId, input) {
    let error = null;
    const saved = await store.update(batchId, (batch) => {
        const g = batch.groups && batch.groups[retailerId];
        if (!g) {
            error = 'Unknown retailer group';
            return null;
        }
        if (batch.status !== 'open') {
            error = 'This batch is no longer open for quotes.';
            return null;
        }
        const drop = new Set(Array.isArray(input.unavailable) ? input.unavailable.map(String) : []);
        const lines = activeLines(batch, retailerId).filter((l) => !drop.has(l.id));
        for (const l of lines) {
            const patch = input.lines && input.lines[l.id];
            if (!patch) continue;
            l.product = l.product || {};
            if (patch.title) l.product.title = String(patch.title).slice(0, 300);
            if (patch.imageUrl && /^https:\/\//.test(patch.imageUrl)) l.product.imageUrl = String(patch.imageUrl).slice(0, 1000);
            if (patch.variantLabel != null) l.variantLabel = String(patch.variantLabel).slice(0, 200);
            if (patch.isElectronics != null) l.product.isElectronics = patch.isElectronics === true;
            if (patch.category) l.product.category = String(patch.category).slice(0, 120);
            l.product.variantGroups = l.product.variantGroups || [];
        }
        if (lines.some((l) => !l.product || !l.product.title)) {
            error = 'Every item needs a title.';
            return null;
        }
        let cleaned = { ok: true, quote: null };
        if (lines.length) {
            cleaned = cleanQuote(input, lines);
            if (!cleaned.ok) {
                error = cleaned.error;
                return null;
            }
        }
        const cfg = config.load();
        for (const id of drop) {
            const l = batch.lines.find((x) => x.id === id);
            if (l) markUnavailable(l, input.unavailableReason || 'desk_unavailable');
        }
        for (const l of lines) {
            if (l.product.isElectronics && !cfg.allowElectronics) markUnavailable(l, 'electronics_blocked');
            else if (cleaned.quote.itemPrices[l.id] > cfg.perItemCapCents) markUnavailable(l, 'over_item_limit', overLimitMessage(cleaned.quote.itemPrices[l.id], cfg.perItemCapCents));
        }
        const kept = lines.filter((l) => l.state !== 'unavailable');
        if (!kept.length) {
            g.state = 'unavailable';
            g.quote = null;
        } else {
            const prevSelected = billing.selectedOption({ quote: g.previousQuote, selectedShippingId: g.selectedShippingId });
            g.quote = {
                ...cleaned.quote,
                at: new Date().toISOString(),
                source: input.source === 'runner' ? 'runner' : input.source === 'page' ? 'page' : 'person',
                by: String(input.by || 'admin').slice(0, 80),
            };
            const same = prevSelected && g.quote.shippingOptions.find((o) => o.label === prevSelected.label);
            g.selectedShippingId = same ? same.id : null;
            g.state = 'ready';
            for (const l of kept) l.state = 'ready';
        }
        if (batch.refresh && batch.refresh.state === 'running' && batch.refresh.retailers.includes(retailerId)) {
            const msgs = g.quote ? billing.changeMessages(g.previousQuote, g.quote, g, kept) : [];
            for (const l of lines.filter((x) => x.state === 'unavailable')) {
                msgs.push({ lineId: l.id, kind: 'removed', text: `We can't buy ${l.product.title} right now. It was removed from your bill.` });
            }
            batch.refresh.changes.push(...msgs);
        }
        store.addLog(batch, input.by || input.source, `${g.retailerName}: cost-page quote ${g.state === 'ready' ? 'saved' : 'marked unavailable'}`);
        maybeFinishRefresh(batch);
        return batch;
    });
    return error ? { ok: false, error } : saved ? { ok: true, batch: saved } : { ok: false, error: 'Batch not found' };
}

/** Time-outs: stuck page reads go to the desk; overdue quotes become unavailable rows. */
async function sweep(batchId) {
    const now = Date.now();
    let kick = false;
    const out = await store.update(batchId, (batch) => {
        if (batch.status !== 'open') return null;
        let changed = false;
        for (const l of batch.lines) {
            if (!l.removed && l.reason === 'duplicate') {
                l.removed = true;
                changed = true;
            }
        }
        for (const l of batch.lines) {
            if (l.removed || l.state === 'reading') continue;
            if (l.product && l.product.pagePriceCents) continue;
            if (l.product && l.product.readBy === 'saved_page') continue;
            if (pageReader.savedPageHtml(l.retailer, l.url, { batchId: batch.id, lineId: l.id })) {
                const g = batch.groups && batch.groups[l.retailer];
                l.state = 'reading';
                l.reason = '';
                l.message = '';
                l.readFailure = '';
                l.readStartedAt = new Date(now).toISOString();
                if (g) g.state = 'waiting';
                changed = true;
            }
        }
        for (const l of batch.lines) {
            if (l.removed || l.state !== 'unavailable' || l.reason !== 'quote_timeout') continue;
            const g = batch.groups && batch.groups[l.retailer];
            if (l.product && l.product.pagePriceCents) {
                l.state = 'quoting';
                l.reason = '';
                l.message = '';
                if (g) {
                    g.state = 'needs_person';
                    g.deadlineAt = new Date(now + 24 * 3600 * 1000).toISOString();
                }
                changed = true;
                continue;
            }
            if (!l.product && (l.readTries || 0) < 1) {
                l.state = 'reading';
                l.reason = '';
                l.message = '';
                l.readFailure = '';
                l.readTries = (l.readTries || 0) + 1;
                l.readStartedAt = new Date(now).toISOString();
                if (g) g.state = 'waiting';
                changed = true;
            }
        }
        for (const l of batch.lines) {
            if (l.state === 'reading' && now - Date.parse(l.readStartedAt || l.addedAt || batch.createdAt) > READ_STUCK_MS) {
                l.state = 'quoting';
                l.readFailure = 'read_timeout';
                changed = true;
                kick = true;
            }
        }
        for (const g of Object.values(batch.groups || {})) {
            if ((g.state === 'quoting' || g.state === 'needs_person') && g.deadlineAt && now > Date.parse(g.deadlineAt)) {
                const lines = activeLines(batch, g.retailer);
                const readable = lines.filter((l) => l.product && l.product.pagePriceCents);
                if (readable.length) {
                    g.state = 'needs_person';
                    g.deadlineAt = new Date(now + 24 * 3600 * 1000).toISOString();
                    changed = true;
                    continue;
                }
                for (const l of lines) markUnavailable(l, 'quote_timeout');
                if (batch.refresh && batch.refresh.state === 'running' && batch.refresh.retailers.includes(g.retailer)) {
                    for (const l of lines) {
                        const name = l.product && l.product.title ? l.product.title : 'this item';
                        batch.refresh.changes.push({ lineId: l.id, kind: 'removed', text: `We can't buy ${name} right now. It was removed from your bill.` });
                    }
                }
                g.state = 'unavailable';
                store.addLog(batch, 'system', `${g.retailerName}: no cost-page quote before the deadline; rows marked unavailable`);
                changed = true;
            }
        }
        if (Object.values(batch.groups || {}).some((g) => g.state === 'empty' && activeLines(batch, g.retailer).length)) kick = true;
        if (changed) maybeFinishRefresh(batch);
        return changed ? batch : null;
    });
    if (kick) await kickGroups(batchId, 'initial');
    return out;
}

/** Booking click: re-read every retailer cost page on the bill, always. */
async function startBookingRefresh(batchId) {
    const reqs = [];
    let error = null;
    const saved = await store.update(batchId, (batch) => {
        if (batch.status !== 'open') {
            error = 'closed';
            return null;
        }
        if (batch.refresh && batch.refresh.state === 'running') return null;
        const cfg = config.load();
        const before = billing.computeBill(batch, cfg);
        const ids = [...new Set(billing.readyLines(batch).map((l) => l.retailer))];
        if (!ids.length) {
            error = 'no_ready_items';
            return null;
        }
        batch.refresh = {
            id: `r${Date.now()}`,
            state: 'running',
            startedAt: new Date().toISOString(),
            retailers: ids,
            changes: [],
            startBillHash: before.ok ? before.bill.hash : null,
        };
        for (const id of ids) {
            const req = openQuoteRequest(batch, id, 'booking');
            if (req) reqs.push(req);
        }
        maybeFinishRefresh(batch);
        return batch;
    });
    for (const req of reqs) dispatch(batchId, req).catch((e) => console.error('[buy] dispatch', e && e.message));
    return { error, batch: saved };
}

module.exports = {
    UNAVAILABLE,
    setAlert,
    processBatch,
    acceptSupplied,
    kickGroups,
    openQuoteRequest,
    dispatch,
    applyQuote,
    sweep,
    startBookingRefresh,
    ensureGroup,
    activeLines,
    markUnavailable,
};
