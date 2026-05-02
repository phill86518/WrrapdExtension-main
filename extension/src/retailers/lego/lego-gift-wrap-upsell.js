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
  LEGO_GIFT_STEP0_DISMISSED_KEY,
  LEGO_GIFT_TC_SESSION_KEY,
  LEGO_GIFT_UPLOAD_DATA_URL_KEY,
  LEGO_GIFT_UPLOAD_NAME_KEY,
  LEGO_GIFT_WRAP_PREF_KEY,
  LEGO_HUB_SHIP_HINT_DATA_ATTR,
} from "./constants.js";
import { applyCheckoutSecurelyGate, openLegoTermsModal } from "./lego-checkout-pay-flow.js";
import { readLegoCartSnapshot, snapshotLegoCartToSession } from "./lego-cart-extract.js";
import { isLegoCheckoutReviewLikePage } from "./lego-checkout-review-detect.js";
import {
  clearLegoGiftServiceFlags,
  readGiftChoicesSaved,
  readGiftLegalTermsAccepted,
  readGiftRadio,
  readLegoItemChoices,
  readLegoPaymentSuccess,
  writeGiftChoicesSaved,
  writeGiftRadio,
  writeLegoItemChoices,
} from "./lego-session-state.js";
import { loadAllowedZipCodes } from "../../content/lib/zip-codes.js";

const FLOW_MODAL_ID = "wrrapd-lego-gift-service-modal";
const LEGO_BAG_PAY_HINT_ATTR = "data-wrrapd-lego-bag-pay-hint";

// ─── Session helpers ──────────────────────────────────────────────────────────

function readStep0Dismissed() {
  try { return sessionStorage.getItem(LEGO_GIFT_STEP0_DISMISSED_KEY) === "1"; } catch { return false; }
}
function writeStep0Dismissed() {
  try { sessionStorage.setItem(LEGO_GIFT_STEP0_DISMISSED_KEY, "1"); } catch { /* ignore */ }
}
function readLegoEstimateZip() {
  const cands = [
    'input[placeholder*="ZIP" i]', 'input[aria-label*="ZIP" i]',
    'input[name*="zip" i]', 'input[id*="zip" i]',
  ];
  for (const sel of cands) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const m = String(el.value || "").match(/\b(\d{5})(?:-\d{4})?\b/);
    if (m) return m[1];
  }
  return "";
}
function gifteeZip5() {
  try { return sessionStorage.getItem("wrrapdLegoValidatedEstimateZip") || ""; } catch { return ""; }
}

// ─── Per-item default choice ──────────────────────────────────────────────────

function emptyChoice() {
  return { wrapPref: "wrrapd", uploadName: "", uploadDataUrl: "", aiPrompt: "", aiDesign: null, flowers: false, flowerDesign: "", message: "" };
}

// ─── Migrate legacy single-value keys into per-item array ────────────────────

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
  } catch { /* ignore */ }
}

// ─── Cart opt-in UI helpers ───────────────────────────────────────────────────

function existingCartOptIn() { return document.querySelector(`[${LEGO_GIFT_CART_OPTIN_DATA_ATTR}]`); }
function existingCheckoutStep0() { return document.querySelector(`[${LEGO_GIFT_CHECKOUT_STEP0_DATA_ATTR}]`); }
function removeLegacyHubShipCard() {
  document.querySelectorAll(`[${LEGO_HUB_SHIP_HINT_DATA_ATTR}]`).forEach((el) => el.remove());
}
function findCheckoutSecurelyButton() {
  return (
    document.querySelector('[data-test="checkout-securely-button-desktop"]') ||
    document.querySelector('[data-test="checkout-securely-button-mobile"]') ||
    document.querySelector('[data-test="checkout-securely-button"]') ||
    [...document.querySelectorAll("button")].find((b) =>
      /checkout securely/i.test((b.textContent || "").trim()),
    ) || null
  );
}

// ─── Pay-reminder strip on cart ───────────────────────────────────────────────

