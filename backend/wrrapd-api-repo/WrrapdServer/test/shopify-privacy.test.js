const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const privacy = require('../lib/shopify-privacy');

describe('shopify-privacy', () => {
  it('exports handlePrivacyWebhook', () => {
    assert.equal(typeof privacy.handlePrivacyWebhook, 'function');
    assert.equal(typeof privacy.appendAudit, 'function');
  });
});
