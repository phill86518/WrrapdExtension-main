import {
  clearGiftServiceFlags,
  notifyGiftRadioChange,
  readGiftChoicesSaved,
  readGiftLegalTermsAccepted,
  readGiftRadio,
  readItemChoices,
  writeGiftChoicesSaved,
  writeGiftLegalTermsAccepted,
  writeGiftRadio,
  writeItemChoices,
  writePaymentSuccess,
} from "./cart-gift-session.js";
import {
  buildCartFingerprint,
  createSharedGiftSessionAdapter,
  defaultEmptyChoice,
  syncGiftSessionWithCart,
  writeCartFingerprint,
} from "./cart-gift-sync.js";
import { buildOccasionSelect, isValidOccasion } from "./occasions.js";
import { buildWrrapdTermsHtml } from "./wrrapd-terms.js";
import { createWrrapdBrandLogo } from "./wrrapd-brand.js";
import { generateWrrapdOrderNumber } from "./wrrapd-order-code.js";
import {
  analyzeCartFulfillment,
  buildMixedFulfillmentNotice,
  buildPickupOnlyNotice,
} from "./cart-fulfillment.js";
import { formatUsd, getActiveUnitPrices, createUnitPricingState } from "./wrrapd-unit-pricing.js";
import { mountGifteeZipEstimateBar } from "./giftee-zip-estimate.js";
import { unlockHubShippingFields } from "./wrrapd-hub.js";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/** Stable per-session order number, shared with the checkout pay flow. */
function getOrCreateOrderNumber(prefix) {
  const key = `${prefix}OrderNumber`;
  try {
    let on = sessionStorage.getItem(key);
    if (!on) {
      on = generateWrrapdOrderNumber(prefix);
      sessionStorage.setItem(key, on);
    }
    return on;
  } catch {
    return "";
  }
}

function findButtonByText(patterns, root = document) {
  const nodes = root.querySelectorAll("button, a[role='button'], input[type='submit']");
  for (const node of nodes) {
    const text = normalizeWhitespace(node.textContent || node.value || "");
    if (!text) continue;
    if (patterns.some((re) => re.test(text))) return node;
  }
  return null;
}

function safeQuerySelector(selector, root = document) {
  const sel = String(selector || "").trim();
  if (!sel) return null;
  try {
    return root.querySelector(sel);
  } catch {
    return null;
  }
}

function findMountBeforeCheckout(config) {
  if (typeof config.findMountAnchor === "function") {
    const custom = config.findMountAnchor();
    if (custom?.parent) return custom;
  }

  const checkoutBtn =
    findButtonByText(config.checkoutButtonPatterns || [/^checkout$/i, /^proceed to checkout$/i]) ||
    safeQuerySelector(config.checkoutButtonSelector);

  if (checkoutBtn?.parentElement) {
    return { parent: checkoutBtn.parentElement, before: checkoutBtn };
  }

  const summary =
    safeQuerySelector(config.summarySelector) ||
    document.querySelector("aside[data-testid='order-summary']") ||
    document.querySelector("[data-testid='cart-order-summary']") ||
    document.querySelector("[data-comp*='CostSummary']");

  if (summary?.parentElement) {
    return { parent: summary.parentElement, before: summary };
  }

  const main =
    document.querySelector("main[data-testid='cart-root']") ||
    document.querySelector("main") ||
    document.querySelector("[role='main']");
  if (main) return { parent: main, before: main.firstElementChild };

  return null;
}

function existingOptIn(config) {
  return document.querySelector(`[${config.optInDataAttr}]`);
}

function existingFulfillmentNotice() {
  return document.querySelector("[data-wrrapd-fulfillment-notice]");
}

function removeFulfillmentNotice() {
  existingFulfillmentNotice()?.remove();
}

function mountFulfillmentNotice(config, anchor, noticeEl) {
  removeFulfillmentNotice();
  existingOptIn(config)?.remove();
  if (!anchor?.parent || !noticeEl) return;
  if (anchor.before) anchor.parent.insertBefore(noticeEl, anchor.before);
  else anchor.parent.append(noticeEl);
}

function cartHasWrappableItems(cartSnapshot, config) {
  if (config && typeof config.isCartEmpty === "function" && config.isCartEmpty()) {
    return false;
  }
  const snap = cartSnapshot && typeof cartSnapshot === "object" ? cartSnapshot : {};
  if (snap.isEmpty === true) return false;
  const count =
    typeof snap.itemCount === "number" && Number.isFinite(snap.itemCount)
      ? snap.itemCount
      : Array.isArray(snap.items)
        ? snap.items.length
        : 0;
  return count > 0;
}

/** True only when the customer fully completed the gift flow (choices + terms). */
function giftFlowComplete(config) {
  return readGiftChoicesSaved(config.sessionPrefix) && readGiftLegalTermsAccepted(config.sessionPrefix);
}

/** Gift-choices or legal-terms modal currently open. */
function giftWizardOpen(config) {
  try {
    return Boolean(
      document.getElementById(config.modalId) ||
        document.getElementById(`${config.modalId}-terms`),
    );
  } catch {
    return false;
  }
}

/**
 * Default is always No. Keep Yes only while the wizard is open or the flow is fully complete.
 * Stale Yes (abandoned modal) must clear so retailer pickup/shipping options stay visible.
 */
function ensureDefaultNoWrrapd(config) {
  const prefix = config.sessionPrefix;
  const radio = readGiftRadio(prefix);
  if (radio === "yes" && (giftFlowComplete(config) || giftWizardOpen(config))) {
    return "yes";
  }
  if (radio === "no") return "no";

  if (radio === "yes") {
    clearGiftServiceFlags(prefix);
    writePaymentSuccess(prefix, false);
    unlockHubShippingFields();
  }
  writeGiftRadio(prefix, "no");
  notifyGiftRadioChange(prefix);
  return "no";
}

