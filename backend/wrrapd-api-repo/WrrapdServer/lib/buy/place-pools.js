/**
 * Paid "to_place" groups are pooled by retailer + exact hub ship-to so multiple customer
 * orders can share one retailer checkout (and free shipping when merchandise crosses the
 * store minimum).
 *
 * Rules:
 * - Pool only when the retailer matches AND the hub address matches exactly
 *   (hub id, street, suite, city, state, ZIP). Different hubs never share a cart
 *   or a free-shipping total, even for the same retailer.
 * - A batch with no complete hub address is never pooled with anything else.
 * - When pooled merchandise meets the free-shipping minimum, the pool is ready immediately.
 * - Otherwise it becomes due at the next place-interval boundary (Eastern top of hour, or every 2 hours).
 *
 * This module never pays a retailer. It only computes pools, stamps placeQueue on groups,
 * and signals when ops (or a future runner) should place.
 */
const standardShipping = require('./standard-shipping');
const retailers = require('./retailers');

const TZ = 'America/New_York';

function etParts(date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const n = (t) => Number(parts.find((p) => p.type === t).value);
    return { y: n('year'), m: n('month'), d: n('day'), h: n('hour'), min: n('minute'), sec: n('second') };
}

/** Exact Eastern wall time → UTC ms (handles DST via iterative correction). */
function etWallToUtcMs(y, m, d, h, min = 0, sec = 0) {
    let guess = Date.UTC(y, m - 1, d, h, min, sec);
    for (let i = 0; i < 4; i++) {
        const p = etParts(new Date(guess));
        const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.sec);
        const want = Date.UTC(y, m - 1, d, h, min, sec);
        guess += want - asUtc;
    }
    return guess;
}

/** Advance an Eastern wall clock by whole hours (DST-safe via UTC ms + re-read). */
function addEtHours(y, m, d, h, hours) {
    let ms = etWallToUtcMs(y, m, d, h, 0, 0) + hours * 3600 * 1000;
    const p = etParts(new Date(ms));
    return { y: p.y, m: p.m, d: p.d, h: p.h, ms: etWallToUtcMs(p.y, p.m, p.d, p.h, 0, 0) };
}

/**
 * Next Eastern place boundary strictly after `from`.
 * intervalHours 1 → next :00. intervalHours 2 → next even hour :00 (0,2,4,… ET).
 */
function nextDueAt(fromIso, intervalHours) {
    const interval = Number(intervalHours) === 2 ? 2 : 1;
    const from = new Date(fromIso);
    if (!Number.isFinite(from.getTime())) return null;
    const p = etParts(from);
    // Always the next whole hour after payment (10:00:00 → 11:00, 10:17 → 11:00).
    let wall = addEtHours(p.y, p.m, p.d, p.h, 1);
    if (interval === 2 && wall.h % 2 !== 0) {
        wall = addEtHours(wall.y, wall.m, wall.d, wall.h, 1);
    }
    return new Date(wall.ms).toISOString();
}

function normHubPart(value) {
    return String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
}

function hubZip5(hub) {
    const raw = normHubPart(hub && (hub.postalCode || hub.zip));
    return raw.slice(0, 5);
}

/**
 * Exact ship-to identity. Two orders pool only when this string matches.
 * Hub id, street, suite, city, state, and ZIP are all required to agree.
 * Returns null when the address is too incomplete to prove it is the same hub.
 */
function hubIdentity(hub) {
    if (!hub || typeof hub !== 'object') return null;
    const line1 = normHubPart(hub.addressLine1);
    const zip = hubZip5(hub);
    if (!line1 || zip.length !== 5) return null;
    const id = normHubPart(hub.hubId || hub.id) || 'NOID';
    const line2 = normHubPart(hub.addressLine2);
    const city = normHubPart(hub.city);
    const state = normHubPart(hub.state);
    return [id, line1, line2, city, state, zip].join('|');
}

function hubKey(hub) {
    return hubIdentity(hub) || 'unknown';
}

function sameHub(a, b) {
    const left = hubIdentity(a);
    const right = hubIdentity(b);
    return !!left && left === right;
}

