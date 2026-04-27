import {
  LEGO_GIFT_AI_DESIGN_KEY,
  LEGO_GIFT_CART_OPTIN_DATA_ATTR,
  LEGO_GIFT_CHECKOUT_STEP0_DATA_ATTR,
  LEGO_GIFT_CHOICES_SAVED_KEY,
  LEGO_GIFT_FLOWERS_INTEREST_KEY,
  LEGO_GIFT_INTENT_SESSION_KEY,
  LEGO_GIFT_MESSAGE_KEY,
  LEGO_GIFT_OCCASION_KEY,
  LEGO_GIFT_RADIO_SESSION_KEY,
  LEGO_GIFT_SELECTED_FLOWER_KEY,
  LEGO_GIFT_SENDER_NAME_KEY,
  LEGO_GIFT_GIFTEE_NAME_KEY,
  LEGO_GIFT_STEP0_DISMISSED_KEY,
  LEGO_GIFT_TC_SESSION_KEY,
  LEGO_GIFT_UPLOAD_DATA_URL_KEY,
  LEGO_GIFT_UPLOAD_NAME_KEY,
  LEGO_GIFT_WRAP_PREF_KEY,
  LEGO_HUB_SHIP_HINT_DATA_ATTR,
} from "./constants.js";
import { applyCheckoutSecurelyGate, openLegoTermsModal } from "./lego-checkout-pay-flow.js";
import { isLegoCheckoutReviewLikePage } from "./lego-checkout-review-detect.js";
import {
  clearLegoGiftServiceFlags,
  readGiftRadio,
  writeGiftChoicesSaved,
  writeGiftRadio,
} from "./lego-session-state.js";
import { loadAllowedZipCodes } from "../../content/lib/zip-codes.js";

const FLOW_MODAL_ID = "wrrapd-lego-gift-service-modal";

function migrateLegacySession() {
  try {
    const legacy = sessionStorage.getItem(LEGO_GIFT_INTENT_SESSION_KEY);
    if (legacy === "cart-yes" && !sessionStorage.getItem(LEGO_GIFT_RADIO_SESSION_KEY)) {
      sessionStorage.setItem(LEGO_GIFT_RADIO_SESSION_KEY, "yes");
      sessionStorage.setItem(LEGO_GIFT_CHOICES_SAVED_KEY, "1");
      sessionStorage.setItem(LEGO_GIFT_TC_SESSION_KEY, "1");
    }
    if (legacy === "dismissed-step0" && !sessionStorage.getItem(LEGO_GIFT_STEP0_DISMISSED_KEY)) {
      sessionStorage.setItem(LEGO_GIFT_STEP0_DISMISSED_KEY, "1");
    }
    if (legacy) sessionStorage.removeItem(LEGO_GIFT_INTENT_SESSION_KEY);
    if (sessionStorage.getItem(LEGO_GIFT_TC_SESSION_KEY) === "1" && sessionStorage.getItem(LEGO_GIFT_CHOICES_SAVED_KEY) !== "1") {
      sessionStorage.setItem(LEGO_GIFT_CHOICES_SAVED_KEY, "1");
    }
  } catch {
    /* ignore */
  }
}

