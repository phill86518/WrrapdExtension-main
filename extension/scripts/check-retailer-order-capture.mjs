import assert from "node:assert/strict";
import { extractRetailerOrderNumber } from "../src/shared/retailer-order-capture.js";

/** Order numbers below are real formats from retailer confirmation emails / order pages (researched Oct 2026). */
const cases = [
  ["amazon", "Order placed, thanks!\nConfirmation will be sent to your email.\nOrder # 112-3456789-1234567", "112-3456789-1234567"],
  ["amazon", "Order placed, thanks! Wrrapd AZ-123456789-ABC123\n112-3456789-1234567", "112-3456789-1234567"],
  ["target", "Thanks for your order!\nOrder #912002895833290", "912002895833290"],
  ["target", "Thanks for your order! We'll email you when it ships. 902001863311107", "902001863311107"],
  ["walmart", "Thanks for your order\nOrder# 2000123-45678901", "2000123-45678901"],
  ["walmart", "Thanks for your order\nOrder number 2000081719384", "2000081719384"],
  ["bestbuy", "Thank you for your order. Your order number is BBY01-806587123456", "BBY01-806587123456"],
  ["kohls", "Thank you for your order!\nOrder Number: 6514816483", "6514816483"],
  ["nordstrom", "Thanks for your order, Karyna!\nOrder #818411566", "818411566"],
  ["sephora", "Thank you for your order!\nOrder #22900944454", "22900944454"],
  ["ulta", "Thank you for your order!\nOrder #: K190000004", "K190000004"],
  ["lego", "Thank you for your order\nOrder number: T461059900", "T461059900"],
  ["etsy", "Your order is confirmed\nOrder #3123456789", "3123456789"],
  // Embedded page data fallback (number not printed as text).
  ["kohls", "Thank you for your order!", null],
  // Not a confirmation page: never capture.
  ["target", "Checkout  Review your order  Place your order  Order #912002895833290", null],
  // Wrong shape for the retailer.
  ["ulta", "Thank you for your order! Order #123", null],
  ["nordstrom", "Thanks for your order! Order # 12345", null],
  ["amazon", "Order placed, thanks! Wrrapd order AZ-123456789-ABC123", null],
];

for (const [retailer, text, want] of cases) {
  assert.equal(extractRetailerOrderNumber(retailer, text), want, `${retailer}: ${text}`);
}
assert.equal(
  extractRetailerOrderNumber("kohls", "Thank you for your order!", '{"page":"confirm","orderId":"6514816483"}'),
  "6514816483",
  "embedded page data",
);
console.log(`retailer order capture: ${cases.length + 1} cases ok`);
