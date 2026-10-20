import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  anonymizeShopifyOrderFields,
  isShopifyChannelOrder,
} from "./shopify-privacy";
import type { Order } from "./types";

function baseOrder(over: Partial<Order>): Order {
  return {
    id: "wrr-test",
    customerName: "A",
    customerPhone: "1",
    recipientName: "Giftee",
    addressLine1: "1 Main",
    city: "Jax",
    state: "FL",
    postalCode: "32202",
    scheduledFor: new Date().toISOString(),
    status: "delivered",
    trackingToken: "t",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

describe("shopify-privacy hard boundary", () => {
  it("treats only retailer Shopify as in-channel", () => {
    assert.equal(isShopifyChannelOrder(baseOrder({ retailer: "Shopify" })), true);
    assert.equal(isShopifyChannelOrder(baseOrder({ retailer: "Amazon" })), false);
    assert.equal(isShopifyChannelOrder(baseOrder({ retailer: "Target" })), false);
    assert.equal(isShopifyChannelOrder(baseOrder({})), false);
    // SH- prefix alone is NOT enough — must be retailer Shopify
    assert.equal(
      isShopifyChannelOrder(baseOrder({ externalOrderId: "SH-store-1001" })),
      false,
    );
  });

  it("refuses to anonymize non-Shopify orders", () => {
    const amazon = baseOrder({ retailer: "Amazon", customerEmail: "a@x.com" });
    assert.equal(anonymizeShopifyOrderFields(amazon), null);

    const shopify = baseOrder({
      retailer: "Shopify",
      externalOrderId: "SH-demo-1001",
      customerEmail: "s@x.com",
    });
    const patch = anonymizeShopifyOrderFields(shopify);
    assert.ok(patch);
    assert.equal(patch!.recipientName, "[redacted]");
    assert.equal(patch!.customerEmail, "[redacted]");
  });
});
