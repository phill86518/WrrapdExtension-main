import {
  LEGO_GIFT_AI_DESIGN_KEY,
  LEGO_GIFT_FLOWERS_INTEREST_KEY,
  LEGO_GIFT_SELECTED_FLOWER_KEY,
  LEGO_GIFT_UPLOAD_NAME_KEY,
  LEGO_GIFT_WRAP_PREF_KEY,
  WRRAPD_HUB_ADDRESS_OBJECT,
  WRRAPD_HUB_SHIP_LINES,
} from "./constants.js";
import {
  readGiftChoicesSaved,
  readGiftLegalTermsAccepted,
  readGiftRadio,
  readHubShipAccepted,
  readLegoPaymentSuccess,
  writeGiftLegalTermsAccepted,
  writeHubShipAccepted,
  writeLegoPaymentSuccess,
} from "./lego-session-state.js";

const TERMS_MODAL_ID = "wrrapd-lego-terms-modal";
const HUB_MODAL_ID = "wrrapd-lego-hub-modal";
const SUMMARY_HOST_ATTR = "data-wrrapd-lego-pay-summary-host";
const SUMMARY_ROOT_ID = "wrrapd-lego-payment-summary-root";

const WRRAPD_CHECKOUT_UNIT_PRICES_FALLBACK = Object.freeze({
  giftWrapBase: 6.99,
  customDesignAi: 2.99,
  customDesignUpload: 1.99,
  flowers: 17.99,
});

let wrrapdCheckoutUnitPriceOverride = null;

function findCheckoutSecurelyButton() {
  return (
    document.querySelector('[data-test="checkout-securely-button-desktop"]') ||
    document.querySelector('[data-test="checkout-securely-button-mobile"]') ||
    document.querySelector('[data-test="checkout-securely-button"]') ||
    [...document.querySelectorAll("button")].find((b) =>
      /checkout securely/i.test((b.textContent || "").trim()),
    ) ||
    null
  );
}

export function applyCheckoutSecurelyGate() {
  const btn = findCheckoutSecurelyButton();
  if (!btn) return;
  const radio = readGiftRadio();
  const ready = readGiftChoicesSaved() && readGiftLegalTermsAccepted();
  const needBlock = radio === "yes" && !ready;
  if (needBlock) {
    btn.disabled = true;
    btn.setAttribute("aria-disabled", "true");
    btn.setAttribute("data-wrrapd-lego-checkout-gated", "1");
  } else if (btn.getAttribute("data-wrrapd-lego-checkout-gated") === "1") {
    btn.disabled = false;
    btn.removeAttribute("aria-disabled");
    btn.removeAttribute("data-wrrapd-lego-checkout-gated");
  }
}

function getActiveCheckoutUnitPrices() {
  return wrrapdCheckoutUnitPriceOverride || WRRAPD_CHECKOUT_UNIT_PRICES_FALLBACK;
}

async function refreshCheckoutUnitPricesFromServer(geo) {
  try {
    const u = new URL("https://api.wrrapd.com/api/pricing-preview");
    if (geo && geo.postalCode) u.searchParams.set("postalCode", String(geo.postalCode).trim().slice(0, 16));
    if (geo && geo.state) u.searchParams.set("state", String(geo.state).trim().slice(0, 16));
    if (geo && geo.country) u.searchParams.set("country", String(geo.country).trim().slice(0, 8));
    const r = await fetch(u.toString(), { credentials: "omit" });
    if (!r.ok) return false;
    const j = await r.json();
    const up = j && j.unitPrices && typeof j.unitPrices === "object" ? j.unitPrices : null;
    if (!up) return false;
    const next = {
      giftWrapBase: Number(up.giftWrapBase),
      customDesignAi: Number(up.customDesignAi),
      customDesignUpload: Number(up.customDesignUpload),
      flowers: Number(up.flowers),
    };
    if (
      [next.giftWrapBase, next.customDesignAi, next.customDesignUpload, next.flowers].every(
        (n) => Number.isFinite(n) && n >= 0 && n < 100000,
      )
    ) {
      wrrapdCheckoutUnitPriceOverride = next;
      return true;
    }
  } catch (e) {
    console.warn("[LEGO pay] pricing-preview", e);
  }
  return false;
}