/** Cancel / dismiss Yes without finishing — restore retailer fulfillment UI. */
function abandonIncompleteWrrapdYes(config, cartSnapshot) {
  if (giftFlowComplete(config)) return;
  clearGiftServiceFlags(config.sessionPrefix);
  writePaymentSuccess(config.sessionPrefix, false);
  writeGiftRadio(config.sessionPrefix, "no");
  unlockHubShippingFields();
  notifyGiftRadioChange(config.sessionPrefix);
  existingOptIn(config)?.remove();
  if (cartSnapshot) mountCartGiftOptIn(config, cartSnapshot);
  else mountCartGiftOptIn(config, config.getCartSnapshot?.());
}

function summarizeChoice(ch) {
  const bits = [];
  if (ch.wrapPref === "upload") bits.push("your uploaded design");
  else if (ch.wrapPref === "ai") bits.push("an AI-generated design");
  else bits.push("Wrrapd's choice of wrap");
  if (ch.occasion) bits.push(`for ${ch.occasion}`);
  if (ch.flowers) bits.push("+ flowers");
  return bits.join(" ");
}

function buildSavedBanner(config) {
  const choices = readItemChoices(config.sessionPrefix);
  const cartSnap = config.getCartSnapshot?.();
  const cartCount =
    cartSnap && typeof cartSnap === "object"
      ? typeof cartSnap.itemCount === "number"
        ? cartSnap.itemCount
        : Array.isArray(cartSnap.items)
          ? cartSnap.items.length
          : choices.length
      : choices.length;
  const count = cartCount > 0 ? cartCount : choices.length;
  const wrap = document.createElement("div");
  wrap.setAttribute(config.savedBannerAttr, "1");
  wrap.style.cssText =
    "margin:0 0 10px;padding:10px 12px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;font-size:13px;color:#065f46;";
  const head = document.createElement("div");
  head.style.cssText = "font-weight:700;margin-bottom:4px;";
  head.textContent =
    count > 0
      ? `Wrrapd gift wrap saved for ${count} item${count === 1 ? "" : "s"}.`
      : "Wrrapd gift wrap preference saved.";
  wrap.append(head);
  if (count > 0) {
    const first = choices[0];
    const detail = document.createElement("div");
    detail.style.cssText = "color:#047857;";
    detail.textContent = summarizeChoice(first) + (count > 1 ? " …and more" : "");
    wrap.append(detail);
  }
  return wrap;
}

function buildCartChangedNotice() {
  const wrap = document.createElement("div");
  wrap.setAttribute("data-wrrapd-cart-changed", "1");
  wrap.style.cssText =
    "margin:0 0 10px;padding:10px 12px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;font-size:13px;color:#92400e;";
  wrap.textContent =
    "Your cart changed — please tap Edit gift wrap choices to update selections for new items.";
  return wrap;
}

function runCartGiftSync(config, cartSnapshot) {
  return syncGiftSessionWithCart(
    createSharedGiftSessionAdapter(config.sessionPrefix),
    cartSnapshot,
    (title) => defaultEmptyChoice(title),
  );
}

function optInUiSignature(config, cartSnapshot, syncResult) {
  const fp = buildCartFingerprint(cartSnapshot);
  const radio = readGiftRadio(config.sessionPrefix);
  const complete = giftFlowComplete(config) ? 1 : 0;
  const review = syncResult?.requiresReview ? 1 : 0;
  const choiceCount = readItemChoices(config.sessionPrefix).length;
  return `${fp}|${radio}|${complete}|${review}|${choiceCount}`;
}

function emptyChoice(title) {
  return {
    title: title || "Item",
    wrapPref: "wrrapd",
    occasion: "",
    wrrapdHint: "",
    uploadName: "",
    uploadDataUrl: "",
    aiPrompt: "",
    aiDesign: null,
    flowers: false,
    flowerDesign: "",
    message: "",
  };
}

// ─── Generic legal-terms modal (Amazon/LEGO-style scroll-to-accept) ─────────────

