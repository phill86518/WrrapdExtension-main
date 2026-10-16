/**
 * Registry of checkouts Wrrapd places at retailers (Ulta, Kohl's, …).
 * One record per retailer order number. Multiple customer WB batches can map
 * onto the same checkout when place-pools combine carts.
 *
 * Files: orders/buy-retailer-orders/RO-*.json (hourly orders backup).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const retailers = require('./retailers');
const placePools = require('./place-pools');

let DIR = path.join(__dirname, '..', '..', 'orders', 'buy-retailer-orders');
const ID_RE = /^RO-[A-HJ-NP-Z2-9]{10}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REF_RE = /^[A-Z0-9][A-Z0-9-]{3,39}$/;

/** Test helper — point the registry at a temp folder. */
function setDirForTests(dir) {
    DIR = dir;
}

function ensureDir() {
    fs.mkdirSync(DIR, { recursive: true });
}

function newId() {
    const bytes = crypto.randomBytes(10);
    let s = '';
    for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
    return `RO-${s}`;
}

function fileFor(id) {
    if (!ID_RE.test(String(id || ''))) return null;
    return path.join(DIR, `${id}.json`);
}

function normalizeRef(raw) {
    return String(raw || '')
        .trim()
        .replace(/^#/, '')
        .replace(/\s+/g, '')
        .toUpperCase();
}

function cleanRef(raw) {
    const ref = normalizeRef(raw);
    return REF_RE.test(ref) ? ref : null;
}

function read(id) {
    const fp = fileFor(id);
    if (!fp) return null;
    try {
        return JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch (_) {
        return null;
    }
}

function write(rec) {
    ensureDir();
    const fp = fileFor(rec.id);
    if (!fp) throw new Error('bad retailer order id');
    rec.updatedAt = new Date().toISOString();
    const tmp = `${fp}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rec, null, 2));
    fs.renameSync(tmp, fp);
    return rec;
}

function list({ limit = 500 } = {}) {
    ensureDir();
    const rows = [];
    for (const f of fs.readdirSync(DIR)) {
        if (!/^RO-[A-Z0-9]{10}\.json$/.test(f)) continue;
        try {
            rows.push(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
        } catch (_) {
            /* skip */
        }
    }
    rows.sort((a, b) => String(b.placedAt || b.createdAt).localeCompare(String(a.placedAt || a.createdAt)));
    return rows.slice(0, limit);
}

function findByRetailerRef(retailerId, orderNumber) {
    const ref = normalizeRef(orderNumber);
    if (!ref) return null;
    return list({ limit: 2000 }).find((r) => r.retailer === retailerId && r.retailerOrderNumber === ref) || null;
}

function memberFromBatch(batch, retailerId) {
    const billGroup = batch.paidBill && Array.isArray(batch.paidBill.groups)
        ? batch.paidBill.groups.find((g) => g.retailer === retailerId)
        : null;
    const lineIds = (batch.lines || [])
        .filter((l) => l.retailer === retailerId && l.state === 'ready' && !l.removed && !l.cancelled)
        .map((l) => l.id);
    const titles = (batch.lines || [])
        .filter((l) => lineIds.includes(l.id))
        .map((l) => (l.product && l.product.title) || l.url)
        .filter(Boolean);
    const merchCents = billGroup && Array.isArray(billGroup.items)
        ? billGroup.items.reduce((s, it) => s + (Number(it.cents) || 0), 0)
        : placePools.groupMerchCents(batch, retailerId);
    return {
        batchId: batch.id,
        lineIds,
        merchCents,
        paidGroupSubtotalCents: billGroup ? billGroup.subtotalCents : null,
        gifterName: (batch.payment && batch.payment.gifterName) || '',
        gifteeZip: batch.gifteeZip || '',
        titles: titles.slice(0, 20),
    };
}

function paidCapCents(batches, retailerId) {
    let sum = 0;
    for (const b of batches) {
        const g = b.paidBill && b.paidBill.groups && b.paidBill.groups.find((x) => x.retailer === retailerId);
        if (g) sum += Number(g.subtotalCents) || 0;
    }
    return sum;
}

/**
 * Create or update a retailer order and return it.
 * `batches` are the customer WB batches included on this checkout.
 */
function recordPlacement({
    retailerId,
    retailerOrderNumber,
    retailerTotalCents,
    arrivalDate,
    batches,
    by,
    poolKey,
    membersOverride,
    paidCapCentsOverride,
    skipRetailerGroupCheck,
}) {
    const ref = cleanRef(retailerOrderNumber);
    if (!ref) return { ok: false, error: 'Enter the retailer order number.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(arrivalDate || ''))) {
        return { ok: false, error: 'Enter the date the retailer says it reaches the hub.' };
    }
    const total = Math.round(Number(retailerTotalCents));
    if (!Number.isFinite(total) || total <= 0) return { ok: false, error: 'Enter the retailer order total.' };
    const listBatches = (batches || []).filter(Boolean);
    if (!listBatches.length) return { ok: false, error: 'No customer orders to link.' };
    const hubKeys = listBatches.map((b) => placePools.hubKey(b.hub));
    if (hubKeys.some((k) => k === 'unknown') || new Set(hubKeys).size !== 1) {
        return {
            ok: false,
            error: 'These orders ship to different hubs. Place each hub as its own retailer order.',
        };
    }
    for (const b of listBatches) {
        if (b.status !== 'paid') return { ok: false, error: `Order ${b.id} is not paid.` };
        if (!skipRetailerGroupCheck && (!b.groups || !b.groups[retailerId])) {
            return { ok: false, error: `Retailer is not on ${b.id}.` };
        }
    }
    const cap =
        paidCapCentsOverride != null ? Number(paidCapCentsOverride) : paidCapCents(listBatches, retailerId);
    if (cap > 0 && total > cap) {
        const r = retailers.byId(retailerId);
        const name = r ? r.name : retailerId;
        const over = total - cap;
        const money = (c) => `$${(c / 100).toFixed(2)}`;
        return {
            ok: false,
            error:
                `Entered retailer total ${money(total)} is ${money(over)} above what shoppers paid for ${name} ` +
                `across these orders (${money(cap)}). Do not place it.`,
            discrepancy: {
                retailer: retailerId,
                retailerName: name,
                enteredCents: total,
                shoppersPaidCents: cap,
                overByCents: over,
                batchIds: listBatches.map((b) => b.id),
            },
        };
    }

    const hub = listBatches[0].hub || null;
    const members = Array.isArray(membersOverride)
        ? membersOverride
        : listBatches.map((b) => memberFromBatch(b, retailerId));
    const existing = findByRetailerRef(retailerId, ref);
    const now = new Date().toISOString();
    const who = String(by || 'admin').slice(0, 80);
    const rMeta = retailers.byId(retailerId);

    if (existing) {
        const storedHubKey = existing.hub ? placePools.hubKey(existing.hub) : existing.hubKey || 'unknown';
        if (storedHubKey !== 'unknown' && storedHubKey !== hubKeys[0]) {
            return {
                ok: false,
                error: `Retailer order ${existing.id} already ships to a different hub. Do not add these orders to it.`,
            };
        }
        const memberKey = (m) => `${m.batchId}::${m.addOnId || 'main'}`;
        const byKey = new Map(existing.members.map((m) => [memberKey(m), m]));
        for (const m of members) byKey.set(memberKey(m), m);
        existing.members = [...byKey.values()];
        existing.retailerTotalCents = total;
        existing.arrivalDate = arrivalDate;
        existing.status = 'placed';
        existing.placedAt = existing.placedAt || now;
        existing.by = who;
        if (poolKey) existing.poolKey = poolKey;
        if (hub) {
            existing.hub = hub;
            existing.hubKey = placePools.hubKey(hub);
            existing.hubName = hub.displayName || '';
            existing.hubZip = hub.postalCode || hub.zip || '';
        }
        existing.log = Array.isArray(existing.log) ? existing.log : [];
        existing.log.push({ at: now, who, what: `Updated placement; ${existing.members.length} customer order(s)` });
        if (existing.log.length > 100) existing.log = existing.log.slice(-100);
        return { ok: true, order: write(existing), created: false };
    }

    let id = newId();
    while (fs.existsSync(fileFor(id))) id = newId();
    const rec = {
        id,
        retailer: retailerId,
        retailerName: (rMeta && rMeta.name) || retailerId,
        retailerOrderNumber: ref,
        retailerTotalCents: total,
        arrivalDate,
        status: 'placed',
        hub,
        hubKey: placePools.hubKey(hub),
        hubName: (hub && hub.displayName) || '',
        hubZip: (hub && (hub.postalCode || hub.zip)) || '',
        poolKey: poolKey || null,
        members,
        placedAt: now,
        by: who,
        createdAt: now,
        log: [{ at: now, who, what: `Placed; linked ${members.length} customer order(s)` }],
    };
    return { ok: true, order: write(rec), created: true };
}

/** Build registry rows from legacy batch.placements that are not yet registered. */
function backfillFromBatches(batches) {
    const created = [];
    for (const b of batches || []) {
        if (!b || b.status !== 'paid' || !b.placements) continue;
        for (const [retailerId, p] of Object.entries(b.placements)) {
            if (!p || p.state !== 'placed' || !p.retailerOrderNumber) continue;
            if (p.retailerOrderId && read(p.retailerOrderId)) continue;
            const existing = findByRetailerRef(retailerId, p.retailerOrderNumber);
            if (existing) {
                const storedHubKey = existing.hub ? placePools.hubKey(existing.hub) : existing.hubKey || 'unknown';
                const incomingHubKey = placePools.hubKey(b.hub);
                if (storedHubKey !== incomingHubKey) continue;
                if (!existing.members.some((m) => m.batchId === b.id)) {
                    existing.members.push(memberFromBatch(b, retailerId));
                    write(existing);
                }
                continue;
            }
            const out = recordPlacement({
                retailerId,
                retailerOrderNumber: p.retailerOrderNumber,
                retailerTotalCents: p.retailerTotalCents,
                arrivalDate: p.arrivalDate,
                batches: [b],
                by: p.by || 'backfill',
                poolKey: (p.placeQueue && p.placeQueue.poolKey) || null,
            });
            if (out.ok) created.push(out.order);
        }
    }
    return created;
}

function publicView(rec) {
    if (!rec) return null;
    return {
        id: rec.id,
        retailer: rec.retailer,
        retailerName: rec.retailerName,
        retailerOrderNumber: rec.retailerOrderNumber,
        retailerTotalCents: rec.retailerTotalCents,
        arrivalDate: rec.arrivalDate,
        status: rec.status,
        hubName: rec.hubName,
        hubZip: rec.hubZip,
        hubKey: rec.hubKey,
        poolKey: rec.poolKey || null,
        placedAt: rec.placedAt,
        by: rec.by,
        createdAt: rec.createdAt,
        updatedAt: rec.updatedAt,
        memberCount: (rec.members || []).length,
        merchCents: (rec.members || []).reduce((s, m) => s + (Number(m.merchCents) || 0), 0),
        members: (rec.members || []).map((m) => ({
            batchId: m.batchId,
            lineIds: m.lineIds || [],
            merchCents: m.merchCents,
            paidGroupSubtotalCents: m.paidGroupSubtotalCents,
            gifterName: m.gifterName,
            gifteeZip: m.gifteeZip,
            titles: m.titles || [],
            addOnId: m.addOnId || null,
        })),
        log: rec.log || [],
    };
}

function markCancelled(id, { by, reason } = {}) {
    const rec = read(id);
    if (!rec) return { ok: false, error: 'Retailer order not found.' };
    rec.status = 'cancelled';
    rec.log = Array.isArray(rec.log) ? rec.log : [];
    rec.log.push({
        at: new Date().toISOString(),
        who: String(by || 'admin').slice(0, 80),
        what: `Cancelled${reason ? `: ${String(reason).slice(0, 200)}` : ''}`,
    });
    return { ok: true, order: write(rec) };
}

module.exports = {
    get DIR() {
        return DIR;
    },
    ID_RE,
    REF_RE,
    setDirForTests,
    cleanRef,
    normalizeRef,
    read,
    write,
    list,
    findByRetailerRef,
    memberFromBatch,
    paidCapCents,
    recordPlacement,
    backfillFromBatches,
    publicView,
    markCancelled,
};