function readStep0Dismissed() {
  try {
    return sessionStorage.getItem(LEGO_GIFT_STEP0_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStep0Dismissed() {
  try {
    sessionStorage.setItem(LEGO_GIFT_STEP0_DISMISSED_KEY, "1");
  } catch {
    /* ignore */
  }
}

function existingCartOptIn() {
  return document.querySelector(`[${LEGO_GIFT_CART_OPTIN_DATA_ATTR}]`);
}

function existingCheckoutStep0() {
  return document.querySelector(`[${LEGO_GIFT_CHECKOUT_STEP0_DATA_ATTR}]`);
}

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

function extractFiveDigitZip(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : "";
}

/** Prefer LEGO's own "estimate tax and delivery ZIP" input on cart. */
function readLegoEstimateZip() {
  const cands = [
    'input[placeholder*="ZIP" i]',
    'input[aria-label*="ZIP" i]',
    'input[name*="zip" i]',
    'input[id*="zip" i]',
  ];
  for (const sel of cands) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const val = extractFiveDigitZip(el.value);
    if (val) return val;
  }
  const bodyText = document.body ? document.body.textContent || "" : "";
  const m = bodyText.match(/Enter a ZIP code to estimate tax and delivery/i);
  if (m) {
    const nearbyInput = document.querySelector("aside input, form input");
    if (nearbyInput) {
      const val = extractFiveDigitZip(nearbyInput.value);
      if (val) return val;
    }
  }
  return "";
}

function removeLegacyHubShipCard() {
  document.querySelectorAll(`[${LEGO_HUB_SHIP_HINT_DATA_ATTR}]`).forEach((el) => {
    el.remove();
  });
}

/**
 * LEGO gift service modal with Amazon-like choices (wrap/upload/AI/flowers + fields).
 */
export function openLegoGiftServiceModal() {
  if (document.getElementById(FLOW_MODAL_ID)) return;

  const overlay = document.createElement("div");
  overlay.id = FLOW_MODAL_ID;
  overlay.className = "wrrapd-lego-modal";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "wrrapd-lego-flow-title");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483646",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:var(--ds-spacing-md, 1rem)",
    "background:rgba(15,23,42,0.55)",
    "box-sizing:border-box",
  ].join(";");

  const panel = document.createElement("div");
  panel.style.cssText = [
    "max-width:62rem",
    "width:100%",
    "box-sizing:border-box",
    "padding:1rem 1.1rem",
    "border-radius:0.75rem",
    "background:linear-gradient(180deg,#fff9c4 0%,#ffffff 42%)",
    "border:2px solid #f5cf00",
    "box-shadow:0 16px 40px rgba(0,0,0,.22)",
    "font-size:15px",
    "line-height:1.5",
    "color:#0f172a",
  ].join(";");

  const title = document.createElement("h2");
  title.id = "wrrapd-lego-flow-title";
  title.className = "ds-heading-sm ds-color-text-default";
  title.style.margin = "0 0 var(--ds-spacing-xs, 0.5rem) 0";
  title.style.color = "#0f172a";
  title.textContent = "Gift wrap with Wrrapd";

  const intro = document.createElement("p");
  intro.className = "ds-body-sm-regular ds-color-text-default";
  intro.style.margin = "0 0 var(--ds-spacing-sm, 0.75rem) 0";
  intro.style.fontSize = "15px";
  intro.style.color = "#0f172a";
  intro.textContent = "Choose wrapping paper design choices:";

  const wrapLegend = document.createElement("p");
  wrapLegend.className = "ds-label-sm-medium ds-color-text-default";
  wrapLegend.style.margin = "0 0 var(--ds-spacing-2xs, 0.375rem) 0";
  wrapLegend.style.color = "#0f172a";
  wrapLegend.style.fontSize = "14px";
  wrapLegend.textContent = "Wrapping paper";

  const wrapFieldset = document.createElement("div");
  wrapFieldset.style.margin = "0 0 var(--ds-spacing-sm, 0.75rem) 0";

  const wrapChoices = [
    { id: "wrrapd-wrap-wrrapd", value: "wrrapd", label: "Allow Wrrapd to choose the wrapping" },
    { id: "wrrapd-wrap-upload", value: "upload", label: "Upload my design" },
    { id: "wrrapd-wrap-ai", value: "ai", label: "I could use a little help generating a design" },
  ];
  let wrapValue = "wrrapd";
  try {
    wrapValue = sessionStorage.getItem(LEGO_GIFT_WRAP_PREF_KEY) || "wrrapd";
  } catch {
    wrapValue = "wrrapd";
  }
  if (!["wrrapd", "upload", "ai"].includes(wrapValue)) wrapValue = "wrrapd";
  for (const c of wrapChoices) {
    const row = document.createElement("label");
    row.className = "ds-body-sm-regular ds-color-text-default";
    row.style.cssText =
      "display:flex;align-items:flex-start;gap:var(--ds-spacing-2xs, 0.375rem);cursor:pointer;margin-bottom:6px;font-size:15px;color:#0f172a;";
    const inp = document.createElement("input");
    inp.type = "radio";
    inp.name = "wrrapd-lego-wrap";
    inp.value = c.value;
    inp.checked = c.value === wrapValue;
    inp.addEventListener("change", () => {
      if (inp.checked) wrapValue = c.value;
    });
    row.append(inp, document.createTextNode(" " + c.label));
    wrapFieldset.appendChild(row);
  }

  const uploadWrap = document.createElement("div");
  uploadWrap.style.cssText =
    "display:none;margin:8px 0 12px 24px;padding:8px;border:1px solid #e2e8f0;border-radius:6px;";
  const uploadInput = document.createElement("input");
  uploadInput.type = "file";
  uploadInput.accept = "image/*";
  uploadInput.style.cssText = "display:block;margin-bottom:8px;";
  const uploadPreview = document.createElement("div");
  uploadPreview.style.cssText = "display:none;";
  const uploadImg = document.createElement("img");
  uploadImg.style.cssText = "max-width:100%;max-height:180px;border:1px solid #ddd;border-radius:4px;";
  uploadPreview.appendChild(uploadImg);
  uploadWrap.append(uploadInput, uploadPreview);

  let uploadedDesignName = "";
  let uploadedDesignDataUrl = "";
  try {
    uploadedDesignName = sessionStorage.getItem(LEGO_GIFT_UPLOAD_NAME_KEY) || "";
    uploadedDesignDataUrl = sessionStorage.getItem(LEGO_GIFT_UPLOAD_DATA_URL_KEY) || "";
  } catch {
    uploadedDesignName = "";
    uploadedDesignDataUrl = "";
  }
  if (uploadedDesignDataUrl) {
    uploadImg.src = uploadedDesignDataUrl;
    uploadPreview.style.display = "block";
  }
  uploadInput.addEventListener("change", () => {
    const f = uploadInput.files && uploadInput.files[0];
    if (!f) return;
    uploadedDesignName = f.name;
    const fr = new FileReader();
    fr.onload = () => {
      uploadedDesignDataUrl = typeof fr.result === "string" ? fr.result : "";
      if (uploadedDesignDataUrl) {
        uploadImg.src = uploadedDesignDataUrl;
        uploadPreview.style.display = "block";
      }
    };
    fr.readAsDataURL(f);
  });

  const occasionInput = document.createElement("input");
  occasionInput.type = "text";
  occasionInput.placeholder = "e.g., Valentine's Day gift for my 28 yo boyfriend, my sister's 21st birthday, grandson's bar mitzvah...";
  occasionInput.style.cssText =
    "width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;";
  try {
    occasionInput.value = sessionStorage.getItem(LEGO_GIFT_OCCASION_KEY) || "";
  } catch {
    occasionInput.value = "";
  }

  const aiWrap = document.createElement("div");
  aiWrap.style.cssText =
    "display:none;margin:8px 0 12px 24px;padding:8px;border:1px solid #e2e8f0;border-radius:6px;";
  const aiHint = document.createElement("div");
  aiHint.className = "ds-body-sm-regular ds-color-text-default";
  aiHint.style.marginBottom = "8px";
  aiHint.style.fontSize = "15px";
  aiHint.style.color = "#334155";
  aiHint.textContent = "What's the occasion?  Who is the giftee?  What do they like?  Please feel free to suggest any themes...";
  const aiBtn = document.createElement("button");
  aiBtn.type = "button";
  aiBtn.className = "sk-button sk-button--secondary sk-button--small sk-button--neutral";
  aiBtn.textContent = "Generate AI designs";
  const aiResults = document.createElement("div");
  aiResults.style.cssText = "display:grid;gap:8px;margin-top:10px;";
  aiWrap.append(aiHint, occasionInput, aiBtn, aiResults);

  let selectedAiDesign = null;
  try {
    const raw = sessionStorage.getItem(LEGO_GIFT_AI_DESIGN_KEY);
    selectedAiDesign = raw ? JSON.parse(raw) : null;
  } catch {
    selectedAiDesign = null;
  }
  const renderAiResults = (items) => {
    aiResults.innerHTML = "";
    if (!Array.isArray(items) || !items.length) return;
    items.forEach((it) => {
      const title = String(it?.title || "AI Design");
      const description = String(it?.description || "");
      const label = document.createElement("label");
      label.style.cssText =
        "display:flex;gap:8px;align-items:flex-start;border:1px solid #e5e7eb;border-radius:6px;padding:8px;cursor:pointer;";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "wrrapd-lego-ai-choice";
      if (selectedAiDesign && selectedAiDesign.title === title && selectedAiDesign.description === description) {
        radio.checked = true;
      }
      radio.addEventListener("change", () => {
        if (!radio.checked) return;
        selectedAiDesign = { title, description };
      });
      const body = document.createElement("div");
      body.innerHTML = `<div style="font-weight:600;color:#0f172a;font-size:14px">${title}</div><div style="font-size:13px;color:#334155;line-height:1.4">${description}</div>`;
      label.append(radio, body);
      aiResults.append(label);
    });
  };
  aiBtn.addEventListener("click", async () => {
    const occasion = occasionInput.value.trim();
    if (!occasion) {
      occasionInput.focus();
      return;
    }
    aiBtn.disabled = true;
    aiBtn.textContent = "Generating...";
    try {
      const resp = await fetch("https://api.wrrapd.com/generate-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occasion }),
      });
      const data = await resp.json();
      renderAiResults(Array.isArray(data?.ideas) ? data.ideas.slice(0, 4) : []);
    } catch {
      aiResults.innerHTML = "<div style='font-size:14px;color:#b91c1c'>Could not generate ideas right now. Please try again.</div>";
    } finally {
      aiBtn.disabled = false;
      aiBtn.textContent = "Generate AI designs";
    }
  });

  const flowersLabel = document.createElement("label");
  flowersLabel.className = "ds-label-sm-medium ds-color-text-default";
  flowersLabel.style.cssText =
    "display:flex;gap:8px;align-items:flex-start;margin:4px 0 8px 0;font-size:15px;color:#0f172a;font-weight:600;";
  const flowersCb = document.createElement("input");
  flowersCb.type = "checkbox";
  flowersCb.style.marginTop = "2px";
  try {
    flowersCb.checked = sessionStorage.getItem(LEGO_GIFT_FLOWERS_INTEREST_KEY) === "1";
  } catch {
    flowersCb.checked = false;
  }
  const flowersText = document.createElement("span");
  flowersText.textContent = "Add Flowers - choose from below (15-20 stem bouquets)";
  flowersLabel.append(flowersCb, flowersText);

  const flowersGrid = document.createElement("div");
  flowersGrid.style.cssText =
    `display:${flowersCb.checked ? "grid" : "none"};grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:8px 0 14px 0;`;
  let selectedFlowerDesign = "";
  try {
    selectedFlowerDesign = sessionStorage.getItem(LEGO_GIFT_SELECTED_FLOWER_KEY) || "";
  } catch {
    selectedFlowerDesign = "";
  }
  [1, 2, 3, 4].forEach((n) => {
    const lab = document.createElement("label");
    lab.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;";
    const r = document.createElement("input");
    r.type = "radio";
    r.name = "wrrapd-lego-flower-design";
    r.value = `flowers-${n}`;
    if (selectedFlowerDesign === r.value) r.checked = true;
    r.addEventListener("change", () => {
      if (r.checked) selectedFlowerDesign = r.value;
    });
    const img = document.createElement("img");
    img.src = chrome.runtime.getURL(`assets/flowers/flowers-${n}.webp`);
    img.alt = `Flowers ${n}`;
    img.style.cssText = "width:124px;height:124px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;";
    lab.append(r, img);
    flowersGrid.append(lab);
  });
  flowersCb.addEventListener("change", () => {
    flowersGrid.style.display = flowersCb.checked ? "grid" : "none";
    if (!flowersCb.checked) selectedFlowerDesign = "";
  });

  const senderLabel = document.createElement("label");
  senderLabel.className = "ds-label-sm-medium ds-color-text-default";
  senderLabel.style.cssText = "display:block;margin:4px 0 6px 0;color:#0f172a;font-size:14px;";
  senderLabel.textContent = "Gifter (required)";
  const senderInput = document.createElement("input");
  senderInput.type = "text";
  senderInput.setAttribute("aria-required", "true");
  senderInput.autocomplete = "name";
  senderInput.placeholder = "Your name as the person sending the gift";
  senderInput.style.cssText =
    "width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;margin-bottom:8px;";
  try {
    senderInput.value = sessionStorage.getItem(LEGO_GIFT_SENDER_NAME_KEY) || "";
  } catch {
    senderInput.value = "";
  }

  const gifteeLabel = document.createElement("label");
  gifteeLabel.className = "ds-label-sm-medium ds-color-text-default";
  gifteeLabel.style.cssText = "display:block;margin:4px 0 6px 0;color:#0f172a;font-size:14px;";
  gifteeLabel.textContent = "Giftee (required)";
  const gifteeInput = document.createElement("input");
  gifteeInput.type = "text";
  gifteeInput.setAttribute("aria-required", "true");
  gifteeInput.placeholder = "Recipient's name (who receives the wrapped gift)";
  gifteeInput.style.cssText =
    "width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;margin-bottom:8px;";
  try {
    gifteeInput.value = sessionStorage.getItem(LEGO_GIFT_GIFTEE_NAME_KEY) || "";
  } catch {
    gifteeInput.value = "";
  }

  const msgLabel = document.createElement("label");
  msgLabel.className = "ds-label-sm-medium ds-color-text-default";
  msgLabel.style.cssText = "display:block;margin:4px 0 6px 0;color:#0f172a;font-size:14px;";
  msgLabel.textContent = "Gift message";
  const msgInput = document.createElement("textarea");
  msgInput.rows = 3;
  msgInput.placeholder = "Write a short message for your giftee";
  msgInput.style.cssText =
    "width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;margin-bottom:12px;";
  try {
    msgInput.value = sessionStorage.getItem(LEGO_GIFT_MESSAGE_KEY) || "";
  } catch {
    msgInput.value = "";
  }

  const row = document.createElement("div");
  row.style.cssText =
    "display:flex;flex-wrap:wrap;gap:var(--ds-spacing-2xs, 0.375rem);justify-content:flex-end;";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className =
    "sk-button sk-button--secondary sk-button--small sk-button--neutral";
  cancelBtn.textContent = "Not right now";

  const proceedBtn = document.createElement("button");
  proceedBtn.type = "button";
  proceedBtn.className =
    "sk-button sk-button--primary sk-button--small sk-button--neutral";
  proceedBtn.textContent = "Save choices";

  const refreshWrapViews = () => {
    uploadWrap.style.display = wrapValue === "upload" ? "block" : "none";
    aiWrap.style.display = wrapValue === "ai" ? "block" : "none";
  };
  wrapFieldset.querySelectorAll('input[name="wrrapd-lego-wrap"]').forEach((el) => {
    el.addEventListener("change", () => {
      if (!el.checked) return;
      wrapValue = el.value;
      refreshWrapViews();
    });
  });
  refreshWrapViews();

  const tearDown = () => {
    window.removeEventListener("keydown", onKey);
    overlay.remove();
  };

  const onKey = (e) => {
    if (e.key === "Escape") {
      writeGiftRadio("no");
      clearLegoGiftServiceFlags();
      const y = document.querySelector('input[name="wrrapd-lego-gift"][value="yes"]');
      const n = document.querySelector('input[name="wrrapd-lego-gift"][value="no"]');
      if (y) y.checked = false;
      if (n) n.checked = true;
      tearDown();
      applyCheckoutSecurelyGate();
    }
  };

  cancelBtn.addEventListener("click", () => {
    writeGiftRadio("no");
    clearLegoGiftServiceFlags();
    const y = document.querySelector('input[name="wrrapd-lego-gift"][value="yes"]');
    const n = document.querySelector('input[name="wrrapd-lego-gift"][value="no"]');
    if (y) y.checked = false;
    if (n) n.checked = true;
    tearDown();
    applyCheckoutSecurelyGate();
  });

  proceedBtn.addEventListener("click", async () => {
    const gifterName = senderInput.value.trim();
    const gifteeName = gifteeInput.value.trim();
    if (!gifterName) {
      alert("Please enter the gifter's name (the person sending the gift).");
      senderInput.focus();
      return;
    }
    if (!gifteeName) {
      alert("Please enter the giftee's name (the person who will receive the wrapped gift).");
      gifteeInput.focus();
      return;
    }
    const estimateZip = readLegoEstimateZip();
    if (!estimateZip) {
      alert("Please enter a ZIP code in LEGO's tax & delivery ZIP field first, then save your Wrrapd choices.");
      return;
    }
    let allowed = [];
    try {
      allowed = await loadAllowedZipCodes();
    } catch {
      allowed = [];
    }
    const zipAllowed = Array.isArray(allowed) && allowed.includes(estimateZip);
    if (!zipAllowed) {
      writeGiftRadio("no");
      clearLegoGiftServiceFlags();
      const y = document.querySelector('input[name="wrrapd-lego-gift"][value="yes"]');
      const n = document.querySelector('input[name="wrrapd-lego-gift"][value="no"]');
      if (y) y.checked = false;
      if (n) n.checked = true;
      alert(
        "Sorry — we currently cannot deliver to that ZIP code yet. We are actively adding more ZIP codes, so please check back soon.",
      );
      tearDown();
      applyCheckoutSecurelyGate();
      return;
    }
    try {
      sessionStorage.setItem(LEGO_GIFT_OCCASION_KEY, occasionInput.value.trim());
      sessionStorage.setItem(LEGO_GIFT_MESSAGE_KEY, msgInput.value.trim());
      sessionStorage.setItem(LEGO_GIFT_SENDER_NAME_KEY, gifterName);
      sessionStorage.setItem(LEGO_GIFT_GIFTEE_NAME_KEY, gifteeName);
      sessionStorage.setItem("wrrapdLegoValidatedEstimateZip", estimateZip);
      sessionStorage.setItem(LEGO_GIFT_WRAP_PREF_KEY, wrapValue);
      sessionStorage.setItem(
        LEGO_GIFT_FLOWERS_INTEREST_KEY,
        flowersCb.checked ? "1" : "0",
      );
      sessionStorage.setItem(LEGO_GIFT_SELECTED_FLOWER_KEY, selectedFlowerDesign || "");
      if (selectedAiDesign) {
        sessionStorage.setItem(LEGO_GIFT_AI_DESIGN_KEY, JSON.stringify(selectedAiDesign));
      } else {
        sessionStorage.removeItem(LEGO_GIFT_AI_DESIGN_KEY);
      }
      if (uploadedDesignName) {
        sessionStorage.setItem(LEGO_GIFT_UPLOAD_NAME_KEY, uploadedDesignName);
      } else {
        sessionStorage.removeItem(LEGO_GIFT_UPLOAD_NAME_KEY);
      }
      if (uploadedDesignDataUrl) {
        sessionStorage.setItem(LEGO_GIFT_UPLOAD_DATA_URL_KEY, uploadedDesignDataUrl);
      } else {
        sessionStorage.removeItem(LEGO_GIFT_UPLOAD_DATA_URL_KEY);
      }
    } catch {
      /* ignore */
    }
    writeGiftChoicesSaved(true);
    tearDown();
    openLegoTermsModal(() => applyCheckoutSecurelyGate());
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cancelBtn.click();
  });
  window.addEventListener("keydown", onKey);

  row.append(cancelBtn, proceedBtn);
  panel.append(
    title,
    intro,
    wrapLegend,
    wrapFieldset,
    uploadWrap,
    aiWrap,
    flowersLabel,
    flowersGrid,
    senderLabel,
    senderInput,
    gifteeLabel,
    gifteeInput,
    msgLabel,
    msgInput,
    row,
  );
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  proceedBtn.focus();
}

