const test = require('node:test');
const assert = require('node:assert/strict');
const reader = require('../lib/buy/page-reader');

function sku(id, size, price, soldOut) {
    return {
        concatenatedDisplaySize: size,
        sizeType: { label: 'Regular' },
        sku: {
            skuId: id,
            propositions: [{
                salability: { status: soldOut ? 'SOLD_OUT' : 'SELLABLE' },
                availability: { isAvailable: !soldOut },
                pricings: [{ sellingRetail: { price } }],
            }],
        },
    };
}

function page(entity, promises) {
    const config = {
        productDisplay: {
            productDisplaysById: { entities: { 5897392: entity } },
            pageData: { entities: { 5897392: { breadcrumb: [{ name: 'Home' }, { name: 'Holiday Gifts' }] } } },
        },
        storeMode: { promises: { entities: { '32244-5897392': { promises } } } },
    };
    return `<!doctype html><meta property="og:title" content="SKIMS">\n<script>window.__INITIAL_CONFIG__ = ${JSON.stringify(config)};</script>`;
}

const cherry = {
    copyProductTitle: 'Soft Lounge Rib Pajamas',
    labelDisplayName: 'SKIMS',
    coreProducts: [{
        coreChoices: [
            {
                coreChoiceId: '444448ZZ6Y',
                displayColorDescription: 'CHERRY BLOSSOM',
                orderedShots: [{ shotName: 'front:onFigure', imageUrl: 'https://n.nordstrommedia.com/it/cherry.jpeg' }],
                items: [sku('A1', 'S', 128, false), sku('A2', 'M', 128, false)],
            },
            {
                coreChoiceId: '444448ZZ69',
                displayColorDescription: 'BABY BLUE',
                items: [sku('B1', 'S', 89, false), sku('B2', 'M', 89, false)],
            },
        ],
    }],
};

const url = 'https://www.nordstrom.com/s/skims-soft-lounge-rib-sleep-set-regular-plus/5897392?color=444448ZZ6Y';
const shipRows = [
    { sku: 'A1', promises: [{ shipType: 'STANDARD_SHIPPING', customerCost: 0, minDate: '2026-10-20' }, { shipType: 'TWO_DAY', customerCost: 12 }] },
    { sku: 'A2', promises: [{ shipType: 'STANDARD_SHIPPING', customerCost: 0, minDate: '2026-10-21' }] },
];

test('nordstrom bot shell is not a product page', () => {
    const shell = "<html><title></title><script>window['istlWasHere'] = true;</script></html>";
    assert.equal(reader.nordstromShell(shell), true);
    assert.equal(reader.nordstromFromHtml(shell, url, '32244'), null);
});

test('selected Nordstrom color uses its own price, not the style range', () => {
    const product = reader.nordstromFromHtml(page(cherry, shipRows), url, '32244');
    assert.equal(product.title, 'Soft Lounge Rib Pajamas');
    assert.equal(product.pagePriceCents, 12800);
    assert.equal(product.standardShip.cents, 0);
    assert.equal(product.standardShip.arrivalDate, null);
    assert.equal(product.choicePrompt, '');
    const color = product.variantGroups.find((group) => group.name === 'Color');
    const size = product.variantGroups.find((group) => group.name === 'Size');
    assert.equal(color.selected, 'Cherry Blossom');
    assert.equal(size.selected, null);
    assert.equal(product.isElectronics, false);
});

test('a Nordstrom price range leaves the choice for the cart', () => {
    const product = reader.nordstromFromHtml(page(cherry, shipRows), 'https://www.nordstrom.com/s/5897392', '32244');
    assert.equal(product.pagePriceCents, null);
    assert.equal(product.choicePrompt, '');
    assert.notEqual(product.inStock, false);
});

test('a color name and size in the Nordstrom link select that sale price', () => {
    const pajamas = {
        copyProductTitle: 'Britney Cami and Shorts Pajama Set',
        labelDisplayName: 'In Bloom by Jonquil',
        coreProducts: [{
            coreChoices: [{
                coreChoiceId: '44444GMJRG',
                displayColorDescription: 'BLACK',
                items: [{
                    concatenatedDisplaySize: 'X-Small',
                    sku: {
                        skuId: 'B1461329',
                        propositions: [{
                            salability: { status: 'SELLABLE' },
                            availability: { isAvailable: true },
                            pricings: [{ sellingRetail: { priceType: 'CLEARANCE', price: '41.60' }, baseRetail: { price: '64.00' } }],
                        }],
                    },
                }, sku('B1461330', 'Small', 41.6, false)],
            }, {
                coreChoiceId: '44444GMJRH',
                displayColorDescription: 'IVORY',
                items: [sku('B1461331', 'X-Small', 41.6, false)],
            }],
        }],
    };
    const link = 'https://www.nordstrom.com/s/in-bloom-by-jonquil-britney-cami-and-shorts-pajama-set/9078365?color=BLACK&size=x-small';
    const product = reader.nordstromFromHtml(page(pajamas, []).replaceAll('5897392', '9078365'), link, '32218');
    assert.equal(product.pagePriceCents, 4160);
    assert.equal(product.inStock, true);
    assert.equal(product.choicePrompt, '');
    assert.equal(product.variantGroups.find((group) => group.name === 'Color').selected, 'Black');
    assert.equal(product.variantGroups.find((group) => group.name === 'Size').selected, 'X-Small');
});

test('a crossed-out Nordstrom price is not the price charged', () => {
    const sale = {
        ...cherry,
        coreProducts: [{
            coreChoices: [{
                coreChoiceId: '444448ZZ6Y',
                displayColorDescription: 'BLACK',
                items: [{
                    concatenatedDisplaySize: 'S',
                    sku: {
                        skuId: 'S1',
                        propositions: [{
                            salability: { status: 'SELLABLE' },
                            availability: { isAvailable: true },
                            pricings: [{ sellingRetail: { price: 64 }, promotion: { price: 48 } }],
                        }],
                    },
                }],
            }],
        }],
    };
    const product = reader.nordstromFromHtml(page(sale, []), url, '32244');
    assert.equal(product.pagePriceCents, 4800);
    const html = '<p><s>$64.00</s> <span>$48.00</span></p>';
    assert.equal(reader.struckSaleCents(html, 6400), 4800);
    assert.equal(reader.struckSaleCents('<p>$64.00</p>', 6400), 6400);
});

test('electronics detection uses the product title', () => {
    const headphones = { ...cherry, copyProductTitle: 'Wireless Headphones' };
    const product = reader.nordstromFromHtml(page(headphones, shipRows), url, '32244');
    assert.equal(product.isElectronics, true);
});