function syncLegoBagPayReminder() {
  const card = document.querySelector(`[${LEGO_GIFT_CART_OPTIN_DATA_ATTR}]`);
  if (!card?.parentElement) return;
  const show = readGiftRadio() === "yes" && readGiftChoicesSaved() && readGiftLegalTermsAccepted() && !readLegoPaymentSuccess();
  const existing = document.querySelector(`[${LEGO_BAG_PAY_HINT_ATTR}]`);
  if (!show) { if (existing) existing.remove(); return; }
  if (existing) return;
  const hint = document.createElement("div");
  hint.setAttribute(LEGO_BAG_PAY_HINT_ATTR, "1");
  hint.setAttribute("role", "status");
  hint.style.cssText = "box-sizing:border-box;width:100%;margin:0 0 0.75rem 0;padding:12px 14px;background:linear-gradient(180deg,#fffbeb,#fff7ed);border:1px solid #fbbf24;border-radius:0.5rem;";
  const t = document.createElement("p");
  t.style.cssText = "margin:0 0 6px;font-size:15px;color:#78350f;font-weight:600;";
  t.textContent = "Complete Wrrapd payment to continue";
  const p = document.createElement("p");
  p.style.cssText = "margin:0 0 8px;font-size:14px;color:#92400e;";
  p.textContent = "Your gift-wrap choices are saved. Click Checkout Securely, accept hub shipping, then use Pay Wrrapd in the payment summary.";
  const go = document.createElement("button");
  go.type = "button";
  go.className = "sk-button sk-button--primary sk-button--small sk-button--neutral";
  go.textContent = "Scroll to checkout";
  go.addEventListener("click", () => {
    const b = findCheckoutSecurelyButton();
    if (b) b.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  hint.append(t, p, go);
  card.parentElement.insertBefore(hint, card);
}

// ─── Yes flow: snapshot → modal ───────────────────────────────────────────────

function startLegoGiftYesFlow() {
  snapshotLegoCartToSession();
  openLegoGiftServiceModal();
}

// ─── Per-item gift wizard modal ───────────────────────────────────────────────

export function openLegoGiftServiceModal() {
  if (document.getElementById(FLOW_MODAL_ID)) return;

  const cartLines = readLegoCartSnapshot();
  const lines = cartLines.length > 0 ? cartLines : [{ id: "LEGO", sku: "", title: "LEGO.com order", imageUrl: "" }];
  const totalItems = lines.length;

  // Load/init per-item choices array
  let allChoices = readLegoItemChoices();
  while (allChoices.length < totalItems) allChoices.push(emptyChoice());

  let currentIdx = 0;

  // Overlay
  const overlay = document.createElement("div");
  overlay.id = FLOW_MODAL_ID;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "wrrapd-lego-flow-title");
  overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(15,23,42,0.55);box-sizing:border-box;";

  // Panel
  const panel = document.createElement("div");
  panel.style.cssText = "max-width:44rem;width:100%;max-height:90vh;overflow-y:auto;box-sizing:border-box;padding:16px 18px 14px;border-radius:10px;background:#fff;border:2px solid #f5cf00;box-shadow:0 12px 32px rgba(0,0,0,.22);font-size:14px;line-height:1.5;color:#0f172a;";

  // Title — "Item X of Y — Gift wrap with Wrrapd"
  const titleEl = document.createElement("h2");
  titleEl.id = "wrrapd-lego-flow-title";
  titleEl.style.cssText = "margin:0 0 10px;font-size:16px;font-weight:700;color:#0f172a;";

  // One-time notice about all-items rule (shown at top every render but can't be missed)
  const notice = document.createElement("div");
  notice.style.cssText = "margin:0 0 10px;padding:8px 10px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:13px;color:#78350f;";
  notice.innerHTML = "<strong>Note:</strong> LEGO.com ships all items in one order to <em>one</em> address. Every item in your bag will be sent to the Wrrapd hub for wrapping — there is no split-address delivery on LEGO.com.";

  // Item preview
  const itemPreview = document.createElement("div");
  itemPreview.style.cssText = "display:flex;align-items:center;gap:12px;margin:0 0 12px;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;";
  const previewImg = document.createElement("img");
  previewImg.style.cssText = "width:64px;height:64px;object-fit:contain;border-radius:4px;border:1px solid #e2e8f0;flex:0 0 64px;background:#fff;";
  const previewInfo = document.createElement("div");
  previewInfo.style.cssText = "min-width:0;flex:1;";
  const previewTitle = document.createElement("div");
  previewTitle.style.cssText = "font-weight:600;font-size:14px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
  const previewSku = document.createElement("div");
  previewSku.style.cssText = "font-size:12px;color:#64748b;margin-top:2px;";
  previewInfo.append(previewTitle, previewSku);
  itemPreview.append(previewImg, previewInfo);

  // ── Wrap style ──
  const wrapLegend = document.createElement("p");
  wrapLegend.style.cssText = "margin:0 0 4px;font-size:13px;font-weight:600;color:#0f172a;";
  wrapLegend.textContent = "Wrapping paper";
  const wrapFieldset = document.createElement("div");
  wrapFieldset.style.cssText = "margin:0 0 10px;";
  const wrapChoices = [
    { value: "wrrapd", label: "Allow Wrrapd to choose the design" },
    { value: "upload", label: "Upload my own design" },
    { value: "ai",     label: "Generate a design with AI" },
  ];
  // Refs for current item's wrap state
  let currentWrapPref = "wrrapd";
  let currentUploadName = "";
  let currentUploadDataUrl = "";
  let currentAiPrompt = "";
  let currentAiDesign = null;
  let currentWrrapdHint = "";

  // Hint field shown when "Allow Wrrapd to choose" is selected
  const wrrapdHintWrap = document.createElement("div");
  wrrapdHintWrap.style.cssText = "display:flex;align-items:center;gap:6px;margin:2px 0 6px 22px;";
  const wrrapdHintInput = document.createElement("input");
  wrrapdHintInput.type = "text";
  wrrapdHintInput.placeholder = "Occasion or other details (optional)";
  wrrapdHintInput.style.cssText = "flex:1;padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;color:#0f172a;";
  wrrapdHintInput.addEventListener("input", () => { currentWrrapdHint = wrrapdHintInput.value; });
  wrrapdHintWrap.appendChild(wrrapdHintInput);

  const wrapRadios = wrapChoices.map(({ value, label }) => {
    const lbl = document.createElement("label");
    lbl.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:4px;font-size:14px;color:#0f172a;";
    const inp = document.createElement("input");
    inp.type = "radio"; inp.name = "wrrapd-lego-wrap"; inp.value = value;
    inp.addEventListener("change", () => {
      if (inp.checked) {
        currentWrapPref = value;
        refreshWrapSubs();
      }
    });
    lbl.append(inp, document.createTextNode(label));
    wrapFieldset.appendChild(lbl);
    // Insert hint field directly after the "wrrapd" option row
    if (value === "wrrapd") wrapFieldset.appendChild(wrrapdHintWrap);
    return inp;
  });

  // Upload sub-panel
  const uploadWrap = document.createElement("div");
  uploadWrap.style.cssText = "display:none;margin:4px 0 8px 22px;padding:8px;border:1px solid #e2e8f0;border-radius:6px;";
  const uploadInput = document.createElement("input");
  uploadInput.type = "file"; uploadInput.accept = "image/*";
  uploadInput.style.cssText = "display:block;margin-bottom:6px;font-size:13px;";
  const uploadPreview = document.createElement("div"); uploadPreview.style.display = "none";
  const uploadImg = document.createElement("img");
  uploadImg.style.cssText = "max-width:100%;max-height:120px;border:1px solid #ddd;border-radius:4px;";
  uploadPreview.appendChild(uploadImg);
  uploadInput.addEventListener("change", () => {
    const f = uploadInput.files && uploadInput.files[0];
    if (!f) return;
    currentUploadName = f.name;
    const fr = new FileReader();
    fr.onload = () => {
      currentUploadDataUrl = typeof fr.result === "string" ? fr.result : "";
      if (currentUploadDataUrl) { uploadImg.src = currentUploadDataUrl; uploadPreview.style.display = "block"; }
    };
    fr.readAsDataURL(f);
  });
  uploadWrap.append(uploadInput, uploadPreview);

  // AI sub-panel
  const aiWrap = document.createElement("div");
  aiWrap.style.cssText = "display:none;margin:4px 0 8px 22px;padding:8px;border:1px solid #e2e8f0;border-radius:6px;";
  const aiHint = document.createElement("div");
  aiHint.style.cssText = "font-size:13px;color:#334155;margin-bottom:6px;";
  aiHint.textContent = "Describe the occasion, recipient, or theme for AI-generated design ideas:";
  const aiInput = document.createElement("input");
  aiInput.type = "text";
  aiInput.placeholder = "e.g., Birthday for my 10-year-old who loves space, Mother's Day elegant florals…";
  aiInput.style.cssText = "width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;font-size:13px;margin-bottom:6px;";
  aiInput.addEventListener("input", () => { currentAiPrompt = aiInput.value; });
  const aiGenBtn = document.createElement("button");
  aiGenBtn.type = "button";
  aiGenBtn.className = "sk-button sk-button--secondary sk-button--small sk-button--neutral";
  aiGenBtn.textContent = "Generate ideas";
  const aiResults = document.createElement("div");
  aiResults.style.cssText = "display:grid;gap:6px;margin-top:8px;";
  const renderAiResults = (items) => {
    aiResults.innerHTML = "";
    if (!Array.isArray(items) || !items.length) return;
    items.slice(0, 4).forEach((it) => {
      const ttl = String(it?.title || "AI Design");
      const desc = String(it?.description || "");
      const lbl = document.createElement("label");
      lbl.style.cssText = "display:flex;gap:6px;align-items:flex-start;border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px;cursor:pointer;font-size:13px;";
      const r = document.createElement("input");
      r.type = "radio"; r.name = "wrrapd-lego-ai-choice";
      if (currentAiDesign && currentAiDesign.title === ttl) r.checked = true;
      r.addEventListener("change", () => { if (r.checked) currentAiDesign = { title: ttl, description: desc }; });
      const body = document.createElement("div");
      body.innerHTML = `<div style="font-weight:600;color:#0f172a">${ttl}</div><div style="color:#334155;line-height:1.35">${desc}</div>`;
      lbl.append(r, body);
      aiResults.append(lbl);
    });
  };
  aiGenBtn.addEventListener("click", async () => {
    const prompt = aiInput.value.trim();
    if (!prompt) { aiInput.focus(); return; }
    currentAiPrompt = prompt;
    aiGenBtn.disabled = true; aiGenBtn.textContent = "Generating…";
    try {
      const resp = await fetch("https://api.wrrapd.com/generate-ideas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occasion: prompt }),
      });
      const data = await resp.json();
      renderAiResults(Array.isArray(data?.ideas) ? data.ideas : []);
    } catch {
      aiResults.innerHTML = "<div style='color:#b91c1c;font-size:13px'>Could not generate ideas — please try again.</div>";
    } finally {
      aiGenBtn.disabled = false; aiGenBtn.textContent = "Generate ideas";
    }
  });
  aiWrap.append(aiHint, aiInput, aiGenBtn, aiResults);

  const refreshWrapSubs = () => {
    wrrapdHintWrap.style.display = currentWrapPref === "wrrapd" ? "flex" : "none";
    uploadWrap.style.display = currentWrapPref === "upload" ? "block" : "none";
    aiWrap.style.display = currentWrapPref === "ai" ? "block" : "none";
  };

  // ── Flowers ──
  let currentFlowers = false;
  let currentFlowerDesign = "";
  const flowersLabel = document.createElement("label");
  flowersLabel.style.cssText = "display:flex;align-items:center;gap:6px;margin:0 0 4px;font-size:14px;font-weight:600;color:#0f172a;cursor:pointer;";
  const flowersCb = document.createElement("input");
  flowersCb.type = "checkbox";
  const flowersText = document.createElement("span");
  flowersText.textContent = "Add Flowers – 15–20 stem bouquet";
  flowersLabel.append(flowersCb, flowersText);
  const flowersGrid = document.createElement("div");
  flowersGrid.style.cssText = "display:none;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:4px 0 10px 22px;";
  const flowerRadios = [1, 2, 3, 4].map((n) => {
    const lab = document.createElement("label");
    lab.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;font-size:12px;color:#0f172a;";
    const r = document.createElement("input");
    r.type = "radio"; r.name = "wrrapd-lego-flower-design"; r.value = `flowers-${n}`;
    r.addEventListener("change", () => { if (r.checked) currentFlowerDesign = r.value; });
    const img = document.createElement("img");
    img.src = chrome.runtime.getURL(`assets/flowers/flowers-${n}.webp`);
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

  // ── Gift message (single row) ──
  const msgRow = document.createElement("div");
  msgRow.style.cssText = "display:flex;align-items:center;gap:8px;margin:8px 0 0;";
  const msgLabel = document.createElement("label");
  msgLabel.style.cssText = "flex:0 0 auto;font-size:13px;font-weight:600;color:#0f172a;white-space:nowrap;";
  msgLabel.textContent = "Gift message:";
  const msgInput = document.createElement("input");
  msgInput.type = "text";
  msgInput.placeholder = "Optional short message for the recipient";
  msgInput.style.cssText = "flex:1;padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;";

  // ── Buttons ──
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "sk-button sk-button--secondary sk-button--small sk-button--neutral";
  cancelBtn.textContent = "Cancel";
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "sk-button sk-button--secondary sk-button--small sk-button--neutral";
  backBtn.textContent = "← Back";
  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "sk-button sk-button--primary sk-button--small sk-button--neutral";
  nextBtn.textContent = "Next →";

  // ── Assemble panel ──
  msgRow.append(msgLabel, msgInput);
  panel.append(
    titleEl,
    notice,
    itemPreview,
    wrapLegend,
    wrapFieldset,
    uploadWrap,
    aiWrap,
    flowersLabel,
    flowersGrid,
    msgRow,
    btnRow,
  );
  overlay.appendChild(panel);

  // ── Render item at index ──
  function renderItem(idx) {
    const line = lines[idx];
    const ch = allChoices[idx];

    titleEl.textContent = totalItems > 1
      ? `Item ${idx + 1} of ${totalItems} — Gift wrap with Wrrapd`
      : "Gift wrap with Wrrapd";

    // Item preview
    if (line.imageUrl) {
      previewImg.src = line.imageUrl; previewImg.style.display = "block";
    } else {
      previewImg.style.display = "none";
    }
    previewTitle.textContent = line.title || "LEGO product";
    previewSku.textContent = line.sku ? `SKU: ${line.sku}` : "";

    // Restore wrap pref
    currentWrapPref = ch.wrapPref || "wrrapd";
    currentUploadName = ch.uploadName || "";
    currentUploadDataUrl = ch.uploadDataUrl || "";
    currentAiPrompt = ch.aiPrompt || "";
    currentAiDesign = ch.aiDesign || null;
    currentWrrapdHint = ch.wrrapdHint || "";
    wrrapdHintInput.value = currentWrrapdHint;
    wrapRadios.forEach((r) => { r.checked = r.value === currentWrapPref; });

    // Restore upload preview
    if (currentUploadDataUrl) {
      uploadImg.src = currentUploadDataUrl; uploadPreview.style.display = "block";
    } else {
      uploadPreview.style.display = "none";
    }
    uploadInput.value = "";

    // Restore AI
    aiInput.value = currentAiPrompt;
    aiResults.innerHTML = "";
    if (currentAiDesign) {
      renderAiResults([currentAiDesign]);
    }

    refreshWrapSubs();

    // Restore flowers
    currentFlowers = ch.flowers || false;
    currentFlowerDesign = ch.flowerDesign || "";
    flowersCb.checked = currentFlowers;
    flowersGrid.style.display = currentFlowers ? "grid" : "none";
    flowerRadios.forEach((r) => { r.checked = r.value === currentFlowerDesign; });

    // Restore message
    msgInput.value = ch.message || "";

    // Back button visibility
    backBtn.style.display = idx > 0 ? "" : "none";
    nextBtn.textContent = idx < totalItems - 1 ? "Next →" : "Save choices";
  }

  function captureCurrentChoices() {
    allChoices[currentIdx] = {
      wrapPref: currentWrapPref,
      wrrapdHint: currentWrrapdHint,
      uploadName: currentUploadName,
      uploadDataUrl: currentUploadDataUrl,
      aiPrompt: currentAiPrompt,
      aiDesign: currentAiDesign,
      flowers: currentFlowers,
      flowerDesign: currentFlowerDesign,
      message: msgInput.value.trim(),
    };
  }

  const tearDown = () => {
    window.removeEventListener("keydown", onKey);
    overlay.remove();
  };

  const onKey = (e) => {
    if (e.key === "Escape") {
      captureCurrentChoices();
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

  backBtn.addEventListener("click", () => {
    captureCurrentChoices();
    currentIdx--;
    renderItem(currentIdx);
  });

  nextBtn.addEventListener("click", async () => {
    captureCurrentChoices();

    if (currentIdx < totalItems - 1) {
      currentIdx++;
      renderItem(currentIdx);
      panel.scrollTop = 0;
      return;
    }

    // Last item — validate ZIP and save
    const estimateZip = readLegoEstimateZip();
    if (!estimateZip) {
      alert("Please enter a ZIP code in LEGO's tax & delivery ZIP field first, then save your Wrrapd choices.");
      return;
    }
    let allowed = [];
    try { allowed = await loadAllowedZipCodes(); } catch { allowed = []; }
    if (!(Array.isArray(allowed) && allowed.includes(estimateZip))) {
      writeGiftRadio("no");
      clearLegoGiftServiceFlags();
      const y = document.querySelector('input[name="wrrapd-lego-gift"][value="yes"]');
      const n = document.querySelector('input[name="wrrapd-lego-gift"][value="no"]');
      if (y) y.checked = false;
      if (n) n.checked = true;
      alert("Sorry — we currently cannot deliver to that ZIP code yet. We are actively adding more ZIP codes, so please check back soon.");
      tearDown();
      applyCheckoutSecurelyGate();
      return;
    }

    try { sessionStorage.setItem("wrrapdLegoValidatedEstimateZip", estimateZip); } catch { /* ignore */ }

    writeLegoItemChoices(allChoices);
    writeGiftChoicesSaved(true);
    tearDown();
    openLegoTermsModal(() => applyCheckoutSecurelyGate());
  });

  overlay.addEventListener("click", (e) => { if (e.target === overlay) cancelBtn.click(); });
  window.addEventListener("keydown", onKey);

  btnRow.append(cancelBtn, backBtn, nextBtn);
  renderItem(0);
  document.body.appendChild(overlay);
  nextBtn.focus();
}

// ─── Bag cart opt-in ──────────────────────────────────────────────────────────

function mountCartGiftOptIn() {
  if (existingCartOptIn()) return;
  const btn = findCheckoutSecurelyButton();
  if (!btn?.parentElement) return;

  const wrap = document.createElement("div");
  wrap.setAttribute(LEGO_GIFT_CART_OPTIN_DATA_ATTR, "1");
  wrap.style.cssText = [
    "box-sizing:border-box", "width:100%",
    "margin:0 0 0.75rem 0", "padding:12px 14px",
    "background-color:var(--ds-color-layer-neutral-default,#fff)",
    "border-radius:0.5rem",
    "border:1px solid var(--ds-color-border-subdued,#e2e8f0)",
  ].join(";");

  const hook = document.createElement("h2");
  hook.className = "ds-heading-xs ds-color-text-default";
  hook.style.margin = "0 0 4px 0";
  hook.textContent = "Would you like us to gift-wrap your order?";

  const sub = document.createElement("p");
  sub.style.cssText = "margin:0 0 10px;font-size:14px;color:#334155;";
  sub.textContent = "Entirely optional — choose below. If you prefer to decide later, continue through LEGO's checkout as usual.";

  const fieldset = document.createElement("fieldset");
  fieldset.style.cssText = "border:none;padding:0;margin:0;";
  const leg = document.createElement("legend");
  leg.className = "ds-label-sm-medium ds-color-text-default";
  leg.style.cssText = "padding:0;margin:0 0 6px 0;display:block;font-size:13px;";
  leg.textContent = "Your choice";

  const mkRow = (value, labelText) => {
    const lab = document.createElement("label");
    lab.style.cssText = "display:flex;align-items:flex-start;gap:6px;cursor:pointer;margin-bottom:6px;font-size:14px;color:#111827;line-height:1.45;";
    const inp = document.createElement("input");
    inp.type = "radio"; inp.name = "wrrapd-lego-gift"; inp.value = value;
    inp.style.cssText = "margin-top:2px;flex:0 0 auto;";
    const text = document.createElement("span");
    text.textContent = labelText;

    // Pre-check only when choices are already saved (completed flow)
    const stored = readGiftRadio();
    if (stored === value && (value !== "yes" || readGiftChoicesSaved())) {
      inp.checked = true;
    }

    // Click handler: always fires even when already checked
    inp.addEventListener("click", () => {
      writeGiftRadio(value);
      if (value === "yes") {
        startLegoGiftYesFlow();
      } else {
        clearLegoGiftServiceFlags();
        applyCheckoutSecurelyGate();
      }
    });
    lab.append(inp, text);
    return lab;
  };

  fieldset.append(
    leg,
    mkRow("yes", "Yes — gift-wrap my items with Wrrapd"),
    mkRow("no", "No, thank you — I'll continue without Wrrapd gift wrap."),
  );

  wrap.append(hook, sub, fieldset);
  btn.parentElement.insertBefore(wrap, btn);
  applyCheckoutSecurelyGate();
}

// ─── Checkout step-0 prompt ───────────────────────────────────────────────────

function findShippingStepHeadline() {
  const main = document.getElementById("main-content") || document.querySelector("main[role='main']") || document.querySelector("main");
  if (!main) return null;
  for (const el of main.querySelectorAll("h1, h2, h3")) {
    if (/^1[\s.)-]*shipping\b/i.test((el.textContent || "").replace(/\s+/g, " ").trim())) return el;
  }
  const payBtn = [...main.querySelectorAll("button")].find((b) =>
    /^continue to payment$/i.test((b.textContent || "").replace(/\s+/g, " ").trim()),
  );
  if (payBtn) {
    let n = payBtn;
    for (let i = 0; i < 12 && n; i++) {
      const prev = n.previousElementSibling;
      if (prev) {
        const h = prev.querySelector?.("h1,h2,h3") || (prev.matches?.("h1,h2,h3") ? prev : null);
        if (h) return h;
      }
      n = n.parentElement;
    }
  }
  return null;
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
    "box-sizing:border-box", "width:100%",
    "margin:0 0 1rem 0", "padding:12px 14px",
    "background-color:var(--ds-color-layer-neutral-default,#fff)",
    "border-radius:0.5rem",
    "box-shadow:0 1px 3px rgba(0,0,0,.08)",
    "border-left:4px solid var(--ds-color-border-accent-default,#ff8e14)",
  ].join(";");

  const title = document.createElement("h2");
  title.className = "ds-heading-sm ds-color-text-default";
  title.style.margin = "0 0 4px 0";
  title.textContent = "Gift-wrap your LEGO order with Wrrapd?";

  const blurb = document.createElement("p");
  blurb.style.cssText = "margin:0 0 10px;font-size:14px;color:#334155;";
  blurb.textContent = "You chose to wait on My Bag — here's another chance. Choose gift-wrap options or continue with LEGO checkout as normal.";

  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";

  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "sk-button sk-button--primary sk-button--small sk-button--neutral";
  yes.textContent = "Show me the options";

  const later = document.createElement("button");
  later.type = "button";
  later.className = "sk-button sk-button--secondary sk-button--small sk-button--neutral";
  later.textContent = "Not now";

  yes.addEventListener("click", () => {
    writeGiftRadio("yes");
    startLegoGiftYesFlow();
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

// ─── Main mount ───────────────────────────────────────────────────────────────

function tryMountGiftUpsell() {
  migrateLegacySession();
  const path = (window.location.pathname || "").toLowerCase();
  const isCart = path.includes("/cart");
  const isCheckout = path.includes("/checkout") || path.includes("/checkouts");

  if (isCart) {
    snapshotLegoCartToSession();
    removeLegacyHubShipCard();
    mountCartGiftOptIn();
    syncLegoBagPayReminder();
    applyCheckoutSecurelyGate();
    return;
  }
  if (isCheckout && !isLegoCheckoutReviewLikePage()) {
    mountCheckoutStepZero();
  }
  applyCheckoutSecurelyGate();
}

export function initLegoGiftWrapUpsell() {
  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => { raf = 0; tryMountGiftUpsell(); });
  };

  window.addEventListener("wrrapd-lego-payment-updated", () => {
    syncLegoBagPayReminder();
    applyCheckoutSecurelyGate();
  });

  tryMountGiftUpsell();
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", schedule);
}
