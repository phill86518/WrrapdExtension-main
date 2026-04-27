import {
  LEGO_GIFT_CHOICES_SAVED_KEY,
  LEGO_GIFT_FLOWERS_INTEREST_KEY,
  LEGO_GIFT_GIFTEE_NAME_KEY,
  LEGO_GIFT_RADIO_SESSION_KEY,
  LEGO_GIFT_TC_SESSION_KEY,
  LEGO_GIFT_WRAP_PREF_KEY,
  LEGO_HUB_SHIP_ACCEPTED_KEY,
  LEGO_PAYMENT_SUCCESS_SESSION_KEY,
} from "./constants.js";

export function readGiftRadio() {
  try {
    return sessionStorage.getItem(LEGO_GIFT_RADIO_SESSION_KEY) || "";
  } catch {
    return "";
  }
}

export function writeGiftRadio(v) {
  try {
    if (!v) sessionStorage.removeItem(LEGO_GIFT_RADIO_SESSION_KEY);
    else sessionStorage.setItem(LEGO_GIFT_RADIO_SESSION_KEY, v);
  } catch {
    /* ignore */
  }
}

/** Gift modal choices saved (ZIP-validated), before legal T&C. */
export function readGiftChoicesSaved() {
  try {
    return sessionStorage.getItem(LEGO_GIFT_CHOICES_SAVED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeGiftChoicesSaved(on) {
  try {
    if (on) sessionStorage.setItem(LEGO_GIFT_CHOICES_SAVED_KEY, "1");
    else sessionStorage.removeItem(LEGO_GIFT_CHOICES_SAVED_KEY);
  } catch {
    /* ignore */
  }
}

/** Legal Wrrapd terms for LEGO gift path (scroll + “here”). */
export function readGiftLegalTermsAccepted() {
  try {
    return sessionStorage.getItem(LEGO_GIFT_TC_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeGiftLegalTermsAccepted(on) {
  try {
    if (on) sessionStorage.setItem(LEGO_GIFT_TC_SESSION_KEY, "1");
    else sessionStorage.removeItem(LEGO_GIFT_TC_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function readHubShipAccepted() {
  try {
    return sessionStorage.getItem(LEGO_HUB_SHIP_ACCEPTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeHubShipAccepted(on) {
  try {
    if (on) sessionStorage.setItem(LEGO_HUB_SHIP_ACCEPTED_KEY, "1");
    else sessionStorage.removeItem(LEGO_HUB_SHIP_ACCEPTED_KEY);
  } catch {
    /* ignore */
  }
}

export function readLegoPaymentSuccess() {
  try {
    return sessionStorage.getItem(LEGO_PAYMENT_SUCCESS_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeLegoPaymentSuccess(on) {
  try {
    if (on) sessionStorage.setItem(LEGO_PAYMENT_SUCCESS_SESSION_KEY, "1");
    else sessionStorage.removeItem(LEGO_PAYMENT_SUCCESS_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Clears Wrrapd-specific flags when guest opts out of the gift path. */
export function clearLegoGiftServiceFlags() {
  writeGiftLegalTermsAccepted(false);
  writeGiftChoicesSaved(false);
  writeHubShipAccepted(false);
  writeLegoPaymentSuccess(false);
  try {
    sessionStorage.removeItem(LEGO_GIFT_WRAP_PREF_KEY);
    sessionStorage.removeItem(LEGO_GIFT_FLOWERS_INTEREST_KEY);
    sessionStorage.removeItem(LEGO_GIFT_GIFTEE_NAME_KEY);
  } catch {
    /* ignore */
  }
}
