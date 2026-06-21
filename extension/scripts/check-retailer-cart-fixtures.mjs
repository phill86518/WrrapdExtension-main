import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { build } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(__dirname, "..");

async function bundleRetailerBootstrap(entry) {
  const outfile = path.join(extensionRoot, ".tmp-fixture-test.mjs");
  await build({
    entryPoints: [path.join(extensionRoot, entry)],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    legalComments: "none",
    define: { WRRAPD_STORE_BUILD: "true" },
  });
  const mod = await import(outfile);
  fs.unlinkSync(outfile);
  return mod;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const kohls = await bundleRetailerBootstrap("src/retailers/kohls/retailer-bootstrap.js");
const bestbuy = await bundleRetailerBootstrap("src/retailers/bestbuy/retailer-bootstrap.js");

const kohlsFixture = fs.readFileSync(
  path.join(extensionRoot, "fixtures/kohls-cart-logged-in-sample.html"),
  "utf8",
);
const kohlsLiveFixture = fs.readFileSync(
  path.join(extensionRoot, "fixtures/kohls-shopping-cart-jsp-sample.html"),
  "utf8",
);
const bestbuyFixture = fs.readFileSync(
  path.join(extensionRoot, "fixtures/bestbuy-cart-sample.html"),
  "utf8",
);

const kohlsDom = new JSDOM(kohlsFixture, { url: "https://www.kohls.com/checkout/shopping_cart.jsp" });
const kohlsLiveDom = new JSDOM(kohlsLiveFixture, {
  url: "https://www.kohls.com/checkout/shopping_cart.jsp",
});
const bestbuyDom = new JSDOM(bestbuyFixture, { url: "https://www.bestbuy.com/cart" });

const kohlsCart = kohls.extractKohlsCartSnapshot(kohlsDom.window.document);
assert(kohlsCart.itemCount === 2, `Kohl's fixture: expected 2 items, got ${kohlsCart.itemCount}`);

const kohlsLiveCart = kohls.extractKohlsCartSnapshot(kohlsLiveDom.window.document);
assert(kohlsLiveCart.itemCount === 1, `Kohl's live-path fixture: expected 1 item, got ${kohlsLiveCart.itemCount}`);

const bestbuyCart = bestbuy.extractBestbuyCartSnapshot(bestbuyDom.window.document);
assert(bestbuyCart.itemCount === 2, `Best Buy fixture: expected 2 items, got ${bestbuyCart.itemCount}`);

const pathHints = [
  ["https://www.kohls.com/checkout/shopping_cart.jsp", "shopping_cart"],
  ["https://www.bestbuy.com/cart", "/cart"],
  ["https://www.bestbuy.com/checkout/r/fast-track", "/checkout"],
];
for (const [url, hint] of pathHints) {
  assert(new URL(url).pathname.toLowerCase().includes(hint), `${url} should include ${hint}`);
}

console.log("Retailer cart fixture checks passed.");
console.log(JSON.stringify({ kohlsCart, kohlsLiveCart, bestbuyCart }, null, 2));
