/**
 * Match Wrrapd order-summary styling to Amazon's layout.
 */

export function ensureWrrapdSummaryAlignment() {
  console.log('[ensureWrrapdSummaryAlignment] Ensuring Wrrapd summary alignment with Amazon...');

  const wrrapdSummaryItems = document.querySelector('#wrrapd-summary-items');
  const wrrapdSummaryRoot = document.querySelector('#wrrapd-summary');
  if (!wrrapdSummaryItems) {
    console.warn('[ensureWrrapdSummaryAlignment] Wrrapd summary items container not found.');
    return;
  }

  const orderSummary = document.querySelector('#spc-order-summary, [id*="order-summary"], .spc-order-summary');
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

  // Match the Wrrapd card outer box to Amazon's primary summary box padding when possible.
  if (wrrapdSummaryRoot) {
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
      }
    }
  }

  if (firstLine) {
    const computedStyle = window.getComputedStyle(firstLine);
    const itemStyle = {
      paddingLeft: computedStyle.paddingLeft,
      paddingRight: computedStyle.paddingRight,
      marginLeft: computedStyle.marginLeft,
      marginRight: computedStyle.marginRight,
      fontSize: computedStyle.fontSize,
      lineHeight: computedStyle.lineHeight
    };

    const wrrapdItems = wrrapdSummaryItems.querySelectorAll('.a-row');
    wrrapdItems.forEach((item) => {
      const itemStyleStr = [
        itemStyle.paddingLeft && itemStyle.paddingLeft !== '0px'
          ? `padding-left: ${itemStyle.paddingLeft};`
          : '',
        itemStyle.paddingRight && itemStyle.paddingRight !== '0px'
          ? `padding-right: ${itemStyle.paddingRight};`
          : '',
        itemStyle.marginLeft && itemStyle.marginLeft !== '0px'
          ? `margin-left: ${itemStyle.marginLeft};`
          : '',
        itemStyle.marginRight && itemStyle.marginRight !== '0px'
          ? `margin-right: ${itemStyle.marginRight};`
          : '',
        itemStyle.fontSize ? `font-size: ${itemStyle.fontSize};` : '',
        itemStyle.lineHeight ? `line-height: ${itemStyle.lineHeight};` : ''
      ]
        .filter((s) => s)
        .join(' ');

      if (itemStyleStr) {
        item.style.cssText += itemStyleStr;
      }
    });

    console.log('[ensureWrrapdSummaryAlignment] Updated all Wrrapd line items to match Amazon styles.');
  }
}