function findShippingStepHeadline() {
  const main =
    document.getElementById("main-content") ||
    document.querySelector("main[role='main']") ||
    document.querySelector("main");
  if (!main) return null;
  for (const el of main.querySelectorAll("h1, h2, h3")) {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (/^1[\s.)-]*shipping\b/i.test(t)) return el;
  }
  const payBtn = [...main.querySelectorAll("button")].find((b) =>
    /^continue to payment$/i.test((b.textContent || "").replace(/\s+/g, " ").trim()),
  );
  if (payBtn) {
    let n = payBtn;
    for (let i = 0; i < 12 && n; i += 1) {
      const prev = n.previousElementSibling;
      if (prev) {
        const h = prev.querySelector?.("h1, h2, h3") || (prev.matches?.("h1,h2,h3") ? prev : null);
        if (h) return h;
      }
      n = n.parentElement;
    }
  }
  return null;
}

function mountCartGiftOptIn() {
  if (existingCartOptIn()) return;
  const btn = findCheckoutSecurelyButton();
  if (!btn?.parentElement) return;

  const wrap = document.createElement("div");
  wrap.setAttribute(LEGO_GIFT_CART_OPTIN_DATA_ATTR, "1");
  wrap.style.cssText = [
    "box-sizing:border-box",
    "width:100%",
    "margin:0 0 var(--ds-spacing-sm, 0.75rem) 0",
    "padding:var(--ds-spacing-sm, 0.75rem)",
    "background-color:var(--ds-color-layer-neutral-default, #fff)",
    "border-radius:var(--ds-border-radius-md, 0.5rem)",
    "border:1px solid var(--ds-color-border-subdued, #e2e8f0)",
  ].join(";");

  const hook = document.createElement("h2");
  hook.className = "ds-heading-xs ds-color-text-default";
  hook.style.margin = "0 0 var(--ds-spacing-2xs, 0.375rem) 0";
  hook.textContent = "Would you like us to gift-wrap it for you?";

  const sub = document.createElement("p");
  sub.className = "ds-body-sm-regular ds-color-text-default";
  sub.style.margin = "0 0 var(--ds-spacing-sm, 0.75rem) 0";
  sub.style.fontSize = "15px";
  sub.style.color = "#334155";
  sub.textContent =
    "It’s entirely optional. If you’d rather not decide yet, you can still check out on LEGO.com as usual—we’ll offer this again on the next step.";

  const fieldset = document.createElement("fieldset");
  fieldset.style.cssText = "border:none;padding:0;margin:0;";
  const leg = document.createElement("legend");
  leg.className = "ds-label-sm-medium ds-color-text-default";
  leg.style.cssText = "padding:0;margin:0 0 6px 0;display:block;";
  leg.textContent = "Your choice";

  const mkRow = (value, labelText) => {
    const lab = document.createElement("label");
    lab.className = "ds-color-text-default";
    lab.style.cssText =
      "display:flex;align-items:flex-start;gap:var(--ds-spacing-2xs, 0.375rem);cursor:pointer;margin-bottom:8px;color:var(--ds-color-text-default, #111827);font-size:14px;line-height:1.45;";
    const inp = document.createElement("input");
    inp.type = "radio";
    inp.name = "wrrapd-lego-gift";
    inp.value = value;
    inp.style.cssText = "margin-top:2px;flex:0 0 auto;";
    const text = document.createElement("span");
    text.style.cssText =
      "display:block;flex:1;min-width:0;color:var(--ds-color-text-default, #111827);";
    text.textContent = labelText;
    const stored = readGiftRadio();
    if (stored === value) inp.checked = true;
    inp.addEventListener("change", () => {
      if (!inp.checked) return;
      writeGiftRadio(value);
      if (value === "yes") {
        openLegoGiftServiceModal();
      } else {
        clearLegoGiftServiceFlags();
      }
      applyCheckoutSecurelyGate();
    });
    lab.append(inp, text);
    return lab;
  };

  fieldset.append(
    leg,
    mkRow(
      "yes",
      "Yes, get it gift-wrapped by Wrrapd",
    ),
    mkRow("no", "No, thank you — I’ll continue without Wrrapd gift wrap for now."),
  );

  wrap.append(hook, sub, fieldset);
  btn.parentElement.insertBefore(wrap, btn);
  applyCheckoutSecurelyGate();
}