function openGenericTermsModal(config, onAccepted) {
  const id = `${config.modalId}-terms`;
  if (document.getElementById(id)) return;
  const retailer = config.retailerLabel || "this store";

  const modal = document.createElement("div");
  modal.id = id;
  modal.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;";

  const content = document.createElement("div");
  content.style.cssText =
    "background:#fff;border-radius:12px;max-width:560px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 4px 24px rgba(0,0,0,.35);position:relative;";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";
  closeBtn.style.cssText =
    "position:absolute;top:6px;right:12px;border:none;background:none;font-size:28px;color:#64748b;cursor:pointer;line-height:1;z-index:2;";
  const dismissTermsWithoutAccept = () => {
    modal.remove();
    // Choices may already be saved from the prior step — without accept, treat as abandoned Yes.
    abandonIncompleteWrrapdYes(config, config.getCartSnapshot?.());
  };
  closeBtn.addEventListener("click", dismissTermsWithoutAccept);

  const scrollable = document.createElement("div");
  scrollable.style.cssText =
    "padding:36px 28px 20px;overflow-y:auto;flex:1;font-family:Georgia,'Times New Roman',serif;line-height:1.75;color:#0f172a;font-size:15px;";
  scrollable.innerHTML = buildWrrapdTermsHtml(retailer);

  const agreement = document.createElement("div");
  agreement.style.cssText =
    "padding:18px 24px 22px;border-top:2px solid #e2e8f0;text-align:center;font-size:15px;font-family:Georgia,serif;color:#0f172a;";
  const agreementText = document.createElement("div");
  agreementText.innerHTML =
    'By clicking <span class="wrrapd-agree-link" style="color:#94a3b8;cursor:not-allowed;text-decoration:underline;">here</span>, I appoint Wrrapd as my limited agent for this gift transaction and agree to the terms above.';
  const agreeLink = agreementText.querySelector(".wrrapd-agree-link");

  let linkEnabled = false;
  const checkScroll = () => {
    const max = scrollable.scrollHeight - scrollable.clientHeight;
    const atBottom = max <= 5 || scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 5;
    linkEnabled = atBottom;
    agreeLink.style.color = atBottom ? "#0369a1" : "#94a3b8";
    agreeLink.style.cursor = atBottom ? "pointer" : "not-allowed";
  };
  scrollable.addEventListener("scroll", checkScroll);
  window.setTimeout(checkScroll, 120);

  agreeLink.addEventListener("click", (e) => {
    if (!linkEnabled) {
      e.preventDefault();
      return;
    }
    writeGiftLegalTermsAccepted(config.sessionPrefix, true);
    modal.remove();
    notifyGiftRadioChange(config.sessionPrefix);
    if (typeof onAccepted === "function") onAccepted();
  });

  agreement.appendChild(agreementText);
  content.append(closeBtn, scrollable, agreement);
  modal.appendChild(content);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) dismissTermsWithoutAccept();
  });
  document.body.appendChild(modal);
}

// ─── Full per-item gift wizard ──────────────────────────────────────────────────

