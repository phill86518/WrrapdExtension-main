/**
 * Detect Amazon signed-in state for Wrrapd gating.
 *
 * On **cart / checkout / gp/buy** pages the full `#nav-link-accountList-nav-line-1` node is often
 * absent or hydrated late (SPA). Treating empty text as "signed out" blocked all Wrrapd UI and
 * caused teardown every 1s (removeLoadingScreen spam). Here we:
 * - Treat explicit **"Hello, sign in"** in the account nav block as signed **out**.
 * - Treat **"Hello, &lt;not sign in&gt;"** on line-1 as signed **in**.
 * - On cart/checkout/buy URLs, if we **do not** see an explicit sign-in greeting, default **in**
 *   (same browser tab already has the shopper’s session; we are not doing remote cookie checks).
 */

function readAmazonAccountNavLine1Text() {
  const byId = document.querySelector('#nav-link-accountList-nav-line-1');
  if (byId && (byId.textContent || '').trim()) return (byId.textContent || '').replace(/\s+/g, ' ').trim();
  const scope = document.querySelector('#nav-link-accountList');
  const inner = scope?.querySelector('span.nav-line-1.nav-progressive-content');
  if (inner && (inner.textContent || '').trim()) return (inner.textContent || '').replace(/\s+/g, ' ').trim();
  return '';
}

function readNavAccountListSnippet() {
  try {
    const el = document.querySelector('#nav-link-accountList');
    if (!el) return '';
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  } catch {
    return '';
  }
}

function wrrapdAmazonCartOrCheckoutPath() {
  try {
    const p = `${location.pathname}${location.search}`.toLowerCase();
    return (
      p.includes('/cart') ||
      p.includes('gp/cart') ||
      p.includes('/checkout/') ||
      p.includes('/gift') ||
      p.includes('/gp/buy/') ||
      (p.includes('handlers/display.html') && p.includes('gp/buy'))
    );
  } catch {
    return false;
  }
}

function textLooksLikeHelloSignIn(s) {
  return typeof s === 'string' && /\bhello\s*,\s*sign\s+in\b/i.test(s);
}

export function wrrapdIsAmazonAccountSignedIn() {
  const line1 = readAmazonAccountNavLine1Text();
  const accountSnippet = readNavAccountListSnippet();

  if (textLooksLikeHelloSignIn(line1) || textLooksLikeHelloSignIn(accountSnippet)) {
    return false;
  }

  if (/^hello\s*,/i.test(line1) && !textLooksLikeHelloSignIn(line1)) {
    return true;
  }

  /** Checkout pipeline: assume signed in unless we saw explicit "Hello, sign in" above. */
  if (wrrapdAmazonCartOrCheckoutPath()) {
    return true;
  }

  if (!line1) {
    return false;
  }

  const lower = line1.toLowerCase();
  if (lower.includes('sign in') && lower.includes('hello')) {
    return false;
  }
  if (/^hello\s*,/i.test(line1)) {
    return true;
  }
  return false;
}

if (typeof window !== 'undefined') {
  window.wrrapdIsAmazonAccountSignedIn = wrrapdIsAmazonAccountSignedIn;
}
