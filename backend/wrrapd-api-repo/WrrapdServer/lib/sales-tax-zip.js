'use strict';

const fs = require('fs');
const path = require('path');

const SALE_DIR = path.join(__dirname, '..', 'public', 'salestaxcalc');

/** @type {Map<string, number> | null} */
let zipToCombinedRate = null;

/**
 * Loads all TAXRATES_ZIP5_XXYYYYMM.csv files into a ZIP5 → combined rate (0–1) map.
 * First file wins if the same ZIP appeared twice (should not happen).
 */
function ensureZipIndexBuilt() {
    if (zipToCombinedRate) return;
    zipToCombinedRate = new Map();
    if (!fs.existsSync(SALE_DIR)) return;
    const files = fs.readdirSync(SALE_DIR).filter((f) => /^TAXRATES_ZIP5_[A-Z]{2}\d{6,}\.csv$/i.test(f));
    for (const file of files) {
        const fp = path.join(SALE_DIR, file);
        let content;
        try {
            content = fs.readFileSync(fp, 'utf8');
        } catch {
            continue;
        }
        const lines = content.split(/\r?\n/);
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const cols = line.split(',');
            if (cols.length < 4) continue;
            const zip = String(cols[1] || '')
                .replace(/\D/g, '')
                .slice(0, 5);
            if (zip.length !== 5) continue;
            const rate = parseFloat(cols[3]);
            if (!Number.isFinite(rate) || rate < 0 || rate > 0.5) continue;
            if (!zipToCombinedRate.has(zip)) zipToCombinedRate.set(zip, rate);
        }
    }
}

/**
 * @param {string} zip5
 * @returns {number | null} EstimatedCombinedRate as decimal (e.g. 0.075), or null if unknown
 */
function getEstimatedCombinedRateDecimal(zip5) {
    ensureZipIndexBuilt();
    const z = String(zip5 || '')
        .replace(/\D/g, '')
        .slice(0, 5);
    if (z.length !== 5) return null;
    return zipToCombinedRate.has(z) ? zipToCombinedRate.get(z) : null;
}

/**
 * Same rate expressed as whole-number percent for wrrapd-pricing (e.g. 7.5 for 7.5%).
 * @param {string} zip5
 * @returns {number | null}
 */
function getCombinedRateAsTaxPercent(zip5) {
    const d = getEstimatedCombinedRateDecimal(zip5);
    if (d === null) return null;
    return Math.round(d * 100 * 1000) / 1000;
}

module.exports = {
    ensureZipIndexBuilt,
    getEstimatedCombinedRateDecimal,
    getCombinedRateAsTaxPercent,
};