function openGiftChoicesModal(config, cartSnapshot) {
  const existing = document.getElementById(config.modalId);
  if (existing) existing.remove();

  const snapItems = (cartSnapshot?.items || []).map((it) => ({
    title: it.title || "Item",
    imageUrl: it.imageUrl || "",
  }));
  const lines = snapItems.length > 0 ? snapItems : [{ title: `${config.retailerLabel} order`, imageUrl: "" }];
  const totalItems = lines.length;

  let allChoices = readItemChoices(config.sessionPrefix);
  if (!Array.isArray(allChoices)) allChoices = [];
  while (allChoices.length < totalItems) allChoices.push(emptyChoice(lines[allChoices.length]?.title));
  while (allChoices.length > totalItems) allChoices.pop();

  let currentIdx = 0;

  const overlay = document.createElement("div");
  overlay.id = config.modalId;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Wrrapd gift wrap");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;";

  const panel = document.createElement("div");
  panel.style.cssText =
    "width:100%;max-width:44rem;max-height:90vh;overflow:auto;background:#fff;border-radius:12px;padding:18px 18px 14px;box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:inherit;font-size:14px;line-height:1.5;color:#0f172a;";

  const title = document.createElement("h2");
  title.style.cssText = "margin:0 0 8px;font-size:18px;font-weight:800;color:#111827;";

  const intro = document.createElement("p");
  intro.style.cssText = "margin:0 0 12px;font-size:13px;line-height:1.5;color:#475569;";
  intro.textContent =
    config.modalIntro ||
    "Customize each item below. You'll complete Wrrapd's secure payment during checkout, then we wrap and ship to your giftee.";

  // Item preview
  const itemPreview = document.createElement("div");
  itemPreview.style.cssText =
    "display:flex;align-items:center;gap:12px;margin:0 0 12px;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;";
  const previewImg = document.createElement("img");
  previewImg.style.cssText =
    "width:56px;height:56px;object-fit:contain;border-radius:4px;border:1px solid #e2e8f0;flex:0 0 56px;background:#fff;";
  const previewInfo = document.createElement("div");
  previewInfo.style.cssText = "min-width:0;flex:1;";
  const previewTitle = document.createElement("div");
  previewTitle.style.cssText =
    "font-weight:600;font-size:14px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
  previewInfo.append(previewTitle);
  itemPreview.append(previewImg, previewInfo);

  // ── Wrap style ──
  const wrapLegend = document.createElement("p");
  wrapLegend.style.cssText = "margin:0 0 6px;font-size:15px;font-weight:700;color:#0f172a;";
  wrapLegend.textContent = "Choose your wrapping";
  const wrapFieldset = document.createElement("div");
  wrapFieldset.style.cssText = "border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin:0 0 14px;";

  let currentWrapPref = "wrrapd";
  let currentOccasion = "";
  let currentWrrapdHint = "";
  let currentUploadName = "";
  let currentUploadDataUrl = "";
  let currentAiPrompt = "";
  let currentAiDesign = null;

  // "Allow Wrrapd to choose" row — radio on the left, occasion dropdown on the right
  const wrrapdRow = document.createElement("label");
  wrrapdRow.style.cssText =
    "display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:10px;font-size:14px;color:#111827;";
  const wrrapdRadio = document.createElement("input");
  wrrapdRadio.type = "radio";
  wrrapdRadio.name = `${config.sessionPrefix}-wrap`;
  wrrapdRadio.value = "wrrapd";
  const wrrapdText = document.createElement("span");
  wrrapdText.style.cssText = "font-weight:600;";
  wrrapdText.textContent = "Allow Wrrapd to choose the wrapping";
  const occasionSelect = buildOccasionSelect({ id: `${config.modalId}-occasion` });
  occasionSelect.style.cssText =
    "margin-left:auto;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;color:#0f172a;background:#fff;max-width:50%;";
  occasionSelect.addEventListener("change", () => {
    currentOccasion = occasionSelect.value;
    occasionSelect.style.borderColor = "#cbd5e1";
  });
  occasionSelect.addEventListener("click", (e) => e.preventDefault());
  wrrapdRow.append(wrrapdRadio, wrrapdText, occasionSelect);

  // Optional free-text hint for the "Wrrapd chooses" path
  const wrrapdHintWrap = document.createElement("div");
  wrrapdHintWrap.style.cssText = "margin:0 0 10px 24px;";
  const wrrapdHintInput = document.createElement("input");
  wrrapdHintInput.type = "text";
  wrrapdHintInput.placeholder = "Other details for our wrap team (optional)";
  wrrapdHintInput.style.cssText =
    "width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;color:#0f172a;";
  wrrapdHintInput.addEventListener("input", () => {
    currentWrrapdHint = wrrapdHintInput.value;
  });
  wrrapdHintWrap.append(wrrapdHintInput);

  // Upload row
  const uploadRow = document.createElement("label");
  uploadRow.style.cssText =
    "display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:10px;font-size:14px;color:#111827;font-weight:600;";
  const uploadRadio = document.createElement("input");
  uploadRadio.type = "radio";
  uploadRadio.name = `${config.sessionPrefix}-wrap`;
  uploadRadio.value = "upload";
  const uploadPriceNote = document.createElement("span");
  uploadPriceNote.style.cssText = "margin-left:4px;font-weight:500;color:#64748b;font-size:13px;";
  uploadRow.append(uploadRadio, document.createTextNode("Upload my own design"), uploadPriceNote);

  const uploadWrap = document.createElement("div");
  uploadWrap.style.cssText = "display:none;margin:0 0 10px 24px;padding:8px;border:1px solid #e2e8f0;border-radius:6px;";
  const uploadInput = document.createElement("input");
  uploadInput.type = "file";
  uploadInput.accept = "image/*";
  uploadInput.style.cssText = "display:block;margin-bottom:6px;font-size:13px;";
  const uploadPreview = document.createElement("div");
  uploadPreview.style.display = "none";
  const uploadImg = document.createElement("img");
  uploadImg.style.cssText = "max-width:100%;max-height:120px;border:1px solid #ddd;border-radius:4px;";
  uploadPreview.append(uploadImg);
  uploadInput.addEventListener("change", () => {
    const f = uploadInput.files && uploadInput.files[0];
    if (!f) return;
    currentUploadName = f.name;
    const fr = new FileReader();
    fr.onload = () => {
      currentUploadDataUrl = typeof fr.result === "string" ? fr.result : "";
      if (currentUploadDataUrl) {
        uploadImg.src = currentUploadDataUrl;
        uploadPreview.style.display = "block";
      }
    };
    fr.readAsDataURL(f);
  });
  uploadWrap.append(uploadInput, uploadPreview);

  // AI row
  const aiRow = document.createElement("label");
  aiRow.style.cssText =
    "display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:6px;font-size:14px;color:#111827;font-weight:600;";
  const aiRadio = document.createElement("input");
  aiRadio.type = "radio";
  aiRadio.name = `${config.sessionPrefix}-wrap`;
  aiRadio.value = "ai";
  const aiPriceNote = document.createElement("span");
  aiPriceNote.style.cssText = "margin-left:4px;font-weight:500;color:#64748b;font-size:13px;";
  aiRow.append(aiRadio, document.createTextNode("Generate a design with AI"), aiPriceNote);

  const aiWrap = document.createElement("div");
  aiWrap.style.cssText = "display:none;margin:0 0 4px 24px;padding:8px;border:1px solid #e2e8f0;border-radius:6px;";
  const aiHint = document.createElement("div");
  aiHint.style.cssText = "font-size:13px;color:#334155;margin-bottom:6px;";
  aiHint.textContent = "Describe the occasion, recipient, or theme for AI-generated design ideas:";
  const aiInput = document.createElement("input");
  aiInput.type = "text";
  aiInput.placeholder = "e.g., Birthday for my 10-year-old who loves space, elegant florals…";
  aiInput.style.cssText =
    "width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;font-size:13px;margin-bottom:6px;";
  aiInput.addEventListener("input", () => {
    currentAiPrompt = aiInput.value;
  });
  const aiGenBtn = document.createElement("button");
  aiGenBtn.type = "button";
  aiGenBtn.textContent = "Generate designs";
  aiGenBtn.style.cssText =
    "padding:6px 12px;border:1px solid #a88734;background:#f0c14b;border-radius:6px;cursor:pointer;font-size:13px;";
  const aiStatus = document.createElement("div");
  aiStatus.style.cssText = "font-size:12px;color:#64748b;margin-top:6px;";
  const aiResults = document.createElement("div");
  aiResults.style.cssText = "display:flex;flex-direction:column;gap:12px;margin-top:10px;";

  // Persist the selected AI design to GCS (upscaled), mirroring the Amazon flow.
  async function persistSelectedAiDesign(design, itemTitle) {
    if (!design || !design.imageBase64) return;
    try {
      const resp = await fetch("https://api.wrrapd.com/api/save-ai-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: design.imageBase64,
          designTitle: design.title,
          designDescription: design.description || "",
          itemTitle: itemTitle || `${config.retailerName || config.retailerLabel} item`,
          orderNumber: getOrCreateOrderNumber(config.sessionPrefix),
          prompt: currentAiPrompt || "",
          folder: "designs",
          shouldUpscale: true,
        }),
      });
      if (!resp.ok) return;
      const saved = await resp.json().catch(() => ({}));
      // Only keep the selection if it's still the active one for this item.
      if (currentAiDesign && currentAiDesign.title === design.title) {
        currentAiDesign = {
          title: design.title,
          description: design.description || "",
          gcsPath: saved.filePath || "",
          gcsUrl: saved.publicUrl || "",
        };
      }
    } catch {
      /* keep the lightweight selection even if GCS save fails */
    }
  }

  // Render up to 3 designs (Amazon-style): radio + title + description + image.
  const renderDesigns = (items) => {
    aiResults.innerHTML = "";
    if (!Array.isArray(items) || !items.length) return;
    items.slice(0, 3).forEach((design, idx) => {
      const ttl = String(design?.title || `Design ${idx + 1}`);
      const desc = String(design?.description || "");
      const imgSrc = design?.imageUrl || design?.gcsUrl || "";
      const lbl = document.createElement("label");
      lbl.style.cssText =
        "display:flex;flex-direction:column;gap:8px;cursor:pointer;border:2px solid #e5e7eb;border-radius:8px;padding:10px;font-size:13px;";
      const head = document.createElement("div");
      head.style.cssText = "display:flex;align-items:flex-start;gap:8px;";
      const r = document.createElement("input");
      r.type = "radio";
      r.name = `${config.sessionPrefix}-ai-choice`;
      r.style.marginTop = "3px";
      if (currentAiDesign && currentAiDesign.title === ttl) {
        r.checked = true;
        lbl.style.borderColor = "#f0c14b";
      }
      r.addEventListener("change", () => {
        if (!r.checked) return;
        aiResults.querySelectorAll("label").forEach((l) => (l.style.borderColor = "#e5e7eb"));
        lbl.style.borderColor = "#f0c14b";
        currentAiDesign = {
          title: ttl,
          description: desc,
          imageUrl: design?.imageUrl || "",
          imageBase64: design?.imageBase64 || "",
        };
        void persistSelectedAiDesign(design, lines[currentIdx]?.title);
      });
      const body = document.createElement("div");
      body.innerHTML = `<div style="font-weight:700;color:#0f172a">${ttl}</div><div style="color:#475569;line-height:1.4">${desc}</div>`;
      head.append(r, body);
      lbl.append(head);
      if (imgSrc) {
        const img = document.createElement("img");
        img.src = imgSrc;
        img.alt = ttl;
        img.style.cssText =
          "width:100%;max-height:220px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;";
        lbl.append(img);
      }
      aiResults.append(lbl);
    });
  };

  aiGenBtn.addEventListener("click", async () => {
    const prompt = aiInput.value.trim();
    if (!prompt) {
      aiInput.focus();
      return;
    }
    currentAiPrompt = prompt;
    aiGenBtn.disabled = true;
    aiGenBtn.textContent = "Generating…";
    aiResults.innerHTML = "";
    aiStatus.textContent = "✨ Creating 3 custom designs… this can take 1–2 minutes.";
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 240000);
      const resp = await fetch("https://api.wrrapd.com/generate-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occasion: prompt,
          productTitle: lines[currentIdx]?.title || lines[0]?.title || "",
          retailer: config.retailerLabel || "",
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const rawData = await resp.text();
      if (!resp.ok) throw new Error(`Server error ${resp.status}`);
      // Server double-stringifies the JSON; parse twice with a single-parse fallback.
      let data;
      try {
        data = JSON.parse(JSON.parse(rawData));
      } catch {
        data = JSON.parse(rawData);
      }
      const designs = Array.isArray(data?.designs) ? data.designs : [];
      if (!designs.length) throw new Error("No designs returned");
      renderDesigns(designs);
      aiStatus.textContent = "Pick your favorite design above.";
    } catch (err) {
      aiStatus.textContent = "";
      aiResults.innerHTML =
        "<div style='color:#b91c1c;font-size:13px'>Could not generate designs — please try again.</div>";
    } finally {
      aiGenBtn.disabled = false;
      aiGenBtn.textContent = "Generate designs";
    }
  });
  aiWrap.append(aiHint, aiInput, aiGenBtn, aiStatus, aiResults);

  const refreshWrapSubs = () => {
    wrrapdHintWrap.style.display = currentWrapPref === "wrrapd" ? "block" : "none";
    occasionSelect.style.display = currentWrapPref === "wrrapd" ? "" : "none";
    uploadWrap.style.display = currentWrapPref === "upload" ? "block" : "none";
    aiWrap.style.display = currentWrapPref === "ai" ? "block" : "none";
  };

  [wrrapdRadio, uploadRadio, aiRadio].forEach((r) => {
    r.addEventListener("change", () => {
      if (r.checked) {
        currentWrapPref = r.value;
        refreshWrapSubs();
      }
    });
  });

  wrapFieldset.append(wrrapdRow, wrrapdHintWrap, uploadRow, uploadWrap, aiRow, aiWrap);

  // ── Flowers ──
  let currentFlowers = false;
  let currentFlowerDesign = "";
  const flowersLabel = document.createElement("label");
  flowersLabel.style.cssText =
    "display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:15px;font-weight:700;color:#0f172a;cursor:pointer;";
  const flowersCb = document.createElement("input");
  flowersCb.type = "checkbox";
  const flowersText = document.createElement("span");
  flowersText.textContent = "Add flowers — choose from below (15–20 stem bouquets)";
  flowersLabel.append(flowersCb, flowersText);
  const flowersGrid = document.createElement("div");
  flowersGrid.style.cssText =
    "display:none;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:4px 0 14px 24px;";
  const flowerRadios = [1, 2, 3, 4].map((n) => {
    const lab = document.createElement("label");
    lab.style.cssText =
      "display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;font-size:12px;color:#0f172a;";
    const r = document.createElement("input");
    r.type = "radio";
    r.name = `${config.sessionPrefix}-flower-design`;
    r.value = `flowers-${n}`;
    r.addEventListener("change", () => {
      if (r.checked) currentFlowerDesign = r.value;
    });
    const img = document.createElement("img");
    try {
      img.src = chrome.runtime.getURL(`assets/flowers/flowers-${n}.webp`);
    } catch {
      /* ignore */
    }
    img.alt = `Bouquet ${n}`;
    img.style.cssText = "width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;";
    lab.append(r, img);
    flowersGrid.append(lab);
    return r;
  });
  flowersCb.addEventListener("change", () => {
    currentFlowers = flowersCb.checked;
    flowersGrid.style.display = currentFlowers ? "grid" : "none";
    if (!currentFlowers) currentFlowerDesign = "";
  });

  // ── Gift message ──
  const msgLabel = document.createElement("label");
  msgLabel.style.cssText = "display:block;font-size:13px;font-weight:600;color:#0f172a;margin:0 0 4px;";
  msgLabel.textContent = "Gift message (optional)";
  const msgInput = document.createElement("textarea");
  msgInput.rows = 2;
  msgInput.placeholder = "A short note for your giftee";
  msgInput.style.cssText =
    "width:100%;box-sizing:border-box;font-size:13px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;resize:vertical;margin:0 0 14px;";

  // ── Buttons ──
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:4px;";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.style.cssText =
    "padding:8px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer;font-size:13px;";
  const back = document.createElement("button");
  back.type = "button";
  back.textContent = "← Back";
  back.style.cssText =
    "padding:8px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer;font-size:13px;";
  const next = document.createElement("button");
  next.type = "button";
  next.style.cssText =
    "padding:8px 14px;border:none;background:#111827;color:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;";
  actions.append(cancel, back, next);

  const gatedBody = document.createElement("div");
  gatedBody.setAttribute("data-wrrapd-gift-body", "1");
  gatedBody.append(
    intro,
    itemPreview,
    wrapLegend,
    wrapFieldset,
    flowersLabel,
    flowersGrid,
    msgLabel,
    msgInput,
    actions,
  );
  panel.append(title, gatedBody);
  overlay.append(panel);

  const applyModalPrices = (prices) => {
    const p = prices || getActiveUnitPrices(createUnitPricingState());
    wrrapdText.textContent = `Allow Wrrapd to choose the wrapping — ${formatUsd(p.giftWrapBase)}`;
    uploadPriceNote.textContent = `(+${formatUsd(p.customDesignUpload)})`;
    aiPriceNote.textContent = `(+${formatUsd(p.customDesignAi)})`;
    flowersText.textContent = `Add flowers — choose from below (15–20 stem bouquets) — ${formatUsd(p.flowers)}`;
  };

  const zipBar = mountGifteeZipEstimateBar({
    parent: panel,
    insertBefore: gatedBody,
    sessionPrefix: config.sessionPrefix,
    retailerLabel: config.retailerLabel || config.retailerName || "",
    gatedContent: gatedBody,
    onPricesReady: applyModalPrices,
  });

  function renderItem(idx) {
    const line = lines[idx];
    const ch = allChoices[idx] || emptyChoice(line.title);

    title.textContent =
      totalItems > 1 ? `Item ${idx + 1} of ${totalItems} — Gift wrap with Wrrapd` : "Gift wrap with Wrrapd";

    if (line.imageUrl) {
      previewImg.src = line.imageUrl;
      previewImg.style.display = "block";
    } else {
      previewImg.style.display = "none";
    }
    previewTitle.textContent = line.title || "Item";

    currentWrapPref = ch.wrapPref || "wrrapd";
    currentOccasion = ch.occasion || "";
    currentWrrapdHint = ch.wrrapdHint || "";
    currentUploadName = ch.uploadName || "";
    currentUploadDataUrl = ch.uploadDataUrl || "";
    currentAiPrompt = ch.aiPrompt || "";
    currentAiDesign = ch.aiDesign || null;

    wrrapdRadio.checked = currentWrapPref === "wrrapd";
    uploadRadio.checked = currentWrapPref === "upload";
    aiRadio.checked = currentWrapPref === "ai";
    occasionSelect.value = currentOccasion;
    occasionSelect.style.borderColor = "#cbd5e1";
    wrrapdHintInput.value = currentWrrapdHint;

    if (currentUploadDataUrl) {
      uploadImg.src = currentUploadDataUrl;
      uploadPreview.style.display = "block";
    } else {
      uploadPreview.style.display = "none";
    }
    uploadInput.value = "";

    aiInput.value = currentAiPrompt;
    aiResults.innerHTML = "";
    if (currentAiDesign) renderDesigns([currentAiDesign]);

    refreshWrapSubs();

    currentFlowers = ch.flowers || false;
    currentFlowerDesign = ch.flowerDesign || "";
    flowersCb.checked = currentFlowers;
    flowersGrid.style.display = currentFlowers ? "grid" : "none";
    flowerRadios.forEach((r) => {
      r.checked = r.value === currentFlowerDesign;
    });

    msgInput.value = ch.message || "";

    back.style.display = idx > 0 ? "" : "none";
    const isLast = idx === totalItems - 1;
    next.textContent = isLast ? "Save choices" : "Next →";
  }

  function captureCurrentChoices() {
    // Persist only a lightweight AI design (no base64/data-URL) to stay within
    // the sessionStorage quota; the full image lives in GCS after selection.
    let aiDesign = null;
    if (currentWrapPref === "ai" && currentAiDesign) {
      aiDesign = {
        title: currentAiDesign.title || "",
        description: currentAiDesign.description || "",
        gcsPath: currentAiDesign.gcsPath || "",
        gcsUrl: currentAiDesign.gcsUrl || "",
      };
    }
    allChoices[currentIdx] = {
      title: lines[currentIdx]?.title || "Item",
      wrapPref: currentWrapPref,
      occasion: currentWrapPref === "wrrapd" ? currentOccasion : "",
      wrrapdHint: currentWrrapdHint,
      uploadName: currentUploadName,
      uploadDataUrl: currentUploadDataUrl,
      aiPrompt: currentAiPrompt,
      aiDesign,
      flowers: currentFlowers,
      flowerDesign: currentFlowerDesign,
      message: msgInput.value.trim(),
    };
  }

  // Require an occasion whenever "Allow Wrrapd to choose" is selected.
  function occasionMissing() {
    return currentWrapPref === "wrrapd" && !isValidOccasion(currentOccasion);
  }

  cancel.addEventListener("click", () => {
    overlay.remove();
    abandonIncompleteWrrapdYes(config, cartSnapshot);
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.remove();
      abandonIncompleteWrrapdYes(config, cartSnapshot);
    }
  });

  back.addEventListener("click", () => {
    if (occasionMissing()) {
      occasionSelect.style.borderColor = "#dc2626";
      occasionSelect.focus();
      return;
    }
    captureCurrentChoices();
    currentIdx--;
    renderItem(currentIdx);
    panel.scrollTop = 0;
  });

  next.addEventListener("click", () => {
    if (!zipBar.requireValidZip()) return;
    if (occasionMissing()) {
      occasionSelect.style.borderColor = "#dc2626";
      occasionSelect.focus();
      return;
    }
    captureCurrentChoices();

    if (currentIdx < totalItems - 1) {
      currentIdx++;
      renderItem(currentIdx);
      panel.scrollTop = 0;
      return;
    }

    // Last item — require legal terms. Giftee ZIP was confirmed at the top of this modal.
    writeItemChoices(config.sessionPrefix, allChoices);
    writeGiftChoicesSaved(config.sessionPrefix, true);
    writeGiftRadio(config.sessionPrefix, "yes");
    overlay.remove();
    openGenericTermsModal(config, () => {
      // Re-render the opt-in card so the saved banner + edit link appear.
      existingOptIn(config)?.remove();
      mountCartGiftOptIn(config, cartSnapshot);
    });
  });

  renderItem(0);
  document.body.append(overlay);
  next.focus();
}

