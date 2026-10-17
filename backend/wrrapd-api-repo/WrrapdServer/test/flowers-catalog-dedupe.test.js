const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../lib/flowers/catalog');

test('dedupeDistinctBouquets drops repeated SKUs and shared photos', () => {
  const halloween =
    'https://images.publixcdn.com/pct/images/products/80000/083421-600x600-A.jpg';
  const roses =
    'https://i5.samsclubimages.com/asr/8e869f81-010d-4e54-8595-74a6a0a1151d.ee3761f7831a9ce6776b9a006d24f2a0.jpeg';
  const mixed =
    'https://i5.samsclubimages.com/asr/2d9be757-a32b-4b2e-b90a-ac47998100ea.26c59be3fbb3a82de0b416333f4b47a1.jpeg';

  // Reproduces the 32218 wrap-modal bug: Grok returned one Publix SKU five times.
  const input = [
    { retailer: 'publix', sku: 'publix-83421', imageUrl: halloween, retailPrice: 15.99 },
    { retailer: 'publix', sku: 'publix-83421', imageUrl: halloween, retailPrice: 15.99 },
    { retailer: 'publix', sku: 'publix-83421', imageUrl: halloween, retailPrice: 15.99 },
    { retailer: 'publix', sku: 'publix-83421', imageUrl: halloween, retailPrice: 15.99 },
    { retailer: 'publix', sku: 'publix-83421', imageUrl: halloween, retailPrice: 15.99 },
    { retailer: 'sams', sku: '18312501615', imageUrl: roses, retailPrice: 15.74 },
    { retailer: 'sams', sku: '13779216052', imageUrl: mixed, retailPrice: 19.76 },
    // Different SKU, same photo as jumbo — must also drop.
    {
      retailer: 'sams',
      sku: '13612912757-mini',
      imageUrl: `${halloween}?w=600`,
      retailPrice: 12.98,
    },
  ];

  const out = catalog.dedupeDistinctBouquets(input);
  assert.equal(out.length, 3);
  assert.deepEqual(
    out.map((c) => c.sku),
    ['publix-83421', '18312501615', '13779216052'],
  );
  const imgs = out.map((c) => catalog.imageKey(c.imageUrl));
  assert.equal(new Set(imgs).size, imgs.length);
});
