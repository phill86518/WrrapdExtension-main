/**
 * One JSON file per batch under orders/buy-for-you/ (included in the hourly orders backup).
 * Every change goes through `update()`, which runs one change at a time per batch.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, '..', '..', 'orders', 'buy-for-you');
const ID_RE = /^WB-[A-HJ-NP-Z2-9]{10}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const chains = new Map();

function ensureDir() {
    fs.mkdirSync(DIR, { recursive: true });
}

function newId() {
    const bytes = crypto.randomBytes(10);
    let s = '';
    for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
    return `WB-${s}`;
}

function fileFor(id) {
    if (!ID_RE.test(String(id || ''))) return null;
    return path.join(DIR, `${id}.json`);
}

function read(id) {
    const fp = fileFor(id);
    if (!fp) return null;
    try {
        return JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch (_) {
        return null;
    }
}

function write(batch) {
    ensureDir();
    const fp = fileFor(batch.id);
    if (!fp) throw new Error('bad batch id');
    batch.updatedAt = new Date().toISOString();
    const tmp = `${fp}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(batch, null, 2));
    fs.renameSync(tmp, fp);
    return batch;
}

function create(batch) {
    ensureDir();
    let id = newId();
    while (fs.existsSync(fileFor(id))) id = newId();
    const now = new Date().toISOString();
    return write({ ...batch, id, token: crypto.randomBytes(24).toString('hex'), createdAt: now, log: [] });
}

/**
 * Serialized read-modify-write. `fn(batch)` may mutate and return the batch, or return null to skip saving.
 * Resolves to the saved (or unchanged) batch, or null when the batch does not exist.
 */
function update(id, fn) {
    const prev = chains.get(id) || Promise.resolve();
    const next = prev
        .catch(() => {})
        .then(async () => {
            const batch = read(id);
            if (!batch) return null;
            const out = await fn(batch);
            if (out === null) return batch;
            return write(out || batch);
        });
    chains.set(id, next);
    next.finally(() => {
        if (chains.get(id) === next) chains.delete(id);
    }).catch(() => {});
    return next;
}

function list({ limit = 400 } = {}) {
    ensureDir();
    const rows = [];
    for (const f of fs.readdirSync(DIR)) {
        if (!/^WB-[A-Z0-9]{10}\.json$/.test(f)) continue;
        try {
            rows.push(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
        } catch (_) {
            /* skip unreadable */
        }
    }
    rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return rows.slice(0, limit);
}

function tokenMatches(batch, token) {
    const a = Buffer.from(String(batch && batch.token ? batch.token : ''));
    const b = Buffer.from(String(token || ''));
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function addLog(batch, who, what) {
    batch.log = Array.isArray(batch.log) ? batch.log : [];
    batch.log.push({ at: new Date().toISOString(), who: String(who || 'system').slice(0, 80), what: String(what).slice(0, 500) });
    if (batch.log.length > 300) batch.log = batch.log.slice(-300);
}

module.exports = { DIR, ID_RE, create, read, write, update, list, tokenMatches, addLog };