function mountCartGiftOptIn(config, cartSnapshot) {
  if (!config.isCartPage?.() && !config.isCheckoutPage?.()) return;

  if (!cartHasWrappableItems(cartSnapshot, config)) {
    existingOptIn(config)?.remove();
    removeFulfillmentNotice();
    writeCartFingerprint(config.sessionPrefix, "");
    return;
  }

  const fulfillment = analyzeCartFulfillment(cartSnapshot);
  const anchor = findMountBeforeCheckout(config);

  if (fulfillment.allPickupOnly) {
    existingOptIn(config)?.remove();
    writeCartFingerprint(config.sessionPrefix, "");
    if (anchor?.parent) {
      mountFulfillmentNotice(config, anchor, buildPickupOnlyNotice(config.retailerLabel));
    }
    return;
  }

  if (fulfillment.hasMixedPickupAndShip) {
    existingOptIn(config)?.remove();
    writeCartFingerprint(config.sessionPrefix, "");
    if (anchor?.parent) {
      mountFulfillmentNotice(config, anchor, buildMixedFulfillmentNotice(config.retailerLabel));
    }
    return;
  }

  removeFulfillmentNotice();

  const syncResult = runCartGiftSync(config, cartSnapshot);
  // Always start (and recover) as No unless Yes is fully complete or the wizard is open.
  ensureDefaultNoWrrapd(config);
  const uiSig = optInUiSignature(config, cartSnapshot, syncResult);
  const existing = existingOptIn(config);
  if (existing && existing.dataset.wrrapdUiSig === uiSig) return;
  if (existing) existing.remove();

  if (!anchor?.parent) return;

  const wrap = document.createElement("section");
  wrap.setAttribute(config.optInDataAttr, "1");
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", "Gift wrap with Wrrapd");
  // `font:inherit` makes every Wrrapd surface adopt the retailer's own typeface so the card
  // blends into the host page (Kohl's, Nordstrom, etc.) instead of looking bolted-on.
  wrap.style.cssText =
    "box-sizing:border-box;width:100%;margin:0 0 12px;padding:16px 18px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;border-left:4px solid #ff8e14;box-shadow:0 1px 3px rgba(0,0,0,.06);font-family:inherit;color:#111827;";

  const brandRow = document.createElement("div");
  brandRow.style.cssText = "display:flex;align-items:center;gap:12px;margin:0 0 10px;";
  const brandLogo = createWrrapdBrandLogo(52);
  const brandTag = document.createElement("span");
  brandTag.style.cssText =
    "font-family:inherit;font-size:14px;font-weight:700;color:#ff8e14;letter-spacing:.01em;line-height:1.25;";
  brandTag.textContent = "Gift wrapping, handwritten note & flowers";
  brandRow.append(brandLogo, brandTag);

  const hook = document.createElement("h2");
  hook.style.cssText = "margin:0 0 4px;font-size:17px;font-weight:800;color:#111827;line-height:1.3;";
  hook.textContent = config.hook || "Make it a gift — beautifully wrapped & delivered for you.";

  const sub = document.createElement("p");
  sub.style.cssText = "margin:0 0 12px;font-size:13px;line-height:1.5;color:#475569;";
  sub.textContent =
    config.subtitle ||
    "Add premium gift wrap, a handwritten card, and optional flowers. We wrap it and ship it to your giftee — no printer, no scissors, no awkward receipt.";

  let tierNotice = null;
  if (config.shippingTierHint) {
    tierNotice = document.createElement("p");
    tierNotice.style.cssText =
      "margin:0 0 12px;padding:10px 12px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;font-size:13px;line-height:1.5;color:#78350f;";
    const retailer = config.retailerLabel || "This store";
    tierNotice.innerHTML =
      `<strong>Please note:</strong> ${retailer} ships an entire order to one address — unlike Amazon, we cannot send items to different recipients in the same checkout. ` +
      "If only some items should be gift-wrapped, please place those in a separate order. " +
      "When you choose Wrrapd for this order, every item here will be wrapped and forwarded together.";
  }

  let statusBanner = null;
  if (giftFlowComplete(config)) {
    statusBanner = buildSavedBanner(config);
  } else if (syncResult.requiresReview && readGiftRadio(config.sessionPrefix) === "yes") {
    statusBanner = buildCartChangedNotice();
  }

  const fieldset = document.createElement("fieldset");
  fieldset.style.cssText = "border:none;padding:0;margin:0;";

  // Session is already normalized by ensureDefaultNoWrrapd. Keep Yes selected while the
  // wizard is open; otherwise only a fully completed flow stays on Yes.
  const storedRadio = readGiftRadio(config.sessionPrefix) || "no";
  const yesChecked =
    storedRadio === "yes" && (giftFlowComplete(config) || giftWizardOpen(config));

  const mkRow = (value, labelText) => {
    const lab = document.createElement("label");
    lab.style.cssText =
      "display:flex;align-items:flex-start;gap:8px;cursor:pointer;margin-bottom:8px;font-size:14px;color:#111827;line-height:1.45;";
    const inp = document.createElement("input");
    inp.type = "radio";
    inp.name = `${config.sessionPrefix}-gift`;
    inp.value = value;
    inp.style.marginTop = "3px";
    if (value === "yes" ? yesChecked : !yesChecked) {
      inp.checked = true;
    }
    inp.addEventListener("click", () => {
      if (value === "yes") {
        writeGiftRadio(config.sessionPrefix, "yes");
        notifyGiftRadioChange(config.sessionPrefix);
        openGiftChoicesModal(config, cartSnapshot);
      } else {
        clearGiftServiceFlags(config.sessionPrefix);
        writePaymentSuccess(config.sessionPrefix, false);
        writeGiftRadio(config.sessionPrefix, "no");
        unlockHubShippingFields();
        const saved = wrap.querySelector(`[${config.savedBannerAttr}]`);
        if (saved) saved.remove();
        const editBtn = wrap.querySelector("[data-wrrapd-edit]");
        if (editBtn) editBtn.hidden = true;
        notifyGiftRadioChange(config.sessionPrefix);
      }
    });
    const text = document.createElement("span");
    text.textContent = labelText;
    lab.append(inp, text);
    return lab;
  };

  fieldset.append(
    mkRow("yes", "Yes — gift-wrap this order with Wrrapd"),
    mkRow("no", "No thanks, ship it to me unwrapped"),
  );

  const edit = document.createElement("button");
  edit.type = "button";
  edit.setAttribute("data-wrrapd-edit", "1");
  edit.textContent = "Edit gift wrap choices";
  edit.style.cssText =
    "margin-top:4px;padding:0;border:none;background:none;color:#0066c0;font-size:12px;cursor:pointer;text-decoration:underline;";
  edit.hidden = !giftFlowComplete(config);
  edit.addEventListener("click", () => openGiftChoicesModal(config, cartSnapshot));

  wrap.append(brandRow, hook, sub);
  if (tierNotice) wrap.append(tierNotice);
  if (statusBanner) wrap.append(statusBanner);
  wrap.append(fieldset, edit);
  wrap.dataset.wrrapdUiSig = uiSig;
  if (anchor.before) anchor.parent.insertBefore(wrap, anchor.before);
  else anchor.parent.append(wrap);
}

