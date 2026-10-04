import assert from "node:assert/strict";
import { extractRetailerOrderNumber } from "../src/shared/retailer-order-capture.js";

const cases = [
  ["amazon", "Order placed, thanks! Order # 112-3456789-1234567 Wrrapd AZ-123456789-ABC123", "112-3456789-1234567"],
  ["target", "Thanks for your order! Order #912003456789", "912003456789"],
  ["walmart", "Thanks for your order Order# 2000123-45678901", "2000123-45678901"],
  ["bestbuy", "Thank you. Your order number is BBY01-806587123456", "BBY01-806587123456"],
  ["kohls", "Order Number: 7712345678", "7712345678"],
  ["nordstrom", "Order number 123456789", "123456789"],
  ["etsy", "Order #3123456789 confirmed", "3123456789"],
  ["amazon", "Wrrapd order AZ-123456789-ABC123 paid", null],
  ["target", "Thanks for shopping", null],
];

for (const [retailer, text, want] of cases) {
  assert.equal(extractRetailerOrderNumber(retailer, text), want, `${retailer}: ${text}`);
}
console.log(`retailer order capture: ${cases.length} cases ok`);
