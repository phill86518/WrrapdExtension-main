/**
 * Anonymous extension installs. Heartbeat stores id, version, and firstSeen.
 * Email is attached only when the shopper already sends it on process-payment.
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'extension-installs.json');

function readMap() {
    try {
        const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function writeMap(map) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(map, null, 2));
}

function validId(installId) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(installId || '').trim());
}

function recordHeartbeat({ installId, extensionVersion, firstSeen }) {
    const id = String(installId || '').trim();
    if (!validId(id)) return false;
    const map = readMap();
    const prev = map[id] && typeof map[id] === 'object' ? map[id] : {};
    map[id] = {
        ...prev,
        installId: id,
        extensionVersion: String(extensionVersion || '').trim().slice(0, 20),
        firstSeen: prev.firstSeen || String(firstSeen || '').trim().slice(0, 40) || new Date().toISOString(),
        lastSeen: new Date().toISOString(),
    };
    writeMap(map);
    return true;
}

function attachPayer(installId, email) {
    const id = String(installId || '').trim();
    const mail = String(email || '').trim().toLowerCase();
    if (!validId(id) || !mail.includes('@')) return;
    const map = readMap();
    const prev = map[id] && typeof map[id] === 'object' ? map[id] : { installId: id, firstSeen: new Date().toISOString() };
    map[id] = {
        ...prev,
        email: mail.slice(0, 200),
        lastPaidAt: new Date().toISOString(),
    };
    writeMap(map);
}

function listInstalls() {
    return Object.values(readMap())
        .filter((r) => r && validId(r.installId))
        .sort((a, b) => String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')));
}

module.exports = { recordHeartbeat, attachPayer, listInstalls };
