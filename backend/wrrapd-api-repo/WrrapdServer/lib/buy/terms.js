/**
 * Purchasing terms for the "We buy it for you" page only. Separate from lib/shopper-terms.js
 * (the extension's terms), which this module does not change.
 * Draft for counsel review. A changed text must get a new VERSION.
 */

const VERSION = 'buy-terms-2026-10-18-draft';
const PHONE = '(844) 638-5484';

const TITLE = 'Wrrapd Inc. Terms & Conditions';
const SUBTITLE = 'You order through us. We gift-wrap it and deliver it';
const LEADS = [
    'Returns are allowed for 15 days after delivery, and only on the conditions in section 19. After that moment, the sale is final. Wrrapd does not make exceptions.',
    'You order through us. Wrrapd may be the buyer of record. For electronics, phones, and similar goods, a warranty or store protection may not cover purchases via third-party.',
];

const ELECTRONICS_SENTENCE =
    'I understand Wrrapd is buying this electronic item, and that the warranty or store protection may not cover purchases via third-party.';
const AGREE_LABEL = 'I have read these Terms and I agree.';

/** Each clause: [title, ...paragraphs]. A paragraph that is an array renders as a list. */
const CLAUSES = [
    ['Scope of these Terms', `These Terms & Conditions (“Terms”) apply to orders you place on Wrrapd’s we-buy-it page. On that page you ask Wrrapd Inc. (“Wrrapd,” “we,” “us”) to purchase specific items from a retailer, receive them at our hub, gift-wrap them, and deliver them to the giftee address you give us. These Terms do not apply to the Chrome extension checkout, where you buy the item yourself and we only gift-wrap it. That checkout has its own terms. If you use both, each order follows the terms you accepted for that order.`],
    ['Eligibility', 'You must be at least 18 years old, or the age of majority where you live, to place an order. You are the customer. The giftee is not.'],
    ['Privacy Policy', 'Your use of the service is subject to Wrrapd’s Privacy Policy at https://www.wrrapd.com/privacy.'],
    ['What you are asking us to do', 'For each item shown on your confirmation card, you ask us to buy that item, in that variant and quantity, at the price shown, from the retailer shown, and to have it shipped to our hub with the shipping option you chose. You then ask us to gift-wrap it and deliver it to the giftee. Every item on this page is gift-wrapped. We do not visit a store for you. We do not use your retailer account. We do not change the size, color, model, seller, or quantity after you confirm the card.'],
    ['Limited purchasing agency', `By clicking the agreement control, you appoint Wrrapd Inc. as your limited agent and attorney-in-fact for one purpose only: to purchase the confirmed items and to give the retailer our hub as the ship-to address. We act only on the items, variants, and quantities on the confirmation cards tied to this acceptance. We have no authority to buy a substitute. We have no authority over any retailer account that belongs to you. You may revoke this appointment by calling ${PHONE} before we place the retailer order. Once we have placed that order, or once we have been charged by the retailer, the appointment for that item is complete and you cannot undo it by revoking the agency.`],
    ['Buyer of record', 'The retailer sale may be in Wrrapd’s name, on a Wrrapd account, or in the name of a person we designate. You acknowledge that you may not be the retailer’s customer of record. Retailer receipts, return rights, protection plans, and promotional benefits may name Wrrapd and may not name you or the giftee. We do not transfer those retailer accounts to you. We do not promise that the retailer will treat you as the purchaser.'],
    ['The confirmation card is the item', 'You agree that the item we may buy is only the item on the confirmation card: retailer, product title, product id, variant (including size, color, configuration, and seller when shown), quantity, and price. A link that does not pin a variant is not an instruction to choose one for you. If we cannot show a single in-stock variant and price, we will not take payment for that link. You cannot type your own price.'],
    ['Purchase Limit', 'The combined item price of the products, before shipping to our hub, before retailer tax, and before gift-wrap, design, flowers, and box fees, may not exceed the Purchase Limit shown on the order page immediately before you accept these Terms. Shipping, retailer tax, and service fees are charged in addition to that limit and are shown as their own lines. If the item prices would put the total over the Purchase Limit, we refuse the order. We may lower the Purchase Limit for a future order. The limit shown to you for this order is the one that applies to this order.'],
    ['The retailer cost page is the price', 'Before gift-wrap choices begin, we confirm each item under section 21. The confirmation card shows the item price, the shipping charge to our hub, and the retailer tax from that review. You must also enter the giftee ZIP code on the retailer’s product page so the shipping we show is accurate. When the retailer offers more than one shipping option, you may choose one on the order page. We charge exactly the shipping price that the retailer shows for the option you chose, with no markup. If we cannot complete that review for a link, we tell you on that link immediately, we do not include it in gift-wrap, and we do not charge you for it. You may continue with the items we could confirm. When you click to pay, we repeat the review before any charge. If an item price, shipping, or tax has changed, we put the new figures on the bill and we tell you which item changed. We do not charge you until those new figures are on the page. You agree to pay the figures shown after that refresh, plus the Wrrapd service lines shown. We place the retailer order only for that refreshed review.'],
    ['Electronics, phones, and similar goods', 'If a confirmation card includes electronics, a phone, a computer, a tablet, a wearable, a camera, a game console, a smart-home device, or a similar good, you must accept a separate sentence before you can pay. You acknowledge all of the following. The manufacturer’s warranty, the retailer’s protection plan, carrier insurance, an extended warranty, a trade-in offer, and programs such as those offered by Apple, Samsung, and other brands may be reduced, refused, delayed, or void because Wrrapd is the buyer of record, because the item ships to our hub, because the package may be opened for gift-wrapping, and because it is then shipped again to the giftee. We do not register the product in your name or the giftee’s name. We do not provide a receipt in the giftee’s name. We do not promise that any warranty can be transferred. You accept that risk before we buy the item. If you do not accept that sentence, we do not buy that item.'],
    ['Marketplace sellers and third parties', 'Some listings are sold by a marketplace seller rather than by the store itself. Those sellers set their own return rules. You acknowledge that a third-party seller may refuse a return, may ship a different item, or may cancel after the order is placed. We may refuse any listing sold by a third party, and we may refuse any listing we cannot bring to the cost-page review in section 21. A refusal at that stage means we do not charge you for that link. If the seller ships the wrong item, section 17 and section 19 apply. We do not owe you the benefit of a protection program that names only the original purchaser.'],
    ['Gift-wrap service', 'Every item you order on this page is gift-wrapped. Wrrapd provides professional exterior gift-wrapping and may include a message, a tag, a Wrrapd design, a design you upload, an AI design, or flowers, when those choices are offered for the giftee ZIP code. Custom designs and flowers are described on the order page before you pay. Flowers are perishable. A custom or AI design is made for this order.'],
    ['Fees and taxes', 'The order page lists each line before you pay. Item price, shipping to our hub for the option you chose, and retailer tax come from the cost-page review in section 21. They are separate from gift-wrap, custom design, flowers, box fees, and tax on the Wrrapd service. By paying, you accept those amounts. Tax on the Wrrapd service is calculated for the giftee ZIP code. Retailer tax is the tax on that cost page, because the retailer ships to our hub.'],
    ['Delivery time', 'The retailer ships to our hub, not to the giftee. Items that reach our hub on the same day are gift-wrapped and delivered together. Items that reach our hub on different days are delivered separately. Gift-wrapping adds at least one business day after we receive the item. An additional day is often required when we receive the item after 2:00 p.m. local time. Any date we show is an estimate. It depends on the retailer and on the shipping option you chose.'],
    ['Retailer delays', 'You agree that we are not responsible for a retailer or a seller that ships late or splits a shipment. If, after we have placed the retailer order, the retailer cancels it and returns the item price, shipping, or tax to us, we return those same amounts to you for that line. We return the Wrrapd service fees for that line only when wrapping has not been documented.'],
    ['Video proof', 'Wrrapd makes a video record of (a) receipt of the retailer package at our hub, (b) opening that package, (c) gift-wrapping, and (d) handoff of the wrapped gift for final delivery. That record is our evidence of what arrived and of what we did. It is not a product inspection and it is not a promise that the product works.'],
    ['We do not test the product', 'We do not open the product’s own sealed contents to test them, turn them on, or compare them with the manufacturer’s description, except as needed to gift-wrap the exterior. We are not responsible for defects, missing parts, counterfeit goods, or the wrong item inside a factory seal. Those issues are handled only through section 19, and only when a return is still allowed.'],
    ['The giftee', 'The giftee does not accept these Terms and cannot change them. The giftee cannot start a return, a cancellation, or a refund. Only the person who paid may do that. Delivery to the giftee address you gave us completes delivery. A giftee who is away, who opens the gift late, or who does not want the gift does not extend the 15 days.'],
    [
        'Strict 15-day return policy',
        `You may ask to return a purchased item only by contacting Wrrapd at ${PHONE} or at the email on your receipt. We must receive the request by 11:59 p.m. Eastern Time on the 15th calendar day after the day the wrapped gift is marked delivered to the giftee address. If we mark it delivered on March 1, the last moment to ask is 11:59 p.m. Eastern Time on March 16. The count uses calendar days. Weekends and holidays count. Each delivered package has its own 15 days. This window is strict. A request received after that moment is refused. We do not extend the time because the giftee opened the gift late, because you were traveling, because a message reached us late, or because you did not read these Terms.`,
        'A return is allowed only when every one of the following is true:',
        [
            '(a) We received your request inside the window, and the request is from the person who paid.',
            '(b) You give us the order number and the item.',
            '(c) The item is unused and unworn, in the condition in which the retailer shipped it, with the original packaging, tags, manuals, parts, and accessories.',
            '(d) If the retailer shipped it sealed, the seal is unbroken.',
            '(e) The item is not in a non-returnable category in section 20.',
            '(f) The retailer or seller we bought it from will accept a return of that specific item at that time, under that seller’s rules.',
            '(g) You follow the written instructions we send, and the item reaches the place we name within 7 days after we send those instructions. You pay the cost of getting it back to us unless we say otherwise in writing.',
        ],
        'If any one of (a) through (g) is missing, we refuse the return. There is no partial credit and no exchange.',
        'If we accept the return, the refund is limited to the item price and the retailer tax we collected for that item. We send that refund only after the item is back and, when the retailer or seller must accept the return, only after that retailer or seller refunds us. We refund shipping to our hub only if the retailer refunds that shipping to us. We do not refund gift-wrap, a custom or AI design, flowers, a box fee, or tax on those service fees.',
        'After 11:59 p.m. Eastern Time on the 15th calendar day, the sale of that item is final. Wrrapd has no duty to make an exception.',
    ],
    [
        'Items we do not take back',
        'Even inside the 15 days, we do not take back, and we do not refund, any of the following:',
        [
            'Flowers, food, and anything else that perishes.',
            'Gift-wrap, paper, boxes, tissue, ribbon, and tags that we added.',
            'A custom design, an uploaded design, an AI design, engraving, or any personalization.',
            'A listing the retailer marked final sale, non-returnable, or clearance, when that condition was on the confirmation card or on the retailer page at purchase.',
            'Beauty, cosmetics, fragrance, and hygiene items if a seal is broken or the item was used.',
            'Electronics, phones, computers, tablets, wearables, cameras, consoles, and similar goods if a seal is broken, the item was powered on, registered, paired, or activated, or the retailer or seller will not accept the return.',
            'Any item that is not in resalable condition, including items with a broken seal, missing parts, a gift message written on the product, or damage after delivery.',
            'Any item the retailer or seller refuses.',
        ],
    ],
    ['Confirmation on our retailer account, before gift-wrap', 'Before you choose gift-wrap, we sign in on our own account at the retailer, set the ship-to address to our hub for the giftee ZIP code you entered, and open the retailer’s final cost review for the confirmed items. That review is the only source of the item price, the shipping options and their charges to our hub, and the retailer’s tax. We then leave that review without placing the order and without paying the retailer, and we show those figures on this page. We tell you on the page as soon as a link cannot be confirmed. We do not open gift-wrap choices for that link, and we do not charge your card for it. We do not charge a shipping amount that was not on that review. We do not choose a different size, color, seller, quantity, or shipping option after the review. When you click to pay, we read that review again. If a price has changed, we show the new price and the name of the item before we charge you. When we later place the order, we place it for that same cart, to that same hub, with the shipping option you chose. If the retailer total has moved again after you paid, we do not place it until you have accepted the newer price on the bill.'],
    ['No cancellation after we buy', 'You do not have a right to cancel an item after we place the retailer order or after the retailer charges us. Calling us to cancel does not stop the retailer and does not start a return early. If the retailer cancels and returns money to us, section 15 applies. If the retailer keeps a fee, we may deduct that fee from the amount we return.'],
    ['Delivery that does not happen', `If the wrapped gift is never marked delivered, the 15-day clock in section 19 does not start. Call ${PHONE}. We may attempt delivery again. If we cannot complete delivery, we will refund the merchandise price and merchandise tax for that line, and we will refund the Wrrapd service fees for that line if we failed to ship within the window we stated. If the failure is caused by an address you gave us, we may use one further attempt and may keep the service fees when the video record shows the wrapped gift was tendered for that address.`],
    ['Extra items and items you did not confirm', `If a retailer delivers something you did not confirm, it is not part of the gift-wrap order. Call ${PHONE} within 48 hours after we receive it to arrange pickup. We are not responsible for an unconfirmed item that is not arranged for pickup within that time.`],
    ['Service-fee refunds', 'Gift-wrap, design, flower, and box fees, and tax on those fees, are non-refundable except in the limited cases already stated: (a) damage to the gift-wrap itself during transit after we handed it off, (b) our failure to ship the wrapped item within the window we stated, or (c) a retailer cancellation under section 15 before wrapping is documented. They are not refunded because the giftee dislikes the color, the design, the flowers, or the product. They are not refunded on an accepted merchandise return under section 19. Service fees are not refunded once the wrapping process has been documented, except for (a).'],
    ['Indemnification', 'You agree to indemnify and hold harmless Wrrapd Inc. from claims, losses, and expenses arising from the condition or quality of the product, from a retailer or manufacturer refusing a warranty or a return, from the giftee’s use of the product, from an address or instruction you gave us, or from your violation of these Terms.'],
    ['Prohibited conduct and prohibited items', 'You agree not to give false information, not to use a card you are not allowed to use, and not to use the service for fraud or for anything illegal. You will not submit a link for a weapon, ammunition, a live animal, alcohol, tobacco, a drug, a gift card, a digital code, a subscription, a hazardous material, or an age-restricted item. We may refuse any link. A refusal before the cost-page review means we do not charge you for that link.'],
    ['Warranties and limit of liability', 'The service and the purchasing agency are provided “AS IS.” Except for a refund that these Terms expressly require, Wrrapd’s total liability for an item is limited to the amount you paid us for that item’s merchandise line and that item’s service fees. We are not liable for indirect, incidental, special, or consequential damages, including a missed occasion, a lost warranty, a voided protection plan, or a giftee’s disappointment. Some places do not allow certain limits. In those places, the limit applies to the extent the law allows.'],
    ['Card disputes', `If you have a question about a charge, call ${PHONE} before you dispute it with your card issuer. A card dispute does not extend the 15 days and does not create a return right that section 19 refuses. We may answer the issuer with these Terms, the confirmation card, the acceptance record, and the video proof.`],
    ['Dispute resolution and governing law', 'Any dispute will be resolved by binding individual arbitration in St. Petersburg, Florida. You waive the right to a jury trial. You waive the right to participate in a class action or a class arbitration. These Terms are governed by the laws of the State of Florida, USA, without regard to conflict-of-law rules. You may arbitrate or bring a qualifying claim in a small-claims court in Pinellas County, Florida, instead of arbitration, if you qualify and you stay in that court.'],
    ['The version you accepted', 'The Terms version shown in the modal is the version that governs this order. A later change to these Terms does not change an order you already paid for. If you do not agree, do not click the agreement control and do not pay.'],
];

function esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function clausesHtml() {
    return CLAUSES.map(([title, ...paras], i) => {
        const body = paras
            .map((p) => (Array.isArray(p) ? `<ul>${p.map((li) => `<li>${esc(li)}</li>`).join('')}</ul>` : `<p>${esc(p)}</p>`))
            .join('');
        return `<section class="wbt-clause" id="wbt-${i + 1}"><h4>${i + 1}. ${esc(title)}</h4>${body}</section>`;
    }).join('');
}

function publicTerms() {
    return {
        version: VERSION,
        title: TITLE,
        subtitle: SUBTITLE,
        leads: LEADS,
        html: clausesHtml(),
        clauseCount: CLAUSES.length,
        electronicsSentence: ELECTRONICS_SENTENCE,
        agreeLabel: AGREE_LABEL,
        phone: PHONE,
    };
}

module.exports = { VERSION, publicTerms, ELECTRONICS_SENTENCE, AGREE_LABEL };
