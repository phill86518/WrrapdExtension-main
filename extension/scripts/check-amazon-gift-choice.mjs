import assert from "node:assert/strict";
import {
  AMAZON_GIFT_CHOICE_TTL_MS,
  giftChoiceIsCurrent,
  selectAmazonCheckoutGiftItems,
} from "../src/shared/amazon-gift-choice.js";

const now = 1_700_000_000_000;
const fresh = { greeting: "roger", touchedAt: now - 5 * 60 * 1000 };
const alarm = {
  asin: "B0ALARMCLK",
  title: "Peakeep 115dB Super Loud Alarm Clock",
  options: [{ checkbox_wrrapd: false, checkbox_flowers: false }],
};
const staleGift = {
  asin: "B0OLDGIFT1",
  title: "Previous gift that was wrapped with flowers",
  options: [
    {
      checkbox_wrrapd: true,
      checkbox_flowers: true,
      selected_wrapping_option: "wrrapd-ai",
    },
  ],
};
const page = {
  asins: ["B0ALARMCLK", "B0PEANUT01"],
  text: "Peakeep 115dB Super Loud Alarm Clock PLANTERS Salted Peanuts",
};

const items = {
  [alarm.title]: alarm,
  [staleGift.title]: staleGift,
};

assert.deepEqual(
  selectAmazonCheckoutGiftItems(items, page, fresh, now, "roger"),
  {},
  "a saved gift whose product is not in this order must not price",
);

const sameProduct = {
  [staleGift.title]: { ...staleGift, asin: "B0ALARMCLK" },
};
assert.deepEqual(
  Object.keys(selectAmazonCheckoutGiftItems(sameProduct, page, fresh, now, "roger")),
  [staleGift.title],
  "the same product with Wrrapd chosen still prices",
);

assert.deepEqual(
  selectAmazonCheckoutGiftItems(sameProduct, page, fresh, now, "jane"),
  {},
  "a different Hello greeting drops the saved gift",
);

assert.equal(
  giftChoiceIsCurrent(
    { greeting: "roger", touchedAt: now - AMAZON_GIFT_CHOICE_TTL_MS - 1 },
    now,
    "roger",
  ),
  false,
  "a choice older than 30 minutes is stale",
);

assert.deepEqual(
  selectAmazonCheckoutGiftItems(sameProduct, page, null, now, "roger"),
  {},
  "a saved gift with no choice stamp must not price",
);

const unchecked = {
  [alarm.title]: alarm,
};
assert.deepEqual(
  selectAmazonCheckoutGiftItems(unchecked, page, fresh, now, "roger"),
  {},
  "a product on the page that was never opted into Wrrapd must not price",
);

const titleOnly = {
  "Peakeep 115dB Super Loud Alarm Clock for teens": {
    asin: "B0NOTONPAG",
    title: "Peakeep 115dB Super Loud Alarm Clock for teens",
    options: [{ checkbox_wrrapd: true }],
  },
};
assert.equal(
  Object.keys(selectAmazonCheckoutGiftItems(titleOnly, page, fresh, now, "roger")).length,
  1,
  "a visible title still counts when the ASIN is not in the checkout DOM",
);

const hiddenAsinOnly = {
  "Gift with a long title Amazon collapses on payment": {
    asin: "B09877RTJG",
    title: "Gift with a long title Amazon collapses on payment",
    options: [{ checkbox_wrrapd: true }],
  },
};
assert.equal(
  Object.keys(
    selectAmazonCheckoutGiftItems(
      hiddenAsinOnly,
      { asins: [], text: "Arriving Oct 26 B09877RTJG Review order" },
      fresh,
      now,
      "roger",
    ),
  ).length,
  1,
  "an ASIN only in Amazon's hidden asin_* text still counts",
);

assert.deepEqual(
  selectAmazonCheckoutGiftItems(
    hiddenAsinOnly,
    { asins: [], text: "XB09877RTJGX" },
    fresh,
    now,
    "roger",
  ),
  {},
  "an ASIN inside a longer token does not count",
);

console.log("amazon gift choice checks passed");
