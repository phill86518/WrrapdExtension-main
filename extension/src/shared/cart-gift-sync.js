import {
  notifyGiftRadioChange,
  readGiftChoicesSaved,
  readGiftLegalTermsAccepted,
  readItemChoices,
  writeGiftChoicesSaved,
  writeGiftLegalTermsAccepted,
  writeItemChoices,
  writePaymentSuccess,
} from "./cart-gift-session.js";

export function normalizeCartTitle(title) {
  return String(title || "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Default per-item choice object for newly added cart lines. */
export function defaultEmptyChoice(title) {
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

/** Stable key for matching a cart line to a saved gift choice. */
export function cartLineKey(line, index) {
  const id = String(line?.itemId || line?.id || line?.sku || "").trim();
  if (id) return `id:${id}`;
  const title = normalizeCartTitle(line?.title);
  if (title) return `title:${title}`;
  return `idx:${index}`;
}

/** Fingerprint of cart lines (ids/titles/qty) — changes on add/remove/qty edits. */
export function buildCartFingerprint(cartSnapshot) {
  const items = Array.isArray(cartSnapshot?.items) ? cartSnapshot.items : [];
  if (items.length === 0) return "";
  return items
    .map((line, i) => {
      const q = Math.max(1, Number(line.quantity) || 1);
      return `${cartLineKey(line, i)}@q${q}`;
    })
    .join("||");
}

function fingerprintStorageKey(prefix) {
  return `${prefix}CartFingerprint`;
}

export function readCartFingerprint(prefix) {
  try {
    return sessionStorage.getItem(fingerprintStorageKey(prefix)) || "";
  } catch {
    return "";
  }
}

export function writeCartFingerprint(prefix, fingerprint) {
  try {
    const fp = String(fingerprint || "");
    if (!fp) sessionStorage.removeItem(fingerprintStorageKey(prefix));
    else sessionStorage.setItem(fingerprintStorageKey(prefix), fp);
  } catch {
    /* ignore */
  }
}

/**
 * Align saved per-item gift choices with the current cart lines.
 * @returns {{ next: Array, hadAdditions: boolean, hadRemovals: boolean, requiresReview: boolean }}
 */
export function reconcileChoicesToCartLines(prevChoices, cartLines, makeEmptyChoice) {
  const items = Array.isArray(cartLines) ? cartLines : [];
  const prev = Array.isArray(prevChoices) ? prevChoices : [];
  const used = new Set();
  let hadAdditions = false;
  const hadRemovals = items.length < prev.length;

  const next = items.map((line, i) => {
    const key = cartLineKey(line, i);
    let best = null;
    let bestIdx = -1;

    for (let j = 0; j < prev.length; j++) {
      if (used.has(j)) continue;
      const p = prev[j];
      if (cartLineKey({ itemId: p.itemId, title: p.title, sku: p.sku }, j) === key) {
        best = p;
        bestIdx = j;
        break;
      }
    }
    if (bestIdx < 0) {
      for (let j = 0; j < prev.length; j++) {
        if (used.has(j)) continue;
        if (normalizeCartTitle(prev[j].title) === normalizeCartTitle(line.title)) {
          best = prev[j];
          bestIdx = j;
          break;
        }
      }
    }

    if (bestIdx >= 0) {
      used.add(bestIdx);
      return {
        ...best,
        title: line.title || best.title,
        itemId: line.itemId || line.id || line.sku || best.itemId || "",
      };
    }

    hadAdditions = true;
    const empty = makeEmptyChoice(line.title || "Item");
    const id = line.itemId || line.id || line.sku;
    if (id) empty.itemId = String(id);
    return empty;
  });

  return {
    next,
    hadAdditions,
    hadRemovals,
    requiresReview: hadAdditions,
  };
}

export const WRRAPD_CART_SYNC_EVENT = "wrrapd-cart-sync";

export function notifyCartSyncChange(prefix, detail = {}) {
  try {
    window.dispatchEvent(
      new CustomEvent(WRRAPD_CART_SYNC_EVENT, {
        detail: { prefix: String(prefix || ""), ...detail },
      }),
    );
  } catch {
    /* ignore */
  }
}

/**
 * @param {object} session
 * @param {string} session.prefix
 * @param {() => Array} session.readChoices
 * @param {(arr: Array) => void} session.writeChoices
 * @param {() => string} session.readFingerprint
 * @param {(fp: string) => void} session.writeFingerprint
 * @param {() => void} [session.clearPayment]
 * @param {() => void} [session.invalidateSaved]
 * @param {() => boolean} [session.readWasComplete]
 */
export function syncGiftSessionWithCart(session, cartSnapshot, makeEmptyChoice) {
  const fingerprint = buildCartFingerprint(cartSnapshot);
  const prevFp = session.readFingerprint();

  if (fingerprint === prevFp) {
    return { changed: false, requiresReview: false, fingerprint };
  }

  const prev = session.readChoices();
  const { next, requiresReview, hadAdditions, hadRemovals } = reconcileChoicesToCartLines(
    prev,
    cartSnapshot?.items,
    makeEmptyChoice,
  );

  session.writeChoices(next);
  session.writeFingerprint(fingerprint);

  const wasComplete = session.readWasComplete?.() ?? false;
  if (prevFp && prevFp !== fingerprint) {
    session.clearPayment?.();
  }

  if (requiresReview && wasComplete) {
    session.invalidateSaved?.();
  }

  notifyCartSyncChange(session.prefix, { requiresReview, hadAdditions, hadRemovals, fingerprint });
  notifyGiftRadioChange(session.prefix);

  return { changed: true, requiresReview, fingerprint, hadAdditions, hadRemovals };
}

/** Session adapter for shared retailers (uses cart-gift-session keys). */
export function createSharedGiftSessionAdapter(prefix) {
  return {
    prefix,
    readChoices: () => readItemChoices(prefix),
    writeChoices: (arr) => writeItemChoices(prefix, arr),
    readFingerprint: () => readCartFingerprint(prefix),
    writeFingerprint: (fp) => writeCartFingerprint(prefix, fp),
    clearPayment: () => writePaymentSuccess(prefix, false),
    invalidateSaved: () => {
      writeGiftChoicesSaved(prefix, false);
      writeGiftLegalTermsAccepted(prefix, false);
    },
    readWasComplete: () => readGiftChoicesSaved(prefix) && readGiftLegalTermsAccepted(prefix),
  };
}