function hubPostalForPricing() {
  const raw = String(WRRAPD_HUB_ADDRESS_OBJECT.postalCode || "").trim();
  const m = raw.match(/^(\d{5})/);
  return m ? m[1] : "32226";
}

function hubAsPaymentAddress() {
  const h = WRRAPD_HUB_ADDRESS_OBJECT;
  return {
    name: `${h.recipientFirstName} ${h.recipientLastName}`.trim(),
    street: h.addressLine1,
    city: h.city,
    state: h.state,
    postalCode: h.postalCode,
    country: "United States",
    phone: "",
  };
}

function gifteeStubFromSession() {
  let zip = "";
  try {
    zip = sessionStorage.getItem("wrrapdLegoValidatedEstimateZip") || "";
  } catch {
    zip = "";
  }
  return {
    name: "Your giftee (LEGO delivery after wrap)",
    street: "",
    city: "",
    state: "",
    postalCode: zip || "",
    country: "United States",
    phone: "",
  };
}

function readWrapPref() {
  try {
    return sessionStorage.getItem(LEGO_GIFT_WRAP_PREF_KEY) || "wrrapd";
  } catch {
    return "wrrapd";
  }
}

function readFlowersOn() {
  try {
    return sessionStorage.getItem(LEGO_GIFT_FLOWERS_INTEREST_KEY) === "1";
  } catch {
    return false;
  }
}

function computeServiceSubtotalCents() {
  const p = getActiveCheckoutUnitPrices();
  const wrap = readWrapPref();
  let dollars = p.giftWrapBase;
  if (wrap === "ai") dollars += p.customDesignAi;
  if (wrap === "upload") dollars += p.customDesignUpload;
  if (readFlowersOn()) dollars += p.flowers;
  return Math.round(dollars * 100);
}

function buildLegoPricingCart() {
  const wrap = readWrapPref();
  const flowers = readFlowersOn();
  const zip = hubPostalForPricing();
  return {
    items: [
      {
        options: [
          {
            checkbox_wrrapd: true,
            selected_wrapping_option: wrap,
            checkbox_flowers: flowers,
          },
        ],
      },
    ],
    taxRatePercent: 0,
    postalCode: zip,
    state: WRRAPD_HUB_ADDRESS_OBJECT.state,
    country: "US",
  };
}

function generateLegoOrderNumber() {
  const zip = hubPostalForPricing();
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `LG${zip}${rnd}`;
}

function setNativeInputValue(el, value) {
  if (!el) return;
  const v = String(value ?? "");
  const proto = window.HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc && desc.set) desc.set.call(el, v);
  else el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Best-effort: set common autocomplete / Shopify-style shipping fields to the Wrrapd hub.
 */
