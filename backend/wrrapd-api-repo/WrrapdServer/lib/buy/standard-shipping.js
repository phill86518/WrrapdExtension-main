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

/** Merchandise cents at which standard shipping becomes free; null when unknown (e.g. Etsy). 0 = always free. */
function freeOverCents(retailer) {
    const rate = RATES[retailer];
    if (!rate) return null;
    if (rate.tiers) {
        const idx = rate.tiers.findIndex((t) => t.feeCents === 0);
        if (idx < 0) return null;
        if (idx === 0) return 0;
        return rate.tiers[idx - 1].maxCents + 1;
    }
    return rate.freeOverCents != null ? rate.freeOverCents : null;
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

/**
 * Fills missing standard-ship cents from the retailer schedule, and a calendar
 * estimate when Kohl's (or anyone) printed no date — including when the page ZIP
 * is not the giftee ZIP. Never leave the cart blank for shipping/date.
 */
function fillMissing(retailer, chosen, merchandiseCents) {
    const scheduled = scheduleCents(retailer, Number(merchandiseCents) || 0);
    const cents = chosen && chosen.cents != null ? chosen.cents : scheduled;
    if (cents == null && !(chosen && chosen.arrivalDate)) return chosen || null;
    return {
        label: (chosen && chosen.label) || 'Standard shipping',
        cents: cents != null ? cents : null,
        arrivalDate: (chosen && chosen.arrivalDate) || estimateArrivalDate(),
        arrivalDateEnd: (chosen && chosen.arrivalDateEnd) || null,
        note: (chosen && chosen.note) || '',
    };
}

module.exports = { RATES, scheduleCents, freeOverCents, groupShipCents, fillMissing, estimateArrivalDate, ESTIMATE_BUSINESS_DAYS };
