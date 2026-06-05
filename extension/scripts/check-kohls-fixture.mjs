import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { extractKohlsCartSnapshot } from "../src/retailers/kohls/retailer-bootstrap.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.resolve(__dirname, "../fixtures/kohls-cart-logged-in-sample.html");
const html = fs.readFileSync(fixturePath, "utf8");

const dom = new JSDOM(html, {
  url: "https://www.kohls.com/checkout/shopping_bag.jsp",
});

const cart = extractKohlsCartSnapshot(dom.window.document);

if (cart.itemCount !== 2) {
  throw new Error(`Expected 2 items, got ${cart.itemCount}`);
}
if (cart.subtotal !== 125.99) {
  throw new Error(`Expected subtotal 125.99, got ${String(cart.subtotal)}`);
}
if (cart.orderTotal !== 125.99) {
  throw new Error(`Expected total 125.99, got ${String(cart.orderTotal)}`);
}
if (cart.fulfillmentCounts.shipping !== 1 || cart.fulfillmentCounts.pickup !== 1) {
  throw new Error(
    `Expected shipping=1 and pickup=1, got ${JSON.stringify(cart.fulfillmentCounts)}`
  );
}

console.log("Kohl's fixture check passed.");
console.log(JSON.stringify(cart, null, 2));
