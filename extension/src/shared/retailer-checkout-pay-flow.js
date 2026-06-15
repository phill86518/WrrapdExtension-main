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
} from "./cart-gift-session.js";
import { hubAsPaymentAddress, hubPostal5 } from "./wrrapd-hub.js";

const PAY_ORIGIN = "https://pay.wrrapd.com";
const SUMMARY_HOST_ATTR = "data-wrrapd-pay-summary-host";

const UNIT_PRICES_FALLBACK = Object.freeze({
  giftWrapBase: 6.99,
  customDesignAi: 2.99,
  customDesignUpload: 1.99,
  flowers: 17.99,
});

function paymentSuccessKey(prefix) {
  return `${prefix}PaymentSuccess`;
}
function orderNumberKey(prefix) {
  return `${prefix}OrderNumber`;
}

function readPaymentSuccess(prefix) {
  try {
    return sessionStorage.getItem(paymentSuccessKey(prefix)) === "1";
  } catch {
    return false;
  }
}
function writePaymentSuccess(prefix, on) {
  try {
    if (on) sessionStorage.setItem(paymentSuccessKey(prefix), "1");
    else sessionStorage.removeItem(paymentSuccessKey(prefix));
  } catch {
    /* ignore */
  }
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
  const tag = String(retailerName || "WRRAPD").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "WRRAPD";
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${tag}-${Date.now().toString(36).toUpperCase()}-${rand}`;
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
  return { unitPriceOverride: null, taxPercent: null };
}

function getActiveUnitPrices(state) {
  return state.unitPriceOverride || UNIT_PRICES_FALLBACK;
}

const PRICE_REFRESH_TTL_MS = 5 * 60 * 1000;

async function refreshUnitPricesFromServer(state, geo) {
  try {
    const u = new URL("https://api.wrrapd.com/api/pricing-preview");
    if (geo?.postalCode) u.searchParams.set("postalCode", String(geo.postalCode).trim().slice(0, 16));
    if (geo?.state) u.searchParams.set("state", String(geo.state).trim().slice(0, 16));
    if (geo?.country) u.searchParams.set("country", String(geo.country).trim().slice(0, 8));
    const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(8000) : undefined;
    const r = await fetch(u.toString(), { credentials: "omit", signal });
    if (!r.ok) return;
    const j = await r.json();
    state.taxPercent =
      typeof j.estimatedSalesTaxPercent === "number" && Number.isFinite(j.estimatedSalesTaxPercent)
        ? j.estimatedSalesTaxPercent
        : null;
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
function ensureUnitPrices(state, geo) {
  const now = Date.now();
  if (state.lastPriceFetchAt && now - state.lastPriceFetchAt < PRICE_REFRESH_TTL_MS) {
    return Promise.resolve();
  }
  if (!state.priceFetchPromise) {
    state.priceFetchPromise = refreshUnitPricesFromServer(state, geo).finally(() => {
      state.priceFetchPromise = null;
      state.lastPriceFetchAt = Date.now();
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
  const pct = typeof state.taxPercent === "number" ? state.taxPercent : 0;
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
  const n = Math.max(1, choices.length);
  /** @type {Array<{ label: string, amount: string | null }>} */
  const rows = [];
  let hasAi = false;
  let hasUpload = false;
  let flowerCount = 0;
  for (const ch of choices) {
    if (ch.wrapPref === "ai") hasAi = true;
    if (ch.wrapPref === "upload") hasUpload = true;
    if (ch.flowers) flowerCount++;
  }
  const xN = n > 1 ? ` (×${n})` : "";
  rows.push({ label: `Gift wrap base${xN}`, amount: `$${(p.giftWrapBase * n).toFixed(2)}` });
  if (hasAi) rows.push({ label: "AI design assist", amount: `$${p.customDesignAi.toFixed(2)}` });
  if (hasUpload) rows.push({ label: "Custom upload", amount: `$${p.customDesignUpload.toFixed(2)}` });
  if (flowerCount > 0) {
    const xF = flowerCount > 1 ? ` (×${flowerCount})` : "";
    rows.push({ label: `Flowers add-on${xF}`, amount: `$${(p.flowers * flowerCount).toFixed(2)}` });
  }
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
    };
  });
}

/** Server-side PaymentIntent amount (must mirror Amazon/LEGO checkout math). */
function buildPricingCart(state, prefix) {
  const choices = readItemChoices(prefix);
  const zipForTax = gifteeZip5(prefix) || hubPostal5();
  const taxRatePercent =
    typeof state.taxPercent === "number" && Number.isFinite(state.taxPercent) ? state.taxPercent : 0;
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

function mountSummaryNearButton(btn, invoiceRows, totalCents, paid) {
  removeSummary();
  const host = document.createElement("div");
  host.setAttribute(SUMMARY_HOST_ATTR, "1");
  host.style.cssText =
    "box-sizing:border-box;width:100%;max-width:36rem;margin:12px 0 14px;padding:14px 16px;border:1px solid #fcd34d;border-radius:10px;background:linear-gradient(180deg,#fffbeb,#fff);color:#0f172a;font-size:15px;line-height:1.45;";

  const h = document.createElement("div");
  h.style.cssText = "font-weight:700;font-size:16px;margin-bottom:8px;color:#92400e;";
  h.textContent = "Wrrapd gift service — payment";

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
  payBtn.textContent = paid ? "Paid — you can continue" : "Pay Wrrapd (secure window)";
  if (paid) payBtn.disabled = true;
  const status = document.createElement("span");
  status.style.cssText = `font-size:14px;color:${paid ? "#15803d" : "#64748b"};`;
  status.textContent = paid
    ? "Payment received. Wrrapd will wrap and ship to your giftee."
    : "Complete Wrrapd payment, then place your retailer order (it ships to the Wrrapd hub).";
  payRow.append(payBtn, status);

  host.append(h, linesWrap, total, payRow);
  const parent = btn.parentElement;
  if (parent) parent.insertBefore(host, btn);
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
    alert(`Please allow popups for ${location.hostname} to complete Wrrapd payment.`);
    return null;
  }

  // 2. Now it's safe to do async work; the window is already open.
  await ensureUnitPrices(state, {
    postalCode: gifteeZip5(config.sessionPrefix) || hubPostal5(),
    state: "",
    country: "US",
  });
  const { totalCents } = computeTotalBreakdown(state, config.sessionPrefix);
  if (!totalCents || totalCents < 50) {
    try {
      popup.close();
    } catch {
      /* ignore */
    }
    alert("Invalid Wrrapd total. Please refresh and try again.");
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
    pricingCart: buildPricingCart(state, config.sessionPrefix),
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
 * @param {() => object} config.getCartSnapshot
 * @param {() => void} config.fillHubShippingFields  autofill hub address into the retailer form
 */
export function initRetailerCheckoutPayFlow(config) {
  if (!config?.retailerName || !config?.payRoute || !config?.sessionPrefix) return;
  const state = createPricingState();
  const retailerLc = String(config.retailerName).toLowerCase();
  let payPopupRef = null;

  const giftFlowReady = () =>
    readGiftRadio(config.sessionPrefix) === "yes" &&
    readGiftChoicesSaved(config.sessionPrefix) &&
    readGiftLegalTermsAccepted(config.sessionPrefix);

  const ensureSummaryUi = async () => {
    const btn = config.findCheckoutButton?.();
    if (!btn?.parentElement) return;
    await ensureUnitPrices(state, {
      postalCode: gifteeZip5(config.sessionPrefix) || hubPostal5(),
      state: "",
      country: "US",
    });
    const paid = readPaymentSuccess(config.sessionPrefix);
    const { invoiceRows, totalCents } = buildSummaryLinesAndTotal(state, config.sessionPrefix);
    // Skip remounting when nothing changed. Remounting on every MutationObserver
    // tick destroys the Pay button between mousedown and mouseup, so clicks on it
    // never fire (the popup appears blocked). Only rebuild when content/position changed.
    const renderSig = `${paid ? 1 : 0}|${totalCents}|${invoiceRows
      .map((r) => `${r?.label ?? ""}=${r?.amount ?? r?.cents ?? ""}`)
      .join("~")}`;
    const existing = document.querySelector(`[${SUMMARY_HOST_ATTR}]`);
    if (
      existing &&
      existing.isConnected &&
      existing.dataset.wrrapdRenderSig === renderSig &&
      existing.parentElement === btn.parentElement
    ) {
      return;
    }
    const { host, payBtn } = mountSummaryNearButton(btn, invoiceRows, totalCents, paid);
    host.dataset.wrrapdRenderSig = renderSig;
    if (!paid) {
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
    const retailer = String(event.data.retailer || event.data.name_of_retailer || "").toLowerCase();
    if (retailer !== retailerLc) return;
    if (payPopupRef && event.source !== payPopupRef && typeof payPopupRef.closed === "boolean" && !payPopupRef.closed) {
      return;
    }
    void (async () => {
      const ok = await postProcessPayment(config, event.data);
      if (!ok) console.warn("[Wrrapd pay] process-payment did not complete; checkout will still unlock.");
      writePaymentSuccess(config.sessionPrefix, true);
      payPopupRef = null;
      config.fillHubShippingFields?.();
      void ensureSummaryUi();
    })();
  });

  // Intercept the retailer checkout/place-order button until Wrrapd is paid.
  document.addEventListener(
    "click",
    (e) => {
      const btn = config.findCheckoutButton?.();
      if (!btn || !e.target || !btn.contains(e.target)) return;
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
    },
    true,
  );

  const tick = () => {
    if (!config.isCheckoutPage?.()) return;
    if (!giftFlowReady()) return;
    if (readPaymentSuccess(config.sessionPrefix)) config.fillHubShippingFields?.();
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
}
