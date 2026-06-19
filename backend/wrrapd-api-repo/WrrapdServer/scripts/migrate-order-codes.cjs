#!/usr/bin/env node
/**
 * One-time migration: rewrite legacy Wrrapd order numbers to the 2-letter
 * retailer-code scheme (AZ/TG/EC/NS/KS/SF/UT/LG/WM/BB-...).
 *
 *   100-...          -> AZ-...           (Amazon)
 *   TARGET-...       -> TG-...
 *   WALMAR-...       -> WM-...           (Walmart, legacy 6-char slice)
 *   ETSY-...         -> EC-...
 *   WRRAPDUL-...     -> UT-...           (Ulta, legacy 8-char prefix slice)
 *   LG<digits>       -> unchanged        (LEGO already compliant)
 *
 * Touches: orders/order_*.json (+ deleted/), .pending-final-shipping-*.json
 * filenames, and temp_qr_<order>.png filenames. Order-number occurrences are
 * replaced everywhere inside each JSON file (content), and any filename that
 * embeds the order number is renamed. Idempotent.
 *
 * Usage:  node scripts/migrate-order-codes.cjs          (apply)
 *         node scripts/migrate-order-codes.cjs --dry     (preview only)
 */
const fs = require("fs");
const path = require("path");

const DRY = process.argv.includes("--dry");
const SERVER_DIR = path.join(__dirname, "..");
const ORDERS_DIR = path.join(SERVER_DIR, "orders");
const DELETED_DIR = path.join(ORDERS_DIR, "deleted");

const RETAILER_ORDER_CODES = [
  ["amazon", "AZ"],
  ["target", "TG"],
  ["nordstrom", "NS"],
  ["sephora", "SF"],
  ["walmart", "WM"],
  ["bestbuy", "BB"],
  ["kohls", "KS"],
  ["etsy", "EC"],
  ["ulta", "UT"],
  ["lego", "LG"],
];
const CODE_SET = new Set(RETAILER_ORDER_CODES.map(([, c]) => c));

function retailerCode(token) {
  const norm = String(token || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/^wrrapd/, "");
  if (norm.length >= 2) {
    for (const [key, code] of RETAILER_ORDER_CODES) {
      if (norm.includes(key) || key.startsWith(norm)) return code;
    }
  }
  return null;
}

/** Return migrated order number, or the same string when no change is needed. */
function migrateOrderNumber(on) {
  if (!on || typeof on !== "string") return on;
  const m = on.match(/^([A-Za-z0-9]+)-(.*)$/);
  if (m) {
    const prefix = m[1];
    const rest = m[2];
    if (CODE_SET.has(prefix.toUpperCase()) && prefix.length === 2) return on; // already a code
    if (prefix === "100") return `AZ-${rest}`;
    const code = retailerCode(prefix);
    if (code) return `${code}-${rest}`;
    return on;
  }
  if (/^LG\d/.test(on)) return on; // LEGO compact form, already compliant
  return on;
}

function replaceAll(haystack, find, replace) {
  return haystack.split(find).join(replace);
}

/**
 * Rewrite every order-number occurrence in arbitrary file text (handles files
 * that embed more than one order number, e.g. multi-shipment Amazon orders).
 */
function migrateAllInText(text) {
  let out = text;
  // Amazon legacy "100-<alnum>-<digits>" anywhere in the document.
  out = out.replace(/\b100-([0-9a-z]+-[0-9]+)\b/g, "AZ-$1");
  // Retailer-name / legacy session-prefixed numbers "PREFIX-AAAA-BBBB".
  out = out.replace(
    /\b(WRRAPD[A-Z]{2}|TARGET|WALMART|WALMAR|NORDSTROM|NORDSTRO|SEPHORA|SEPHOR|BESTBUY|KOHLS|ETSY|ULTA)-([A-Z0-9]{4,}-[A-Z0-9]{4,})\b/g,
    (full, pfx, rest) => {
      const code = retailerCode(pfx);
      return code ? `${code}-${rest}` : full;
    },
  );
  return out;
}

const summary = { contentUpdated: 0, unchanged: 0, renamed: [], errors: [] };

function processJsonFile(fp) {
  let raw;
  try {
    raw = fs.readFileSync(fp, "utf8");
  } catch (e) {
    summary.errors.push(`${fp}: read ${e.message}`);
    return;
  }
  const updated = migrateAllInText(raw);
  if (updated === raw) {
    summary.unchanged += 1;
    return;
  }
  // Report the top-level order-number change for a readable log.
  let label = path.basename(fp);
  try {
    const before = JSON.parse(raw);
    const after = JSON.parse(updated);
    if (before && after && before.orderNumber !== after.orderNumber) {
      label = `${before.orderNumber}  ->  ${after.orderNumber}   (${label})`;
    }
  } catch {
    /* still rewrite even if not strict JSON */
  }
  console.log(`  content: ${label}`);
  if (!DRY) fs.writeFileSync(fp, updated, "utf8");
  summary.contentUpdated += 1;
}

function processDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith("order_") && name.endsWith(".json")) {
      processJsonFile(path.join(dir, name));
    }
  }
  // Rename .pending-final-shipping-<orderNumber>.json files when the order number changes.
  for (const name of fs.readdirSync(dir)) {
    const pm = name.match(/^\.pending-final-shipping-(.+)\.json$/);
    if (!pm) continue;
    const newOn = migrateOrderNumber(pm[1]);
    if (newOn === pm[1]) continue;
    const from = path.join(dir, name);
    const to = path.join(dir, `.pending-final-shipping-${newOn}.json`);
    console.log(`  rename: ${name}  ->  ${path.basename(to)}`);
    if (!DRY) fs.renameSync(from, to);
    summary.renamed.push(path.basename(to));
  }
}

function processTempQr() {
  for (const name of fs.readdirSync(SERVER_DIR)) {
    const qm = name.match(/^temp_qr_(.+)\.png$/);
    if (!qm) continue;
    const newOn = migrateOrderNumber(qm[1]);
    if (newOn === qm[1]) continue;
    const from = path.join(SERVER_DIR, name);
    const to = path.join(SERVER_DIR, `temp_qr_${newOn}.png`);
    console.log(`  rename: ${name}  ->  ${path.basename(to)}`);
    if (!DRY) fs.renameSync(from, to);
    summary.renamed.push(path.basename(to));
  }
}

console.log(DRY ? "[migrate-order-codes] DRY RUN (no writes)\n" : "[migrate-order-codes] APPLYING\n");
processDir(ORDERS_DIR);
processDir(DELETED_DIR);
processTempQr();

console.log("\n[migrate-order-codes] done", {
  contentUpdated: summary.contentUpdated,
  unchanged: summary.unchanged,
  renamed: summary.renamed.length,
});
if (summary.renamed.length) console.log("renamed:", summary.renamed);
if (summary.errors.length) console.log("errors:", summary.errors);
