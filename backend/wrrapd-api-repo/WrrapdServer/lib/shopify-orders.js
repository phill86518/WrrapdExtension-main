/**
 * Normalize Shopify App webhook payloads into Command Center ingest shape.
 * Developer: Wrrapd Inc. — retailer label is always "Shopify".
 */

const deliveryHubs = require('./delivery-hubs');

function str(v, max = 500) {
    if (v == null) return '';
    return String(v).trim().slice(0, max);
}

function attrMap(order) {
    const out = {};
    const list = Array.isArray(order?.note_attributes)
        ? order.note_attributes
        : Array.isArray(order?.noteAttributes)
          ? order.noteAttributes
          : [];
    for (const a of list) {
        const name = str(a?.name || a?.key, 120).toLowerCase();
        if (!name) continue;
        out[name] = str(a?.value, 2000);
    }
    return out;
}

function wantsWrrapd(order, attrs) {
    const wrap = attrs._wrrapd_wrap || attrs['wrrapd_wrap'] || attrs.wrrapd || '';
    if (/^(1|true|yes)$/i.test(wrap)) return true;
    return str(order?.note).toLowerCase().includes('wrrapd wrap');
}

function splitName(full) {
    const parts = str(full, 200).split(/\s+/).filter(Boolean);
    if (!parts.length) return { first: '', last: '' };
    if (parts.length === 1) return { first: parts[0], last: '' };
    return { first: parts[0], last: parts.slice(1).join(' ') };
}

function shippingFromOrder(order) {
    const s = order?.shipping_address || order?.shippingAddress || {};
    return {
        name: str(s.name || [s.first_name, s.last_name].filter(Boolean).join(' '), 200),
        line1: str(s.address1 || s.address_line1 || s.line1, 300),
        line2: str(s.address2 || s.address_line2 || s.line2, 300),
        city: str(s.city, 120),
        state: str(s.province_code || s.province || s.state, 40),
        postalCode: str(s.zip || s.postal_code || s.postalCode, 20).replace(/\D/g, '').slice(0, 5),
        phone: str(s.phone, 40),
        country: str(s.country_code || s.country || 'US', 40),
    };
}

function gifteeFromAttrs(attrs, fallbackShipping) {
    const zip = str(attrs._wrrapd_giftee_zip || attrs.wrrapd_giftee_zip, 10).replace(/\D/g, '').slice(0, 5);
    const name = str(attrs._wrrapd_giftee_name || attrs.wrrapd_giftee_name, 200);
    // Phase 1: giftee street may arrive later via order-status extension; ZIP drives hub.
    return {
        name: name || fallbackShipping.name || 'Giftee',
        line1: str(attrs._wrrapd_giftee_line1, 300) || fallbackShipping.line1 || 'N/A',
        line2: str(attrs._wrrapd_giftee_line2, 300) || fallbackShipping.line2 || '',
        city: str(attrs._wrrapd_giftee_city, 120) || fallbackShipping.city || 'N/A',
        state: str(attrs._wrrapd_giftee_state, 40) || fallbackShipping.state || 'N/A',
        postalCode: zip || fallbackShipping.postalCode || '00000',
    };
}

function lineItemsFromOrder(order, attrs) {
    const rows = Array.isArray(order?.line_items)
        ? order.line_items
        : Array.isArray(order?.lineItems)
          ? order.lineItems
          : [];
    const wrappingOption = str(attrs._wrrapd_wrapping_option || 'Classic', 80) || 'Classic';
    const giftMessage = str(attrs._wrrapd_gift_message || attrs.wrrapd_gift_message, 1000);
    const senderName = str(attrs._wrrapd_sender_name, 200);
    const occasion = str(attrs._wrrapd_occasion || attrs.wrrapd_occasion, 80);
    const flowers = /^(1|true|yes)$/i.test(attrs._wrrapd_flowers || '');

    return rows.slice(0, 40).map((it) => ({
        title: str(it.title || it.name, 300) || 'Wrapped item',
        asin: str(it.sku || it.variant_id || it.product_id, 80),
        imageUrl: '',
        wrappingOption,
        flowers,
        giftMessage,
        senderName,
        occasion,
        quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
    }));
}

/**
 * @param {{ shop: string, topic?: string, order: object }} input
 * @returns {{ ok: true, ingest: object } | { ok: false, reason: string, skip?: boolean }}
 */
function buildIngestFromShopify(input) {
    const shop = str(input?.shop, 200);
    const order = input?.order;
    if (!shop || !order || typeof order !== 'object') {
        return { ok: false, reason: 'shop and order required' };
    }

    const attrs = attrMap(order);
    if (!wantsWrrapd(order, attrs)) {
        return { ok: false, reason: 'not a Wrrapd wrap order', skip: true };
    }

    const ship = shippingFromOrder(order);
    const giftee = gifteeFromAttrs(attrs, ship);
    const customerEmail = str(
        order.email || order.contact_email || order.customer?.email,
        200,
    );
    const customerName = str(
        order.customer
            ? [order.customer.first_name, order.customer.last_name].filter(Boolean).join(' ')
            : ship.name,
        200,
    ) || 'Shopify shopper';
    const customerPhone = str(order.phone || ship.phone || order.customer?.phone, 40);
    const orderName = str(order.name || order.order_number || order.id, 80);
    const externalOrderId = `SH-${shop.replace(/\.myshopify\.com$/i, '')}-${orderName}`.slice(0, 120);
    const lineItems = lineItemsFromOrder(order, attrs);
    if (!lineItems.length) {
        return { ok: false, reason: 'no line items' };
    }

    let hubNote = '';
    try {
        const { hub } = deliveryHubs.nearestHub(giftee.postalCode);
        if (hub) hubNote = ` Hub: ${hub.name} (${hub.postalCode}).`;
    } catch (_) {
        /* ignore */
    }

    const scheduledFor = new Date(Date.now() + 86400000).toISOString();
    const ingest = {
        retailer: 'Shopify',
        customerName,
        customerPhone,
        customerEmail,
        recipientName: giftee.name,
        addressLine1: giftee.line1,
        addressLine2: giftee.line2,
        city: giftee.city,
        state: giftee.state,
        postalCode: giftee.postalCode,
        gifteeAddress: {
            name: giftee.name,
            line1: giftee.line1,
            line2: giftee.line2,
            city: giftee.city,
            state: giftee.state,
            postalCode: giftee.postalCode,
        },
        externalOrderId,
        lineItems,
        scheduledFor,
        sourceNote: `Shopify order ${orderName} from ${shop}; ${lineItems.length} item(s).${hubNote}`,
        shopify: {
            shop,
            orderId: str(order.id, 40),
            orderName,
            topic: str(input.topic, 40),
            hubLabel: str(attrs._wrrapd_hub_label, 300),
            merchantShipTo: ship,
        },
    };

    return { ok: true, ingest };
}

module.exports = {
    buildIngestFromShopify,
    wantsWrrapd,
    attrMap,
};
