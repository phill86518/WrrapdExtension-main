/**
 * Shared giftee ZIP estimate UI for gift-choice modals.
 * Validates against the delivery allowlist, stores the ZIP in sessionStorage,
 * and refreshes unit prices via pricing-preview.
 */
import {
  isPostalCodeAllowed,
  loadAllowedZipCodes,
  normalizePostal5,
} from "../content/lib/zip-codes.js";
import {
  createUnitPricingState,
  ensureUnitPrices,
  getActiveUnitPrices,
} from "./wrrapd-unit-pricing.js";

const OUT_OF_AREA_MSG =
  "We're sorry — we can't deliver to that ZIP yet. We're constantly adding new areas and hope to be near you soon.";

export function validatedEstimateZipKey(sessionPrefix) {
  return `${sessionPrefix}ValidatedEstimateZip`;
}

export function readValidatedEstimateZip(sessionPrefix) {
  try {
    return normalizePostal5(sessionStorage.getItem(validatedEstimateZipKey(sessionPrefix)) || "");
  } catch {
    return "";
  }
}

export function writeValidatedEstimateZip(sessionPrefix, zip) {
  const z = normalizePostal5(zip);
  try {
    if (z.length === 5) sessionStorage.setItem(validatedEstimateZipKey(sessionPrefix), z);
    else sessionStorage.removeItem(validatedEstimateZipKey(sessionPrefix));
  } catch {
    /* ignore */
  }
  return z;
}

/**
 * Mount the top-of-modal ZIP row.
 * @param {object} opts
 * @param {HTMLElement} opts.parent
 * @param {string} opts.sessionPrefix
 * @param {string} [opts.retailerLabel]
 * @param {HTMLElement|HTMLElement[]} [opts.gatedContent] - hidden until ZIP is allowed
 * @param {(prices: object, zip: string) => void} [opts.onPricesReady]
 * @param {() => void} [opts.onZipCleared]
 * @param {(zip: string) => void} [opts.onZipAllowed]
 * @param {() => void} [opts.onZipDenied]
 * @returns {{ root: HTMLElement, getZip: () => string, requireValidZip: () => boolean, isReady: () => boolean }}
 */
export function mountGifteeZipEstimateBar(opts) {
  const {
    parent,
    sessionPrefix,
    retailerLabel = "",
    gatedContent = null,
    onPricesReady,
    onZipCleared,
    onZipAllowed,
    onZipDenied,
    insertBefore = null,
  } = opts;

  const pricingState = createUnitPricingState();
  let currentZip = readValidatedEstimateZip(sessionPrefix);
  let ready = false;

  const gatedNodes = []
    .concat(gatedContent || [])
    .filter((n) => n && n.nodeType === 1);

  const setGatedVisible = (visible) => {
    for (const node of gatedNodes) {
      node.style.display = visible ? "" : "none";
      node.setAttribute("aria-hidden", visible ? "false" : "true");
    }
  };

  const root = document.createElement("div");
  root.setAttribute("data-wrrapd-giftee-zip-bar", "1");
  root.style.cssText =
    "margin:0 0 14px;padding:14px;background:#fff;border:2px solid #cbd5e1;border-radius:10px;box-sizing:border-box;";

  const label = document.createElement("label");
  label.style.cssText = "display:block;font-size:14px;font-weight:700;color:#0f172a;margin:0 0 6px;";
  label.textContent = "Giftee / gift-recipient's zip code:";

  const hint = document.createElement("p");
  hint.style.cssText = "margin:0 0 10px;font-size:13px;line-height:1.4;color:#64748b;";
  hint.textContent = "This helps us with a faster checkout!";

  const row = document.createElement("div");
  row.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;";

  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "postal-code";
  input.maxLength = 10;
  input.placeholder = "e.g. 32226";
  input.value = currentZip;
  input.style.cssText =
    "width:8rem;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;font-weight:600;";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Get prices";
  btn.style.cssText =
    "padding:8px 14px;border:none;border-radius:8px;background:#ff8e14;color:#fff;font-size:13px;font-weight:700;cursor:pointer;";

  const status = document.createElement("div");
  status.style.cssText = "margin-top:8px;font-size:13px;line-height:1.45;color:#b91c1c;display:none;";

  const setStatus = (text, kind = "err") => {
    if (!text) {
      status.textContent = "";
      status.style.display = "none";
      return;
    }
    status.textContent = text;
    status.style.display = "block";
    status.style.color = kind === "err" ? "#b91c1c" : "#475569";
  };

  const clearReady = () => {
    ready = false;
    currentZip = "";
    writeValidatedEstimateZip(sessionPrefix, "");
    setGatedVisible(false);
    onZipCleared?.();
    onZipDenied?.();
  };

  const applyPrices = async (zip) => {
    await ensureUnitPrices(pricingState, { postalCode: zip, country: "US" }, retailerLabel);
    const prices = getActiveUnitPrices(pricingState);
    onPricesReady?.(prices, zip);
    setStatus("");
    ready = true;
    setGatedVisible(true);
    onZipAllowed?.(zip);
  };

  const submitZip = async () => {
    const zip = normalizePostal5(input.value);
    input.value = zip;
    if (zip.length !== 5) {
      clearReady();
      setStatus("Please enter a valid 5-digit ZIP code.");
      input.style.borderColor = "#dc2626";
      return false;
    }
    btn.disabled = true;
    btn.textContent = "Checking…";
    setStatus("");
    try {
      await loadAllowedZipCodes({ force: true });
      const allowed = await isPostalCodeAllowed(zip);
      if (!allowed) {
        clearReady();
        setStatus(OUT_OF_AREA_MSG);
        input.style.borderColor = "#dc2626";
        return false;
      }
      currentZip = writeValidatedEstimateZip(sessionPrefix, zip);
      input.style.borderColor = "#6ee7b7";
      await applyPrices(currentZip);
      return true;
    } catch {
      clearReady();
      setStatus("We couldn't verify that ZIP right now. Please try again.");
      return false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Get prices";
    }
  };

  input.addEventListener("input", () => {
    input.style.borderColor = "#cbd5e1";
    const next = normalizePostal5(input.value);
    if (next !== currentZip && ready) {
      clearReady();
      setStatus("");
    }
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submitZip();
    }
  });
  btn.addEventListener("click", () => void submitZip());

  row.append(input, btn);
  root.append(label, hint, row, status);

  if (insertBefore && insertBefore.parentElement === parent) {
    parent.insertBefore(root, insertBefore);
  } else {
    parent.insertBefore(root, parent.firstChild);
  }

  setGatedVisible(false);

  if (currentZip.length === 5) {
    void (async () => {
      await loadAllowedZipCodes();
      if (await isPostalCodeAllowed(currentZip)) {
        input.style.borderColor = "#6ee7b7";
        await applyPrices(currentZip);
      } else {
        clearReady();
        input.value = "";
        setStatus(OUT_OF_AREA_MSG);
      }
    })();
  }

  return {
    root,
    getZip: () => currentZip || readValidatedEstimateZip(sessionPrefix),
    isReady: () => ready && (currentZip || readValidatedEstimateZip(sessionPrefix)).length === 5,
    requireValidZip: () => {
      if (ready && (currentZip || readValidatedEstimateZip(sessionPrefix)).length === 5) return true;
      setStatus("Please enter the giftee ZIP and click Get prices.");
      input.focus();
      input.style.borderColor = "#dc2626";
      setGatedVisible(false);
      return false;
    },
    submitZip,
  };
}
