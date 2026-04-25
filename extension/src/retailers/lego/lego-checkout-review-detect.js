/**
 * Heuristic for LEGO checkout steps that show the final total and ship-to summary
 * (after shipping / billing), including pre-submit review and some post-submit pages.
 */
export function isLegoCheckoutReviewLikePage(doc = document) {
  const path = (window.location.pathname || "").toLowerCase();
  if (!path.includes("/checkout") && !path.includes("/checkouts")) return false;
  if (
    /review|order-review|confirm|summary|submit|thank|success|receipt|complete/i.test(
      path,
    )
  ) {
    return true;
  }
  return docHasFinalSubmitCta(doc);
}

function docHasFinalSubmitCta(doc) {
  for (const el of doc.querySelectorAll("button, [role='button']")) {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (
      /^place (your )?order$/i.test(t) ||
      /^submit order$/i.test(t) ||
      /^complete (your )?order$/i.test(t)
    ) {
      return true;
    }
  }
  return false;
}
