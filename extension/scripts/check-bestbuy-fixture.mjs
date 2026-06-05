import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { extractBestbuyCartSnapshot } from "../src/retailers/bestbuy/retailer-bootstrap.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.resolve(__dirname, "../fixtures/bestbuy-cart-sample.html");
const html = fs.readFileSync(fixturePath, "utf8");

const dom = new JSDOM(html, {
  url: "https://www.bestbuy.com/cart",
});

const cart = extractBestbuyCartSnapshot(dom.window.document);

if (cart.itemCount !== 2) {
  throw new Error(`Expected 2 items, got ${cart.itemCount}`);
}
if (cart.subtotal !== 899.97) {
  throw new Error(`Expected subtotal 899.97, got ${String(cart.subtotal)}`);
}
if (cart.orderTotal !== 899.97) {
  throw new Error(`Expected total 899.97, got ${String(cart.orderTotal)}`);
}
if (cart.fulfillmentCounts.shipping !== 1 || cart.fulfillmentCounts.pickup !== 1) {
  throw new Error(
    `Expected shipping=1 and pickup=1, got ${JSON.stringify(cart.fulfillmentCounts)}`
  );
}

console.log("Best Buy fixture check passed.");
console.log(JSON.stringify(cart, null, 2));
