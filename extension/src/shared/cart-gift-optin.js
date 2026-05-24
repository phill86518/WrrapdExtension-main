import {
  clearGiftServiceFlags,
  readGiftChoicesSaved,
  readGiftRadio,
  readItemChoices,
  writeGiftChoicesSaved,
  writeGiftRadio,
  writeItemChoices,
} from "./cart-gift-session.js";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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

function findMountBeforeCheckout(config) {
  if (typeof config.findMountAnchor === "function") {
    const custom = config.findMountAnchor();
    if (custom?.parent) return custom;
  }

  const checkoutBtn =
    findButtonByText(config.checkoutButtonPatterns || [/^checkout$/i, /^proceed to checkout$/i]) ||
    document.querySelector(config.checkoutButtonSelector || "");

  if (checkoutBtn?.parentElement) {
    return { parent: checkoutBtn.parentElement, before: checkoutBtn };
  }

  const summary =
    document.querySelector(config.summarySelector || "") ||
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

function buildSavedBanner(config) {
  const choices = readItemChoices(config.sessionPrefix);
  const wrap = document.createElement("div");
  wrap.setAttribute(config.savedBannerAttr, "1");
  wrap.style.cssText =
    "margin:0 0 10px;padding:10px 12px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;font-size:13px;color:#065f46;";
  wrap.textContent =
    choices.length > 0
      ? `Wrrapd gift wrap saved for ${choices.length} item${choices.length === 1 ? "" : "s"}. Continue checkout when ready.`
      : "Wrrapd gift wrap preference saved. Continue checkout when ready.";
  return wrap;
}

function openGiftChoicesModal(config, cartSnapshot) {
  const existing = document.getElementById(config.modalId);
  if (existing) existing.remove();

  const items = (cartSnapshot?.items || []).map((it) => ({
    title: it.title || "Item",
    message: "",
  }));
  if (items.length === 0) {
    items.push({ title: `${config.retailerLabel} order`, message: "" });
  }

  const overlay = document.createElement("div");
  overlay.id = config.modalId;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Wrrapd gift wrap");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;";

  const panel = document.createElement("div");
  panel.style.cssText =
    "width:100%;max-width:480px;max-height:90vh;overflow:auto;background:#fff;border-radius:12px;padding:18px 16px;box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:Arial,sans-serif;";

  const title = document.createElement("h2");
  title.style.cssText = "margin:0 0 8px;font-size:18px;color:#111827;";
  title.textContent = "Gift wrap with Wrrapd";

  const intro = document.createElement("p");
  intro.style.cssText = "margin:0 0 12px;font-size:13px;line-height:1.45;color:#475569;";
  intro.textContent =
    config.modalIntro ||
    "Choose gift wrap for your order. You will complete Wrrapd payment during retailer checkout.";

  if (config.shippingTierHint) {
    const tier = document.createElement("p");
    tier.style.cssText = "margin:0 0 12px;font-size:12px;line-height:1.4;color:#64748b;";
    tier.textContent = config.shippingTierHint;
    panel.append(tier);
  }

  const list = document.createElement("div");
  list.style.cssText = "display:flex;flex-direction:column;gap:10px;margin:0 0 12px;";
  const messageInputs = [];

  for (const item of items) {
    const row = document.createElement("div");
    row.style.cssText = "border:1px solid #e2e8f0;border-radius:8px;padding:10px;";
    const name = document.createElement("div");
    name.style.cssText = "font-size:13px;font-weight:600;color:#111827;margin-bottom:6px;";
    name.textContent = item.title;
    const msgLabel = document.createElement("label");
    msgLabel.style.cssText = "display:block;font-size:12px;color:#64748b;margin-bottom:4px;";
    msgLabel.textContent = "Gift message (optional)";
    const msg = document.createElement("textarea");
    msg.rows = 2;
    msg.style.cssText = "width:100%;box-sizing:border-box;font-size:13px;padding:6px;border:1px solid #cbd5e1;border-radius:6px;resize:vertical;";
    msg.value = item.message || "";
    messageInputs.push({ title: item.title, msg });
    row.append(name, msgLabel, msg);
    list.append(row);
  }

  const zipLabel = document.createElement("label");
  zipLabel.style.cssText = "display:block;font-size:12px;color:#334155;margin-bottom:4px;";
  zipLabel.textContent = "Giftee ZIP (for delivery estimate)";
  const zip = document.createElement("input");
  zip.type = "text";
  zip.inputMode = "numeric";
  zip.maxLength = 10;
  zip.placeholder = "e.g. 32218";
  zip.style.cssText =
    "width:100%;box-sizing:border-box;font-size:14px;padding:8px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:14px;";

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.style.cssText =
    "padding:8px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer;font-size:13px;";

  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Save choices";
  save.style.cssText =
    "padding:8px 14px;border:none;background:#111827;color:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;";

  cancel.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  save.addEventListener("click", () => {
    const zipVal = zip.value.replace(/\D/g, "").slice(0, 5);
    if (zipVal.length < 5) {
      zip.style.borderColor = "#dc2626";
      zip.focus();
      return;
    }
    const saved = messageInputs.map(({ title: t, msg: m }) => ({
      title: t,
      message: m.value.trim(),
      wrapPref: "wrrapd",
    }));
    writeItemChoices(config.sessionPrefix, saved);
    writeGiftChoicesSaved(config.sessionPrefix, true);
    writeGiftRadio(config.sessionPrefix, "yes");
    try {
      sessionStorage.setItem(`${config.sessionPrefix}ValidatedEstimateZip`, zipVal);
    } catch {
      /* ignore */
    }
    overlay.remove();
    mountCartGiftOptIn(config, cartSnapshot);
  });

  actions.append(cancel, save);
  panel.append(title, intro, list, zipLabel, zip, actions);
  overlay.append(panel);
  document.body.append(overlay);
  zip.focus();
}

function mountCartGiftOptIn(config, cartSnapshot) {
  if (!config.isCartPage?.() && !config.isCheckoutPage?.()) return;
  if (existingOptIn(config)) return;

  const anchor = findMountBeforeCheckout(config);
  if (!anchor?.parent) return;

  const wrap = document.createElement("section");
  wrap.setAttribute(config.optInDataAttr, "1");
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", "Gift wrap with Wrrapd");
  wrap.style.cssText =
    "box-sizing:border-box;width:100%;margin:0 0 12px;padding:14px 16px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;border-left:4px solid #ff8e14;box-shadow:0 1px 3px rgba(0,0,0,.06);";

  const hook = document.createElement("h2");
  hook.style.cssText = "margin:0 0 4px;font-size:16px;font-weight:700;color:#111827;";
  hook.textContent = "Would you like us to gift-wrap your order?";

  const sub = document.createElement("p");
  sub.style.cssText = "margin:0 0 10px;font-size:13px;line-height:1.45;color:#475569;";
  sub.textContent =
    config.subtitle ||
    "Optional — choose below. You can always continue with the retailer's checkout without Wrrapd.";

  if (readGiftChoicesSaved(config.sessionPrefix)) {
    wrap.append(buildSavedBanner(config));
  }

  const fieldset = document.createElement("fieldset");
  fieldset.style.cssText = "border:none;padding:0;margin:0;";

  const mkRow = (value, labelText) => {
    const lab = document.createElement("label");
    lab.style.cssText =
      "display:flex;align-items:flex-start;gap:8px;cursor:pointer;margin-bottom:8px;font-size:14px;color:#111827;line-height:1.45;";
    const inp = document.createElement("input");
    inp.type = "radio";
    inp.name = `${config.sessionPrefix}-gift`;
    inp.value = value;
    inp.style.marginTop = "3px";
    const stored = readGiftRadio(config.sessionPrefix);
    if (stored === value && (value !== "yes" || readGiftChoicesSaved(config.sessionPrefix))) {
      inp.checked = true;
    }
    inp.addEventListener("click", () => {
      writeGiftRadio(config.sessionPrefix, value);
      if (value === "yes") {
        openGiftChoicesModal(config, cartSnapshot);
      } else {
        clearGiftServiceFlags(config.sessionPrefix);
        writeGiftRadio(config.sessionPrefix, "no");
        const saved = wrap.querySelector(`[${config.savedBannerAttr}]`);
        if (saved) saved.remove();
      }
    });
    const text = document.createElement("span");
    text.textContent = labelText;
    lab.append(inp, text);
    return lab;
  };

  fieldset.append(
    mkRow("yes", "Yes — gift-wrap with Wrrapd"),
    mkRow("no", "No thanks — continue without Wrrapd gift wrap"),
  );

  const edit = document.createElement("button");
  edit.type = "button";
  edit.textContent = "Edit gift wrap choices";
  edit.style.cssText =
    "margin-top:4px;padding:0;border:none;background:none;color:#0066c0;font-size:12px;cursor:pointer;text-decoration:underline;";
  edit.hidden = !readGiftChoicesSaved(config.sessionPrefix);
  edit.addEventListener("click", () => openGiftChoicesModal(config, cartSnapshot));

  wrap.append(hook, sub, fieldset, edit);
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
