/** @param {string} prefix e.g. wrrapdKohls */
export function giftRadioKey(prefix) {
  return `${prefix}GiftRadio`;
}

export function giftChoicesSavedKey(prefix) {
  return `${prefix}GiftChoicesSaved`;
}

export function itemChoicesKey(prefix) {
  return `${prefix}ItemChoices`;
}

export function readGiftRadio(prefix) {
  try {
    return sessionStorage.getItem(giftRadioKey(prefix)) || "";
  } catch {
    return "";
  }
}

export function writeGiftRadio(prefix, value) {
  try {
    if (!value) sessionStorage.removeItem(giftRadioKey(prefix));
    else sessionStorage.setItem(giftRadioKey(prefix), value);
  } catch {
    /* ignore */
  }
}

export function readGiftChoicesSaved(prefix) {
  try {
    return sessionStorage.getItem(giftChoicesSavedKey(prefix)) === "1";
  } catch {
    return false;
  }
}

export function writeGiftChoicesSaved(prefix, on) {
  try {
    if (on) sessionStorage.setItem(giftChoicesSavedKey(prefix), "1");
    else sessionStorage.removeItem(giftChoicesSavedKey(prefix));
  } catch {
    /* ignore */
  }
}

/** @returns {Array<{ title: string, message?: string }>} */
export function readItemChoices(prefix) {
  try {
    const raw = sessionStorage.getItem(itemChoicesKey(prefix));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** @param {Array<{ title: string, message?: string }>} arr */
export function writeItemChoices(prefix, arr) {
  try {
    sessionStorage.setItem(itemChoicesKey(prefix), JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

export function clearGiftServiceFlags(prefix) {
  writeGiftChoicesSaved(prefix, false);
  try {
    sessionStorage.removeItem(itemChoicesKey(prefix));
  } catch {
    /* ignore */
  }
}
