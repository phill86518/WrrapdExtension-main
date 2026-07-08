/**
 * Generic Wrrapd "ship-to-hub" checkout pay flow for retailers that use the
 * shared cart gift opt-in (Sephora, and later Walmart/Nordstrom/etc.).
 *
 * Responsibilities (mirrors the proven LEGO flow, made config-driven):
 *   1. On the retailer checkout page, when the customer opted into Wrrapd
 *      (radio "yes" + saved choices + accepted terms), mount a "Pay Wrrapd"
 *      summary panel near the retailer's checkout/place-order button and gate
 *      that button until Wrrapd payment succeeds.
 *   2. Open pay.wrrapd.com/checkout/<route> in a popup with the order payload.
 *   3. On the pay popup's success postMessage, call /process-payment and mark
 *      the Wrrapd payment complete.
 *   4. Auto-fill the retailer's shipping form with the Wrrapd HUB address so
 *      the retailer ships to Wrrapd for wrapping.
 *
 * The retailer adapter supplies DOM-specific hooks via `config`.
 */
import {
  readGiftChoicesSaved,
  readGiftLegalTermsAccepted,
  readGiftRadio,
  readItemChoices,
  readPaymentSuccess,
  writePaymentSuccess,
  WRRAPD_GIFT_RADIO_CHANGE_EVENT,
} from "./cart-gift-session.js";
import {
  buildCartFingerprint,
  createSharedGiftSessionAdapter,
  defaultEmptyChoice,
  syncGiftSessionWithCart,
  WRRAPD_CART_SYNC_EVENT,
  writeCartFingerprint,
} from "./cart-gift-sync.js";
import { hubAsPaymentAddress } from "./wrrapd-hub.js";
import { buildGiftWrapInvoiceRows } from "./wrrapd-invoice-lines.js";
import { captureRetailerDeliveryDate } from "./retailer-delivery-date.js";
import { generateWrrapdOrderNumber } from "./wrrapd-order-code.js";
import {
  resolveTaxRatePercent,
  taxPostalForPricing,
  WRRAPD_DEFAULT_TAX_RATE_PERCENT,
} from "./wrrapd-tax.js";

const PAY_ORIGIN = "https://pay.wrrapd.com";
const SUMMARY_HOST_ATTR = "data-wrrapd-pay-summary-host";

/** Default customer-facing payment panel copy (override per retailer via config). */
const DEFAULT_PAY_COPY = Object.freeze({
  panelTitle: "Your Wrrapd gift-wrap order",
  lineGiftWrap: "Gift-wrapping",
  pendingHint: "Please complete payment to Wrrapd before continuing.",
  successHint: "Thank you! Your payment was received — you may continue checkout.",
  paidButton: "Thank you — you may continue",
});

const UNIT_PRICES_FALLBACK = Object.freeze({
  giftWrapBase: 6.99,
  customDesignAi: 2.99,
  customDesignUpload: 1.99,
  flowers: 17.99,
});

function orderNumberKey(prefix) {
  return `${prefix}OrderNumber`;
}

function gifteeZip5(prefix) {
  try {
    return String(sessionStorage.getItem(`${prefix}ValidatedEstimateZip`) || "")
      .replace(/\D/g, "")
      .slice(0, 5);
  } catch {
    return "";
  }
}

function generateOrderNumber(retailerName) {
  return generateWrrapdOrderNumber(retailerName);
}

function normalizeRetailerKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readSession(key) {
  try {
    return sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

// ─── Pricing ────────────────────────────────────────────────────────────────

function createPricingState() {
  return {
    unitPriceOverride: null,
    taxPercent: WRRAPD_DEFAULT_TAX_RATE_PERCENT,
    pricingFetchComplete: false,
  };
}

function getActiveUnitPrices(state) {
  return state.unitPriceOverride || UNIT_PRICES_FALLBACK;
}

const PRICE_REFRESH_TTL_MS = 5 * 60 * 1000;

async function refreshUnitPricesFromServer(state, geo, retailer) {
  try {
    const u = new URL("https://api.wrrapd.com/api/pricing-preview");
    if (geo?.postalCode) u.searchParams.set("postalCode", String(geo.postalCode).trim().slice(0, 16));
    if (geo?.state) u.searchParams.set("state", String(geo.state).trim().slice(0, 16));
    if (geo?.country) u.searchParams.set("country", String(geo.country).trim().slice(0, 8));
    if (retailer) u.searchParams.set("retailer", String(retailer).trim().slice(0, 32));
    const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(8000) : undefined;
    const r = await fetch(u.toString(), { credentials: "omit", signal });
    if (!r.ok) return;
    const j = await r.json();
    state.taxPercent = resolveTaxRatePercent(
      typeof j.estimatedSalesTaxPercent === "number" ? j.estimatedSalesTaxPercent : null,
    );
    const up = j && typeof j.unitPrices === "object" ? j.unitPrices : null;
    if (!up) return;
    const next = {
      giftWrapBase: Number(up.giftWrapBase),
      customDesignAi: Number(up.customDesignAi),
      customDesignUpload: Number(up.customDesignUpload),
      flowers: Number(up.flowers),
    };
    if (Object.values(next).every((n) => Number.isFinite(n) && n >= 0 && n < 100000)) {
      state.unitPriceOverride = next;
    }
  } catch (e) {
    console.warn("[Wrrapd pay] pricing-preview", e);
  }
}

/**
 * Memoized price refresh: at most one in-flight request, re-fetched only after
 * the TTL expires. The summary UI re-renders on every DOM mutation on SPA-style
 * checkouts (Etsy, Sephora), so the raw fetch must never run per-render.
 */
function ensureUnitPrices(state, geo, retailer) {
  const now = Date.now();
  if (state.lastPriceFetchAt && now - state.lastPriceFetchAt < PRICE_REFRESH_TTL_MS) {
    return Promise.resolve();
  }
  if (!state.priceFetchPromise) {
    state.priceFetchPromise = refreshUnitPricesFromServer(state, geo, retailer).finally(() => {
      state.priceFetchPromise = null;
      state.lastPriceFetchAt = Date.now();
      state.pricingFetchComplete = true;
    });
  }
  return state.priceFetchPromise;
}

function computeServiceSubtotalCents(state, prefix) {
  const p = getActiveUnitPrices(state);
  const choices = readItemChoices(prefix);
  const n = Math.max(1, choices.length);
  let dollars = p.giftWrapBase * n;
  for (const ch of choices) {
    if (ch.wrapPref === "ai") dollars += p.customDesignAi;
    if (ch.wrapPref === "upload") dollars += p.customDesignUpload;
    if (ch.flowers) dollars += p.flowers;
  }
  return Math.round(dollars * 100);
}

function computeTotalBreakdown(state, prefix) {
  const subtotalCents = computeServiceSubtotalCents(state, prefix);
  const pct = resolveTaxRatePercent(state.taxPercent);
  const taxCents = Math.round(subtotalCents * (pct / 100));
  return {
    subtotalCents,
    taxCents,
    taxUsd: taxCents / 100,
    totalCents: subtotalCents + taxCents,
  };
}

function buildSummaryLinesAndTotal(state, prefix) {
  const p = getActiveUnitPrices(state);
  const choices = readItemChoices(prefix);
  const rows = buildGiftWrapInvoiceRows(choices, p);
  const br = computeTotalBreakdown(state, prefix);
  if (br.taxUsd > 0) rows.push({ label: "Sales tax", amount: `$${br.taxUsd.toFixed(2)}` });
  return { invoiceRows: rows, totalCents: br.totalCents };
}

// ─── Order data + giftee stub ─────────────────────────────────────────────────

function buildOrderData(config) {
  const snapshot = config.getCartSnapshot?.() || { items: [] };
  const cartLines = Array.isArray(snapshot.items) && snapshot.items.length > 0
    ? snapshot.items
    : [{ title: `${config.retailerName} order`, itemId: "", imageUrl: "" }];
  const choices = readItemChoices(config.sessionPrefix);
  // Retailer's own promised delivery date (Wrrapd schedules its delivery for this + 1 day).
  // Some retailers (e.g. Kohl's) let the shopper change shipping speed / expedite at checkout,
  // so any concrete date we scrape is unreliable — those set `captureDeliveryDate:false` and the
  // confirmation email falls back to the safe generic "<retailer>'s delivery date + 1 day" wording.
  const estimatedDeliveryDate =
    config.captureDeliveryDate === false
      ? null
      : captureRetailerDeliveryDate({ deliveryDateSelectors: config.deliveryDateSelectors }) || null;
  return cartLines.map((line, idx) => {
    const ch = choices[idx] || {};
    const wrap = ch.wrapPref || "wrrapd";
    const flowers = ch.flowers === true;
    return {
      asin: line.itemId || line.id || config.retailerName,
      title: line.title || `${config.retailerName} order — Wrrapd gift wrap`,
      imageUrl: line.imageUrl || "",
      sku: line.itemId || null,
      checkbox_wrrapd: true,
      selected_wrapping_option: wrap,
      checkbox_flowers: flowers,
      selected_flower_design: flowers ? (ch.flowerDesign || null) : null,
      selected_ai_design: wrap === "ai" ? (ch.aiDesign || null) : null,
      uploaded_design_name: wrap === "upload" ? (ch.uploadName || null) : null,
      aiPrompt: wrap === "ai" ? (ch.aiPrompt || null) : null,
      wrrapdHint: wrap === "wrrapd" ? (ch.wrrapdHint || null) : null,
      occasion: wrap === "wrrapd" ? (ch.occasion || null) : null,
      giftMessage: ch.message || null,
      estimatedDeliveryDate,
    };
  });
}

/** Server-side PaymentIntent amount (must mirror Amazon/LEGO checkout math). */
function buildPricingCart(state, prefix, retailer) {
  const choices = readItemChoices(prefix);
  const zipForTax = taxPostalForPricing(gifteeZip5(prefix));
  const taxRatePercent = resolveTaxRatePercent(state.taxPercent);
  const items =
    choices.length > 0
      ? choices.map((ch) => ({
          options: [
            {
              checkbox_wrrapd: true,
              selected_wrapping_option: ch.wrapPref || "wrrapd",
              checkbox_flowers: ch.flowers === true,
            },
          ],
        }))
      : [
          {
            options: [
              { checkbox_wrrapd: true, selected_wrapping_option: "wrrapd", checkbox_flowers: false },
            ],
          },
        ];
  return {
    items,
    taxRatePercent,
    postalCode: zipForTax,
    state: "",
    country: "US",
    retailer: retailer ? String(retailer).trim().slice(0, 32) : "",
  };
}

/** Giftee stub from the validated estimate ZIP (full address arrives on the pay page). */
function gifteeStub(prefix) {
  const zip = gifteeZip5(prefix);
  return {
    name: "Your giftee (Wrrapd delivery after wrap)",
    street: "",
    city: "",
    state: "",
    postalCode: zip,
    country: "United States",
    phone: "",
  };
}

// ─── Payment summary panel ─────────────────────────────────────────────────────

function removeSummary() {
  document.querySelectorAll(`[${SUMMARY_HOST_ATTR}]`).forEach((n) => n.remove());
}

/** @returns {{ parent: Element, before?: Element|null } | null} */
function resolveSummaryMountAnchor(config) {
  if (typeof config.findSummaryMountAnchor === "function") {
    const custom = config.findSummaryMountAnchor();
    if (custom?.parent) return custom;
  }
  const btn = config.findCheckoutButton?.();
  if (btn?.parentElement) return { parent: btn.parentElement, before: btn };
  return null;
}

function getGatedCheckoutButtons(config) {
  if (typeof config.findGatedCheckoutButtons === "function") {
    const list = config.findGatedCheckoutButtons();
    return Array.isArray(list) ? list.filter(Boolean) : [];
  }
  const one = config.findCheckoutButton?.();
  return one ? [one] : [];
}

const CHECKOUT_GATED_ATTR = "data-wrrapd-checkout-gated";

function setCheckoutControlGated(node, gated) {
  if (!node) return;
  if (gated) {
    node.setAttribute(CHECKOUT_GATED_ATTR, "1");
    node.setAttribute("aria-disabled", "true");
    if ("disabled" in node) node.disabled = true;
    node.style.opacity = "0.55";
    node.style.pointerEvents = "none";
    node.style.cursor = "not-allowed";
    if (node.tagName === "A") node.tabIndex = -1;
  } else if (node.getAttribute(CHECKOUT_GATED_ATTR) === "1") {
    node.removeAttribute(CHECKOUT_GATED_ATTR);
    node.removeAttribute("aria-disabled");
    if ("disabled" in node) node.disabled = false;
    node.removeAttribute("disabled");
    node.style.opacity = "";
    node.style.pointerEvents = "";
    node.style.cursor = "";
    if (node.tagName === "A") node.tabIndex = 0;
  }
}

/** Visually disable retailer checkout controls until Wrrapd payment succeeds. */
function applyCheckoutGate(config, giftReady, paid) {
  const shouldBlock = giftReady && !paid;
  for (const btn of getGatedCheckoutButtons(config)) {
    setCheckoutControlGated(btn, shouldBlock);
  }
}

function releaseCheckoutGate(config) {
  const nodes = new Set([
    ...Array.from(document.querySelectorAll(`[${CHECKOUT_GATED_ATTR}]`)),
    ...getGatedCheckoutButtons(config),
  ]);
  for (const btn of nodes) {
    setCheckoutControlGated(btn, false);
  }
}

function mountSummaryPanel(mountAnchor, invoiceRows, totalCents, paid, payReady, copy = DEFAULT_PAY_COPY) {
  removeSummary();
  const host = document.createElement("div");
  host.setAttribute(SUMMARY_HOST_ATTR, "1");
  host.style.cssText =
    "box-sizing:border-box;width:100%;max-width:36rem;margin:12px 0 14px;padding:14px 16px;border:1px solid #fcd34d;border-radius:10px;background:linear-gradient(180deg,#fffbeb,#fff);color:#0f172a;font-family:inherit;font-size:15px;line-height:1.45;";

  const h = document.createElement("div");
  h.style.cssText = "font-weight:700;font-size:16px;margin-bottom:8px;color:#92400e;";
  h.textContent = copy.panelTitle || DEFAULT_PAY_COPY.panelTitle;

  const linesWrap = document.createElement("div");
  linesWrap.style.cssText = "margin:0 0 4px;display:flex;flex-direction:column;gap:8px;";
  for (const row of invoiceRows) {
    const line = document.createElement("div");
    line.style.cssText = "display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:16px;align-items:baseline;";
    const lbl = document.createElement("span");
    lbl.textContent = row.label;
    lbl.style.minWidth = "0";
    const amt = document.createElement("span");
    amt.textContent = row.amount;
    amt.style.cssText = "text-align:right;font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap;";
    line.append(lbl, amt);
    linesWrap.appendChild(line);
  }

  const total = document.createElement("div");
  total.style.cssText =
    "display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:16px;align-items:baseline;margin-top:10px;padding-top:10px;border-top:1px solid #fde68a;font-weight:700;";
  const totalLbl = document.createElement("span");
  totalLbl.textContent = "Total due to Wrrapd";
  const totalAmt = document.createElement("span");
  totalAmt.textContent = `$${(totalCents / 100).toFixed(2)}`;
  totalAmt.style.cssText = "text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:16px;";
  total.append(totalLbl, totalAmt);

  const payRow = document.createElement("div");
  payRow.style.cssText = "display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:10px;";
  const payBtn = document.createElement("button");
  payBtn.type = "button";
  payBtn.setAttribute("data-wrrapd-pay-open", "1");
  payBtn.style.cssText =
    "padding:10px 18px;border-radius:8px;border:none;background:#f0c14b;color:#111;font-weight:700;cursor:pointer;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.12);";
  payBtn.textContent = paid
    ? copy.paidButton || DEFAULT_PAY_COPY.paidButton
    : payReady
      ? "Pay Wrrapd (secure window)"
      : "Calculating total…";
  if (paid || !payReady) payBtn.disabled = true;
  if (!paid && !payReady) {
    payBtn.style.opacity = "0.65";
    payBtn.style.cursor = "wait";
  }
  const status = document.createElement("span");
  status.style.cssText = `font-size:14px;color:${paid ? "#15803d" : "#64748b"};`;
  status.textContent = paid
    ? copy.successHint || DEFAULT_PAY_COPY.successHint
    : !payReady
      ? "Loading Wrrapd pricing…"
      : copy.pendingHint || DEFAULT_PAY_COPY.pendingHint;
  payRow.append(payBtn, status);

  host.append(h, linesWrap, total, payRow);
  const { parent, before } = mountAnchor;
  if (before) parent.insertBefore(host, before);
  else parent.appendChild(host);
  return { host, payBtn };
}

// ─── Popup + postMessage handshake ─────────────────────────────────────────────

/**
 * Open the popup window SYNCHRONOUSLY (no awaits before window.open), so the
 * browser ties it to the user's click gesture and doesn't block it. The popup
 * starts on about:blank with a tiny loading note and is navigated afterwards.
 */
function openPaymentPopupShell(config) {
  const w = 480;
  const hgt = 820;
  const sx = window.screenX !== undefined ? window.screenX : window.screenLeft;
  const sy = window.screenY !== undefined ? window.screenY : window.screenTop;
  const left = sx + (window.innerWidth - w) / 2;
  const top = sy + (window.innerHeight - hgt) / 2;
  const popup = window.open(
    "about:blank",
    `WrrapdPayment${config.retailerName}`,
    `width=${w},height=${hgt},left=${left},top=${top},scrollbars=yes,resizable=yes`,
  );
  if (!popup) return null;
  try {
    popup.document.write(
      '<title>Wrrapd payment</title><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#334155;">Loading Wrrapd secure payment…</body>',
    );
  } catch {
    /* cross-origin or closed; navigation below still works */
  }
  return popup;
}

async function openPaymentPopup(config, state) {
  // 1. Open the window first, while we still have the user gesture.
  const popup = openPaymentPopupShell(config);
  if (!popup) {
    alert(`Please allow popups for ${location.hostname} so you can complete your Wrrapd payment.`);
    return null;
  }

  // 2. Now it's safe to do async work; the window is already open.
  await ensureUnitPrices(
    state,
    {
      postalCode: taxPostalForPricing(gifteeZip5(config.sessionPrefix)),
      state: "FL",
      country: "US",
    },
    config.payRoute,
  );
  if (!state.pricingFetchComplete) {
    try {
      popup.close();
    } catch {
      /* ignore */
    }
    alert("Wrrapd pricing is still loading. Please wait a moment and try again.");
    return null;
  }
  const { totalCents } = computeTotalBreakdown(state, config.sessionPrefix);
  if (!totalCents || totalCents < 50) {
    try {
      popup.close();
    } catch {
      /* ignore */
    }
    alert("We couldn't calculate your Wrrapd total. Please refresh the page and try again.");
    return null;
  }
  // Reuse the order number created during the wizard (e.g. when an AI design was
  // saved to GCS) so the design and payment share one order number.
  const orderNumber =
    readSession(orderNumberKey(config.sessionPrefix)) || generateOrderNumber(config.retailerName);
  try {
    sessionStorage.setItem(orderNumberKey(config.sessionPrefix), orderNumber);
  } catch {
    /* ignore */
  }
  const payload = {
    total: totalCents,
    address: hubAsPaymentAddress(),
    gifteeOriginalAddress: gifteeStub(config.sessionPrefix),
    orderNumber,
    pricingCart: buildPricingCart(state, config.sessionPrefix, config.payRoute),
    retailer: config.retailerName,
    name_of_retailer: config.retailerName,
  };
  const encoded = btoa(JSON.stringify(payload));
  let url = `${PAY_ORIGIN}/checkout/${config.payRoute}?data=${encodeURIComponent(encoded)}`;
  try {
    if (sessionStorage.getItem("wrrapd-checkout-debug") === "1") url += "&wrrapdDebug=1";
  } catch {
    /* ignore */
  }

  try {
    popup.location.href = url;
  } catch {
    /* popup was closed by the user mid-flight */
  }
  popup.focus();
  return popup;
}

async function postProcessPayment(config, eventData) {
  const orderNumber =
    (typeof eventData.orderNumber === "string" && eventData.orderNumber.trim()) ||
    readSession(orderNumberKey(config.sessionPrefix));
  if (!orderNumber || !eventData.paymentIntentId || !eventData.customerEmail) {
    console.warn("[Wrrapd pay] process-payment skipped: missing orderNumber, paymentIntentId, or email.");
    return false;
  }
  try {
    const resp = await fetch("https://api.wrrapd.com/process-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentIntentId: eventData.paymentIntentId,
        orderData: buildOrderData(config),
        customerEmail: eventData.customerEmail,
        customerPhone: String(eventData.customerPhone || "").trim() || "000-000-0000",
        orderNumber,
        retailer: config.retailerName,
        name_of_retailer: config.retailerName,
        billingDetails: eventData.billingDetails || null,
        gifterFullName: String(eventData.gifterFullName || "").trim() || undefined,
        finalShippingAddress: eventData.finalShippingAddress || null,
        gifteeOriginalAddress: gifteeStub(config.sessionPrefix),
      }),
    });
    const result = await resp.json().catch(() => ({}));
    if (resp.ok && result.success) return true;
    console.error("[Wrrapd pay] process-payment failed:", result.error || resp.status);
    return false;
  } catch (e) {
    console.error("[Wrrapd pay] process-payment error:", e);
    return false;
  }
}

