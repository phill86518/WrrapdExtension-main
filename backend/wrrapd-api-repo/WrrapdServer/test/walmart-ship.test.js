const test = require('node:test');
const assert = require('node:assert/strict');
const reader = require('../lib/buy/page-reader');

function page({ postal, date, price, free, strength }) {
    const fulfillmentPrice = price == null ? 'null' : JSON.stringify({ price, priceString: `$${price.toFixed(2)}` });
    return [
        `"pageMetadata":{"location":{"postalCode":"${postal}","intentStrength":"${strength || 'EXPLICIT'}"}}`,
        `"shippingText":"Shipping","fulfillmentText":"arrives by tomorrow","locationText":"Somewhere, ${postal}","fulfillmentMethod":"SHIPPING","postalCode":"${postal}"`,
        `"__typename":"ShippingOptionV2","type":"SHIPPING","speedDetails":{"deliveryDate":"${date}T21:59:00.000Z","storeDeliveryDate":"${date}T16:59:00.000-05:00","fulfillmentPrice":${fulfillmentPrice},"freeFulfillment":${free ? 'true' : 'false'}}`,
    ].join(',');
}

test('walmart shipping price and date when the page ZIP matches', () => {
    const ship = reader.walmartShip(page({ postal: '32218', date: '2026-10-16', price: 6.99, free: false }), '32218');
    assert.equal(ship.cents, 699);
    assert.equal(ship.arrivalDate, '2026-10-16');
    assert.equal(ship.choicePrompt, '');
});

test('walmart free shipping', () => {
    const ship = reader.walmartShip(page({ postal: '32218', date: '2026-10-16', price: null, free: true }), '32218');
    assert.equal(ship.cents, 0);
    assert.equal(ship.arrivalDate, '2026-10-16');
});

test('walmart does not use a date from a different ZIP the shopper set', () => {
    const ship = reader.walmartShip(page({ postal: '51502', date: '2026-10-15', price: null, free: false, strength: 'EXPLICIT' }), '32218');
    assert.equal(ship.arrivalDate, null);
    assert.equal(ship.cents, null);
    assert.match(ship.choicePrompt, /51502/);
    assert.match(ship.choicePrompt, /32218/);
});

test('a delivery range uses the later day, and each page keeps its own date', () => {
    const range = reader.standardFromPage('<p>Arrives between Thu, Oct 15 and Fri, Oct 16</p>', 1000);
    assert.equal(range.arrivalDate, '2026-10-16');
    const one = reader.standardFromPage('<p>Get it by Wednesday, October 21</p>', 1000);
    assert.equal(one.arrivalDate, '2026-10-21');
});

test('a page that ships to a different ZIP is refused', () => {
    const html = '<html><body><p>Get It Shipped</p><p>32250</p><p>Standard shipping</p></body></html>';
    assert.equal(reader.pageShipZip(html), '32250');
    assert.match(reader.zipMismatchPrompt('32218', '32250'), /32250/);
    assert.match(reader.zipMismatchPrompt('32218', '32250'), /32218/);
    assert.equal(reader.zipMismatchPrompt('32218', '32218'), '');
    assert.equal(reader.pageShipZip('<p>No shipping zip here</p>'), '');
    assert.equal(reader.zipMismatchPrompt('11212', ''), '');
    assert.equal(reader.zipMismatchPrompt('11212', '11212'), '');
    assert.match(reader.zipMismatchPrompt('11212', '51502'), /51502/);
    assert.match(reader.zipMismatchPrompt('11212', '51502'), /11212/);
});

test('the Kohl\'s link sku is that color, not the page default', () => {
    const html = '&quot;skuCode&quot;:[0,&quot;50653163&quot;],&quot;images&quot;:[1,[[0,{&quot;url&quot;:[0,&quot;https://media.kohlsimg.com/is/image/kohls/7513461_Tan&quot;],&quot;color&quot;:[0,&quot;Tan&quot;]';
    assert.equal(reader.kohlsSkuColor(html, 'https://www.kohls.com/product/prd-7513461/x.jsp?skuId=50653163'), 'Tan');
});

test('Kohl\'s colors that share one link are chosen in the cart', () => {
    const html = '"skuCode":[0,"50653163"],"color":[0,"Tan"] "color":[0,"Black"]';
    const url = 'https://www.kohls.com/product/prd-7513461/x.jsp?skuId=50653163';
    const groups = reader.applyKohlsColors(
        [{ name: 'Color', options: ['Black'], selected: 'Black' }],
        html,
        url,
    );
    assert.equal(groups[0].selected, null);
    assert.deepEqual(groups[0].options, ['Black', 'Tan']);
});

test('a guessed server location is not the shopper page ZIP', () => {
    const ship = reader.walmartShip(page({ postal: '51502', date: '2026-10-15', price: null, free: false, strength: 'IMPLICIT' }), '32218');
    assert.equal(ship.skip, true);
});

test('walmart uses the $6.99 cart default when the page has no shipping price', () => {
    assert.equal(reader.withDefaultShip('walmart', { cents: null, arrivalDate: '2026-10-16' }).cents, 699);
    assert.equal(reader.withDefaultShip('walmart', null).cents, 699);
    assert.equal(reader.withDefaultShip('walmart', { cents: 0, arrivalDate: '2026-10-16' }).cents, 0);
    assert.equal(reader.withDefaultShip('target', { cents: null, arrivalDate: '2026-10-16' }, 269).cents, 599);
    assert.equal(reader.withDefaultShip('amazon', { cents: null, arrivalDate: '2026-10-20' }, 1000).cents, 399);
    assert.equal(reader.withDefaultShip('amazon', { cents: null, arrivalDate: '2026-10-20' }, 1000).arrivalDate, '2026-10-20');
});

test('arrives tomorrow is a delivery date', () => {
    const ship = reader.standardFromPage('<p>Shipping Arrives tomorrow</p>', 3499);
    assert.equal(ship.cents, null);
    assert.match(ship.arrivalDate, /^\d{4}-\d{2}-\d{2}$/);
});

function bestbuyBlock(zip, groups) {
    return `"destinationZipCode":"${zip}","shippingAvailability":[{"customerLOSGroup":[${groups}]}]`;
}

test('best buy uses the standard date for the giftee ZIP and skips express', () => {
    const html = bestbuyBlock(
        '11212',
        '{"maxLineItemMaxDate":"2026-10-19","name":"Next Day","price":29.99},{"maxLineItemMaxDate":"2026-10-22","name":"Standard","price":5.99}'
    );
    const ship = reader.bestbuyShip(html, '11212');
    assert.equal(ship.arrivalDate, '2026-10-22');
    assert.equal(ship.cents, 599);
    assert.equal(reader.bestbuyShip(html, '32218'), null);
});

test('a dashed arrival window uses the last day', () => {
    const html = '<p>Shipping Arrives Tue, Oct 20 - Fri, Oct 23 Free With a $49 Total Purchase</p>';
    const ship = reader.standardFromPage(html, 4799);
    assert.equal(ship.arrivalDate, '2026-10-23');
});

test('best buy under $35 uses $5.99 when the page has no price', () => {
    assert.equal(reader.withDefaultShip('bestbuy', { cents: null, arrivalDate: null }, 2000).cents, 599);
    assert.equal(reader.withDefaultShip('bestbuy', { cents: null, arrivalDate: null }, 4000).cents, 0);
    assert.equal(reader.withDefaultShip('bestbuy', { cents: 399, arrivalDate: '2026-10-21' }, 2000).cents, 399);
});
