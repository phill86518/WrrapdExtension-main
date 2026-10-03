/**
 * Facts the support assistant may use. Keep every line true for the live service —
 * the model is told to say "a team member will follow up" for anything not covered here.
 * Never add contractor pay amounts or specific prices.
 */
export const SHOPPER_FACTS = `
WHAT WRRAPD IS
- Wrrapd gift-wraps online purchases and delivers them to the gift recipient.
- Shoppers use the free Wrrapd Chrome extension while checking out at Amazon, Target, Walmart, Nordstrom, Kohl's, Ulta, Sephora, Best Buy, LEGO, or Etsy.
- At checkout the shopper picks Wrrapd gift wrap, ships the order to the Wrrapd hub (the extension fills in the address), pays Wrrapd for the wrap, then finishes the store checkout as usual.

WRAP OPTIONS
- Let Wrrapd pick the wrap, upload your own design, or create a design with AI.
- An optional fresh flower bouquet can be added. Actual bouquets might differ slightly from the photos shown.
- A gift message can be added in the store's gift options.

DELIVERY
- Wrrapd currently delivers in Jacksonville / Duval County, Florida. More areas are coming.
- Final delivery to the recipient is free.
- Wrrapd adds at most one day. Gifts that reach the Wrrapd hub by 8 AM are usually wrapped and delivered that same day.
- The shopper gets a tracking link by text and a photo proof of delivery when the gift is delivered.
- Gifts over $100 are handed to an adult at the door rather than left outside.

PRICES AND PAYMENT
- The wrap price and any add-ons are shown in the Wrrapd Summary before paying. Do not quote prices.
- Wrrapd is paid separately from the store; the store still charges for the products.

HELP
- Install link and details: wrrapd.com
- For order changes, refunds, damaged or missing items, a Wrrapd team member follows up personally.
`.trim();

export const CONTRACTOR_FACTS = `
ROLES
- WrapStars gift-wrap orders. JoyRiders deliver wrapped gifts. WrapRiders do both: wrap and deliver.
- The contractor portal is pros.wrrapd.com. Applications are at apply.wrrapd.com.

WRAPPING
- Record the wrap video for every gift (table view, good light) in the portal shift recorder.
- Label each package and each finished gift with its Wrrapd order number.

DELIVERY
- Take a clear photo of the wrapped gift at the door for proof of delivery, then mark it delivered in the portal.
- Gifts over $100: hand to an adult at the door; never leave them outside.
- Never mention what is inside the gift to the recipient.

THINGS A TEAM MEMBER HANDLES
- Pay, payouts, and tax forms. Schedule changes and time off. Kit or equipment problems.
- Accidents, damaged gifts, an address that cannot be found, or a recipient who is not home.
`.trim();

export const APPLICANT_FACTS = `
- Thanks for applying to Wrrapd. Applications are reviewed by a team member, who texts or emails the next step.
- Applicants can finish or review their application at apply.wrrapd.com.
- Pay is hourly and confirmed at approval. Never state an amount.
`.trim();
