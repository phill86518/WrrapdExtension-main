/**
 * One-off / idempotent: ensure every orders/*.json has retailer + name_of_retailer.
 * Historical Wrrapd pay-server orders are Amazon unless already set.
 *
 * Usage (from repo): node backend/wrrapd-api-repo/WrrapdServer/scripts/backfill-order-retailer-json.js
 */
const fs = require("fs");
const path = require("path");

const ordersDir = path.join(__dirname, "..", "orders");
if (!fs.existsSync(ordersDir)) {
    console.error("No orders directory:", ordersDir);
    process.exit(1);
}

let updated = 0;
let skipped = 0;
for (const name of fs.readdirSync(ordersDir)) {
    if (!name.endsWith(".json")) continue;
    const fp = path.join(ordersDir, name);
    let raw;
    try {
        raw = fs.readFileSync(fp, "utf8");
    } catch (e) {
        console.warn("Skip read:", name, e && e.message);
        continue;
    }
    let j;
    try {
        j = JSON.parse(raw);
    } catch (e) {
        console.warn("Skip invalid JSON:", name);
        continue;
    }
    if (!j || typeof j !== "object") continue;

    const hasR = typeof j.retailer === "string" && j.retailer.trim();
    const hasN = typeof j.name_of_retailer === "string" && j.name_of_retailer.trim();
    if (hasR && hasN) {
        skipped += 1;
        continue;
    }
    if (!hasR) j.retailer = "Amazon";
    if (!hasN) j.name_of_retailer = String(j.retailer || "Amazon").trim();
    fs.writeFileSync(fp, JSON.stringify(j, null, 2), "utf8");
    updated += 1;
}

console.log(`backfill-order-retailer-json: updated=${updated} already_ok=${skipped}`);