/**
 * @param {object} config
 * @param {() => boolean} config.isCartPage
 * @param {() => boolean} [config.isCheckoutPage]
 * @param {() => object} config.getCartSnapshot
 * @param {string} config.sessionPrefix
 * @param {string} config.optInDataAttr
 * @param {string} config.savedBannerAttr
 * @param {string} config.modalId
 * @param {string} config.retailerLabel
 * @param {string} [config.shippingTierHint]
 */
export function initRetailerCartGiftOptIn(config) {
  // Always-on heartbeat (survives store builds): lets any beta tester confirm in the
  // console that the Wrrapd content script actually injected, on which retailer, and which
  // version — the fastest way to tell a stale CWS install apart from a real mount failure.
  try {
    const label = config.retailerLabel || config.sessionPrefix || "retailer";
    const version =
      (typeof chrome !== "undefined" && chrome.runtime?.getManifest?.().version) || "?";
    const beats = (window.__WRRAPD_HEARTBEAT__ = window.__WRRAPD_HEARTBEAT__ || {});
    if (!beats[label]) {
      beats[label] = version;
      // eslint-disable-next-line no-console
      console.info(
        `%c[Wrrapd]%c v${version} active — ${label} cart/checkout watcher started`,
        "color:#ff8e14;font-weight:700",
        "color:inherit",
      );
    }
  } catch {
    /* never let diagnostics break init */
  }

  let scheduled = 0;

  const tick = () => {
    if (!config.isCartPage?.() && !config.isCheckoutPage?.()) return;
    mountCartGiftOptIn(config, config.getCartSnapshot?.());
  };

  const schedule = () => {
    if (scheduled) cancelAnimationFrame(scheduled);
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      tick();
    });
  };

  schedule();

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", () => setTimeout(schedule, 200));
}
