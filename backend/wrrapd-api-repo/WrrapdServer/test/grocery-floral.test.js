const test = require('node:test');
const assert = require('node:assert/strict');
const grocery = require('../lib/flowers/grocery-search');
const stores = require('../lib/flowers/stores');

const ORIGIN = { lat: 40.6629, lng: -73.913 };

test('place names match the floral grocers and skip lookalikes', () => {
  assert.equal(grocery.chainFromPlaceName('Whole Foods Market'), 'wholefoods');
  assert.equal(grocery.chainFromPlaceName("Trader Joe's"), 'traderjoes');
  assert.equal(grocery.chainFromPlaceName('The Food Emporium'), 'foodemporium');
  assert.equal(grocery.chainFromPlaceName('Lidl'), 'lidl');
  assert.equal(grocery.chainFromPlaceName('Fresh Health Food Emporium'), '');
  assert.equal(grocery.chainFromPlaceName('Food Emporium Cafe'), '');
});

test('Lidl Crown Heights is inside 4 miles of 11212 and a closed store is dropped', () => {
  const open = grocery.lidlItemToStore({
    objectNumber: 'US09999',
    objectType: 'STORE',
    storeName: 'Brooklyn NY - Crown Heights',
    status: { name: 'open' },
    address: {
      streetNumber: '1730',
      streetName: 'Bedford Avenue',
      city: 'Brooklyn',
      zip: '11225',
      state: 'New York',
      latitude: 40.6641,
      longitude: -73.9575,
    },
  });
  assert.equal(open.retailer, 'lidl');
  assert.equal(open.state, 'NY');
  assert.equal(open.postalCode, '11225');
  const nearest = grocery.nearestOf([open], ORIGIN, 4, stores.haversineMiles);
  assert.equal(nearest.length, 1);
  assert.ok(nearest[0].miles <= 4);

  const closed = grocery.lidlItemToStore({
    objectType: 'STORE',
    storeName: 'Closed',
    status: { name: 'closed' },
    address: { latitude: 40.66, longitude: -73.91, state: 'NY', zip: '11212' },
  });
  assert.equal(closed, null);
});

test('a store past 4 miles is not a floral option', () => {
  const far = grocery.traderJoesItemToStore({
    clientkey: '547',
    name: 'Brooklyn - City Point (547)',
    address1: '445 Gold St',
    city: 'Brooklyn',
    state: 'NY',
    postalcode: '11201',
    latitude: '40.69099',
    longitude: '-73.98292',
  });
  const nearest = grocery.nearestOf([far], ORIGIN, 4, stores.haversineMiles);
  assert.equal(nearest.length, 0);
});

test('photon keeps Whole Foods and Food Emporium only', () => {
  const wholeFoods = grocery.photonFeatureToStore({
    properties: { name: 'Whole Foods Market', street: '3rd Street', city: 'New York', state: 'New York', postcode: '11215' },
    geometry: { coordinates: [-73.9888, 40.6749] },
  });
  const lookalike = grocery.photonFeatureToStore({
    properties: { name: 'Fresh Health Food Emporium', street: 'Nostrand Avenue', city: 'New York' },
    geometry: { coordinates: [-73.9499, 40.6782] },
  });
  assert.equal(wholeFoods.retailer, 'wholefoods');
  assert.equal(wholeFoods.storeName, 'Whole Foods New York');
  assert.equal(lookalike, null);
});
