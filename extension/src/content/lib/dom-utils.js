/**
 * DOM helpers: waiting for elements, snapshots for AI, mutation observation.
 */

export function waitForPageReady(selector, callback) {
  const checkInterval = 200;
  const timeout = 10000;
  let elapsedTime = 0;

  const interval = setInterval(() => {
    const element = document.querySelector(selector);

    if (element) {
      clearInterval(interval);
      callback();
    } else if (elapsedTime >= timeout) {
      clearInterval(interval);
      callback();
    }

    elapsedTime += checkInterval;
  }, checkInterval);
}

/**
 * Gets a simplified DOM snapshot for AI analysis
 * @returns {string} - Simplified HTML structure
 */
export function getSimplifiedDOMSnapshot() {
  const isGiftPage = window.location.href.includes('/gift');

  const relevantSelectors = isGiftPage
    ? [
        '#giftOptions',
        '[id^="item-"]',
        '[data-testid*="gift"]',
        '[class*="gift"]',
        'input[type="checkbox"][id*="gift"]',
        'input[type="checkbox"][name*="gift"]',
        'label[for*="gift"]',
        '[class*="product"]',
        '[class*="item"]',
        'section',
        '.a-section'
      ]
    : [
        '#sc-buy-box',
        '#sc-buy-box-ptc-button',
        '[data-feature-id*="checkout"]',
        '.a-button-input',
        'button[type="submit"]',
        'input[type="submit"]',
        '.a-button-primary',
        '#sc-active-cart',
        'form[action*="checkout"]',
        '[aria-label*="checkout" i]',
        '[aria-label*="proceed" i]'
      ];

  let snapshot = '';
  const foundElements = new Set();

  relevantSelectors.forEach((selector) => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el, index) => {
        if (index < 10 && !foundElements.has(el)) {
          foundElements.add(el);
          const text = el.textContent?.trim().substring(0, 150) || '';
          const id = el.id || '';
          const classes = el.className || '';
          const name = el.name || '';
          const value = el.value || '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          const dataAttrs = Array.from(el.attributes)
            .filter((attr) => attr.name.startsWith('data-'))
            .map((attr) => `${attr.name}="${attr.value}"`)
            .join(' ');

          snapshot += `\n--- Element ${foundElements.size} ---\n`;
          snapshot += `Selector: ${selector}\n`;
          snapshot += `Tag: ${el.tagName}\n`;
          snapshot += `ID: ${id}\n`;
          snapshot += `Name: ${name}\n`;
          snapshot += `Value: ${value}\n`;
          snapshot += `Classes: ${classes}\n`;
          snapshot += `Aria-label: ${ariaLabel}\n`;
          snapshot += `Data attributes: ${dataAttrs}\n`;
          snapshot += `Text content: ${text}\n`;
          snapshot += `Parent ID: ${el.parentElement?.id || ''}\n`;
          snapshot += `Parent classes: ${el.parentElement?.className || ''}\n`;
        }
      });
    } catch (e) {
      // Ignore selector errors
    }
  });

  try {
    const allButtons = document.querySelectorAll(
      'button, input[type="submit"], input[type="button"], a[role="button"]'
    );
    allButtons.forEach((el) => {
      if (foundElements.has(el)) return;

      const text = el.textContent?.trim().toLowerCase() || '';
      const value = (el.value || '').toLowerCase();
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();

      if (
        text.includes('checkout') ||
        text.includes('proceed') ||
        value.includes('checkout') ||
        value.includes('proceed') ||
        ariaLabel.includes('checkout') ||
        ariaLabel.includes('proceed')
      ) {
        foundElements.add(el);
        snapshot += `\n--- Text-based Match ---\n`;
        snapshot += `Tag: ${el.tagName}\n`;
        snapshot += `ID: ${el.id || ''}\n`;
        snapshot += `Classes: ${el.className || ''}\n`;
        snapshot += `Text: ${el.textContent?.trim().substring(0, 150) || ''}\n`;
        snapshot += `Value: ${el.value || ''}\n`;
        snapshot += `Aria-label: ${el.getAttribute('aria-label') || ''}\n`;
      }
    });
  } catch (e) {
    // Ignore errors
  }

  return snapshot || 'No relevant elements found';
}

