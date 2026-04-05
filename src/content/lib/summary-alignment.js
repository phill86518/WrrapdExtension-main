/**
 * Match Wrrapd order-summary styling to Amazon's layout.
 */

export function ensureWrrapdSummaryAlignment() {
  console.log('[ensureWrrapdSummaryAlignment] Ensuring Wrrapd summary alignment with Amazon...');

  const wrrapdSummaryItems = document.querySelector('#wrrapd-summary-items');
  if (!wrrapdSummaryItems) {
    console.warn('[ensureWrrapdSummaryAlignment] Wrrapd summary items container not found.');
    return;
  }

  const orderSummary = document.querySelector('#spc-order-summary, [id*="order-summary"], .spc-order-summary');
  if (!orderSummary) {
    console.warn('[ensureWrrapdSummaryAlignment] Amazon order summary not found.');
    return;
  }

  const amazonItemsContainer = orderSummary.querySelector(
    'ul, #subtotals-marketplace-table, [class*="subtotal"], [class*="items"]'
  );
  if (amazonItemsContainer) {
    const itemsComputed = window.getComputedStyle(amazonItemsContainer);
    const itemsStyle = [
      itemsComputed.paddingLeft && itemsComputed.paddingLeft !== '0px'
        ? `padding-left: ${itemsComputed.paddingLeft};`
        : '',
      itemsComputed.paddingRight && itemsComputed.paddingRight !== '0px'
        ? `padding-right: ${itemsComputed.paddingRight};`
        : '',
      itemsComputed.marginLeft && itemsComputed.marginLeft !== '0px'
        ? `margin-left: ${itemsComputed.marginLeft};`
        : '',
      itemsComputed.marginRight && itemsComputed.marginRight !== '0px'
        ? `margin-right: ${itemsComputed.marginRight};`
        : ''
    ]
      .filter((s) => s)
      .join(' ');

    if (itemsStyle) {
      wrrapdSummaryItems.style.cssText += itemsStyle;
      console.log(
        '[ensureWrrapdSummaryAlignment] Applied Amazon items container styles to Wrrapd summary.'
      );
    }
  }

  const amazonItems = orderSummary.querySelectorAll('ul li, .a-row, [class*="a-row"]');
  if (amazonItems.length > 0) {
    const firstAmazonItem = amazonItems[0];
    const computedStyle = window.getComputedStyle(firstAmazonItem);
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

      const innerSpan = item.querySelector('span[style*="display"]');
      if (innerSpan && itemStyleStr) {
        innerSpan.style.cssText += itemStyleStr;
      }
    });

    console.log('[ensureWrrapdSummaryAlignment] Updated all Wrrapd line items to match Amazon styles.');
  }
}
