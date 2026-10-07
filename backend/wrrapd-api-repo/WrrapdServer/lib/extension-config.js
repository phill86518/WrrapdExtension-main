/**
 * Shopper-extension config. The Chrome package asks for this; it does not ship the values.
 * `hub` is the default delivery hub; the extension asks /api/delivery-hub for the hub
 * closest to the giftee ZIP once the shopper submits it.
 */
const deliveryHubs = require('./delivery-hubs');

const OCCASIONS = [
    'Birthday', 'Christmas', 'Anniversary', "Father's Day", "Mother's Day",
    "Valentine's Day", 'Graduation', 'Thank you', 'Thanksgiving', 'Easter',
    'Hanukkah', 'Wedding', 'Retirement', 'July Fourth', 'Corporate Gift',
    "St. Patrick's Day", 'Diwali', 'Ramadan / Eid', 'Chinese New Year',
    'Housewarming', 'New baby', 'Sympathy', 'Get well', 'Congratulations',
    'Just because', 'Other',
];

const RETAILER_CODES = {
    amazon: 'AZ',
    target: 'TG',
    nordstrom: 'NS',
    sephora: 'SF',
    walmart: 'WM',
    bestbuy: 'BB',
    kohls: 'KS',
    etsy: 'EC',
    ulta: 'UT',
    lego: 'LG',
};

function publicExtensionConfig() {
    return {
        hub: deliveryHubs.publicHub(deliveryHubs.defaultHub()),
        occasions: OCCASIONS,
        retailerCodes: RETAILER_CODES,
    };
}

module.exports = { publicExtensionConfig, OCCASIONS, RETAILER_CODES };