export function tryApplyLegoHubShippingFields() {
  const h = WRRAPD_HUB_ADDRESS_OBJECT;
  const first = h.recipientFirstName || "WRRAPD";
  const last = h.recipientLastName || "INC";
  const pairs = [
    ['input[autocomplete="given-name"]', first],
    ['input[autocomplete="family-name"]', last],
    ['input[autocomplete="shipping given-name"]', first],
    ['input[autocomplete="shipping family-name"]', last],
    ['input[autocomplete="address-line1"]', h.addressLine1],
    ['input[autocomplete="shipping address-line1"]', h.addressLine1],
    ['input[autocomplete="address-level2"]', h.city],
    ['input[autocomplete="shipping address-level2"]', h.city],
    ['input[autocomplete="address-level1"]', h.state],
    ['select[autocomplete="address-level1"]', h.state],
    ['input[autocomplete="shipping address-level1"]', h.state],
    ['input[autocomplete="postal-code"]', h.postalCode],
    ['input[autocomplete="shipping postal-code"]', h.postalCode],
  ];
  for (const [sel, val] of pairs) {
    const el = document.querySelector(sel);
    if (el && el.tagName === "SELECT") {
      const opt = [...el.options].find(
        (o) => String(o.value).toUpperCase() === String(val).toUpperCase() || (o.textContent || "").includes(val),
      );
      if (opt) {
        el.value = opt.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else {
      setNativeInputValue(el, val);
    }
  }
}

/**
 * LEGO-specific legal terms (Amazon-style scroll + “here”).
 * @param {() => void} onAccepted
 */
export function openLegoTermsModal(onAccepted) {
  if (document.getElementById(TERMS_MODAL_ID)) return;

  const modal = document.createElement("div");
  modal.id = TERMS_MODAL_ID;
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:2147483646;
    display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;`;

  const content = document.createElement("div");
  content.style.cssText = `
    background:#fff;border-radius:12px;max-width:560px;width:100%;max-height:90vh;display:flex;
    flex-direction:column;box-shadow:0 4px 24px rgba(0,0,0,.35);position:relative;`;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";
  closeBtn.style.cssText =
    "position:absolute;top:6px;right:12px;border:none;background:none;font-size:28px;color:#64748b;cursor:pointer;line-height:1;z-index:2;";
  closeBtn.addEventListener("click", () => modal.remove());

  const scrollable = document.createElement("div");
  scrollable.style.cssText = `
    padding:36px 28px 20px;overflow-y:auto;flex:1;font-family:Georgia,'Times New Roman',serif;
    line-height:1.75;color:#0f172a;font-size:15px;`;
  scrollable.innerHTML = `
    <h1 style="margin:0 0 8px;font-size:24px;text-align:center;font-weight:600;color:#0f172a;">Wrrapd — LEGO gift service</h1>
    <p style="margin:0 0 18px;text-align:center;color:#334155;font-size:14px;"><em>Terms for gift wrap &amp; fulfillment</em></p>
    <div>
      <p style="margin-bottom:14px;"><strong>1.</strong> These Terms apply to gift-wrapping and related fulfillment by Wrrapd Inc. (&quot;Wrrapd&quot;) for items you purchase on LEGO.com. Your LEGO purchase remains governed by the LEGO Group&apos;s terms and policies.</p>
      <p style="margin-bottom:14px;"><strong>2.</strong> You must be at least 18 or the age of majority in your jurisdiction to use this service.</p>
      <p style="margin-bottom:14px;"><strong>3.</strong> Privacy: see <a href="https://www.wrrapd.com/privacy" target="_blank" rel="noopener" style="color:#0369a1;">wrrapd.com/privacy</a>.</p>
      <p style="margin-bottom:14px;"><strong>4.</strong> Limited agency: by agreeing, you appoint Wrrapd as your limited agent solely to assist with browser-based steps you direct (for example, entering the hub ship-to on LEGO checkout) in connection with this gift order.</p>
      <p style="margin-bottom:14px;"><strong>5.</strong> Service: exterior gift-wrapping and optional add-ons (messages, uploads, AI-assisted themes, flowers where offered). Fees are shown before you pay Wrrapd.</p>
      <p style="margin-bottom:14px;"><strong>6.</strong> Shipping: items are sent to Wrrapd&apos;s U.S. hub first for wrapping; outbound delivery to your giftee is coordinated by Wrrapd after payment and production. Timelines may extend beyond LEGO&apos;s default estimate.</p>
      <p style="margin-bottom:14px;"><strong>7.</strong> Product issues, returns, and LEGO warranties remain between you and LEGO / sellers. Wrrapd does not replace LEGO support for the underlying merchandise.</p>
      <p style="margin-bottom:14px;"><strong>8.</strong> Video proof: Wrrapd may record receipt, unwrap, wrap, and handoff for quality and dispute resolution.</p>
      <p style="margin-bottom:14px;"><strong>9.</strong> Liability: service is provided as-is; Wrrapd&apos;s liability is limited to the service fees you paid for this wrap order, except where prohibited by law.</p>
      <p style="margin-bottom:14px;"><strong>10.</strong> Disputes: governed by the laws of the State of Florida, USA; binding individual arbitration in Jacksonville, Florida; class action waiver.</p>
    </div>`;

  const agreement = document.createElement("div");
  agreement.style.cssText =
    "padding:18px 24px 22px;border-top:2px solid #e2e8f0;text-align:center;font-size:15px;font-family:Georgia,serif;color:#0f172a;";

  const agreementText = document.createElement("div");
  agreementText.innerHTML =
    'By clicking <span id="wrrapd-lego-agree-link" style="color:#94a3b8;cursor:not-allowed;text-decoration:underline;">here</span>, I appoint Wrrapd as my limited agent for this LEGO gift transaction and agree to the terms above.';

  const agreeLink = agreementText.querySelector("#wrrapd-lego-agree-link");
  if (!agreeLink) {
    modal.remove();
    return;
  }
  let linkEnabled = false;

  const checkScroll = () => {
    const top = scrollable.scrollTop;
    const max = scrollable.scrollHeight - scrollable.clientHeight;
    const atBottom = max <= 5 || top + scrollable.clientHeight >= scrollable.scrollHeight - 5;
    linkEnabled = atBottom;
    if (agreeLink) {
      agreeLink.style.color = atBottom ? "#0369a1" : "#94a3b8";
      agreeLink.style.cursor = atBottom ? "pointer" : "not-allowed";
    }
  };
  scrollable.addEventListener("scroll", checkScroll);
  window.setTimeout(checkScroll, 120);

  agreeLink.addEventListener("click", (e) => {
    if (!linkEnabled) {
      e.preventDefault();
      return;
    }
    writeGiftLegalTermsAccepted(true);
    modal.remove();
    if (typeof onAccepted === "function") onAccepted();
  });

  agreement.appendChild(agreementText);
  content.append(closeBtn, scrollable, agreement);
  modal.appendChild(content);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  document.body.appendChild(modal);
}

function openLegoHubConfirmModal(onAccept) {
  if (document.getElementById(HUB_MODAL_ID)) return;

  const modal = document.createElement("div");
  modal.id = HUB_MODAL_ID;
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(15,23,42,.72);z-index:2147483645;
    display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;`;

  const panel = document.createElement("div");
  panel.setAttribute("data-wrrapd-lego-pay-panel", "1");
  panel.style.cssText = `
    max-width:480px;width:100%;background:#fff;border-radius:12px;padding:22px 20px 18px;
    box-shadow:0 16px 48px rgba(0,0,0,.25);font-family:system-ui,sans-serif;color:#0f172a;`;

  const title = document.createElement("h2");
  title.style.cssText = "margin:0 0 10px;font-size:18px;font-weight:700;";
  title.textContent = "Ship to the Wrrapd hub";

  const copy = document.createElement("p");
  copy.style.cssText = "margin:0 0 14px;font-size:15px;line-height:1.55;color:#1e293b;";
  copy.textContent =
    "LEGO must ship this order to the Wrrapd gift hub first so we can wrap it. Please confirm you accept this ship-to on LEGO checkout.";

  const addr = document.createElement("pre");
  addr.style.cssText =
    "margin:0 0 16px;padding:12px 14px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;line-height:1.45;white-space:pre-wrap;color:#0f172a;";
  addr.textContent = WRRAPD_HUB_SHIP_LINES.join("\n");

  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Not now";
  cancel.style.cssText =
    "padding:10px 16px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;font-size:14px;";
  cancel.addEventListener("click", () => modal.remove());

  const ok = document.createElement("button");
  ok.type = "button";
  ok.textContent = "I accept — use Wrrapd hub";
  ok.style.cssText =
    "padding:10px 16px;border-radius:8px;border:none;background:#ea580c;color:#fff;font-weight:600;cursor:pointer;font-size:14px;";
  ok.addEventListener("click", () => {
    tryApplyLegoHubShippingFields();
    writeHubShipAccepted(true);
    modal.remove();
    if (typeof onAccept === "function") onAccept();
  });

  row.append(cancel, ok);
  panel.append(title, copy, addr, row);
  modal.appendChild(panel);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  document.body.appendChild(modal);
}

function removeLegoPaymentSummary() {
  document.querySelectorAll(`[${SUMMARY_HOST_ATTR}]`).forEach((n) => n.remove());
  const root = document.getElementById(SUMMARY_ROOT_ID);
  if (root) root.remove();
}

function mountSummaryNearButton(btn, lines, totalCents, paid) {
  removeLegoPaymentSummary();
  const host = document.createElement("div");
  host.setAttribute(SUMMARY_HOST_ATTR, "1");
  host.setAttribute("data-wrrapd-lego-pay-panel", "1");
  host.id = SUMMARY_ROOT_ID;
  host.style.cssText = `
    box-sizing:border-box;width:100%;max-width:36rem;margin:12px 0 14px;padding:14px 16px;
    border:1px solid #fcd34d;border-radius:10px;background:linear-gradient(180deg,#fffbeb,#fff);
    color:#0f172a;font-size:15px;line-height:1.45;`;

  const h = document.createElement("div");
  h.style.cssText = "font-weight:700;font-size:16px;margin-bottom:8px;color:#92400e;";
  h.textContent = "Wrrapd gift service — payment";

  const ul = document.createElement("ul");
  ul.style.cssText = "margin:0 0 10px;padding-left:1.1rem;";
  for (const line of lines) {
    const li = document.createElement("li");
    li.textContent = line;
    ul.appendChild(li);
  }

  const total = document.createElement("div");
  total.style.cssText = "font-weight:700;margin-bottom:12px;color:#0f172a;";
  total.textContent = `Total due to Wrrapd: $${(totalCents / 100).toFixed(2)}`;

  const payRow = document.createElement("div");
  payRow.style.cssText = "display:flex;align-items:center;gap:12px;flex-wrap:wrap;";

  const payBtn = document.createElement("button");
  payBtn.type = "button";
  payBtn.setAttribute("data-wrrapd-lego-pay-open", "1");
  payBtn.style.cssText = `
    padding:10px 18px;border-radius:8px;border:none;background:#f0c14b;color:#111;font-weight:700;
    cursor:pointer;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.12);`;
  payBtn.textContent = paid ? "Paid — you can continue on LEGO" : "Pay Wrrapd (secure window)";

  const status = document.createElement("span");
  status.style.fontSize = "14px";
  status.style.color = paid ? "#15803d" : "#64748b";
  status.textContent = paid ? "Payment received. Use Checkout Securely again to continue." : "Complete payment before continuing LEGO checkout.";

  if (paid) payBtn.disabled = true;

  payRow.append(payBtn, status);
  host.append(h, ul, total, payRow);

  const parent = btn.parentElement;
  if (parent) parent.insertBefore(host, btn);

  return { payBtn, status };
}

let payMessageBound = false;
let payPopupRef = null;

function bindPayMessageOnce() {
  if (payMessageBound) return;
  payMessageBound = true;
  window.addEventListener("message", (event) => {
    if (!event || event.origin !== "https://pay.wrrapd.com") return;
    if (!event.data || event.data.status !== "success") return;
    const retailer = String(event.data.retailer || event.data.name_of_retailer || "").toLowerCase();
    if (retailer !== "lego") return;
    if (payPopupRef && event.source !== payPopupRef) return;
    writeLegoPaymentSuccess(true);
    payPopupRef = null;
    applyCheckoutSecurelyGate();
    const btn = findCheckoutSecurelyButton();
    if (btn) {
      const { lines, totalCents } = buildSummaryLinesAndTotal();
      const host = document.getElementById(SUMMARY_ROOT_ID);
      if (host) host.remove();
      mountSummaryNearButton(btn, lines, totalCents, true);
    }
  });
}

function buildSummaryLinesAndTotal() {
  const p = getActiveCheckoutUnitPrices();
  const wrap = readWrapPref();
  const lines = [];
  lines.push(`Gift wrap base — $${p.giftWrapBase.toFixed(2)}`);
  if (wrap === "ai") lines.push(`AI design assist — $${p.customDesignAi.toFixed(2)}`);
  if (wrap === "upload") lines.push(`Custom upload — $${p.customDesignUpload.toFixed(2)}`);
  if (readFlowersOn()) lines.push(`Flowers add-on — $${p.flowers.toFixed(2)}`);
  let detail = "";
  try {
    detail = sessionStorage.getItem(LEGO_GIFT_AI_DESIGN_KEY) || "";
  } catch {
    detail = "";
  }
  if (detail && wrap === "ai") lines.push("(AI selection saved with your order.)");
  return { lines, totalCents: computeServiceSubtotalCents() };
}

async function openLegoPaymentPopup() {
  const geo = {
    postalCode: hubPostalForPricing(),
    state: WRRAPD_HUB_ADDRESS_OBJECT.state,
    country: "US",
  };
  await refreshCheckoutUnitPricesFromServer(geo);
  const totalCents = computeServiceSubtotalCents();
  if (!totalCents || totalCents < 50) {
    alert("Invalid Wrrapd total. Please refresh and try again.");
    return;
  }
  const orderNumber = generateLegoOrderNumber();
  try {
    sessionStorage.setItem("wrrapd-lego-order-number", orderNumber);
  } catch {
    /* ignore */
  }
  const payload = {
    total: totalCents,
    address: hubAsPaymentAddress(),
    gifteeOriginalAddress: gifteeStubFromSession(),
    orderNumber,
    pricingCart: buildLegoPricingCart(),
    retailer: "Lego",
    name_of_retailer: "Lego",
  };
  const encodedPayload = btoa(JSON.stringify(payload));
  let paymentUrl = `https://pay.wrrapd.com/checkout/lego?data=${encodeURIComponent(encodedPayload)}`;
  try {
    if (sessionStorage.getItem("wrrapd-checkout-debug") === "1") {
      paymentUrl += "&wrrapdDebug=1";
    }
  } catch {
    /* ignore */
  }

  const popupWidth = 480;
  const popupHeight = 820;
  const screenX = window.screenX !== undefined ? window.screenX : window.screenLeft;
  const screenY = window.screenY !== undefined ? window.screenY : window.screenTop;
  const left = screenX + (window.innerWidth - popupWidth) / 2;
  const top = screenY + (window.innerHeight - popupHeight) / 2;
  const popup = window.open(
    paymentUrl,
    "WrrapdPaymentLego",
    `width=${popupWidth},height=${popupHeight},left=${left},top=${top},scrollbars=yes,resizable=yes`,
  );
  if (!popup) {
    alert("Please allow popups for LEGO.com to complete Wrrapd payment.");
    return;
  }
  payPopupRef = popup;
  popup.focus();
}

function ensurePaymentSummaryUi() {
  const btn = findCheckoutSecurelyButton();
  if (!btn?.parentElement) return;
  const paid = readLegoPaymentSuccess();
  const { lines, totalCents } = buildSummaryLinesAndTotal();
  const { payBtn } = mountSummaryNearButton(btn, lines, totalCents, paid);
  if (!paid) {
    payBtn.addEventListener("click", () => {
      openLegoPaymentPopup();
    });
  }
}

function migrateLegacyGiftTcFlag() {
  try {
    const tc = sessionStorage.getItem("wrrapdLegoGiftTcAccepted");
    const ch = sessionStorage.getItem("wrrapdLegoGiftChoicesSaved");
    if (tc === "1" && ch !== "1") {
      sessionStorage.setItem("wrrapdLegoGiftChoicesSaved", "1");
    }
  } catch {
    /* ignore */
  }
}

/**
 * Capture Checkout Securely: hub confirmation → payment summary → pay.wrrapd.com/checkout/lego.
 */
export function initLegoCheckoutPayFlow() {
  migrateLegacyGiftTcFlag();
  bindPayMessageOnce();

  document.addEventListener(
    "click",
    (e) => {
      const btn = findCheckoutSecurelyButton();
      if (!btn || !e.target || !btn.contains(e.target)) return;
      if (readGiftRadio() !== "yes") return;
      if (!readGiftChoicesSaved() || !readGiftLegalTermsAccepted()) return;

      if (e.target.closest("[data-wrrapd-lego-pay-panel]")) return;

      if (!readHubShipAccepted()) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        openLegoHubConfirmModal(() => {
          ensurePaymentSummaryUi();
        });
        return;
      }

      if (!readLegoPaymentSuccess()) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        ensurePaymentSummaryUi();
        const hint = document.getElementById(SUMMARY_ROOT_ID);
        if (hint) hint.scrollIntoView({ block: "nearest", behavior: "smooth" });
        return;
      }
    },
    true,
  );
}
