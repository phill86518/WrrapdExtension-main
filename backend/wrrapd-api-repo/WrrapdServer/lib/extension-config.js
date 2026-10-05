/**
 * Shopper-extension config. The Chrome package asks for this; it does not ship the values.
 */

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

const HUB = {
    organization: 'WRRAPD INC',
    displayName: 'Wrrapd',
    recipientFirstName: 'WRRAPD',
    recipientLastName: 'INC',
    addressLine1: '150 BUSCH DR #26067',
    addressLine2: '',
    city: 'JACKSONVILLE',
    state: 'FL',
    stateName: 'Florida',
    postalCode: '32218',
    country: 'US',
    phone: '(904) 515-2034',
    shipLines: ['WRRAPD INC', '150 BUSCH DR #26067', 'JACKSONVILLE FL 32218'],
};

function publicExtensionConfig() {
    return {
        hub: HUB,
        occasions: OCCASIONS,
        retailerCodes: RETAILER_CODES,
    };
}

module.exports = { publicExtensionConfig, OCCASIONS, RETAILER_CODES, HUB };
