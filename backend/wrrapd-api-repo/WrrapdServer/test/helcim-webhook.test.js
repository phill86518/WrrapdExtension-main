const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const helcim = require('../lib/helcim');

const token = Buffer.from('test-verifier-secret').toString('base64');

function sign(id, ts, body) {
    return crypto.createHmac('sha256', Buffer.from(token, 'base64')).update(`${id}.${ts}.${body}`).digest('base64');
}

test('accepts a correctly signed, fresh webhook and rejects tampering', () => {
    process.env.HELCIM_WEBHOOK_VERIFIER_TOKEN = token;
    const ts = String(Math.floor(Date.now() / 1000));
    const body = '{"id":"123","type":"cardTransaction"}';
    const sig = `v1,${sign('msg_1', ts, body)}`;
    assert.equal(helcim.verifyWebhook({ rawBody: body, webhookId: 'msg_1', webhookTimestamp: ts, webhookSignature: sig }), true);
    assert.equal(
        helcim.verifyWebhook({ rawBody: body.replace('123', '999'), webhookId: 'msg_1', webhookTimestamp: ts, webhookSignature: sig }),
        false,
    );
});

test('rejects stale timestamps and a missing verifier token', () => {
    process.env.HELCIM_WEBHOOK_VERIFIER_TOKEN = token;
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    const body = '{}';
    assert.equal(
        helcim.verifyWebhook({ rawBody: body, webhookId: 'm', webhookTimestamp: old, webhookSignature: `v1,${sign('m', old, body)}` }),
        false,
    );
    delete process.env.HELCIM_WEBHOOK_VERIFIER_TOKEN;
    const ts = String(Math.floor(Date.now() / 1000));
    assert.equal(
        helcim.verifyWebhook({ rawBody: body, webhookId: 'm', webhookTimestamp: ts, webhookSignature: `v1,${sign('m', ts, body)}` }),
        false,
    );
});
