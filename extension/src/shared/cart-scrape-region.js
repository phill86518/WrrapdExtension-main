// Shared guard used by every retailer cart scraper to avoid counting non-cart products
// (recommendation carousels, "you may also like", sponsored tiles, recently-viewed) and
// footer/nav links as gift-wrappable cart items.

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const EXCLUDED_REGION_RE =
  /recommend|carousel|you[-_ ]?may|also[-_ ]?(like|bought|viewed)|recently[-_ ]?viewed|sponsored|trending|upsell|cross[-_ ]?sell|you[-_ ]?might|related[-_ ]?(item|product|carousel|content)/;
const EXCLUDED_HEADING_RE =
  /you may (also )?like|recommend|recently viewed|trending|you might|customers also|related (items|products)|sponsored|inspired by|complete the look|wear it with/;

/**
 * True when an element sits inside a region that is NOT the real cart/bag line list —
 * e.g. recommendation carousels, sponsored tiles, or the page footer/nav. Walks up the
 * ancestor chain (bounded) and matches on semantic tags/roles, telltale class/id/testid
 * tokens, and recommendation-style section headings.
 *
 * @param {Element | null} el
 * @returns {boolean}
 */
export function isExcludedScrapeRegion(el) {
  let node = el;
  let depth = 0;
  while (node && node.nodeType === 1 && depth < 25) {
    const tag = node.tagName;
    if (tag === "FOOTER" || tag === "NAV" || tag === "HEADER") return true;
    const role = (node.getAttribute("role") || "").toLowerCase();
    if (role === "contentinfo" || role === "navigation" || role === "banner") return true;
    const hay = [
      node.id || "",
      node.getAttribute("class") || "",
      node.getAttribute("data-testid") || "",
      node.getAttribute("data-test") || "",
      node.getAttribute("data-track") || "",
      node.getAttribute("data-automation-id") || "",
      node.getAttribute("data-comp") || "",
      node.getAttribute("aria-label") || "",
    ]
      .join(" ")
      .toLowerCase();
    if (EXCLUDED_REGION_RE.test(hay)) return true;
    if (tag === "SECTION" || tag === "ASIDE" || role === "region" || role === "complementary") {
      const heading = node.querySelector("h1,h2,h3,h4");
      const htext = heading ? normalizeWhitespace(heading.textContent || "").toLowerCase() : "";
      if (htext && EXCLUDED_HEADING_RE.test(htext)) return true;
    }
    node = node.parentElement;
    depth++;
  }
  return false;
}