export function observeDomChanges(callback) {
  const observer = new MutationObserver((mutationsList, obs) => {
    obs.disconnect();
    callback();
    obs.observe(document.body, {
      childList: true,
      subtree: true
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/**
 * Dynamic wait for element using MutationObserver
 */
export function waitForElement(selector, timeout = 2000, multiple = false) {
  return new Promise((resolve) => {
    const element = multiple
      ? document.querySelectorAll(selector)
      : document.querySelector(selector);
    if ((multiple && element.length > 0) || (!multiple && element)) {
      return resolve(element);
    }

    const observer = new MutationObserver(() => {
      const element = multiple
        ? document.querySelectorAll(selector)
        : document.querySelector(selector);
      if ((multiple && element.length > 0) || (!multiple && element)) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(multiple ? [] : null);
    }, timeout);
  });
}

export function waitForPopover(timeout = 2000) {
  return waitForElement('.a-popover', timeout);
}

/**
 * Comprehensive DOM snapshot including all <select> elements
 */
export function getFullPageDOMSnapshot() {
  let snapshot = '';

  const allSelects = document.querySelectorAll('select');
  console.log(`[getFullPageDOMSnapshot] Found ${allSelects.length} <select> elements on page.`);

  snapshot += `\n=== PAGE STRUCTURE ===\n`;
  snapshot += `Total <select> elements found: ${allSelects.length}\n\n`;

  const itemRows = document.querySelectorAll(
    '.a-row.a-spacing-base.item-row, [class*="item-row"], [class*="product-row"]'
  );
  snapshot += `Item rows found: ${itemRows.length}\n\n`;

  allSelects.forEach((select, index) => {
    if (index < 50) {
      const id = select.id || '';
      const name = select.name || '';
      const classes = select.className || '';
      const options = Array.from(select.options);
      const selectedValue = select.value;
      const selectedText = select.options[select.selectedIndex]?.text || '';

      const parent = select.parentElement;
      const parentClasses = parent ? parent.className || '' : '';
      const parentId = parent ? parent.id || '' : '';

      let productTitle = '';
      let current = parent;
      let depth = 0;
      while (current && depth < 5) {
        const titleEl = current.querySelector(
          'p.a-spacing-micro.a-size-base.a-text-bold, [class*="title"], [class*="product-name"]'
        );
        if (titleEl) {
          productTitle = titleEl.textContent?.trim().substring(0, 50) || '';
          break;
        }
        current = current.parentElement;
        depth++;
      }

      snapshot += `\n--- Select Element ${index + 1} ---\n`;
      snapshot += `Tag: ${select.tagName}\n`;
      snapshot += `ID: ${id}\n`;
      snapshot += `Name: ${name}\n`;
      snapshot += `Classes: ${classes}\n`;
      snapshot += `Parent Classes: ${parentClasses}\n`;
      snapshot += `Parent ID: ${parentId}\n`;
      snapshot += `Product Title: ${productTitle}\n`;
      snapshot += `Selected Value: ${selectedValue}\n`;
      snapshot += `Selected Text: ${selectedText}\n`;
      snapshot += `Total Options: ${options.length}\n`;

      options.slice(0, 5).forEach((opt, optIndex) => {
        snapshot += `  Option ${optIndex + 1}: value="${opt.value}", text="${opt.text.trim().substring(0, 80)}"\n`;
      });
      if (options.length > 5) {
        snapshot += `  ... and ${options.length - 5} more options\n`;
      }
    }
  });

  itemRows.forEach((row, rowIndex) => {
    if (rowIndex < 10) {
      const titleEl = row.querySelector('p.a-spacing-micro.a-size-base.a-text-bold, [class*="title"]');
      const title = titleEl ? titleEl.textContent?.trim().substring(0, 50) : 'Unknown';
      const selectsInRow = row.querySelectorAll('select');

      snapshot += `\n--- Item Row ${rowIndex + 1} ---\n`;
      snapshot += `Title: ${title}\n`;
      snapshot += `Selects in row: ${selectsInRow.length}\n`;
    }
  });

  return snapshot || 'No DOM structure found';
}

/**
 * Simplified DOM snapshot for a single row (e.g. Gemini analysis)
 */
export function getSimplifiedDOMSnapshotForRow(row) {
  let snapshot = '';

  const selects = row.querySelectorAll('select');
  snapshot += `Select elements in row: ${selects.length}\n\n`;

  selects.forEach((select, index) => {
    const id = select.id || '';
    const name = select.name || '';
    const classes = select.className || '';
    const options = Array.from(select.options);
    const selectedValue = select.value;

    snapshot += `\n--- Select ${index + 1} ---\n`;
    snapshot += `ID: ${id}\n`;
    snapshot += `Name: ${name}\n`;
    snapshot += `Classes: ${classes}\n`;
    snapshot += `Selected Value: ${selectedValue}\n`;
    snapshot += `Options: ${options.length}\n`;
    options.slice(0, 3).forEach((opt) => {
      snapshot += `  - "${opt.text.trim().substring(0, 60)}"\n`;
    });
  });

  return snapshot || 'Row structure not found';
}

/**
 * Unique CSS selector for an element within a container
 */
export function getUniqueSelectorForElement(element, container) {
  if (!element || !container) return null;

  if (element.id) {
    const selector = `#${element.id}`;
    if (container.querySelector(selector) === element) {
      return selector;
    }
  }

  if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\s+/).filter((c) => c.length > 0);
    if (classes.length > 0) {
      const selector = '.' + classes.join('.');
      const matches = container.querySelectorAll(selector);
      if (matches.length === 1 && matches[0] === element) {
        return selector;
      }
    }
  }

  const parent = element.parentElement;
  if (parent && container.contains(parent)) {
    const siblings = Array.from(parent.children);
    const index = siblings.indexOf(element);
    if (index >= 0) {
      return `${element.tagName.toLowerCase()}:nth-child(${index + 1})`;
    }
  }

  const path = [];
  let current = element;
  while (current && current !== container && path.length < 5) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += `#${current.id}`;
    } else if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).filter((c) => c.length > 0);
      if (classes.length > 0) {
        selector += '.' + classes[0];
      }
    }
    path.unshift(selector);
    current = current.parentElement;
  }

  return path.length > 0 ? path.join(' > ') : null;
}