// ─── Public init ───────────────────────────────────────────────────────────────

/**
 * @param {object} config
 * @param {string} config.retailerName        e.g. "Sephora" (sent as retailer; matched in postMessage)
 * @param {string} config.payRoute            e.g. "sephora" → pay.wrrapd.com/checkout/sephora
 * @param {string} config.sessionPrefix       e.g. "wrrapdSephora"
 * @param {() => boolean} config.isCheckoutPage
 * @param {() => HTMLElement|null} config.findCheckoutButton  retailer place-order/continue button
 * @param {() => HTMLElement[]} [config.findGatedCheckoutButtons]  all buttons to block until paid (sidebar + main)
 * @param {() => { parent: Element, before?: Element|null } | null} [config.findSummaryMountAnchor]
 *        where to mount the pay panel (defaults to immediately before findCheckoutButton)
 * @param {() => object} config.getCartSnapshot
 * @param {() => void} config.fillHubShippingFields  autofill hub address into the retailer form
 * @param {string} [config.paymentPendingHint]  shown before Wrrapd payment (defaults to polite generic copy)
 * @param {string} [config.paymentSuccessHint]  shown after Wrrapd payment succeeds
 */
export function initRetailerCheckoutPayFlow(config) {
  if (!config?.retailerName || !config?.payRoute || !config?.sessionPrefix) return;
  const state = createPricingState();
  const acceptedRetailerKeys = new Set([
    normalizeRetailerKey(config.retailerName),
    normalizeRetailerKey(config.payRoute),
  ]);
  let payPopupRef = null;

  const giftFlowReady = () => {
    const snap = config.getCartSnapshot?.();
    const count =
      snap && typeof snap === "object"
        ? typeof snap.itemCount === "number"
          ? snap.itemCount
          : Array.isArray(snap.items)
            ? snap.items.length
            : 0
        : 0;
    if (count <= 0) return false;
    const choices = readItemChoices(config.sessionPrefix);
    if (choices.length !== count) return false;
    return (
      readGiftRadio(config.sessionPrefix) === "yes" &&
      readGiftChoicesSaved(config.sessionPrefix) &&
      readGiftLegalTermsAccepted(config.sessionPrefix)
    );
  };

  const syncCartGiftState = () => {
    const snap = config.getCartSnapshot?.();
    if (!snap) return null;
    return syncGiftSessionWithCart(
      createSharedGiftSessionAdapter(config.sessionPrefix),
      snap,
      defaultEmptyChoice,
    );
  };

  const ensureSummaryUi = async () => {
    const mountAnchor = resolveSummaryMountAnchor(config);
    if (!mountAnchor?.parent) return;
    await ensureUnitPrices(
      state,
      {
        postalCode: taxPostalForPricing(gifteeZip5(config.sessionPrefix)),
        state: "FL",
        country: "US",
      },
      config.payRoute,
    );
    const paid = readPaymentSuccess(config.sessionPrefix);
    const payReady = state.pricingFetchComplete === true;
    const { invoiceRows, totalCents } = buildSummaryLinesAndTotal(state, config.sessionPrefix);
    const cartFp = buildCartFingerprint(config.getCartSnapshot?.());
    const renderSig = `${paid ? 1 : 0}|${payReady ? 1 : 0}|${totalCents}|${cartFp}|${invoiceRows
      .map((r) => `${r?.label ?? ""}=${r?.amount ?? r?.cents ?? ""}`)
      .join("~")}`;
    const existing = document.querySelector(`[${SUMMARY_HOST_ATTR}]`);
    if (
      existing &&
      existing.isConnected &&
      existing.dataset.wrrapdRenderSig === renderSig &&
      existing.parentElement === mountAnchor.parent
    ) {
      return;
    }
    const payCopy = {
      ...DEFAULT_PAY_COPY,
      ...(config.paymentPendingHint ? { pendingHint: config.paymentPendingHint } : {}),
      ...(config.paymentSuccessHint ? { successHint: config.paymentSuccessHint } : {}),
    };
    const { host, payBtn } = mountSummaryPanel(
      mountAnchor,
      invoiceRows,
      totalCents,
      paid,
      payReady,
      payCopy,
    );
    host.dataset.wrrapdRenderSig = renderSig;
    if (!paid && payReady) {
      payBtn.addEventListener("click", async () => {
        payPopupRef = await openPaymentPopup(config, state);
      });
    } else {
      config.fillHubShippingFields?.();
    }
  };

  // postMessage handshake from pay.wrrapd.com
  window.addEventListener("message", (event) => {
    if (!event || event.origin !== PAY_ORIGIN) return;
    if (!event.data || event.data.status !== "success") return;
    const retailer = normalizeRetailerKey(event.data.retailer || event.data.name_of_retailer);
    if (!acceptedRetailerKeys.has(retailer)) return;
    if (payPopupRef && event.source !== payPopupRef && typeof payPopupRef.closed === "boolean" && !payPopupRef.closed) {
      return;
    }
    void (async () => {
      // Stripe already succeeded in the popup; release the retailer CTA immediately.
      // If server-side order finalization fails, roll back below and block checkout again.
      writePaymentSuccess(config.sessionPrefix, true);
      writeCartFingerprint(config.sessionPrefix, buildCartFingerprint(config.getCartSnapshot?.()));
      config.fillHubShippingFields?.();
      releaseCheckoutGate(config);
      void ensureSummaryUi();

      const ok = await postProcessPayment(config, event.data);
      if (!ok) {
        writePaymentSuccess(config.sessionPrefix, false);
        applyCheckoutGate(config, giftFlowReady(), false);
        void ensureSummaryUi();
        console.warn("[Wrrapd pay] process-payment did not complete; checkout remains blocked.");
        alert(
          "We could not confirm your Wrrapd payment. Please try again, or contact support if you were charged.",
        );
        return;
      }
      payPopupRef = null;
      releaseCheckoutGate(config);
      void ensureSummaryUi();
    })();
  });

  const blockCheckoutNavigation = (e) => {
    const gated = getGatedCheckoutButtons(config);
    if (!gated.length || !e.target) return;
    const btn = gated.find((b) => b.contains(e.target));
    if (!btn) return;
    if (!giftFlowReady()) return;
    if (e.target.closest(`[${SUMMARY_HOST_ATTR}]`)) return;
    if (readPaymentSuccess(config.sessionPrefix)) {
      config.fillHubShippingFields?.();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    void ensureSummaryUi().then(() => {
      document.querySelector(`[${SUMMARY_HOST_ATTR}]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  // Intercept the retailer checkout/place-order button until Wrrapd is paid.
  document.addEventListener("click", blockCheckoutNavigation, true);
  document.addEventListener("submit", (e) => {
    if (!giftFlowReady() || readPaymentSuccess(config.sessionPrefix)) return;
    const gated = getGatedCheckoutButtons(config);
    if (!gated.length) return;
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (gated.some((btn) => form.contains(btn))) blockCheckoutNavigation(e);
  }, true);

  const tick = () => {
    if (!config.isCheckoutPage?.()) return;
    const wasPaid = readPaymentSuccess(config.sessionPrefix);
    if (!wasPaid) syncCartGiftState();
    const ready = giftFlowReady();
    const paid = readPaymentSuccess(config.sessionPrefix);
    if (paid) {
      releaseCheckoutGate(config);
      if (ready) {
        config.fillHubShippingFields?.();
        void ensureSummaryUi();
      }
      return;
    }
    if (!ready) {
      removeSummary();
      releaseCheckoutGate(config);
      return;
    }
    if (readGiftRadio(config.sessionPrefix) === "yes") {
      config.fillHubShippingFields?.();
    }
    applyCheckoutGate(config, true, paid);
    void ensureSummaryUi();
  };

  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      tick();
    });
  };
  schedule();
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", () => setTimeout(schedule, 200));
  window.addEventListener(WRRAPD_GIFT_RADIO_CHANGE_EVENT, (event) => {
    if (event?.detail?.prefix !== config.sessionPrefix) return;
    schedule();
  });
  window.addEventListener(WRRAPD_CART_SYNC_EVENT, (event) => {
    if (event?.detail?.prefix !== config.sessionPrefix) return;
    state.lastPriceFetchAt = 0;
    state.unitPriceOverride = null;
    state.pricingFetchComplete = false;
    schedule();
  });
}
