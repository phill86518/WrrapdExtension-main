/**
 * Match Wrrapd order-summary styling to Amazon's layout.
 */

function findAmazonOrderSummaryForAlignment() {
  const direct =
    document.querySelector('#spc-order-summary') ||
    document.querySelector('[data-testid="checkout-order-summary"]') ||
    document.querySelector('[data-testid="order-summary"]') ||
    document.querySelector('[data-feature-id*="order-summary"]') ||
    document.querySelector('.spc-order-summary');

  if (direct && direct.id !== 'wrrapd-summary') {
    return direct;
  }

  const right = document.querySelector('#checkout-experience-right-column');
  if (right) {
    const nested =
      right.querySelector('#spc-order-summary') ||
      right.querySelector('[data-testid="checkout-order-summary"]') ||
      right.querySelector('[data-testid="order-summary"]') ||
      right.querySelector('[class*="order-summary"]');
    if (nested && nested.id !== 'wrrapd-summary') {
      return nested;
    }
  }

  const candidates = document.querySelectorAll('[id*="order"], [class*="order"]');
  for (const candidate of candidates) {
    if (candidate.id === 'wrrapd-summary') continue;
    const id = (candidate.id || '').toLowerCase();
    const classes = (candidate.className || '').toString().toLowerCase();
    if (
      (id.includes('summary') || classes.includes('summary')) &&
      (id.includes('spc') || classes.includes('spc') || id.includes('checkout'))
    ) {
      return candidate;
    }
  }

  return right || null;
}

export function ensureWrrapdSummaryAlignment() {
  console.log('[ensureWrrapdSummaryAlignment] Ensuring Wrrapd summary alignment with Amazon...');

  const wrrapdSummaryItems = document.querySelector('#wrrapd-summary-items');
  const wrrapdSummaryRoot = document.querySelector('#wrrapd-summary');
  if (!wrrapdSummaryItems) {
    console.warn('[ensureWrrapdSummaryAlignment] Wrrapd summary items container not found.');
    return;
  }

  const orderSummary = findAmazonOrderSummaryForAlignment();
  if (!orderSummary) {
    console.warn('[ensureWrrapdSummaryAlignment] Amazon order summary not found.');
    return;
  }

  // Prefer the same list Amazon uses for dollar lines (mobile + desktop).
  const amazonSubtotals =
    orderSummary.querySelector('#subtotals-marketplace-table') ||
    orderSummary.querySelector('table.fixed-left-grid') ||
    orderSummary.querySelector('ul');

  const firstLine =
    orderSummary.querySelector('#subtotals-marketplace-table li') ||
    orderSummary.querySelector('.order-summary-line') ||
    (amazonSubtotals ? amazonSubtotals.querySelector('li, tr') : null);

  if (amazonSubtotals) {
    const itemsComputed = window.getComputedStyle(amazonSubtotals);
    wrrapdSummaryItems.style.paddingLeft = itemsComputed.paddingLeft;
    wrrapdSummaryItems.style.paddingRight = itemsComputed.paddingRight;
    if (itemsComputed.marginLeft && itemsComputed.marginLeft !== '0px') {
      wrrapdSummaryItems.style.marginLeft = itemsComputed.marginLeft;
    }
    if (itemsComputed.marginRight && itemsComputed.marginRight !== '0px') {
      wrrapdSummaryItems.style.marginRight = itemsComputed.marginRight;
    }
    console.log(
      '[ensureWrrapdSummaryAlignment] Applied Amazon subtotals container styles to Wrrapd summary items.'
    );
  }

  const totalEl = document.querySelector('#wrrapd-summary-total');
  if (totalEl && amazonSubtotals) {
    const tc = window.getComputedStyle(amazonSubtotals);
    totalEl.style.paddingLeft = tc.paddingLeft;
    totalEl.style.paddingRight = tc.paddingRight;
    totalEl.style.marginLeft = tc.marginLeft || '0';
    totalEl.style.marginRight = tc.marginRight || '0';
    totalEl.style.boxSizing = 'border-box';
  }

  // Match the Wrrapd card outer box to Amazon's primary summary box padding when possible.
  if (wrrapdSummaryRoot) {
    wrrapdSummaryRoot.style.width = '100%';
    wrrapdSummaryRoot.style.maxWidth = '100%';
    wrrapdSummaryRoot.style.boxSizing = 'border-box';
    const amazonBox =
      orderSummary.querySelector('.a-box .a-box-inner') ||
      orderSummary.querySelector('.a-box-inner') ||
      orderSummary;
    if (amazonBox && amazonBox !== orderSummary) {
      const boxComputed = window.getComputedStyle(amazonBox);
      const inner = wrrapdSummaryRoot.querySelector('.a-box-inner');
      if (inner) {
        inner.style.paddingLeft = boxComputed.paddingLeft;
        inner.style.paddingRight = boxComputed.paddingRight;
        inner.style.boxSizing = 'border-box';
      }
    } else {
      const oc = window.getComputedStyle(orderSummary);
      const inner = wrrapdSummaryRoot.querySelector('.a-box-inner');
      if (inner) {
        inner.style.paddingLeft = oc.paddingLeft;
        inner.style.paddingRight = oc.paddingRight;
      }
    }
  }

  if (firstLine) {
    const computedStyle = window.getComputedStyle(firstLine);
    const wrrapdItems = wrrapdSummaryItems.querySelectorAll('.wrrapd-summary-line');
    wrrapdItems.forEach((item) => {
      if (computedStyle.fontSize) item.style.fontSize = computedStyle.fontSize;
      if (computedStyle.lineHeight) item.style.lineHeight = computedStyle.lineHeight;
    });

    console.log('[ensureWrrapdSummaryAlignment] Updated Wrrapd summary line typography to match Amazon.');
  }
}
