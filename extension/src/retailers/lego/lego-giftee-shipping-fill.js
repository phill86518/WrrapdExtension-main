import {
  LEGO_GIFT_GIFTEE_NAME_KEY,
  LEGO_GIFTEE_FORM_FILLED_DATA_ATTR,
} from "./constants.js";
import {
  readGiftChoicesSaved,
  readGiftLegalTermsAccepted,
  readGiftRadio,
  readLegoGifteeAddress,
} from "./lego-session-state.js";

function gifteeZip5() {
  try {
    return String(sessionStorage.getItem("wrrapdLegoValidatedEstimateZip") || "")
      .replace(/\D/g, "")
      .slice(0, 5);
  } catch {
    return "";
  }
}

function resolveGifteeAddress() {
  const stored = readLegoGifteeAddress();
  if (stored && String(stored.name || "").trim()) return stored;

  let name = "";
  try {
    name = sessionStorage.getItem(LEGO_GIFT_GIFTEE_NAME_KEY) || "";
  } catch {
    /* ignore */
  }
  const zip = gifteeZip5();
  if (!name.trim() && !zip) return null;

  return {
    name: name.trim() || "Giftee",
    street: "",
    city: "",
    state: "",
    postalCode: zip,
    country: "United States",
    phone: "",
  };
}

function splitName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function setNativeInputValue(input, value) {
  if (!input || value == null) return;
  const str = String(value);
  const proto = Object.getPrototypeOf(input);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  const setter = desc && desc.set;
  if (setter) setter.call(input, str);
  else input.value = str;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("blur", { bubbles: true }));
}

function setSelectValue(select, value) {
  if (!select || value == null || value === "") return;
  const str = String(value).trim().toUpperCase();
  const option = [...select.options].find(
    (o) => String(o.value).toUpperCase() === str,
  );
  if (!option) return;
  select.value = option.value;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  select.dispatchEvent(new Event("blur", { bubbles: true }));
}

function shouldAutofillGifteeShipping() {
  if (readGiftRadio() !== "yes") return false;
  if (!readGiftChoicesSaved() || !readGiftLegalTermsAccepted()) return false;
  return Boolean(document.getElementById("address-form"));
}

function addressExpectsStreet(addr) {
  return Boolean(String(addr?.street || "").trim());
}

/** True when session has a full giftee address but LEGO fields are still empty. */
function formMissingRequiredFields(addr) {
  if (!addr) return false;
  const lastName =
    String(addr.lastName || "").trim() || splitName(addr.name).lastName;
  const lastEl = document.getElementById("lastName");
  if (lastName && lastEl && !lastEl.value.trim()) return true;

  if (!addressExpectsStreet(addr)) return false;

  const line1El = document.getElementById("addressLine1");
  const cityEl = document.getElementById("city");
  if (line1El && !line1El.value.trim()) return true;
  if (cityEl && String(addr.city || "").trim() && !cityEl.value.trim()) return true;
  return false;
}

function formNeedsFill(form, addr) {
  if (!form) return false;
  if (form.getAttribute(LEGO_GIFTEE_FORM_FILLED_DATA_ATTR) === "1") {
    if (formMissingRequiredFields(addr)) {
      form.removeAttribute(LEGO_GIFTEE_FORM_FILLED_DATA_ATTR);
      return true;
    }
    return false;
  }
  return true;
}

function applyGifteeFields(form, addr) {
  const firstName =
    String(addr.firstName || "").trim() || splitName(addr.name).firstName;
  const lastName =
    String(addr.lastName || "").trim() || splitName(addr.name).lastName;
  const street = String(addr.street || "").trim();
  const line2 = String(addr.line2 || "").trim();

  const firstEl = document.getElementById("firstName");
  const lastEl = document.getElementById("lastName");
  if (firstEl && firstName) setNativeInputValue(firstEl, firstName);
  if (lastEl && lastName) setNativeInputValue(lastEl, lastName);

  const phoneEl = document.getElementById("phone");
  if (phoneEl && addr.phone && !phoneEl.value.trim()) {
    setNativeInputValue(phoneEl, addr.phone);
  }

  const emailEl = document.getElementById("email");
  if (emailEl && emailEl.value.trim()) {
    /* LEGO account email — do not overwrite */
  }

  const line1El = document.getElementById("addressLine1");
  if (line1El && street) setNativeInputValue(line1El, street);

  const line2El = document.getElementById("addressLine2");
  if (line2El && line2) setNativeInputValue(line2El, line2);

  const cityEl = document.getElementById("city");
  if (cityEl && addr.city) setNativeInputValue(cityEl, addr.city);

  const stateEl = document.querySelector('#address-form select[name="state"]');
  if (stateEl && addr.state) setSelectValue(stateEl, addr.state);

  const zipEl = document.getElementById("postalCode");
  if (zipEl && addr.postalCode) {
    setNativeInputValue(zipEl, String(addr.postalCode).replace(/\D/g, "").slice(0, 10));
  }

  if (!formMissingRequiredFields(addr)) {
    form.setAttribute(LEGO_GIFTEE_FORM_FILLED_DATA_ATTR, "1");
  }
}

function tryApplyLegoGifteeShippingFields() {
  if (!shouldAutofillGifteeShipping()) return;

  const form = document.getElementById("address-form");
  if (!form) return;

  const addr = resolveGifteeAddress();
  if (!addr) return;
  if (!formNeedsFill(form, addr)) return;

  applyGifteeFields(form, addr);
}

/** Call after pay.wrrapd.com stores the full giftee address in session. */
export function refreshLegoGifteeShippingAddressFill() {
  const form = document.getElementById("address-form");
  if (form) form.removeAttribute(LEGO_GIFTEE_FORM_FILLED_DATA_ATTR);
  tryApplyLegoGifteeShippingFields();
  for (const ms of [150, 500, 1200, 2500]) {
    setTimeout(tryApplyLegoGifteeShippingFields, ms);
  }
}

export function initLegoGifteeShippingAddressFill() {
  if (!location.hostname.includes("lego.com")) return;

  tryApplyLegoGifteeShippingFields();

  const observer = new MutationObserver(() => {
    tryApplyLegoGifteeShippingFields();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("popstate", () => {
    setTimeout(tryApplyLegoGifteeShippingFields, 300);
  });

  window.addEventListener("wrrapd-lego-giftee-address-updated", () => {
    refreshLegoGifteeShippingAddressFill();
  });
}