function groupMerchCents(batch, retailerId) {
    const billGroup = batch.paidBill && Array.isArray(batch.paidBill.groups)
        ? batch.paidBill.groups.find((g) => g.retailer === retailerId)
        : null;
    if (billGroup && Array.isArray(billGroup.items)) {
        return billGroup.items.reduce((s, it) => s + (Number(it.cents) || 0), 0);
    }
    const g = batch.groups && batch.groups[retailerId];
    const prices = g && g.quote && g.quote.itemPrices ? g.quote.itemPrices : {};
    return (batch.lines || [])
        .filter((l) => l.retailer === retailerId && l.state === 'ready' && !l.removed && !l.cancelled)
        .reduce((s, l) => s + (Number(prices[l.id]) || 0), 0);
}

function memberTitles(batch, retailerId) {
    return (batch.lines || [])
        .filter((l) => l.retailer === retailerId && l.state === 'ready' && !l.removed && !l.cancelled)
        .map((l) => (l.product && l.product.title) || l.url)
        .filter(Boolean)
        .slice(0, 12);
}

/**
 * Build live pools from paid batches. Pure — does not mutate.
 * @param {object[]} batches
 * @param {{ placeIntervalHours?: number, placeOnThreshold?: boolean, now?: Date }} opts
 */
function buildPools(batches, opts = {}) {
    const interval = Number(opts.placeIntervalHours) === 2 ? 2 : 1;
    const onThreshold = opts.placeOnThreshold !== false;
    const now = opts.now || new Date();
    const nowMs = now.getTime();
    const map = new Map();

    for (const batch of batches || []) {
        if (!batch || batch.status !== 'paid') continue;
        const paidAt = (batch.payment && batch.payment.paidAt) || batch.updatedAt || batch.createdAt;
        for (const g of Object.values(batch.groups || {})) {
            if (!g || !g.placement || g.placement.state !== 'to_place') continue;
            const retailerId = g.retailer;
            const identity = hubIdentity(batch.hub);
            // Incomplete or missing hub: its own pool. Never share free shipping.
            const key = identity ? `${retailerId}::${identity}` : `${retailerId}::unpooled:${batch.id}`;
            if (!map.has(key)) {
                const freeOver = standardShipping.freeOverCents(retailerId);
                map.set(key, {
                    poolKey: key,
                    retailer: retailerId,
                    retailerName: (retailers.byId(retailerId) && retailers.byId(retailerId).name) || g.retailerName || retailerId,
                    hubKey: identity || 'unknown',
                    hubName: (batch.hub && batch.hub.displayName) || '',
                    hubZip: (batch.hub && (batch.hub.postalCode || batch.hub.zip)) || '',
                    freeOverCents: freeOver,
                    merchCents: 0,
                    paidCapCents: 0,
                    members: [],
                    earliestPaidAt: null,
                });
            }
            const pool = map.get(key);
            const merch = groupMerchCents(batch, retailerId);
            const billGroup =
                batch.paidBill && Array.isArray(batch.paidBill.groups)
                    ? batch.paidBill.groups.find((x) => x.retailer === retailerId)
                    : null;
            const paidGroupSubtotalCents = billGroup ? Number(billGroup.subtotalCents) || 0 : 0;
            pool.merchCents += merch;
            pool.paidCapCents = (pool.paidCapCents || 0) + paidGroupSubtotalCents;
            pool.members.push({
                batchId: batch.id,
                retailer: retailerId,
                merchCents: merch,
                paidGroupSubtotalCents,
                paidAt,
                titles: memberTitles(batch, retailerId),
                gifterName: (batch.payment && batch.payment.gifterName) || '',
            });
            if (!pool.earliestPaidAt || String(paidAt) < String(pool.earliestPaidAt)) {
                pool.earliestPaidAt = paidAt;
            }
        }
    }

    const pools = [];
    for (const pool of map.values()) {
        const freeOver = pool.freeOverCents;
        const freeShipMet = freeOver != null && pool.merchCents >= freeOver;
        const shipCents = standardShipping.scheduleCents(pool.retailer, pool.merchCents);
        const dueAt = pool.earliestPaidAt ? nextDueAt(pool.earliestPaidAt, interval) : null;
        const scheduleDue = dueAt ? nowMs >= Date.parse(dueAt) : false;
        let status = 'accumulating';
        let reason = 'waiting_for_schedule_or_threshold';
        if (onThreshold && freeShipMet) {
            status = 'ready_threshold';
            reason = freeOver === 0 ? 'free_shipping_always' : 'free_shipping_threshold_met';
        } else if (scheduleDue) {
            status = 'due_schedule';
            reason = 'place_interval_elapsed';
        }
        const actionable = status === 'ready_threshold' || status === 'due_schedule';
        pools.push({
            ...pool,
            paidCapCents: pool.paidCapCents || 0,
            placeIntervalHours: interval,
            freeShipMet,
            shipCentsIfPlaced: shipCents,
            dueAt,
            status,
            reason,
            actionable,
            memberCount: pool.members.length,
            batchIds: pool.members.map((m) => m.batchId),
        });
    }

    pools.sort((a, b) => {
        const rank = { ready_threshold: 0, due_schedule: 1, accumulating: 2 };
        return (rank[a.status] - rank[b.status]) || String(a.retailer).localeCompare(String(b.retailer)) || String(a.hubZip).localeCompare(String(b.hubZip));
    });
    return pools;
}

