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
  formatUsd,
  getActiveUnitPrices,
} from "./wrrapd-unit-pricing.js";

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
 * @param {HTMLElement} opts.parent - insert at start of panel
 * @param {string} opts.sessionPrefix
 * @param {string} [opts.retailerLabel]
 * @param {(prices: object, zip: string) => void} opts.onPricesReady
 * @param {() => void} [opts.onZipCleared]
 * @returns {{ root: HTMLElement, getZip: () => string, requireValidZip: () => boolean }}
 */
export function mountGifteeZipEstimateBar(opts) {
  const {
    parent,
    sessionPrefix,
    retailerLabel = "",
    onPricesReady,
    onZipCleared,
    insertBefore = null,
  } = opts;

  const pricingState = createUnitPricingState();
  let currentZip = readValidatedEstimateZip(sessionPrefix);

  const root = document.createElement("div");
  root.setAttribute("data-wrrapd-giftee-zip-bar", "1");
  root.style.cssText =
    "margin:0 0 14px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;";

  const label = document.createElement("label");
  label.style.cssText = "display:block;font-size:13px;font-weight:700;color:#0f172a;margin:0 0 6px;";
  label.textContent = "Giftee ZIP code*";

  const hint = document.createElement("p");
  hint.style.cssText = "margin:0 0 8px;font-size:12px;line-height:1.4;color:#64748b;";
  hint.textContent =
    "Enter the recipient’s delivery ZIP first so we can show the correct gift-wrap and flower prices for that area.";

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
  status.style.cssText = "margin-top:8px;font-size:12px;line-height:1.45;color:#475569;min-height:1.2em;";

  const setStatus = (text, kind = "info") => {
    status.textContent = text || "";
    if (kind === "ok") status.style.color = "#065f46";
    else if (kind === "err") status.style.color = "#b91c1c";
    else status.style.color = "#475569";
  };

  const applyPrices = async (zip) => {
    await ensureUnitPrices(
      pricingState,
      { postalCode: zip, country: "US" },
      retailerLabel,
    );
    const prices = getActiveUnitPrices(pricingState);
    onPricesReady?.(prices, zip);
    setStatus(
      `Delivery available for ${zip}. Gift wrap ${formatUsd(prices.giftWrapBase)} · Flowers ${formatUsd(prices.flowers)}`,
      "ok",
    );
  };

  const submitZip = async () => {
    const zip = normalizePostal5(input.value);
    input.value = zip;
    if (zip.length !== 5) {
      currentZip = "";
      writeValidatedEstimateZip(sessionPrefix, "");
      onZipCleared?.();
      setStatus("Enter a valid 5-digit ZIP code.", "err");
      input.style.borderColor = "#dc2626";
      return false;
    }
    btn.disabled = true;
    btn.textContent = "Checking…";
    setStatus("Checking delivery area and prices…");
    try {
      await loadAllowedZipCodes({ force: true });
      const allowed = await isPostalCodeAllowed(zip);
      if (!allowed) {
        currentZip = "";
        writeValidatedEstimateZip(sessionPrefix, "");
        onZipCleared?.();
        setStatus(
          `ZIP ${zip} is outside Wrrapd’s delivery area. Please use a Florida or Georgia ZIP (or another allowed ZIP), or place this order without Wrrapd.`,
          "err",
        );
        input.style.borderColor = "#dc2626";
        return false;
      }
      currentZip = writeValidatedEstimateZip(sessionPrefix, zip);
      input.style.borderColor = "#6ee7b7";
      await applyPrices(currentZip);
      return true;
    } catch (e) {
      setStatus("Could not verify ZIP right now. Check your connection and try again.", "err");
      return false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Get prices";
    }
  };

  input.addEventListener("input", () => {
    input.style.borderColor = "#cbd5e1";
    const next = normalizePostal5(input.value);
    if (next !== currentZip) {
      // ZIP changed — prices are stale until they click Get prices again.
      if (currentZip) {
        currentZip = "";
        writeValidatedEstimateZip(sessionPrefix, "");
        onZipCleared?.();
        setStatus("ZIP changed — click Get prices to refresh.", "info");
      }
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

  // If we already have a stored ZIP, auto-refresh prices on open.
  if (currentZip.length === 5) {
    void (async () => {
      await loadAllowedZipCodes();
      if (await isPostalCodeAllowed(currentZip)) {
        input.style.borderColor = "#6ee7b7";
        await applyPrices(currentZip);
      } else {
        currentZip = "";
        writeValidatedEstimateZip(sessionPrefix, "");
        input.value = "";
        setStatus("Previous ZIP is no longer in the delivery area. Enter a new ZIP.", "err");
      }
    })();
  } else {
    setStatus("Enter the giftee ZIP and click Get prices to unlock accurate option prices.");
    // Still show fallback prices immediately so UI isn't blank.
    onPricesReady?.(getActiveUnitPrices(pricingState), "");
  }

  return {
    root,
    getZip: () => currentZip || readValidatedEstimateZip(sessionPrefix),
    requireValidZip: () => {
      const z = currentZip || readValidatedEstimateZip(sessionPrefix);
      if (z.length === 5) return true;
      setStatus("Enter and confirm the giftee ZIP (Get prices) before saving choices.", "err");
      input.focus();
      input.style.borderColor = "#dc2626";
      return false;
    },
    submitZip,
  };
}
