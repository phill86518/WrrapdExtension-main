/**
 * Amazon-only extension payloads must tag the sales channel for tracking / Firestore.
 * Values align with tracking-platform `OrderRetailer`.
 */
export const WRRAPD_RETAILER_AMAZON = 'Amazon';

/** Attach canonical retailer to a plain ingest payload object. */
export function withAmazonRetailer(payload) {
    return { ...payload, retailer: WRRAPD_RETAILER_AMAZON };
}
