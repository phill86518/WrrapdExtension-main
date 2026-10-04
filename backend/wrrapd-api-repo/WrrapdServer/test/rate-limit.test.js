const test = require('node:test');
const assert = require('node:assert/strict');
const { rateLimit } = require('../lib/rate-limit');

function run(mw, ip) {
    let status = 200;
    let nextCalled = false;
    const res = {
        set() {},
        status(code) {
            status = code;
            return { json() {} };
        },
    };
    mw({ ip, method: 'POST' }, res, () => {
        nextCalled = true;
    });
    return nextCalled ? 200 : status;
}

test('blocks after max requests per IP and keeps IPs separate', () => {
    const mw = rateLimit({ name: 'test', windowMs: 60_000, max: 3 });
    assert.deepEqual([1, 2, 3, 4].map(() => run(mw, '1.1.1.1')), [200, 200, 200, 429]);
    assert.equal(run(mw, '2.2.2.2'), 200);
});

test('OPTIONS preflight is never counted', () => {
    const mw = rateLimit({ name: 'test2', windowMs: 60_000, max: 1 });
    let passed = 0;
    for (let i = 0; i < 5; i++) mw({ ip: '3.3.3.3', method: 'OPTIONS' }, {}, () => passed++);
    assert.equal(passed, 5);
});