function placeQueueSnapshot(pool) {
    return {
        poolKey: pool.poolKey,
        status: pool.status,
        reason: pool.reason,
        actionable: pool.actionable,
        merchPoolCents: pool.merchCents,
        freeOverCents: pool.freeOverCents,
        freeShipMet: pool.freeShipMet,
        shipCentsIfPlaced: pool.shipCentsIfPlaced,
        dueAt: pool.dueAt,
        placeIntervalHours: pool.placeIntervalHours,
        memberBatchIds: pool.batchIds.slice(),
        memberCount: pool.memberCount,
        hubName: pool.hubName,
        hubZip: pool.hubZip,
        updatedAt: new Date().toISOString(),
    };
}

function queueChanged(prev, next) {
    if (!prev) return true;
    return (
        prev.status !== next.status ||
        prev.merchPoolCents !== next.merchPoolCents ||
        prev.dueAt !== next.dueAt ||
        prev.freeShipMet !== next.freeShipMet ||
        String(prev.memberBatchIds || []) !== String(next.memberBatchIds || [])
    );
}

/**
 * Stamp placeQueue on each to_place group in the pool. Returns pools that newly became
 * actionable (one entry per pool) so ops can be emailed once.
 */
async function applyPools(pools, { updateBatch, readBatch, now } = {}) {
    const alerts = [];
    const when = (now || new Date()).toISOString();
    for (const pool of pools) {
        const snap = placeQueueSnapshot(pool);
        let alreadyAlertedAt = null;
        if (readBatch) {
            for (const member of pool.members) {
                const batch = readBatch(member.batchId);
                const pq = batch && batch.groups && batch.groups[member.retailer] && batch.groups[member.retailer].placement
                    ? batch.groups[member.retailer].placement.placeQueue
                    : null;
                if (pq && pq.poolKey === pool.poolKey && pq.readyAlertedAt && pq.status === pool.status) {
                    alreadyAlertedAt = pq.readyAlertedAt;
                    break;
                }
            }
        }
        const shouldAlert = pool.actionable && !alreadyAlertedAt;
        const alertAt = pool.actionable ? alreadyAlertedAt || when : null;
        if (shouldAlert) alerts.push({ pool, batchId: pool.batchIds[0], retailer: pool.retailer });

        if (!updateBatch) continue;
        for (const member of pool.members) {
            await updateBatch(member.batchId, (batch) => {
                const g = batch.groups && batch.groups[member.retailer];
                if (!g || !g.placement || g.placement.state !== 'to_place') return null;
                const prev = g.placement.placeQueue || null;
                const next = { ...snap, readyAlertedAt: alertAt || (prev && prev.readyAlertedAt) || null };
                if (!pool.actionable) next.readyAlertedAt = null;
                if (!queueChanged(prev, next) && (prev && prev.readyAlertedAt) === next.readyAlertedAt) return null;
                g.placement.placeQueue = next;
                return batch;
            });
        }
    }
    return alerts;
}

module.exports = {
    TZ,
    etParts,
    nextDueAt,
    hubIdentity,
    hubKey,
    sameHub,
    buildPools,
    placeQueueSnapshot,
    applyPools,
    groupMerchCents,
};