function mountCheckoutStepZero() {
  if (existingCheckoutStep0()) return;
  if (readGiftRadio() === "yes") return;
  if (readStep0Dismissed()) return;

  const headline = findShippingStepHeadline();
  if (!headline?.parentElement) return;

  const section = document.createElement("section");
  section.setAttribute(LEGO_GIFT_CHECKOUT_STEP0_DATA_ATTR, "1");
  section.setAttribute("role", "region");
  section.setAttribute("aria-label", "Gift wrap with Wrrapd");
  section.style.cssText = [
    "box-sizing:border-box",
    "width:100%",
    "margin:0 0 var(--ds-spacing-md, 1rem) 0",
    "padding:var(--ds-spacing-sm, 0.75rem)",
    "background-color:var(--ds-color-layer-neutral-default, #fff)",
    "border-radius:var(--ds-border-radius-md, 0.5rem)",
    "box-shadow:var(--ds-shadow-deep-sm, 0 1px 3px rgba(0,0,0,.08))",
    "border-left:4px solid var(--ds-color-border-accent-default, #ff8e14)",
  ].join(";");

  const title = document.createElement("h2");
  title.className = "ds-heading-sm ds-color-text-default";
  title.style.margin = "0 0 var(--ds-spacing-2xs, 0.375rem) 0";
  title.textContent = "0. Would you like us to gift-wrap it for you?";

  const blurb = document.createElement("p");
  blurb.className = "ds-body-sm-regular ds-color-text-default";
  blurb.style.margin = "0 0 var(--ds-spacing-sm, 0.75rem) 0";
  blurb.style.fontSize = "15px";
  blurb.style.color = "#334155";
  blurb.textContent =
    "On My Bag you preferred to wait—here’s another chance to preview Wrrapd’s gentle gift-wrap and add-on options. Or continue with LEGO’s checkout as usual.";

  const row = document.createElement("div");
  row.style.cssText =
    "display:flex;flex-wrap:wrap;gap:var(--ds-spacing-2xs, 0.375rem);align-items:center;";

  const yes = document.createElement("button");
  yes.type = "button";
  yes.className =
    "sk-button sk-button--primary sk-button--small sk-button--neutral";
  yes.textContent = "Show me the options";

  const later = document.createElement("button");
  later.type = "button";
  later.className =
    "sk-button sk-button--secondary sk-button--small sk-button--neutral";
  later.textContent = "Not now";

  yes.addEventListener("click", () => {
    writeGiftRadio("yes");
    openLegoGiftServiceModal();
    section.remove();
  });
  later.addEventListener("click", () => {
    writeStep0Dismissed();
    section.remove();
  });

  row.append(yes, later);
  section.append(title, blurb, row);
  headline.parentElement.insertBefore(section, headline);
}

function tryMountGiftUpsell() {
  migrateLegacySession();
  const path = (window.location.pathname || "").toLowerCase();
  const isCart = path.includes("/cart");
  const isCheckout =
    path.includes("/checkout") || path.includes("/checkouts");

  if (isCart) {
    removeLegacyHubShipCard();
    mountCartGiftOptIn();
    applyCheckoutSecurelyGate();
    return;
  }

  if (isCheckout && !isLegoCheckoutReviewLikePage()) {
    mountCheckoutStepZero();
  }
  applyCheckoutSecurelyGate();
}

/**
 * Bag: soft Yes/No above Checkout Securely; Yes opens wrap/flowers/T&C then enables checkout.
 * Checkout: Step 0 only if guest declined on bag (or chose not to see options).
 */
export function initLegoGiftWrapUpsell() {
  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      tryMountGiftUpsell();
    });
  };

  tryMountGiftUpsell();
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", schedule);
}
