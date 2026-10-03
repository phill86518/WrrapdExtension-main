#!/usr/bin/env node
/**
 * One-time cleanup: give every order on disk a Wrrapd order number in the
 * current shape `CC-TTTTTTTTT-RRRRRR` (same as extension
 * `src/shared/wrrapd-order-code.js`). The timestamp part is taken from the
 * order's own `timestamp`, so numbers stay chronological.
 *
 * Orders already in that shape are left alone. Legacy shapes (AZ-1956632-6777901,
 * LG322268028, UT-MQK2KH4T-QBIGIL, missing number) are rewritten everywhere in
 * the file, and `.pending-final-shipping-<n>.json` / `temp_qr_<n>.png` are
 * renamed to match. Writes `orders/order-number-map.json` (old -> new).
 *
 * Usage:  node scripts/normalize-order-numbers.cjs --dry   (preview)
 *         node scripts/normalize-order-numbers.cjs         (apply)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DRY = process.argv.includes("--dry");
const SERVER_DIR = path.join(__dirname, "..");
const ORDERS_DIR = path.join(SERVER_DIR, "orders");
const DIRS = [ORDERS_DIR, path.join(ORDERS_DIR, "deleted")];

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
const CURRENT = /^(AZ|TG|NS|SF|WM|BB|KS|EC|UT|LG|WR)-[0-9A-Z]{9}-[0-9A-Z]{6}$/;

function retailerCode(input) {
  const norm = String(input || "").toLowerCase().replace(/[^a-z]/g, "").replace(/^wrrapd/, "");
  if (norm.length >= 2) {
    for (const [key, code] of RETAILER_ORDER_CODES) {
      if (norm.includes(key) || key.startsWith(norm)) return code;
    }
  }
  return null;
}

const RETAILER_NAMES = {
  AZ: "Amazon", TG: "Target", NS: "Nordstrom", SF: "Sephora", WM: "Walmart",
  BB: "Best Buy", KS: "Kohls", EC: "Etsy", UT: "Ulta", LG: "Lego",
};

/** Number prefix wins: orders before late June 2026 were saved with name_of_retailer "Amazon" for every retailer. */
function codeFor(order, oldNumber) {
  const fromNumber = /^[A-Z]{2}(?=[-0-9])/.exec(oldNumber || "")?.[0];
  if (fromNumber && RETAILER_NAMES[fromNumber]) return fromNumber;
  return (
    retailerCode(order.name_of_retailer) ||
    retailerCode(typeof order.retailer === "string" ? order.retailer : order.retailer?.name) ||
    "AZ"
  );
}

function timeFor(order, file, fallbackMs) {
  let ms = Date.parse(order.timestamp || "");
  if (!Number.isFinite(ms) && fallbackMs) ms = fallbackMs;
  if (!Number.isFinite(ms)) {
    const m = /^order_(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})\.(\d{3})Z/.exec(file);
    ms = m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : Date.now();
  }
  return Math.floor(ms).toString(36).toUpperCase().padStart(9, "0").slice(-9);
}

function rand6() {
  let s = "";
  while (s.length < 6) s += crypto.randomInt(36).toString(36);
  return s.toUpperCase();
}

const files = [];
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith("order_") && f.endsWith(".json")) files.push(path.join(dir, f));
  }
}

const used = new Set();
const parsed = files.map((fp) => {
  const raw = fs.readFileSync(fp, "utf8");
  const order = JSON.parse(raw);
  if (CURRENT.test(order.orderNumber || "")) used.add(order.orderNumber);
  return { fp, raw, order };
});

function newNumber(code, time) {
  let next;
  do next = `${code}-${time}-${rand6()}`;
  while (used.has(next));
  used.add(next);
  return next;
}

function writeJson(fp, raw, obj) {
  const indent = /^\{\r?\n(\s+)"/.exec(raw)?.[1] ?? "";
  const out = JSON.stringify(obj, null, indent || undefined) + (raw.endsWith("\n") ? "\n" : "");
  if (!DRY) fs.writeFileSync(fp, out, "utf8");
}

const map = {};
let renumbered = 0;
let relabeled = 0;
for (const { fp, raw, order } of parsed) {
  const old = order.orderNumber ? String(order.orderNumber) : "";
  const code = codeFor(order, old);
  let next = old;
  if (!CURRENT.test(old)) {
    next = (old && map[old]) || newNumber(code, timeFor(order, path.basename(fp)));
    if (old) map[old] = next;
  }
  const fixLabel = order.name_of_retailer === "Amazon" && code !== "AZ";
  if (next === old && !fixLabel) continue;

  const obj = JSON.parse(old ? raw.split(old).join(next) : raw);
  const result = old ? obj : { orderNumber: next, ...obj };
  if (fixLabel) {
    result.retailer = RETAILER_NAMES[code];
    result.name_of_retailer = RETAILER_NAMES[code];
    relabeled += 1;
  }
  if (next !== old) renumbered += 1;
  const note = [next !== old ? `${(old || "(none)").padEnd(22)} -> ${next}` : `${next.padEnd(48)}`, fixLabel ? `[Amazon -> ${RETAILER_NAMES[code]}]` : ""].join(" ");
  console.log(`  ${note}   ${path.relative(ORDERS_DIR, fp)}`);
  writeJson(fp, raw, result);
}

const renames = [];
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    const m = /^\.pending-final-shipping-(.+)\.json$/.exec(f);
    if (!m || CURRENT.test(m[1])) continue;
    const fp = path.join(dir, f);
    if (!map[m[1]]) {
      map[m[1]] = newNumber(codeFor({}, m[1]), timeFor({}, f, fs.statSync(fp).mtimeMs));
    }
    const raw = fs.readFileSync(fp, "utf8");
    if (!DRY && raw.includes(m[1])) fs.writeFileSync(fp, raw.split(m[1]).join(map[m[1]]), "utf8");
    renames.push([fp, path.join(dir, `.pending-final-shipping-${map[m[1]]}.json`)]);
  }
}
for (const f of fs.readdirSync(SERVER_DIR)) {
  const m = /^temp_qr_(.+)\.png$/.exec(f);
  if (m && map[m[1]]) renames.push([path.join(SERVER_DIR, f), path.join(SERVER_DIR, `temp_qr_${map[m[1]]}.png`)]);
}
for (const [from, to] of renames) {
  console.log(`  rename ${path.basename(from)} -> ${path.basename(to)}`);
  if (!DRY) fs.renameSync(from, to);
}

if (!DRY && Object.keys(map).length) {
  fs.writeFileSync(path.join(ORDERS_DIR, "order-number-map.json"), JSON.stringify(map, null, 2) + "\n");
}
console.log(
  `\n[normalize-order-numbers] ${DRY ? "DRY RUN — " : ""}${files.length} order files: ` +
    `${renumbered} renumbered, ${relabeled} retailer labels fixed, ${renames.length} files renamed`,
);
