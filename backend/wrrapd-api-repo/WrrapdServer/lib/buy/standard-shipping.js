/**
 * Standard U.S. ship-to-home rates. No club, card, or paid membership.
 * One charge per retailer order. Merchandise is the item total before tax.
 * When the order meets the store's free-shipping minimum, the charge is $0.
 * Under that minimum, a price printed for the order is kept; otherwise the standard fee is used.
 *
 * Checked October 2026:
 * Nordstrom standard is free at any amount.
 * Kohl's standard is $8.95 under $49 and free from $49.
 * Walmart standard is $6.99 under $35 and free from $35.
 * Target standard is $5.99 under $35 and free from $35.
 * Amazon standard is free from $35. Under $35 the charge is $3.99.
 * Sephora guest standard is $6.95 under $50 and free from $50.
 * Ulta standard is $6.95 under $35 and free from $35.
 * Best Buy standard is free from $35. Under $35 the page price is kept when it is shown.
 * When it is not shown, the charge is $5.99, the top of Best Buy's $3.99–$5.99 range.
 * LEGO standard is $4.95 up to $25, $6.95 from $25.01 to $34.99, and free from $35.
 * Etsy shipping is set by the seller.
 */

const RATES = {
    nordstrom: { feeCents: 0, freeOverCents: 0 },
    kohls: { feeCents: 895, freeOverCents: 4900 },
    walmart: { feeCents: 699, freeOverCents: 3500 },
    target: { feeCents: 599, freeOverCents: 3500 },
    amazon: { feeCents: 399, freeOverCents: 3500 },
    sephora: { feeCents: 695, freeOverCents: 5000 },
    ulta: { feeCents: 695, freeOverCents: 3500 },
    bestbuy: { feeCents: 599, freeOverCents: 3500 },
    lego: {
        tiers: [
            { maxCents: 2500, feeCents: 495 },
            { maxCents: 3499, feeCents: 695 },
            { maxCents: Infinity, feeCents: 0 },
        ],
    },
};

function scheduleCents(retailer, merchandiseCents) {
    const rate = RATES[retailer];
    const merch = Number(merchandiseCents) || 0;
    if (!rate) return null;
    if (rate.tiers) {
        const tier = rate.tiers.find((t) => merch <= t.maxCents);
        return tier ? tier.feeCents : 0;
    }
    if (rate.freeOverCents != null && merch >= rate.freeOverCents) return 0;
    return rate.feeCents;
}

/** One standard shipping charge for a retailer order shipping to the hub. */
function groupShipCents(retailer, merchandiseCents, pageCents) {
    const scheduled = scheduleCents(retailer, merchandiseCents);
    if (scheduled === 0) return 0;
    if (pageCents != null && pageCents > 0) return pageCents;
    if (scheduled != null) return scheduled;
    return pageCents != null ? pageCents : null;
}

/** Standard ground when the store page prints a price but no arrival date. Skips weekends on the Eastern calendar. */
const ESTIMATE_BUSINESS_DAYS = 5;

function estimateArrivalDate(from = new Date(), businessDays = ESTIMATE_BUSINESS_DAYS) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(from).split('-').map(Number);
    let y = parts[0];
    let m = parts[1];
    let d = parts[2];
    let left = businessDays;
    while (left > 0) {
        const dt = new Date(Date.UTC(y, m - 1, d + 1));
        y = dt.getUTCFullYear();
        m = dt.getUTCMonth() + 1;
        d = dt.getUTCDate();
        if (dt.getUTCDay() !== 0 && dt.getUTCDay() !== 6) left -= 1;
    }
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Fills a missing per-item shipping price from the standard schedule for that item's price. */
function fillMissing(retailer, chosen, merchandiseCents) {
    if (chosen && chosen.cents != null) return chosen;
    const scheduled = scheduleCents(retailer, Number(merchandiseCents) || 0);
    if (scheduled == null) return chosen;
    return {
        label: 'Standard shipping',
        cents: scheduled,
        arrivalDate: (chosen && chosen.arrivalDate) || null,
        note: (chosen && chosen.note) || '',
    };
}

module.exports = { RATES, scheduleCents, groupShipCents, fillMissing, estimateArrivalDate, ESTIMATE_BUSINESS_DAYS };
