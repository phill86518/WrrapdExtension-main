const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const shopifyOrders = require('../lib/shopify-orders');

describe('shopify-orders', () => {
  it('builds ingest for a wrap-opt-in Shopify order', () => {
    const built = shopifyOrders.buildIngestFromShopify({
      shop: 'demo-boutique.myshopify.com',
      topic: 'ORDERS_PAID',
      order: {
        id: 1001,
        name: '#1001',
        email: 'shopper@example.com',
        note_attributes: [
          { name: '_wrrapd_wrap', value: '1' },
          { name: '_wrrapd_giftee_zip', value: '32202' },
          { name: '_wrrapd_gift_message', value: 'Happy birthday!' },
          { name: '_wrrapd_occasion', value: 'Birthday' },
        ],
        shipping_address: {
          first_name: 'Alex',
          last_name: 'Buyer',
          address1: '1 Hub Way',
          city: 'Jacksonville',
          province_code: 'FL',
          zip: '32226',
          phone: '9045550100',
        },
        line_items: [{ title: 'Ceramic Mug', sku: 'MUG-1', quantity: 1 }],
      },
    });
    assert.equal(built.ok, true);
    assert.equal(built.ingest.retailer, 'Shopify');
    assert.match(built.ingest.externalOrderId, /^SH-demo-boutique-/);
    assert.equal(built.ingest.gifteeAddress.postalCode, '32202');
    assert.equal(built.ingest.lineItems[0].giftMessage, 'Happy birthday!');
    assert.equal(built.ingest.lineItems[0].occasion, 'Birthday');
    assert.match(built.ingest.sourceNote, /Shopify order #1001/);
  });

  it('skips orders without Wrrapd wrap attributes', () => {
    const built = shopifyOrders.buildIngestFromShopify({
      shop: 'demo-boutique.myshopify.com',
      order: {
        name: '#1002',
        line_items: [{ title: 'Sock', quantity: 1 }],
        note_attributes: [],
      },
    });
    assert.equal(built.ok, false);
    assert.equal(built.skip, true);
  });
});
