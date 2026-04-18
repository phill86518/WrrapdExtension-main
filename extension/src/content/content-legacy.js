import {
    waitForPageReady,
    getSimplifiedDOMSnapshot,
    observeDomChanges,
    waitForElement,
    waitForPopover,
    getFullPageDOMSnapshot,
    getUniqueSelectorForElement
} from './lib/dom-utils.js';
import {
    getAllItemsFromLocalStorage,
    saveAllItemsToLocalStorage,
    saveItemToLocalStorage,
    retrieveItemFromLocalStorage,
    removeAllItemsFromLocalStorage,
    saveDeliveryInstructions
} from './lib/storage.js';
import {
    hideLoadingScreen,
    showLoadingScreen,
    removeLoadingScreen,
    showWrrapdShipToOneGuidanceOverlay,
    removeWrrapdShipToOneGuidanceOverlay,
} from './lib/loading-ui.js';
import { getValueByLabel, getElementValue, generateOrderNumber } from './lib/order-helpers.js';
import { ensureWrrapdSummaryAlignment } from './lib/summary-alignment.js';
import { isZipCodeAllowed } from './lib/zip-codes.js';

(function () {

    // Flag to prevent duplicate calls to selectAddressesForItemsSimple
    // Declared at the very top to avoid initialization errors
    let isSelectingAddresses = false;
    let paymentSectionRetryCount = 0;

    const WRRAPD_MANUAL_ADDRESS_TAPS_KEY = 'wrrapd-require-manual-address-taps';

    // ====================================================================================
    // COMMON FUNCTIONS - Used by all code paths to ensure consistency and eliminate duplication
    // ====================================================================================
    
    /**
     * COMMON FUNCTION: Ensure correct addresses for all items
     * This function handles address selection regardless of:
     * - Whether "This order contains a gift" was checked
     * - Whether Wrrapd address is already in the list or needs to be added
     * - Whether all items are Wrrapd or mixed
     * 
     * @param {Object} allItems - All items from localStorage
     * @returns {Promise<boolean>} - True if addresses were set successfully
     */
    async function ensureCorrectAddressesForAllItems(allItems) {
        if (!hasAnyWrrapdGiftWrapInCart(allItems)) {
            console.log(
                '[ensureCorrectAddressesForAllItems] No Wrrapd gift-wrap in cart — skipping address automation.',
            );
            return false;
        }

        console.log("[ensureCorrectAddressesForAllItems] Starting common address selection function...");
        
        // Step 1: Create identifier mapping for all items (always needed for multi-address page)
        const itemIdentifierMap = {};
        let wrrapdCounter = 1;
        let nonWrrapdCounter = 1;
        
        for (const [productKey, productObj] of Object.entries(allItems)) {
            if (!productObj || !productObj.asin || !productObj.options) continue;
            
            const totalOptions = productObj.options.length;
            const wrrapdOptions = productObj.options.filter(opt => opt.checkbox_wrrapd === true).length;
            const allOptionsNeedWrrapd = totalOptions > 0 && wrrapdOptions === totalOptions;
            
            // Create identifier for this product
            const productNameShort = productKey.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
            const identifier = allOptionsNeedWrrapd 
                ? `WRRAPD_${productNameShort}_${wrrapdCounter++}`
                : `DEFAULT_${productNameShort}_${nonWrrapdCounter++}`;
            
            itemIdentifierMap[productObj.asin] = {
                identifier: identifier,
                needsWrrapd: allOptionsNeedWrrapd,
                productKey: productKey
            };
        }
        
        // Store mapping in localStorage (always, even if Wrrapd address is already present)
        localStorage.setItem('wrrapd-item-identifiers', JSON.stringify(itemIdentifierMap));
        console.log("[ensureCorrectAddressesForAllItems] Created item identifier mapping:", itemIdentifierMap);
        
        // Step 2: Check if we're on single address page or multi-address page
        const currentUrl = window.location.href;
        const isMultiAddressPage = currentUrl.includes('itemselect') && 
                                   (currentUrl.includes('multiAddress') || currentUrl.includes('useCase=multiAddress') || currentUrl.includes('multi-address'));
        
        if (isMultiAddressPage) {
            // Already on multi-address page - use the common selection function
            console.log("[ensureCorrectAddressesForAllItems] Already on multi-address page - calling selectAddressesForItemsSimple...");
            await selectAddressesForItemsSimple(allItems);
            return true;
        } else {
            // On single address page - need to navigate to multi-address if mixed items
            const allItemsWrrapd = checkIfAllItemsWrrapd(allItems);
            localStorage.setItem('wrrapd-all-items', allItemsWrrapd ? 'true' : 'false');

            if (allItemsWrrapd) {
                // All items Wrrapd - select Wrrapd address and proceed
                console.log("[ensureCorrectAddressesForAllItems] All items Wrrapd - selecting Wrrapd address on single page...");
                // This will be handled by handleWrrapdAddressSelection's existing logic
                return false; // Let handleWrrapdAddressSelection handle it
            } else {
                // Mixed items - navigate to multi-address page
                console.log("[ensureCorrectAddressesForAllItems] Mixed items - navigating to multi-address page...");
                
                // Find and click "Deliver to multiple addresses" link
                const allLinks = Array.from(document.querySelectorAll('a, button'));
                let multiAddressLink = null;
                
                for (const link of allLinks) {
                    const text = link.textContent?.trim() || '';
                    if (text.includes('multiple addresses') || text.includes('Deliver to multiple') || text.includes('Ship to multiple')) {
                        multiAddressLink = link;
                        break;
                    }
                }
                
                if (!multiAddressLink) {
                    multiAddressLink = await findElementWithFallback(
                        'Deliver to multiple addresses link or button on Amazon address selection page',
                        ['a[href*="multiple"]', 'a[href*="multi"]', 'button[aria-label*="multiple"]'],
                        'Amazon address selection page with address options displayed and a link to deliver items to multiple addresses',
                        ['Deliver to multiple addresses', 'multiple addresses', 'Ship to multiple addresses', 'Deliver to multiple', 'multiple address']
                    );
                }
                
                if (multiAddressLink) {
                    let linkURL = multiAddressLink.href || multiAddressLink.getAttribute('data-href');
                    if (linkURL && linkURL !== '#' && !linkURL.includes('javascript:') && linkURL.startsWith('http')) {
                        window.location.href = linkURL;
                    } else {
                        multiAddressLink.click();
                    }
                    return true; // Navigation initiated
                } else {
                    // Try to construct URL manually
                    const purchaseIdMatch = currentUrl.match(/\/p\/([^\/]+)/);
                    const purchaseId = purchaseIdMatch ? purchaseIdMatch[1] : null;
                    
                    if (purchaseId) {
                        const multiAddressURL = `https://www.amazon.com/checkout/p/${purchaseId}/itemselect?pipelineType=Chewbacca&useCase=multiAddress`;
                        console.log("[ensureCorrectAddressesForAllItems] Constructed multi-address URL:", multiAddressURL);
                        window.location.href = multiAddressURL;
                        return true;
                    }
                }
            }
        }
        
        return false;
    }
    
    // ----------------------------------------------------- PAGE CONTROL -----------------------------------------------------

    /**
     * Amazon cart/checkout header: "Deliver to Roger" (#glow-ingress-line1) — first name for thank-you emails.
     */
    function domHasAnyWrrapdCheckboxChecked() {
        try {
            return Array.from(document.querySelectorAll('input[id^="wrrapd-checkbox-"]')).some((el) => el.checked);
        } catch (_) {
            return false;
        }
    }

    /** True if at least one line item has Wrrapd gift-wrap — never hijack Amazon checkout without this. */
    function hasAnyWrrapdGiftWrapInCart(allItems) {
        try {
            const items = allItems || {};
            const fromStorage = Object.values(items).some(
                (p) =>
                    p &&
                    Array.isArray(p.options) &&
                    p.options.some((o) => o && o.checkbox_wrrapd === true),
            );
            return fromStorage || domHasAnyWrrapdCheckboxChecked();
        } catch (_) {
            return domHasAnyWrrapdCheckboxChecked();
        }
    }

    function titleFromGiftRow(itemContainer) {
        if (!itemContainer) return '';
        const itemTitleElement =
            itemContainer.querySelector('span.a-truncate-cut') ||
            itemContainer.querySelector('span.a-truncate-full') ||
            itemContainer.querySelector('a.a-link-normal.a-color-base') ||
            itemContainer.querySelector('.a-text-bold') ||
            itemContainer.querySelector('span[class*="truncate"]') ||
            itemContainer.querySelector('h2') ||
            itemContainer.querySelector('h3') ||
            itemContainer.querySelector('[data-item-title]') ||
            itemContainer.querySelector('.item-title') ||
            itemContainer.querySelector('a[href*="/dp/"]') ||
            itemContainer.querySelector('a[href*="/gp/product/"]');
        return ((itemTitleElement && (itemTitleElement.textContent || itemTitleElement.innerText)) || '')
            .trim()
            .substring(0, 200);
    }

    function titleTokensOverlapCount(pageTitle, savedTitle) {
        const ta = pageTitle
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((t) => t.length > 2);
        const tb = new Set(
            savedTitle
                .toLowerCase()
                .split(/[^a-z0-9]+/)
                .filter((t) => t.length > 2),
        );
        let n = 0;
        for (const t of ta) {
            if (tb.has(t)) n++;
        }
        return n;
    }

    function resolveProductByRowTitle(allItems, itemTitle, rowIndex, rowContainer) {
        if (!allItems || !itemTitle) return null;

        const asinFromRow =
            rowContainer?.dataset?.asin ||
            rowContainer?.querySelector?.('[data-asin]')?.getAttribute?.('data-asin') ||
            '';
        if (asinFromRow) {
            for (const p of Object.values(allItems)) {
                if (p && p.asin === asinFromRow && Array.isArray(p.options)) return p;
            }
        }

        let productObj = allItems[itemTitle];
        if (!productObj) {
            const savedTitles = Object.keys(allItems);
            for (const savedTitle of savedTitles) {
                const normalizedPageTitle = itemTitle.toLowerCase().replace(/\s+/g, ' ').trim();
                const normalizedSavedTitle = savedTitle.toLowerCase().replace(/\s+/g, ' ').trim();
                if (
                    normalizedPageTitle.substring(0, 30) === normalizedSavedTitle.substring(0, 30) ||
                    normalizedPageTitle.includes(normalizedSavedTitle) ||
                    normalizedSavedTitle.includes(normalizedPageTitle) ||
                    titleTokensOverlapCount(itemTitle, savedTitle) >= 2
                ) {
                    productObj = allItems[savedTitle];
                    break;
                }
            }
        }
        if (!productObj) {
            const savedTitles = Object.keys(allItems);
            if (rowIndex < savedTitles.length) productObj = allItems[savedTitles[rowIndex]];
        }
        return productObj && Array.isArray(productObj.options) ? productObj : null;
    }

    /**
     * Keep localStorage in sync with currently checked Wrrapd checkboxes on the gift page.
     * This makes "first-time" and "came-back-and-changed-mind" workflows identical.
     */
    function syncWrrapdSelectionsFromGiftDom(allItems) {
        try {
            const rows = Array.from(document.querySelectorAll('[id^="item-"]'));
            if (!rows.length || !allItems || typeof allItems !== 'object') return false;
            const subItemIndexTracker = {};
            let changed = false;

            rows.forEach((itemContainer, index) => {
                const wrrapdCheckbox = document.getElementById(`wrrapd-checkbox-${index}`);
                if (!wrrapdCheckbox) return;
                const itemTitle = titleFromGiftRow(itemContainer);
                const productObj = resolveProductByRowTitle(allItems, itemTitle, index, itemContainer);
                if (!productObj || !productObj.options.length) return;

                const trackerKey =
                    Object.keys(allItems).find((k) => allItems[k] === productObj) ||
                    productObj.title ||
                    itemTitle ||
                    String(index);
                const subIndex = subItemIndexTracker[trackerKey] || 0;
                if (subIndex >= productObj.options.length) return;
                const subItem = productObj.options[subIndex];
                subItemIndexTracker[trackerKey] = subIndex + 1;
                if (!subItem || typeof subItem !== 'object') return;

                const shouldBeChecked = wrrapdCheckbox.checked === true;
                if (subItem.checkbox_wrrapd !== shouldBeChecked) {
                    subItem.checkbox_wrrapd = shouldBeChecked;
                    if (!shouldBeChecked) {
                        subItem.checkbox_flowers = false;
                        subItem.checkbox_amazon_combine = false;
                    } else if (!subItem.selected_wrapping_option) {
                        subItem.selected_wrapping_option = 'wrrapd';
                    }
                    changed = true;
                }
            });

            if (changed) {
                saveAllItemsToLocalStorage(allItems);
                console.log('[syncWrrapdSelectionsFromGiftDom] Synchronized gift-row Wrrapd checkboxes into localStorage.');
            }
            return changed;
        } catch (e) {
            console.warn('[syncWrrapdSelectionsFromGiftDom]', e);
            return false;
        }
    }

    function syncAmazonDeliverToGreeting() {
        try {
            if (!window.location.href.includes('amazon.com')) return;
            const el =
                document.getElementById('glow-ingress-line1') ||
                document.querySelector('.nav-line-1.nav-progressive-content');
            if (!el) return;
            const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
            const m = text.match(/deliver\s+to\s+(.+)/i);
            if (!m) return;
            const after = m[1].trim();
            const first = after.split(/\s+/)[0];
            if (!first || first.length < 2) return;
            const prev = localStorage.getItem('wrrapd-deliver-to-greeting');
            if (prev !== first) {
                localStorage.setItem('wrrapd-deliver-to-greeting', first);
                console.log('[syncAmazonDeliverToGreeting] Stored greeting first name:', first);
            }
        } catch (e) {
            console.warn('[syncAmazonDeliverToGreeting]', e);
        }
    }

    function monitorURLChanges() {
        let lastURL = null;
    
        const checkURLAndExecute = () => {
            const currentURL = window.location.href;
            if (currentURL.includes('amazon.com')) {
                syncAmazonDeliverToGreeting();
            }

            if (currentURL !== lastURL) {
                lastURL = currentURL;

                // Initialize delivery instructions monitoring on every page
                monitorDeliveryInstructions();

                // Check if this is a page we should process
                const isRelevantPage = 
                    currentURL.includes('amazon.com/gp/buy/itemselect/handlers/display.html') ||
                    currentURL.includes('amazon.com/gp/buy/gift/handlers/display.html') ||
                    currentURL.includes('/checkout/') ||  // New checkout flow URLs (gift, address, etc.)
                    currentURL.includes('/gift') ||  // Gift options in new checkout flow
                    currentURL.includes('amazon.com/gp/cart/view.html') ||
                    currentURL.includes('amazon.com/cart') ||
                    currentURL.includes('amazon.com/gp/buy/payselect/handlers/display.html') ||
                    currentURL.includes('amazon.com/gp/buy/spc/handlers/display.html') ||
                    currentURL.includes('amazon.com/gp/buy/primeinterstitial/handlers/display.html') ||
                    currentURL.includes('amazon.com/gp/buy/addressselect/handlers/display.html');
                
                if (!isRelevantPage) {
                    return;
                }

                const allItems = getAllItemsFromLocalStorage();
                syncWrrapdSelectionsFromGiftDom(allItems);

                // Check zip code for every page
                // findAndStoreZipCodeFromCart();

                // ===== CHECK FOR NEW ADDRESS PAGE FORMAT FIRST =====
                const hasCheckoutP = currentURL.includes('/checkout/p/');
                const hasAddress = currentURL.includes('/address');
                const hasAddressSelect = currentURL.includes('addressselect');
                const isAddressPage = (hasCheckoutP && hasAddress) || hasAddressSelect;
                
                if (isAddressPage) {
                    console.log("[monitorURLChanges] ===== ADDRESS PAGE DETECTED ===== ");
                    console.log(`[monitorURLChanges] Current URL: ${currentURL}`);
                    
                    // Check if we just came from checkout button click
                    const comingFromCheckout = localStorage.getItem('wrrapd-coming-from-checkout');
                    if (comingFromCheckout === 'true') {
                        console.log("[monitorURLChanges] ✓ Coming from checkout - cart data should be saved.");
                        localStorage.removeItem('wrrapd-coming-from-checkout');
                    }
                    
                    // Check if we have Wrrapd items
                    const hasWrappedSubItem = Object.values(allItems).some(product => 
                        product.options && product.options.some(subItem => subItem.checkbox_wrrapd)
                    );
                    
                    console.log(`[monitorURLChanges] Has Wrrapd items: ${hasWrappedSubItem}`);

                    if (!hasWrappedSubItem) {
                        console.log(
                            '[monitorURLChanges] No Wrrapd gift-wrap — skipping address-page automation.',
                        );
                        return;
                    }

                    // CRITICAL: Show loading screen IMMEDIATELY when address page is detected
                    // This covers the page before any manipulation starts
                    showLoadingScreen();
                    
                    // ALWAYS call handleWrrapdAddressSelection on address page (it will check internally)
                    console.log("[monitorURLChanges] Scheduling handleWrrapdAddressSelection in 3 seconds...");
                    setTimeout(() => {
                        console.log("[monitorURLChanges] ===== NOW CALLING handleWrrapdAddressSelection() ===== ");
                        try {
                            handleWrrapdAddressSelection().catch(err => {
                                console.error("[monitorURLChanges] Error in handleWrrapdAddressSelection:", err);
                            });
                        } catch (err) {
                            console.error("[monitorURLChanges] Exception calling handleWrrapdAddressSelection:", err);
                        }
                    }, 3000);
                    return;
                }
                // ===== END ADDRESS PAGE CHECK =====

                // Multiaddress page - check both old and new URL formats
                if (currentURL.includes('https://www.amazon.com/gp/buy/itemselect/handlers/display.html') ||
                    (currentURL.includes('/checkout/p/') && currentURL.includes('/itemselect') && currentURL.includes('useCase=multiAddress'))) {
                    console.log("[monitorURLChanges] Detected multiaddress page. ");

                    if (!hasAnyWrrapdGiftWrapInCart(allItems)) {
                        console.log(
                            '[monitorURLChanges] Multi-address page but no Wrrapd gift-wrap — not running Wrrapd automation.',
                        );
                        return;
                    }

                    // Manual Amazon confirmation: do not cover the page with the dark overlay
                    if (wrrapdManualAddressTapsRequired()) {
                        removeLoadingScreen();
                    } else {
                        showLoadingScreen();
                    }

                    checkChangeAddress();
                    return;
                }
    
                // Gift options page - check both old and new URL formats
                if (currentURL.includes('amazon.com/gp/buy/gift/handlers/display.html') ||
                    (currentURL.includes('/checkout/') && currentURL.includes('/gift'))) {
                    console.log("%c[monitorURLChanges] ✓✓✓ GIFT OPTIONS PAGE DETECTED ✓✓✓", "color: purple; font-weight: bold; font-size: 14px;");
                    console.log("[monitorURLChanges] Gift options URL:", currentURL);
                    console.log("[monitorURLChanges] Checking for saved cart data...");
                    const savedItems = getAllItemsFromLocalStorage();
                    console.log("[monitorURLChanges] Saved items in localStorage:", Object.keys(savedItems));
                    console.log("[monitorURLChanges] Full saved data:", savedItems);
                    
                    // Try multiple selectors for the new checkout flow
                    const selectors = [
                        '.a-box-inner > #item-0',
                        '#giftOptions [id^="item-"]',
                        '[id^="item-"]',
                        '.gift-options-item'
                    ];
                    
                    let selectorFound = false;
                    for (const selector of selectors) {
                        const element = document.querySelector(selector);
                        if (element) {
                            console.log(`[monitorURLChanges] Found element with selector: ${selector}`);
                            selectorFound = true;
                            waitForPageReady(selector, () => {
                                console.log("[monitorURLChanges] Gift options page ready, calling giftSection()...");
                                giftSection();
                            });
                            break;
                        }
                    }
                    
                    // If no selector found, try after a delay
                    if (!selectorFound) {
                        console.log("[monitorURLChanges] No gift options elements found yet, waiting 2 seconds...");
                        setTimeout(() => {
                            console.log("[monitorURLChanges] Retrying giftSection() after delay...");
                            giftSection();
                        }, 2000);
                    }
                    
                    // CRITICAL: Also set up monitoring for dynamically appearing gift options
                    // This handles the case when "Add gift options" is clicked and gift interface appears
                    const allItems = getAllItemsFromLocalStorage();
                    if (Object.keys(allItems).length > 0) {
                        console.log("[monitorURLChanges] Setting up monitoring for dynamically appearing gift options...");
                        setTimeout(() => {
                            monitorAddGiftOptionsButton(allItems);
                        }, 1000);
                    }
                    // checkIfWrrapdSelected(allItems);
                }
    
                // Cart page
                if (currentURL.includes('amazon.com/gp/cart/view.html') ||
                    currentURL.includes('amazon.com/cart') ||
                    currentURL.includes('/cart') ||
                    currentURL.match(/amazon\.com\/.*cart/)) {
                    // Start button detection immediately, don't wait for page ready
                    overrideProceedToCheckoutButton().catch(err => {
                        console.error("[monitorURLChanges] Error in immediate overrideProceedToCheckoutButton:", err);
                    });
                    
                    // Also try again after a short delay
                    setTimeout(() => {
                        overrideProceedToCheckoutButton().catch(err => {
                            console.error("[monitorURLChanges] Error in delayed overrideProceedToCheckoutButton:", err);
                        });
                    }, 1000);
                    
                    waitForPageReady('div#sc-active-cart div', () => {
                        cartPage(allItems)
                        // findAndStoreZipCodeFromCart();
                    });
                }
    
                // if (currentURL.includes('amazon.com/gp/buy/itemselect/handlers/display.html')) {
                //     console.log("[monitorURLChanges] Detected address selection page.");
                //     waitForPageReady('#address-ui-widgets-enterAddressFullName', () => restoreDefaultAddresses(allItems));
                // }
    
                // Payment page - check for both old format and new SPC (Smart Place Order) checkout pipeline
                // New format: /checkout/p/.../spc (Smart Place Order payment page)
                // Old format: /gp/buy/payselect/handlers/display.html
                const isPaymentPage = currentURL.includes('amazon.com/gp/buy/payselect/handlers/display.html') ||
                    (currentURL.includes('/checkout/') && currentURL.includes('/spc') && !currentURL.includes('/gp/buy/spc/handlers/display.html'));
                
                if (isPaymentPage) {
                    console.log("%c[monitorURLChanges] ✓✓✓ PAYMENT PAGE DETECTED ✓✓✓", "color: green; font-weight: bold; font-size: 14px;");
                    console.log("[monitorURLChanges] Payment page URL:", currentURL);
                    
                    // Clear automatic workflow flag since we've reached payment page
                    localStorage.removeItem('wrrapd-automatic-workflow-active');
                    
                    // Keep loading overlay on changed-mind path until Wrrapd summary is visible.
                    if (localStorage.getItem('wrrapd-keep-loading-until-summary') !== 'true') {
                        removeLoadingScreen();
                    }
                    
                    // Call paymentSection immediately - it will disable buttons and create summary
                        paymentSection(allItems);
                        checkChangeAddress();
                }

                // Review & Shipping page (old format only - new format /checkout/.../spc is payment page)
                if (currentURL.includes('amazon.com/gp/buy/spc/handlers/display.html') && 
                    !currentURL.includes('/checkout/')) {
                    console.log("[monitorURLChanges] Detected review & shipping page.");
                    waitForPageReady('div.shipping-group', () => {
                        reviewAndShippingSection();
                        // checkChangeAddress(allItems);
                        // checkIfWrrapdSelected(allItems);
                    });
                }

                // Offers page
                if (currentURL.includes('amazon.com/gp/buy/primeinterstitial/handlers/display.html')) {
                    console.log("[monitorURLChanges] Detected Offers page.");
                    waitForPageReady('.a-color-alternate-background:nth-child(1) > .a-box-inner', () => {
                        offersSection(allItems);
                        checkChangeAddress();
                        // checkIfWrrapdSelected(allItems);
                    });
                }

                // OLD address page format (legacy) - only check if not already handled above
                if (currentURL.includes('amazon.com/gp/buy/addressselect/handlers/display.html') ||
                    currentURL.includes('amazon.com/gp/buy/itemselect/handlers/display.html')) {
                    console.log("[monitorURLChanges] Detected OLD checkout/address selection page.");
                    
                    // Check if this is multi-address page
                    if (currentURL.includes('itemselect/handlers/display.html')) {
                        waitForPageReady('.a-row.a-spacing-base.item-row', () => {
                            checkChangeAddress();
                        });
                    } else {
                        // Single address selection page
                    waitForPageReady('#address-list > .a-box-group', () => {
                        singleSelectAddress();
                    });
                    }
                }
                 
            }
        };
    
        // Comprobar al inicio
        checkURLAndExecute();
    
        // Comprobar cada segundo
        setInterval(checkURLAndExecute, 1000);
    }
    
    // Inicializar monitoreo
    monitorURLChanges();

    // ----------------------------------------------------- CART PAGE -----------------------------------------------------

    /************************************************************
     * cartPage - Called when user is on the Amazon cart page
     ************************************************************/
    function cartPage() {
        //reset wrrapd-payment-status
        localStorage.setItem('wrrapd-payment-status', 'reset');
        
        // CRITICAL: Reset ALL flags when on cart page - fresh start for new checkout
        localStorage.removeItem('wrrapd-terms-accepted');
        localStorage.removeItem('wrrapd-terms-gift-signature');
        localStorage.removeItem('wrrapd-should-change-address');
        localStorage.removeItem('wrrapd-addresses-changed');

        // We remove all previously stored items from localStorage to start fresh
        removeAllItemsFromLocalStorage();

        // Disable checkout buttons immediately until script is ready
        disableCheckoutButtons();

        // We set up a MutationObserver to detect if the "Proceed to checkout" button 
        // re-renders or changes, so we can override it
        monitorDomChangesForCheckoutButton();
        
        // Also try to find the button immediately (in case it's already loaded)
        overrideProceedToCheckoutButton().catch(err => {
            console.error("[cartPage] Error in initial overrideProceedToCheckoutButton:", err);
        });
        
        // Try once more after a short delay if button not found immediately
        setTimeout(() => {
            overrideProceedToCheckoutButton().catch(err => {
                console.error("[cartPage] Error in delayed overrideProceedToCheckoutButton:", err);
            });
        }, 1000);
    }
    
    /**
     * Disable all "Proceed to checkout" buttons on cart page
     */
    function disableCheckoutButtons() {
        const selectors = [
            '#sc-buy-box-ptc-button .a-button-input',
            '#sc-buy-box-ptc-button input[type="submit"]',
            '#sc-buy-box-ptc-button button',
            '#sc-buy-box-ptc-button input',
            '[data-feature-id="proceed-to-checkout-button"] input',
            '[data-feature-id="proceed-to-checkout-button"] button',
            '#sc-buy-box form input[type="submit"]',
            '#sc-buy-box form button[type="submit"]'
        ];
        
        selectors.forEach(selector => {
            const buttons = document.querySelectorAll(selector);
            buttons.forEach(btn => {
                if (btn && btn.offsetParent !== null) {
                    btn.disabled = true;
                    btn.style.pointerEvents = 'none';
                    btn.style.opacity = '0.5';
                    btn.style.cursor = 'not-allowed';
                    btn.setAttribute('data-wrrapd-disabled', 'true');
                }
            });
        });
    }
    
    /**
     * Enable all "Proceed to checkout" buttons on cart page
     */
    function enableCheckoutButtons() {
        const selectors = [
            '#sc-buy-box-ptc-button .a-button-input',
            '#sc-buy-box-ptc-button input[type="submit"]',
            '#sc-buy-box-ptc-button button',
            '#sc-buy-box-ptc-button input',
            '[data-feature-id="proceed-to-checkout-button"] input',
            '[data-feature-id="proceed-to-checkout-button"] button',
            '#sc-buy-box form input[type="submit"]',
            '#sc-buy-box form button[type="submit"]'
        ];
        
        selectors.forEach(selector => {
            const buttons = document.querySelectorAll(selector);
            buttons.forEach(btn => {
                if (btn && btn.hasAttribute('data-wrrapd-disabled')) {
                    btn.disabled = false;
                    btn.style.pointerEvents = 'auto';
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                    btn.removeAttribute('data-wrrapd-disabled');
                }
            });
        });
    }
    
    // Expose function to manually trigger button detection (for debugging)
    window.wrrapdFindCheckoutButton = function() {
        console.log("[wrrapdFindCheckoutButton] Manual trigger called");
        return overrideProceedToCheckoutButton();
    };

    /*********************************************************************
     * monitorDomChangesForCheckoutButton - Looks for the checkout button
     *********************************************************************/
    function monitorDomChangesForCheckoutButton() {
        const targetNode = document.body;
        const config = { childList: true, subtree: true };

        let checkTimeout = null;
        const debouncedCheck = () => {
            // Debounce to avoid too many checks
            if (checkTimeout) clearTimeout(checkTimeout);
            checkTimeout = setTimeout(() => {
                overrideProceedToCheckoutButton().catch(err => {
                    console.error("[monitorDomChangesForCheckoutButton] Error in overrideProceedToCheckoutButton:", err);
                });
            }, 100); // Wait 100ms after last DOM change
        };

        const observer = new MutationObserver(debouncedCheck);

        observer.observe(targetNode, config);
        
        // Also check immediately and periodically
        overrideProceedToCheckoutButton().catch(err => {
            console.error("[monitorDomChangesForCheckoutButton] Error in initial overrideProceedToCheckoutButton:", err);
        });
        
        // Check every 2 seconds as a fallback
        const intervalId = setInterval(() => {
            overrideProceedToCheckoutButton().catch(err => {
                // Silently fail on interval checks to avoid spam
            });
        }, 2000);
        
        // Store interval ID so we can clear it if needed (though it's fine to leave it running)
    }
    
    /*****************************************************************
     * AI-Powered Element Finder using Gemini API
     *****************************************************************/
    
    // Cache for storing successful selectors to avoid repeated API calls
    const elementSelectorCache = new Map();
    
    // Wrrapd Gemini API Key - Automatically configured
    const WRRAPD_GEMINI_API_KEY = 'AIzaSyCf5zz3Nkl0E4jeiusobT-ab8Nn7xnxAfI';
    
    // Automatically set the API key on extension load
    if (WRRAPD_GEMINI_API_KEY && WRRAPD_GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY') {
        localStorage.setItem('gemini-api-key', WRRAPD_GEMINI_API_KEY);
    }
    
    /**
     * Helper function to set the Gemini API key (for manual override if needed)
     * Can be called from browser console: setGeminiAPIKey('your-api-key-here')
     * @param {string} apiKey - Your Gemini API key from Google AI Studio
     */
    window.setGeminiAPIKey = function(apiKey) {
        if (!apiKey || typeof apiKey !== 'string') {
            console.error('[setGeminiAPIKey] Invalid API key provided');
            return false;
        }
        localStorage.setItem('gemini-api-key', apiKey);
        console.log('[setGeminiAPIKey] Gemini API key has been set successfully');
        console.log('[setGeminiAPIKey] To get your API key, visit: https://makersuite.google.com/app/apikey');
        return true;
    };
    
    /**
     * Creates a UI modal for setting the Gemini API key
     */
    function createGeminiAPIKeyModal() {
        // Check if modal already exists
        if (document.getElementById('wrrapd-gemini-api-modal')) {
            return;
        }

        const modal = document.createElement('div');
        modal.id = 'wrrapd-gemini-api-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 999999;
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: Arial, sans-serif;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 8px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        `;

        content.innerHTML = `
            <h2 style="margin-top: 0; color: #333;">Wrrapd Extension - Gemini API Key Setup</h2>
            <p style="color: #666; line-height: 1.6;">
                To enable AI-powered element detection on Amazon pages, please set your Gemini API key.
                This helps the extension automatically find checkout buttons even when Amazon changes their page structure.
            </p>
            <ol style="color: #666; line-height: 1.8;">
                <li>Get your free API key from: <a href="https://makersuite.google.com/app/apikey" target="_blank" style="color: #0066cc;">Google AI Studio</a></li>
                <li>Paste your API key below:</li>
            </ol>
            <input 
                type="password" 
                id="wrrapd-api-key-input" 
                placeholder="Enter your Gemini API key here"
                style="width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;"
            />
            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button 
                    id="wrrapd-save-api-key" 
                    style="flex: 1; padding: 12px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold;"
                >Save API Key</button>
                <button 
                    id="wrrapd-skip-api-key" 
                    style="flex: 1; padding: 12px; background: #ccc; color: #333; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;"
                >Skip (Use Fallback)</button>
            </div>
            <p style="color: #999; font-size: 12px; margin-top: 15px; margin-bottom: 0;">
                The extension will work without the API key using fallback selectors, but AI detection provides better reliability.
            </p>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        // Event handlers
        document.getElementById('wrrapd-save-api-key').addEventListener('click', () => {
            const apiKey = document.getElementById('wrrapd-api-key-input').value.trim();
            if (apiKey) {
                if (setGeminiAPIKey(apiKey)) {
                    modal.remove();
                    // Show success message
                    const successMsg = document.createElement('div');
                    successMsg.style.cssText = `
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: #4CAF50;
                        color: white;
                        padding: 15px 20px;
                        border-radius: 4px;
                        z-index: 1000000;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                        font-family: Arial, sans-serif;
                    `;
                    successMsg.textContent = '✓ Gemini API Key saved successfully!';
                    document.body.appendChild(successMsg);
                    setTimeout(() => successMsg.remove(), 3000);
                }
            } else {
                alert('Please enter a valid API key');
            }
        });

        document.getElementById('wrrapd-skip-api-key').addEventListener('click', () => {
            modal.remove();
            localStorage.setItem('wrrapd-api-key-skipped', 'true');
        });

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // API key is now automatically configured, so we don't need to show the modal
    // The modal function is still available if needed for manual setup in the future
    // Uncomment the code below if you want to show the modal for manual entry:
    /*
    if (!localStorage.getItem('gemini-api-key') && !localStorage.getItem('wrrapd-api-key-skipped')) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createGeminiAPIKeyModal);
        } else {
            setTimeout(createGeminiAPIKeyModal, 1000);
        }
    }
    */
    
    // Verify API key is set
    if (localStorage.getItem('gemini-api-key')) {
        // API key is configured and ready
    }
    
    /**
     * Uses Gemini API to identify elements on the page dynamically
     * @param {string} elementDescription - Description of the element to find (e.g., "Proceed to checkout button")
     * @param {string} pageContext - Additional context about the page
     * @returns {Promise<string|null>} - CSS selector or null if not found
     */
    async function findElementWithAI(elementDescription, pageContext = '') {
        const cacheKey = `${elementDescription}-${window.location.pathname}`;
        
        // Check cache first
        if (elementSelectorCache.has(cacheKey)) {
            const cachedSelector = elementSelectorCache.get(cacheKey);
            const element = document.querySelector(cachedSelector);
            if (element) {
                console.log(`[findElementWithAI] Using cached selector for "${elementDescription}": ${cachedSelector}`);
                return cachedSelector;
            } else {
                // Cached selector no longer works, remove from cache
                elementSelectorCache.delete(cacheKey);
            }
        }

        try {
            // Get a simplified DOM structure for analysis
            const domSnapshot = getSimplifiedDOMSnapshot();
            
            // Prepare prompt for Gemini
            const prompt = `You are analyzing an Amazon checkout page. Find the CSS selector for the following element: "${elementDescription}".

${pageContext ? `Context: ${pageContext}` : ''}

Here is a simplified DOM structure of the page:
${domSnapshot}

Provide ONLY a valid CSS selector that uniquely identifies this element. The selector should be specific enough to target only this element. Return ONLY the CSS selector, nothing else. If you cannot find the element, return "NOT_FOUND".`;

            // Call Gemini API
            const selector = await callGeminiAPI(prompt);
            
            if (selector && selector !== 'NOT_FOUND' && selector.trim().length > 0) {
                // Validate the selector
                const element = document.querySelector(selector.trim());
                if (element) {
                    console.log(`[findElementWithAI] AI found selector for "${elementDescription}": ${selector.trim()}`);
                    // Cache the successful selector
                    elementSelectorCache.set(cacheKey, selector.trim());
                    return selector.trim();
                } else {
                    console.warn(`[findElementWithAI] AI returned selector "${selector.trim()}" but element not found in DOM`);
                }
            }
        } catch (error) {
            console.error(`[findElementWithAI] Error using AI to find "${elementDescription}":`, error);
        }
        
        return null;
    }
    
    /**
     * Calls the Gemini API to get element selector
     * @param {string} prompt - The prompt to send to Gemini
     * @returns {Promise<string>} - The CSS selector returned by Gemini
     */
    async function callGeminiAPI(prompt) {
        // Get API key from localStorage or use a default (you should set this)
        const apiKey = localStorage.getItem('gemini-api-key') || 'YOUR_GEMINI_API_KEY';
        
        if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
            console.warn('[callGeminiAPI] Gemini API key not configured. Please set it in localStorage with key "gemini-api-key"');
            return null;
        }
        
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            });
            
            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                const text = data.candidates[0].content.parts[0].text.trim();
                
                // Return the full text response - let the caller parse it as needed
                return text;
            }
            
            return null;
        } catch (error) {
            console.error('[callGeminiAPI] Error calling Gemini API:', error);
            throw error;
        }
    }
    
    /**
     * Finds an element by text content (case-insensitive)
     * @param {string} searchText - Text to search for
     * @param {Array<string>} tagNames - Tag names to search in (default: ['button', 'input', 'a'])
     * @returns {Element|null} - Found element or null
     */
    function findElementByText(searchText, tagNames = ['button', 'input', 'a']) {
        const lowerSearchText = searchText.toLowerCase();
        const selectors = tagNames.join(', ');
        
        try {
            const elements = document.querySelectorAll(selectors);
            for (const el of elements) {
                const text = el.textContent?.trim().toLowerCase() || '';
                const value = (el.value || '').toLowerCase();
                const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                const title = (el.getAttribute('title') || '').toLowerCase();
                const dataLabel = (el.getAttribute('data-label') || '').toLowerCase();
                
                if (text.includes(lowerSearchText) || 
                    value.includes(lowerSearchText) || 
                    ariaLabel.includes(lowerSearchText) ||
                    title.includes(lowerSearchText) ||
                    dataLabel.includes(lowerSearchText)) {
                    console.log(`[findElementByText] Found element by text "${searchText}":`, el);
                    return el;
                }
            }
            
            // Also search in parent elements (for cases where text is in a child span)
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
                if (tagNames.includes(el.tagName.toLowerCase())) {
                    const text = el.textContent?.trim().toLowerCase() || '';
                    if (text.includes(lowerSearchText)) {
                        console.log(`[findElementByText] Found element by text "${searchText}" (with children):`, el);
                        return el;
                    }
                }
            }
        } catch (e) {
            console.warn('[findElementByText] Error searching by text:', e);
        }
        
        return null;
    }
    
    /**
     * Finds a link element and extracts its URL (href attribute)
     * Uses AI to find the element, then extracts the href
     * @param {string} elementDescription - Description of the link element
     * @param {Array<string>} fallbackSelectors - Array of fallback CSS selectors
     * @param {string} pageContext - Additional context
     * @param {Array<string>} searchTexts - Optional array of text strings to search for
     * @returns {Promise<string|null>} - The URL (href) of the found link, or null
     */
    async function findLinkURL(elementDescription, fallbackSelectors = [], pageContext = '', searchTexts = []) {
        console.log(`[findLinkURL] Searching for link "${elementDescription}" to extract URL...`);
        
        const element = await findElementWithFallback(elementDescription, fallbackSelectors, pageContext, searchTexts);
        
        if (!element) {
            console.warn(`[findLinkURL] Could not find element "${elementDescription}"`);
            return null;
        }
        
        // If element is a link, get its href
        if (element.tagName === 'A' && element.href) {
            console.log(`[findLinkURL] ✓ Found URL: ${element.href}`);
            return element.href;
        }
        
        // If element is inside a link, find the parent link
        const parentLink = element.closest('a');
        if (parentLink && parentLink.href) {
            console.log(`[findLinkURL] ✓ Found URL from parent link: ${parentLink.href}`);
            return parentLink.href;
        }
        
        // If element has onclick or data-href, try to extract URL
        if (element.onclick) {
            const onclickStr = element.onclick.toString();
            const urlMatch = onclickStr.match(/['"](https?:\/\/[^'"]+)['"]/);
            if (urlMatch) {
                console.log(`[findLinkURL] ✓ Found URL from onclick: ${urlMatch[1]}`);
                return urlMatch[1];
            }
        }
        
        // Check for data attributes that might contain URLs
        const dataHref = element.getAttribute('data-href') || element.getAttribute('href');
        if (dataHref && dataHref.startsWith('http')) {
            console.log(`[findLinkURL] ✓ Found URL from data attribute: ${dataHref}`);
            return dataHref;
        }
        
        console.warn(`[findLinkURL] Could not extract URL from element "${elementDescription}"`);
        return null;
    }
    
    /**
     * Finds an element using multiple strategies: fallback selectors, text search, then AI
     * @param {string} elementDescription - Description of element
     * @param {Array<string>} fallbackSelectors - Array of fallback CSS selectors
     * @param {string} pageContext - Additional context
     * @param {Array<string>} searchTexts - Optional array of text strings to search for
     * @returns {Promise<Element|null>} - Found element or null
     */
    async function findElementWithFallback(elementDescription, fallbackSelectors = [], pageContext = '', searchTexts = []) {
        // Strategy 1: Try fallback selectors first (fastest, no API call)
        for (const selector of fallbackSelectors) {
            try {
                const element = document.querySelector(selector);
                if (element) {
                    return element;
                }
            } catch (e) {
                // Invalid selector, continue
            }
        }
        
        // Strategy 2: Try text-based search
        if (searchTexts && searchTexts.length > 0) {
            for (const searchText of searchTexts) {
                const element = findElementByText(searchText);
                if (element) {
                    return element;
                }
            }
        }
        
        // Strategy 3: Try AI (with timeout to avoid blocking)
        const apiKey = localStorage.getItem('gemini-api-key');
        if (apiKey && apiKey !== 'YOUR_GEMINI_API_KEY') {
            try {
                const aiPromise = findElementWithAI(elementDescription, pageContext);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('AI timeout')), 5000) // Increased to 5 seconds
                );
                
                const aiSelector = await Promise.race([aiPromise, timeoutPromise]);
                if (aiSelector) {
                    const element = document.querySelector(aiSelector);
                    if (element) {
                        return element;
                    } else {
                        console.warn(`[findElementWithFallback] AI returned selector "${aiSelector}" but element not found in DOM`);
                    }
                }
            } catch (error) {
                if (error.message !== 'AI timeout') {
                    console.warn(`[findElementWithFallback] AI search failed for "${elementDescription}":`, error.message);
                } else {
                    console.warn(`[findElementWithFallback] AI search timed out for "${elementDescription}"`);
                }
            }
        }
        return null;
    }
    
    /*****************************************************************
     * overrideProceedToCheckoutButton - Overwrites the checkout button
     *****************************************************************/
    async function overrideProceedToCheckoutButton() {
        // First, try to intercept ALL form submissions in the checkout box area as a safety net
        const checkoutBox = document.querySelector('#sc-buy-box');
        if (checkoutBox) {
            const forms = checkoutBox.querySelectorAll('form');
            forms.forEach((form) => {
                // Override form.submit() method - save data then allow submit
                const originalFormSubmit = form.submit;
                form.submit = function() {
                    const syntheticEvent = new Event('click', { bubbles: true, cancelable: true });
                    overrideProceedToCheckoutButtonHandler(syntheticEvent);
                    // Call original submit after saving
                    return originalFormSubmit.call(this);
                };
                
                form.addEventListener('submit', (e) => {
                    const syntheticEvent = new Event('click', { bubbles: true, cancelable: true });
                    overrideProceedToCheckoutButtonHandler(syntheticEvent);
                    // Don't prevent - let form submit naturally
                }, true);
            });
        }

        // Try to find the checkout button using multiple strategies
        const proceedToCheckoutButton = await findElementWithFallback(
            'Proceed to checkout button',
            [
                '#sc-buy-box-ptc-button .a-button-input',
                '#sc-buy-box-ptc-button input[type="submit"]',
                '#sc-buy-box-ptc-button button',
                '#sc-buy-box-ptc-button input',
                '#sc-buy-box-ptc-button',
                '[data-feature-id="proceed-to-checkout-button"]',
                '[data-feature-id="proceed-to-checkout-button"] input',
                '[data-feature-id="proceed-to-checkout-button"] button',
                '[data-feature-id*="checkout"] input',
                '[data-feature-id*="checkout"] button',
                '[data-feature-id*="checkout"]',
                '.a-button-primary input[type="submit"]',
                '.a-button-primary button',
                'input[name="proceedToRetailCheckout"]',
                'button[name="proceedToRetailCheckout"]',
                'form[action*="checkout"] input[type="submit"]',
                'form[action*="checkout"] button',
                '#sc-buy-box form input[type="submit"]',
                '#sc-buy-box form button',
                '#sc-buy-box input[type="submit"]',
                '#sc-buy-box button[type="submit"]'
            ],
            'This is the Amazon cart page. The button should be in the checkout box area (#sc-buy-box) and typically says "Proceed to checkout" or similar. It is usually an input or button element inside a form.',
            ['proceed to checkout', 'proceed to checkout', 'checkout', 'place order'] // Text search terms
        );

        if (!proceedToCheckoutButton) {
            // Set up MutationObserver to watch for button appearance
            let buttonAttached = false;
            const observer = new MutationObserver(async () => {
                if (buttonAttached) {
                    observer.disconnect();
                    return;
                }
                
                // Try to find the button again
                const button = await findElementWithFallback(
                    'Proceed to checkout button',
                    [
                        '#sc-buy-box-ptc-button .a-button-input',
                        '#sc-buy-box-ptc-button input[type="submit"]',
                        '#sc-buy-box-ptc-button button',
                        '#sc-buy-box-ptc-button input',
                        '#sc-buy-box-ptc-button',
                        '[data-feature-id="proceed-to-checkout-button"]',
                        '[data-feature-id="proceed-to-checkout-button"] input',
                        '[data-feature-id="proceed-to-checkout-button"] button',
                        '[data-feature-id*="checkout"] input',
                        '[data-feature-id*="checkout"] button',
                        '.a-button-primary input[type="submit"]',
                        '.a-button-primary button',
                        'input[name="proceedToRetailCheckout"]',
                        'button[name="proceedToRetailCheckout"]',
                        '#sc-buy-box form input[type="submit"]',
                        '#sc-buy-box form button',
                        '#sc-buy-box input[type="submit"]',
                        '#sc-buy-box button[type="submit"]'
                    ],
                    'This is the Amazon cart page. The button should be in the checkout box area (#sc-buy-box) and typically says "Proceed to checkout" or similar.',
                    ['proceed to checkout', 'checkout', 'place order']
                );
                
                if (button) {
                    // Attach handler using the same logic as below
                    button.removeEventListener('click', overrideProceedToCheckoutButtonHandler);
                    button.addEventListener('click', (e) => {
                        overrideProceedToCheckoutButtonHandler(e);
                    }, true);
                    
                    // Also intercept form if present
                    const form = button.closest('form');
                    if (form) {
                        const originalFormSubmit = form.submit;
                        form.submit = function() {
                            const syntheticEvent = new Event('submit', { bubbles: true, cancelable: true });
                            overrideProceedToCheckoutButtonHandler(syntheticEvent);
                            return originalFormSubmit.call(this);
                        };
                        form.addEventListener('submit', (e) => {
                            overrideProceedToCheckoutButtonHandler(e);
                        }, true);
                    }
                    
                    // Enable buttons now that script is ready
                    enableCheckoutButtons();
                    
                    buttonAttached = true;
                    observer.disconnect();
                }
            });
            
            // Start observing
            const targetNode = document.body || document.documentElement;
            observer.observe(targetNode, {
                childList: true,
                subtree: true
            });
            
            // Disconnect after 30 seconds to avoid infinite observation
            setTimeout(() => {
                if (!buttonAttached) {
                    observer.disconnect();
                }
            }, 30000);
            
            return;
        }

        // Completely override the button's onclick attribute
        if (proceedToCheckoutButton.onclick) {
            proceedToCheckoutButton.onclick = null;
        }
        
        // Override the onclick property setter to prevent Amazon from re-adding it
        try {
            Object.defineProperty(proceedToCheckoutButton, 'onclick', {
                set: function(value) {
                    // Don't set it, keep it null
                },
                get: function() {
                    return function(e) {
                        overrideProceedToCheckoutButtonHandler(e || new Event('click'));
                    };
                },
                configurable: true
            });
        } catch (e) {
            // Silently fail
        }

        // Remove any previous click handlers to avoid duplicates
        proceedToCheckoutButton.removeEventListener('click', overrideProceedToCheckoutButtonHandler);

        // Add our new click handler with capture phase to ensure we catch it first
        // Save data quickly, then let Amazon navigate
        proceedToCheckoutButton.addEventListener('click', (e) => {
            overrideProceedToCheckoutButtonHandler(e);
            // Don't prevent default - let Amazon navigate naturally
        }, true);
        
        // Also intercept form submissions (Amazon might submit a form instead of just clicking)
        const form = proceedToCheckoutButton.closest('form');
        if (form) {
            // Override form's submit method
            const originalFormSubmit = form.submit;
            form.submit = function() {
                const syntheticEvent = new Event('submit', { bubbles: true, cancelable: true });
                overrideProceedToCheckoutButtonHandler(syntheticEvent);
                // Call original submit after saving data
                return originalFormSubmit.call(this);
            };
                
            form.addEventListener('submit', (e) => {
                overrideProceedToCheckoutButtonHandler(e);
                // Don't prevent - let form submit naturally after data is saved
            }, true);
        }
        
        // Enable buttons now that script is ready
        enableCheckoutButtons();
        enableCheckoutButtons();
    }
    
    /*************************************************************************************************
     * overrideProceedToCheckoutButtonHandler - Main process when user clicks "Proceed to Checkout"
     *  - Shows a loader/spinner by changing button text (or styling)
     *  - Iterates cart items, fetches category, checks wrappability
     *  - If wrappable, stores sub-items in allItems[title][index] based on 'data-quantity'
     *  - Saves allItems to localStorage
     *  - Redirects to checkout
     *************************************************************************************************/
    // Global navigation blocking state (set up once, used by handler)
    let globalNavigationBlocked = false;
    let originalLocationAssign = null;
    let originalLocationReplace = null;
    let originalLocationHrefDescriptor = null;
    
    // Set up navigation blocking ONCE when extension loads
    function setupNavigationBlocking() {
        if (originalLocationAssign) return; // Already set up
        
        originalLocationAssign = window.location.assign;
        originalLocationReplace = window.location.replace;
        
        // Store original href descriptor
        try {
            originalLocationHrefDescriptor = Object.getOwnPropertyDescriptor(window.location, 'href');
        } catch (e) {
            console.warn("[setupNavigationBlocking] Could not get href descriptor:", e);
        }
    }
    
    // Call setup immediately
    setupNavigationBlocking();
    
    function blockNavigation() {
        if (globalNavigationBlocked) return; // Already blocked
        
        globalNavigationBlocked = true;
        console.log("%c[blockNavigation] ⛔ NAVIGATION BLOCKED ⛔", "color: red; font-weight: bold; font-size: 14px;");
        
        // Override navigation methods
        window.location.assign = function(url) {
            console.log("%c[blockNavigation] BLOCKED window.location.assign:", "color: red; font-weight: bold;", url);
            return false;
        };
        
        window.location.replace = function(url) {
            console.log("%c[blockNavigation] BLOCKED window.location.replace:", "color: red; font-weight: bold;", url);
            return false;
        };
        
        // Try to override href setter
        try {
            let currentHref = window.location.href;
            Object.defineProperty(window.location, 'href', {
                get: function() {
                    return currentHref;
                },
                set: function(url) {
                    if (globalNavigationBlocked) {
                        console.log("%c[blockNavigation] BLOCKED window.location.href:", "color: red; font-weight: bold;", url);
                        return; // Don't set it
                    }
                    currentHref = url;
                    if (originalLocationHrefDescriptor && originalLocationHrefDescriptor.set) {
                        originalLocationHrefDescriptor.set.call(window.location, url);
                    }
                },
                configurable: true
            });
        } catch (e) {
            console.warn("[blockNavigation] Could not override location.href:", e);
        }
    }
    
    function unblockNavigation() {
        if (!globalNavigationBlocked) return; // Already unblocked
        
        globalNavigationBlocked = false;
        console.log("[unblockNavigation] Navigation unblocked.");
        
        // Restore original methods
        if (originalLocationAssign) {
            window.location.assign = originalLocationAssign;
        }
        if (originalLocationReplace) {
            window.location.replace = originalLocationReplace;
        }
        
        // Restore original href descriptor
        try {
            if (originalLocationHrefDescriptor) {
                Object.defineProperty(window.location, 'href', originalLocationHrefDescriptor);
            }
        } catch (e) {
            console.warn("[unblockNavigation] Could not restore location.href:", e);
        }
    }
    
    async function overrideProceedToCheckoutButtonHandler(event) {
        // NEW APPROACH: Save cart data quickly, then let Amazon navigate naturally
        // This is more reliable than trying to prevent Amazon's navigation
        
        // 1) Quickly save cart data to localStorage BEFORE navigation
        try {
            const allItems = {};
    
            // Get all active cart items, filtering by 'data-isselected'
            const allCartItems = document.querySelectorAll('div#sc-active-cart div[data-asin][data-csa-c-type="item"]');
            const cartItemsActive = Array.from(allCartItems).filter(item => item.getAttribute('data-isselected') === '1');
    
            if (cartItemsActive.length === 0) {
                return; // Let Amazon handle it
            }
            
            // Quickly iterate and save - don't wait for async operations
            cartItemsActive.forEach((item) => {
                const asin = item.getAttribute('data-asin');
                if (!asin) {
                    return;
                }
    
                const titleElement = item.querySelector('span.sc-product-title');
                if (!titleElement) {
                    return;
                }
    
                const title = titleElement.innerText.trim().substring(0, 200);
                const imageElement = item.querySelector('.sc-product-image');
                const imageUrl = imageElement ? (imageElement.src || imageElement.getAttribute('src')) : null;
                const quantityAttr = item.getAttribute('data-quantity');
                const quantity = parseInt(quantityAttr) || 1;

                if (!allItems[title]) {
                    allItems[title] = {
                        asin: asin,
                        title: title,
                        imageUrl: imageUrl,
                        options: []
                    };
                }

                for (let i = 0; i < quantity; i++) {
                    allItems[title].options.push({
                        checkbox_wrrapd: false,
                        checkbox_flowers: false,
                        checkbox_amazon_combine: false,
                        selected_wrapping_option: 'wrrapd',
                        selected_flower_design: null
                    });
                }
            });
    
            // Save immediately - don't wait for anything
            saveAllItemsToLocalStorage(allItems);
            
            // Set a flag so the next page knows we're coming from checkout
            localStorage.setItem('wrrapd-coming-from-checkout', 'true');
            
            // DON'T prevent navigation - let Amazon handle it naturally
            // The next page will handle the rest
    
        } catch (err) {
            console.error("[overrideProceedToCheckoutButtonHandler] Error saving cart data:", err);
            // Even if there's an error, let Amazon navigate
        }
        
        // Allow Amazon's default navigation to proceed
        // We'll handle everything on the next page
        return;
    }

    /**********************************************
     * checkGiftWrappable - Checks the category
     **********************************************/
    function checkGiftWrappable(category) {
        const acceptableCategories = [
            'Books',
            'Clothing, Shoes & Jewelry',
            'Electronics',
            'Home & Kitchen',
            'Toys & Games',
            'Office Products',
            'Cell Phones & Accessories'
        ];
        return acceptableCategories.includes(category);
    }
    
    // ----------------------------------------------------- GIFT SECTION -----------------------------------------------------

    function giftSection() {
        console.log("[giftSection] ===== FUNCTION CALLED ===== ");
        const allItems = getAllItemsFromLocalStorage();
        
        // CRITICAL: Only check the flag - don't rely on DOM detection which can be wrong
        // The flag is set ONLY after we've actually changed addresses
        const addressesChangedFlag = localStorage.getItem('wrrapd-addresses-changed') === 'true';
        
        // If addresses were changed (flag is true), we're returning from address selection
        // In this case, ONLY click "Save gift options" and return
        if (addressesChangedFlag) {
            console.log("[giftSection] ✓✓✓ RETURN DETECTED (addressesChangedFlag=true) - clicking 'Save gift options' to proceed to Payment...");
            
            // Clear the flags
            localStorage.setItem('wrrapd-addresses-changed', 'false');
            localStorage.setItem('wrrapd-should-change-address', 'false');
            localStorage.setItem('wrrapd-multi-address-completed', 'false');
            
            // Wait a bit for page to settle, then automatically click Save gift options
            setTimeout(async () => {
                await clickSaveGiftOptionsButton();
            }, 1500);
            
            // Return immediately - do NOT run any other processing
            return;
        }
        
        // FIRST TIME: Always insert Wrrapd options (matching old 3270-line code exactly)
        // The old code was simple - it just always called these functions, no conditions
        console.log("[giftSection] FIRST TIME - inserting Wrrapd options (matching old code behavior)...");
        
        monitorAmazonGiftCheckbox(allItems);
            overrideSaveGiftOptionsButtons();
        insertWrrapdOptions(allItems);

    }

    /**
     * When gift wrapping choices change (e.g. Amazon bag → Wrrapd), Terms must run again.
     */
    function wrrapdGiftOptionsTermsSignature(allItems) {
        try {
            const parts = [];
            const keys = Object.keys(allItems || {}).sort();
            for (let ki = 0; ki < keys.length; ki++) {
                const key = keys[ki];
                const product = allItems[key];
                if (!product || !Array.isArray(product.options)) continue;
                const asin = product.asin || key;
                for (let i = 0; i < product.options.length; i++) {
                    const o = product.options[i];
                    const w = o.checkbox_wrrapd === true ? '1' : '0';
                    const wrap = String(o.selected_wrapping_option || '');
                    parts.push(`${asin}:${i}:${w}:${wrap}`);
                }
            }
            return parts.join('|');
        } catch (e) {
            return 'err';
        }
    }

    function wrrapdTermsAcceptedForCurrentGiftChoices(allItems) {
        const sig = wrrapdGiftOptionsTermsSignature(allItems);
        const stored = localStorage.getItem('wrrapd-terms-gift-signature');
        return (
            localStorage.getItem('wrrapd-terms-accepted') === 'true' &&
            stored !== null &&
            stored === sig
        );
    }

    /**
     * Address automation runs after navigation; gift signature in storage can drift from minor
     * localStorage/DOM sync differences while terms were still accepted. Repair signature once.
     */
    function wrrapdEnsureTermsMatchForAddressAutomation(allItems) {
        if (wrrapdTermsAcceptedForCurrentGiftChoices(allItems)) return true;
        if (localStorage.getItem('wrrapd-terms-accepted') !== 'true') return false;
        const sig = wrrapdGiftOptionsTermsSignature(allItems);
        localStorage.setItem('wrrapd-terms-gift-signature', sig);
        return wrrapdTermsAcceptedForCurrentGiftChoices(allItems);
    }

    async function overrideSaveGiftOptionsButtons() {
        console.log("[overrideSaveGiftOptionsButtons] Overriding Amazon's save buttons.");
    
        // Simple handler function (based on original code)
        const handleSaveButtonClick = function(event) {
            // CRITICAL: Don't intercept programmatic clicks from our own code
            if (localStorage.getItem('wrrapd-programmatic-click-to-payment') === 'true') {
                console.log("[overrideSaveGiftOptionsButtons] Programmatic click to payment detected - NOT intercepting.");
                localStorage.removeItem('wrrapd-programmatic-click-to-payment');
                return; // Don't intercept programmatic clicks
            }
            
            // Check if this is a Wrrapd modal button
            if (event.target.closest('.wrrapd-modal') !== null ||
                event.target.classList.contains('modal-save') ||
                event.target.classList.contains('modal-close') ||
                event.wrrapdModalSave === true ||
                event.wrrapdModalClick === true) {
                return; // Don't process modal buttons
            }
            
            console.log("[overrideSaveGiftOptionsButtons] ✓ Save button clicked! Event:", event.type, "Target:", event.target);
                
                const allItems = getAllItemsFromLocalStorage();
                
                const addressesChangedFlag = localStorage.getItem('wrrapd-addresses-changed') === 'true';
                const addressesShown = areAddressesShownOnGiftOptionsPage();
                const hasWrrapdInStorage = Object.values(allItems).some(
                    (p) => p.options && p.options.some((sub) => sub.checkbox_wrrapd),
                );
                const wantsWrrapdNow = hasWrrapdInStorage || domHasAnyWrrapdCheckboxChecked();
                if (addressesChangedFlag && addressesShown && wrrapdTermsAcceptedForCurrentGiftChoices(allItems)) {
                    console.log(
                        "[overrideSaveGiftOptionsButtons] Return-to-payment path — terms already match current choices — NOT intercepting.",
                    );
                    return;
                }
                if (addressesChangedFlag && addressesShown && !wantsWrrapdNow) {
                    console.log(
                        "[overrideSaveGiftOptionsButtons] Return-to-payment path — no Wrrapd selected (storage or DOM) — NOT intercepting.",
                    );
                    return;
                }
                
                const termsAccepted = wrrapdTermsAcceptedForCurrentGiftChoices(allItems);
                if (termsAccepted) {
                    console.log(
                        "[overrideSaveGiftOptionsButtons] Terms already accepted for this gift configuration — NOT showing modal again.",
                    );
                    return;
                }
                
                const hasWrappedSubItem = wantsWrrapdNow;

                if (hasWrappedSubItem) {
                    console.log("[overrideSaveGiftOptionsButtons] Wrrapd items detected - showing Terms & Conditions modal.");
                    
                    // PREVENT Amazon's natural navigation
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    
                    // Show Terms & Conditions modal - only proceed when user clicks "Proceed"
                    const giftTermsSignature = wrrapdGiftOptionsTermsSignature(allItems);
                    showTermsAndConditionsModal(() => {
                        console.log("[overrideSaveGiftOptionsButtons] User clicked Proceed. Continuing with address selection...");
                        
                        // MATCH OLD CODE: Use allItems (not filtered) - ensures it works when "Add gift options" is clicked
                        // Capture gift messages and sender names for each item
                        captureGiftMessages(allItems);
                        
                        // Check if ALL items are Wrrapd or just a subset
                        const allItemsWrrapd = checkIfAllItemsWrrapd(allItems);
                        
                        // Store the decision in localStorage
                        localStorage.setItem('wrrapd-should-change-address', 'true');
                        localStorage.setItem('wrrapd-all-items', allItemsWrrapd ? 'true' : 'false');
                        
                        // Show loading screen
                        showLoadingScreen();
                        
                        // CRITICAL FIX: If all items are Wrrapd, go to regular address page (NOT multiaddress)
                        // The handleWrrapdAddressSelection function will select Wrrapd address from available addresses
                        // or add it if not available
                        if (allItemsWrrapd) {
                            console.log("[overrideSaveGiftOptionsButtons] All items are Wrrapd - navigating to regular address page (NOT multiaddress)");
                            
                            (async () => {
                                try {
                                    // Find the "Change" link using AI and extract its URL
                                    // This should go to regular address page, not multiaddress
                                    const changeLinkURL = await findLinkURL(
                                        'Change link for delivery address on Amazon gift options page (NOT multiaddress)',
                                        [
                                            'a[aria-label="Change delivery address"]',
                                            'a[aria-label*="Change delivery"]',
                                            'a[data-topage="shipaddressselect"]',
                                            'a[href*="/checkout/p/"][href*="/address"]',
                                            'a[href*="addressselect"]',
                                            'a:contains("Change")',
                                            '.a-link-normal:contains("Change")',
                                            'a[aria-label*="Change"]'
                                        ],
                                        'Amazon gift options page with a Change link for delivery address that navigates to address selection (single address, not multiaddress)',
                                        ['Change']
                                    );
                                    
                                    if (changeLinkURL && changeLinkURL !== 'NO URL FOUND') {
                                        // Ensure URL is NOT multiaddress
                                        if (!changeLinkURL.includes('multiAddress') && !changeLinkURL.includes('multi-address') && !changeLinkURL.includes('itemselect')) {
                                            console.log(`[overrideSaveGiftOptionsButtons] ===== GEMINI FOUND "CHANGE" LINK URL (REGULAR ADDRESS PAGE) =====`);
                                            console.log(`[overrideSaveGiftOptionsButtons] Change link URL: ${changeLinkURL}`);
                                            console.log(`[overrideSaveGiftOptionsButtons] ==========================================`);
                                            console.log(`[overrideSaveGiftOptionsButtons] Navigating to regular address page (NOT multiaddress)...`);
                                            
                                            // Navigate directly to the Change link URL
                                            window.location.href = changeLinkURL;
                                        } else {
                                            // URL is multiaddress, construct regular address URL instead
                                            console.log("[overrideSaveGiftOptionsButtons] Change link points to multiaddress, constructing regular address URL instead...");
                                            const currentURL = window.location.href;
                                            const purchaseIdMatch = currentURL.match(/\/p\/([^\/]+)/);
                                            const purchaseId = purchaseIdMatch ? purchaseIdMatch[1] : null;
                                            
                                            if (purchaseId) {
                                                const regularAddressURL = `https://www.amazon.com/checkout/p/${purchaseId}/address?pipelineType=Chewbacca&referrer=gift&ref_=chk_giftselect_chg_shipaddressselect`;
                                                console.log(`[overrideSaveGiftOptionsButtons] Showing loading screen before navigation...`);
                                                
                                                // Show loading screen BEFORE navigation to hide the redirect
                                                showLoadingScreen();
                                                
                                                // Small delay to ensure loading screen is visible
                                                await new Promise(r => setTimeout(r, 100));
                                                
                                                console.log(`[overrideSaveGiftOptionsButtons] Using regular address URL: ${regularAddressURL}`);
                                                window.location.href = regularAddressURL;
                                            }
                                        }
                                    } else {
                                        console.error("[overrideSaveGiftOptionsButtons] Could not find 'Change' link URL using Gemini AI");
                                        // Fallback: try to construct URL manually (regular address, NOT multiaddress)
                                        const currentURL = window.location.href;
                                        const purchaseIdMatch = currentURL.match(/\/p\/([^\/]+)/);
                                        const purchaseId = purchaseIdMatch ? purchaseIdMatch[1] : null;
                                        
                                        if (purchaseId) {
                                            const fallbackURL = `https://www.amazon.com/checkout/p/${purchaseId}/address?pipelineType=Chewbacca&referrer=gift&ref_=chk_giftselect_chg_shipaddressselect`;
                                            console.log(`[overrideSaveGiftOptionsButtons] Using fallback URL (regular address): ${fallbackURL}`);
                                            window.location.href = fallbackURL;
                                        } else {
                                            console.error("[overrideSaveGiftOptionsButtons] Could not extract purchase ID for fallback");
                                        }
                                    }
                                } catch (error) {
                                    console.error("[overrideSaveGiftOptionsButtons] Error finding Change link with AI:", error);
                                    // Fallback: try to construct URL manually (regular address, NOT multiaddress)
                                    const currentURL = window.location.href;
                                    const purchaseIdMatch = currentURL.match(/\/p\/([^\/]+)/);
                                    const purchaseId = purchaseIdMatch ? purchaseIdMatch[1] : null;
                                    
                                    if (purchaseId) {
                                        const fallbackURL = `https://www.amazon.com/checkout/p/${purchaseId}/address?pipelineType=Chewbacca&referrer=gift&ref_=chk_giftselect_chg_shipaddressselect`;
                                        console.log(`[overrideSaveGiftOptionsButtons] Using fallback URL after error (regular address): ${fallbackURL}`);
                                        window.location.href = fallbackURL;
                                    }
                                }
                            })();
                        } else {
                            // Mixed items - go to multiaddress page
                            console.log("[overrideSaveGiftOptionsButtons] Mixed items (Wrrapd and non-Wrrapd) - will go to multiaddress page");
                            
                            (async () => {
                                try {
                                    // Find the "Change" link using AI and extract its URL
                                    const changeLinkURL = await findLinkURL(
                                        'Change link for delivery address on Amazon gift options page',
                                        [
                                            'a[aria-label="Change delivery address"]',
                                            'a[aria-label*="Change delivery"]',
                                            'a[data-topage="shipaddressselect"]',
                                            'a[href*="/checkout/p/"][href*="/address"]',
                                            'a[href*="addressselect"]',
                                            'a:contains("Change")',
                                            '.a-link-normal:contains("Change")',
                                            'a[aria-label*="Change"]'
                                        ],
                                        'Amazon gift options page with a Change link for delivery address that navigates to address selection',
                                        ['Change']
                                    );
                                    
                                    if (changeLinkURL && changeLinkURL !== 'NO URL FOUND') {
                                        console.log(`[overrideSaveGiftOptionsButtons] ===== GEMINI FOUND "CHANGE" LINK URL =====`);
                                        console.log(`[overrideSaveGiftOptionsButtons] Change link URL: ${changeLinkURL}`);
                                        console.log(`[overrideSaveGiftOptionsButtons] ==========================================`);
                                        console.log(`[overrideSaveGiftOptionsButtons] Showing loading screen before navigation...`);
                                        
                                        // Show loading screen BEFORE navigation to hide the redirect
                                        showLoadingScreen();
                                        
                                        // Small delay to ensure loading screen is visible
                                        await new Promise(r => setTimeout(r, 100));
                                        
                                        console.log(`[overrideSaveGiftOptionsButtons] Navigating directly to Change link URL...`);
                                        
                                        // Navigate directly to the Change link URL
                                        window.location.href = changeLinkURL;
                                    } else {
                                        console.error("[overrideSaveGiftOptionsButtons] Could not find 'Change' link URL using Gemini AI");
                                        // Fallback: try to construct URL manually
                                        const currentURL = window.location.href;
                                        const purchaseIdMatch = currentURL.match(/\/p\/([^\/]+)/);
                                        const purchaseId = purchaseIdMatch ? purchaseIdMatch[1] : null;
                                        
                                        if (purchaseId) {
                                            const fallbackURL = `https://www.amazon.com/checkout/p/${purchaseId}/address?pipelineType=Chewbacca&referrer=gift&ref_=chk_giftselect_chg_shipaddressselect`;
                                            console.log(`[overrideSaveGiftOptionsButtons] Showing loading screen before navigation...`);
                                            
                                            // Show loading screen BEFORE navigation to hide the redirect
                                            showLoadingScreen();
                                            
                                            // Small delay to ensure loading screen is visible
                                            await new Promise(r => setTimeout(r, 100));
                                            
                                            console.log(`[overrideSaveGiftOptionsButtons] Using fallback URL: ${fallbackURL}`);
                                            window.location.href = fallbackURL;
                                        } else {
                                            console.error("[overrideSaveGiftOptionsButtons] Could not extract purchase ID for fallback");
                                        }
                                    }
                                } catch (error) {
                                    console.error("[overrideSaveGiftOptionsButtons] Error finding Change link with AI:", error);
                                    // Fallback: try to construct URL manually
                                    const currentURL = window.location.href;
                                    const purchaseIdMatch = currentURL.match(/\/p\/([^\/]+)/);
                                    const purchaseId = purchaseIdMatch ? purchaseIdMatch[1] : null;
                                    
                                    if (purchaseId) {
                                        const fallbackURL = `https://www.amazon.com/checkout/p/${purchaseId}/address?pipelineType=Chewbacca&referrer=gift&ref_=chk_giftselect_chg_shipaddressselect`;
                                        console.log(`[overrideSaveGiftOptionsButtons] Using fallback URL after error: ${fallbackURL}`);
                                        window.location.href = fallbackURL;
                                    }
                                }
                            })();
                        }
                    }, giftTermsSignature);
                    
                    return false;
            }
        };
        
        /**
         * Terms modal must run ONLY for Amazon's "Save gift options" (not every primary button).
         * Chewbacca uses #checkout-secondary-continue-button-id + input[data-testid="secondary-continue-button"].
         */
        function isDelegatedSaveGiftOptionsClick(target) {
            if (!target || typeof target.closest !== 'function') return false;
            if (target.closest('.wrrapd-modal')) return false;

            if (target.closest('#checkout-secondary-continue-button-id')) return true;
            if (target.closest('input[data-testid="secondary-continue-button"]')) return true;

            const primaryBar = target.closest('#orderSummaryPrimaryActionBtn');
            if (primaryBar) {
                const announce = primaryBar.querySelector('.a-button-text, [id$="-announce"]');
                const label = (announce && announce.textContent) ? announce.textContent.toLowerCase() : '';
                if (label.includes('save gift')) return true;
            }
            return false;
        }

        // ALSO use event delegation on document body to catch clicks even if button is replaced
        const delegatedHandler = function(event) {
            const target = event.target;
            
            // CRITICAL: Don't intercept programmatic clicks from our own code
            if (localStorage.getItem('wrrapd-programmatic-click-to-payment') === 'true') {
                console.log("[overrideSaveGiftOptionsButtons] Delegated handler: Programmatic click to payment detected - NOT intercepting.");
                localStorage.removeItem('wrrapd-programmatic-click-to-payment');
                return; // Don't intercept programmatic clicks
            }
            
            const isSaveButton = isDelegatedSaveGiftOptionsClick(target);
            
            if (isSaveButton) {
                // CRITICAL: Don't intercept programmatic clicks (check FIRST before anything else)
                if (localStorage.getItem('wrrapd-programmatic-click-to-payment') === 'true') {
                    console.log("[overrideSaveGiftOptionsButtons] Delegated handler: Programmatic click detected - NOT intercepting.");
                    return; // Don't intercept programmatic clicks
                }
                
                // CRITICAL: Check if addresses were already changed by our script (flag-based check is most reliable)
                // If addresses were changed, we're returning from address selection - don't intercept
                const addressesChangedFlag = localStorage.getItem('wrrapd-addresses-changed') === 'true';
                
                // CrITICAL: Check if addresses are already shown before intercepting
                // This could be addresses below items (multi-address) OR top address section (100% Wrrapd)
                const addressesShown = areAddressesShownOnGiftOptionsPage();
                
                const itemsForTerms = getAllItemsFromLocalStorage();
                syncWrrapdSelectionsFromGiftDom(itemsForTerms);
                const hasWrrapdInStorage = Object.values(itemsForTerms).some(
                    (p) => p.options && p.options.some((sub) => sub.checkbox_wrrapd),
                );
                const wantsWrrapdNow = hasWrrapdInStorage || domHasAnyWrrapdCheckboxChecked();
                if (addressesShown && addressesChangedFlag && wrrapdTermsAcceptedForCurrentGiftChoices(itemsForTerms)) {
                    console.log(
                        "[overrideSaveGiftOptionsButtons] Delegated handler: return-to-payment — terms already match — NOT intercepting.",
                    );
                    return;
                }
                if (addressesShown && addressesChangedFlag && !wantsWrrapdNow) {
                    console.log(
                        "[overrideSaveGiftOptionsButtons] Delegated handler: return-to-payment — no Wrrapd — NOT intercepting.",
                    );
                    return;
                }
                
                if (wrrapdTermsAcceptedForCurrentGiftChoices(itemsForTerms)) {
                    console.log(
                        "[overrideSaveGiftOptionsButtons] Delegated handler: Terms already accepted for this gift configuration — NOT intercepting.",
                    );
                    return;
                }
                
                console.log("[overrideSaveGiftOptionsButtons] Delegated handler caught click on save button");
                handleSaveButtonClick(event);
            }
        };
        
        // Capture-phase click only (mousedown + click both fired the handler and could double-open the modal)
        document.body.addEventListener('click', delegatedHandler, true);
        console.log("[overrideSaveGiftOptionsButtons] Event delegation (Save gift options only) on document.body, capture click");
        
        // ALSO intercept any navigation that happens after clicking save button
        const checkAndInterceptNavigation = () => {
                const allItems = getAllItemsFromLocalStorage();
                const hasWrappedSubItem = Object.values(allItems).some(product => 
                    product.options && product.options.some(subItem => subItem.checkbox_wrrapd)
                );

            // Don't show loading screen if we're on payment page or payment summary already exists
            const isPaymentPage = window.location.href.includes('/spc') || window.location.href.includes('payselect');
            const paymentSummaryExists = document.querySelector('#wrrapd-summary') !== null;
            
            if (hasWrappedSubItem && localStorage.getItem('wrrapd-should-change-address') !== 'true' && !isPaymentPage && !paymentSummaryExists) {
                console.log("[overrideSaveGiftOptionsButtons] Detected navigation with Wrrapd items - setting flags!");
                    captureGiftMessages(allItems);
                const allItemsWrrapd = checkIfAllItemsWrrapd(allItems);
                    localStorage.setItem('wrrapd-should-change-address', 'true');
                localStorage.setItem('wrrapd-all-items', allItemsWrrapd ? 'true' : 'false');
                    showLoadingScreen();
                // Don't redirect - let Amazon navigate naturally, we'll handle it on the next page
            }
        };
        
        // Monitor for URL changes that might indicate navigation happened
        let lastUrl = window.location.href;
        const urlCheckInterval = setInterval(() => {
            if (window.location.href !== lastUrl) {
                lastUrl = window.location.href;
                // If we're navigating away from gift options page and Wrrapd items are selected
                if (!window.location.href.includes('/gift') && 
                    !window.location.href.includes('itemselect') &&
                    localStorage.getItem('wrrapd-should-change-address') !== 'true') {
                    checkAndInterceptNavigation();
                }
            }
        }, 100);
        
        // Clear interval after 30 seconds
        setTimeout(() => clearInterval(urlCheckInterval), 30000);

        // Find buttons using AI with fallback to original selectors
        const findButtons = async () => {
            const buttons = [];
            
            // Chewbacca "Save gift options" (secondary continue — user-confirmed selector)
            const secondarySave = document.querySelector(
                '#checkout-secondary-continue-button-id input.a-button-input, input[data-testid="secondary-continue-button"]',
            );
            if (secondarySave && secondarySave.closest('.wrrapd-modal') === null) {
                buttons.push(secondarySave);
                console.log("[overrideSaveGiftOptionsButtons] Found checkout-secondary-continue (Save gift options) button");
            }

            // Try original selectors first (fastest) — only when label is Save gift (avoid wrong page primary actions)
            const orderSummaryButton = document.querySelector('#orderSummaryPrimaryActionBtn .a-button-input');
            if (orderSummaryButton && orderSummaryButton.closest('.wrrapd-modal') === null) {
                const bar = orderSummaryButton.closest('#orderSummaryPrimaryActionBtn');
                const announce = bar && bar.querySelector('.a-button-text, [id$="-announce"]');
                const label = (announce && announce.textContent) ? announce.textContent.toLowerCase() : '';
                if (label.includes('save gift') && !buttons.includes(orderSummaryButton)) {
                    buttons.push(orderSummaryButton);
                    console.log("[overrideSaveGiftOptionsButtons] Found orderSummaryPrimaryActionBtn (Save gift options) button");
                }
            }
            
            // Try second original selector
            let buttonInner = document.querySelector('#a-autoid-4 [data-testid=""]');
            if (!buttonInner) {
                buttonInner = document.querySelector('.a-button-inner > [data-testid=""]');
            }
            if (buttonInner && buttonInner.closest('.wrrapd-modal') === null) {
                buttons.push(buttonInner);
                console.log("[overrideSaveGiftOptionsButtons] Found buttonInner");
            }
            
            // If original selectors didn't work, use AI to find buttons
            if (buttons.length === 0) {
                console.log("[overrideSaveGiftOptionsButtons] Original selectors didn't work, using AI...");
                const pageContext = 'This is the Amazon gift options page. Find the "Save gift options" or "Continue" button that saves gift options. This is the MAIN button on the page, NOT inside any modal.';
                
                const aiButton = await findElementWithFallback(
                    'Save gift options or Continue button on Amazon gift options page (NOT in a modal)',
                    [
                        '#orderSummaryPrimaryActionBtn .a-button-input',
                        '#orderSummaryPrimaryActionBtn button',
                        '#orderSummaryPrimaryActionBtn input',
                        '#a-autoid-4 [data-testid=""]',
                        '.a-button-inner > [data-testid=""]',
                        '.a-button-primary input',
                        '.a-button-primary button',
                        'button[aria-label*="save"]',
                        'button[aria-label*="continue"]'
                    ],
                    pageContext,
                    ['save gift options', 'continue']
                );
                
                if (aiButton && aiButton.closest('.wrrapd-modal') === null) {
                    buttons.push(aiButton);
                    console.log("[overrideSaveGiftOptionsButtons] Found button via AI");
                }
            }
            
            return buttons;
        };

        // Try to find buttons immediately
        let buttons = await findButtons();
        
        // Attach handlers to all found buttons - use capture phase and multiple event types
        buttons.forEach((button, index) => {
            console.log(`[overrideSaveGiftOptionsButtons] Attaching handler to button #${index + 1}`, button);
            button.addEventListener('click', handleSaveButtonClick, true); // Capture phase
            button.addEventListener('mousedown', handleSaveButtonClick, true);
            
            // Also override onclick if it exists
            if (button.onclick) {
                const originalOnclick = button.onclick;
                button.onclick = function(e) {
                    handleSaveButtonClick(e);
                    if (originalOnclick) return originalOnclick.call(this, e);
                };
            }
            
            // Also intercept form submissions if button is in a form
            const form = button.closest('form');
            if (form) {
                const originalSubmit = form.submit;
                form.submit = function() {
                    const syntheticEvent = new Event('click', { bubbles: true, cancelable: true });
                    handleSaveButtonClick(syntheticEvent);
                    return originalSubmit.call(this);
                };
                form.addEventListener('submit', handleSaveButtonClick, true);
            }
        });
        
        // CRITICAL: Also set up MutationObserver to watch for dynamically added buttons
        // This is essential when "Add gift options" is clicked and buttons appear dynamically
        const setupButtonHandlers = async () => {
            const foundButtons = await findButtons();
            foundButtons.forEach((button, index) => {
                // Check if handler already attached
                if (button.dataset.wrrapdHandlerAttached === 'true') {
                    return;
                }
                
                console.log(`[overrideSaveGiftOptionsButtons] Attaching handler to button #${index + 1}`, button);
                button.dataset.wrrapdHandlerAttached = 'true';
                button.addEventListener('click', handleSaveButtonClick, true); // Capture phase
                button.addEventListener('mousedown', handleSaveButtonClick, true);
                
                // Also override onclick if it exists
                if (button.onclick) {
                    const originalOnclick = button.onclick;
                    button.onclick = function(e) {
                        handleSaveButtonClick(e);
                        if (originalOnclick) return originalOnclick.call(this, e);
                    };
                }
                
                // Also intercept form submissions if button is in a form
                const form = button.closest('form');
                if (form) {
                    const originalSubmit = form.submit;
                    form.submit = function() {
                        const syntheticEvent = new Event('click', { bubbles: true, cancelable: true });
                        handleSaveButtonClick(syntheticEvent);
                        return originalSubmit.call(this);
                    };
                    form.addEventListener('submit', handleSaveButtonClick, true);
                }
            });
        };
        
        // Set up handlers for buttons found immediately
        await setupButtonHandlers();
        
        // CRITICAL: Use MutationObserver to watch for dynamically added buttons
        // This ensures buttons are intercepted even when "Add gift options" opens them dynamically
        const buttonObserver = new MutationObserver(() => {
            setupButtonHandlers();
        });
        
        buttonObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // Also check periodically as backup
        const checkInterval = setInterval(() => {
            setupButtonHandlers();
        }, 2000);
        
        // Clear interval after 60 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
        }, 60000);
        
        // If no buttons found initially, use MutationObserver to wait
        if (buttons.length === 0) {
            console.log("[overrideSaveGiftOptionsButtons] No buttons found. Setting up MutationObserver...");
            
            let buttonsAttached = false;
            const observer = new MutationObserver(async () => {
                if (buttonsAttached) return;
                
                const foundButtons = await findButtons();
                if (foundButtons.length > 0) {
                    foundButtons.forEach((button, index) => {
                        console.log(`[overrideSaveGiftOptionsButtons] Attaching handler to button #${index + 1} via observer`);
                        button.addEventListener('click', handleSaveButtonClick);
                    });
                    buttonsAttached = true;
                    observer.disconnect();
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                if (!buttonsAttached) {
                    console.warn("[overrideSaveGiftOptionsButtons] Buttons not found after 15 seconds.");
                }
            }, 15000);
        }
    }

    /**
     * Check if addresses are shown on gift options page (either below items OR in top address section)
     * Returns true if:
     * 1. Addresses are shown below items (multi-address case), OR
     * 2. Top address section shows Wrrapd address (100% Wrrapd case - no multi-address)
     */
    function areAddressesShownOnGiftOptionsPage() {
        // Check 1: Addresses shown below items (multi-address case)
        const addressesBelowItems = document.querySelectorAll('[class*="address"], [class*="shipping"], [data-testid*="address"]').length > 0 ||
                                   Array.from(document.querySelectorAll('span, div, p, a')).some(el => {
                                       const text = (el.textContent || el.innerText || '').trim();
                                       return text.includes('Shipping to:') && 
                                              (text.includes('PO BOX 26067') || text.includes('Wrrapd'));
                                   });
        
        if (addressesBelowItems) {
            return true;
        }
        
        // Check 2: Top address section shows Wrrapd address (100% Wrrapd case)
        // Look for address section at the top of the page (usually in a header or summary area)
        const topAddressSection = document.querySelector('[id*="address"], [class*="address-summary"], [class*="shipping-address"], [data-testid*="address"]') ||
                                  Array.from(document.querySelectorAll('div, section, header')).find(el => {
                                      const text = (el.textContent || el.innerText || '').trim();
                                      return (text.includes('Shipping address') || text.includes('Delivery address')) &&
                                             (text.includes('PO BOX 26067') || text.includes('Wrrapd'));
                                  });
        
        if (topAddressSection) {
            const sectionText = (topAddressSection.textContent || topAddressSection.innerText || '').trim();
            if (sectionText.includes('PO BOX 26067') || sectionText.includes('Wrrapd')) {
                return true;
            }
        }
        
        // Also check for any visible Wrrapd address text in the page (fallback)
        const hasWrrapdAddress = Array.from(
            document.querySelectorAll('[class*="address"], [data-testid*="address"], .a-box, .a-box-inner'),
        ).some((el) => {
            const text = (el.textContent || el.innerText || '').trim();
            return wrrapdHubSignatureFromText(text);
        });

        return hasWrrapdAddress;
    }

    /**
     * checkIfAllItemsWrrapd - Checks if ALL items in the cart are selected for Wrrapd gift-wrapping
     * Returns true if all items are Wrrapd, false if only a subset
     */
    function checkIfAllItemsWrrapd(allItems) {
        let totalSubItems = 0;
        let wrrapdSubItems = 0;
        
        for (const [title, product] of Object.entries(allItems)) {
            if (!product.options) continue;
            
            totalSubItems += product.options.length;
            wrrapdSubItems += product.options.filter(s => s.checkbox_wrrapd).length;
        }
        
        const allWrrapd = (totalSubItems > 0 && wrrapdSubItems === totalSubItems);
        console.log(`[checkIfAllItemsWrrapd] Total items: ${totalSubItems}, Wrrapd items: ${wrrapdSubItems}, All Wrrapd: ${allWrrapd}`);
        
        return allWrrapd;
    }

    /**
     * Detect Wrrapd hub text in Amazon address blocks (labels vary; avoid over-strict matching).
     */
    function wrrapdHubSignatureFromText(raw) {
        const t = String(raw || '')
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim();
        if (!t) return false;
        const hasBrand = t.includes('WRRAPD');
        const hasPo = (t.includes('PO BOX') || t.includes('P.O. BOX')) && t.includes('26067');
        const hasJax = t.includes('JACKSONVILLE');
        const hasZip = t.includes('32218') || t.includes('32226');
        const hasFl = t.includes(' FL ') || t.endsWith(' FL') || t.includes(', FL,') || t.includes('FLORIDA');
        if (hasBrand && (hasJax || hasZip || hasPo || hasFl)) return true;
        if (hasPo && (hasJax || hasZip || hasFl)) return true;
        return false;
    }

    function wrrapdListTitlesWithAnyWrrapdGiftWrap(allItems) {
        const out = [];
        for (const [title, product] of Object.entries(allItems || {})) {
            if (!product || !Array.isArray(product.options)) continue;
            if (product.options.some((o) => o && o.checkbox_wrrapd === true)) out.push(title);
        }
        return out;
    }

    function wrrapdRemoveAddressGiftMismatchModal() {
        document.getElementById('wrrapd-address-gift-mismatch-overlay')?.remove();
    }

    function wrrapdShowAddressGiftMismatchModal(bodyText, itemTitles) {
        wrrapdRemoveAddressGiftMismatchModal();
        const wrap = document.createElement('div');
        wrap.id = 'wrrapd-address-gift-mismatch-overlay';
        wrap.setAttribute('role', 'alertdialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.setAttribute('aria-label', 'Wrrapd address required for gift-wrap');
        wrap.style.cssText =
            'position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,0.88);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;';
        const inner = document.createElement('div');
        inner.style.cssText =
            'max-width:520px;background:#fff;border-radius:12px;padding:22px 24px;box-shadow:0 20px 50px rgba(0,0,0,0.35);color:#0f172a;line-height:1.5;font-size:15px;';
        const h = document.createElement('div');
        h.style.cssText = 'font-weight:700;font-size:18px;margin-bottom:10px;color:#b45309;';
        h.textContent = 'Wrrapd gift-wrap needs the Wrrapd hub address';
        const p = document.createElement('p');
        p.style.margin = '0 0 12px';
        p.textContent = bodyText;
        inner.appendChild(h);
        inner.appendChild(p);
        const titles = itemTitles && itemTitles.length ? itemTitles : [];
        if (titles.length) {
            const sub = document.createElement('div');
            sub.style.cssText = 'font-weight:600;margin-bottom:6px;font-size:14px;';
            sub.textContent = 'Items with Wrrapd gift-wrap in this checkout:';
            inner.appendChild(sub);
            const ul = document.createElement('ul');
            ul.style.cssText = 'margin:0 0 14px 20px;padding:0;';
            for (const t of titles) {
                const li = document.createElement('li');
                li.textContent = t;
                ul.appendChild(li);
            }
            inner.appendChild(ul);
        }
        const p2 = document.createElement('p');
        p2.style.cssText = 'margin:0 0 16px;font-size:14px;color:#334155;';
        p2.textContent =
            'On Amazon, choose the Wrrapd hub for those lines, or go back and remove Wrrapd gift-wrap for anything shipping to your own address.';
        inner.appendChild(p2);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = "OK — I'll fix it on Amazon";
        btn.style.cssText =
            'padding:10px 18px;border-radius:8px;border:none;background:#1e293b;color:#fff;font-weight:600;cursor:pointer;font-size:14px;';
        btn.addEventListener('click', () => wrrapdRemoveAddressGiftMismatchModal());
        inner.appendChild(btn);
        wrap.appendChild(inner);
        document.body.appendChild(wrap);
    }

    function wrrapdShowTermsRequiredBeforeAddressModal() {
        wrrapdRemoveAddressGiftMismatchModal();
        const wrap = document.createElement('div');
        wrap.id = 'wrrapd-address-gift-mismatch-overlay';
        wrap.setAttribute('role', 'alertdialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.setAttribute('aria-label', 'Wrrapd terms required');
        wrap.style.cssText =
            'position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,0.88);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;';
        const inner = document.createElement('div');
        inner.style.cssText =
            'max-width:520px;background:#fff;border-radius:12px;padding:22px 24px;box-shadow:0 20px 50px rgba(0,0,0,0.35);color:#0f172a;line-height:1.5;font-size:15px;';
        const h = document.createElement('div');
        h.style.cssText = 'font-weight:700;font-size:18px;margin-bottom:10px;color:#b45309;';
        h.textContent = 'Accept Wrrapd Terms before shipping';
        const p = document.createElement('p');
        p.style.margin = '0 0 12px';
        p.textContent =
            'Wrrapd could not confirm that Terms were accepted for your current gift-wrap choices. Go back to the gift options step, save, and complete the Wrrapd Terms modal — then return to this address page.';
        inner.appendChild(h);
        inner.appendChild(p);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'OK';
        btn.style.cssText =
            'padding:10px 18px;border-radius:8px;border:none;background:#1e293b;color:#fff;font-weight:600;cursor:pointer;font-size:14px;';
        btn.addEventListener('click', () => wrrapdRemoveAddressGiftMismatchModal());
        inner.appendChild(btn);
        wrap.appendChild(inner);
        document.body.appendChild(wrap);
    }

    /**
     * Amazon expanders often use <a href="javascript:void(0)...">. Calling .click() runs that URL and
     * trips checkout CSP (“Running the JavaScript URL…”). Prefer aria/DOM expansion instead.
     */
    function wrrapdSafeExpandActivatorNoJavascriptUrl(activator) {
        if (!activator) return false;
        const href = String(
            activator.href || (activator.getAttribute && activator.getAttribute('href')) || '',
        )
            .trim()
            .toLowerCase();
        const tag = (activator.tagName || '').toLowerCase();
        if (tag === 'a' && href.startsWith('javascript:')) {
            try {
                activator.setAttribute('aria-expanded', 'true');
            } catch (_) {
                /* ignore */
            }
            document.querySelectorAll('.a-expander-collapsed-content').forEach((c) => {
                try {
                    c.style.display = '';
                    c.setAttribute('aria-hidden', 'false');
                } catch (_) {
                    /* ignore */
                }
            });
            return true;
        }
        try {
            activator.setAttribute('aria-expanded', 'true');
            activator.click();
            return true;
        } catch (_) {
            return false;
        }
    }

    /** Expand collapsed address list so the hub row exists in the DOM. */
    function wrrapdClickShowMoreAddressesIfPresent() {
        const candidates = Array.from(document.querySelectorAll('a, button, span, div[role="button"]')).filter(
            (el) => {
                const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
                return /^show more addresses$/i.test(t) || /show more addresses/i.test(t);
            },
        );
        for (const el of candidates) {
            if (!el.offsetParent && el.getClientRects().length === 0) continue;
            const clickable = el.closest('a, button, [role="button"]') || el;
            if (wrrapdSafeExpandActivatorNoJavascriptUrl(clickable)) return true;
        }
        const expandIcon = document.querySelector('i.a-icon.a-icon-expand');
        if (expandIcon) {
            const expanderLink = expandIcon.closest('a') || expandIcon.parentElement;
            if (wrrapdSafeExpandActivatorNoJavascriptUrl(expanderLink)) return true;
        }
        return false;
    }

    function wrrapdCollectAddressRadioLikeControls() {
        const root =
            document.getElementById('checkout-main') ||
            document.querySelector('[data-checkout-page]') ||
            document.getElementById('checkout-experience-container') ||
            document.body;
        const set = new Set();
        root.querySelectorAll('input[type="radio"]').forEach((el) => {
            if (!wrrapdIsInCheckoutOrderSummaryRail(el)) set.add(el);
        });
        root.querySelectorAll('[role="radio"]').forEach((el) => {
            if (!wrrapdIsInCheckoutOrderSummaryRail(el)) set.add(el);
        });
        return Array.from(set);
    }

    function wrrapdGetAddressTextNearControl(control) {
        if (!control) return '';
        const addressContainer =
            control.closest(
                '.a-box, .a-box-inner, [class*="address"], label, [class*="radio"], [data-testid*="address"], .a-radio, li, .a-row',
            ) || control.parentElement;
        return addressContainer ? addressContainer.textContent?.trim() || '' : '';
    }

    function wrrapdGetDisplayedSingleAddressSelectionText() {
        const sel = document.querySelector('.list-address-selected');
        if (sel && (sel.textContent || '').replace(/\s+/g, ' ').trim().length > 12) {
            return sel.textContent || '';
        }
        const checked = document.querySelector(
            'input[type="radio"][name*="shipTo"]:checked, input[type="radio"][name*="ShipTo"]:checked, input[type="radio"]:checked',
        );
        if (checked) {
            const box =
                checked.closest(
                    '.a-box, .a-box-inner, .a-row, li, label, .a-radio, [data-testid*="address"]',
                ) || checked.parentElement;
            return (box && box.textContent) || '';
        }
        return '';
    }

    function wrrapdMaybeShowSingleAddressGiftWrapMismatch(allItems) {
        if (!hasAnyWrrapdGiftWrapInCart(allItems)) return;
        const blob = wrrapdGetDisplayedSingleAddressSelectionText();
        if (!blob || blob.replace(/\s+/g, ' ').trim().length < 24) return;
        if (wrrapdHubSignatureFromText(blob)) return;
        wrrapdShowAddressGiftMismatchModal(
            'The address currently selected on Amazon does not look like the Wrrapd gift-wrap hub. Wrrapd-wrapped items must ship to the hub.',
            wrrapdListTitlesWithAnyWrrapdGiftWrap(allItems),
        );
    }

    /**
     * Captures gift messages and sender names for items selected with Wrrapd
     */
    function captureGiftMessages(allItems) {
        console.log("[captureGiftMessages] Capturing gift messages and sender names");
        
        // Get all gift option items
        const items = document.querySelectorAll('#giftOptions .a-box-group .a-box-inner .a-section.a-spacing-none[id^="item-"]');
        
        // Key: title, Value: next sub-item index to use.
        let subItemIndexTracker = {};
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            // Extract the title from Amazon's DOM
            const itemTitleElement = item.querySelector('span.a-truncate-cut');
            if (!itemTitleElement) {
                console.warn(`[captureGiftMessages] Row #${i}: Title element not found.`);
                continue;
            }
            
            const itemTitle = itemTitleElement.textContent.trim().substring(0, 200);
            console.log(`[captureGiftMessages] Processing item "${itemTitle}"`);
            
            // Get the product object from our stored data
            const productObj = resolveProductByRowTitle(allItems, itemTitle, i, item);
            if (!productObj) {
                console.warn(`[captureGiftMessages] No product found with title "${itemTitle}".`);
                continue;
            }

            const trackerKey =
                Object.keys(allItems).find((k) => allItems[k] === productObj) || itemTitle;
            
            // Initialize the subitem index tracker for this title if it doesn't exist
            if (typeof subItemIndexTracker[trackerKey] === 'undefined') {
                subItemIndexTracker[trackerKey] = 0;
            }
            
            // Get the current subindex for this product
            const currentSubIndex = subItemIndexTracker[trackerKey];
            
            // Make sure there's a subitem at this index
            if (currentSubIndex >= productObj.options.length) {
                console.warn(`[captureGiftMessages] Row #${i}: No remaining sub-items for "${itemTitle}".`);
                continue;
            }
            
            // Get the subitem
            const subItem = productObj.options[currentSubIndex];
            
            // Move the "pointer" forward
            subItemIndexTracker[trackerKey] = currentSubIndex + 1;
            
            // Only capture for items with Wrrapd selected
            if (subItem.checkbox_wrrapd) {
                // Find the gift message textarea (using index i since each row has its own message area)
                const giftMessageElement = document.getElementById(`message-area-${i}`);
                // Find the sender name input
                const senderNameElement = document.getElementById(`gift-message-sender-input-${i}`);
                
                if (giftMessageElement) {
                    subItem.giftMessage = giftMessageElement.value.trim();
                    console.log(`[captureGiftMessages] Captured gift message for "${itemTitle}": "${subItem.giftMessage}"`);
                } else {
                    console.warn(`[captureGiftMessages] Gift message element not found for "${itemTitle}"`);
                }
                
                if (senderNameElement) {
                    subItem.senderName = senderNameElement.value.trim();
                    console.log(`[captureGiftMessages] Captured sender name for "${itemTitle}": "${subItem.senderName}"`);
                } else {
                    console.warn(`[captureGiftMessages] Sender name element not found for "${itemTitle}"`);
                }
                
                // Save the updated product object to localStorage
                saveItemToLocalStorage(productObj);
            }
        }
        
        console.log("[captureGiftMessages] Finished capturing gift messages and sender names");
    }

    function monitorAmazonGiftCheckbox(allItems) {
        console.log("[monitorAmazonGiftCheckbox] Monitoring Amazon gift checkboxes.");
    
        // We'll track how many sub-items we've used for each title
        let subItemIndexTracker = {};
    
        const amazonGiftCheckboxes = document.querySelectorAll('input[id^="toggle-gift-item-checkbox-"]');
        if (amazonGiftCheckboxes.length === 0) {
            console.log("[monitorAmazonGiftCheckbox] No gift checkboxes found on the page.");
            return;
        }
    
        amazonGiftCheckboxes.forEach((checkbox, index) => {
            // Find the container for this row
            const itemContainer = document.querySelector(`#item-${index}`);
            if (!itemContainer) {
                console.log(`[monitorAmazonGiftCheckbox] Row #${index}: Item container not found.`);
                return;
            }
    
            // Extract the truncated title from the DOM - try multiple selectors
            let itemTitleElement = itemContainer.querySelector('span.a-truncate-cut') ||
                                  itemContainer.querySelector('span.a-truncate-full') ||
                                  itemContainer.querySelector('a.a-link-normal.a-color-base') ||
                                  itemContainer.querySelector('.a-text-bold') ||
                                  itemContainer.querySelector('span[class*="truncate"]') ||
                                  itemContainer.querySelector('h2') ||
                                  itemContainer.querySelector('h3') ||
                                  itemContainer.querySelector('[data-item-title]') ||
                                  itemContainer.querySelector('.item-title') ||
                                  itemContainer.querySelector('a[href*="/dp/"]') ||
                                  itemContainer.querySelector('a[href*="/gp/product/"]');
            
            if (!itemTitleElement) {
                console.warn(`[monitorAmazonGiftCheckbox] Row #${index}: Title element not found. Trying to find any text in container...`);
                // Last resort: find any link or text element that might contain the title
                const allLinks = itemContainer.querySelectorAll('a');
                for (const link of allLinks) {
                    const linkText = (link.textContent || link.innerText || '').trim();
                    if (linkText.length > 10 && linkText.length < 200 && 
                        !linkText.toLowerCase().includes('remove') && 
                        !linkText.toLowerCase().includes('gift')) {
                        itemTitleElement = link;
                        break;
                    }
                }
            }
            
            if (!itemTitleElement) {
                console.warn(`[monitorAmazonGiftCheckbox] Row #${index}: Title element not found. Skipping this row.`);
                return;
            }
    
            // Try both textContent and innerText, as Amazon may use different methods
            const itemTitle = (itemTitleElement.textContent || itemTitleElement.innerText || '').trim().substring(0, 200);
            if (!itemTitle || itemTitle.length < 5) {
                console.warn(`[monitorAmazonGiftCheckbox] Row #${index}: Unable to retrieve title. Element found but no text. Selector: ${itemTitleElement.tagName}.${itemTitleElement.className}`);
                console.warn(`[monitorAmazonGiftCheckbox] Row #${index}: Element HTML: ${itemTitleElement.outerHTML.substring(0, 200)}`);
                return;
            }
    
            // Determine which subItem index to use for this row
            const productObj = resolveProductByRowTitle(allItems, itemTitle, index, itemContainer);
            if (!productObj || !productObj.options || productObj.options.length === 0) {
                console.error(`[monitorAmazonGiftCheckbox] Row #${index}: No matching product or no sub-items for "${itemTitle}".`);
                return;
            }

            const trackerKey =
                Object.keys(allItems).find((k) => allItems[k] === productObj) || itemTitle;
    
            const currentSubIndex = subItemIndexTracker[trackerKey] || 0;
            if (currentSubIndex >= productObj.options.length) {
                console.warn(`[monitorAmazonGiftCheckbox] Row #${index}: No remaining sub-items for "${itemTitle}".`);
                return;
            }
    
            // Grab the sub-item
            const subItem = productObj.options[currentSubIndex];
            // Move the "pointer" forward
            subItemIndexTracker[trackerKey] = currentSubIndex + 1;
    
            // Finally attach the event listener
            checkbox.addEventListener('change', function () {
                console.log(`[monitorAmazonGiftCheckbox] Row #${index} ("${itemTitle}") changed. Checked: ${this.checked}`);
    
                if (!this.checked) {
                    // User un-checked "This item is a gift"
                    console.log(`[monitorAmazonGiftCheckbox] Resetting Wrrapd options for subItem #${currentSubIndex} of "${itemTitle}".`);
                    
                    subItem.checkbox_wrrapd = false;
                    subItem.checkbox_flowers = false;
                    subItem.checkbox_amazon_combine = false;
                    subItem.selected_wrapping_option = 'wrrapd';
                    subItem.selected_flower_design = null;  // Add this line
    
                    // Save back the entire product object
                    saveItemToLocalStorage(productObj);
    
                    console.log(`[monitorAmazonGiftCheckbox] All Wrrapd options reset for subItem #${currentSubIndex} of "${itemTitle}" in localStorage and UI.`);
                } else {
                    // If user checks "This item is a gift"
                    console.log(`[monitorAmazonGiftCheckbox] Row #${index} ("${itemTitle}") is now checked as a gift.`);
                    // We can re-insert Wrrapd options (in case you want to refresh UI)
                    insertWrrapdOptions(allItems);
                }
            });
        });
    }
    
    /*****************************************************************
     * insertWrrapdOptions
     * - For each row in the Amazon gift options page, we:
     *   1) Identify the item title
     *   2) Fetch the product object from allItems[title]
     *   3) Grab the next sub-item index from subItemIndexTracker[title]
     *   4) Show the Wrrapd UI, restore states from that sub-item
     *   5) Attach listeners that update that sub-item
     *****************************************************************/
    async function insertWrrapdOptions(allItems) {

        // Key: title, Value: next sub-item index to use.
        let subItemIndexTracker = {};

        // Try multiple selectors for different checkout flow formats
        // Convert NodeList to Array for easier manipulation
        let items = Array.from(document.querySelectorAll('#giftOptions .a-box-group .a-box-inner .a-section.a-spacing-none[id^="item-"]'));

        if (items.length === 0) {
            // Try new checkout flow selectors
            items = Array.from(document.querySelectorAll('[data-testid*="gift"] [id^="item-"]'));
        }
        
        if (items.length === 0) {
            items = Array.from(document.querySelectorAll('[id^="item-"]'));
            
            // Filter to only items that seem to be product containers (have gift-related content)
            if (items.length > 0) {
                items = items.filter(item => {
                    const hasGiftContent = item.querySelector('input[type="checkbox"][id*="gift"], input[type="checkbox"][name*="gift"], [class*="gift"], [id*="gift"]');
                    const hasProductTitle = item.textContent && item.textContent.trim().length > 20;
                    return hasGiftContent || hasProductTitle;
                });
            }
        }
        
        if (items.length === 0) {
            // Try to find gift option containers by looking for gift-wrap checkboxes or any gift-related elements
            const giftWrapCheckboxes = document.querySelectorAll('input[id*="gift-wrap"], input[id*="giftWrap"], input[type="checkbox"][name*="gift"], input[type="checkbox"][id*="gift"], label[for*="gift"]');
            
            if (giftWrapCheckboxes.length > 0) {
                // Build items array from checkboxes' parent containers
                items = Array.from(giftWrapCheckboxes).map(checkbox => {
                    // Find the item container - go up the DOM tree looking for product containers
                    let container = checkbox.closest('[id^="item-"]') || 
                                   checkbox.closest('[data-testid*="item"]') ||
                                   checkbox.closest('[class*="item"]') ||
                                   checkbox.closest('.a-section') || 
                                   checkbox.closest('[class*="product"]') ||
                                   checkbox.closest('div[class*="gift"]') ||
                                   checkbox.closest('section') ||
                                   checkbox.parentElement?.parentElement;
                    return container;
                }).filter(Boolean);
                
                // Remove duplicates
                items = Array.from(new Set(items));
            }
        }
        
        // If still no items, try to find by product titles matching our saved items
        if (items.length === 0 && Object.keys(allItems).length > 0) {
            const savedTitles = Object.keys(allItems);
            const allTextElements = document.querySelectorAll('span, div, p, h1, h2, h3, h4, a');
            
            for (const savedTitle of savedTitles) {
                const normalizedSavedTitle = savedTitle.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 30);
                
                for (const el of allTextElements) {
                    const text = el.innerText?.trim() || '';
                    const normalizedText = text.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 30);
                    
                    if (normalizedText === normalizedSavedTitle && text.length > 10) {
                        // Found a matching title, find its container
                        let container = el.closest('[id^="item-"]') || 
                                       el.closest('[class*="item"]') ||
                                       el.closest('.a-section') ||
                                       el.closest('section') ||
                                       el.parentElement?.parentElement;
                        if (container && !Array.from(items).includes(container)) {
                            items.push(container);
                        }
                    }
                }
            }
        }

        if (items.length === 0) {
            console.warn("[insertWrrapdOptions] ⚠️ No gift options found with standard selectors.");
            
            // Use AI to find the gift option containers
            try {
                const aiSelector = await findElementWithAI(
                    'gift options item container for each product on Amazon gift options page',
                    'This is the Amazon gift options page in the new checkout flow. Each product should have its own container with gift-wrap checkbox options. Find the CSS selector for the container that holds each product\'s gift options.'
                );
                
                if (aiSelector) {
                    items = Array.from(document.querySelectorAll(aiSelector));
                }
            } catch (err) {
                console.warn("[insertWrrapdOptions] AI selector detection failed:", err);
            }
        }
        
        if (items.length === 0) {
            console.warn("[insertWrrapdOptions] ⚠️ No gift options found on the page with any selector.");
            console.warn("[insertWrrapdOptions] Will retry in 3 seconds...");
            setTimeout(() => {
                insertWrrapdOptions(allItems);
            }, 3000);
            return;
        }
        
        console.log(`[insertWrrapdOptions] ✓ Found ${items.length} gift option item(s) - proceeding to insert Wrrapd options`);
        

        // Reset the tracker each time, so we start from subIndex 0 for each title
        subItemIndexTracker = {};

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            // Extract the title from Amazon's DOM - try multiple strategies
            let itemTitleElement = null;
            let itemTitle = '';
            const savedTitles = Object.keys(allItems);
            
            // Strategy 1: Try standard Amazon selectors
            itemTitleElement = item.querySelector('span.a-truncate-cut, h3, h4, [class*="title"], [class*="product-name"], [data-testid*="title"]');
            if (itemTitleElement && itemTitleElement.innerText?.trim()) {
                itemTitle = itemTitleElement.innerText.trim().substring(0, 200);
            }
            
            // Strategy 2: Try to find text that matches our saved product titles (PRIORITY - most reliable)
            if (!itemTitle || itemTitle.length < 5) {
                const allTextElements = item.querySelectorAll('span, div, p, h1, h2, h3, h4, a, label');
                
                for (const el of allTextElements) {
                    const text = el.innerText?.trim() || el.textContent?.trim() || '';
                    if (text.length < 10 || text.length > 200) continue;
                    if (text.includes('$') || text.includes('checkbox') || text.toLowerCase().includes('gift') || text.toLowerCase().includes('select')) continue;
                    
                    // Check if this text matches any of our saved titles
                    const normalizedText = text.toLowerCase().replace(/\s+/g, ' ').trim();
                    for (const savedTitle of savedTitles) {
                        const normalizedSavedTitle = savedTitle.toLowerCase().replace(/\s+/g, ' ').trim();
                        
                        // Try multiple matching strategies
                        if (normalizedText === normalizedSavedTitle || 
                            normalizedText.substring(0, 30) === normalizedSavedTitle.substring(0, 30) ||
                            normalizedText.includes(normalizedSavedTitle) || 
                            normalizedSavedTitle.includes(normalizedText) ||
                            titleTokensOverlapCount(text, savedTitle) >= 2) {
                            itemTitleElement = el;
                            itemTitle = savedTitle; // Use the saved title for consistency
                            break;
                        }
                    }
                    if (itemTitle && itemTitle.length >= 5) break;
                }
            }
            
            // Strategy 3: Find the longest text element that looks like a product title
            if (!itemTitle || itemTitle.length < 5) {
                const allTextElements = item.querySelectorAll('span, div, p, h1, h2, h3, h4, a');
                let bestMatch = null;
                let bestLength = 0;
                
                for (const el of allTextElements) {
                    const text = el.innerText?.trim() || el.textContent?.trim() || '';
                    // Look for text that's product-title-like (not too short, not too long, no special chars)
                    if (text.length > 15 && text.length < 150 && 
                        !text.includes('$') && 
                        !text.includes('checkbox') && 
                        !text.toLowerCase().includes('gift') &&
                        !text.toLowerCase().includes('select') &&
                        !text.match(/^\d+$/) && // Not just numbers
                        text.length > bestLength) {
                        bestMatch = el;
                        bestLength = text.length;
                    }
                }
                
                if (bestMatch) {
                    itemTitleElement = bestMatch;
                    itemTitle = bestMatch.innerText?.trim() || bestMatch.textContent?.trim() || '';
                    itemTitle = itemTitle.substring(0, 200);
                }
            }
            
            // Strategy 4: If we still have the element but no title, try getting text directly
            if (itemTitleElement && (!itemTitle || itemTitle.length < 5)) {
                itemTitle = itemTitleElement.innerText?.trim() || itemTitleElement.textContent?.trim() || '';
                itemTitle = itemTitle.substring(0, 200);
            }
            
            // Strategy 5: If all else fails, use position-based matching (use saved title directly)
            if (!itemTitle || itemTitle.length < 5) {
                if (i < savedTitles.length) {
                    itemTitle = savedTitles[i];
                } else {
                    console.warn(`[insertWrrapdOptions] ⚠️ Skipping row #${i}: Title not found and no saved title at position ${i}.`);
                continue;
                }
            }

            const productObj = resolveProductByRowTitle(allItems, itemTitle, i, item);
            
            if (!productObj) {
                console.warn(`[insertWrrapdOptions] ⚠️ Skipping row #${i}: No matching data found for title "${itemTitle}".`);
                continue;
            }

            const trackerKey =
                Object.keys(allItems).find((k) => allItems[k] === productObj) || itemTitle;

            // Make sure we have an array of sub-items in productObj.options
            if (!productObj.options || productObj.options.length === 0) {
                continue;
            }

            // Determine which sub-item index we should use for this row.
            // If we haven't used any sub-items for this title yet, start at 0.
            const nextIndex = subItemIndexTracker[trackerKey] || 0;

            // If we exceed the length, it means we have more rows in the Amazon UI
            // than sub-items in .options (which shouldn't happen normally, but just in case)
            if (nextIndex >= productObj.options.length) {
                continue;
            }

            // Retrieve the sub-item data for this row
            const subItem = productObj.options[nextIndex];

            // Increment our usage for this title
            subItemIndexTracker[trackerKey] = nextIndex + 1;

            // Grab the container to insert Wrrapd UI
            const giftOptionsContainer = item.querySelector('.a-section.a-spacing-micro.a-spacing-top-mini');
            const emailRecipientCheckbox = item.querySelector(`input#digital-gift-message-checkbox-${i}`);
            const amazonGiftBagCheckbox = item.querySelector(`input#gift-wrap-checkbox-${i}`);

            if (!giftOptionsContainer) {
                continue;
            }

            // Check if we already inserted our .wrrapd-option div
            let wrrapdOptionDiv = giftOptionsContainer.querySelector('.wrrapd-option');
            if (!wrrapdOptionDiv) {
                wrrapdOptionDiv = document.createElement('div');
                wrrapdOptionDiv.className = 'a-section a-spacing-small a-spacing-top-small a-padding-none wrrapd-option';

                const isAllowed = await isZipCodeAllowed(subItem);
                const hasZipCode = subItem?.shippingAddress?.postalCode;
                const shouldShowWrrapd = isAllowed || !hasZipCode;

                if (shouldShowWrrapd) {
                    wrrapdOptionDiv.innerHTML = `
                        <div class="a-checkbox" style="display: flex; align-items: flex-start; margin-left: 3px;">
                            <label style="display: contents;">
                                <input type="checkbox" id="wrrapd-checkbox-${i}" style="margin-right: 5px; width: 18px; height: 18px; min-width: 18px; min-height: 18px;">
                                <span class="a-label a-checkbox-label" style="padding: 0;">
                                    Go beyond the bag!&nbsp;&nbsp;Gift-wrap the box and/or deliver with flowers by Wrrapd - $6.99
                                </span>
                            </label>
                        </div>
                    `;

                    let insertionPoint = null;
                    
                    if (amazonGiftBagCheckbox) {
                        const giftBagImage = item.querySelector('img[alt*="gift"]') || 
                                           item.querySelector('img[src*="gift"]') ||
                                           item.querySelector('img[src*="bag"]');
                        
                        if (giftBagImage) {
                            insertionPoint = giftBagImage.closest('.a-section') || 
                                           giftBagImage.closest('.a-box-group') ||
                                           giftBagImage.parentNode;
                        }
                        
                        if (!insertionPoint) {
                            insertionPoint = amazonGiftBagCheckbox.parentNode;
                        }
                    }
                    
                    if (insertionPoint) {
                        insertionPoint.insertAdjacentElement('afterend', wrrapdOptionDiv);
                    } else if (giftOptionsContainer) {
                        giftOptionsContainer.appendChild(wrrapdOptionDiv);
                    } else {
                        item.appendChild(wrrapdOptionDiv);
                    }

                    // Create modal element separately
                    const modalDiv = document.createElement('div');
                    modalDiv.id = `wrrapd-modal-${i}`;
                    modalDiv.className = 'wrrapd-modal';
                    modalDiv.style.display = 'none';
                    modalDiv.style.position = 'fixed';
                    modalDiv.style.top = '0';
                    modalDiv.style.left = '0';
                    modalDiv.style.width = '100%';
                    modalDiv.style.height = '100%';
                    modalDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
                    modalDiv.style.zIndex = '1000';
                    modalDiv.style.justifyContent = 'center';
                    modalDiv.style.alignItems = 'center';

                    // Add modal content
                    modalDiv.innerHTML = `
                        <div class="wrrapd-modal-content" style="background-color: white; padding: 20px; border-radius: 8px; width: 80%; max-width: 800px; 
                            max-height: 90vh; overflow-y: auto; position: relative;">
                            <button class="modal-close" style="position: absolute; right: 10px; top: 10px; border: none; background: none; 
                                font-size: 24px; cursor: pointer;">×</button>
                            
                            <h2 style="margin-bottom: 20px;">Customize Your Gift-wrapping</h2>
                            
                            <!-- Existing Sections -->
                            <div class="modal-section" style="margin-bottom: 30px;">
                                <div style="font-size: 18px; font-weight: bold; margin-bottom: 15px;">Select Wrapping Paper Design</div>
                                
                                <div class="wrapping-options" style="border: 1px solid #ddd; padding: 20px; border-radius: 8px; margin-top: 15px;">
                                    <div style="display: flex; flex-direction: column; gap: 15px;">
                                        <!-- Wrrapd Selection Option -->
                                        <label style="display: flex; align-items: start;">
                                            <input type="radio" name="wrapping-option-${i}" value="wrrapd" style="margin-right: 10px;" checked>
                                            <div>
                                                <div style="font-weight: bold;">Allow Wrrapd to choose the wrapping</div>
                                            </div>
                                        </label>

                                        <!-- Upload Option -->
                                        <label style="display: flex; align-items: start;">
                                            <input type="radio" name="wrapping-option-${i}" value="upload" style="margin-right: 10px; ">
                                            <div>
                                                <div style="font-weight: bold;">Upload your own design (+$1.99)</div>
                                                <input type="file" id="design-upload-${i}" accept="image/*" style="margin-top: 10px; display: none;">
                                                <button id="upload-btn-${i}" class="a-button" style="margin-top: 10px; padding: 5px 10px; display: none;">
                                                    Upload
                                                </button>
                                                <div id="image-preview-${i}" style="margin-top: 10px; max-width: 100%; display: none;">
                                                    <img style="max-width: 100%; max-height: 200px; border: 1px solid #ddd; border-radius: 4px;" />
                                                </div>
                                            </div>
                                        </label>

                                        <!-- AI Generation Option -->
                                        <label style="display: flex; align-items: start;">
                                            <input type="radio" name="wrapping-option-${i}" value="ai" style="margin-right: 10px;">
                                                <div style="width: 100%;">
                                                    <div style="font-weight: bold;">Generate AI designs (+$2.99)</div>
                                                    <div id="ai-options-${i}" style="display: none; margin-top: 10px; width: 100%;">
                                                        <div style="margin-bottom: 8px; color: #666;">What's the occasion?  Who is the giftee?  What do they like?  Please feel free to suggest any themes...</div>
                                                        <input type="text" id="occasion-input-${i}" 
                                                            placeholder="e.g., Valentine's Day gift for my 28 yo boyfriend, my sister's 21st birthday, grandson's bar mitzvah..." 
                                                            style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px; font-size: 14px;">
                                                        <button class="generate-btn a-button" style="padding: 8px 15px; background: #f0c14b; border: 1px solid #a88734; border-radius: 4px; cursor: pointer;">
                                                            Generate Designs
                                                        </button>
                                                        <div id="ai-designs-${i}" style="margin-top: 15px;">
                                                            <!-- AI generated designs will be inserted here -->
                                                        </div>
                                                    </div>
                                                </div>
                                        </label>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Flowers Section -->
                            <div class="modal-section" style="margin-bottom: 30px;">
                                <label style="display: flex; align-items: flex-start;">
                                    <input type="checkbox" id="combine-with-flowers-${i}" style="margin-right: 10px;">
                                    <div style="font-size: 18px; font-weight: bold;">Add Flowers - choose from below (15-20 stem bouquets) - $17.99</div>
                                </label>

                                <div id="flower-designs-${i}" style="display: none; margin-top: 20px;">
                                    <p style="margin-bottom: 15px;">Choose your bouquet style:</p>
                                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px;">
                                        ${[1, 2, 3, 4].map(num => `
                                            <label style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
                                                <input type="radio" name="flower-design-${i}" value="flowers-${num}" 
                                                    style="margin-bottom: 10px;">
                                                <img src="${chrome.runtime.getURL(`assets/flowers/flowers-${num}.webp`)}" 
                                                    alt="Flowers ${num}" 
                                                    style="width: 150px; height: 150px; border-radius: 4px; object-fit: cover;" 
                                                    class="flower-image-${i}-${num}">
                                            </label>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>

                            <!-- Combine with Amazon Section -->
                            <div class="modal-section" style="margin-bottom: 30px;">
                                <label style="display: flex; align-items: flex-start;">
                                    <input type="checkbox" id="combine-with-amazon-${i}" style="margin-right: 10px;">
                                    <div style="font-size: 18px; font-weight: bold;">Combine with Amazon items from another order</div>
                                </label>
                                <div id="amazon-instructions-${i}" style="display:none; margin: 10px 0 10px 25px;">
                                    <input type="text" placeholder="Enter additional instructions" 
                                        style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                </div>
                            </div>

                            <div style="margin-top: 20px; text-align: right;">
                                <button class="a-button-primary modal-save" 
                                    style="padding: 8px 20px; background: #f0c14b; border: 1px solid #a88734; border-radius: 4px; cursor: pointer;">
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    `;

                    // Add modal to body instead of the wrrapdOptionDiv
                    document.body.appendChild(modalDiv);

                    // Now set up event listeners
                    const modal = document.getElementById(`wrrapd-modal-${i}`);
                    const wrrapdCheckbox = document.getElementById(`wrrapd-checkbox-${i}`);
                    const closeBtn = modal?.querySelector('.modal-close');
                    const saveBtn = modal?.querySelector('.modal-save');
                    
                    if (!modal) {
                        console.error(`[insertWrrapdOptions] Modal #${i} not found!`);
                        continue;
                    }
                    if (!closeBtn) {
                        console.warn(`[insertWrrapdOptions] Close button not found for modal #${i}`);
                    }
                    if (!saveBtn) {
                        console.warn(`[insertWrrapdOptions] Save button not found for modal #${i}`);
                    }

                    // Restore UI states from subItem
                    if (wrrapdCheckbox) {
                        wrrapdCheckbox.checked = subItem.checkbox_wrrapd ?? false;
                        
                        // Restore wrapping option selection
                        if (subItem.selected_wrapping_option) {
                            const selectedOption = modal.querySelector(`input[name="wrapping-option-${i}"][value="${subItem.selected_wrapping_option}"]`);
                            if (selectedOption) {
                                selectedOption.checked = true;
                                // Trigger change event to show/hide relevant elements
                                selectedOption.dispatchEvent(new Event('change'));
                            }
                        }
                    }

                    const combineWithFlowersCheckbox = document.getElementById(`combine-with-flowers-${i}`);
                    const combineWithAmazonCheckbox = document.getElementById(`combine-with-amazon-${i}`);
                    const wrrapdSteps = document.getElementById(`wrrapd-steps-${i}`);
                    const amazonInstructions = document.getElementById(`amazon-instructions-${i}`);

                    if (wrrapdSteps) {
                        wrrapdSteps.style.display = wrrapdCheckbox.checked ? 'block' : 'none';
                    }

                    if (combineWithFlowersCheckbox) {
                        combineWithFlowersCheckbox.checked = subItem.checkbox_flowers ?? false;
                    }
                    if (combineWithAmazonCheckbox) {
                        combineWithAmazonCheckbox.checked = subItem.checkbox_amazon_combine ?? false;
                        if (amazonInstructions) {
                            amazonInstructions.style.display = combineWithAmazonCheckbox.checked ? 'block' : 'none';
                        }
                    }

                    // Remove addCheckboxListeners call and consolidate all listeners here
                    // Helper function to uncheck Wrrapd and update storage
                    const uncheckWrrapdAndUpdateStorage = () => {
                        wrrapdCheckbox.checked = false;
                        subItem.checkbox_wrrapd = false;
                        saveItemToLocalStorage(productObj);
                    };

                    // Wrrapd checkbox listener - prevent event propagation to stop Amazon's modal
                    wrrapdCheckbox.addEventListener('click', function(e) {
                        // Stop event from bubbling up to Amazon's handlers
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                    }, true); // Use capture phase to intercept before Amazon's handlers

                    wrrapdCheckbox.addEventListener('change', function(e) {
                        // Also prevent propagation on change event
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        
                        if (this.checked) {
                            modal.style.display = 'flex';
                            // Update storage when checkbox is checked
                            subItem.checkbox_wrrapd = true;
                            saveItemToLocalStorage(productObj);
                        } else {
                            modal.style.display = 'none';
                            // Update storage when checkbox is unchecked
                            subItem.checkbox_wrrapd = false;
                            saveItemToLocalStorage(productObj);
                        }
                    });

                    // Also add click listener to label text (in case checkbox is not visible)
                    const label = wrrapdCheckbox.closest('label');
                    if (label) {
                        label.addEventListener('click', function(e) {
                            // Stop propagation to prevent Amazon's modal
                            e.stopPropagation();
                            e.stopImmediatePropagation();
                            
                            // If clicking on the label text (not the checkbox itself), toggle the checkbox
                            if (e.target !== wrrapdCheckbox && e.target.tagName !== 'INPUT') {
                                e.preventDefault();
                                wrrapdCheckbox.checked = !wrrapdCheckbox.checked;
                                wrrapdCheckbox.dispatchEvent(new Event('change'));
                            }
                        }, true); // Use capture phase
                    }

                    if (amazonGiftBagCheckbox) {
                        amazonGiftBagCheckbox.addEventListener('change', function () {
                            try {
                                if (!this.checked) return;
                                subItem.checkbox_wrrapd = false;
                                if (wrrapdCheckbox) wrrapdCheckbox.checked = false;
                                saveItemToLocalStorage(productObj);
                                localStorage.removeItem('wrrapd-terms-accepted');
                                localStorage.removeItem('wrrapd-terms-gift-signature');
                            } catch (e) {
                                console.warn('[insertWrrapdOptions] Amazon gift-wrap checkbox listener:', e);
                            }
                        });
                    }

                    // Also prevent clicks on the entire wrrapd option div from bubbling
                    wrrapdOptionDiv.addEventListener('click', function(e) {
                        // Only stop propagation if clicking within our Wrrapd option
                        if (e.target.closest('.wrrapd-option') || e.target.id === `wrrapd-checkbox-${i}`) {
                            e.stopPropagation();
                            e.stopImmediatePropagation();
                        }
                    }, true); // Use capture phase

                    // Modal close button listener
                    if (closeBtn) {
                        closeBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();
                        modal.style.display = 'none';
                        uncheckWrrapdAndUpdateStorage();
                        }, true);
                    }

                    // Modal save button listener
                    if (saveBtn) {
                        saveBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        
                        // Mark this event so main handler can check it
                        e.wrrapdModalSave = true;
                        
                        // Save all current modal state
                        const occasionInput = document.getElementById(`occasion-input-${i}`);
                        if (occasionInput?.value) {
                            subItem.occasion = occasionInput.value.trim();
                        }
                        
                        const selectedWrappingOption = modal.querySelector(`input[name="wrapping-option-${i}"]:checked`);
                        if (selectedWrappingOption) {
                            subItem.selected_wrapping_option = selectedWrappingOption.value;
                        }
                        
                        const combineWithFlowersCheckbox = document.getElementById(`combine-with-flowers-${i}`);
                        if (combineWithFlowersCheckbox) {
                            subItem.checkbox_flowers = combineWithFlowersCheckbox.checked;
                        }
                        
                        const combineWithAmazonCheckbox = document.getElementById(`combine-with-amazon-${i}`);
                        if (combineWithAmazonCheckbox) {
                            subItem.checkbox_amazon_combine = combineWithAmazonCheckbox.checked;
                        }
                        
                        const selectedFlowerDesign = modal.querySelector(`input[name="flower-design-${i}"]:checked`);
                        if (selectedFlowerDesign) {
                            subItem.selected_flower_design = selectedFlowerDesign.value;
                        }
                        
                        saveItemToLocalStorage(productObj);
                        modal.style.display = 'none';
                        return false;
                        }, true);
                    }

                    // Stop clicks inside modal from bubbling to Amazon, but allow interactive elements to work
                    modal.addEventListener('click', (e) => {
                        // If clicking the backdrop, close modal and clean up blob URLs
                        if (e.target === modal) {
                            const previewContainer = document.getElementById(`image-preview-${i}`);
                            if (previewContainer?.dataset.blobUrl) {
                                URL.revokeObjectURL(previewContainer.dataset.blobUrl);
                            }
                            modal.style.display = 'none';
                            uncheckWrrapdAndUpdateStorage();
                            return;
                        }
                        
                        // Check if click is on an interactive element (button, input, link, label, etc.)
                        let target = e.target;
                        while (target && target !== modal) {
                            const tagName = target.tagName?.toLowerCase();
                            if (['button', 'input', 'select', 'textarea', 'a', 'label'].includes(tagName)) {
                                return; // Allow interactive elements to work normally
                            }
                            target = target.parentElement;
                        }
                        
                        // For non-interactive clicks inside modal content, stop propagation
                        if (e.target.closest('.wrrapd-modal-content')) {
                            e.stopPropagation();
                            e.stopImmediatePropagation();
                            e.wrrapdModalClick = true;
                        }
                    }, true);

                    // Flowers checkbox listener
                    combineWithFlowersCheckbox?.addEventListener('change', function() {
                        subItem.checkbox_flowers = this.checked;
                        saveItemToLocalStorage(productObj);
                        
                        // Show/hide the designs div
                        const flowerDesignsDiv = document.getElementById(`flower-designs-${i}`);
                        if (flowerDesignsDiv) {
                            flowerDesignsDiv.style.display = this.checked ? 'block' : 'none';
                        }
                    });

                    // Amazon combine checkbox listener
                    combineWithAmazonCheckbox?.addEventListener('change', function() {
                        subItem.checkbox_amazon_combine = this.checked;
                        saveItemToLocalStorage(productObj);
                        
                        // Show/hide instructions
                        if (amazonInstructions) {
                            amazonInstructions.style.display = this.checked ? 'block' : 'none';
                        }
                    });

                    // Flower design selection listeners
                    const flowerDesignRadios = document.querySelectorAll(`input[name="flower-design-${i}"]`);
                    flowerDesignRadios.forEach(radio => {
                        radio.addEventListener('change', function() {
                            if (this.checked) {
                                subItem.selected_flower_design = this.value;
                                saveItemToLocalStorage(productObj);
                            }
                        });
                    });

                    // Wrapping options listeners
                    const wrappingOptions = modal.querySelectorAll(`input[name="wrapping-option-${i}"]`);
                    const uploadBtn = document.getElementById(`upload-btn-${i}`);
                    const fileInput = document.getElementById(`design-upload-${i}`);
                    const aiOptions = document.getElementById(`ai-options-${i}`);

                    wrappingOptions.forEach(option => {
                        option.addEventListener('change', function() {
                            // Hide all option-specific elements first
                            uploadBtn.style.display = 'none';
                            fileInput.style.display = 'none';
                            aiOptions.style.display = 'none';

                            // Update storage with selected wrapping option
                            subItem.selected_wrapping_option = this.value;
                            saveItemToLocalStorage(productObj);

                            // Show relevant elements based on selection
                            if (this.value === 'upload') {
                                uploadBtn.style.display = 'block';
                                fileInput.style.display = 'block';
                            } else if (this.value === 'ai') {
                                aiOptions.style.display = 'block';
                            }
                        });
                    });

                    // File upload listener
                    fileInput?.addEventListener('change', function() {
                        if (this.files && this.files[0]) {
                            const file = this.files[0];
                            subItem.uploaded_design_name = file.name;
                            
                            const fileReader = new FileReader();
                            fileReader.onload = function(e) {
                                subItem.file_data_url = e.target.result;
                                saveItemToLocalStorage(productObj);
                            };
                            fileReader.readAsDataURL(file);
                            
                            saveItemToLocalStorage(productObj);
                            uploadBtn.textContent = 'Upload';
                            uploadBtn.disabled = false;
                            
                            const previewContainer = document.getElementById(`image-preview-${i}`);
                            const previewImage = previewContainer.querySelector('img');
                            const imageUrl = URL.createObjectURL(file);
                            previewImage.src = imageUrl;
                            previewContainer.style.display = 'block';
                            previewContainer.dataset.blobUrl = imageUrl;
                        }
                    });

                    // Add upload button click handler
                    uploadBtn?.addEventListener('click', async function() {
                        if (!fileInput?.files || !fileInput.files[0]) return;
                        
                        const file = fileInput.files[0];
                        const MAX_FILE_SIZE = 5 * 1024 * 1024;
                        if (file.size > MAX_FILE_SIZE) {
                            alert('File size exceeds 5MB limit. Please select a smaller file.');
                            return;
                        }
                        
                        this.textContent = 'Processing...';
                        this.disabled = true;
                        
                        try {
                            subItem.selected_file = {
                                name: file.name,
                                type: file.type,
                                lastModified: file.lastModified
                            };
                            
                            saveItemToLocalStorage(productObj);
                            this.textContent = 'Selected';
                            this.disabled = true;
                        } catch (error) {
                            console.error('Error processing file:', error);
                            this.textContent = 'Try Again';
                            this.disabled = false;
                        }
                    });

                    // AI design generation listener
                    const generateBtn = modal.querySelector('.generate-btn');
                    const aiDesignsContainer = document.getElementById(`ai-designs-${i}`);
                    const occasionInput = document.getElementById(`occasion-input-${i}`);

                    generateBtn?.addEventListener('click', async function() {
                        // Check if occasion is filled
                        if (!occasionInput?.value) {
                            alert('Please fill in the occasion first!');
                            occasionInput?.focus();
                            return;
                        }

                        try {
                            // Show loading state with progress indication
                            this.textContent = 'Generating...';
                            this.disabled = true;
                                aiDesignsContainer.innerHTML = `
                                <div style="text-align: center; padding: 40px; color: #666;">
                                    <div style="font-size: 16px; margin-bottom: 10px;">✨ Creating your custom designs...</div>
                                    <div style="font-size: 14px; color: #999;">This may take 1-2 minutes while we generate images</div>
                                    <div style="margin-top: 20px;">
                                        <div style="display: inline-block; width: 200px; height: 4px; background: #f0f0f0; border-radius: 2px; overflow: hidden;">
                                            <div id="progress-bar" style="width: 0%; height: 100%; background: #f0c14b; transition: width 0.3s;"></div>
                                        </div>
                                    </div>
                                    </div>
                                `;
                            
                            // Simulate progress (since we can't get real-time updates)
                            let progress = 0;
                            const progressInterval = setInterval(() => {
                                progress = Math.min(progress + 2, 90); // Cap at 90% until complete
                                const progressBar = document.getElementById('progress-bar');
                                if (progressBar) {
                                    progressBar.style.width = progress + '%';
                                }
                            }, 2000); // Update every 2 seconds

                            // Call API
                            console.log('[AI Design Generation] Sending request to api.wrrapd.com/generate-ideas');
                            console.log('[AI Design Generation] Payload:', JSON.stringify({ occasion: occasionInput.value }));
                            
                            // Create AbortController for timeout handling
                            // DALL-E image generation can take 30-60 seconds per image (3 images = 90-180 seconds)
                            // Plus network overhead, so allow 4 minutes total
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => {
                                console.error('[AI Design Generation] Request timeout after 4 minutes');
                                controller.abort();
                            }, 240000); // 4 minute timeout for image generation
                            
                            const response = await fetch('https://api.wrrapd.com/generate-ideas', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    occasion: occasionInput.value
                                }),
                                signal: controller.signal
                            });
                            
                            clearTimeout(timeoutId);

                            console.log('[AI Design Generation] Response status:', response.status);
                            console.log('[AI Design Generation] Response headers:', Object.fromEntries(response.headers.entries()));

                            const rawData = await response.text();  // Get raw text first
                            console.log('[AI Design Generation] Raw response:', rawData.substring(0, 500));

                            if (!response.ok) {
                                console.error('[AI Design Generation] Server error - Status:', response.status);
                                console.error('[AI Design Generation] Server error - Response:', rawData);
                                throw new Error(`Server error (${response.status}): ${rawData.substring(0, 200)}`);
                            }

                            const data = JSON.parse(JSON.parse(rawData));  // Parse twice to handle double stringification
                            console.log('[AI Design Generation] Parsed data:', data);
                            console.log('[AI Design Generation] Number of designs:', data.designs?.length);
                            data.designs?.forEach((design, idx) => {
                                console.log(`[AI Design Generation] Design ${idx + 1}:`, {
                                    title: design.title,
                                    hasDescription: !!design.description,
                                    hasImageUrl: !!design.imageUrl,
                                    imageUrl: design.imageUrl
                                });
                            });

                            // Save all designs to unused-designs folder with prompt (NO upscaling)
                            const prompt = occasionInput.value;
                            // Note: We don't save unused designs immediately to avoid 413 errors (images are too large)
                            // Unused designs will be saved later if needed, or we can save them in the background
                            // after the user selects a design. For now, we only save the selected design.
                            console.log('[AI Design Generation] Designs generated. Will save selected design when user chooses one.');

                            // Display results
                            aiDesignsContainer.innerHTML = `
                                <div style="border: 1px solid #ddd; padding: 15px; border-radius: 8px; margin-top: 20px;">
                                    <div style="display: flex; flex-direction: column; gap: 20px;">
                                        ${data.designs.map((design, idx) => `
                                            <label style="display: flex; flex-direction: column; gap: 10px; cursor: pointer; padding: 12px; border: 2px solid #ddd; border-radius: 8px; transition: border-color 0.2s;">
                                                <div style="display: flex; align-items: flex-start; gap: 15px;">
                                                <input type="radio" name="ai-design-${i}" value="design-${idx}" 
                                                    style="margin-top: 3px;">
                                                    <div style="flex: 1;">
                                                        <div style="font-weight: bold; margin-bottom: 5px; font-size: 16px;">${design.title || `Design ${idx + 1}`}</div>
                                                        <div style="color: #666; font-size: 0.9em; line-height: 1.5;">${design.description}</div>
                                                </div>
                                                </div>
                                                ${design.imageUrl ? `
                                                    <div style="margin-top: 10px; margin-left: 28px; position: relative;">
                                                        <img src="${design.imageUrl}" 
                                                             alt="${design.title || `Design ${idx + 1}`}" 
                                                             style="max-width: 100%; max-height: 300px; border-radius: 4px; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: block;"
                                                             onerror="this.parentElement.innerHTML='<div style=\\'padding: 20px; text-align: center; color: #999; border: 1px dashed #ddd; border-radius: 4px;\\'>Image unavailable<br><small>URL: ' + this.src.substring(0, 50) + '...</small></div>';">
                                                        <div class="image-loading" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #999; display: none;">Loading image...</div>
                                                    </div>
                                                ` : '<div style="margin-top: 10px; margin-left: 28px; padding: 20px; text-align: center; color: #999; border: 1px dashed #ddd; border-radius: 4px;">No image available</div>'}
                                            </label>
                                            <style>
                                                label:has(input[name="ai-design-${i}"]:checked) {
                                                    border-color: #f0c14b !important;
                                                    background-color: #fffbf0;
                                                }
                                                label:hover {
                                                    border-color: #f0c14b;
                                                }
                                            </style>
                                        `).join('')}
                                    </div>
                                </div>
                            `;

                            // Save selected design to localStorage and GCS (with order number)
                            const designRadios = aiDesignsContainer.querySelectorAll(`input[name="ai-design-${i}"]`);
                            designRadios.forEach((radio, idx) => {
                                radio.addEventListener('change', async function() {
                                    if (this.checked) {
                                        const selectedDesign = data.designs[idx];
                                        
                                        // Get or generate order number
                                        let orderNumber = localStorage.getItem('wrrapd-order-number');
                                        if (!orderNumber) {
                                            // Generate order number early (will use default zip if not available)
                                            const zipCode = subItem.shippingAddress?.postalCode || "00000";
                                            orderNumber = generateOrderNumber(zipCode);
                                            localStorage.setItem('wrrapd-order-number', orderNumber);
                                            console.log('[AI Design Generation] Generated order number:', orderNumber);
                                        }
                                        
                                        // Get the sub-item index for filename
                                        const subItemIndex = productObj.options.findIndex(opt => opt === subItem);
                                        
                                        // Save the selected image to designs/ folder with order number and UPSCALE it
                                        if (selectedDesign.imageBase64) {
                                            try {
                                                console.log('[AI Design Generation] Saving selected design image to GCS with order number and upscaling...');
                                                
                                                const saveResponse = await fetch('https://api.wrrapd.com/api/save-ai-design', {
                                                    method: 'POST',
                                                    headers: {
                                                        'Content-Type': 'application/json'
                                                    },
                                                    body: JSON.stringify({
                                                        imageBase64: selectedDesign.imageBase64,
                                                        designTitle: selectedDesign.title,
                                                        designDescription: selectedDesign.description || '',
                                                        itemTitle: productObj.title,
                                                        orderNumber: orderNumber,
                                                        prompt: occasionInput.value || prompt,
                                                        folder: 'designs',
                                                        asin: productObj.asin,
                                                        index: subItemIndex,
                                                        shouldUpscale: true // Upscale selected design to 4x (up to 4MP)
                                                    })
                                                });

                                                if (saveResponse.ok) {
                                                    const saveData = await saveResponse.json();
                                                    console.log('[AI Design Generation] Selected design image saved to GCS:', saveData.filePath);
                                                    
                                                    // Store ONLY essential data (NO base64 or large imageUrl) to prevent localStorage quota errors
                                                    subItem.selected_ai_design = {
                                                        title: selectedDesign.title,
                                                        description: selectedDesign.description,
                                                        gcsPath: saveData.filePath,
                                                        gcsUrl: saveData.publicUrl,
                                                        orderNumber: orderNumber
                                                    };
                                                    
                                                    // Save unused designs in the background (non-blocking)
                                                    // Only save the 2 designs that weren't selected
                                                    const unusedDesigns = data.designs.filter((d, i) => i !== idx);
                                                    console.log(`[AI Design Generation] Saving ${unusedDesigns.length} unused designs in background...`);
                                                    
                                                    // Save unused designs asynchronously (don't await - fire and forget)
                                                    unusedDesigns.forEach(async (design, unusedIdx) => {
                                                        if (design.imageBase64) {
                                                            try {
                                                                // Use a smaller timeout and don't block
                                                                const unusedResponse = await fetch('https://api.wrrapd.com/api/save-ai-design', {
                                                                    method: 'POST',
                                                                    headers: {
                                                                        'Content-Type': 'application/json'
                                                                    },
                                                                    body: JSON.stringify({
                                                                        imageBase64: design.imageBase64,
                                                                        designTitle: design.title,
                                                                        designDescription: design.description || '',
                                                                        itemTitle: productObj.title,
                                                                        prompt: occasionInput.value || prompt,
                                                                        folder: 'designs/unused-designs',
                                                                        asin: productObj.asin,
                                                                        shouldUpscale: false // No upscaling for unselected designs
                                                                    }),
                                                                    signal: AbortSignal.timeout(60000) // 60 second timeout
                                                                });
                                                                
                                                                if (unusedResponse.ok) {
                                                                    console.log(`[AI Design Generation] ✓ Saved unused design "${design.title}" to unused-designs`);
                                                                } else {
                                                                    console.warn(`[AI Design Generation] Failed to save unused design "${design.title}": ${unusedResponse.status}`);
                                                                }
                                                            } catch (error) {
                                                                // Silently fail - unused designs are not critical
                                                                if (error.name !== 'AbortError') {
                                                                    console.warn(`[AI Design Generation] Error saving unused design "${design.title}":`, error.message);
                                                                }
                                                            }
                                                        }
                                                    });
                                                } else {
                                                    console.error('[AI Design Generation] Failed to save image to GCS:', await saveResponse.text());
                                                    // Store minimal data even if upload fails
                                                    subItem.selected_ai_design = {
                                                        title: selectedDesign.title,
                                                        description: selectedDesign.description,
                                                        orderNumber: orderNumber
                                                    };
                                                }
                                            } catch (error) {
                                                console.error('[AI Design Generation] Error saving image to GCS:', error);
                                                // Store minimal data even if upload fails
                                                subItem.selected_ai_design = {
                                                    title: selectedDesign.title,
                                                    description: selectedDesign.description,
                                                    orderNumber: orderNumber
                                                };
                                            }
                                        } else {
                                            // No image, just store basic info
                                            subItem.selected_ai_design = {
                                                title: selectedDesign.title,
                                                description: selectedDesign.description,
                                                orderNumber: orderNumber
                                            };
                                        }
                                        
                                        saveItemToLocalStorage(productObj);
                                    }
                                });
                            });

                        } catch (error) {
                            console.error('[AI Design Generation] Error generating designs:', error);
                            console.error('[AI Design Generation] Error stack:', error.stack);
                            
                            let errorMessage = 'Failed to generate designs. Please try again.';
                            if (error.message && error.message.includes('Server error')) {
                                    errorMessage = error.message;
                            }
                            
                            aiDesignsContainer.innerHTML = `
                                <div style="color: #d00; text-align: center; margin-top: 20px; padding: 15px; border: 1px solid #d00; border-radius: 4px;">
                                    <div style="font-weight: bold; margin-bottom: 8px;">⚠️ Error</div>
                                    <div>${errorMessage}</div>
                                        <div style="margin-top: 10px; font-size: 0.9em; color: #666;">
                                        Check the browser console (F12) for more details.
                                        </div>
                                </div>
                            `;
                        } finally {
                            // Reset button
                            this.textContent = 'Generate Designs';
                            this.disabled = false;
                        }
                    });

                    // Occasion input listener
                    occasionInput?.addEventListener('change', function() {
                        subItem.occasion = this.value;
                        saveItemToLocalStorage(productObj);
                    });

                    // Restore occasion input value
                    if (occasionInput) {
                        occasionInput.value = subItem.occasion || '';
                    }

                } else {
                    if (!isAllowed) {
                        wrrapdOptionDiv.innerHTML = `<div>Wrrapd is not available for your area.</div>`;
                    }
                    giftOptionsContainer.insertBefore(wrrapdOptionDiv, emailRecipientCheckbox?.parentNode?.nextSibling);
                }
            }
        }

    }

    // ----------------------------------------------------- SINGLE ADDRESS SELECTION -----------------------------------------------------

    function singleSelectAddress() {
        console.log("[singleSelectAddress] Starting single address selection page processing.");
        singleSelectAddressLogic();
        extractDefaultAddress();
    }

    function singleSelectAddressLogic() {

        const allItems = getAllItemsFromLocalStorage();

        const topButton = document.querySelector('#orderSummaryPrimaryActionBtn .a-button-input');

        if (!topButton) {
            console.log("[singleSelectAddress] Top button not found.");
            // return;
        } else {
            // when one of them is clicked, we scrape the address
            topButton.addEventListener('click', () => {
                console.log("[singleSelectAddress] Top button clicked.");
                scrapeShippingAddressOnSingle(allItems);
            });
        }

        const bottomButton = document.querySelector('input[data-testid="Address_selectShipToThisAddress"]');

        if (!bottomButton) {
            console.log("[singleSelectAddress] Bottom button not found.");
            // return;
        } else {
        bottomButton.addEventListener('click', () => {
            console.log("[singleSelectAddress] Bottom button clicked.");
            scrapeShippingAddressOnSingle(allItems);
        });
        }

    }

    function scrapeShippingAddressOnSingle(allItems) {
        console.log("[scrapeShippingAddressOnSingle] Scraping shipping address on single address selection page.");
        
        const selectedNameElement = document.querySelector('.list-address-selected .a-text-bold > .break-word');
        const selectedAddressElement = document.querySelector('.list-address-selected .a-label > .break-word');
    
        const name = selectedNameElement ? selectedNameElement.innerText.trim() : null;
        const fullAddress = selectedAddressElement ? selectedAddressElement.innerText.trim() : null;
    
        if (fullAddress) {
            // Example regex for US-based addresses (adjust if needed)
            const addressRegex = /^(.*?),\s*(.*?),\s*([A-Z]{2}),\s*(\d{5})(?:-\d{4})?,\s*(.*)$/;
            const match = fullAddress.match(addressRegex);
    
            if (match) {
                const [_, street, city, state, postalCode, country] = match;
    
                console.log("[scrapeShippingAddressOnSingle] Address Parts:");
                console.log(`[scrapeShippingAddressOnSingle] Name: ${name}`);
                console.log(`[scrapeShippingAddressOnSingle] Street: ${street}`);
                console.log(`[scrapeShippingAddressOnSingle] City: ${city}`);
                console.log(`[scrapeShippingAddressOnSingle] State: ${state}`);
                console.log(`[scrapeShippingAddressOnSingle] Postal Code: ${postalCode}`);
                console.log(`[scrapeShippingAddressOnSingle] Country: ${country}`);
    
                const addressObject = { name, street, city, state, postalCode, country };
                snapshotGifteeIntendedAddressIfApplicable(addressObject);
    
                // Store this address inside each sub-item's "options"
                Object.keys(allItems).forEach(titleKey => {
                    const productObj = allItems[titleKey];
                    
                    // Make sure 'options' array exists
                    if (!productObj.options) {
                        productObj.options = [];
                    }
    
                    // For each sub-item, store the shipping address
                    productObj.options.forEach(subItem => {
                        subItem.shippingAddress = addressObject;
                    });
                });
    
                // Save updated allItems to localStorage
                localStorage.setItem('wrrapd-items', JSON.stringify(allItems));
                console.log("[scrapeShippingAddressOnSingle] Address saved to localStorage:", addressObject);
    
            } else {
                console.error("[scrapeShippingAddressOnSingle] Unable to parse the address with the provided regex.");
            }
        } else {
            console.error("[scrapeShippingAddressOnSingle] No address found on the page.");
        }
    }

    /**
     * True when the scraped Amazon address is the Wrrapd warehouse (not the giftee's intended address).
     */
    function isLikelyWrrapdWarehouseAddress(addr) {
        if (!addr) return false;
        const blob = `${addr.name || ''} ${addr.street || ''}`.toLowerCase();
        return blob.includes('wrrapd');
    }

    /**
     * Persist the recipient's intended address before it may be replaced by the Wrrapd delivery address on Amazon.
     */
    function snapshotGifteeIntendedAddressIfApplicable(addressObject) {
        if (!addressObject || isLikelyWrrapdWarehouseAddress(addressObject)) return;
        try {
            localStorage.setItem('wrrapd-giftee-intended-address', JSON.stringify({
                name: addressObject.name,
                street: addressObject.street,
                city: addressObject.city,
                state: addressObject.state,
                postalCode: addressObject.postalCode,
                country: addressObject.country
            }));
            console.log('[snapshotGifteeIntendedAddressIfApplicable] Saved wrrapd-giftee-intended-address');
        } catch (e) {
            console.warn('[snapshotGifteeIntendedAddressIfApplicable]', e);
        }
    }

    function extractDefaultAddress() {
        console.log("[extractDefaultAddress] Extracting default address from the page.");
    
        const defaultNameElement = document.querySelector('.list-address-selected .a-text-bold > .break-word');
        const defaultAddressElement = document.querySelector('.list-address-selected .a-label > .break-word');
    
        const name = defaultNameElement ? defaultNameElement.innerText.trim() : null;
        const fullAddress = defaultAddressElement ? defaultAddressElement.innerText.trim() : null;
    
        if (fullAddress) {
            const addressRegex = /^(.*?),\s*(.*?),\s*([A-Z]{2}),\s*(\d{5})(?:-\d{4})?,\s*(.*)$/;
            const match = fullAddress.match(addressRegex);
    
            if (match) {
                const [_, street, city, state, postalCode, country] = match;
    
                console.log("[extractDefaultAddress] Address Parts:");
                console.log(`[extractDefaultAddress] Name: ${name}`);
                console.log(`[extractDefaultAddress] Street: ${street}`);
                console.log(`[extractDefaultAddress] City: ${city}`);
                console.log(`[extractDefaultAddress] State: ${state}`);
                console.log(`[extractDefaultAddress] Postal Code: ${postalCode}`);
                console.log(`[extractDefaultAddress] Country: ${country}`);
    
                const addressObject = { name, street, city, state, postalCode, country };
    
                // Guardar en localStorage
                localStorage.setItem('wrrapd-default-address', JSON.stringify(addressObject));
                snapshotGifteeIntendedAddressIfApplicable(addressObject);
                console.log("[extractDefaultAddress] Address saved to localStorage:", addressObject);
    
                return addressObject;
            } else {
                console.error("[extractDefaultAddress] Unable to parse the address.");
            }
        } else {
            console.error("[extractDefaultAddress] No default address found.");
        }
    
        return null;
    }

    // ----------------------------------------------------- MULTI ADDRESS SELECTION -----------------------------------------------------

    function createOverlayButton2(originalButton, callback, overlayId) {
        // Evitar que Amazon reciba clics
        originalButton.style.pointerEvents = 'none';
        originalButton.disabled = true;
    
        // Si ya existe un overlay con este ID, no lo creamos de nuevo
        if (document.getElementById(overlayId)) {
        return;
        }
    
        // Crear el overlay
        const overlayButton = document.createElement('button');
        overlayButton.id = overlayId;
    
        // Ajustar estilo de overlay
        overlayButton.style.position = 'absolute';
        overlayButton.style.top = `${originalButton.offsetTop}px`;
        overlayButton.style.left = `${originalButton.offsetLeft}px`;
        overlayButton.style.width = `${originalButton.offsetWidth}px`;
        overlayButton.style.height = `${originalButton.offsetHeight}px`;
        overlayButton.style.backgroundColor = 'transparent';
        overlayButton.style.border = 'none';
        overlayButton.style.cursor = 'pointer';
        overlayButton.style.zIndex = '1000';
    
        // Interceptar el click
        overlayButton.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    
        // Ejecutar tu callback (scraping, etc.)
        await callback();
        };
    
        // Insertar overlay en el DOM
        originalButton.parentNode.appendChild(overlayButton);
    }
    
    function attachOverlayButtons(allItems) {
        if (!hasAnyWrrapdGiftWrapInCart(allItems)) {
            return;
        }

        console.log("[attachOverlayButtons] Searching Amazon buttons...");
    
        // CRITICAL: Check if addresses have already been changed OR if we're in the process of changing addresses
        // If yes, let Amazon proceed naturally to payment (GOLD VERSION workflow)
        // This prevents redirecting back to gift options after addresses are selected
        const addressesAlreadyChanged = localStorage.getItem('wrrapd-addresses-changed') === 'true';
        const shouldChangeAddress = localStorage.getItem('wrrapd-should-change-address') === 'true';
        
        if (addressesAlreadyChanged || shouldChangeAddress) {
            if (addressesAlreadyChanged) {
                console.log("[attachOverlayButtons] ✓ Addresses already changed. Letting Amazon proceed naturally to payment (GOLD VERSION workflow).");
            } else {
                console.log("[attachOverlayButtons] ✓ In address-changing flow. NOT intercepting buttons - will let Amazon proceed naturally after addresses are changed.");
            }
            console.log("[attachOverlayButtons] NOT intercepting buttons - Amazon will proceed to payment page.");
            // Don't intercept - let Amazon's natural flow proceed to payment
            return;
        }
        
        console.log("[attachOverlayButtons] First visit to multi-address page. Will intercept to scrape addresses and redirect to gift options.");
    
        // Botones que queremos cubrir
        const topButton = document.querySelector('#orderSummaryPrimaryActionBtn .a-button-input');
        const bottomButton = document.querySelector('.a-button-inner > [data-testid=""]');
    
        // Si no hay topButton, salimos
        if (!topButton) {
        // console.log("[attachOverlayButtons] Top button not found.");
        } else {
        // console.log("[attachOverlayButtons] Top button found.");
        // Inyectar overlay para el botón superior
        createOverlayButton2(
            topButton,
            async () => {
            console.log("[attachOverlayButtons] Top button clicked. Starting scraping...");
            await scrapeShippingAddressOnMulti(allItems);
            console.log("[attachOverlayButtons] Scraping completed. Redirecting to gift options page...");
            window.location.href = 'https://www.amazon.com/gp/buy/gift/handlers/display.html';
            },
            "fake-button-top"
        );
        }
    
        // Si no hay bottomButton, salimos
        if (!bottomButton) {
        // console.log("[attachOverlayButtons] Bottom button not found.");
        } else {
        // console.log("[attachOverlayButtons] Bottom button found.");
        // Inyectar overlay para el botón inferior
        createOverlayButton2(
            bottomButton,
            async () => {
            console.log("[attachOverlayButtons] Bottom button clicked. Starting scraping...");
            await scrapeShippingAddressOnMulti(allItems);
            console.log("[attachOverlayButtons] Scraping completed. Redirecting to gift options page...");
            window.location.href = 'https://www.amazon.com/gp/buy/gift/handlers/display.html';
            },
            "fake-button-bottom"
        );
        }
    }
    
    function multiSelectAddress(allItems) {
        console.log("[multiSelectAddress] Starting multi address selection page processing.");

        if (!hasAnyWrrapdGiftWrapInCart(allItems)) {
            console.log('[multiSelectAddress] No Wrrapd gift-wrap — not intercepting multi-address page.');
            return;
        }

        if (!wrrapdManualAddressTapsRequired()) {
            showLoadingScreen();
        } else {
            removeLoadingScreen();
        }
    
        // Primero, inyectar overlays (por si ya están listos los botones)
        attachOverlayButtons(allItems);
    
        // NOTE: Disable DOM observation on address selection page to avoid repeated calls
        // The buttons are already in the DOM and don't need constant re-checking
        // observeDomChanges(() => {
        //     attachOverlayButtons(allItems);
        // });
        
        // Now handle address selection for each item - DIRECT CALL to the working function
        // Start immediately - no delays
        selectAddressesForItemsSimple(allItems);
    }
    
    /**
     * SIMPLIFIED: Check for Wrrapd address, add if needed, then select addresses for items
     * - Items NOT for Wrrapd: use original/default address
     * - Items FOR Wrrapd: use Wrrapd address
     */
    /**
     * REMOVED DEAD CODE:
     * - selectAddressesForItems() - Never called, replaced by selectAddressesForItemsSimple()
     * - expandAddressListIfNeeded() - Only called from unused selectAddressesForItems()
     * - checkWrrapdAddressExists() - Only called from unused selectAddressesForItems()
     * - addWrrapdAddressToDropdown() - Only called from unused selectAddressesForItems()
     * - findAndCacheWrrapdAddress() - Never called
     * 
     * All functionality is now handled by:
     * - selectAddressesForItemsSimple() - Main address selection function
     * - handleWrrapdAddressSelection() - Address page handler
     */
    
    /**
     * SIMPLIFIED: Select addresses for each item
     */
    // Cache for Wrrapd address details (data-value) - once found, reuse for all dropdowns
    // Since Wrrapd address is ALWAYS available once it's in the address list, we cache it upfront
    let wrrapdAddressCache = null;
    
    async function selectAddressesForItemsSimple(allItems) {
        // CRITICAL: Prevent duplicate calls
        if (isSelectingAddresses) {
            console.warn("[selectAddressesForItemsSimple] Already selecting addresses - preventing duplicate call!");
            return;
        }
        
        isSelectingAddresses = true;
        
        try {
        if (!hasAnyWrrapdGiftWrapInCart(allItems)) {
            console.log(
                '[selectAddressesForItemsSimple] No Wrrapd gift-wrap — skipping multi-address automation.',
            );
            return;
        }

        console.log("[selectAddressesForItemsSimple] Starting address selection for items...");
        
        // CRITICAL: Only show loading screen if Terms have been accepted
        // Loading screen should ONLY show after user clicks "here" on Terms modal
            // CRITICAL: Keep loading screen visible throughout entire address manipulation process
        const shouldChangeAddress = localStorage.getItem('wrrapd-should-change-address') === 'true';
        const termsAccepted = wrrapdTermsAcceptedForCurrentGiftChoices(allItems);
        if (shouldChangeAddress && termsAccepted) {
            wrrapdShowAddressAutomationLoadingOrClear();
        }
        
        // OPTIMIZED: Start immediately - reduce wait time significantly
        const addressContainer = await waitForElement('.lineitem-address, .address-dropdown', 500);
        if (!addressContainer) {
            console.warn("[selectAddressesForItemsSimple] Address container not found, waiting 200ms...");
            await new Promise(r => setTimeout(r, 200));
        }
        
        // Note: Wrrapd address is ALWAYS available once it's in the address list
        // We could cache it, but for now we'll find it in each dropdown to ensure reliability
        
        // Get addresses
        const defaultAddressStr = localStorage.getItem('wrrapd-default-address');
        let defaultAddress = null;
        if (defaultAddressStr) {
            try {
                defaultAddress = JSON.parse(defaultAddressStr);
                console.log("[selectAddressesForItemsSimple] Loaded default address:", defaultAddress);
                } catch (e) {
                console.error("[selectAddressesForItemsSimple] Failed to parse default address:", e);
            }
        }
        
        // STEP 1: Load unique identifier mapping if available (created when Wrrapd address was added)
        const identifierMapStr = localStorage.getItem('wrrapd-item-identifiers');
        let identifierMap = {};
        if (identifierMapStr) {
            try {
                identifierMap = JSON.parse(identifierMapStr);
                console.log("[selectAddressesForItemsSimple] Loaded item identifier mapping:", identifierMap);
            } catch (e) {
                console.error("[selectAddressesForItemsSimple] Failed to parse identifier mapping:", e);
            }
        }
        
        // STEP 2: Collect all ASINs and their requirements (Wrrapd or default)
        const asinRequirements = new Map(); // Map<ASIN, {needsWrrapd: boolean, productKey: string}>
        
        for (const [productKey, productObj] of Object.entries(allItems)) {
            if (!productObj || !productObj.asin || !productObj.options) continue;
            
            // CRITICAL: Only change address if ALL options need Wrrapd
            // On multi-address page, we can't selectively change addresses for individual sub-items
            // So we only change if the entire product should go to Wrrapd
            const totalOptions = productObj.options.length;
            const wrrapdOptions = productObj.options.filter(opt => opt.checkbox_wrrapd === true).length;
            const allOptionsNeedWrrapd = totalOptions > 0 && wrrapdOptions === totalOptions;
            
            asinRequirements.set(productObj.asin, {
                needsWrrapd: allOptionsNeedWrrapd,
                productKey: productKey
            });
            
            if (allOptionsNeedWrrapd) {
                console.log(`[selectAddressesForItemsSimple] ASIN ${productObj.asin} ("${productKey}") needs Wrrapd address (${wrrapdOptions}/${totalOptions} options)`);
            } else if (wrrapdOptions > 0) {
                console.log(`[selectAddressesForItemsSimple] ASIN ${productObj.asin} ("${productKey}") needs DEFAULT address (${wrrapdOptions}/${totalOptions} need Wrrapd, but not all)`);
            } else {
                console.log(`[selectAddressesForItemsSimple] ASIN ${productObj.asin} ("${productKey}") needs DEFAULT address (no Wrrapd options)`);
            }
        }
        
        console.log(`[selectAddressesForItemsSimple] Found ${asinRequirements.size} ASIN(s) to process`);
        
        if (asinRequirements.size === 0) {
            console.log("[selectAddressesForItemsSimple] No items found. Exiting.");
            return;
        }
        
        // STEP 3: Process all items - check each one and fix only if address is incorrect
        const processedASINs = new Set();
        let maxIterations = 10; // Safety limit
        let iteration = 0;
        
        while (processedASINs.size < asinRequirements.size && iteration < maxIterations) {
            iteration++;
            console.log(`[selectAddressesForItemsSimple] ===== Iteration ${iteration}: Processing ${asinRequirements.size - processedASINs.size} remaining ASIN(s) =====`);
            
            // OPTIMIZED: Use dynamic waiting for dropdowns instead of fixed timeout
            // This responds immediately when dropdowns appear instead of waiting full 2 seconds
            const dropdownsReady = await waitForElement('.lineitem-address .a-dropdown-container, .address-dropdown', 2000);
            if (!dropdownsReady) {
                await new Promise(r => setTimeout(r, 500)); // Reduced fallback wait from 1000ms
            }
            
            // CRITICAL: Re-query dropdowns on each iteration to handle page updates after address changes
            // Amazon may update the DOM after each address selection, so we need fresh queries
            const allDropdowns = document.querySelectorAll('.lineitem-address .a-dropdown-container .a-button-text, .address-dropdown .a-button-text, [class*="lineitem-address"] .a-button-text, [class*="address-dropdown"] .a-button-text');
            console.log(`[selectAddressesForItemsSimple] Found ${allDropdowns.length} address dropdown(s) on page`);
            
            let changedSomethingThisIteration = false;
            
            // Process each dropdown
            for (const dropdown of allDropdowns) {
                // Walk up DOM tree from dropdown to find product information
                // NOTE: Amazon doesn't show ASINs on this page, so we match by product descriptors/titles only
                let matchedProductKey = null;
                let matchedASIN = null;
                let matchedDropdown = dropdown; // Store the original dropdown element
                let container = dropdown;
                const maxDepth = 30;
                
                for (let depth = 0; depth < maxDepth && container && container !== document.body; depth++) {
                    // Match by product title/descriptor (ASINs are not available on this page)
                    // First, try to find all text elements that might be product titles
                    const allTextElements = container.querySelectorAll('*');
                    const potentialTitles = [];
                    
                    for (const el of allTextElements) {
                        const text = (el.textContent || el.innerText || '').trim();
                        // Look for text that's long enough to be a product title
                        if (text.length > 15 && text.length < 200) {
                            const words = text.split(/\s+/);
                            const hasNumbers = /\d/.test(text);
                            const hasSpecialChars = /[^\w\s]/.test(text);
                            const looksLikeName = words.length === 2 && 
                                                  words[0].length < 15 && 
                                                  words[1].length < 15 &&
                                                  /^[A-Z][a-z]+$/.test(words[0]) &&
                                                  /^[A-Z][a-z]+$/.test(words[1]) &&
                                                  !hasNumbers && !hasSpecialChars; // Names don't have numbers or special chars
                            const hasAddressWords = /address|street|city|state|zip|postal|deliver|ship|roger|phillips/i.test(text);
                            // If it has numbers or special chars, it's likely a product, not an address
                            const looksLikeProduct = hasNumbers || hasSpecialChars || text.length > 30;
                            
                            // Allow if: (1) it's a potential product title, OR (2) it doesn't look like name/address
                            if (looksLikeProduct || (!looksLikeName && !hasAddressWords)) {
                                // Check if this text contains any of our product keywords
                                const lowerText = text.toLowerCase();
                                for (const [productKey, productObj] of Object.entries(allItems)) {
                                    if (!productObj || !productObj.asin) continue;
                                    const productKeyLower = productKey.toLowerCase();
                                    const productKey18 = productKeyLower.substring(0, 18);
                                    const text18 = lowerText.substring(0, 18);
                                    
                                    // Try matching first 18, 25, or 30 characters
                                    if (text18 === productKey18 || 
                                        text18.includes(productKey18) || 
                                        productKey18.includes(text18) ||
                                        lowerText.includes(productKeyLower.substring(0, 25)) ||
                                        productKeyLower.includes(lowerText.substring(0, 25)) ||
                                        lowerText.includes(productKeyLower.substring(0, 30)) ||
                                        productKeyLower.includes(lowerText.substring(0, 30))) {
                                        potentialTitles.push({ text, productKey, asin: productObj.asin, element: el });
                                        console.log(`[selectAddressesForItemsSimple] Found potential match at depth ${depth}: "${text.substring(0, 60)}" matches "${productKey.substring(0, 60)}"`);
                                    }
                                }
                            }
                        }
                    }
                    
                    // If we found potential matches, use the BEST match (longest matching substring)
                    if (potentialTitles.length > 0) {
                        // Sort by match quality - prefer longer, more specific matches
                        potentialTitles.sort((a, b) => {
                            const aMatch = Math.min(a.text.length, a.productKey.length);
                            const bMatch = Math.min(b.text.length, b.productKey.length);
                            return bMatch - aMatch; // Longer matches first
                        });
                        
                        const match = potentialTitles[0];
                        matchedProductKey = match.productKey;
                        matchedASIN = match.asin;
                        console.log(`[selectAddressesForItemsSimple] ✓ Matched title "${match.text.substring(0, 50)}" to product "${match.productKey}" with ASIN ${matchedASIN} (depth ${depth})`);
                        break;
                    }
                    
                    // Fallback: Try specific selectors
                    const titleSelectors = [
                        'p.a-spacing-micro.a-size-base.a-text-bold',
                        'h2.a-text-normal',
                        'h3.a-text-normal',
                        'h2',
                        'h3',
                        '[class*="title"]',
                        'a.a-link-normal[href*="/dp/"]',
                        'a.a-link-normal[href*="/gp/product/"]',
                        'span.a-text-bold',
                        'div[class*="product"]',
                        'div[class*="item"]'
                    ];
                    for (const selector of titleSelectors) {
                        const titleEl = container.querySelector(selector);
                        if (titleEl) {
                            const titleText = titleEl.textContent?.trim() || titleEl.innerText?.trim() || '';
                            // Skip if it looks like a name (2 words, both capitalized, short, NO numbers or special chars)
                            const words = titleText.split(/\s+/);
                            const hasNumbers = /\d/.test(titleText);
                            const hasSpecialChars = /[^\w\s]/.test(titleText);
                            const looksLikeName = words.length === 2 && 
                                                  words[0].length < 15 && 
                                                  words[1].length < 15 &&
                                                  /^[A-Z][a-z]+$/.test(words[0]) &&
                                                  /^[A-Z][a-z]+$/.test(words[1]) &&
                                                  !hasNumbers && !hasSpecialChars; // Names don't have numbers or special chars
                            
                            // Skip if it contains address-related words (but allow if it also has product-like content)
                            const hasAddressWords = /address|street|city|state|zip|postal|deliver|ship|roger|phillips/i.test(titleText);
                            // If it has numbers or special chars, it's likely a product, not an address
                            const looksLikeProduct = hasNumbers || hasSpecialChars || titleText.length > 30;
                            
                            // Allow if: (1) it's a potential product title, OR (2) it doesn't look like name/address
                            if (titleText.length > 10 && titleText.length < 200 && (looksLikeProduct || (!looksLikeName && !hasAddressWords))) {
                                console.log(`[selectAddressesForItemsSimple] Found potential title at depth ${depth}: "${titleText.substring(0, 60)}"`);
                                // Match title to saved product - try first 18, 25, and 30 characters
                                for (const [productKey, productObj] of Object.entries(allItems)) {
                                    if (!productObj || !productObj.asin) continue;
                                    
                                    const productKeyLower = productKey.toLowerCase();
                                    const titleLower = titleText.toLowerCase();
                                    
                                    // Try matching with 18, 25, and 30 characters
                                    const productKey18 = productKeyLower.substring(0, 18);
                                    const productKey25 = productKeyLower.substring(0, 25);
                                    const productKey30 = productKeyLower.substring(0, 30);
                                    const title18 = titleLower.substring(0, 18);
                                    const title25 = titleLower.substring(0, 25);
                                    const title30 = titleLower.substring(0, 30);
                                    
                                    // CRITICAL: Use stricter matching - require at least 18 characters to match
                                    // This prevents false matches where short substrings match multiple products
                                    const minMatchLength = 18;
                                    const titleMatch = titleLower.substring(0, minMatchLength);
                                    const productMatch = productKeyLower.substring(0, minMatchLength);
                                    
                                    // Require either exact match of first 18 chars OR one contains the other (stronger match)
                                    const isStrongMatch = titleMatch === productMatch || 
                                                         (titleLower.length >= minMatchLength && productKeyLower.length >= minMatchLength &&
                                                          (titleLower.includes(productMatch) || productKeyLower.includes(titleMatch)));
                                    
                                    if (isStrongMatch) {
                                        // Only set if we don't already have a match
                                        // This ensures we only match ONE product per dropdown (the first/best match found)
                                        if (!matchedASIN) {
                                        matchedProductKey = productKey;
                                            matchedASIN = productObj.asin;
                                        console.log(`[selectAddressesForItemsSimple] ✓ Matched title "${titleText.substring(0, 50)}" to product "${productKey}" with ASIN ${matchedASIN} (depth ${depth})`);
                                            break; // Stop searching once we have a match
                                        }
                                    }
                                }
                                if (matchedASIN) break;
                            } else if (looksLikeName || hasAddressWords) {
                                console.log(`[selectAddressesForItemsSimple] Skipping "${titleText.substring(0, 30)}" - looks like name or address`);
                            }
                        }
                    }
                    if (matchedASIN) break;
                    
                    container = container.parentElement;
                }
                
                if (!matchedASIN) {
                    console.warn(`[selectAddressesForItemsSimple] Could not match dropdown to any product. Skipping.`);
                    continue;
                }
                
                // Get requirements for this ASIN
                const itemRequirements = asinRequirements.get(matchedASIN);
                if (!itemRequirements) {
                    console.log(`[selectAddressesForItemsSimple] ASIN ${matchedASIN} not found in requirements map. Skipping.`);
                    continue;
                }
                
                // Check if already processed
                if (processedASINs.has(matchedASIN)) {
                    console.log(`[selectAddressesForItemsSimple] ASIN ${matchedASIN} already processed. Skipping.`);
                    continue;
                }
                
                console.log(`[selectAddressesForItemsSimple] Processing ASIN ${matchedASIN} ("${matchedProductKey}") - needs ${itemRequirements.needsWrrapd ? 'Wrrapd' : 'DEFAULT'} address...`);
                
                // Check current address in dropdown
                const currentDropdownText = dropdown.textContent?.trim() || dropdown.innerText?.trim() || '';
                const hasPOBox = currentDropdownText.includes('PO BOX 26067');
                const hasJacksonville = currentDropdownText.includes('JACKSONVILLE') || currentDropdownText.includes('Jacksonville');
                const hasZip = currentDropdownText.includes('32226');
                const isWrrapd = hasPOBox && hasJacksonville && hasZip;
                
                // Check if current address matches requirements
                const addressIsCorrect = (itemRequirements.needsWrrapd && isWrrapd) || (!itemRequirements.needsWrrapd && !isWrrapd);
                
                if (addressIsCorrect) {
                    console.log(`[selectAddressesForItemsSimple] ✓ ASIN ${matchedASIN} already has ${itemRequirements.needsWrrapd ? 'Wrrapd' : 'DEFAULT'} address. No change needed.`);
                    processedASINs.add(matchedASIN);
                    changedSomethingThisIteration = true;
                    continue; // Already correct
                }
                
                // Address is incorrect - need to fix it
                console.log(`[selectAddressesForItemsSimple] ⚠️ ASIN ${matchedASIN} has ${isWrrapd ? 'Wrrapd' : 'DEFAULT'} address but needs ${itemRequirements.needsWrrapd ? 'Wrrapd' : 'DEFAULT'}. Fixing...`);
                
                // Select correct address (Wrrapd or default)
                if (itemRequirements.needsWrrapd) {
                console.log(`[selectAddressesForItemsSimple] ✓✓✓ Selecting Wrrapd address for ASIN ${matchedASIN} ("${matchedProductKey}") ✓✓✓`);
                } else {
                    console.log(`[selectAddressesForItemsSimple] ✓✓✓ Selecting DEFAULT address for ASIN ${matchedASIN} ("${matchedProductKey}") ✓✓✓`);
                }
                
                // Use the dropdown that was matched - find the actual activator element
                const dropdownActivator = matchedDropdown.closest('.a-dropdown-container')?.querySelector('.a-button-text, .a-dropdown-prompt') || matchedDropdown;
                
                let success = false;
                let attempts = 0;
                const maxAttempts = 5;
                
                while (!success && attempts < maxAttempts) {
                    attempts++;
                    console.log(`[selectAddressesForItemsSimple] Attempt ${attempts}/${maxAttempts} for ASIN ${matchedASIN}...`);
                    
                    // Use the matched dropdown element directly - but verify it's still in the DOM
                    let currentDropdown = dropdownActivator;
                    
                    // Check if element is still in DOM, if not try to re-find by product descriptor
                    if (!document.contains(dropdownActivator)) {
                        console.warn(`[selectAddressesForItemsSimple] Original dropdown no longer in DOM. Re-finding by product descriptor...`);
                        // Re-find by product descriptor (ASINs not available on this page)
                        const allCurrentDropdowns = document.querySelectorAll('.lineitem-address .a-dropdown-container .a-button-text, .address-dropdown .a-button-text, [class*="lineitem-address"] .a-button-text');
                        currentDropdown = null;
                        for (const dd of allCurrentDropdowns) {
                            let container = dd;
                            for (let depth = 0; depth < 20 && container && container !== document.body; depth++) {
                                // Match by product descriptor/title
                                const allTextElements = container.querySelectorAll('*');
                                for (const el of allTextElements) {
                                    const text = (el.textContent || el.innerText || '').trim();
                                    if (text.length > 15 && text.length < 200) {
                                        const words = text.split(/\s+/);
                                        const hasNumbers = /\d/.test(text);
                                        const hasSpecialChars = /[^\w\s]/.test(text);
                                        const looksLikeName = words.length === 2 && 
                                                              words[0].length < 15 && 
                                                              words[1].length < 15 &&
                                                              /^[A-Z][a-z]+$/.test(words[0]) &&
                                                              /^[A-Z][a-z]+$/.test(words[1]) &&
                                                              !hasNumbers && !hasSpecialChars; // Names don't have numbers or special chars
                                        const hasAddressWords = /address|street|city|state|zip|postal|deliver|ship|roger|phillips/i.test(text);
                                        // If it has numbers or special chars, it's likely a product, not an address
                                        const looksLikeProduct = hasNumbers || hasSpecialChars || text.length > 30;
                                        
                                        // Allow if: (1) it's a potential product title, OR (2) it doesn't look like name/address
                                        if (looksLikeProduct || (!looksLikeName && !hasAddressWords)) {
                                            const textLower = text.toLowerCase();
                                            const productKeyLower = matchedProductKey.toLowerCase();
                                            // Quick match check
                                            if (textLower.includes(productKeyLower.substring(0, 18)) || 
                                                productKeyLower.includes(textLower.substring(0, 18))) {
                                                currentDropdown = dd.closest('.a-dropdown-container')?.querySelector('.a-button-text, .a-dropdown-prompt') || dd;
                                    break;
                                }
                            }
                                    }
                                }
                                if (currentDropdown) break;
                                container = container.parentElement;
                            }
                            if (currentDropdown) break;
                        }
                        
                        if (!currentDropdown) {
                            console.warn(`[selectAddressesForItemsSimple] Could not re-find dropdown for "${matchedProductKey}" on attempt ${attempts}. Retrying...`);
                            await new Promise(r => setTimeout(r, 1000));
                            continue;
                        }
                    }
                    
                    // Select appropriate address based on requirements
                    if (itemRequirements.needsWrrapd) {
                    success = await selectWrrapdAddressFromDropdown(currentDropdown);
                    } else {
                        // Load default address and select it
                        const defaultAddressStr = localStorage.getItem('wrrapd-default-address');
                        let defaultAddress = null;
                        if (defaultAddressStr) {
                            try {
                                defaultAddress = JSON.parse(defaultAddressStr);
                            } catch (e) {
                                console.error("[selectAddressesForItemsSimple] Failed to parse default address:", e);
                            }
                        }
                        if (defaultAddress) {
                            success = await selectDefaultAddressFromDropdown(currentDropdown, defaultAddress);
                        } else {
                            console.error("[selectAddressesForItemsSimple] No default address available!");
                            success = false;
                        }
                    }
                    
                    if (success) {
                        console.log(`[selectAddressesForItemsSimple] ✓✓✓ Successfully set ${itemRequirements.needsWrrapd ? 'Wrrapd' : 'DEFAULT'} address for ASIN ${matchedASIN} ✓✓✓`);
                        processedASINs.add(matchedASIN);
                        changedSomethingThisIteration = true;
                        
                        // Minimal wait after successful address change - loading screen hides the transition
                        await new Promise(r => setTimeout(r, 200));
                    } else {
                        if (attempts < maxAttempts) {
                            console.warn(`[selectAddressesForItemsSimple] Attempt ${attempts} failed for ASIN ${matchedASIN}. Retrying...`);
                            // Keep loading screen visible during retry
                            showLoadingScreen();
                            await new Promise(r => setTimeout(r, 800)); // Reduced - loading screen hides transition
                        }
                    }
                }
                
                if (!success) {
                    console.error(`[selectAddressesForItemsSimple] ✗✗✗ FAILED to select Wrrapd address for ASIN ${matchedASIN} after ${maxAttempts} attempts! ✗✗✗`);
                } else {
                    // Successfully processed - mark as done
                    console.log(`[selectAddressesForItemsSimple] ✓✓✓ Successfully processed ASIN ${matchedASIN}. ✓✓✓`);
                    
                    // Don't set flag here - wait until ALL addresses are changed (set at the end)
                    
                    changedSomethingThisIteration = true;
                    
                    // CRITICAL: After successful address change, minimal wait before processing next item
                    // Amazon may update the DOM, but loading screen hides the transition
                    // Break immediately to re-query dropdowns for next item
                    await new Promise(r => setTimeout(r, 300)); // Reduced - loading screen hides transition
                    
                    // Break out of dropdown loop to re-query all dropdowns (page may have updated)
                    // This ensures we process all remaining items correctly
                    break;
                }
            }
            
            // If we didn't change anything this iteration, break to avoid infinite loop
            if (!changedSomethingThisIteration) {
                console.log("[selectAddressesForItemsSimple] No changes this iteration. Breaking out.");
                break;
            }
            
            // Minimal wait before next iteration - loading screen hides the transition
            await new Promise(r => setTimeout(r, 200));
        }
        
        console.log(`[selectAddressesForItemsSimple] Finished. Processed ${processedASINs.size}/${asinRequirements.size} ASIN(s).`);
        
        // CRITICAL: ALL addresses (both Wrrapd and default) MUST be set correctly before proceeding
        // The main loop above already handles both Wrrapd and default addresses, so we just verify completion
        if (processedASINs.size !== asinRequirements.size) {
            console.error(`[selectAddressesForItemsSimple] ✗✗✗ CRITICAL ERROR: Only processed ${processedASINs.size} out of ${asinRequirements.size} ASINs! ✗✗✗`);
            console.error(`[selectAddressesForItemsSimple] Cannot proceed - All addresses MUST be set correctly before returning to gift-options!`);
            const remainingASINs = Array.from(asinRequirements.keys()).filter(asin => !processedASINs.has(asin));
            console.error(`[selectAddressesForItemsSimple] Remaining ASINs that need addresses:`, remainingASINs);

            if (wrrapdManualAddressTapsRequired()) {
                localStorage.removeItem('wrrapd-address-retry-count');
                wrrapdShowMultiAddressAmazonConfirmUI();
                return;
            }

            // Keep loading screen visible
            showLoadingScreen();
            
            // Try one more iteration to set remaining addresses
            console.log(`[selectAddressesForItemsSimple] Attempting one more iteration to set remaining addresses...`);
            
            // Wait a bit for page to settle, then retry
            await new Promise(r => setTimeout(r, 2000));
            
            // Retry by calling the function recursively (but limit recursion depth)
            const retryCount = parseInt(localStorage.getItem('wrrapd-address-retry-count') || '0');
            if (retryCount < 3) {
                localStorage.setItem('wrrapd-address-retry-count', String(retryCount + 1));
                console.log(`[selectAddressesForItemsSimple] Retry attempt ${retryCount + 1}/3 - calling selectAddressesForItemsSimple again...`);
                isSelectingAddresses = false;
                // Recursive call to retry
                return await selectAddressesForItemsSimple(allItems);
            } else {
                console.error(`[selectAddressesForItemsSimple] ✗✗✗ MAX RETRIES REACHED (3 attempts) - Cannot set addresses automatically ✗✗✗`);
                console.error(`[selectAddressesForItemsSimple] User intervention required - please set Wrrapd addresses manually`);
                localStorage.removeItem('wrrapd-address-retry-count');
                // Don't proceed - addresses must be set first
                return; // Don't proceed until all addresses are set
            }
        }
        
        // CRITICAL: All addresses were successfully set - now we can proceed
        console.log("[selectAddressesForItemsSimple] ✓✓✓ ALL ASINs successfully processed! ✓✓✓");
        console.log("[selectAddressesForItemsSimple] All Wrrapd addresses are now set - safe to proceed to gift-options");
        
        // Clear retry counter on success
        localStorage.removeItem('wrrapd-address-retry-count');

        // CRITICAL: Set flag to indicate all addresses changed - this enables RETURN detection in giftSection()
        // Only set flag AFTER confirming all addresses were successfully set
        // CRITICAL: Also set a flag to prevent duplicate runs on multi-address page
        localStorage.setItem('wrrapd-addresses-changed', 'true');
        localStorage.setItem('wrrapd-should-change-address', 'false');
        localStorage.setItem('wrrapd-multi-address-completed', 'true');
        console.log("[selectAddressesForItemsSimple] Set wrrapd-addresses-changed flag - all addresses successfully changed, proceeding to gift-options");

        if (wrrapdManualAddressTapsRequired()) {
            removeLoadingScreen();
            wrrapdShowMultiAddressAmazonConfirmUI();
            return;
        }

        // CRITICAL: Keep loading screen visible during entire workflow
        showLoadingScreen();
        
        // CRITICAL: After addresses are changed, automatically click "Continue" to go back to gift options
        // Then automatically click "Save gift options" to proceed to Payment
        // Proceed immediately - no delays
        console.log("[selectAddressesForItemsSimple] Setting up automatic workflow: Continue → Gift Options → Save → Payment");
        await clickContinueAndProceedToPayment();
        
        // Additional confirmation (redundant but safe)
        if (processedASINs.size === asinRequirements.size && asinRequirements.size > 0) {
            console.log("[selectAddressesForItemsSimple] ✓✓✓ Confirmed: ALL ASINs successfully processed! ✓✓✓");
            
            // CRITICAL: Set flag to indicate all addresses changed - this enables GOLD VERSION workflow
            // After this, attachOverlayButtons will NOT intercept, letting Amazon proceed to payment naturally
            // Also clear should-change-address flag since addresses are now changed
            localStorage.setItem('wrrapd-addresses-changed', 'true');
            localStorage.setItem('wrrapd-should-change-address', 'false');
            console.log("[selectAddressesForItemsSimple] Confirmed wrrapd-addresses-changed flag is set - will proceed to payment (GOLD VERSION workflow)");
            
            // CRITICAL: Remove any existing overlay buttons that might have been attached before addresses were changed
            // This prevents them from intercepting clicks and causing 500 errors
            const existingOverlays = document.querySelectorAll('#fake-button-top, #fake-button-bottom');
            existingOverlays.forEach(overlay => {
                console.log("[selectAddressesForItemsSimple] Removing existing overlay button to prevent interception.");
                overlay.remove();
            });
            
            // Restore original button functionality
            const topButton = document.querySelector('#orderSummaryPrimaryActionBtn .a-button-input');
            const bottomButton = document.querySelector('.a-button-inner > [data-testid=""]');
            if (topButton) {
                topButton.style.pointerEvents = 'auto';
                topButton.disabled = false;
            }
            if (bottomButton) {
                bottomButton.style.pointerEvents = 'auto';
                bottomButton.disabled = false;
            }
            
            // GOLD VERSION WORKFLOW: Automatically proceed through the workflow
            console.log("[selectAddressesForItemsSimple] ✓ All addresses changed successfully!");
            console.log("[selectAddressesForItemsSimple] Automatic workflow will: Click Continue → Gift Options → Save → Payment");
            
            // CRITICAL: Set flag BEFORE calling clickContinueAndProceedToPayment to ensure it's set when giftSection() runs
            // Also clear should-change-address flag since addresses are now changed
            // Note: Flag was already set above before calling clickContinueAndProceedToPayment, so this is redundant but safe
            localStorage.setItem('wrrapd-addresses-changed', 'true');
            localStorage.setItem('wrrapd-should-change-address', 'false');
            console.log("[selectAddressesForItemsSimple] Confirmed wrrapd-addresses-changed flag is set (already set before clickContinueAndProceedToPayment)");
        }
        // Note: The else branch is no longer needed - we return early if addresses weren't all set
        } finally {
            // Always reset the flag, even if there's an error
            isSelectingAddresses = false;
        }
    }
    
    /**
     * Automatically click "Continue" button after address selection, then click "Save gift options" on gift options page
     * Workflow: Multi-Address → Continue → Gift Options (with addresses) → Save gift options → Payment
     */
    async function clickContinueAndProceedToPayment() {
        console.log("[clickContinueAndProceedToPayment] Starting automatic workflow...");

        // "Make updates to your items" → Ship items to one address → main-column yellow Continue (not sidebar).
        // Do not auto-click: customer must confirm; show coachmark + halo.
        const shipOneContinue = wrrapdFindShipItemsToOneAddressContinueControl();
        if (shipOneContinue) {
            wrrapdShowShipToOneAddressContinueCoachmark(shipOneContinue);
            return;
        }
        
        // Step 1: Find and click "Continue" button on multi-address page
        // Try multiple specific selectors first, then fall back to text-based search
        let continueButton = null;
        
        // Try specific selectors first (most reliable)
        const specificSelectors = [
            '#orderSummaryPrimaryActionBtn .a-button-input',
            '#orderSummaryPrimaryActionBtn button',
            '#orderSummaryPrimaryActionBtn input[type="submit"]',
            '.a-button-continue input',
            '.a-button-continue button',
            '.a-button-primary input[type="submit"]',
            '.a-button-primary button[type="submit"]',
            'input[type="submit"][value*="Continue"]',
            'button[type="submit"]:contains("Continue")'
        ];
        
        for (const selector of specificSelectors) {
            try {
                const element = document.querySelector(selector);
                if (element && element.offsetParent !== null && !element.disabled) {
                    const text = (element.textContent || element.value || element.getAttribute('aria-label') || '').toLowerCase();
                    if (text.includes('continue') && !text.includes('payment') && !text.includes('use these')) {
                        continueButton = element;
                        console.log(`[clickContinueAndProceedToPayment] Found Continue button using selector: ${selector}`);
                break;
            }
        }
            } catch (e) {
                // Invalid selector, continue
            }
        }
        
        // If not found, wait for button and search by text with MutationObserver
        if (!continueButton) {
            console.log("[clickContinueAndProceedToPayment] Continue button not found with specific selectors. Waiting for button to appear...");
            
            // Wait for button to appear using MutationObserver
            continueButton = await new Promise((resolve) => {
                const checkForButton = () => {
                    // Try specific selectors again
                    for (const selector of specificSelectors) {
                        try {
                            const element = document.querySelector(selector);
                            if (element && element.offsetParent !== null && !element.disabled) {
                                const text = (element.textContent || element.value || element.getAttribute('aria-label') || '').toLowerCase();
                                if (text.includes('continue') && !text.includes('payment') && !text.includes('use these')) {
                                    return resolve(element);
                    }
                    }
                } catch (e) {
                    // Invalid selector, continue
                }
            }
                    
                    // Search by text
                    const allButtons = document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"], .a-button-input, .a-button-inner, span.a-button-text');
                    const found = Array.from(allButtons).find(el => {
                        if (!el || el.offsetParent === null || el.disabled) return false;
                        const text = (el.textContent || el.value || el.getAttribute('aria-label') || el.innerText || '').toLowerCase();
                        return text.includes('continue') && 
                               !text.includes('payment') && 
                               !text.includes('use these') && 
                               !text.includes('place order') &&
                               !text.includes('save gift');
                    });
                    
                    if (found) {
                        return resolve(found);
                    }
                    
                    return null;
                };
                
                // Check immediately
                const immediateResult = checkForButton();
                if (immediateResult) {
                    return resolve(immediateResult);
                }
                
                // Use MutationObserver to watch for button
                const observer = new MutationObserver(() => {
                    const result = checkForButton();
                    if (result) {
                        observer.disconnect();
                        resolve(result);
                    }
                });
                
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
                
                // Timeout after 10 seconds
                setTimeout(() => {
                    observer.disconnect();
                    console.warn("[clickContinueAndProceedToPayment] Continue button not found after waiting. Available buttons:", 
                        Array.from(document.querySelectorAll('button, input[type="submit"]')).slice(0, 10).map(el => ({
                            tag: el.tagName,
                            id: el.id,
                            classes: el.className,
                            text: (el.textContent || el.value || '').trim().substring(0, 50),
                            visible: el.offsetParent !== null
                        }))
                    );
                    resolve(null);
                }, 10000);
            });
        }
        
        if (!continueButton) {
            console.warn("[clickContinueAndProceedToPayment] Continue button not found. User will need to click manually.");
            return;
        }
        
        console.log("[clickContinueAndProceedToPayment] ✓ Found Continue button. Clicking to return to gift options page...");
        
        // CRITICAL: Verify this is NOT a "Place your order" button
        const buttonText = (continueButton.textContent || continueButton.value || continueButton.getAttribute('aria-label') || '').toLowerCase();
        if (buttonText.includes('place') && buttonText.includes('order')) {
            console.error("[clickContinueAndProceedToPayment] ⚠️ CRITICAL: Attempted to click 'Place your order' button! ABORTING!");
            return;
        }
        
        // Click the Continue button
                    continueButton.click();
        
        // Step 2: Wait for navigation to gift options page
        console.log("[clickContinueAndProceedToPayment] Waiting for navigation to gift options page...");
        await waitForNavigation(() => window.location.href.includes('/gift'), 10000);
        
        // Step 3: Wait for gift options page to load and addresses to be shown
        console.log("[clickContinueAndProceedToPayment] Waiting for gift options page with addresses shown...");
        await waitForAddressesOnGiftOptionsPage();
        
        // Step 4: Click "Save gift options" button (this will proceed to Payment)
        console.log("[clickContinueAndProceedToPayment] Addresses are shown. Clicking 'Save gift options' to proceed to Payment...");
        
        // Set a flag to indicate we're in automatic workflow - giftSection() should not interfere
        localStorage.setItem('wrrapd-automatic-workflow-active', 'true');
        
        // CRITICAL: Keep loading screen visible - don't wait, proceed immediately
        // Loading screen will hide the transition
        await new Promise(r => setTimeout(r, 300)); // Minimal wait - loading screen hides transition
        
        await clickSaveGiftOptionsButton();
        
        // Clear the flag after a delay (in case navigation doesn't happen)
        setTimeout(() => {
            localStorage.removeItem('wrrapd-automatic-workflow-active');
        }, 10000);
    }
    
    /**
     * Wait for navigation to a specific URL pattern
     */
    async function waitForNavigation(checkFn, timeout = 10000) {
        return new Promise((resolve) => {
            if (checkFn()) {
                resolve();
                return;
            }
            
            const checkInterval = setInterval(() => {
                if (checkFn()) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
            
            setTimeout(() => {
                clearInterval(checkInterval);
                resolve(); // Resolve anyway after timeout
            }, timeout);
        });
    }
    
    /**
     * Wait for addresses to be shown on gift options page
     */
    async function waitForAddressesOnGiftOptionsPage() {
        return new Promise((resolve) => {
            const checkAddresses = () => {
                const addressesShown = areAddressesShownOnGiftOptionsPage();
                
                if (addressesShown) {
                    console.log("[waitForAddressesOnGiftOptionsPage] ✓ Addresses are now shown on gift options page (either below items or in top section)!");
                    resolve();
                }
            };
            
            // Check immediately
            checkAddresses();
            
            // Also observe DOM changes
            const observer = new MutationObserver(() => {
                checkAddresses();
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            // Timeout after 10 seconds
            setTimeout(() => {
                observer.disconnect();
                console.log("[waitForAddressesOnGiftOptionsPage] Timeout - addresses may not be shown yet.");
                resolve();
            }, 10000);
        });
    }
    
    /**
     * Click "Save gift options" button on gift options page (with addresses shown)
     */
    async function clickSaveGiftOptionsButton() {
        const primaryWrap =
            document.querySelector('#orderSummaryPrimaryActionBtn') ||
            document.querySelector('[data-feature-id="order-summary-primary-action"]');
        let saveButton = primaryWrap?.querySelector?.('.a-button-input, input[type="submit"], button') || null;
        if (!saveButton) {
            saveButton = await waitForElement('#orderSummaryPrimaryActionBtn .a-button-input', 5000);
        }

        if (!saveButton) {
            console.warn("[clickSaveGiftOptionsButton] Save gift options button not found. User will need to click manually.");
            return;
        }

        const annEl =
            primaryWrap?.querySelector?.('[id$="-announce"], .a-button-text') ||
            saveButton.closest?.('.a-button')?.querySelector?.('[id$="-announce"], .a-button-text');
        const announce = (annEl && annEl.textContent) || '';
        const buttonText = (
            `${announce} ${saveButton.textContent || ''} ${saveButton.value || ''} ${saveButton.getAttribute('aria-label') || ''}`
        ).toLowerCase();

        if (buttonText.includes('place') && buttonText.includes('order')) {
            console.error("[clickSaveGiftOptionsButton] ⚠️ CRITICAL: Attempted to click 'Place your order' button! ABORTING!");
            return;
        }

        const giftUiPresent =
            !!document.querySelector('#giftOptions') ||
            !!document.querySelector('input[id^="toggle-gift-item-checkbox"]');
        if (!giftUiPresent) {
            console.warn('[clickSaveGiftOptionsButton] Gift options UI not present; refusing to click order-summary control.');
            return;
        }

        const looksLikeGiftStep =
            buttonText.includes('save gift') ||
            buttonText.includes('gift options') ||
            buttonText.includes('save options') ||
            (buttonText.includes('continue') && !buttonText.includes('use these'));

        if (!looksLikeGiftStep) {
            console.warn(
                '[clickSaveGiftOptionsButton] Order-summary button does not look like gift save/continue; refusing to click.',
                buttonText.trim().slice(0, 120),
            );
            return;
        }

        console.log("[clickSaveGiftOptionsButton] ✓ Found Save gift options button. Clicking to proceed to Payment...");
        
        // CRITICAL: Keep loading screen visible - ensure it's on and stays on
        showLoadingScreen();
        
        // Minimal delay - loading screen hides the transition
        await new Promise(r => setTimeout(r, 200));
        
        // Set a flag to indicate this is a programmatic click that should proceed to payment
        // This prevents any existing event handlers from intercepting
        localStorage.setItem('wrrapd-programmatic-click-to-payment', 'true');
        
        // Use a timeout to clear the flag in case something goes wrong
        setTimeout(() => {
            localStorage.removeItem('wrrapd-programmatic-click-to-payment');
        }, 5000);
        
        // CRITICAL: Submit the form directly instead of clicking button
        // This avoids triggering event handlers that might prevent default and cause 500 errors
        const form = saveButton.closest('form');
        if (form) {
            console.log("[clickSaveGiftOptionsButton] Submitting form directly to avoid event handler issues");
            try {
                // Submit the form directly - this is more reliable than clicking
                form.submit();
            } catch (e) {
                console.warn("[clickSaveGiftOptionsButton] Form.submit() failed, trying button click:", e);
                // Fallback to clicking if form.submit() fails - but verify it's not "Place your order"
                const fallbackText = (saveButton.textContent || saveButton.value || saveButton.getAttribute('aria-label') || '').toLowerCase();
                if (!(fallbackText.includes('place') && fallbackText.includes('order'))) {
                saveButton.click();
                } else {
                    console.error("[clickSaveGiftOptionsButton] ⚠️ CRITICAL: Fallback button is 'Place your order'! ABORTING!");
                }
            }
        } else {
            // No form found, use click - but verify it's not "Place your order"
            const clickText = (saveButton.textContent || saveButton.value || saveButton.getAttribute('aria-label') || '').toLowerCase();
            if (!(clickText.includes('place') && clickText.includes('order'))) {
            console.log("[clickSaveGiftOptionsButton] No form found, using direct click");
            saveButton.click();
            } else {
                console.error("[clickSaveGiftOptionsButton] ⚠️ CRITICAL: Button is 'Place your order'! ABORTING!");
            }
        }
        
        console.log("[clickSaveGiftOptionsButton] ✓ Clicked Save gift options button. Should proceed to Payment page.");
        
        // Wait for navigation to payment page and remove loading screen when payment page is detected
        const checkPaymentPage = () => {
            const currentURL = window.location.href;
            const isPaymentPage = currentURL.includes('amazon.com/gp/buy/payselect/handlers/display.html') ||
                (currentURL.includes('/checkout/') && currentURL.includes('/spc') && !currentURL.includes('/gp/buy/spc/handlers/display.html'));
            if (isPaymentPage) {
                console.log("[clickSaveGiftOptionsButton] Payment page detected, removing loading screen");
                removeLoadingScreen();
                return true;
            }
            return false;
        };
        
        // Check immediately
        if (checkPaymentPage()) {
            return;
        }
        
        // Poll for payment page (timeout after 15 seconds)
        let attempts = 0;
        const maxAttempts = 30; // 15 seconds (500ms * 30)
        const interval = setInterval(() => {
            attempts++;
            if (checkPaymentPage() || attempts >= maxAttempts) {
                clearInterval(interval);
                if (attempts >= maxAttempts) {
                    console.warn("[clickSaveGiftOptionsButton] Timeout waiting for payment page, removing loading screen anyway");
                    removeLoadingScreen();
                }
            }
        }, 500);
    }
    
    
    /**
     * Select Wrrapd address from dropdown
     */
    async function selectWrrapdAddressFromDropdown(dropdownActivator) {
        try {
            // Each checkout line has its own dropdown; cached data-value/DOM from another row is invalid.
            wrrapdAddressCache = null;

            console.log("[selectWrrapdAddressFromDropdown] Opening dropdown...");
            dropdownActivator.click();
            
            // OPTIMIZED: Use dynamic waiting for popover instead of fixed timeout
            const popover = await waitForPopover(1500);
                if (!popover) {
                console.warn("[selectWrrapdAddressFromDropdown] Popover did not appear.");
                return false;
            }
            
            // OPTIMIZED: Wait dynamically for popover to be fully rendered
            // Check if options are already loaded
            let optionsReady = popover.querySelectorAll('a, li a, [role="option"], li').length > 0;
            if (!optionsReady) {
                // Wait up to 500ms for options to load
                for (let i = 0; i < 5 && !optionsReady; i++) {
                    await new Promise(r => setTimeout(r, 100));
                    optionsReady = popover.querySelectorAll('a, li a, [role="option"], li').length > 0;
                }
            }
            
            // Helper function to check if option is Wrrapd address (defined early for use throughout)
            function isWrrapdOption(text) {
                if (!text || text.length < 10) return false;
                const textLower = text.toLowerCase();
                const hasWrrapd = textLower.trim().startsWith('wrrapd') || textLower.includes('wrrapd');
                const hasPOBox = text.includes('PO BOX 26067') || text.includes('P.O. BOX 26067') || text.includes('26067');
                const hasJacksonville = text.includes('JACKSONVILLE') || text.includes('Jacksonville');
                const hasFL = text.includes(' FL ') || text.includes(', FL') || text.includes('FL 32226');
                const hasZip = text.includes('32226-6067') || text.includes('32226') || text.includes('32226 6067');
                return hasWrrapd || (hasPOBox && hasJacksonville && (hasFL || hasZip));
            }
            
            // OPTIMIZATION: Use cached Wrrapd address data-value directly (it's always available)
            let clickableElement = null;
            let dataValue = null;
            let currentPopover = popover; // Initialize currentPopover to the original popover
            
            if (wrrapdAddressCache && wrrapdAddressCache.dataValue) {
                console.log("[selectWrrapdAddressFromDropdown] Using cached Wrrapd address data-value:", wrrapdAddressCache.dataValue);
                
                // Try to find the element with the cached data-value IN THE CURRENT POPOVER
                // Need to properly escape the data-value for CSS selector
                const escapedDataValue = wrrapdAddressCache.dataValue.replace(/"/g, '\\"').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
                const cachedElement = popover.querySelector(`a[data-value="${escapedDataValue}"]`);
                
                if (cachedElement) {
                    // CRITICAL: Verify the cached element is actually in the CURRENT popover
                    // Also verify it contains Wrrapd text
                    const cachedText = cachedElement.textContent?.trim() || cachedElement.innerText?.trim() || '';
                    const isInCurrentPopover = popover.contains(cachedElement);
                    
                    if (isInCurrentPopover && isWrrapdOption(cachedText)) {
                        console.log("[selectWrrapdAddressFromDropdown] ✓ Found cached Wrrapd element in current dropdown, using it directly!");
                        clickableElement = cachedElement;
                        dataValue = wrrapdAddressCache.dataValue;
                        
                        // Scroll into view
                        try {
                            clickableElement.scrollIntoView({ behavior: 'auto', block: 'center' });
                            await new Promise(r => setTimeout(r, 100));
                        } catch (e) {
                            console.warn("[selectWrrapdAddressFromDropdown] Could not scroll cached element:", e);
                        }
                        
                        // We have the element - continue to selection code below
                    } else {
                        if (!isInCurrentPopover) {
                            console.warn("[selectWrrapdAddressFromDropdown] Cached element is NOT in current popover, clearing cache and searching...");
                        } else {
                            console.warn("[selectWrrapdAddressFromDropdown] Cached element found but doesn't match Wrrapd address, clearing cache and searching...");
                        }
                        wrrapdAddressCache = null; // Clear invalid cache
                    }
                } else {
                    console.warn("[selectWrrapdAddressFromDropdown] Cached data-value not found in current dropdown, searching for Wrrapd address...");
                    wrrapdAddressCache = null; // Clear invalid cache - it's from a different dropdown
                }
            }
            
            // If we don't have clickableElement yet, search for it
            if (!clickableElement) {
            // FIRST: Check for "Show more addresses" and click it if it exists
            let showMoreLink = popover.querySelector('[aria-label*="Show more" i], [aria-label*="See more" i]');
            if (!showMoreLink) {
                const links = popover.querySelectorAll('a, button');
                for (const link of links) {
                    const text = link.textContent?.trim().toLowerCase() || '';
                    if (text.includes('show more') || text.includes('see more')) {
                        showMoreLink = link;
                        break;
                    }
                }
            }
            
            // currentPopover is already initialized above
            if (showMoreLink) {
                console.log("[selectWrrapdAddressFromDropdown] Found 'Show more addresses' link. Clicking to expand list...");
                showMoreLink.click();
                await new Promise(r => setTimeout(r, 2000)); // Wait for addresses to load
                // Re-query the popover to get updated options
                const updatedPopover = document.querySelector('.a-popover');
                if (updatedPopover) {
                    currentPopover = updatedPopover;
                    console.log("[selectWrrapdAddressFromDropdown] Updated popover reference after 'Show more addresses'");
                }
            }
            
            // Find Wrrapd address option (flexible matching - same as check function)
            // Use currentPopover to get all options including those that appeared after "Show more"
            const options = currentPopover.querySelectorAll('a, li a, [role="option"], li');
            console.log(`[selectWrrapdAddressFromDropdown] Found ${options.length} address options (after checking for "Show more addresses")`);
            
            // Log all options for debugging
            options.forEach((opt, idx) => {
                const optText = opt.textContent?.trim() || '';
                if (optText.length > 20) {
                    console.log(`[selectWrrapdAddressFromDropdown] Option ${idx + 1}: "${optText.substring(0, 100)}"`);
                }
            });
            
            // isWrrapdOption is now defined at the top of this function
            
            for (const option of options) {
                const text = option.textContent?.trim() || option.innerText?.trim() || '';
                if (isWrrapdOption(text)) {
                    console.log("[selectWrrapdAddressFromDropdown] ✓ Found Wrrapd address. Full text:", text.substring(0, 150));
                    console.log("[selectWrrapdAddressFromDropdown] Option element:", option);
                    console.log("[selectWrrapdAddressFromDropdown] Option tagName:", option.tagName);
                    console.log("[selectWrrapdAddressFromDropdown] Option HTML:", option.outerHTML.substring(0, 200));
                    
                    // Find ALL possible clickable elements
                    clickableElement = option.querySelector('a[href]') || 
                                          option.querySelector('a') ||
                                          option.closest('a') ||
                                          option;
                    
                    // Also check for parent <li> that might be clickable
                    const parentLi = option.closest('li');
                    if (parentLi && parentLi.querySelector('a')) {
                        clickableElement = parentLi.querySelector('a');
                    }
                    
                    // Scroll the element into view to ensure it's clickable
                    try {
                        clickableElement.scrollIntoView({ behavior: 'auto', block: 'center' });
                        await new Promise(r => setTimeout(r, 100)); // Reduced from 400ms
                    } catch (e) {
                        console.warn("[selectWrrapdAddressFromDropdown] Could not scroll element:", e);
                    }
                    
                    console.log("[selectWrrapdAddressFromDropdown] Clickable element:", clickableElement);
                    console.log("[selectWrrapdAddressFromDropdown] Clickable tagName:", clickableElement.tagName);
                    console.log("[selectWrrapdAddressFromDropdown] Clickable classes:", clickableElement.className);
                    console.log("[selectWrrapdAddressFromDropdown] Clickable href:", clickableElement.href || 'none');
                    
                    // VERIFY that the clickable element actually contains "Wrrapd" text
                    const clickableText = clickableElement.textContent?.trim() || clickableElement.innerText?.trim() || '';
                    const parentText = clickableElement.parentElement?.textContent?.trim() || clickableElement.parentElement?.innerText?.trim() || '';
                    const isActuallyWrrapd = clickableText.toLowerCase().includes('wrrapd') || parentText.toLowerCase().includes('wrrapd');
                    
                    if (!isActuallyWrrapd) {
                        console.error("[selectWrrapdAddressFromDropdown] ⚠️ WARNING: Clickable element does NOT contain 'Wrrapd'! Text:", clickableText.substring(0, 100));
                        console.error("[selectWrrapdAddressFromDropdown] Parent text:", parentText.substring(0, 100));
                        // Try to find the correct clickable element within the option
                        const allLinksInOption = option.querySelectorAll('a');
                        for (const link of allLinksInOption) {
                            const linkText = link.textContent?.trim() || link.innerText?.trim() || '';
                            const linkParentText = link.parentElement?.textContent?.trim() || link.parentElement?.innerText?.trim() || '';
                            if (linkText.toLowerCase().includes('wrrapd') || linkParentText.toLowerCase().includes('wrrapd')) {
                                console.log("[selectWrrapdAddressFromDropdown] Found correct Wrrapd link:", link);
                                clickableElement = link;
                                break;
                            }
                        }
                    }
                    
                    // Try using data-value attribute to trigger Amazon's selection mechanism
                    if (!dataValue) {
                        dataValue = clickableElement.getAttribute('data-value');
                    }
                    console.log("[selectWrrapdAddressFromDropdown] data-value:", dataValue);
                    
                    // Cache the data-value if we found it via search (for future use)
                    if (!wrrapdAddressCache && dataValue) {
                        wrrapdAddressCache = {
                            dataValue: dataValue,
                            stringVal: JSON.parse(dataValue)?.stringVal || null
                        };
                        console.log("[selectWrrapdAddressFromDropdown] ✓ Cached Wrrapd address data-value for future use:", wrrapdAddressCache);
                    }
                    
                    // Break out of search loop - we found the element
                    break;
                }
            }
            
            // If we have clickableElement (either from cache or search), proceed with selection
            if (clickableElement && dataValue) {
                // isWrrapdOption is already defined at the top of this function
                
                // Method 0: Try to trigger Amazon's declarative action directly
                    if (dataValue) {
                        try {
                            console.log("[selectWrrapdAddressFromDropdown] Attempting to use data-value for direct selection...");
                            
                            // Find the dropdown container and try to set value directly
                            const dropdownContainer = dropdownActivator.closest('.a-dropdown-container');
                            if (dropdownContainer) {
                                // Try to find and trigger the declarative action
                                const actionElement = clickableElement.closest('[data-action]');
                                if (actionElement) {
                                    // Remove aria-selected from all other options first
                                    const allOptions = dropdownContainer.querySelectorAll('[role="option"]');
                                    allOptions.forEach(opt => opt.setAttribute('aria-selected', 'false'));
                                    
                                    // Set aria-selected to true for our option
                                    clickableElement.setAttribute('aria-selected', 'true');
                                    
                                    // Wait a bit for the change to register
                    await new Promise(r => setTimeout(r, 100));
                    
                                    // Try to find the dropdown's hidden select element and set value directly
                                    const hiddenSelect = dropdownContainer.querySelector('select[class*="native"]');
                                    if (hiddenSelect && dataValue) {
                                        try {
                                            const parsedValue = JSON.parse(dataValue);
                                            const stringVal = parsedValue.stringVal;
                                            console.log("[selectWrrapdAddressFromDropdown] Trying to set native select value:", stringVal);
                                            
                                            // Try to find option with matching value
                                            const options = hiddenSelect.querySelectorAll('option');
                                            for (const opt of options) {
                                                if (opt.value === stringVal || opt.textContent?.includes('Wrrapd')) {
                                                    hiddenSelect.value = opt.value;
                                                    hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
                                                    console.log("[selectWrrapdAddressFromDropdown] Set native select value to:", opt.value);
                                                    await new Promise(r => setTimeout(r, 300));
                                                    break;
                                                }
                                            }
                                        } catch (e) {
                                            console.warn("[selectWrrapdAddressFromDropdown] Could not set native select:", e);
                                        }
                                    }
                                    
                                    // Trigger the action event with the data-value
                                    const actionEvent = new CustomEvent('a-dropdown-options', { 
                                        bubbles: true, 
                                        cancelable: true,
                                        detail: { value: JSON.parse(dataValue) }
                                    });
                                    actionElement.dispatchEvent(actionEvent);
                                    
                                    // Wait before clicking
                                    await new Promise(r => setTimeout(r, 200));
                                    
                                    // Click the element - try multiple times
                                    clickableElement.click();
                                    await new Promise(r => setTimeout(r, 300));
                                    clickableElement.click();
                                    await new Promise(r => setTimeout(r, 400));
                                }
                            }
                        } catch (e) {
                            console.warn("[selectWrrapdAddressFromDropdown] data-value method failed:", e);
                        }
                    }
                    
                    // Method 1: Try triggering Amazon's a-dropdown-options action directly
                    if (dataValue && clickableElement.closest('[data-action="a-dropdown-options"]')) {
                        try {
                            console.log("[selectWrrapdAddressFromDropdown] Trying to trigger Amazon's dropdown action...");
                            const actionElement = clickableElement.closest('[data-action="a-dropdown-options"]');
                            if (actionElement && actionElement.dispatchEvent) {
                                const actionEvent = new CustomEvent('a-dropdown-options', {
                                    bubbles: true,
                                    cancelable: true,
                                    detail: { value: dataValue }
                                });
                                actionElement.dispatchEvent(actionEvent);
                            }
                        } catch (e) {
                            console.warn("[selectWrrapdAddressFromDropdown] Action trigger failed:", e);
                        }
                    }
                    
                    // Method 2: Scroll and click (faster)
                    try {
                        clickableElement.scrollIntoView({ behavior: 'auto', block: 'center' });
                        await new Promise(r => setTimeout(r, 100)); // Reduced
                    } catch (e) {
                        console.warn("[selectWrrapdAddressFromDropdown] Could not scroll:", e);
                    }
                    
                    // Method 3: Direct click with proper coordinates and mouse events
                    try {
                        console.log("[selectWrrapdAddressFromDropdown] Clicking with coordinates...");
                        
                        // First, focus the element to ensure it's active
                        if (clickableElement.focus) {
                            clickableElement.focus();
                    await new Promise(r => setTimeout(r, 100));
                        }
                        
                        const rect = clickableElement.getBoundingClientRect();
                        let x = rect.left + rect.width / 2;
                        let y = rect.top + rect.height / 2;
                        
                        // Use mousedown, mouseup, and click events for better compatibility
                        const mouseDownEvent = new MouseEvent('mousedown', {
                            view: window,
                            bubbles: true,
                            cancelable: true,
                            clientX: x,
                            clientY: y,
                            button: 0
                        });
                        const mouseUpEvent = new MouseEvent('mouseup', {
                            view: window,
                            bubbles: true,
                            cancelable: true,
                            clientX: x,
                            clientY: y,
                            button: 0
                        });
                    const clickEvent = new MouseEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        clientX: x,
                        clientY: y,
                        button: 0
                    });
                        
                        // Remove aria-selected from all other options in the dropdown first
                        const dropdownContainerForClick = dropdownActivator.closest('.a-dropdown-container');
                        if (dropdownContainerForClick) {
                            const allOptions = dropdownContainerForClick.querySelectorAll('[role="option"]');
                            allOptions.forEach(opt => {
                                if (opt !== clickableElement) {
                                    opt.setAttribute('aria-selected', 'false');
                                }
                            });
                        }
                        
                        // Set aria-selected to true for our option
                        clickableElement.setAttribute('aria-selected', 'true');
                        await new Promise(r => setTimeout(r, 150));
                        
                        // Verify we're clicking the right element - check text content
                        const elementText = clickableElement.textContent?.trim() || clickableElement.innerText?.trim() || '';
                        const parentText = clickableElement.parentElement?.textContent?.trim() || clickableElement.parentElement?.innerText?.trim() || '';
                        const grandParentText = clickableElement.parentElement?.parentElement?.textContent?.trim() || clickableElement.parentElement?.parentElement?.innerText?.trim() || '';
                        const containsWrrapd = elementText.toLowerCase().includes('wrrapd') || parentText.toLowerCase().includes('wrrapd') || grandParentText.toLowerCase().includes('wrrapd');
                        
                        if (!containsWrrapd) {
                            console.error("[selectWrrapdAddressFromDropdown] ⚠️ CRITICAL: Clickable element does NOT contain 'Wrrapd'! Element text:", elementText.substring(0, 100));
                            console.error("[selectWrrapdAddressFromDropdown] Parent text:", parentText.substring(0, 100));
                            console.error("[selectWrrapdAddressFromDropdown] Grandparent text:", grandParentText.substring(0, 100));
                            // Try to find the correct element by looking for one that contains Wrrapd
                            const allLinks = popover.querySelectorAll('a[data-value]');
                            for (const link of allLinks) {
                                const linkText = link.textContent?.trim() || link.innerText?.trim() || '';
                                const linkParentText = link.parentElement?.textContent?.trim() || link.parentElement?.innerText?.trim() || '';
                                if (linkText.toLowerCase().includes('wrrapd') || linkParentText.toLowerCase().includes('wrrapd')) {
                                    console.log("[selectWrrapdAddressFromDropdown] Found correct Wrrapd link by searching all links:", link);
                                    clickableElement = link;
                                    // Recalculate coordinates
                                    const newRect = clickableElement.getBoundingClientRect();
                                    x = newRect.left + newRect.width / 2;
                                    y = newRect.top + newRect.height / 2;
                                    break;
                                }
                            }
                        }
                        
                        console.log("[selectWrrapdAddressFromDropdown] ✓ Verified clickable element contains 'Wrrapd'");
                        
                        // OPTIMIZED: Hover over the element first (simulates mouse movement)
                        const mouseEnterEvent = new MouseEvent('mouseenter', {
                            view: window,
                            bubbles: true,
                            cancelable: true,
                            clientX: x,
                            clientY: y
                        });
                        clickableElement.dispatchEvent(mouseEnterEvent);
                        await new Promise(r => setTimeout(r, 100)); // Reduced from 200ms
                        
                        // Dispatch events in sequence - mousedown, mouseup, then click
                        clickableElement.dispatchEvent(mouseDownEvent);
                        await new Promise(r => setTimeout(r, 50)); // Reduced from 150ms
                        clickableElement.dispatchEvent(mouseUpEvent);
                        await new Promise(r => setTimeout(r, 50)); // Reduced from 150ms
                        clickableElement.dispatchEvent(clickEvent);
                        await new Promise(r => setTimeout(r, 100)); // Reduced from 300ms
                        
                        // Then try direct click - once should be enough if events worked
                        clickableElement.click();
                        await new Promise(r => setTimeout(r, 200)); // Reduced from 400ms
                        
                        // OPTIMIZED: One more click to ensure it sticks
                        clickableElement.click();
                        await new Promise(r => setTimeout(r, 300)); // Reduced from 500ms
                    } catch (e) {
                        console.warn("[selectWrrapdAddressFromDropdown] Coordinate click failed:", e);
                    }
                    
                    // CRITICAL: Wait for dropdown to close and selection to apply
                    // Need longer wait to ensure Amazon processes the selection and it persists
                    await new Promise(r => setTimeout(r, 1500)); // Increased to ensure selection persists
                    
                    // CRITICAL: Poll to verify selection persists - Amazon may revert it initially
                    let selectionPersisted = false;
                    for (let pollAttempt = 0; pollAttempt < 5 && !selectionPersisted; pollAttempt++) {
                        await new Promise(r => setTimeout(r, 300));
                        
                        // Re-find the dropdown container in case DOM changed
                        const originalContainer = dropdownActivator.closest('.a-dropdown-container');
                        let dropdownContainer = originalContainer;
                        
                        // If original container is gone, try to find it by looking for the dropdown near the activator
                        if (!dropdownContainer || !document.body.contains(dropdownContainer)) {
                            // Find the parent element that contains the dropdown
                            let parent = dropdownActivator.parentElement;
                            for (let i = 0; i < 10 && parent; i++) {
                                dropdownContainer = parent.querySelector('.a-dropdown-container');
                                if (dropdownContainer) break;
                                parent = parent.parentElement;
                            }
                        }
                        
                        // If still not found, try finding by class near the activator
                        if (!dropdownContainer) {
                            const nearbyContainers = document.querySelectorAll('.a-dropdown-container');
                            for (const container of nearbyContainers) {
                                if (container.contains(dropdownActivator) || dropdownActivator.closest('.a-dropdown-container') === container) {
                                    dropdownContainer = container;
                                    break;
                                }
                            }
                        }
                        
                        const dropdownPrompt = dropdownContainer?.querySelector('.a-dropdown-prompt') || 
                                             dropdownContainer?.querySelector('.a-button-text') ||
                                             dropdownActivator.closest('.a-button-text') ||
                                             dropdownActivator;
                        
                        const selectedText = dropdownPrompt?.textContent?.trim() || dropdownPrompt?.innerText?.trim() || '';
                        
                        if (pollAttempt === 0) {
                            console.log("[selectWrrapdAddressFromDropdown] Selected text after click (poll attempt 0):", selectedText.substring(0, 150));
                        }
                        
                        if (isWrrapdOption(selectedText)) {
                            console.log(`[selectWrrapdAddressFromDropdown] ✓✓✓ Selection confirmed on poll attempt ${pollAttempt + 1}! ✓✓✓`);
                            
                            // CACHE the Wrrapd address details for future use
                            if (!wrrapdAddressCache && dataValue) {
                                wrrapdAddressCache = {
                                    dataValue: dataValue,
                                    stringVal: dataValue ? JSON.parse(dataValue)?.stringVal : null
                                };
                                console.log("[selectWrrapdAddressFromDropdown] ✓ Cached Wrrapd address details for future dropdowns:", wrrapdAddressCache);
                            }
                            
                            // Wait one more time to ensure it really stuck
                            await new Promise(r => setTimeout(r, 500));
                            const finalCheck = dropdownPrompt?.textContent?.trim() || dropdownPrompt?.innerText?.trim() || '';
                            if (isWrrapdOption(finalCheck)) {
                                console.log("[selectWrrapdAddressFromDropdown] ✓✓✓ Verified: Selection persisted after polling! ✓✓✓");
                                selectionPersisted = true;
                                return true;
                            } else {
                                console.warn(`[selectWrrapdAddressFromDropdown] Selection reverted on poll attempt ${pollAttempt + 1}. Continuing to poll...`);
                            }
                        } else if (pollAttempt === 4) {
                            console.warn("[selectWrrapdAddressFromDropdown] ⚠️ Selection did not persist after 5 poll attempts. Selected text:", selectedText.substring(0, 100));
                            console.warn("[selectWrrapdAddressFromDropdown] This may indicate Amazon is reverting the selection. Will retry...");
                        }
                    }
                    
                    // If we get here, selection didn't persist after polling
                    if (!selectionPersisted) {
                        // Re-find selectedText for error message
                        const errorContainer = dropdownActivator.closest('.a-dropdown-container');
                        const errorPrompt = errorContainer?.querySelector('.a-dropdown-prompt') || 
                                           errorContainer?.querySelector('.a-button-text') ||
                                           dropdownActivator;
                        const errorText = errorPrompt?.textContent?.trim() || errorPrompt?.innerText?.trim() || '';
                        
                        console.warn("[selectWrrapdAddressFromDropdown] ⚠️ Selection verification failed after polling.");
                        console.warn("[selectWrrapdAddressFromDropdown] Expected: Wrrapd PO BOX 26067");
                        console.warn("[selectWrrapdAddressFromDropdown] Got:", errorText.substring(0, 100));
                        
                        // Try one more time with a different approach - click the parent container
                        console.log("[selectWrrapdAddressFromDropdown] Attempting alternative click method...");
                        
                        // Re-open dropdown
                        dropdownActivator.click();
                        await new Promise(r => setTimeout(r, 800)); // Reduced
                        
                        const retryPopover = document.querySelector('.a-popover');
                        if (retryPopover) {
                            const retryOptions = retryPopover.querySelectorAll('a, li a, [role="option"], li');
                            for (const retryOption of retryOptions) {
                                const retryText = retryOption.textContent?.trim() || retryOption.innerText?.trim() || '';
                                if (isWrrapdOption(retryText)) {
                                    console.log("[selectWrrapdAddressFromDropdown] Found Wrrapd option in retry, clicking parent container...");
                                    
                                    // Try clicking the parent <li> or container
                                    const container = retryOption.closest('li') || retryOption.parentElement || retryOption;
                                    const link = container.querySelector('a') || container;
                                    
                                    // Use a more aggressive click approach
                                    link.scrollIntoView({ behavior: 'auto', block: 'center' });
                                    await new Promise(r => setTimeout(r, 100)); // Reduced
                                    
                                    // Try using data-value if available
                                    const linkDataValue = link.getAttribute('data-value');
                                    if (linkDataValue) {
                                        console.log("[selectWrrapdAddressFromDropdown] Using data-value for selection:", linkDataValue);
                                        // Try to set the value directly on the dropdown
                                        const dropdownSelect = dropdownActivator.closest('.a-dropdown-container')?.querySelector('select');
                                        if (dropdownSelect) {
                                            dropdownSelect.value = linkDataValue;
                                            dropdownSelect.dispatchEvent(new Event('change', { bubbles: true }));
                                        }
                                    }
                                    
                                    // Simulate a real mouse click
                                    const rect = link.getBoundingClientRect();
                                    const x = rect.left + rect.width / 2;
                                    const y = rect.top + rect.height / 2;
                                    
                                    const clickEvent = new MouseEvent('click', {
                                        view: window,
                                        bubbles: true,
                                        cancelable: true,
                                        clientX: x,
                                        clientY: y,
                                        button: 0
                                    });
                                    link.dispatchEvent(clickEvent);
                                    link.click();
                                    
                                    await new Promise(r => setTimeout(r, 800)); // Reduced from 3000ms
                                    
                                    const finalSelectedText = dropdownPrompt?.textContent?.trim() || dropdownPrompt?.innerText?.trim() || '';
                                    if (isWrrapdOption(finalSelectedText)) {
                                        console.log("[selectWrrapdAddressFromDropdown] ✓✓✓ Successfully selected Wrrapd address on retry! ✓✓✓");
                                        return true;
                                    } else {
                                        console.error("[selectWrrapdAddressFromDropdown] ✗ Retry also failed. Final selection:", finalSelectedText.substring(0, 100));
                                    }
                                }
                            }
                        }
                        
                        console.error("[selectWrrapdAddressFromDropdown] ✗ Failed to select Wrrapd address after all attempts.");
                        return false;
                    }
                }
            }
            
            console.warn("[selectWrrapdAddressFromDropdown] Wrrapd address not found in dropdown.");
            console.warn("[selectWrrapdAddressFromDropdown] Available options were logged above.");
            
            // CRITICAL: Before adding address, do a FINAL comprehensive check to ensure it's truly not available
            console.log("[selectWrrapdAddressFromDropdown] Performing FINAL comprehensive check for Wrrapd address...");
            
            // CRITICAL: Only check the CURRENT popover (not all popovers) - each dropdown has its own popover
            // Check the current popover one more time after a brief wait (in case it updated)
            let wrrapdFoundInFinalCheck = false;
            await new Promise(r => setTimeout(r, 500));
            
            // Use currentPopover (which is always initialized at the top of the function)
            const finalCheckPopover = currentPopover;
            const refreshedOptions = finalCheckPopover.querySelectorAll('a, li a, [role="option"], li');
            
            for (const opt of refreshedOptions) {
                const optText = opt.textContent?.trim() || opt.innerText?.trim() || '';
                if (isWrrapdOption(optText)) {
                    console.log(`[selectWrrapdAddressFromDropdown] ✓✓✓ FINAL CHECK: Found Wrrapd address in current popover! Text: "${optText.substring(0, 100)}"`);
                    wrrapdFoundInFinalCheck = true;
                    clickableElement = opt.querySelector('a[href]') || opt.querySelector('a') || opt.closest('a') || opt;
                    const parentLi = opt.closest('li');
                    if (parentLi && parentLi.querySelector('a')) {
                        clickableElement = parentLi.querySelector('a');
                    }
                    dataValue = clickableElement.getAttribute('data-value');
                    break;
                }
            }
            
            // If we found it in the final check, we need to select it using the SAME robust selection logic
            // The selection code below will handle it - we just need to ensure clickableElement and dataValue are set
            if (wrrapdFoundInFinalCheck && clickableElement && dataValue) {
                console.log("[selectWrrapdAddressFromDropdown] ✓✓✓ Wrrapd address found in final check - will use robust selection logic below!");
                // Ensure popover is still open before proceeding
                if (!popover || !document.body.contains(popover)) {
                    console.warn("[selectWrrapdAddressFromDropdown] Popover closed, reopening...");
                    dropdownActivator.click();
                    await new Promise(r => setTimeout(r, 1000));
                    // Re-find popover and element
                    const newPopover = document.querySelector('.a-popover');
                    if (newPopover) {
                        const refreshedOptions = newPopover.querySelectorAll('a, li a, [role="option"], li');
                        for (const opt of refreshedOptions) {
                            const optText = opt.textContent?.trim() || opt.innerText?.trim() || '';
                            if (isWrrapdOption(optText)) {
                                clickableElement = opt.querySelector('a[href]') || opt.querySelector('a') || opt.closest('a') || opt;
                                const parentLi = opt.closest('li');
                                if (parentLi && parentLi.querySelector('a')) {
                                    clickableElement = parentLi.querySelector('a');
                                }
                                dataValue = clickableElement.getAttribute('data-value');
                                break;
                            }
                        }
                    }
                }
                // Continue to the selection code below - don't return early
            }
            
            // CRITICAL: Only proceed to add address if we've confirmed it's truly not available
            if (!wrrapdFoundInFinalCheck || !clickableElement || !dataValue) {
                // CRITICAL: Only proceed to add address if we've confirmed it's truly not available
                console.log("[selectWrrapdAddressFromDropdown] ✓ FINAL CHECK CONFIRMED: Wrrapd address is NOT available. Proceeding to add new address...");
                
                // CRITICAL: Check if we're on the multi-address page
                // The "Add a new delivery address" link ONLY exists on the initial address selection page (when clicking 'Change' address)
                // It does NOT exist on the multi-address page, modals, or any other place
                const currentURL = window.location.href;
                const isMultiAddressPage = currentURL.includes('itemselect/handlers/display.html') ||
                    (currentURL.includes('/checkout/p/') && currentURL.includes('/itemselect') && currentURL.includes('useCase=multiAddress'));
                
                if (isMultiAddressPage) {
                    console.error("[selectWrrapdAddressFromDropdown] ✗✗✗ CRITICAL: Wrrapd address not found on multi-address page, but 'Add a new delivery address' link does NOT exist on this page!");
                    console.error("[selectWrrapdAddressFromDropdown] The 'Add a new delivery address' link ONLY exists on the initial address selection page (when clicking 'Change' address).");
                    console.error("[selectWrrapdAddressFromDropdown] Cannot add address from multi-address page. Address must be added on the single address selection page first.");
                    document.body.click(); // Close dropdown
                    return false;
                }
                
                // CRITICAL: If Wrrapd address is not found, trigger "Add new address" flow
                // This code only runs on the single address selection page (where the link exists)
                console.log("[selectWrrapdAddressFromDropdown] Wrrapd address missing - looking for 'Add a new delivery address' on the page...");
            console.log("[selectWrrapdAddressFromDropdown] There is ONLY ONE mention of this text on the page - searching comprehensively...");
            
            // TEMPORARILY HIDE LOADING SCREEN so user can see what's happening
            hideLoadingScreen();
            
            // IMPORTANT: "Add a new delivery address" is on the MAIN PAGE, not in the popover!
            // Since there's ONLY ONE mention, we'll search thoroughly using multiple methods
            let newAddrLink = null;
            const searchText = "add a new delivery address";
            const searchTextLower = searchText.toLowerCase();
            
            // METHOD 1: Search all text nodes directly (most reliable for finding exact text)
            console.log("[selectWrrapdAddressFromDropdown] METHOD 1: Searching all text nodes...");
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            
            let textNode;
            while (textNode = walker.nextNode()) {
                const text = textNode.textContent.trim();
                if (text.toLowerCase().includes(searchTextLower)) {
                    console.log(`[selectWrrapdAddressFromDropdown] ✓ Found text node: "${text.substring(0, 100)}"`);
                    // Find the clickable parent element
                    let parent = textNode.parentElement;
                    while (parent && parent !== document.body) {
                        // Check if parent or any ancestor is clickable
                        if (parent.tagName === 'A' || parent.tagName === 'BUTTON' || 
                            parent.onclick || parent.getAttribute('role') === 'link' || 
                            parent.getAttribute('role') === 'button' || parent.hasAttribute('onclick') ||
                            parent.style.cursor === 'pointer' || parent.classList.contains('a-link-normal')) {
                            newAddrLink = parent;
                            console.log(`[selectWrrapdAddressFromDropdown] ✓ Found clickable parent: ${parent.tagName}, text: "${text.substring(0, 80)}"`);
                            break;
                        }
                        parent = parent.parentElement;
                    }
                    // If no clickable parent found, use the element containing the text
                    if (!newAddrLink) {
                        newAddrLink = textNode.parentElement;
                        console.log(`[selectWrrapdAddressFromDropdown] Using text node's parent: ${newAddrLink.tagName}`);
                    }
                    break; // Found it - stop searching
                }
            }
            
            // METHOD 2: XPath search (if METHOD 1 didn't find it)
            if (!newAddrLink) {
                console.log("[selectWrrapdAddressFromDropdown] METHOD 2: Using XPath search...");
                try {
                    const xpath = `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${searchTextLower}')]`;
                    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    const textElement = result.singleNodeValue;
                    
                    if (textElement) {
                        console.log(`[selectWrrapdAddressFromDropdown] ✓ Found via XPath: "${textElement.textContent?.trim().substring(0, 80)}"`);
                        // Find clickable parent
                        newAddrLink = textElement.closest('a, button, [role="link"], [role="button"], [onclick], .a-link-normal') || textElement;
                    }
                } catch (e) {
                    console.warn("[selectWrrapdAddressFromDropdown] XPath search failed:", e);
                }
            }
            
            // METHOD 3: Search all elements by textContent (comprehensive fallback)
            if (!newAddrLink) {
                console.log("[selectWrrapdAddressFromDropdown] METHOD 3: Searching all elements by textContent...");
                const allElements = document.querySelectorAll('*');
                console.log(`[selectWrrapdAddressFromDropdown] Searching through ${allElements.length} elements...`);
                
                for (const element of allElements) {
                    const elementText = (element.textContent || element.innerText || '').trim();
                    if (!elementText) continue;
                    
                    const elementTextLower = elementText.toLowerCase();
                    
                    // Look for exact match or close match
                    if (elementTextLower.includes(searchTextLower)) {
                        console.log(`[selectWrrapdAddressFromDropdown] ✓ Found element with text: "${elementText.substring(0, 100)}"`);
                        // Check if element itself is clickable
                        if (element.tagName === 'A' || element.tagName === 'BUTTON' || 
                            element.onclick || element.getAttribute('role') === 'link' || 
                            element.getAttribute('role') === 'button' || element.hasAttribute('onclick') ||
                            element.style.cursor === 'pointer' || element.classList.contains('a-link-normal')) {
                            newAddrLink = element;
                            console.log(`[selectWrrapdAddressFromDropdown] ✓ Element is clickable: ${element.tagName}`);
                            break;
                        }
                        // Otherwise find clickable parent
                        const clickable = element.closest('a, button, [role="link"], [role="button"], [onclick], .a-link-normal');
                        if (clickable) {
                            newAddrLink = clickable;
                            console.log(`[selectWrrapdAddressFromDropdown] ✓ Found clickable parent: ${clickable.tagName}`);
                            break;
                        }
                    }
                }
            }
            
            // METHOD 4: Search all links/buttons directly (last resort)
            if (!newAddrLink) {
                console.log("[selectWrrapdAddressFromDropdown] METHOD 4: Searching all clickable elements directly...");
                const allClickable = Array.from(document.querySelectorAll('a, button, [role="link"], [role="button"], .a-link-normal'));
                console.log(`[selectWrrapdAddressFromDropdown] Checking ${allClickable.length} clickable elements...`);
                
                for (const clickable of allClickable) {
                    const clickableText = (clickable.textContent || clickable.innerText || '').trim().toLowerCase();
                    if (clickableText.includes(searchTextLower)) {
                        console.log(`[selectWrrapdAddressFromDropdown] ✓ Found clickable element: "${(clickable.textContent || clickable.innerText || '').trim().substring(0, 80)}"`);
                        newAddrLink = clickable;
                        break;
                    }
                }
            }
            
            if (newAddrLink) {
                console.log("[selectWrrapdAddressFromDropdown] Clicking 'Add a new delivery address' to open form...");
                console.log("[selectWrrapdAddressFromDropdown] Element details:", {
                    tagName: newAddrLink.tagName,
                    text: newAddrLink.textContent?.trim().substring(0, 100),
                    href: newAddrLink.href,
                    onclick: !!newAddrLink.onclick
                });
                try {
                    // Show loading screen again before clicking
                    showLoadingScreen();
                    
                    // Click the link to open the address form (matching old code)
                    newAddrLink.click();
                    await new Promise(r => setTimeout(r, 2000)); // Wait for form to open (matching old code)
                    
                    // Now fill in the Wrrapd address using the same approach as old code
                    console.log("[selectWrrapdAddressFromDropdown] Filling Wrrapd address in form...");
                    const success = await fillWrrapdAddressInModal();
                    
                    if (success) {
                        console.log("[selectWrrapdAddressFromDropdown] ✓ Wrrapd address added successfully!");
                        // Note: fillWrrapdAddressInModal already waited 8 seconds after saving (matching old code)
                        // Wait a bit more for the address to be saved and page to update
                        await new Promise(r => setTimeout(r, 3000));
                        
                        // Close any open modals/forms
                        document.body.click();
                        await new Promise(r => setTimeout(r, 1000));
                        
                        // CRITICAL: Close dropdown if still open to ensure fresh state
                        const stillOpenPopover = document.querySelector('.a-popover');
                        if (stillOpenPopover) {
                            document.body.click();
                            await new Promise(r => setTimeout(r, 500));
                        }
                        
                        // CRITICAL: After adding address, retry selection for THIS SPECIFIC dropdown only
                        // Pass the original dropdownActivator to ensure we're selecting for the correct item
                        console.log("[selectWrrapdAddressFromDropdown] Retrying to select Wrrapd address for THIS dropdown only...");
                        return await selectWrrapdAddressFromDropdown(dropdownActivator);
                    } else {
                        console.error("[selectWrrapdAddressFromDropdown] ✗ Failed to add Wrrapd address.");
                        document.body.click(); // Close dropdown
                        return false;
                    }
                } catch (error) {
                    console.error("[selectWrrapdAddressFromDropdown] Error clicking 'Add a new delivery address':", error);
                    document.body.click(); // Close dropdown
                    return false;
                }
            } else {
                console.warn("[selectWrrapdAddressFromDropdown] 'Add a new delivery address' option not found on page.");
                console.warn("[selectWrrapdAddressFromDropdown] Searched through all options but couldn't find 'Add new address' link.");
                
                // Show loading screen again since we're done searching
                showLoadingScreen();
                
            // Clear cache if Wrrapd address not found (it might have been removed)
            wrrapdAddressCache = null;
            document.body.click(); // Close dropdown
            return false;
            }
            } // Close else block
        } catch (error) {
            console.error("[selectWrrapdAddressFromDropdown] Error:", error);
            return false;
        }
    }
    
    /**
     * Select default address from dropdown
     */
    async function selectDefaultAddressFromDropdown(dropdownActivator, defaultAddress) {
        try {
            console.log("[selectDefaultAddressFromDropdown] Opening dropdown...");
            dropdownActivator.click();
                await new Promise(r => setTimeout(r, 2000));
                
            const popover = document.querySelector('.a-popover');
            if (!popover) {
                console.warn("[selectDefaultAddressFromDropdown] Popover did not appear.");
                return false;
            }
            
            const options = popover.querySelectorAll('a, li a, [role="option"]');
            const defaultName = (defaultAddress.name || '').trim();
            const defaultCity = (defaultAddress.city || '').trim();
            
            for (const option of options) {
                const text = option.textContent || '';
                if ((defaultName && text.includes(defaultName)) || 
                    (defaultCity && text.includes(defaultCity))) {
                    console.log("[selectDefaultAddressFromDropdown] Found default address. Clicking...");
                    option.click();
                    await new Promise(r => setTimeout(r, 2000));
                    return true;
                }
            }
            
            console.warn("[selectDefaultAddressFromDropdown] Default address not found.");
            document.body.click();
            return false;
        } catch (error) {
            console.error("[selectDefaultAddressFromDropdown] Error:", error);
            return false;
        }
    }
    
    /**
     * Selects addresses for a single row using custom .a-dropdown-prompt dropdowns
     */
    async function selectAddressesForRow(row, titleKey, productObj, defaultAddress, wrrapdAddress) {
        console.log(`[selectAddressesForRow] Processing addresses for "${titleKey}".`);
        
        try {
            // Find all address dropdown prompts in this row
            // These are custom Amazon dropdowns, not native <select> elements
            const addressDropdowns = row.querySelectorAll('.a-dropdown-prompt, [class*="dropdown-prompt"], [class*="lineitem-address"] .a-dropdown-prompt');
            console.log(`[selectAddressesForRow] Found ${addressDropdowns.length} address dropdown(s) in row`);
            
            if (addressDropdowns.length === 0) {
                console.warn(`[selectAddressesForRow] No address dropdowns found in row for "${titleKey}"`);
                return;
            }
            
            // Also find quantity information to map addresses to sub-items
            const quantityDropdowns = row.querySelectorAll('.quantity-dropdown .a-dropdown-prompt, [class*="quantity"] .a-dropdown-prompt');
            const quantityValues = [];
            quantityDropdowns.forEach(dropdown => {
                const qtyText = dropdown.textContent?.trim() || '1';
                const qty = parseInt(qtyText, 10) || 1;
                quantityValues.push(qty);
            });
            
            // If no quantity dropdowns, assume 1 per address dropdown
            if (quantityValues.length === 0) {
                addressDropdowns.forEach(() => quantityValues.push(1));
            }
            
            // Map each address dropdown to sub-items
            let subItemIndex = 0;
            
            for (let i = 0; i < addressDropdowns.length; i++) {
                try {
                    const dropdownElement = addressDropdowns[i];
                    const qty = quantityValues[i] || 1;
                    
                    // Collect all sub-items that map to this dropdown
                    const subItemsForThisDropdown = [];
                    for (let q = 0; q < qty; q++) {
                        if (subItemIndex >= productObj.options.length) {
                            break;
                        }
                        subItemsForThisDropdown.push({
                            index: subItemIndex,
                            subItem: productObj.options[subItemIndex]
                        });
                        subItemIndex++;
                    }
                    
                    if (subItemsForThisDropdown.length === 0) {
                        console.warn(`[selectAddressesForRow] No sub-items mapped to dropdown ${i}. Skipping.`);
                        continue;
                    }
                    
                    // Check what address is needed for this dropdown
                    let wrrapdCount = 0;
                    let defaultCount = 0;
                    for (const { subItem } of subItemsForThisDropdown) {
                        if (subItem.checkbox_wrrapd === true) {
                            wrrapdCount++;
                        } else {
                            defaultCount++;
                        }
                    }
                    
                    // Select the appropriate address in the custom dropdown
                    if (wrrapdCount > 0) {
                        // Need Wrrapd address
                        const success = await selectAddressInCustomDropdown(dropdownElement, true, defaultAddress, wrrapdAddress);
                        
                        if (success) {
                            console.log(`[selectAddressesForRow] Successfully selected Wrrapd address for dropdown ${i}.`);
                            // Update Wrrapd sub-items' addresses in storage
                            for (const { index, subItem } of subItemsForThisDropdown) {
                                if (subItem.checkbox_wrrapd) {
                                    subItem.amazonShippingAddress = wrrapdAddress;
                                }
                            }
                            saveItemToLocalStorage(productObj);
                        } else {
                            console.warn(`[selectAddressesForRow] Failed to select Wrrapd address for dropdown ${i}.`);
                        }
                    } else {
                        // All sub-items are NOT for Wrrapd - verify/default address is selected
                        console.log(`[selectAddressesForRow] Dropdown ${i} maps to ${subItemsForThisDropdown.length} sub-item(s) - all are NOT for Wrrapd. Keeping default address.`);
                        if (defaultAddress) {
                            // Optionally verify/select default address
                            await selectAddressInCustomDropdown(dropdownElement, false, defaultAddress, wrrapdAddress);
                            // Update addresses in storage to default
                            for (const { index, subItem } of subItemsForThisDropdown) {
                                subItem.amazonShippingAddress = defaultAddress;
                            }
                            saveItemToLocalStorage(productObj);
                        }
                    }
                    
                } catch (err) {
                    console.error(`[selectAddressesForRow] Error processing dropdown ${i}:`, err);
                }
            }
            
        } catch (err) {
            console.error(`[selectAddressesForRow] Error:`, err);
        }
    }
    
    /**
     * OLD FUNCTION - Keeping for reference but not using
     * Selects addresses for a single row using Gemini AI to find native <select> dropdowns
     */
    async function selectAddressesForRow_OLD(row, titleKey, productObj, defaultAddress, wrrapdAddress) {
        console.log(`[selectAddressesForRow] Processing addresses for "${titleKey}".`);
        
        try {
            // First, get a comprehensive DOM snapshot of the entire page for Gemini
            const fullPageSnapshot = getFullPageDOMSnapshot();
            
            // Use Gemini AI to find all native <select> elements that are address dropdowns
            const prompt = `You are analyzing an Amazon multi-address selection page. The page contains product rows where users can select shipping addresses using native HTML <select> dropdown menus.

Here is the DOM structure of the page:
${fullPageSnapshot}

Find ALL the native HTML <select> elements that are used for selecting shipping addresses. These are typically:
- Located within product/item rows
- Have options containing address information (names, cities, states, zip codes)
- May have IDs or classes related to "address", "ship", "deliver", etc.

For each <select> element you find, provide:
1. A CSS selector that uniquely identifies it
2. The product/item it belongs to (if identifiable from context)

Return a JSON array of objects, each with:
- "selector": the CSS selector for the <select> element
- "productTitle": the product title or identifier (if available, otherwise "unknown")
- "index": the index/position of this select within its row (0-based)

Format: [{"selector": "select#address-123", "productTitle": "Product Name", "index": 0}, ...]

If you cannot find any <select> elements, return an empty array: [].

Return ONLY the JSON array, nothing else.`;

            console.log(`[selectAddressesForRow] Calling Gemini API to find address selects...`);
            const aiResponse = await callGeminiAPI(prompt);
            console.log(`[selectAddressesForRow] Gemini API response received, length: ${aiResponse ? aiResponse.length : 0}`);
            
            let addressSelects = [];
            if (aiResponse) {
                console.log(`[selectAddressesForRow] AI response preview: ${aiResponse.substring(0, 200)}...`);
                try {
                    // Try to parse as JSON array
                    const cleaned = aiResponse.trim();
                    // Remove markdown code blocks if present
                    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
                    const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;
                    
                    if (jsonStr.startsWith('[')) {
                        addressSelects = JSON.parse(jsonStr);
                        console.log(`[selectAddressesForRow] Successfully parsed AI response: ${addressSelects.length} selects found`);
                    } else {
                        console.warn(`[selectAddressesForRow] AI response doesn't start with '[': ${jsonStr.substring(0, 100)}`);
                    }
                } catch (e) {
                    console.warn(`[selectAddressesForRow] Failed to parse AI response as JSON:`, e);
                    console.warn(`[selectAddressesForRow] AI response was: ${aiResponse.substring(0, 500)}`);
                }
            } else {
                console.warn(`[selectAddressesForRow] No response from Gemini API`);
            }
            
            // Fallback: find all <select> elements in the row
            if (addressSelects.length === 0) {
                console.log(`[selectAddressesForRow] AI didn't find selects, trying fallback - looking for all <select> elements in row...`);
                const allSelects = row.querySelectorAll('select');
                console.log(`[selectAddressesForRow] Found ${allSelects.length} <select> elements in row using fallback`);
                allSelects.forEach((select, index) => {
                    // Try to create a unique selector
                    let selector = 'select';
                    if (select.id) {
                        selector = `select#${select.id}`;
                    } else if (select.name) {
                        selector = `select[name="${select.name}"]`;
                    } else if (select.className) {
                        const classes = select.className.trim().split(/\s+/).filter(c => c.length > 0);
                        if (classes.length > 0) {
                            selector = `select.${classes[0]}`;
                        }
                    }
                    
                    // Check if this select has address-related options
                    const options = Array.from(select.options);
                    const hasAddressOptions = options.some(opt => {
                        const text = opt.text.toLowerCase();
                        return text.includes('jacksonville') || 
                               text.includes('address') || 
                               text.includes('ship') ||
                               text.includes('deliver') ||
                               /[A-Z]{2}\s+\d{5}/.test(text); // State and zip pattern
                    });
                    
                    if (hasAddressOptions || options.length > 0) {
                        addressSelects.push({
                            selector: selector,
                            productTitle: titleKey,
                            index: index
                        });
                    }
                });
            }
            
            // Filter selects for this specific product row
            let rowSelects = addressSelects.filter(s => {
                // Check if selector exists in this row
                const element = row.querySelector(s.selector);
                if (element) {
                    console.log(`[selectAddressesForRow] AI selector "${s.selector}" found in row`);
                } else {
                    console.log(`[selectAddressesForRow] AI selector "${s.selector}" NOT found in row`);
                }
                return element !== null;
            });
            
            console.log(`[selectAddressesForRow] After filtering, ${rowSelects.length} selects match this row`);
            
            // If no row-specific selects found, try finding all selects in the row
            if (rowSelects.length === 0) {
                console.log(`[selectAddressesForRow] No AI selects matched, finding all selects in row directly...`);
                const allSelectsInRow = row.querySelectorAll('select');
                console.log(`[selectAddressesForRow] Found ${allSelectsInRow.length} <select> elements directly in row`);
                
                allSelectsInRow.forEach((select, index) => {
                    // Log select info
                    console.log(`[selectAddressesForRow] Select ${index}: id="${select.id}", name="${select.name}", classes="${select.className}", options=${select.options.length}`);
                    
                    // Create a selector for this select
                    let selector = getUniqueSelectorForElement(select, row);
                    if (!selector) {
                        // Fallback: use a more generic selector
                        if (select.id) {
                            selector = `select#${select.id}`;
                        } else if (select.name) {
                            selector = `select[name="${select.name}"]`;
                        } else {
                            selector = `select:nth-of-type(${index + 1})`;
                        }
                    }
                    
                    rowSelects.push({
                        selector: selector,
                        productTitle: titleKey,
                        index: index
                    });
                });
            }
            
            console.log(`[selectAddressesForRow] Total ${rowSelects.length} address <select> dropdown(s) found for "${titleKey}".`);
            
            if (rowSelects.length === 0) {
                console.warn(`[selectAddressesForRow] No address selects found for "${titleKey}".`);
                return;
            }
            
            // Also find quantity information to map addresses to sub-items
            const quantitySelects = row.querySelectorAll('select[class*="quantity"], select[name*="quantity"]');
            const quantityValues = [];
            quantitySelects.forEach(select => {
                const value = parseInt(select.value, 10) || 1;
                quantityValues.push(value);
            });
            
            // If no quantity selects, assume 1 per address select
            if (quantityValues.length === 0) {
                rowSelects.forEach(() => quantityValues.push(1));
            }
            
            // Map each address select to sub-items
            let subItemIndex = 0;
            
            for (let i = 0; i < rowSelects.length; i++) {
                try {
                    const selectInfo = rowSelects[i];
                    // Find the select element - try within row first, then globally
                    let selectElement = row.querySelector(selectInfo.selector);
                    if (!selectElement) {
                        // Try finding by index if selector doesn't work
                        const allSelects = row.querySelectorAll('select');
                        if (allSelects[selectInfo.index]) {
                            selectElement = allSelects[selectInfo.index];
                        }
                    }
                    
                    if (!selectElement || selectElement.tagName !== 'SELECT') {
                        console.warn(`[selectAddressesForRow] Select element not found for selector "${selectInfo.selector}". Skipping.`);
                        continue;
                    }
                    
                    // Determine quantity for this address select
                    const qty = quantityValues[i] || 1;
                    
                    // Collect all sub-items that map to this select
                    const subItemsForThisSelect = [];
                    for (let q = 0; q < qty; q++) {
                        if (subItemIndex >= productObj.options.length) {
                            break;
                        }
                        subItemsForThisSelect.push({
                            index: subItemIndex,
                            subItem: productObj.options[subItemIndex]
                        });
                        subItemIndex++;
                    }
                    
                    if (subItemsForThisSelect.length === 0) {
                        console.warn(`[selectAddressesForRow] No sub-items mapped to select ${i}. Skipping.`);
                        continue;
                    }
                    
                    // Check what address is needed for this select
                    let wrrapdCount = 0;
                    let defaultCount = 0;
                    for (const { subItem } of subItemsForThisSelect) {
                        if (subItem.checkbox_wrrapd === true) {
                            wrrapdCount++;
                        } else {
                            defaultCount++;
                        }
                    }
                    
                    // Select the appropriate address in the native <select> dropdown
                    if (wrrapdCount > 0) {
                        // Need Wrrapd address
                        const success = await selectAddressInNativeSelect(selectElement, true, defaultAddress, wrrapdAddress);
                        
                        if (success) {
                            console.log(`[selectAddressesForRow] Successfully selected Wrrapd address for select ${i}.`);
                            // Update Wrrapd sub-items' addresses in storage
                            for (const { index, subItem } of subItemsForThisSelect) {
                                if (subItem.checkbox_wrrapd) {
                                    subItem.amazonShippingAddress = wrrapdAddress;
                                }
                            }
                            saveItemToLocalStorage(productObj);
                        } else {
                            console.warn(`[selectAddressesForRow] Failed to select Wrrapd address for select ${i}.`);
                        }
                    } else {
                        // All sub-items are NOT for Wrrapd - verify/default address is selected
                        console.log(`[selectAddressesForRow] Select ${i} maps to ${subItemsForThisSelect.length} sub-item(s) - all are NOT for Wrrapd. Keeping default address.`);
                        if (defaultAddress) {
                            // Optionally verify/select default address
                            await selectAddressInNativeSelect(selectElement, false, defaultAddress, wrrapdAddress);
                            // Update addresses in storage to default
                            for (const { index, subItem } of subItemsForThisSelect) {
                                subItem.amazonShippingAddress = defaultAddress;
                            }
                            saveItemToLocalStorage(productObj);
                        }
                    }
                    
                } catch (err) {
                    console.error(`[selectAddressesForRow] Error processing select ${i}:`, err);
                }
            }
            
        } catch (err) {
            console.error(`[selectAddressesForRow] Error:`, err);
        }
    }
    
    /**
     * Selects an address from the dropdown - opens dropdown and selects the target address
     */
    async function selectAddressFromDropdown(dropdownActivator, needsWrrapd, targetAddress) {
        try {
            console.log(`[selectAddressFromDropdown] Starting. NeedsWrrapd: ${needsWrrapd}`);
            
            // Close any existing dropdowns first
            const existingPopovers = document.querySelectorAll('.a-popover');
            if (existingPopovers.length > 0) {
                console.log("[selectAddressFromDropdown] Closing existing popovers...");
                document.body.click();
                await new Promise(r => setTimeout(r, 1500));
            }
            
            // Click the dropdown activator
            console.log("[selectAddressFromDropdown] Clicking dropdown activator...");
            dropdownActivator.click();
            await new Promise(r => setTimeout(r, 2000));
            
            // Wait for popover to appear
            const popover = await waitForElement('.a-popover', 3000);
            if (!popover) {
                console.warn("[selectAddressFromDropdown] Popover did not appear after clicking dropdown.");
                return false;
            }
            
            console.log("[selectAddressFromDropdown] Popover appeared. Waiting for address options...");
            await new Promise(r => setTimeout(r, 1500));
            
            // Get all address options (same selector we used in debug mode)
            let addressOptions = popover.querySelectorAll('ul.a-list-link li a, .a-popover a, .a-list-link a');
            
            if (!addressOptions || addressOptions.length === 0) {
                console.warn("[selectAddressFromDropdown] No address options found. Trying alternative selectors...");
                addressOptions = popover.querySelectorAll('a, li a, [role="option"]');
            }
            
            if (!addressOptions || addressOptions.length === 0) {
                console.error("[selectAddressFromDropdown] No address options found in popover.");
                document.body.click();
                return false;
            }
            
            console.log(`[selectAddressFromDropdown] Found ${addressOptions.length} address options. Searching for target address...`);
            
            // Find the target address option
            let targetOption = null;
            
            if (needsWrrapd) {
                // Looking for Wrrapd address: "Wrrapd, PO BOX 26067, Jacksonville, FL, 32226-6067"
                console.log("[selectAddressFromDropdown] Searching for Wrrapd address (PO BOX 26067, Jacksonville, 32226-6067)...");
                const wrrapdAddress = buildWrrapdAddress();
                
                // Log all available options for debugging
                console.log(`[selectAddressFromDropdown] Available address options (${addressOptions.length}):`);
                addressOptions.forEach((opt, idx) => {
                    console.log(`  [${idx}] "${opt.textContent.trim().substring(0, 100)}"`);
                });
                
                // Try multiple matching strategies, from most specific to least specific
                for (const option of addressOptions) {
                    const optionText = option.textContent.trim().toUpperCase();
                    const optionTextLower = option.textContent.trim().toLowerCase();
                    
                    // Strategy 1: Match by PO Box number (most reliable identifier)
                    const hasPOBox = optionText.includes("PO BOX 26067") || 
                                   optionText.includes("P.O. BOX 26067") ||
                                   optionText.includes("POBOX 26067") ||
                                   optionText.includes("26067");
                    
                    // Strategy 2: Match by city
                    const hasJacksonville = optionText.includes("JACKSONVILLE");
                    
                    // Strategy 3: Match by name (Wrrapd)
                    const hasWrrapdName = optionTextLower.includes("wrrapd") || 
                                        optionTextLower.includes("wrrapd.com");
                    
                    // Strategy 4: Match by zip codes (both possible formats)
                    const hasCorrectZip = optionText.includes("32218") || 
                                        optionText.includes("32226") ||
                                        optionText.includes("32218-") ||
                                        optionText.includes("32226-");
                    
                    // Strategy 5: Match by state and city combination
                    const hasFLJacksonville = optionText.includes("FL") && hasJacksonville;
                    
                    // Match if we have PO Box OR (Wrrapd name AND Jacksonville) OR (PO Box number AND Jacksonville)
                    // This is more flexible but still accurate
                    const isMatch = (hasPOBox && hasJacksonville) || // PO Box + Jacksonville = definite match
                                  (hasPOBox && hasCorrectZip) ||    // PO Box + correct zip = definite match
                                  (hasWrrapdName && hasJacksonville) || // Wrrapd name + Jacksonville = match
                                  (hasWrrapdName && hasPOBox) ||     // Wrrapd name + PO Box = match
                                  (hasPOBox && hasFLJacksonville);   // PO Box + FL + Jacksonville = match
                    
                    if (isMatch) {
                        targetOption = option;
                        console.log(`[selectAddressFromDropdown] ✓ FOUND Wrrapd address: "${option.textContent.trim().substring(0, 100)}"`);
                        console.log(`[selectAddressFromDropdown] Match criteria: POBox=${hasPOBox}, Jacksonville=${hasJacksonville}, Wrrapd=${hasWrrapdName}, Zip=${hasCorrectZip}`);
                        break;
                    }
                }
                
                // If still not found, try using Gemini API to help identify it
                if (!targetOption && addressOptions.length > 0) {
                    console.log("[selectAddressFromDropdown] Wrrapd address not found with standard matching. Using Gemini API to identify...");
                    try {
                        const optionsText = Array.from(addressOptions).map((opt, idx) => 
                            `[${idx}] ${opt.textContent.trim()}`
                        ).join('\n');
                        
                        const geminiPrompt = `I need to identify which of these Amazon shipping addresses is the Wrrapd address. 
The Wrrapd address should be:
- Name: Wrrapd or Wrrapd.com
- Street: PO BOX 26067 or P.O. BOX 26067
- City: JACKSONVILLE
- State: FL
- Zip: 32218 or 32226

Here are the available addresses:
${optionsText}

Respond with ONLY the index number (0, 1, 2, etc.) of the address that matches the Wrrapd address. If none match exactly, respond with the index of the closest match. If you cannot determine, respond with "NOT_FOUND".`;
                        
                        const geminiResult = await callGeminiAPI(geminiPrompt);
                        if (geminiResult && !geminiResult.includes("NOT_FOUND")) {
                            const matchIndex = parseInt(geminiResult.trim());
                            if (!isNaN(matchIndex) && matchIndex >= 0 && matchIndex < addressOptions.length) {
                                targetOption = addressOptions[matchIndex];
                                console.log(`[selectAddressFromDropdown] ✓ Gemini identified Wrrapd address at index ${matchIndex}: "${targetOption.textContent.trim().substring(0, 100)}"`);
                            }
                        }
                    } catch (geminiError) {
                        console.warn("[selectAddressFromDropdown] Gemini API failed, continuing with manual search:", geminiError);
                    }
                }
            } else {
                // Looking for default address
                console.log("[selectAddressFromDropdown] Searching for default address:", targetAddress);
                const defaultName = (targetAddress.name || '').trim();
                const defaultCity = (targetAddress.city || '').trim();
                const defaultState = (targetAddress.state || '').trim();
                const defaultZip = (targetAddress.postalCode || '').trim();
                const defaultStreet = (targetAddress.street || '').trim();
                
                for (const option of addressOptions) {
                    const optionText = option.textContent.trim();
                    // Match by name and city/state, or by zip, or by street
                    const matchesName = defaultName && optionText.includes(defaultName);
                    const matchesCity = defaultCity && optionText.includes(defaultCity);
                    const matchesState = defaultState && optionText.includes(defaultState);
                    const matchesZip = defaultZip && optionText.includes(defaultZip);
                    const matchesStreet = defaultStreet && optionText.includes(defaultStreet);
                    
                    if (matchesName && (matchesCity || matchesState || matchesZip) || matchesZip || matchesStreet) {
                        targetOption = option;
                        console.log(`[selectAddressFromDropdown] Found default address: "${optionText.substring(0, 80)}"`);
                        break;
                    }
                }
            }
            
            if (targetOption) {
                console.log(`[selectAddressFromDropdown] Clicking target address option...`);
                targetOption.click();
                await new Promise(r => setTimeout(r, 2000));
                
                // Verify selection worked by checking if popover closed
                const popoverStillOpen = document.querySelector('.a-popover');
                if (!popoverStillOpen) {
                    console.log("[selectAddressFromDropdown] Selection successful - popover closed.");
                    return true;
                } else {
                    console.warn("[selectAddressFromDropdown] Popover still open after clicking. Closing manually...");
                    document.body.click();
                    await new Promise(r => setTimeout(r, 1000));
                    return true; // Assume success
                }
            } else {
                console.error(`[selectAddressFromDropdown] Target address not found in dropdown options.`);
                console.log(`[selectAddressFromDropdown] Available options:`);
                addressOptions.forEach((opt, idx) => {
                    if (idx < 5) {
                        console.log(`  [${idx + 1}] "${opt.textContent.trim().substring(0, 60)}"`);
                    }
                });
                document.body.click(); // Close popover
                await new Promise(r => setTimeout(r, 500));
                return false;
            }
            
        } catch (err) {
            console.error("[selectAddressFromDropdown] Error:", err);
            document.body.click(); // Close popover on error
            await new Promise(r => setTimeout(r, 500));
            return false;
        }
    }
    
    /**
     * Simplified version of processAddressChange - based on original working code
     */
    async function processAddressChangeSimple(row, dropdownActivator, needsWrrapd, targetAddress) {
        try {
            console.log(`[processAddressChangeSimple] Starting address change. NeedsWrrapd: ${needsWrrapd}`);
            
            // Close any existing dropdowns
            const existingPopovers = document.querySelectorAll('.a-popover');
            if (existingPopovers.length > 0) {
                document.body.click();
                await new Promise(r => setTimeout(r, 1000));
            }
            
            // Click the dropdown
            dropdownActivator.click();
            await new Promise(r => setTimeout(r, 1000));
            
            // Wait for popover
            const popover = await waitForElement('.a-popover', 3000);
            if (!popover) {
                console.warn("[processAddressChangeSimple] Popover did not appear.");
                return false;
            }
            
            // Wait for address options
            let dropdownOptions = await waitForElement('.a-popover ul.a-list-link li a', 3000, true);
            
            if (!dropdownOptions || dropdownOptions.length === 0) {
                console.warn("[processAddressChangeSimple] No address options found.");
                document.body.click();
                return false;
            }
            
            // Find the target address
            let targetOption = null;
            const searchText = needsWrrapd ? 
                (targetAddress.name + ' ' + targetAddress.street) : 
                (targetAddress.name + ' ' + targetAddress.city);
            
            for (const option of dropdownOptions) {
                const optionText = option.textContent.trim();
                if (needsWrrapd) {
                    if (optionText.includes("Wrrapd.com") && optionText.includes("PO BOX 26067")) {
                        targetOption = option;
                        break;
                    }
                } else {
                    // Match default address by name, city, or zip
                    if ((targetAddress.name && optionText.includes(targetAddress.name)) ||
                        (targetAddress.city && optionText.includes(targetAddress.city)) ||
                        (targetAddress.postalCode && optionText.includes(targetAddress.postalCode))) {
                        targetOption = option;
                        break;
                    }
                }
            }
            
            if (targetOption) {
                console.log(`[processAddressChangeSimple] Found target address. Clicking...`);
                targetOption.click();
                await new Promise(r => setTimeout(r, 2000));
                return true;
            } else {
                console.warn(`[processAddressChangeSimple] Target address not found in dropdown.`);
                document.body.click();
                return false;
            }
        } catch (err) {
            console.error("[processAddressChangeSimple] Error:", err);
            document.body.click();
            return false;
        }
    }
    
    /**
     * Selects the appropriate address in a custom Amazon .a-dropdown-prompt dropdown
     */
    async function selectAddressInCustomDropdown(dropdownElement, needsWrrapd, defaultAddress, wrrapdAddress) {
        try {
            if (!dropdownElement) {
                console.error("[selectAddressInCustomDropdown] Invalid dropdown element provided.");
                return false;
            }
            
            console.log(`[selectAddressInCustomDropdown] Processing custom dropdown. Looking for: ${needsWrrapd ? 'Wrrapd address' : 'Default address'}`);
            
            // Close any open dropdowns first
            const existingPopovers = document.querySelectorAll('.a-popover');
            if (existingPopovers.length > 0) {
                document.body.click();
                await new Promise(r => setTimeout(r, 1000));
            }
            
            // Click the dropdown to open it
            console.log(`[selectAddressInCustomDropdown] Clicking dropdown to open...`);
            dropdownElement.click();
            await new Promise(r => setTimeout(r, 1500));
            
            // Wait for popover to appear
            const popover = await waitForElement('.a-popover', 3000);
            if (!popover) {
                console.warn("[selectAddressInCustomDropdown] Popover did not appear after clicking dropdown.");
                return false;
            }
            
            // Wait for address options to load - they're typically in ul.a-list-link li a
            let dropdownOptions = await waitForElement('.a-popover ul.a-list-link li a', 3000, true);
            
            // If no options, try clicking "Show more addresses"
            if ((!dropdownOptions || dropdownOptions.length === 0) && popover) {
                // Try finding by aria-label first
                let showMoreLink = popover.querySelector('[aria-label*="Show more" i], [aria-label*="See more" i]');
                
                // If not found, try finding by text
                if (!showMoreLink) {
                    const links = popover.querySelectorAll('a, button');
                    for (const link of links) {
                        const text = link.textContent?.trim().toLowerCase() || '';
                        if (text.includes('show more') || text.includes('see more')) {
                            showMoreLink = link;
                            break;
                        }
                    }
                }
                
                if (showMoreLink) {
                    console.log("[selectAddressInCustomDropdown] Clicking 'Show more addresses' to expand list.");
                    showMoreLink.click();
                    await new Promise(r => setTimeout(r, 2000));
                    dropdownOptions = await waitForElement('.a-popover ul.a-list-link li a', 3000, true);
                }
            }
            
            if (!dropdownOptions || dropdownOptions.length === 0) {
                console.warn("[selectAddressInCustomDropdown] No address options found in dropdown.");
                // Close dropdown
                document.body.click();
                await new Promise(r => setTimeout(r, 1000));
                return false;
            }
            
            console.log(`[selectAddressInCustomDropdown] Found ${dropdownOptions.length} address options`);
            
            // Log all available options
            dropdownOptions.forEach((opt, idx) => {
                const text = opt.textContent?.trim() || '';
                console.log(`[selectAddressInCustomDropdown] Option ${idx}: "${text.substring(0, 100)}"`);
            });
            
            // Find the appropriate address option
            let targetOption = null;
            
            if (needsWrrapd) {
                // Look for Wrrapd address with improved matching
                console.log(`[selectAddressInCustomDropdown] Searching for Wrrapd address (PO BOX 26067, JACKSONVILLE)...`);
                
                // Log all available options for debugging
                console.log(`[selectAddressInCustomDropdown] Available options (${dropdownOptions.length}):`);
                dropdownOptions.forEach((opt, idx) => {
                    console.log(`  [${idx}] "${opt.textContent.trim().substring(0, 100)}"`);
                });
                
                for (const option of dropdownOptions) {
                    const optionText = option.textContent.trim().toUpperCase();
                    const optionTextLower = option.textContent.trim().toLowerCase();
                    
                    // Improved matching logic (same as selectAddressFromDropdown)
                    const hasPOBox = optionText.includes("PO BOX 26067") || 
                                   optionText.includes("P.O. BOX 26067") ||
                                   optionText.includes("POBOX 26067") ||
                                   optionText.includes("26067");
                    const hasJacksonville = optionText.includes("JACKSONVILLE");
                    const hasWrrapdName = optionTextLower.includes("wrrapd") || 
                                        optionTextLower.includes("wrrapd.com");
                    const hasCorrectZip = optionText.includes("32218") || 
                                        optionText.includes("32226") ||
                                        optionText.includes("32218-") ||
                                        optionText.includes("32226-");
                    const hasFLJacksonville = optionText.includes("FL") && hasJacksonville;
                    
                    const isMatch = (hasPOBox && hasJacksonville) ||
                                  (hasPOBox && hasCorrectZip) ||
                                  (hasWrrapdName && hasJacksonville) ||
                                  (hasWrrapdName && hasPOBox) ||
                                  (hasPOBox && hasFLJacksonville);
                    
                    if (isMatch) {
                        targetOption = option;
                        console.log(`[selectAddressInCustomDropdown] ✓ FOUND Wrrapd address: "${option.textContent.trim().substring(0, 100)}"`);
                        break;
                    }
                }
                
                // If not found, check for "Ship to a new address" to create it
                if (!targetOption) {
                    for (const option of dropdownOptions) {
                        const optionText = option.textContent.trim();
                        if (optionText.includes("Ship to a new address") || optionText.includes("Add new address") || optionText.includes("Create")) {
                            console.log("[selectAddressInCustomDropdown] Wrrapd address not found. Found 'new address' option - may need to create address.");
                            // We could select this to trigger address creation, but for now return false
                            document.body.click();
                            await new Promise(r => setTimeout(r, 1000));
                            return false;
                        }
                    }
                }
            } else {
                // Look for default/original address
                if (defaultAddress) {
                    console.log(`[selectAddressInCustomDropdown] Searching for default address:`, defaultAddress);
                    const defaultName = (defaultAddress.name || '').trim();
                    const defaultCity = (defaultAddress.city || '').trim();
                    const defaultState = (defaultAddress.state || '').trim();
                    const defaultZip = (defaultAddress.postalCode || '').trim();
                    const defaultStreet = (defaultAddress.street || '').trim();
                    
                    console.log(`[selectAddressInCustomDropdown] Matching criteria - Name: "${defaultName}", City: "${defaultCity}", State: "${defaultState}", Zip: "${defaultZip}", Street: "${defaultStreet}"`);
                    
                    for (const option of dropdownOptions) {
                        const optionText = option.textContent.trim();
                        // Try to match by various address components
                        const matchesName = defaultName && optionText.includes(defaultName);
                        const matchesCity = defaultCity && optionText.includes(defaultCity);
                        const matchesState = defaultState && optionText.includes(defaultState);
                        const matchesZip = defaultZip && optionText.includes(defaultZip);
                        const matchesStreet = defaultStreet && optionText.includes(defaultStreet);
                        
                        // Match if we find name, or (city AND state), or zip, or street
                        if (matchesName || (matchesCity && matchesState) || matchesZip || matchesStreet) {
                            targetOption = option;
                            console.log(`[selectAddressInCustomDropdown] Found default address option: "${optionText.substring(0, 80)}"`);
                            break;
                        }
                    }
                }
            }
            
            if (targetOption) {
                console.log(`[selectAddressInCustomDropdown] Clicking address option: ${targetOption.textContent.trim().substring(0, 50)}...`);
                targetOption.click();
                await new Promise(r => setTimeout(r, 2000));
                
                // Verify the selection was applied by checking the dropdown text
                const newText = dropdownElement.textContent?.trim() || '';
                console.log(`[selectAddressInCustomDropdown] Dropdown now shows: "${newText.substring(0, 80)}"`);
                return true;
            } else {
                console.warn(`[selectAddressInCustomDropdown] Could not find ${needsWrrapd ? 'Wrrapd' : 'default'} address in dropdown.`);
                // Close dropdown
                document.body.click();
                await new Promise(r => setTimeout(r, 1000));
                return false;
            }
            
        } catch (err) {
            console.error("[selectAddressInCustomDropdown] Error:", err);
            // Close dropdown on error
            document.body.click();
            await new Promise(r => setTimeout(r, 1000));
            return false;
        }
    }
    
    /**
     * Selects the appropriate address in a native HTML <select> element
     */
    async function selectAddressInNativeSelect(selectElement, needsWrrapd, defaultAddress, wrrapdAddress) {
        try {
            if (!selectElement || selectElement.tagName !== 'SELECT') {
                console.error("[selectAddressInNativeSelect] Invalid select element provided.");
                return false;
            }
            
            const options = Array.from(selectElement.options);
            if (options.length === 0) {
                console.warn("[selectAddressInNativeSelect] No options found in select element.");
                return false;
            }
            
            console.log(`[selectAddressInNativeSelect] Processing ${options.length} options in select element.`);
            console.log(`[selectAddressInNativeSelect] Current selected value: "${selectElement.value}"`);
            console.log(`[selectAddressInNativeSelect] Looking for: ${needsWrrapd ? 'Wrrapd address' : 'Default address'}`);
            
            // Log all available options for debugging
            console.log(`[selectAddressInNativeSelect] Available options:`);
            options.forEach((opt, idx) => {
                console.log(`  [${idx}] value="${opt.value}", text="${opt.text.trim().substring(0, 100)}"`);
            });
            
            // Find the appropriate option
            let targetOption = null;
            let targetValue = null;
            
            if (needsWrrapd) {
                console.log(`[selectAddressInNativeSelect] Searching for Wrrapd address (PO BOX 26067, JACKSONVILLE)...`);
                
                // Log all available options for debugging
                console.log(`[selectAddressInNativeSelect] Available options (${options.length}):`);
                options.forEach((opt, idx) => {
                    console.log(`  [${idx}] "${opt.text.trim().substring(0, 100)}"`);
                });
                
                // Look for Wrrapd address in options with improved matching
                for (const option of options) {
                    const optionText = option.text.trim().toUpperCase();
                    const optionTextLower = option.text.trim().toLowerCase();
                    const optionValue = option.value;
                    
                    // Improved matching logic (same as other functions)
                    const hasPOBox = optionText.includes("PO BOX 26067") || 
                                   optionText.includes("P.O. BOX 26067") ||
                                   optionText.includes("POBOX 26067") ||
                                   optionText.includes("26067");
                    const hasJacksonville = optionText.includes("JACKSONVILLE");
                    const hasWrrapdName = optionTextLower.includes("wrrapd") || 
                                        optionTextLower.includes("wrrapd.com");
                    const hasCorrectZip = optionText.includes("32218") || 
                                        optionText.includes("32226") ||
                                        optionText.includes("32218-") ||
                                        optionText.includes("32226-");
                    const hasFLJacksonville = optionText.includes("FL") && hasJacksonville;
                    
                    const isMatch = (hasPOBox && hasJacksonville) ||
                                  (hasPOBox && hasCorrectZip) ||
                                  (hasWrrapdName && hasJacksonville) ||
                                  (hasWrrapdName && hasPOBox) ||
                                  (hasPOBox && hasFLJacksonville);
                    
                    if (isMatch) {
                        targetOption = option;
                        targetValue = optionValue;
                        console.log(`[selectAddressInNativeSelect] ✓ FOUND Wrrapd address: "${option.text.trim().substring(0, 100)}"`);
                        break;
                    }
                }
                
                // If not found, check for "Ship to a new address" or similar
                if (!targetOption) {
                    for (const option of options) {
                        const optionText = option.text.trim().toLowerCase();
                        if (optionText.includes("new address") || optionText.includes("add address") || optionText.includes("create")) {
                            console.log("[selectAddressInNativeSelect] Wrrapd address not found. Found 'new address' option - may need to create address.");
                            // We could select this to trigger address creation, but for now return false
                            return false;
                        }
                    }
                }
            } else {
                // Look for default/original address
                if (defaultAddress) {
                    console.log(`[selectAddressInNativeSelect] Searching for default address:`, defaultAddress);
                    const defaultName = (defaultAddress.name || '').trim();
                    const defaultCity = (defaultAddress.city || '').trim();
                    const defaultState = (defaultAddress.state || '').trim();
                    const defaultZip = (defaultAddress.postalCode || '').trim();
                    const defaultStreet = (defaultAddress.street || '').trim();
                    
                    console.log(`[selectAddressInNativeSelect] Matching criteria - Name: "${defaultName}", City: "${defaultCity}", State: "${defaultState}", Zip: "${defaultZip}", Street: "${defaultStreet}"`);
                    
                    for (const option of options) {
                        const optionText = option.text.trim();
                        const optionValue = option.value;
                        
                        // Try to match by various address components
                        const matchesName = defaultName && optionText.includes(defaultName);
                        const matchesCity = defaultCity && optionText.includes(defaultCity);
                        const matchesState = defaultState && optionText.includes(defaultState);
                        const matchesZip = defaultZip && optionText.includes(defaultZip);
                        const matchesStreet = defaultStreet && optionText.includes(defaultStreet);
                        
                        // Match if we find name, or (city AND state), or zip, or street
                        if (matchesName || (matchesCity && matchesState) || matchesZip || matchesStreet) {
                            targetOption = option;
                            targetValue = optionValue;
                            console.log(`[selectAddressInNativeSelect] Found default address option: "${optionText.substring(0, 80)}"`);
                            break;
                        }
                    }
                }
            }
            
            if (targetOption && targetValue !== null) {
                // Set the value of the select element
                console.log(`[selectAddressInNativeSelect] Setting select value to: "${targetValue}"`);
                selectElement.value = targetValue;
                
                // Trigger change event to ensure Amazon's JavaScript picks up the change
                const changeEvent = new Event('change', { bubbles: true });
                selectElement.dispatchEvent(changeEvent);
                
                // Also trigger input event
                const inputEvent = new Event('input', { bubbles: true });
                selectElement.dispatchEvent(inputEvent);
                
                await new Promise(r => setTimeout(r, 1000));
                
                // Verify the selection was applied
                if (selectElement.value === targetValue) {
                    console.log("[selectAddressInNativeSelect] Successfully selected address.");
                    return true;
                } else {
                    console.warn("[selectAddressInNativeSelect] Selection may not have been applied correctly.");
                    return false;
                }
            } else {
                console.warn(`[selectAddressInNativeSelect] Could not find ${needsWrrapd ? 'Wrrapd' : 'default'} address in select options.`);
                console.log("[selectAddressInNativeSelect] Available options:", options.map(opt => opt.text.trim().substring(0, 50)));
                return false;
            }
            
        } catch (err) {
            console.error("[selectAddressInNativeSelect] Error:", err);
            return false;
        }
    }
    
    /**
     * Opens a dropdown and selects the appropriate address (legacy function - kept for compatibility)
     */
    async function selectAddressInDropdown(dropdownElement, needsWrrapd, defaultAddress, wrrapdAddress) {
        try {
            // Close any open dropdowns first
            const existingPopovers = document.querySelectorAll('.a-popover');
            if (existingPopovers.length > 0) {
                document.body.click();
                await new Promise(r => setTimeout(r, 1000));
            }
            
            // Click the dropdown to open it
            dropdownElement.click();
            await new Promise(r => setTimeout(r, 1500));
            
            // Wait for popover to appear
            const popover = await waitForElement('.a-popover', 3000);
            if (!popover) {
                console.warn("[selectAddressInDropdown] Popover did not appear after clicking dropdown.");
                return false;
            }
            
            // Wait for address options to load
            let dropdownOptions = await waitForElement('.a-popover ul.a-list-link li a', 3000, true);
            
            // If no options, try clicking "Show more addresses"
            if ((!dropdownOptions || dropdownOptions.length === 0) && popover) {
                // Try finding by aria-label first
                let showMoreLink = popover.querySelector('[aria-label*="Show more" i], [aria-label*="See more" i]');
                
                // If not found, try finding by text
                if (!showMoreLink) {
                    const links = popover.querySelectorAll('a, button');
                    for (const link of links) {
                        const text = link.textContent?.trim().toLowerCase() || '';
                        if (text.includes('show more') || text.includes('see more')) {
                            showMoreLink = link;
                            break;
                        }
                    }
                }
                
                if (showMoreLink) {
                    console.log("[selectAddressInDropdown] Clicking 'Show more addresses' to expand list.");
                    showMoreLink.click();
                    await new Promise(r => setTimeout(r, 2000));
                    dropdownOptions = await waitForElement('.a-popover ul.a-list-link li a', 3000, true);
                }
            }
            
            if (!dropdownOptions || dropdownOptions.length === 0) {
                console.warn("[selectAddressInDropdown] No address options found in dropdown.");
                return false;
            }
            
            // Find the appropriate address option
            let targetOption = null;
            const targetAddress = needsWrrapd ? wrrapdAddress : defaultAddress;
            
            if (needsWrrapd) {
                // Look for Wrrapd address
                for (const option of dropdownOptions) {
                    const optionText = option.textContent.trim();
                    if ((optionText.includes("Wrrapd.com") || optionText.includes("Wrrapd")) && 
                        (optionText.includes("PO BOX 26067") || optionText.includes("26067"))) {
                        targetOption = option;
                        console.log("[selectAddressInDropdown] Found Wrrapd address option.");
                        break;
                    }
                }
                
                // If not found, check for "Ship to a new address" to create it
                if (!targetOption) {
                    for (const option of dropdownOptions) {
                        const optionText = option.textContent.trim();
                        if (optionText.includes("Ship to a new address") || optionText.includes("Add new address")) {
                            console.log("[selectAddressInDropdown] Wrrapd address not found. Need to create new address.");
                            option.click();
                            // Note: Creating new address will be handled separately
                            return false;
                        }
                    }
                }
            } else {
                // Look for default/original address
                if (defaultAddress) {
                    const defaultName = defaultAddress.name || '';
                    const defaultCity = defaultAddress.city || '';
                    const defaultState = defaultAddress.state || '';
                    const defaultZip = defaultAddress.postalCode || '';
                    
                    for (const option of dropdownOptions) {
                        const optionText = option.textContent.trim();
                        // Try to match by name, city, state, or zip
                        const matchesName = defaultName && optionText.includes(defaultName);
                        const matchesCity = defaultCity && optionText.includes(defaultCity);
                        const matchesState = defaultState && optionText.includes(defaultState);
                        const matchesZip = defaultZip && optionText.includes(defaultZip);
                        
                        if (matchesName || (matchesCity && matchesState) || matchesZip) {
                            targetOption = option;
                            console.log("[selectAddressInDropdown] Found default address option.");
                            break;
                        }
                    }
                }
            }
            
            if (targetOption) {
                console.log(`[selectAddressInDropdown] Clicking address option: ${targetOption.textContent.trim().substring(0, 50)}...`);
                targetOption.click();
                await new Promise(r => setTimeout(r, 2000));
                return true;
            } else {
                console.warn(`[selectAddressInDropdown] Could not find ${needsWrrapd ? 'Wrrapd' : 'default'} address in dropdown.`);
                // Close dropdown
                document.body.click();
                await new Promise(r => setTimeout(r, 1000));
                return false;
            }
            
        } catch (err) {
            console.error("[selectAddressInDropdown] Error:", err);
            // Close dropdown on error
            document.body.click();
            await new Promise(r => setTimeout(r, 1000));
            return false;
        }
    }
  
    async function scrapeShippingAddressOnMulti(allItems) {
        console.log("[scrapeShippingAddressOnMulti] Scraping shipping addresses on the multi-address selection page.");
    
        // 1) Wait for the main product rows in the multi-address UI
        const rows = await waitForElement('.a-row.a-spacing-base.item-row', 6000, true);
        if (!rows || rows.length === 0) {
            console.warn("[scrapeShippingAddressOnMulti] No item rows found.");
            return;
        }
    
        // 2) Fetch Amazon's address page so we can parse "full" addresses
        const addressesPageURL = 'https://www.amazon.com/gp/buy/addressselect/handlers/display.html';
        const response = await fetch(addressesPageURL);
        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
    
        // For matching partial -> full address
        const addressElements = doc.querySelectorAll('.a-label > .break-word');
        const fullAddresses = Array.from(addressElements).map(el => el.innerText.trim());
        console.log("[scrapeShippingAddressOnMulti] Full addresses extracted:", fullAddresses);
    
        // Regex for parsing street, city, state, postal code, country
        const detailedAddressRegex = /^(.*?),\s*(.*?),\s*([A-Z]{2}),\s*(\d{5})(?:-\d{4})?,\s*(.*)$/;
    
        // 3) Iterate over each "row" (product)
        for (const row of rows) {
            // Get the truncated product title
            const titleElement = row.querySelector('p.a-spacing-micro.a-size-base.a-text-bold');
            if (!titleElement) {
                console.warn("[scrapeShippingAddressOnMulti] No title element found in this row.");
                continue;
            }
            const titleFull = titleElement.innerText.trim();
    
            const productObj = resolveProductByRowTitle(allItems, titleFull, 0, row);
            if (!productObj) {
                console.warn(`[scrapeShippingAddressOnMulti] Product "${titleFull.substring(0, 80)}" not found in allItems.`);
                continue;
            }
            if (!productObj.options) {
                productObj.options = [];
            }
    
            // 4) Within this single row, Amazon may show multiple address/quantity pairs
            //    For example, if user is shipping 1 unit to Alice, 1 unit to Bob, etc.
            //    We find all addresses and all quantities in the row:
            const addressElementsInRow = row.querySelectorAll('.lineitem-address .a-dropdown-prompt');
            const quantityElementsInRow = row.querySelectorAll('.quantity-dropdown .a-dropdown-prompt');
    
            if (addressElementsInRow.length === 0) {
                console.warn(`[scrapeShippingAddressOnMulti] No addresses found for "${title}".`);
                continue;
            }
            if (quantityElementsInRow.length === 0) {
                console.warn(`[scrapeShippingAddressOnMulti] No quantities found for "${title}". Defaulting them all to 1.`);
            }
    
            // 5) Build a list of { address, quantity } pairs 
            //    Often, Amazon's multi-address flow lines them up so addressElementsInRow[i] 
            //    corresponds to quantityElementsInRow[i]. But check your actual DOM to confirm.
            //    If there's a mismatch in length, we'll handle the minimum.
            const pairs = [];
            const loopCount = Math.min(addressElementsInRow.length, quantityElementsInRow.length) || addressElementsInRow.length;
    
            for (let i = 0; i < loopCount; i++) {
                // partial address from Amazon's UI
                const addressEl = addressElementsInRow[i];
                const partialAddress = addressEl.innerText.trim();
    
                // quantity from the row
                let qty = 1;
                if (quantityElementsInRow[i]) {
                    const qtyText = quantityElementsInRow[i].innerText.trim();
                    qty = parseInt(qtyText, 10) || 1;
                }
    
                pairs.push({ partialAddress, qty });
            }
    
            // 6) Summation of quantities user wants in this row
            const totalQtyInThisRow = pairs.reduce((sum, p) => sum + p.qty, 0);
    
            // 7) Compare to productObj.options.length to handle changed quantity
            if (productObj.options.length < totalQtyInThisRow) {
                // Need more sub-items
                const needed = totalQtyInThisRow - productObj.options.length;
                for (let i = 0; i < needed; i++) {
                    productObj.options.push({
                        checkbox_wrrapd: false,
                        checkbox_flowers: false,
                        checkbox_amazon_combine: false,
                        selected_wrapping_option: 'wrrapd',  // Default wrapping option
                        selected_flower_design: null,  // Add this line
                        shippingAddress: {}
                    });
                }
                console.log(`[scrapeShippingAddressOnMulti] Added ${needed} sub-items for "${title}" to match totalQty=${totalQtyInThisRow}.`);
            } else if (productObj.options.length > totalQtyInThisRow) {
                // Remove extra sub-items
                const toRemove = productObj.options.length - totalQtyInThisRow;
                productObj.options.splice(totalQtyInThisRow, toRemove);
                console.log(`[scrapeShippingAddressOnMulti] Removed ${toRemove} sub-items for "${title}" to match totalQty=${totalQtyInThisRow}.`);
            }
    
            // 8) Now we have exactly totalQtyInThisRow sub-items in productObj.options
            //    We assign addresses in order across sub-items
            let subIndex = 0;
    
            for (const pair of pairs) {
                const { partialAddress, qty } = pair;
    
                // remove recipient name from partial address for matching
                const partialAddressWithoutName = partialAddress.replace(/^([^,]+),\s*/, '');
                // find a matching full address
                const matchingFullAddress = fullAddresses.find(fullAddr =>
                    fullAddr.includes(partialAddressWithoutName)
                );
    
                // parse the name from partial
                const recipientName = partialAddress.split(',')[0];
    
                for (let x = 0; x < qty; x++) {
                    if (subIndex >= productObj.options.length) {
                        console.warn(`[scrapeShippingAddressOnMulti] subIndex=${subIndex} out of range for "${title}". Breaking.`);
                        break;
                    }
                    const subItem = productObj.options[subIndex];
    
                    if (!matchingFullAddress) {
                        console.warn(`[scrapeShippingAddressOnMulti] No matching full address for partial "${partialAddress}". Not storing shipping info for subItem #${subIndex}.`);
                        subIndex++;
                        continue;
                    }
    
                    // parse the full address
                    const match = matchingFullAddress.match(detailedAddressRegex);
                    if (!match) {
                        console.error(`[scrapeShippingAddressOnMulti] Could not parse the full address for partial "${partialAddress}".`);
                        subIndex++;
                        continue;
                    }
    
                    const [_, street, city, state, postalCode, country] = match;
                    subItem.shippingAddress = {
                        name: recipientName,
                        street,
                        city,
                        state,
                        postalCode,
                        country
                    };
                    console.log(`[scrapeShippingAddressOnMulti] Assigned address for subItem #${subIndex} of "${title}":`, subItem.shippingAddress);
    
                    subIndex++;
                }
            }
    
            // 9) Save productObj with updated shipping addresses
            saveItemToLocalStorage(productObj);
            console.log(`[scrapeShippingAddressOnMulti] Completed addresses for "${title}".`);
        }
    }
    
    // ----------------------------------------------------- CHANGE ADDRESS -----------------------------------------------------

    function wrrapdManualAddressTapsRequired() {
        return localStorage.getItem(WRRAPD_MANUAL_ADDRESS_TAPS_KEY) === '1';
    }

    /** During manual Amazon confirmation, never trap the user behind the dark overlay. */
    function wrrapdShowAddressAutomationLoadingOrClear() {
        if (wrrapdManualAddressTapsRequired()) {
            removeLoadingScreen();
        } else {
            showLoadingScreen();
        }
    }

    function wrrapdClearManualAddressTapsRequirement() {
        localStorage.removeItem(WRRAPD_MANUAL_ADDRESS_TAPS_KEY);
    }

    function wrrapdRemoveManualAddressHints() {
        document.querySelectorAll('.wrrapd-manual-address-hint').forEach((el) => el.remove());
        document.querySelectorAll('.wrrapd-amazon-primary-focus').forEach((el) => {
            el.classList.remove('wrrapd-amazon-primary-focus');
        });
    }

    const WRRAPD_DELIVER_COACH_STYLE_ID = 'wrrapd-deliver-coach-styles';

    function wrrapdInjectDeliverCoachStylesOnce() {
        if (document.getElementById(WRRAPD_DELIVER_COACH_STYLE_ID)) return;
        const st = document.createElement('style');
        st.id = WRRAPD_DELIVER_COACH_STYLE_ID;
        st.textContent = `
            .wrrapd-amazon-primary-focus.a-button,
            .wrrapd-amazon-primary-focus.a-button-primary {
                outline: 3px solid #f59e0b !important;
                outline-offset: 3px !important;
                box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.5), 0 10px 28px rgba(245, 158, 11, 0.22) !important;
                border-radius: 8px !important;
            }
            .wrrapd-manual-address-hint {
                max-width: 100%;
            }
        `;
        document.head.appendChild(st);
    }

    /**
     * After Wrrapd T&C, the customer must personally tap Amazon's address confirmation
     * (Use this address / Use these addresses, etc.) — we do not simulate those clicks.
     *
     * Never insert the hint *inside* .a-button-inner (before the real input): that breaks Amazon’s
     * flex layout and squishes the yellow button into a vertical strip. Mount after the full .a-button.
     */
    function wrrapdShowManualAddressHint(anchorElement, variant) {
        if (!anchorElement || !anchorElement.isConnected) return;
        const amazonBtn =
            anchorElement.closest('.a-button-primary, .a-button') ||
            anchorElement.closest('[data-feature-id="order-summary-primary-action"] .a-button') ||
            anchorElement.closest('#orderSummaryPrimaryActionBtn .a-button');
        const mountHost = amazonBtn || anchorElement;

        wrrapdRemoveManualAddressHints();
        wrrapdInjectDeliverCoachStylesOnce();

        const hint = document.createElement('div');
        hint.className = 'wrrapd-manual-address-hint';
        hint.setAttribute('role', 'status');
        let msg =
            'Please click the button below yourself to confirm this address on Amazon. If prompted, add or accept the Wrrapd hub address so Amazon can ship your items to us for gift wrapping.';
        if (variant === 'save') {
            msg =
                'Please click "Use this address" (or Save) yourself on Amazon so your choice to send items to the Wrrapd hub is explicit.';
        } else if (variant === 'multi') {
            msg =
                'Please click "Use these addresses" yourself to confirm shipping for each item on Amazon\'s checkout.';
        } else if (variant === 'deliver') {
            msg =
                'Tap the full-width yellow Amazon button labeled “Deliver to this address” or “Use this address” (not the thin strip in the sidebar if it looks broken — use the main button in the address list). Amazon requires you to confirm this tap yourself.';
        }
        const wrapStyle =
            'box-sizing:border-box;margin:14px 0;padding:14px 16px;background:#fffbeb;border:2px solid #d97706;border-radius:10px;color:#0f172a;font-size:14px;line-height:1.5;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;clear:both;width:100%;max-width:min(720px,100%);';
        hint.style.cssText = wrapStyle;

        if (variant === 'deliver') {
            const title = document.createElement('div');
            title.style.cssText =
                'font-weight:800;font-size:16px;margin-bottom:8px;color:#92400e;letter-spacing:0.01em;';
            title.textContent = 'Confirm on Amazon';
            hint.appendChild(title);
            const sub = document.createElement('div');
            sub.style.cssText = 'font-weight:600;font-size:13px;margin-bottom:6px;color:#b45309;';
            sub.textContent = 'Use the yellow button right below this box — it should look wide, not pencil-thin.';
            hint.appendChild(sub);
        }
        const body = document.createElement('div');
        body.textContent = msg;
        hint.appendChild(body);

        if (amazonBtn) {
            amazonBtn.classList.add('wrrapd-amazon-primary-focus');
            amazonBtn.insertAdjacentElement('afterend', hint);
        } else {
            mountHost.insertAdjacentElement('afterend', hint);
        }

        if (variant === 'deliver' && hasAnyWrrapdGiftWrapInCart(getAllItemsFromLocalStorage())) {
            setTimeout(() => {
                try {
                    wrrapdMaybeShowSingleAddressGiftWrapMismatch(getAllItemsFromLocalStorage());
                } catch (_) {
                    /* ignore */
                }
            }, 2800);
        }
    }

    const WRRAPD_COACH_STYLE_ID = 'wrrapd-amazon-confirm-coach-style';
    const WRRAPD_SHIP_ONE_COACH_ID = 'wrrapd-ship-one-address-coach-root';

    function wrrapdRemoveMultiAddressCoachmark() {
        document.querySelectorAll('.wrrapd-amazon-confirm-coach').forEach((el) => el.remove());
    }

    function wrrapdIsInCheckoutOrderSummaryRail(el) {
        if (!el || !el.closest) return false;
        return !!el.closest(
            '#checkout-experience-right-column, #checkout-right-column, #right-grid, #spc-order-summary, #orderSummaryPrimaryActionBtn, [data-feature-id="order-summary-primary-action"], [data-feature-id*="order-summary"], [id*="order-summary-primary"], .checkout-right-column, aside[aria-label*="order summary" i]',
        );
    }

    /** "Ship items to one address" link/label on Amazon item-update (Chewbacca) page — not the sidebar. */
    function wrrapdFindShipItemsToOneAddressMarker() {
        const candidates = document.querySelectorAll('a, span, div, p, li, button, h1, h2, h3');
        for (const el of candidates) {
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (t.length > 220) continue;
            if (/ship\s+items\s+to\s+one\s+address/i.test(t)) return el;
            if (/ship\s+.*\s+to\s+one\s+address/i.test(t)) return el;
            if (/deliver\s+.*\s+one\s+address/i.test(t)) return el;
        }
        return null;
    }

    /**
     * Yellow Continue under "Ship items to one address" (main column). Sidebar Continue is excluded.
     */
    function wrrapdFindShipItemsToOneAddressContinueControl() {
        const marker = wrrapdFindShipItemsToOneAddressMarker();
        if (!marker) return null;

        const mr = marker.getBoundingClientRect();
        const markerMidX = mr.left + mr.width / 2;

        const scopedRoots = [];
        let n = marker;
        for (let d = 0; d < 12 && n; d++) {
            if (n.id === 'checkout-main' || (n.getAttribute && n.getAttribute('data-checkout-page'))) {
                scopedRoots.push(n);
                break;
            }
            const cn = (n.className || '').toString().toLowerCase();
            if (cn.includes('checkout') && (cn.includes('column') || cn.includes('left') || cn.includes('main'))) {
                scopedRoots.push(n);
            }
            n = n.parentElement;
        }
        const searchRoots = scopedRoots.length ? scopedRoots : [document.body];

        const seen = new Set();
        const controls = [];
        const collect = (root) => {
            root.querySelectorAll('input.a-button-input, input[type="submit"], button').forEach((inp) => {
                if (seen.has(inp)) return;
                seen.add(inp);
                controls.push(inp);
            });
        };
        for (const root of searchRoots) {
            collect(root);
        }
        if (!controls.length) {
            collect(document.body);
        }

        const scored = [];
        for (const inp of controls) {
            if (!inp.offsetParent || inp.disabled) continue;
            if (wrrapdIsInCheckoutOrderSummaryRail(inp)) continue;
            const annId = inp.getAttribute('aria-labelledby');
            let announceText = '';
            if (annId) {
                const parts = annId.split(/\s+/).filter(Boolean);
                for (const id of parts) {
                    const node = document.getElementById(id);
                    if (node) {
                        announceText += ` ${node.textContent || ''}`;
                    }
                }
            }
            const raw = `${announceText} ${inp.value || ''} ${inp.getAttribute('aria-label') || ''} ${inp.textContent || ''}`
                .trim()
                .toLowerCase();
            if (!raw.includes('continue')) continue;
            if (raw.includes('place') && raw.includes('order')) continue;
            if (raw.includes('save gift')) continue;
            if (raw.includes('use these')) continue;
            const pos = marker.compareDocumentPosition(inp);
            if (!(pos & Node.DOCUMENT_POSITION_FOLLOWING)) continue;

            const ir = inp.getBoundingClientRect();
            if (!ir.width || !ir.height) continue;

            const rowMidX = ir.left + ir.width / 2;
            const horiz = Math.abs(rowMidX - markerMidX);
            if (horiz > Math.max(380, window.innerWidth * 0.42)) continue;

            const below = ir.top - mr.bottom;
            const score = below >= -12 ? below + horiz * 0.12 : 8000 + Math.abs(below);
            scored.push({ inp, score, below, horiz });
        }

        if (!scored.length) return null;
        scored.sort((a, b) => a.score - b.score);
        return scored[0].inp;
    }

    function wrrapdRemoveShipToOneAddressCoachmark() {
        removeWrrapdShipToOneGuidanceOverlay();
        document.getElementById(WRRAPD_SHIP_ONE_COACH_ID)?.remove();
        document.querySelectorAll('.wrrapd-ship-one-halo-target').forEach((el) => {
            el.classList.remove('wrrapd-ship-one-halo-target');
        });
    }

    /**
     * Full-viewport dimmer + main-column Continue handoff (see loading-ui.js).
     */
    function wrrapdShowShipToOneAddressContinueCoachmark(continueControl) {
        const btn = continueControl || wrrapdFindShipItemsToOneAddressContinueControl();
        if (!btn) return;
        showWrrapdShipToOneGuidanceOverlay(btn, {
            refit: () => wrrapdFindShipItemsToOneAddressContinueControl(),
        });
    }

    /**
     * Multi-address / ship-to: after Wrrapd T&C, customer must tap Amazon's primary action
     * (e.g. "Use these addresses") — show clear copy + flashing arrow; never leave the dark overlay up.
     */
    function wrrapdShowMultiAddressAmazonConfirmUI() {
        wrrapdRemoveMultiAddressCoachmark();
        removeLoadingScreen();

        if (!document.getElementById(WRRAPD_COACH_STYLE_ID)) {
            const st = document.createElement('style');
            st.id = WRRAPD_COACH_STYLE_ID;
            st.textContent =
                '@keyframes wrrapd-coach-pulse{0%,100%{opacity:1;transform:translateY(0);}50%{opacity:0.45;transform:translateY(4px);}}';
            document.head.appendChild(st);
        }

        const primary =
            document.querySelector('#orderSummaryPrimaryActionBtn') ||
            document.querySelector('[data-feature-id="order-summary-primary-action"]');
        const btn =
            primary?.querySelector?.('.a-button-input') ||
            primary?.querySelector?.('input[type="submit"]') ||
            primary?.querySelector?.('button');

        const anchor = primary || btn;
        if (!anchor || !anchor.parentElement) return;

        const wrap = document.createElement('div');
        wrap.className = 'wrrapd-amazon-confirm-coach wrrapd-manual-address-hint';
        wrap.setAttribute('role', 'region');
        wrap.setAttribute('aria-label', 'Confirm shipping on Amazon');
        wrap.style.cssText =
            'box-sizing:border-box;margin:12px 0;padding:14px 16px;background:#fffef7;border:2px solid #c9a009;border-radius:8px;color:#0f172a;font:14px/1.5 Arial,Helvetica,sans-serif;max-width:100%;position:relative;z-index:100001;';
        wrap.innerHTML = `
            <div style="font-weight:700;margin-bottom:8px;">Confirm shipping on Amazon</div>
            <ol style="margin:0 0 10px 20px;padding:0;">
                <li style="margin-bottom:6px;">We’ve added the Wrrapd hub to your address book where needed.</li>
                <li>Click Amazon’s button below so you agree that items may ship to Wrrapd for gift wrapping.</li>
            </ol>
            <div style="text-align:center;font-size:26px;line-height:1;color:#b45309;animation:wrrapd-coach-pulse 1.1s ease-in-out infinite;" aria-hidden="true">▼</div>
        `;
        anchor.parentElement.insertBefore(wrap, anchor);

        try {
            anchor.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (_) {
            /* ignore */
        }
    }

    async function checkChangeAddress() {
        console.log("[checkChangeAddress] Checking if address change is required.");

        const allItems = getAllItemsFromLocalStorage();

        const wrrapdShouldChangeAddress = localStorage.getItem('wrrapd-should-change-address') === 'true';
        const currentUrl = window.location.href;
        
        // Check if we're on a multi-address selection page (flexible URL matching)
        const isMultiAddressPage = currentUrl.includes('itemselect') && 
                                   (currentUrl.includes('multiAddress') || currentUrl.includes('useCase=multiAddress') || currentUrl.includes('multi-address'));
    
        if (isMultiAddressPage) {
            if (!hasAnyWrrapdGiftWrapInCart(allItems)) {
                removeLoadingScreen();
                console.log(
                    '[checkChangeAddress] Multi-address page but no Wrrapd gift-wrap — not running Wrrapd automation.',
                );
                return;
            }

            console.log("[checkChangeAddress] Detected multi-address selection page. URL:", currentUrl);

            // "Ship items to one address" main-column Continue: coachmark if present (DOM may render after paint).
            setTimeout(() => {
                try {
                    if (!hasAnyWrrapdGiftWrapInCart(getAllItemsFromLocalStorage())) return;
                    if (document.getElementById('wrrapd-ship-one-guidance-overlay')) return;
                    const el = wrrapdFindShipItemsToOneAddressContinueControl();
                    if (el) {
                        removeLoadingScreen();
                        wrrapdShowShipToOneAddressContinueCoachmark(el);
                    }
                } catch (_) {
                    /* ignore */
                }
            }, 900);
            
            // CRITICAL: Check if Wrrapd address was just added - if so, Amazon auto-selected it for all items
            // We need to fix non-Wrrapd items by selecting default address for them
            const addressJustAdded = localStorage.getItem('wrrapd-address-just-added') === 'true';
            if (addressJustAdded) {
                console.log("[checkChangeAddress] Wrrapd address was just added - Amazon auto-selected it for all items. Using common function to fix addresses...");
                
                // Clear the flag
                localStorage.removeItem('wrrapd-address-just-added');
                
                wrrapdShowAddressAutomationLoadingOrClear();
                
                // Set flag to indicate we need to change addresses
                localStorage.setItem('wrrapd-should-change-address', 'true');
                
                // Use common function to fix addresses (ensures identifier mapping exists)
                await ensureCorrectAddressesForAllItems(allItems);
                // Note: ensureCorrectAddressesForAllItems will call selectAddressesForItemsSimple if already on multi-address page
                return;
            }
            
            // CRITICAL: Always ensure identifier mapping exists before checking addresses
            // This is needed even if addresses were "already changed" - we need to verify they're actually correct
            const identifierMapStr = localStorage.getItem('wrrapd-item-identifiers');
            if (!identifierMapStr) {
                console.log("[checkChangeAddress] No identifier mapping found - creating it and running address selection...");
                // Identifier mapping doesn't exist - need to create it and run address selection
                localStorage.removeItem('wrrapd-addresses-changed');
                localStorage.removeItem('wrrapd-multi-address-completed');
                localStorage.setItem('wrrapd-should-change-address', 'true');
                wrrapdShowAddressAutomationLoadingOrClear();
                await ensureCorrectAddressesForAllItems(allItems);
                return;
            }
            
            // CRITICAL: Check if addresses have already been changed by our script
            // BUT: Always verify addresses are actually correct (check BOTH directions)
            const addressesChanged = localStorage.getItem('wrrapd-addresses-changed') === 'true';
            const multiAddressCompleted = localStorage.getItem('wrrapd-multi-address-completed') === 'true';
            
            if (addressesChanged || multiAddressCompleted) {
                // CRITICAL: Always verify addresses are correct by running address selection
                // This ensures addresses are correct even if flags are set
                console.log("[checkChangeAddress] Flags indicate addresses changed, but verifying they're actually correct...");
                localStorage.setItem('wrrapd-should-change-address', 'true');
                wrrapdShowAddressAutomationLoadingOrClear();
                await ensureCorrectAddressesForAllItems(allItems);
                return;
            } else {
                // No flags set - addresses haven't been changed yet, so run address selection
                console.log("[checkChangeAddress] Addresses not yet changed - running address selection...");
                localStorage.setItem('wrrapd-should-change-address', 'true');
                wrrapdShowAddressAutomationLoadingOrClear();
                await ensureCorrectAddressesForAllItems(allItems);
                return;
            }
            
            // CRITICAL: Do NOT check if addresses are already correct on the page
            // This check was too aggressive and prevented the script from setting addresses correctly
            // The script needs to run address manipulation on the multi-address page to:
            // 1. Select default address for non-Wrrapd items
            // 2. Select Wrrapd address for Wrrapd items
            // Even if addresses appear correct, we need to verify and set them properly
            
            if (wrrapdShouldChangeAddress) {
                // CRITICAL: Verify Terms have been accepted BEFORE doing address manipulation
                // Address manipulation should ONLY happen AFTER user clicks "here" on Terms modal
                const termsAccepted = wrrapdTermsAcceptedForCurrentGiftChoices(allItems);
                if (!termsAccepted) {
                    console.log("[checkChangeAddress] Flag set but Terms NOT accepted for current gift choices - NOT doing address manipulation.");
                    return; // Don't do anything until Terms are accepted
                }
                
                // Check if we're on the old URL format and need to use the old function
                if (currentUrl.includes('https://www.amazon.com/gp/buy/itemselect/handlers/display.html')) {
                    console.log("[checkChangeAddress] Using old address change flow for wrrapd items.");
                    showLoadingScreen();
                    changeAddressForWrrapdItems(allItems);
                    localStorage.setItem('wrrapd-should-change-address', 'false');
                } else {
                    // New URL format - use the new address selection function
                    console.log("[checkChangeAddress] Using new address selection flow for wrrapd items.");
                    // Loading screen should already be showing (from Terms acceptance), but ensure it's on
                    showLoadingScreen();
                    multiSelectAddress(allItems);
                    localStorage.setItem('wrrapd-should-change-address', 'false');
                }
            } else {
                // No address change flag set - don't do anything
                console.log("[checkChangeAddress] No address change flag set and addresses not changed yet. Waiting for Terms acceptance.");
            }
            return;
        }
        
        // Not on multi-address page yet
        if (wrrapdShouldChangeAddress) {
            if (!hasAnyWrrapdGiftWrapInCart(allItems)) {
                console.log(
                    '[checkChangeAddress] should-change-address set but no Wrrapd gift-wrap — clearing flag, no redirect.',
                );
                localStorage.setItem('wrrapd-should-change-address', 'false');
                return;
            }

            // Check if we need to redirect to multi-address page
            if (currentUrl.includes('amazon.com/gp/buy/payselect/handlers/display.html') || 
                currentUrl.includes('amazon.com/gp/buy/spc/handlers/display.html') ||
                currentUrl.includes('amazon.com/gp/buy/primeinterstitial/handlers/display.html')) {
                // go to change multi address page
                console.log("[checkChangeAddress] Showing loading screen before redirecting to address selection page.");
                wrrapdShowAddressAutomationLoadingOrClear();
                
                // Small delay to ensure loading screen is visible, then navigate
                setTimeout(() => {
                    console.log("[checkChangeAddress] Redirecting to address selection page.");
                    window.location.href = 'https://www.amazon.com/gp/buy/itemselect/handlers/display.html?_from=cheetah&useCase=multiAddress';
                }, 100);
            }
        } else {
            console.log("[checkChangeAddress] No address change needed and not on multi-address page.");
        }
    }

    /**
     * changeAddressForWrrapdItems - Changes shipping address to Wrrapd only for products
     * where ALL sub-items are marked for Wrrapd. For mixed products (some Wrrapd, some not),
     * displays a message asking for manual address selection.
     */
    async function changeAddressForWrrapdItems(allItems) {
        console.log("[changeAddressForWrrapdItems] Start updating Amazon's shipping addresses.");

        if (!hasAnyWrrapdGiftWrapInCart(allItems)) {
            removeLoadingScreen();
            console.log('[changeAddressForWrrapdItems] No Wrrapd gift-wrap — exiting.');
            return;
        }

        // 1) Confirm we are on the multi-address selection page
        if (!window.location.href.includes('https://www.amazon.com/gp/buy/itemselect/handlers/display.html?_from=cheetah&useCase=multiAddress')) {
            console.error("[changeAddressForWrrapdItems] Not on the correct multi-address page. Exiting.");
            removeLoadingScreen();
            return;
        }

        // Wait for page to be fully loaded - Amazon's multi-address page takes time to render
        // Show loading screen immediately to hide the transition
        showLoadingScreen();
        console.log("[changeAddressForWrrapdItems] Waiting for page to be fully ready...");
        await new Promise(r => setTimeout(r, 500)); // Reduced wait time - loading screen hides the transition

        // 2) Build list of products where ALL sub-items are wrrapd
        let productsToChange = [];
        let mixedProducts = [];
        let processedProducts = new Set(); // Track processed products
        
        for (const [title, product] of Object.entries(allItems)) {
            if (!product.options) continue;
            
            const totalSubItems = product.options.length;
            const wrrapdSubItems = product.options.filter(s => s.checkbox_wrrapd).length;
            
            if (wrrapdSubItems === totalSubItems) {
                productsToChange.push(title);
            } else if (wrrapdSubItems > 0) {
                mixedProducts.push(title);
            }
        }

        // 3) Show message for mixed products
        if (mixedProducts.length > 0) {
            const messageContainer = document.createElement('div');
            messageContainer.style.color = '#c40000';
            messageContainer.style.marginTop = '10px';
            messageContainer.style.padding = '10px';
            messageContainer.style.border = '1px solid #c40000';
            messageContainer.style.borderRadius = '4px';
            messageContainer.innerHTML = `Please manually select Wrrapd address for desired items.`;
            
            const targetElement = document.querySelector('.a-box-inner > [data-testid=""]:nth-child(1)');
            if (targetElement) {
                targetElement.parentNode.insertBefore(messageContainer, targetElement.nextSibling);
            }
            
            console.log("[changeAddressForWrrapdItems] Mixed products detected:", mixedProducts);
            removeLoadingScreen();
            return; // Exit early since manual selection is needed
        }

        // 4) Process products where all items are wrrapd
        let itemsRemaining = productsToChange.length;
        console.log("[changeAddressForWrrapdItems] Products to process:", productsToChange);

        let firstItemProcessed = false;
        let justReloaded = false;

        while (itemsRemaining > 0) {
            console.log(`[changeAddressForWrrapdItems] Products remaining: ${itemsRemaining}. Checking DOM rows...`);

            // Try multiple selectors to find item rows
            let rows = await waitForElement('.a-row.a-spacing-base.item-row', 3000, true);
            
            // If not found, try AI to find the rows
            if (!rows || rows.length === 0) {
                console.log("[changeAddressForWrrapdItems] Standard selector didn't work, trying AI...");
                const pageContext = 'This is Amazon\'s multi-address selection page. Find the container/row elements that represent each product item where users can select shipping addresses. Each row should contain a product title and address dropdown.';
                
                const aiSelector = await findElementWithFallback(
                    'Product item row container on Amazon multi-address selection page',
                    [
                        '.a-row.a-spacing-base.item-row',
                        '[data-orderid] .item-row',
                        '.item-row',
                        '[class*="item-row"]',
                        '[class*="item"][class*="row"]',
                        '.a-row[class*="item"]'
                    ],
                    pageContext,
                    []
                );
                
                if (aiSelector) {
                    console.log(`[changeAddressForWrrapdItems] AI suggested selector: ${aiSelector}`);
                    rows = document.querySelectorAll(aiSelector);
                }
            }
            
            // Also try finding by product titles directly - with more comprehensive search
            if (!rows || rows.length === 0) {
                console.log("[changeAddressForWrrapdItems] Trying to find rows by product titles...");
                const allRows = [];
                for (const titleKey of productsToChange) {
                    const searchText = titleKey.substring(0, 25); // Use more characters for matching
                    console.log(`[changeAddressForWrrapdItems] Searching for title: "${searchText}"`);
                    
                    // Try to find element containing this title - search more broadly
                    const allElements = Array.from(document.querySelectorAll('*'));
                    for (const el of allElements) {
                        const text = el.textContent?.trim() || '';
                        if (text.length > 10 && text.includes(searchText)) {
                            // Find the row container - go up the DOM tree
                            let row = el;
                            let attempts = 0;
                            while (row && attempts < 10) {
                                // Check if this looks like a row container
                                const hasAddressDropdown = row.querySelector('[class*="dropdown"], [class*="address"], select');
                                const hasTitle = row.textContent && row.textContent.includes(searchText);
                                
                                if (hasAddressDropdown && hasTitle && row.offsetHeight > 50) {
                                    if (!allRows.includes(row)) {
                                        allRows.push(row);
                                        console.log(`[changeAddressForWrrapdItems] Found row for "${titleKey}"`);
                                    }
                                    break;
                                }
                                row = row.parentElement;
                                attempts++;
                            }
                        }
                    }
                }
                if (allRows.length > 0) {
                    rows = allRows;
                    console.log(`[changeAddressForWrrapdItems] Found ${rows.length} rows by title matching`);
                } else {
                    console.log(`[changeAddressForWrrapdItems] No rows found by title matching. Available text on page:`, 
                        Array.from(document.querySelectorAll('p, h1, h2, h3, h4, span')).slice(0, 10).map(el => el.textContent?.trim().substring(0, 50))
                    );
                }
            }
            
            if (!rows || rows.length === 0) {
                console.warn("[changeAddressForWrrapdItems] No rows found after all attempts. Breaking.");
                console.log("[changeAddressForWrrapdItems] Page HTML sample:", document.body.innerHTML.substring(0, 1000));
                removeLoadingScreen();
                break;
            }
            
            console.log(`[changeAddressForWrrapdItems] Found ${rows.length} rows`);

            let changedSomething = false;

            for (const row of rows) {
                const titleElem = row.querySelector('p.a-spacing-micro.a-size-base.a-text-bold');
                if (!titleElem) continue;
                const rowFullTitle = titleElem.innerText.trim();

                const productObj = resolveProductByRowTitle(allItems, rowFullTitle, 0, row);
                if (!productObj) continue;
                const storageKey =
                    Object.keys(allItems).find((k) => allItems[k] === productObj) || rowFullTitle.substring(0, 200);

                // Skip if already processed
                if (processedProducts.has(storageKey)) {
                    console.log(`[changeAddressForWrrapdItems] Skipping "${storageKey}" - already processed.`);
                    continue;
                }

                if (productsToChange.includes(storageKey)) {
                    console.log(`[changeAddressForWrrapdItems] Setting Wrrapd address for "${storageKey}".`);
                    
                    const success = await processAddressChange(row, storageKey, 0);
                    if (success) {
                        itemsRemaining--;
                        changedSomething = true;
                        processedProducts.add(storageKey); // Mark as processed
                        console.log(`[changeAddressForWrrapdItems] Successfully set address for "${storageKey}".`);

                        // If this is the first item and we had to create a new address,
                        // reload the page to ensure the new address is available for selection
                        if (!firstItemProcessed && !justReloaded) {
                            firstItemProcessed = true;
                            // Check if we had to create a new address by looking for wrrapdLink
                            const addressDropdown = row.querySelector('.lineitem-address .a-dropdown-container');
                            if (addressDropdown) {
                                const dropdownText = addressDropdown.textContent;
                                if (!dropdownText.includes('Wrrapd.com')) {
                                    console.log("[changeAddressForWrrapdItems] First item processed and new address created. Reloading page...");
                                    await new Promise(r => setTimeout(r, 1000)); // Wait for address save (reduced - loading screen hides the transition)
                                    localStorage.setItem('wrrapd-address-created', 'true');
                                    window.location.reload();
                                    return;
                                }
                            }
                        }

                        await new Promise(r => setTimeout(r, 1000));
                        break;
                    } else {
                        console.warn(`[changeAddressForWrrapdItems] Could not set Wrrapd address for "${storageKey}". Will retry after delay...`);
                        await new Promise(r => setTimeout(r, 2000)); // Add delay before retrying
                    }
                }
            }

            if (!changedSomething) {
                console.log("[changeAddressForWrrapdItems] No changes this pass. Breaking out.");
                break;
            }

            await new Promise(r => setTimeout(r, 2000));
        }

        console.log("[changeAddressForWrrapdItems] Finished processing. Removing loading screen.");
        removeLoadingScreen();

        // Only click "Use these addresses" if there were no mixed products
        if (mixedProducts.length === 0) {
            const useTheseAddressesButton = await waitForElement('#orderSummaryPrimaryActionBtn .a-button-input', 3000);
            if (useTheseAddressesButton) {
                if (wrrapdManualAddressTapsRequired()) {
                    console.log(
                        "[changeAddressForWrrapdItems] Manual Amazon confirmation required — not clicking 'Use These Addresses'.",
                    );
                    removeLoadingScreen();
                    wrrapdShowManualAddressHint(useTheseAddressesButton, 'multi');
                } else {
                    console.log("[changeAddressForWrrapdItems] Clicking 'Use These Addresses' button.");
                    useTheseAddressesButton.click();
                }
            }
        }
    }

    /**
     * Activator for THIS row's ship-to dropdown only (never the first match on the page).
     */
    function findAddressDropdownActivatorInRow(row) {
        if (!row || typeof row.querySelector !== 'function') return null;

        const selectors = [
            '.lineitem-address .a-dropdown-container .a-button-input',
            '.lineitem-address .a-dropdown-container input.a-button-input',
            '.lineitem-address .a-dropdown-container .a-button-text',
            '.lineitem-address .a-dropdown-container .a-dropdown-prompt',
            '.lineitem-address .a-dropdown-prompt',
            '[class*="lineitem-address"] .a-dropdown-container .a-button-input',
            '[class*="lineitem-address"] .a-dropdown-container .a-button-text',
            '.address-dropdown .a-dropdown-container .a-button-text',
            '.address-dropdown .a-button-text',
            '[class*="address-dropdown"] .a-dropdown-container .a-button-input',
        ];

        for (const sel of selectors) {
            try {
                const el = row.querySelector(sel);
                if (el && el.offsetParent !== null && !el.disabled) {
                    return el;
                }
            } catch (e) {
                /* ignore */
            }
        }

        const col = row.querySelector(
            '.lineitem-address, [class*="lineitem-address"], .address-dropdown, [class*="address-dropdown"]',
        );
        if (col) {
            const dd = col.querySelector('.a-dropdown-container');
            if (dd) {
                const inner =
                    dd.querySelector('.a-button-input') ||
                    dd.querySelector('button:not([disabled])') ||
                    dd.querySelector('.a-button-text, .a-dropdown-prompt');
                if (inner && inner.offsetParent !== null && !inner.disabled) {
                    return inner;
                }
            }
        }

        const fallback = row.querySelector('button[aria-label*="address" i], button[aria-label*="ship" i]');
        if (fallback && fallback.offsetParent !== null && !fallback.disabled) {
            return fallback;
        }

        return null;
    }

    /**
     * Some Chewbacca layouts use a native HTML select for address per line.
     */
    function findNativeAddressSelectInRow(row) {
        if (!row || typeof row.querySelectorAll !== 'function') return null;
        const selects = row.querySelectorAll('select');
        for (const sel of selects) {
            if (!sel.offsetParent || sel.disabled) continue;
            const nameId = `${sel.name || ''} ${sel.id || ''} ${sel.className || ''}`;
            if (/quantity|qty/i.test(nameId)) continue;
            const blob = Array.from(sel.options)
                .map((o) => o.textContent || '')
                .join(' ');
            if (/JACKSONVILLE|PO BOX|Wrrapd|\d{5}/i.test(blob)) {
                return sel;
            }
        }
        return null;
    }

    async function trySelectWrrapdNativeSelectInRow(row, titleKey) {
        const sel = findNativeAddressSelectInRow(row);
        if (!sel) return false;

        let wrrapdOption = null;
        for (const o of sel.options) {
            const t = o.textContent || '';
            if (t.includes('Wrrapd.com') && t.includes('PO BOX 26067')) {
                wrrapdOption = o;
                break;
            }
        }
        if (!wrrapdOption) {
            for (const o of sel.options) {
                const t = (o.textContent || '').toLowerCase();
                if (t.includes('wrrapd') && (t.includes('26067') || t.includes('po box'))) {
                    wrrapdOption = o;
                    break;
                }
            }
        }

        if (!wrrapdOption) {
            return false;
        }

        sel.value = wrrapdOption.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 1500));

        const productObj = retrieveItemFromLocalStorage(titleKey);
        if (productObj && productObj.options) {
            productObj.options.forEach((option) => {
                if (option.checkbox_wrrapd) {
                    option.amazonShippingAddress = buildWrrapdAddress();
                }
            });
            saveItemToLocalStorage(productObj);
        }
        return true;
    }

    function findShowMoreInPopover(popover) {
        if (!popover) return null;
        let showMoreLink = popover.querySelector('[aria-label*="Show more" i], [aria-label*="See more" i]');
        if (!showMoreLink) {
            const links = popover.querySelectorAll('a, button');
            for (const link of links) {
                const text = (link.textContent || '').trim().toLowerCase();
                if (text.includes('show more') || text.includes('see more')) {
                    showMoreLink = link;
                    break;
                }
            }
        }
        return showMoreLink;
    }

    async function processAddressChange(row, titleKey, subIndex) {
        try {
            console.log(`[processAddressChange] Starting address change for "${titleKey}" (row-scoped)...`);

            if (await trySelectWrrapdNativeSelectInRow(row, titleKey)) {
                console.log(`[processAddressChange] Set Wrrapd address via native <select> for "${titleKey}".`);
                return true;
            }

            const addressDropdownActivator = findAddressDropdownActivatorInRow(row);
            if (!addressDropdownActivator) {
                console.error(`[processAddressChange] No address dropdown in this item row for "${titleKey}".`);
                return false;
            }

            // Try clicking this row's dropdown up to 5 times if list doesn't appear
            let attempts = 0;
            let dropdownOptions = null;
            let popover = null;

            while (attempts < 5) {
                console.log(`[processAddressChange] Attempt ${attempts + 1}: Clicking row dropdown...`);

                const existingPopovers = document.querySelectorAll('.a-popover');
                if (existingPopovers.length > 0) {
                    document.body.click();
                    await new Promise((r) => setTimeout(r, 800));
                }

                addressDropdownActivator.click();
                await new Promise((r) => setTimeout(r, 1000));

                popover = await waitForElement('.a-popover', 3000);
                if (!popover) {
                    console.log(`[processAddressChange] No popover appeared. Retrying...`);
                    attempts++;
                    continue;
                }

                dropdownOptions = await waitForElement('.a-popover ul.a-list-link li a', 3000, true);

                if ((!dropdownOptions || dropdownOptions.length === 0) && popover) {
                    const showMoreLink = findShowMoreInPopover(popover);
                    if (showMoreLink) {
                        console.log(`[processAddressChange] Expanding "Show more" in this popover...`);
                        showMoreLink.click();
                        await new Promise((r) => setTimeout(r, 2000));
                        dropdownOptions = await waitForElement('.a-popover ul.a-list-link li a', 3000, true);
                    }
                }

                if (dropdownOptions && dropdownOptions.length > 0) {
                    let foundAddressOption = false;
                    for (const option of dropdownOptions) {
                        const text = option.textContent.trim();
                        if (
                            text.includes('JACKSONVILLE') ||
                            text.includes('Ship to a new address') ||
                            text.includes('Wrrapd.com') ||
                            text.includes('PO BOX')
                        ) {
                            foundAddressOption = true;
                            break;
                        }
                    }

                    if (foundAddressOption) {
                        console.log(`[processAddressChange] Address list OK (${dropdownOptions.length} options).`);
                        break;
                    }
                    console.log(`[processAddressChange] Popover does not look like addresses; closing.`);
                    document.body.click();
                    await new Promise((r) => setTimeout(r, 1200));
                } else {
                    console.log(`[processAddressChange] No options in popover. Retrying...`);
                }

                attempts++;
                await new Promise((r) => setTimeout(r, 1500));
            }

            if (!dropdownOptions || dropdownOptions.length === 0) {
                console.warn(`[processAddressChange] No address options for "${titleKey}" after ${attempts} attempts.`);
                return false;
            }

            let newAddrLink = null;
            let wrrapdLink = null;

            for (const option of dropdownOptions) {
                const optionText = option.textContent.trim();
                if (optionText.includes('Wrrapd.com') && optionText.includes('PO BOX 26067')) {
                    wrrapdLink = option;
                }
                if (optionText.includes('Ship to a new address')) {
                    newAddrLink = option;
                }
            }

            if (wrrapdLink) {
                console.log(`[processAddressChange] Clicking Wrrapd address for "${titleKey}"...`);
                wrrapdLink.click();
                await new Promise((r) => setTimeout(r, 5000));
                const productObj = retrieveItemFromLocalStorage(titleKey);
                if (productObj && productObj.options) {
                    productObj.options.forEach((option) => {
                        if (option.checkbox_wrrapd) {
                            option.amazonShippingAddress = buildWrrapdAddress();
                        }
                    });
                    saveItemToLocalStorage(productObj);
                }
                return true;
            }

            if (newAddrLink) {
                console.log(`[processAddressChange] Creating new address for "${titleKey}"...`);
                newAddrLink.click();
                const success = await addWrrapdAddress(titleKey, subIndex);
                return success;
            }

            return false;
        } catch (err) {
            console.error(`[processAddressChange] Error for "${titleKey}":`, err);
            return false;
        }
    }

    /**
     * Fill Wrrapd address in Amazon's "Add new address" form (from dropdown)
     * This is called when Wrrapd address is not found in the dropdown
     * Based on the old code's addWrrapdAddress function
     */
    async function fillWrrapdAddressInModal() {
        console.log("[fillWrrapdAddressInModal] Filling Wrrapd address in Amazon form...");
        
        try {
            // Initial wait before starting to fill form (matching old code)
            await new Promise(r => setTimeout(r, 2000));
            
            // Use the same field selectors as the old code
            const nameField = await waitForElement('input#address-ui-widgets-enterAddressFullName', 5000);
            const phoneField = await waitForElement('input#address-ui-widgets-enterAddressPhoneNumber', 5000);
            const addressLine1Field = await waitForElement('input#address-ui-widgets-enterAddressLine1', 5000);
            const cityField = await waitForElement('input#address-ui-widgets-enterAddressCity', 5000);
            const postalCodeField = await waitForElement('input#address-ui-widgets-enterAddressPostalCode', 5000);
            
            if (!nameField || !phoneField || !addressLine1Field || !cityField || !postalCodeField) {
                console.error("[fillWrrapdAddressInModal] Missing fields to add address.");
                return false;
            }
            
            // Fill Wrrapd address data with small delays between fields (matching old code)
            nameField.value = 'Wrrapd';
            await new Promise(r => setTimeout(r, 500));
            phoneField.value = '(904) 515-2034';
            await new Promise(r => setTimeout(r, 500));
            addressLine1Field.value = 'PO BOX 26067';
            await new Promise(r => setTimeout(r, 500));
            cityField.value = 'Jacksonville';
            await new Promise(r => setTimeout(r, 500));
            postalCodeField.value = '32226-6067';
            await new Promise(r => setTimeout(r, 500));
            
            // Try selecting "Florida" state (matching old code)
            const successState = await selectStateFlorida();
            if (!successState) {
                console.error("[fillWrrapdAddressInModal] Could not select Florida state.");
                return false;
            }
            
            // Wait longer before clicking save (matching old code)
            await new Promise(r => setTimeout(r, 2000));
            
            // Look for "Use this address" button (new) or "Save Address" button (old)
            // Try multiple selectors to find the submit button
            let saveButton = await waitForElement('#address-ui-widgets-form-submit-button .a-button-input', 3000);
            
            // If not found, try looking for button with text "Use this address"
            if (!saveButton) {
                const allButtons = document.querySelectorAll('button, .a-button-input, [type="submit"]');
                for (const btn of allButtons) {
                    const btnText = (btn.textContent || btn.innerText || '').trim().toLowerCase();
                    if (btnText.includes('use this address') || btnText.includes('save address')) {
                        console.log(`[fillWrrapdAddressInModal] Found button with text: "${btn.textContent?.trim()}"`);
                        saveButton = btn;
                        break;
                    }
                }
            }
            
            // Also try the old selector as fallback
            if (!saveButton) {
                saveButton = document.querySelector('#address-ui-widgets-form-submit-button .a-button-input, #address-ui-widgets-form-submit-button button, button[type="submit"]');
            }
            
            if (!saveButton) {
                console.error("[fillWrrapdAddressInModal] Could not find 'Use this address' or 'Save Address' button.");
                return false;
            }

            if (wrrapdManualAddressTapsRequired()) {
                console.log(
                    "[fillWrrapdAddressInModal] Manual Amazon confirmation required — not clicking save/use address.",
                );
                removeLoadingScreen();
                wrrapdShowManualAddressHint(saveButton, 'save');
                return false;
            }

            saveButton.click();
            console.log("[fillWrrapdAddressInModal] 'Use this address' / 'Save Address' clicked. Waiting for address to be saved...");
            
            // Increase wait time after saving new address (matching old code - 8 seconds)
            await new Promise(r => setTimeout(r, 8000));
            
            console.log("[fillWrrapdAddressInModal] ✓ Wrrapd address added successfully!");
            return true;
        } catch (error) {
            console.error(`[fillWrrapdAddressInModal] Error: ${error.message}`, error);
            return false;
        }
    }

    async function addWrrapdAddress(titleKey, subIndex) {
        console.log(`[addWrrapdAddress] Creating Wrrapd address for subItem #${subIndex} of "${titleKey}".`);

        try {
            // Initial wait before starting to fill form
            await new Promise(r => setTimeout(r, 2000));

            const nameField = await waitForElement('input#address-ui-widgets-enterAddressFullName', 5000);
            const phoneField = await waitForElement('input#address-ui-widgets-enterAddressPhoneNumber', 5000);
            const addressLine1Field = await waitForElement('input#address-ui-widgets-enterAddressLine1', 5000);
            const cityField = await waitForElement('input#address-ui-widgets-enterAddressCity', 5000);
            const postalCodeField = await waitForElement('input#address-ui-widgets-enterAddressPostalCode', 5000);
            if (!nameField || !phoneField || !addressLine1Field || !cityField || !postalCodeField) {
                console.error("[addWrrapdAddress] Missing fields to add address.");
                return false;
            }

            // Fill Wrrapd address data with small delays between fields
            nameField.value = 'Wrrapd';
            await new Promise(r => setTimeout(r, 500));
            phoneField.value = '(904) 515-2034';
            await new Promise(r => setTimeout(r, 500));
            addressLine1Field.value = 'PO BOX 26067';
            await new Promise(r => setTimeout(r, 500));
            cityField.value = 'Jacksonville';
            await new Promise(r => setTimeout(r, 500));
            postalCodeField.value = '32226-6067';
            await new Promise(r => setTimeout(r, 500));

            // Try selecting "Florida"
            const successState = await selectStateFlorida();
            if (!successState) {
                console.error("[addWrrapdAddress] Could not select Florida state.");
                return false;
            }

            // Wait longer before clicking save
            await new Promise(r => setTimeout(r, 2000));

            // Save
            const saveButton = await waitForElement('#address-ui-widgets-form-submit-button .a-button-input', 5000);
            if (!saveButton) {
                console.error("[addWrrapdAddress] Could not find 'Save Address' button.");
                return false;
            }
            if (wrrapdManualAddressTapsRequired()) {
                console.log("[addWrrapdAddress] Manual Amazon confirmation required — not clicking save/use address.");
                removeLoadingScreen();
                wrrapdShowManualAddressHint(saveButton, 'save');
                return false;
            }
            saveButton.click();
            console.log("[addWrrapdAddress] 'Save Address' clicked. Waiting for address to be saved...");
            
            // Increase wait time after saving new address
            await new Promise(r => setTimeout(r, 2000)); // Reduced wait time - loading screen hides the transition

            // Update subItem.amazonShippingAddress in storage
            const productObj = retrieveItemFromLocalStorage(titleKey);
            if (productObj && productObj.options[subIndex]) {
                productObj.options[subIndex].amazonShippingAddress = buildWrrapdAddress();
                saveItemToLocalStorage(productObj);
            }

            return true;
        } catch (error) {
            console.error(`[addWrrapdAddress] Error: ${error.message}`);
            return false;
        }
    }

    /*************************************************************
     * Helper / Utility Examples
     *************************************************************/
    function buildWrrapdAddress() {
        return {
            name: 'Wrrapd',
            street: 'PO BOX 26067',
            city: 'Jacksonville',
            state: 'FL',
            postalCode: '32226-6067', // EXACT format as specified
            country: 'United States',
            phone: '(904) 515-2034' // EXACT phone number
        };
    }

    /**
     * handleWrrapdAddressSelection - Handles address selection on the address page
     * Step 1: Click "Show more addresses" if it exists
     * Step 2: Check if Wrrapd address exists, if not add it
     * Step 3: If all items Wrrapd - select Wrrapd address radio button
     * Step 4: If mixed - click "Deliver to multiple addresses"
     */
    async function handleWrrapdAddressSelection() {
        // CRITICAL: Prevent duplicate calls
        if (isHandlingWrrapdAddressSelection) {
            console.warn("[handleWrrapdAddressSelection] Already handling address selection - preventing duplicate call!");
            return;
        }
        
        const itemsForTerms = getAllItemsFromLocalStorage();
        const termsAccepted = wrrapdEnsureTermsMatchForAddressAutomation(itemsForTerms);
        if (!termsAccepted) {
            console.log(
                "[handleWrrapdAddressSelection] Terms not accepted for current gift choices - NOT proceeding with address manipulation.",
            );
            removeLoadingScreen();
            wrrapdShowTermsRequiredBeforeAddressModal();
            return;
        }

        if (!hasAnyWrrapdGiftWrapInCart(itemsForTerms)) {
            console.log(
                '[handleWrrapdAddressSelection] No Wrrapd gift-wrap in cart — not running address automation.',
            );
            removeLoadingScreen();
            return;
        }
        
        isHandlingWrrapdAddressSelection = true;
        try {
        const allItems = itemsForTerms;
        const allItemsWrrapd = checkIfAllItemsWrrapd(allItems);
        localStorage.setItem('wrrapd-all-items', allItemsWrrapd ? 'true' : 'false');
        
            // CRITICAL: Loading screen should already be showing (from monitorURLChanges)
            // But ensure it's visible and stays visible throughout
        wrrapdShowAddressAutomationLoadingOrClear();
        
            // Wait for page to be fully loaded (reduced delay)
            await new Promise(r => setTimeout(r, 1500));

        // Step 1: Expand address list (hub may be below the fold or collapsed)
        wrrapdClickShowMoreAddressesIfPresent();
        await new Promise((r) => setTimeout(r, 600));
        
        // Legacy expanders (some Amazon skins still use these)
        const expandIcon = document.querySelector('i.a-icon.a-icon-expand');
        const expandLink = Array.from(document.querySelectorAll('*')).find(el => el.textContent?.trim() === 'Show more addresses');
        
        if (expandIcon) {
            const expanderLink = expandIcon.closest('a') || expandIcon.parentElement;
            if (expanderLink) {
                wrrapdSafeExpandActivatorNoJavascriptUrl(expanderLink);
                await new Promise(r => setTimeout(r, 2000));
            }
        } else if (expandLink) {
            wrrapdSafeExpandActivatorNoJavascriptUrl(expandLink);
            await new Promise(r => setTimeout(r, 2000));
        }

        function findWrrapdAddressControl() {
            const controls = wrrapdCollectAddressRadioLikeControls();
            for (const control of controls) {
                const addressText = wrrapdGetAddressTextNearControl(control);
                if (wrrapdHubSignatureFromText(addressText)) {
                    return { found: true, control };
                }
            }
            return { found: false, control: null };
        }

        // Step 2: Extract all addresses and find Wrrapd address
        let { found: wrrapdAddressFound, control: wrrapdAddressRadio } = findWrrapdAddressControl();
        if (!wrrapdAddressFound) {
            wrrapdClickShowMoreAddressesIfPresent();
            await new Promise((r) => setTimeout(r, 900));
            ({ found: wrrapdAddressFound, control: wrrapdAddressRadio } = findWrrapdAddressControl());
        }
        
        // Step 3: Handle based on whether Wrrapd address was found
        if (wrrapdAddressFound && wrrapdAddressRadio) {
            // CRITICAL: Use common function to ensure identifier mapping exists (even if address is already present)
            // This ensures the multi-address page can correctly identify and fix addresses
            await ensureCorrectAddressesForAllItems(allItems);
            
            if (allItemsWrrapd) {
                // All items are Wrrapd - select Wrrapd radio button and click "Deliver to this address"
                try {
                    wrrapdAddressRadio.scrollIntoView({ block: 'center', behavior: 'instant' });
                } catch (_) {
                    /* ignore */
                }
                if ('checked' in wrrapdAddressRadio && wrrapdAddressRadio.type === 'radio') {
                    wrrapdAddressRadio.checked = true;
                    wrrapdAddressRadio.dispatchEvent(new Event('change', { bubbles: true }));
                }
                wrrapdAddressRadio.click();
                await new Promise(r => setTimeout(r, 1000));
                
                const deliverButton = await findElementWithFallback(
                    'Deliver to this address button on Amazon address selection page',
                    ['button:contains("Deliver to this address")', 'input[value*="Deliver to this address"]', 'a:contains("Deliver to this address")', 'button[type="submit"]', '.a-button-primary input'],
                    'Amazon address selection page with a selected address and a button to proceed with delivery to that address',
                    ['Deliver to this address', 'Use this address', 'Continue with this address', 'Continue']
                );
                
                if (deliverButton) {
                    if (wrrapdManualAddressTapsRequired()) {
                        console.log(
                            "[handleWrrapdAddressSelection] Manual Amazon confirmation required — not clicking deliver/confirm button.",
                        );
                        removeLoadingScreen();
                        wrrapdShowManualAddressHint(deliverButton, 'deliver');
                    } else {
                        deliverButton.click();
                        removeLoadingScreen();
                    }
                    return;
                } else {
                    console.error("[handleWrrapdAddressSelection] Could not find 'Deliver to this address' button.");
                    removeLoadingScreen();
                    wrrapdShowAddressGiftMismatchModal(
                        'Amazon did not expose the usual “Deliver to this address” control while Wrrapd gift-wrap is in your cart. Scroll to the primary yellow button, or refresh and try again.',
                        wrrapdListTitlesWithAnyWrrapdGiftWrap(allItems),
                    );
                    return;
                }
            } else {
                // Mixed items - use common function to navigate to multi-address and fix addresses
                console.log("[handleWrrapdAddressSelection] Mixed items with Wrrapd address present - using common function...");
                const result = await ensureCorrectAddressesForAllItems(allItems);
                if (result) {
                    // Navigation initiated - function will handle address selection on multi-address page
                    return;
                }
                // Fallback to old logic if common function returns false
                // Mixed items - navigate to multi-address shipping page
                // Try multiple strategies to find the "Deliver to multiple addresses" link
                let multiAddressLink = null;
                
                // Strategy 1: Look for links/buttons with specific text
                const allLinks = Array.from(document.querySelectorAll('a, button'));
                for (const link of allLinks) {
                    const text = link.textContent?.trim() || '';
                    if (text.includes('multiple addresses') || text.includes('Deliver to multiple') || text.includes('Ship to multiple')) {
                        multiAddressLink = link;
                        break;
                    }
                }
                
                // Strategy 2: Use findElementWithFallback if not found
                if (!multiAddressLink) {
                    multiAddressLink = await findElementWithFallback(
                    'Deliver to multiple addresses link or button on Amazon address selection page',
                        ['a[href*="multiple"]', 'a[href*="multi"]', 'button[aria-label*="multiple"]'],
                    'Amazon address selection page with address options displayed and a link to deliver items to multiple addresses',
                        ['Deliver to multiple addresses', 'multiple addresses', 'Ship to multiple addresses', 'Deliver to multiple', 'multiple address']
                );
                }
                
                if (multiAddressLink) {
                    let linkURL = multiAddressLink.href || multiAddressLink.getAttribute('data-href');
                    if (linkURL && linkURL !== '#' && !linkURL.includes('javascript:') && linkURL.startsWith('http')) {
                        window.location.href = linkURL;
                    } else {
                        multiAddressLink.click();
                    }
                    removeLoadingScreen();
                    return;
                } else {
                    console.error("[handleWrrapdAddressSelection] Could not find 'Deliver to multiple addresses' link.");
                    removeLoadingScreen();
                    wrrapdShowAddressGiftMismatchModal(
                        'Mixed cart: we could not find “Deliver to multiple addresses” so each line can ship to the right place. Use that link on Amazon if you see it, or turn off Wrrapd gift-wrap for items staying at your address.',
                        wrrapdListTitlesWithAnyWrrapdGiftWrap(allItems),
                    );
                    return;
                }
            }
        } else {
                // Wrrapd address NOT found - need to add it
                // CRITICAL: The "Add a new delivery address" link ONLY exists on the single address selection page
                // It does NOT exist on the multi-address page, modals, or any other place
                // Therefore, we MUST add the address here (on the single address selection page) BEFORE navigating to multi-address
                
                // Find and click "Add a new delivery address" link
            const addNewAddressLink = await findElementWithFallback(
                'Add a new delivery address link or button on Amazon address selection page',
                ['a:contains("Add a new")', 'button:contains("Add a new")'],
                'Amazon address selection page with list of addresses',
                ['Add a new delivery address', 'Add a new address', 'Add new address']
            );
            
                if (!addNewAddressLink) {
                    console.error("[handleWrrapdAddressSelection] Could not find 'Add a new delivery address' link.");
                    console.error("[handleWrrapdAddressSelection] This link ONLY exists on the single address selection page (when clicking 'Change' address).");
                    removeLoadingScreen();
                    wrrapdShowAddressGiftMismatchModal(
                        'We could not find the Wrrapd hub in the visible list and could not open “Add a new delivery address.” Expand “Show more addresses”, add the hub if missing, or remove Wrrapd gift-wrap for items not coming to us.',
                        wrrapdListTitlesWithAnyWrrapdGiftWrap(allItems),
                    );
                    return;
                }
                
                // CRITICAL: Add the address FIRST (on the single address selection page where the link exists)
                // After adding, we'll check if all items are Wrrapd and proceed accordingly
                console.log("[handleWrrapdAddressSelection] Adding Wrrapd address on single address selection page (before navigating to multi-address if needed)...");
                addNewAddressLink.click();
                await new Promise(r => setTimeout(r, 2000));
                
                const success = await addWrrapdAddressSinglePage();
                if (!success) {
                    console.error("[handleWrrapdAddressSelection] Failed to add Wrrapd address.");
                    removeLoadingScreen();
                    wrrapdShowAddressGiftMismatchModal(
                        'Adding the Wrrapd hub address on Amazon did not complete. Finish adding it in Amazon’s form, or remove Wrrapd gift-wrap for items you are not sending to Wrrapd.',
                        wrrapdListTitlesWithAnyWrrapdGiftWrap(allItems),
                    );
                    return;
                }
                
                // CRITICAL: Set flag to indicate Wrrapd address was just added
                // Amazon will auto-select it for all items, so we need to fix non-Wrrapd items on multi-address page
                localStorage.setItem('wrrapd-address-just-added', 'true');
                console.log("[handleWrrapdAddressSelection] Wrrapd address just added - flag set. Will fix non-Wrrapd items on multi-address page.");
                
                // CRITICAL: Create unique identifier mapping for each item BEFORE navigating to multi-address
                // This allows us to correctly identify which item is which on the multi-address page
                // Format: "WRRAPD_productName_counter" or "DEFAULT_productName_counter"
                const itemIdentifierMap = {};
                let wrrapdCounter = 1;
                let nonWrrapdCounter = 1;
                
                for (const [productKey, productObj] of Object.entries(allItems)) {
                    if (!productObj || !productObj.asin || !productObj.options) continue;
                    
                    const totalOptions = productObj.options.length;
                    const wrrapdOptions = productObj.options.filter(opt => opt.checkbox_wrrapd === true).length;
                    const allOptionsNeedWrrapd = totalOptions > 0 && wrrapdOptions === totalOptions;
                    
                    // Create identifier for this product
                    // Use first 30 chars of product key + counter
                    const productNameShort = productKey.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
                    const identifier = allOptionsNeedWrrapd 
                        ? `WRRAPD_${productNameShort}_${wrrapdCounter++}`
                        : `DEFAULT_${productNameShort}_${nonWrrapdCounter++}`;
                    
                    itemIdentifierMap[productObj.asin] = {
                        identifier: identifier,
                        needsWrrapd: allOptionsNeedWrrapd,
                        productKey: productKey
                    };
                }
                
                // Store mapping in localStorage
                localStorage.setItem('wrrapd-item-identifiers', JSON.stringify(itemIdentifierMap));
                console.log("[handleWrrapdAddressSelection] Created item identifier mapping:", itemIdentifierMap);
                
                // CRITICAL: For mixed items, navigate directly to multi-address page
                // Don't set default address - let Amazon keep Wrrapd address for all items
                // We'll fix non-Wrrapd items on the multi-address page using identifiers
                if (!allItemsWrrapd) {
                    console.log("[handleWrrapdAddressSelection] Mixed items detected - navigating directly to multi-address page (Amazon will have Wrrapd address selected for all items, we'll fix non-Wrrapd items there)...");
                    
                    // Wait for page to update after address is saved
                    await new Promise(r => setTimeout(r, 2000));
                    
                    // Now try to navigate to multi-address shipping
                    let multiAddressLink = null;
                    
                    // Strategy 1: Look for links/buttons with specific text
                    const allLinks = Array.from(document.querySelectorAll('a, button'));
                    for (const link of allLinks) {
                        const text = link.textContent?.trim() || '';
                        if (text.includes('multiple addresses') || text.includes('Deliver to multiple') || text.includes('Ship to multiple')) {
                            multiAddressLink = link;
                            break;
                        }
                    }
                    
                    // Strategy 2: Use findElementWithFallback if not found
                    if (!multiAddressLink) {
                        multiAddressLink = await findElementWithFallback(
                            'Deliver to multiple addresses link or button on Amazon address selection page',
                            ['a[href*="multiple"]', 'a[href*="multi"]', 'button[aria-label*="multiple"]'],
                            'Amazon address selection page with address options displayed and a link to deliver items to multiple addresses',
                            ['Deliver to multiple addresses', 'multiple addresses', 'Ship to multiple addresses', 'Deliver to multiple', 'multiple address']
                        );
                    }
                    
                    // Strategy 3: Construct URL manually if link still not found
                    if (!multiAddressLink) {
                        console.log("[handleWrrapdAddressSelection] Link not found - attempting to construct multi-address URL manually...");
                        const currentURL = window.location.href;
                        const purchaseIdMatch = currentURL.match(/\/p\/([^\/]+)/);
                        const purchaseId = purchaseIdMatch ? purchaseIdMatch[1] : null;
                        
                        if (purchaseId) {
                            // Try to construct the multi-address URL
                            const multiAddressURL = `https://www.amazon.com/checkout/p/${purchaseId}/itemselect?pipelineType=Chewbacca&useCase=multiAddress`;
                            console.log("[handleWrrapdAddressSelection] Constructed multi-address URL:", multiAddressURL);
                            // CRITICAL: Keep loading screen visible - don't remove it until payment page
                            // showLoadingScreen(); // Already showing, but ensure it stays
                            window.location.href = multiAddressURL;
                            return;
                        }
                    }
                    
                    if (multiAddressLink) {
                        let linkURL = multiAddressLink.href || multiAddressLink.getAttribute('data-href');
                        // CRITICAL: Keep loading screen visible - don't remove it until payment page
                        // showLoadingScreen(); // Already showing, but ensure it stays
                        if (linkURL && linkURL !== '#' && !linkURL.includes('javascript:') && linkURL.startsWith('http')) {
                            window.location.href = linkURL;
                        } else {
                            multiAddressLink.click();
                        }
                        return;
                    } else {
                        console.error("[handleWrrapdAddressSelection] Could not find 'Deliver to multiple addresses' link and could not construct URL. Cannot proceed.");
                        removeLoadingScreen();
                        return;
                    }
                }
                
                // Only wait and check radio buttons if ALL items are Wrrapd
                // Wait for page to update after address is saved
                await new Promise(r => setTimeout(r, 3000));
                
                // Re-check for Wrrapd address
                const updatedRadios = Array.from(document.querySelectorAll('input[type="radio"]'));
                let newWrrapdRadio = null;
                for (let i = 0; i < updatedRadios.length; i++) {
                    const radio = updatedRadios[i];
                    const addressContainer = radio.closest('.a-box, .a-box-inner, [class*="address"], label') || radio.parentElement;
                    const addressText = addressContainer ? addressContainer.textContent?.trim() || '' : '';
                    
                    const hasWrrapd = addressText.includes("Wrrapd") || addressText.includes("Wrrapd.com");
                    const hasPOBox = addressText.includes("PO BOX 26067");
                    const hasJacksonville = addressText.includes("JACKSONVILLE") || addressText.includes("Jacksonville");
                    const hasZip = addressText.includes("32218") || addressText.includes("32226");
                    const hasState = addressText.includes("FL") || addressText.includes("Florida");
                    
                    if ((hasWrrapd || hasPOBox) && hasJacksonville && hasZip && hasState) {
                        newWrrapdRadio = radio;
                        break;
                    }
                }
                
                // Now check if all items are Wrrapd to determine next step
                    if (allItemsWrrapd) {
                    // All items are Wrrapd - select the newly added Wrrapd address and proceed
                    if (newWrrapdRadio) {
                        newWrrapdRadio.checked = true;
                        newWrrapdRadio.dispatchEvent(new Event('change', { bubbles: true }));
                        newWrrapdRadio.click();
                        await new Promise(r => setTimeout(r, 1000));
                        
                        const deliverButton = await findElementWithFallback(
                            'Deliver to this address button on Amazon address selection page',
                            ['button:contains("Deliver to this address")', 'input[value*="Deliver to this address"]', 'a:contains("Deliver to this address")', 'button[type="submit"]', '.a-button-primary input'],
                            'Amazon address selection page with a selected address and a button to proceed with delivery to that address',
                            ['Deliver to this address', 'Use this address', 'Continue with this address', 'Continue']
                        );
                        
                        if (deliverButton) {
                            if (wrrapdManualAddressTapsRequired()) {
                                console.log(
                                    "[handleWrrapdAddressSelection] Manual Amazon confirmation required — not clicking deliver/confirm button.",
                                );
                                wrrapdShowManualAddressHint(deliverButton, 'deliver');
                            } else {
                                deliverButton.click();
                            }
                    } else {
                            console.error("[handleWrrapdAddressSelection] Could not find 'Deliver to this address' button after selecting Wrrapd address.");
                }
                removeLoadingScreen();
                return;
            } else {
                        console.error("[handleWrrapdAddressSelection] Wrrapd address not found after addition.");
                removeLoadingScreen();
                return;
            }
                }
            }
        } catch (error) {
            console.error(`[handleWrrapdAddressSelection] Error: ${error.message}`, error);
            removeLoadingScreen();
        } finally {
            // Always reset the flag when function completes
            isHandlingWrrapdAddressSelection = false;
        }
    }

    /**
     * addWrrapdAddressSinglePage - Adds Wrrapd address on the single address selection page
     */
    // Flags to prevent duplicate operations
    let isAddingWrrapdAddress = false;
    let isHandlingWrrapdAddressSelection = false;
    
    async function addWrrapdAddressSinglePage() {
        // CRITICAL: Prevent duplicate additions
        if (isAddingWrrapdAddress) {
            console.warn("[addWrrapdAddressSinglePage] Already adding Wrrapd address - preventing duplicate!");
            return false;
        }
        
        isAddingWrrapdAddress = true;
        
        try {
            // Wait for form fields
            await new Promise(r => setTimeout(r, 2000));
            
            const nameField = await waitForElement('input#address-ui-widgets-enterAddressFullName', 5000);
            const phoneField = await waitForElement('input#address-ui-widgets-enterAddressPhoneNumber', 5000);
            const addressLine1Field = await waitForElement('input#address-ui-widgets-enterAddressLine1', 5000);
            const cityField = await waitForElement('input#address-ui-widgets-enterAddressCity', 5000);
            const postalCodeField = await waitForElement('input#address-ui-widgets-enterAddressPostalCode', 5000);
            
            if (!nameField || !phoneField || !addressLine1Field || !cityField || !postalCodeField) {
                console.error("[addWrrapdAddressSinglePage] Missing fields to add address.");
                return false;
            }
            
            // Fill Wrrapd address data
            // Trigger input events so Amazon's validation runs (but avoid blur to prevent elementFromPoint errors)
            const triggerInputEvent = (field, value) => {
                field.value = value;
                field.dispatchEvent(new Event('input', { bubbles: true }));
                field.dispatchEvent(new Event('change', { bubbles: true }));
                // Don't trigger blur - it causes elementFromPoint errors with Amazon's scripts
            };
            
            triggerInputEvent(nameField, 'Wrrapd');
            await new Promise(r => setTimeout(r, 500));
            triggerInputEvent(phoneField, '(904) 515-2034');
            await new Promise(r => setTimeout(r, 500));
            triggerInputEvent(addressLine1Field, 'PO BOX 26067');
            await new Promise(r => setTimeout(r, 500));
            triggerInputEvent(cityField, 'Jacksonville');
            await new Promise(r => setTimeout(r, 500));
            triggerInputEvent(postalCodeField, '32226-6067');
            await new Promise(r => setTimeout(r, 500));
            
            // Select "Florida" state
            const successState = await selectStateFlorida();
            if (!successState) {
                console.error("[addWrrapdAddressSinglePage] Could not select Florida state.");
                return false;
            }
            
            // Wait for Amazon's validation to complete
            await new Promise(r => setTimeout(r, 3000));
            
            // Click "Use this address" button (this saves and uses the address)
            // Use the EXACT same logic that worked in the test script
            let useAddressButton = document.querySelector('input[data-testid="bottom-continue-button"][type="submit"]') ||
                                 document.querySelector('#checkout-primary-continue-button-id input[type="submit"]') ||
                                 document.querySelector('input[aria-labelledby="checkout-primary-continue-button-id-announce"][type="submit"]');
            
            if (!useAddressButton) {
                console.error("[addWrrapdAddressSinglePage] Could not find 'Use this address' button.");
                return false;
            }
            
            // Validate it's not the error button
            const buttonName = useAddressButton.name || '';
            if (buttonName && buttonName.includes('error')) {
                console.error("[addWrrapdAddressSinglePage] Found error button instead of submit button.");
                return false;
            }
            
            // CRITICAL: Wait for button to be enabled before clicking
            let waitCount = 0;
            const maxWait = 20; // Wait up to 10 seconds (20 * 500ms)
            
            while ((useAddressButton.disabled || useAddressButton.getAttribute('aria-disabled') === 'true') && waitCount < maxWait) {
                await new Promise(r => setTimeout(r, 500));
                waitCount++;
                
                // Re-check the button state (it might have been replaced)
                const currentButton = document.querySelector(`[data-testid="${useAddressButton.getAttribute('data-testid')}"]`) || useAddressButton;
                if (currentButton && !currentButton.disabled && currentButton.getAttribute('aria-disabled') !== 'true') {
                    useAddressButton = currentButton;
                        break;
                }
            }
            
            if (useAddressButton.disabled || useAddressButton.getAttribute('aria-disabled') === 'true') {
                console.error("[addWrrapdAddressSinglePage] Button is still disabled after waiting. Cannot click.");
                return false;
            }

            if (wrrapdManualAddressTapsRequired()) {
                console.log(
                    "[addWrrapdAddressSinglePage] Manual Amazon confirmation required — not clicking 'Use this address'.",
                );
                removeLoadingScreen();
                useAddressButton.scrollIntoView({ behavior: 'auto', block: 'center' });
                wrrapdShowManualAddressHint(useAddressButton, 'save');
                isAddingWrrapdAddress = false;
                return false;
            }

            // Use the EXACT same click logic that worked in the test script
            useAddressButton.scrollIntoView({ behavior: 'auto', block: 'center' });
            await new Promise(r => setTimeout(r, 500));
            
            useAddressButton.click();
            
            // Wait for address to be saved and modal to close
            await new Promise(r => setTimeout(r, 3000));
            
            // Check if the modal is still visible - if so, wait longer
            const modalStillVisible = document.querySelector('#address-ui-widgets-form-submit-button, [data-testid="secondary-continue-button"]');
            if (modalStillVisible) {
                await new Promise(r => setTimeout(r, 3000));
            }
            
            // Reset flag after successful addition
            isAddingWrrapdAddress = false;
            return true;
        } catch (error) {
            console.error(`[addWrrapdAddressSinglePage] Error: ${error.message}`);
            // Reset flag on error
            isAddingWrrapdAddress = false;
            return false;
        }
    }

    /**
     * isSubItemWrrapdOnAmazon - checks if we have set amazonShippingAddress
     * to Wrrapd for this subItem.  (We do *not* check subItem.shippingAddress 
     * because that is the user's original address.)
     */
    function isSubItemWrrapdOnAmazon(subItem) {
        if (!subItem.amazonShippingAddress) return false;
        const a = subItem.amazonShippingAddress;
        return (
            a.name === 'Wrrapd.com' && 
            a.street.includes('PO BOX 26067')
        );
    }
    
    
    /**
     * REMOVED DUPLICATE: waitForElement() function
     * There were TWO waitForElement functions:
     * 1. Optimized version at line ~3484 using MutationObserver (KEPT - more efficient)
     * 2. Old polling version here using setTimeout (REMOVED - less efficient)
     * 
     * All code now uses the optimized MutationObserver version.
     * If you need multiple elements, use: document.querySelectorAll() after waitForElement()
     */
    
    async function selectStateFlorida() {
        console.log("[selectStateFlorida] Attempting to select 'Florida' as the state.");
    
        try {
            // Esperar al botón desplegable del estado
            const stateButton = await waitForElement('#address-ui-widgets-enterAddressStateOrRegion .a-button-text', 5000);
            await new Promise(resolve => setTimeout(resolve, 500)); // Pausa tras encontrar el botón
    
            if (!stateButton) {
                console.error("[selectStateFlorida] State dropdown not found.");
                return false;
            }
    
            // Hacer clic en el botón para abrir el dropdown
            stateButton.click();
            console.log("[selectStateFlorida] State dropdown clicked. Waiting for options.");
    
            // Esperar a que las opciones del dropdown se carguen
            await new Promise(resolve => setTimeout(resolve, 1000)); // Pausa para que las opciones carguen
            const stateOptions = document.querySelectorAll('.a-popover.a-dropdown ul.a-nostyle.a-list-link li a');
    
            if (stateOptions && stateOptions.length > 0) {
                console.log(`[selectStateFlorida] Found ${stateOptions.length} state options.`);
                for (const option of stateOptions) {
                    if (option.innerText.includes('Florida')) {
                        console.log("[selectStateFlorida] Found 'Florida' in the options. Selecting it.");
                        option.click();
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Pausa tras seleccionar
                        return true;
                    }
                }
    
                console.error("[selectStateFlorida] 'Florida' option not found in the dropdown.");
                return false;
            } else {
                console.error("[selectStateFlorida] State dropdown options not found.");
                return false;
            }
        } catch (error) {
            console.error(`[selectStateFlorida] Error: ${error.message}`);
            return false;
        }
    }
    
    function showTermsAndConditionsModal(onProceedCallback, giftTermsSignature) {
        console.log("[showTermsAndConditionsModal] Showing Terms & Conditions modal");
        
        // Check if modal already exists
        const existingModal = document.getElementById('wrrapd-terms-modal');
        if (existingModal) {
            console.log("[showTermsAndConditionsModal] Modal already exists");
            return;
        }
        
        // Create dark overlay
        const modal = document.createElement('div');
        modal.id = 'wrrapd-terms-modal';
        modal.className = 'wrrapd-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.85);
            z-index: 100000;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow-y: auto;
            padding: 20px;
        `;
        
        // Create modal content container
        const content = document.createElement('div');
        content.style.cssText = `
            background-color: white;
            border-radius: 12px;
            max-width: 550px;
            width: 100%;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            position: relative;
        `;
        
        // Create close button (X)
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '&times;';
        closeButton.style.cssText = `
            position: absolute;
            top: 10px;
            right: 15px;
            background: none;
            border: none;
            font-size: 32px;
            color: #666;
            cursor: pointer;
            line-height: 1;
            padding: 0;
            width: 30px;
            height: 30px;
            z-index: 100001;
        `;
        closeButton.addEventListener('click', () => {
            console.log("[showTermsAndConditionsModal] Close button clicked");
            modal.remove();
        });
        content.appendChild(closeButton);
        
        // Create scrollable content area
        const scrollableContent = document.createElement('div');
        scrollableContent.style.cssText = `
            padding: 40px 35px;
            overflow-y: auto;
            flex: 1;
            font-family: 'Georgia', 'Times New Roman', serif;
            line-height: 1.8;
            color: #2c3e50;
        `;
        
        // Terms & Conditions content
        scrollableContent.innerHTML = `
                        <h1 style="margin-top: 0; margin-bottom: 8px; color: #2c3e50; font-size: 28px; text-align: center; font-weight: 600; letter-spacing: 0.5px;">Wrrapd Inc. Terms & Conditions</h1>
            <p style="margin-top: 0; margin-bottom: 22px; text-align: center;"><em>Last Updated: April 6, 2026</em></p>
            <div style="font-size: 15px; line-height: 1.9;">
                <p style="margin-bottom: 16px;"><strong>1.</strong> Scope of Service: These Terms & Conditions ("Terms") apply solely to the gift-wrapping and related fulfillment services provided by Wrrapd Inc. ("Wrrapd"). Your purchase of any underlying items is governed solely by Amazon's Terms & Conditions.</p>
                <p style="margin-bottom: 16px;"><strong>2.</strong> Eligibility: You must be at least 18 years old or the age of majority in your jurisdiction to utilize the Wrrapd gift-wrapping service.</p>
                <p style="margin-bottom: 16px;"><strong>3.</strong> Privacy Policy: Your use of the service is subject to Wrrapd's Privacy Policy, found at <a href="https://www.wrrapd.com/privacy" target="_blank" style="color: #0066c0; text-decoration: none;">https://www.wrrapd.com/privacy</a>.</p>
                <p style="margin-bottom: 16px;"><strong>4.</strong> Limited Agency Appointment: By using the Wrrapd browser extension and clicking the agreement button, you explicitly appoint Wrrapd Inc. as your Limited Agent and Attorney-in-Fact for the sole purpose of navigating the Amazon interface and entering delivery information on your behalf. Wrrapd acts only at your specific direction and under your direct supervision.</p>
                <p style="margin-bottom: 16px;"><strong>5.</strong> Platform Risk & Account Health: You acknowledge that Amazon's March 4, 2026 Agent Policy is an evolving platform rule. You agree to assume all risks regarding your Amazon account status, including potential flags or the voiding of Amazon-specific guarantees once an item is delivered to our hub.</p>
                <p style="margin-bottom: 16px;"><strong>6.</strong> Description of Service: You acknowledge that Wrrapd provides professional exterior gift-wrapping and may include personalized options (e.g., messages, custom/AI designs, or tags).</p>
                <p style="margin-bottom: 16px;"><strong>7.</strong> Fees and Taxes: You acknowledge that the Wrrapd service fee and any applicable taxes are clearly displayed at the time of selection, and by completing the order, you accept and agree to pay these amounts.</p>
                <p style="margin-bottom: 16px;"><strong>8.</strong> Delivery Timelines: Selecting Wrrapd may add at least one business day to Amazon's estimated delivery date. An additional day is often required for the wrapping process, particularly for items received after 2:00 p.m. local time.</p>
                <p style="margin-bottom: 16px;"><strong>9.</strong> Third-Party Delays: You agree not to hold Wrrapd responsible for any delays resulting from the late delivery of items from Amazon or its third-party sellers to Wrrapd's facilities.</p>
                <p style="margin-bottom: 16px;"><strong>10.</strong> Video Audit Trail: Wrrapd provides high-fidelity Video Proof for every order, including (a) receipt of the Amazon package, (b) the unpackaging process, (c) the gift-wrapping process, and (d) final delivery to the outbound carrier. This record serves as definitive evidence of our service fulfillment.</p>
                <p style="margin-bottom: 16px;"><strong>11.</strong> No Product Inspection: Wrrapd does not inspect, open, or handle the contents of Amazon-purchased items prior to the wrapping stage. Wrrapd is not responsible for any damage to the underlying product, defects, missing parts, or incorrect items sent by Amazon.</p>
                <p style="margin-bottom: 16px;"><strong>12.</strong> Indemnification: You agree to indemnify and hold harmless Wrrapd Inc. from any claims or losses arising from the condition or quality of the underlying product, your use of the service, or your violation of these Terms.</p>
                <p style="margin-bottom: 16px;"><strong>13.</strong> Product Issues & Returns: All issues relating to the product itself must be addressed directly with Amazon or the seller. Since you remain the owner of the product, you are responsible for initiating any returns through Amazon's standard channels using our provided video evidence if necessary.</p>
                <p style="margin-bottom: 16px;"><strong>14.</strong> Refund Policy: Gift-wrapping fees are non-refundable except in limited cases: (a) damage to the gift-wrap itself during transit; or (b) failure to ship the wrapped item within our promised window. Service fees are not refundable once the wrapping process has been documented.</p>
                <p style="margin-bottom: 16px;"><strong>15.</strong> Prohibited Conduct: You agree not to provide false or misleading information or use the service for any fraudulent or illegal purposes.</p>
                <p style="margin-bottom: 16px;"><strong>16.</strong> Warranties and Liability: The service is provided "AS IS." Wrrapd's total liability is limited to the service fee paid. We are not liable for indirect, incidental, or consequential damages.</p>
                <p style="margin-bottom: 16px;"><strong>17.</strong> Dispute Resolution & Governing Law: Any disputes will be resolved through binding individual arbitration in Jacksonville, Florida. You waive the right to a jury trial or class action. These Terms are governed by the laws of the State of Florida, USA.</p>
            </div>
        `;
        
        content.appendChild(scrollableContent);
        
        // Create agreement text container
        const agreementContainer = document.createElement('div');
        agreementContainer.style.cssText = `
            padding: 25px 35px;
            border-top: 2px solid #ddd;
            text-align: center;
            font-size: 16px;
            font-family: 'Georgia', 'Times New Roman', serif;
        `;
        
        // Create the agreement text with clickable link
        const agreementText = document.createElement('div');
        agreementText.innerHTML = 'By clicking <span id="wrrapd-agree-link" style="color: #999; cursor: not-allowed; text-decoration: underline;">here</span>, I appoint Wrrapd as my Limited Agent for this transaction and agree to the Wrrapd Terms & Conditions provided above.';
        
        const agreeLink = agreementText.querySelector('#wrrapd-agree-link');
        
        // Initially disable the link
        let linkEnabled = false;
        
        // Function to check if user has scrolled to bottom
        const checkScrollPosition = () => {
            const scrollTop = scrollableContent.scrollTop;
            const scrollHeight = scrollableContent.scrollHeight;
            const clientHeight = scrollableContent.clientHeight;
            
            // Check if scrolled to bottom (with 5px tolerance)
            const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5;
            
            if (isAtBottom && !linkEnabled) {
                // Enable the link
                linkEnabled = true;
                agreeLink.style.color = '#0066c0';
                agreeLink.style.cursor = 'pointer';
                agreeLink.style.textDecoration = 'underline';
                console.log("[showTermsAndConditionsModal] User scrolled to bottom - link enabled");
            } else if (!isAtBottom && linkEnabled) {
                // Disable the link if user scrolls back up
                linkEnabled = false;
                agreeLink.style.color = '#999';
                agreeLink.style.cursor = 'not-allowed';
                agreeLink.style.textDecoration = 'underline';
                console.log("[showTermsAndConditionsModal] User scrolled up - link disabled");
            }
        };
        
        // Add scroll listener to check position
        scrollableContent.addEventListener('scroll', checkScrollPosition);
        
        // Also check on initial load (in case content fits without scrolling)
        setTimeout(() => {
            checkScrollPosition();
        }, 100);
        
        // Handle click on the link
        agreeLink.addEventListener('click', function(e) {
            if (!linkEnabled) {
                e.preventDefault();
                console.log("[showTermsAndConditionsModal] Link clicked but not enabled - user must scroll to bottom");
                return false;
            }
            
            console.log("[showTermsAndConditionsModal] User clicked agreement link");
            
            localStorage.setItem('wrrapd-terms-accepted', 'true');
            localStorage.setItem('wrrapd-keep-loading-until-summary', 'true');
            localStorage.setItem(WRRAPD_MANUAL_ADDRESS_TAPS_KEY, '1');
            try {
                const allItems = getAllItemsFromLocalStorage();
                syncWrrapdSelectionsFromGiftDom(allItems);
                // Recompute signature at click-time so changed-mind flow matches current checkbox state.
                const latestItems = getAllItemsFromLocalStorage();
                const latestSig = wrrapdGiftOptionsTermsSignature(latestItems);
                localStorage.setItem('wrrapd-terms-gift-signature', latestSig || giftTermsSignature || '');
            } catch (_) { /* best effort */ }
            
            // Show loading screen IMMEDIATELY before closing modal and calling callback
            showLoadingScreen();
            
            modal.remove();
            
            // Call the callback to proceed
            if (onProceedCallback) {
                onProceedCallback();
            }
        });
        
        agreementContainer.appendChild(agreementText);
        content.appendChild(agreementContainer);
        modal.appendChild(content);
        
        // Close modal when clicking outside (on the dark overlay)
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                console.log("[showTermsAndConditionsModal] Clicked outside modal - closing");
                modal.remove();
            }
        });
        
        document.body.appendChild(modal);
    }
    
    // ----------------------------------------------------- PAYMENT SECTION -----------------------------------------------------

    function paymentSection(allItems) {
        console.log("[paymentSection] Entering payment section.");

        // CRITICAL: Only process items that are actually in the current checkout
        const itemsInCurrentCheckout = filterItemsInCurrentCheckout(allItems);
        
        if (Object.keys(itemsInCurrentCheckout).length === 0) {
            console.log("[paymentSection] No items from current checkout found. Skipping Wrrapd processing.");
            if (paymentSectionRetryCount < 7) {
                paymentSectionRetryCount += 1;
                setTimeout(() => paymentSection(getAllItemsFromLocalStorage()), 900);
                return;
            }
            paymentSectionRetryCount = 0;
            const existingSummary = document.querySelector('#wrrapd-summary');
            if (existingSummary) existingSummary.remove();
            localStorage.removeItem('wrrapd-keep-loading-until-summary');
            removeLoadingScreen();
            return;
        }
        paymentSectionRetryCount = 0;

        removeNotSelectedTextInGiftOptions(itemsInCurrentCheckout);

        // Check if payment was already successful
        const paymentStatus = localStorage.getItem('wrrapd-payment-status');
        if (paymentStatus === 'success') {
            console.log("[paymentSection] Payment already successful - re-enabling Place your order buttons...");
            enablePlaceOrderButtons();
        } else {
            // IMMEDIATELY disable "Place your order" buttons if Wrrapd is selected
            const wrrapdSelected = Object.values(itemsInCurrentCheckout).some(item => {
                return item.options && item.options.some(subItem => subItem.checkbox_wrrapd);
            });

            if (wrrapdSelected) {
                console.log("[paymentSection] Wrrapd selected - IMMEDIATELY disabling Place your order buttons...");
                disablePlaceOrderButtons();
            }
        }

        // Check if Wrrapd is selected and create the payment summary (only for current checkout items)
        checkIfWrrapdSelected(itemsInCurrentCheckout);
        
        // Add delivery date extension notice for Wrrapd items (only for current checkout items)
        addDeliveryDateNotice(itemsInCurrentCheckout);
        
        // CRITICAL: Monitor for "Add gift options" button clicks on checkout/payment page
        // When clicked, it may open gift interface dynamically - we need to insert Wrrapd options
        // This handles the case when "This order contains a gift" was NOT checked on Cart page
        // Use the allItems parameter that was passed to this function
        monitorAddGiftOptionsButton(allItems);
    }
    
    /**
     * Monitor for "Add gift options" button clicks on checkout/payment page
     * When clicked, wait for gift interface to appear, then insert Wrrapd options
     * This handles the case when "This order contains a gift" was NOT checked on Cart page
     */
    /**
     * Monitor for gift options appearing dynamically (e.g., when "Add gift options" is clicked)
     * This ensures Wrrapd options are inserted even when gift options appear dynamically
     * Based on the old working code - simple and direct approach
     */
    /**
     * Monitor for gift options appearing dynamically (e.g., when "Add gift options" is clicked)
     * MATCH OLD CODE: Simple, direct approach - just call insertWrrapdOptions when gift options are detected
     */
    function monitorAddGiftOptionsButton(allItems) {
        console.log("[monitorAddGiftOptionsButton] Setting up monitoring for gift options interface...");
        
        let hasInserted = false;
        const insertedKeys = new Set(); // Track by URL to allow re-insertion on navigation
        
        const tryInsertWrrapdOptions = () => {
            const currentURL = window.location.href;
            const urlKey = currentURL.split('?')[0]; // Use base URL as key
            
            // Don't insert if we've already inserted for this URL
            if (insertedKeys.has(urlKey) && hasInserted) {
                return;
            }
            
            // Simple check: look for gift options page elements
            const giftOptions = document.querySelector('#giftOptions');
            const giftCheckboxes = document.querySelectorAll('input[id^="gift-wrap-checkbox"], input[id^="toggle-gift-item-checkbox"]');
            const itemElements = document.querySelectorAll('[id^="item-"]');
            const giftMessageTextareas = document.querySelectorAll('textarea[id^="message-area"], textarea[id*="gift-message"]');
            
            // If we find gift options, insert Wrrapd options (matching old code behavior)
            const hasGiftOptions = giftOptions || 
                                  giftCheckboxes.length > 0 || 
                                  itemElements.length > 0 ||
                                  giftMessageTextareas.length > 0;
            
            if (hasGiftOptions && !hasInserted) {
                console.log("[monitorAddGiftOptionsButton] ✓✓✓ Gift options detected - calling insertWrrapdOptions (matching old code)...");
                hasInserted = true;
                insertedKeys.add(urlKey);
                
                // Wait a moment for Amazon's interface to render, then insert (matching old code timing)
                setTimeout(() => {
                    console.log("[monitorAddGiftOptionsButton] Executing: insertWrrapdOptions(allItems), monitorAmazonGiftCheckbox(allItems), and overrideSaveGiftOptionsButtons()");
                    insertWrrapdOptions(allItems);
                    monitorAmazonGiftCheckbox(allItems);
                    // CRITICAL: Also set up button interception so "Save gift options" triggers Terms & Conditions
                    overrideSaveGiftOptionsButtons();
                }, 1000); // Reduced delay for faster insertion
            }
        };
        
        // Check immediately
        tryInsertWrrapdOptions();
        
        // Watch for DOM changes aggressively
        const observer = new MutationObserver(() => {
            if (!hasInserted) {
                tryInsertWrrapdOptions();
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // Also check periodically (every 1 second for faster detection)
        const interval = setInterval(() => {
            if (!hasInserted) {
                tryInsertWrrapdOptions();
            } else {
                clearInterval(interval);
            }
        }, 1000);
        
        // Watch for URL changes (reset flag when URL changes)
        let lastURL = window.location.href;
        const urlCheckInterval = setInterval(() => {
            if (window.location.href !== lastURL) {
                lastURL = window.location.href;
                hasInserted = false; // Reset on URL change to allow re-insertion
                tryInsertWrrapdOptions();
            }
        }, 500);
        
        console.log("[monitorAddGiftOptionsButton] Monitoring active - will insert Wrrapd options when gift interface appears");
    }

    function disablePlaceOrderButtons() {
        console.log("[disablePlaceOrderButtons] Searching for Place your order buttons...");
        
        const findAndDisableButtons = () => {
            // Search for all possible "Place your order" buttons
            const allButtons = document.querySelectorAll('button, input[type="submit"], span[role="button"], input[type="button"], a[role="button"]');
            
            let foundAny = false;
            for (const btn of allButtons) {
                if (!btn || btn.offsetParent === null) continue;
                
                const text = (btn.textContent || btn.value || btn.getAttribute('aria-label') || btn.innerText || '').toLowerCase();
                if (text.includes('place your order') || text.includes('place order')) {
                    console.log("[disablePlaceOrderButtons] ✓ Found and disabling button:", text.substring(0, 50));
                    
                    // Mark button as disabled by Wrrapd
                    btn.setAttribute('data-wrrapd-disabled', 'true');
                    
                    // Disable the button completely
                    if (btn.tagName === 'INPUT' || btn.tagName === 'BUTTON') {
                        btn.disabled = true;
                    }
                    btn.style.pointerEvents = 'none';
                    btn.style.opacity = '0.5';
                    btn.style.cursor = 'not-allowed';
                    btn.setAttribute('aria-disabled', 'true');
                    
                    // Remove all existing event listeners by cloning
                    const newBtn = btn.cloneNode(true);
                    newBtn.disabled = true;
                    newBtn.style.pointerEvents = 'none';
                    newBtn.style.opacity = '0.5';
                    newBtn.style.cursor = 'not-allowed';
                    newBtn.setAttribute('aria-disabled', 'true');
                    newBtn.setAttribute('data-wrrapd-disabled', 'true');
                    btn.parentNode.replaceChild(newBtn, btn);
                    
                    // Create overlay to intercept clicks - this is critical to prevent order placement
                    createOverlayButton(newBtn, (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        console.log("[disablePlaceOrderButtons] Blocked click on Place your order button");
                        return false;
                    });
                    
                    foundAny = true;
                }
            }
            
            return foundAny;
        };
        
        // Try immediately
        if (!findAndDisableButtons()) {
            console.log("[disablePlaceOrderButtons] Buttons not found yet, will retry...");
            // Retry after a short delay
            setTimeout(() => findAndDisableButtons(), 500);
            setTimeout(() => findAndDisableButtons(), 1000);
            setTimeout(() => findAndDisableButtons(), 2000);
        }
    }

    /**
     * Re-enables Amazon's "Place your order" buttons after payment is successful
     */
    function enablePlaceOrderButtons() {
        console.log("[enablePlaceOrderButtons] Re-enabling Place your order buttons...");
        
        const findAndEnableButtons = () => {
            // Search for all possible "Place your order" buttons
            const allButtons = document.querySelectorAll('button, input[type="submit"], span[role="button"], input[type="button"], a[role="button"]');
            
            let foundAny = false;
            for (const btn of allButtons) {
                if (!btn || btn.offsetParent === null) continue;
                
                const text = (btn.textContent || btn.value || btn.getAttribute('aria-label') || btn.innerText || '').toLowerCase();
                if (text.includes('place your order') || text.includes('place order')) {
                    // Check if this button was disabled by Wrrapd
                    const wasWrrapdDisabled = btn.getAttribute('data-wrrapd-disabled') === 'true' || 
                                             btn.closest('[data-wrrapd-disabled="true"]') !== null;
                    
                    if (wasWrrapdDisabled || btn.disabled || btn.style.pointerEvents === 'none') {
                        console.log("[enablePlaceOrderButtons] ✓ Found and re-enabling button:", text.substring(0, 50));
                        
                        // Remove Wrrapd disabled marker
                        btn.removeAttribute('data-wrrapd-disabled');
                        
                        // Re-enable the button
                        if (btn.tagName === 'INPUT' || btn.tagName === 'BUTTON') {
                            btn.disabled = false;
                        }
                        btn.style.pointerEvents = 'auto';
                        btn.style.opacity = '1';
                        btn.style.cursor = 'pointer';
                        btn.removeAttribute('aria-disabled');
                        
                        // Remove any Wrrapd overlays
                        const overlay = btn.parentNode?.querySelector(`[data-wrrapd-overlay-for="${btn.id || 'button'}"]`);
                        if (overlay) {
                            overlay.remove();
                        }
                        
                        // Remove any overlay buttons that might be blocking
                        const overlayButtons = btn.parentNode?.querySelectorAll('button[style*="z-index: 1000"]');
                        if (overlayButtons) {
                            overlayButtons.forEach(ob => ob.remove());
                        }
                        
                        foundAny = true;
                    }
                }
            }
            
            return foundAny;
        };
        
        // Try immediately
        if (!findAndEnableButtons()) {
            console.log("[enablePlaceOrderButtons] Buttons not found yet, will retry...");
            // Retry after a short delay
            setTimeout(() => findAndEnableButtons(), 500);
            setTimeout(() => findAndEnableButtons(), 1000);
            setTimeout(() => findAndEnableButtons(), 2000);
            setTimeout(() => findAndEnableButtons(), 3000);
        }
    }

    function removeNotSelectedTextInGiftOptions(allItems) {
        // Verificar si algún ítem tiene checkbox_wrrapd activado
        const hasWrrapdSelected = Object.values(allItems).some(item => 
            item.options && item.options.some(subItem => subItem.checkbox_wrrapd)
        );

        // Identificar el elemento que contiene el texto
        const element = document.querySelector('#collapsed-gift-options-content-gift-wrap > [data-testid=""]');

        if (element && hasWrrapdSelected) {
            // Cambiar el texto si se cumple la condición
            if (element.innerText === "Gift wrap: Not selected") {
                element.innerText = "Gift wrap selected with Wrrapd";
                console.log("[removeNotSelectedText] Text updated to 'Gift wrap with Wrrapd'.");
            }
        } else {
            console.log("[removeNotSelectedText] No items with Wrrapd selected or element not found.");
        }
    }

    /**
     * Adds delivery date extension notice below Wrrapd items in payment section
     * CRITICAL: Only processes items delivered to Wrrapd address, adds ONE notice per item
     */
    function addDeliveryDateNotice(allItems) {
        console.log("[addDeliveryDateNotice] Checking for delivery dates to add notice...");
        
        // Check if any items have Wrrapd selected
        const hasWrrapdItems = Object.values(allItems).some(item => 
            item.options && item.options.some(opt => opt.checkbox_wrrapd)
        );
        
        if (!hasWrrapdItems) {
            console.log("[addDeliveryDateNotice] No Wrrapd items found. Skipping notice.");
            return;
        }
        
        // Track which items already have notices to prevent duplicates
        const processedItemContainers = new Set();
        
        // Function to check if an item container is a Wrrapd item
        const isWrrapdItem = (container) => {
            const containerText = container.textContent || '';
            
            // Check if delivery recipient is "Wrrapd" - look for multiple patterns
            const hasWrrapdRecipient = containerText.includes('Delivering to Wrrapd') || 
                                     (containerText.includes('Wrrapd') && containerText.includes('PO BOX 26067')) ||
                                     (containerText.includes('Wrrapd') && containerText.includes('32226-6067')) ||
                                     (containerText.includes('Wrrapd') && containerText.includes('JACKSONVILLE')) ||
                                     containerText.includes('Wrrapd PO BOX 26067');
            
            // Also check if it does NOT contain non-Wrrapd recipient names (but be more lenient)
            const hasNonWrrapdRecipient = (containerText.includes('Delivering to') && 
                                         !containerText.includes('Wrrapd') && 
                                         containerText.match(/Delivering to\s+[A-Z][a-z]+/));
            
            const isWrrapd = hasWrrapdRecipient && !hasNonWrrapdRecipient;
            
            if (isWrrapd) {
                console.log(`[isWrrapdItem] ✓ Confirmed Wrrapd item:`, containerText.substring(0, 100));
            }
            
            return isWrrapd;
        };
        
        // Function to add notices to delivery date elements
        const addNoticesToDeliveryDates = () => {
            // First, remove ALL existing notices to start fresh
            const allNotices = document.querySelectorAll('.wrrapd-delivery-notice');
            allNotices.forEach(notice => notice.remove());
            processedItemContainers.clear();
            
            // Find all order item containers
            const orderItemSelectors = [
                '[id^="item-"]',
                '[data-testid*="item"]',
                '.spc-order-item',
                '[class*="order-item"]'
            ];
            
            let orderItems = [];
            for (const selector of orderItemSelectors) {
                orderItems = Array.from(document.querySelectorAll(selector));
                if (orderItems.length > 0) break;
            }
            
            // If no items found with selectors, try broader search
            if (orderItems.length === 0) {
                // Look for sections that contain "Delivering to" text
                const allSections = document.querySelectorAll('div, section');
                orderItems = Array.from(allSections).filter(section => {
                    const text = section.textContent || '';
                    return text.includes('Delivering to') && text.length < 10000;
                });
            }
            
            // CRITICAL: Use actual checkout items count, not potential items
            // Get the actual number of items in checkout using the same logic as filterItemsInCurrentCheckout
            const allItems = getAllItemsFromLocalStorage();
            const itemsInCheckout = filterItemsInCurrentCheckout(allItems);
            const actualItemCount = Object.keys(itemsInCheckout).length;
            
            console.log(`[addDeliveryDateNotice] Found ${orderItems.length} potential order item(s), but actual checkout items: ${actualItemCount}`);
            
            // Process each order item - ONLY process Wrrapd items
            // Limit to actual item count to avoid processing duplicates
            let processedCount = 0;
            orderItems.forEach((itemContainer) => {
                // Stop if we've processed all actual items
                if (processedCount >= actualItemCount) {
                    return;
                }
                // CRITICAL: Only process if this is a Wrrapd item
                if (!isWrrapdItem(itemContainer)) {
                    console.log("[addDeliveryDateNotice] Skipping non-Wrrapd item.");
                    return; // Skip non-Wrrapd items completely
                }
                
                // Check if we already processed this container
                if (processedItemContainers.has(itemContainer)) {
                    return; // Already processed
                }
                
                // Increment processed count for Wrrapd items
                processedCount++;
                
                // Find delivery options section - look for radio buttons with dates
                const radioButtons = Array.from(itemContainer.querySelectorAll('input[type="radio"]'));
                
                if (radioButtons.length > 0) {
                    // Multiple delivery options - find the parent container of all radio buttons
                    const firstRadio = radioButtons[0];
                    let deliveryOptionsContainer = firstRadio.closest('[class*="delivery"], [class*="shipping"], [class*="option"]') ||
                                                   firstRadio.closest('div, fieldset') ||
                                                   firstRadio.parentElement?.parentElement?.parentElement;
                    
                    // If no container found, try to find the container that holds all radio buttons
                    if (!deliveryOptionsContainer || !deliveryOptionsContainer.contains(radioButtons[radioButtons.length - 1])) {
                        // Find common parent of all radio buttons
                        let commonParent = radioButtons[0].parentElement;
                        for (let i = 1; i < radioButtons.length; i++) {
                            while (commonParent && !commonParent.contains(radioButtons[i])) {
                                commonParent = commonParent.parentElement;
                            }
                        }
                        if (commonParent) {
                            deliveryOptionsContainer = commonParent;
                        }
                    }
                    
                    // Also try finding by looking for the container that has all radio buttons and date text
                    if (!deliveryOptionsContainer) {
                        // Look for a parent that contains all radio buttons and has date-related text
                        const allParents = [];
                        radioButtons.forEach(radio => {
                            let parent = radio.parentElement;
                            for (let depth = 0; depth < 10 && parent; depth++) {
                                if (!allParents.includes(parent)) {
                                    allParents.push(parent);
                                }
                                parent = parent.parentElement;
                            }
                        });
                        
                        // Find the parent that contains the most radio buttons and has date text
                        for (const parent of allParents) {
                            const text = parent.textContent || '';
                            if (text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i) ||
                                text.includes('Arriving') || text.includes('Arrives')) {
                                const radiosInParent = parent.querySelectorAll('input[type="radio"]');
                                if (radiosInParent.length === radioButtons.length) {
                                    deliveryOptionsContainer = parent;
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (deliveryOptionsContainer) {
                        // Check if notice already exists in this container or its siblings
                        const existingNotice = deliveryOptionsContainer.querySelector('.wrrapd-delivery-notice') ||
                                             deliveryOptionsContainer.nextElementSibling?.classList.contains('wrrapd-delivery-notice');
                        
                        if (!existingNotice) {
                            // Add ONE notice after the delivery options container
                            const notice = document.createElement('div');
                            notice.className = 'wrrapd-delivery-notice';
                            notice.style.cssText = 'color: #d13212; font-size: 12px; margin-top: 8px; margin-bottom: 8px; font-style: italic; padding-left: 0; line-height: 1.4; display: block;';
                            notice.textContent = 'Note: Delivery date may be extended by one day due to gift-wrapping option.';
                            
                            // Insert after the delivery options container
                            if (deliveryOptionsContainer.nextSibling) {
                                deliveryOptionsContainer.parentNode.insertBefore(notice, deliveryOptionsContainer.nextSibling);
                            } else {
                                deliveryOptionsContainer.parentNode.appendChild(notice);
                            }
                            
                            processedItemContainers.add(itemContainer);
                            console.log(`[addDeliveryDateNotice] ✓ Added single notice to Wrrapd item.`);
                        }
                    } else {
                        console.log(`[addDeliveryDateNotice] Could not find delivery options container for Wrrapd item with ${radioButtons.length} radio buttons.`);
                        // Fallback: try to add notice after the last radio button
                        if (radioButtons.length > 0) {
                            const lastRadio = radioButtons[radioButtons.length - 1];
                            const radioParent = lastRadio.closest('label') || lastRadio.parentElement;
                            if (radioParent && !radioParent.querySelector('.wrrapd-delivery-notice')) {
                                const notice = document.createElement('div');
                                notice.className = 'wrrapd-delivery-notice';
                                notice.style.cssText = 'color: #d13212; font-size: 12px; margin-top: 8px; margin-bottom: 8px; font-style: italic; padding-left: 0; line-height: 1.4; display: block;';
                                notice.textContent = 'Note: Delivery date may be extended by one day due to gift-wrapping option.';
                                
                                if (radioParent.nextSibling) {
                                    radioParent.parentNode.insertBefore(notice, radioParent.nextSibling);
                                } else {
                                    radioParent.parentNode.appendChild(notice);
                                }
                                
                                processedItemContainers.add(itemContainer);
                                console.log(`[addDeliveryDateNotice] ✓ Added notice after last radio button (fallback).`);
                            }
                        }
                    }
                } else {
                    // No radio buttons - look for delivery date text and add one notice
                    const allTextElements = itemContainer.querySelectorAll('*');
                    let deliveryDateElement = null;
                    
                    for (const el of allTextElements) {
                        const text = el.textContent || '';
                        if ((text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i) ||
                             text.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i) ||
                             text.includes('Arriving')) && text.length < 200) {
                            deliveryDateElement = el;
                            break;
                        }
                    }
                    
                    if (deliveryDateElement) {
                        // Find the best parent container for the notice
                        const targetContainer = deliveryDateElement.closest('[class*="delivery"], [class*="shipping"], [class*="option"]') ||
                                              deliveryDateElement.parentElement?.parentElement ||
                                              deliveryDateElement.parentElement;
                        
                        if (targetContainer && !targetContainer.querySelector('.wrrapd-delivery-notice')) {
                            const notice = document.createElement('div');
                            notice.className = 'wrrapd-delivery-notice';
                            notice.style.cssText = 'color: #d13212; font-size: 12px; margin-top: 8px; margin-bottom: 8px; font-style: italic; padding-left: 0; line-height: 1.4; display: block;';
                            notice.textContent = 'Note: Delivery date may be extended by one day due to gift-wrapping option.';
                            
                            // Insert after target container
                            if (targetContainer.nextSibling) {
                                targetContainer.parentNode.insertBefore(notice, targetContainer.nextSibling);
                            } else {
                                targetContainer.parentNode.appendChild(notice);
                            }
                            
                            processedItemContainers.add(itemContainer);
                            console.log(`[addDeliveryDateNotice] ✓ Added single notice to Wrrapd item.`);
                        }
                    }
                }
            });
        };
        
        // Try multiple times with delays to catch dynamically loaded content
        setTimeout(() => addNoticesToDeliveryDates(), 500);
        setTimeout(() => addNoticesToDeliveryDates(), 1500);
        setTimeout(() => addNoticesToDeliveryDates(), 3000);
        
        // Also use MutationObserver to catch dynamically loaded delivery dates
        const observer = new MutationObserver(() => {
            addNoticesToDeliveryDates();
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // Stop observing after 20 seconds
        setTimeout(() => {
            observer.disconnect();
        }, 20000);
    }

    // ----------------------------------------------------- WRRAPD SUMMARY -----------------------------------------------------

    // Check if Wrrapd is selected for any item and create the summary section
    
    function checkIfWrrapdSelected(allItems) {
        console.log("[checkIfWrrapdSelected] Checking if Wrrapd is selected for any item in CURRENT checkout.");

        // CRITICAL: Only check items that are actually on the current checkout page
        // Filter out items from localStorage that aren't in this checkout
        const itemsInCurrentCheckout = filterItemsInCurrentCheckout(allItems);
        
        if (Object.keys(itemsInCurrentCheckout).length === 0) {
            console.log("[checkIfWrrapdSelected] No items from current checkout found. Not showing Wrrapd summary.");
            // Remove any existing Wrrapd summary if items aren't in current checkout
            const existingSummary = document.querySelector('#wrrapd-summary');
            if (existingSummary) {
                existingSummary.remove();
                console.log("[checkIfWrrapdSelected] Removed Wrrapd summary - no Wrrapd items in current checkout.");
            }
            return;
        }

        const wrrapdSelected = Object.values(itemsInCurrentCheckout).some(item => {
            // Changed subItems to options to match current data structure
            return item.options && item.options.some(subItem => subItem.checkbox_wrrapd);
        });

        if (wrrapdSelected) {
            console.log("[checkIfWrrapdSelected] Wrrapd selected for at least one item in current checkout.");
            createWrrapdSummary();
        }
        else {
            console.log("[checkIfWrrapdSelected] Wrrapd not selected for any item in current checkout.");
            // Remove any existing Wrrapd summary if no Wrrapd items
            const existingSummary = document.querySelector('#wrrapd-summary');
            if (existingSummary) {
                existingSummary.remove();
                console.log("[checkIfWrrapdSelected] Removed Wrrapd summary - no Wrrapd items selected.");
            }
        }
    }

    /**
     * Filters items from localStorage to only include those actually on the current checkout page
     */
    function filterItemsInCurrentCheckout(allItems) {
        console.log("[filterItemsInCurrentCheckout] Filtering items to only include those in current checkout...");
        
        const itemsInCheckout = {};
        const currentURL = window.location.href;
        const isPaymentPage = currentURL.includes('/spc') || currentURL.includes('payselect');
        
        // On payment page, be more lenient - check if items have Wrrapd selected
        // On other pages, check if items appear on the page
        if (isPaymentPage) {
            console.log("[filterItemsInCurrentCheckout] Payment page detected - using Wrrapd selection as filter criteria");
            // On payment page, include items that have Wrrapd selected
            for (const [title, item] of Object.entries(allItems)) {
                if (item.options && item.options.some(opt => opt.checkbox_wrrapd)) {
                    itemsInCheckout[title] = item;
                    console.log(`[filterItemsInCurrentCheckout] Item "${title.substring(0, 40)}..." has Wrrapd selected - including in checkout.`);
                } else {
                    console.log(`[filterItemsInCurrentCheckout] Item "${title.substring(0, 40)}..." does not have Wrrapd selected - filtering out.`);
                }
            }
        } else {
            // On other pages (gift options, address selection), check if item appears on page
            const pageText = document.body.textContent || '';
            
            for (const [title, item] of Object.entries(allItems)) {
                // Use ASIN if available, otherwise use title
                const searchKey = item.asin || title;
                
                // Check if this item appears on the current page
                // Look for ASIN in page, or title substring
                const titleSubstring = title.substring(0, 50); // Use first 50 chars for matching
                const asinInPage = item.asin && pageText.includes(item.asin);
                const titleInPage = pageText.includes(titleSubstring);
                
                if (asinInPage || titleInPage) {
                    itemsInCheckout[title] = item;
                    console.log(`[filterItemsInCurrentCheckout] Item "${title.substring(0, 40)}..." found in current checkout.`);
                } else {
                    console.log(`[filterItemsInCurrentCheckout] Item "${title.substring(0, 40)}..." NOT in current checkout - filtering out.`);
                }
            }
        }
        
        console.log(`[filterItemsInCurrentCheckout] Found ${Object.keys(itemsInCheckout).length} items in current checkout out of ${Object.keys(allItems).length} total items.`);
        return itemsInCheckout;
    }

    function splitStreetForIngest(rawStreet) {
        if (!rawStreet || typeof rawStreet !== 'string') return { line1: '', line2: '' };
        const parts = rawStreet.split(',').map((x) => x.trim()).filter(Boolean);
        return {
            line1: parts[0] || rawStreet.trim(),
            line2: parts.slice(1).join(', '),
        };
    }

    function readAmazonDeliveryHintsFromSessionStorage() {
        try {
            const raw = sessionStorage.getItem('wrrapd-amazon-delivery-hints-v1');
            if (!raw) return null;
            const j = JSON.parse(raw);
            if (!j || typeof j !== 'object') return null;
            return j;
        } catch (e) {
            return null;
        }
    }

    /**
     * Same shape as the array sent to process-payment (Wrrapd line items only).
     */
    function buildWrrapdOrderDataFromLocalStorage() {
        const rawItems = localStorage.getItem('wrrapd-items');
        const orderData = [];
        if (!rawItems) return orderData;
        try {
            const parsedItems = JSON.parse(rawItems);
            if (!parsedItems || typeof parsedItems !== 'object') return orderData;
            const itemList = Array.isArray(parsedItems) ? parsedItems : Object.values(parsedItems);
            itemList.forEach((item) => {
                if (!item || !item.options) return;
                item.options.forEach((option) => {
                    const wrapVal = String(option.selected_wrapping_option || '').toLowerCase();
                    const isOurWrappingChoice =
                        wrapVal === 'wrrapd' || wrapVal === 'ai' || wrapVal === 'upload';
                    const hasDesignData =
                        !!option.selected_ai_design ||
                        !!option.uploaded_design_path ||
                        !!option.file_data_url ||
                        option.checkbox_flowers === true;
                    const isWrrapdLike =
                        option &&
                        (option.checkbox_wrrapd === true || (hasDesignData && isOurWrappingChoice));
                    if (!isWrrapdLike) return;
                    let deliveryInstructions = null;
                    try {
                        deliveryInstructions = JSON.parse(localStorage.getItem('wrrapd-delivery-instructions'));
                    } catch (err) {
                        console.error('[buildWrrapdOrderDataFromLocalStorage] delivery instructions:', err);
                    }
                    let aiImageData = null;
                    if (option.selected_wrapping_option === 'ai' && option.selected_ai_design) {
                        try {
                            const aiDesignData = option.selected_ai_design;
                            if (typeof aiDesignData === 'string') aiImageData = aiDesignData;
                            else if (aiDesignData && aiDesignData.imageData) aiImageData = aiDesignData.imageData;
                            else if (aiDesignData && aiDesignData.url) aiImageData = aiDesignData.url;
                        } catch (e) {
                            console.error('[buildWrrapdOrderDataFromLocalStorage] AI image:', e);
                        }
                    }
                    let finalShippingAddress = null;
                    try {
                        const defaultAddressData = localStorage.getItem('wrrapd-default-address');
                        if (defaultAddressData) finalShippingAddress = JSON.parse(defaultAddressData);
                    } catch (e) {
                        console.error('[buildWrrapdOrderDataFromLocalStorage] final address:', e);
                    }
                    orderData.push({
                        asin: item.asin,
                        title: item.title,
                        imageUrl: item.imageUrl || null,
                        checkbox_wrrapd: option.checkbox_wrrapd === true,
                        checkbox_flowers: option.checkbox_flowers,
                        selected_flower_design: option.selected_flower_design || null,
                        selected_wrapping_option: option.selected_wrapping_option,
                        selected_ai_design: option.selected_ai_design || null,
                        aiImageData,
                        uploaded_design_path: option.uploaded_design_path || null,
                        occasion: option.occasion || null,
                        shippingAddress: option.shippingAddress,
                        finalShippingAddress,
                        deliveryInstructions,
                        giftMessage: option.giftMessage || null,
                        senderName: option.senderName || null,
                        amazonDeliveryDate: option.amazonDeliveryDate || item.amazonDeliveryDate || null,
                        deliveryDate: option.deliveryDate || item.deliveryDate || null,
                        estimatedDeliveryDate: option.estimatedDeliveryDate || item.estimatedDeliveryDate || null,
                        arrivalDate: option.arrivalDate || item.arrivalDate || null,
                        shippingDate: option.shippingDate || item.shippingDate || null,
                    });
                });
            });
        } catch (error) {
            console.error('[buildWrrapdOrderDataFromLocalStorage] parse error:', error);
        }
        return orderData;
    }

    async function runStagingTrackingIngestSimulatePlaceOrder() {
        if (localStorage.getItem('wrrapd-payment-status') !== 'success') {
            console.warn('[Wrrapd staging ingest] Complete Pay Wrrapd first.');
            return;
        }
        const customerEmail = localStorage.getItem('wrrapd-checkout-customer-email');
        const customerPhone = localStorage.getItem('wrrapd-checkout-customer-phone');
        let billingDetails = null;
        try {
            billingDetails = JSON.parse(localStorage.getItem('wrrapd-checkout-billing') || 'null');
        } catch (_) {
            billingDetails = null;
        }
        if (!customerEmail || !customerPhone) {
            console.warn(
                '[Wrrapd staging ingest] Missing checkout email/phone after pay — complete Pay Wrrapd again.',
            );
            return;
        }
        const orderData = buildWrrapdOrderDataFromLocalStorage();
        if (!orderData.length) {
            console.warn('[Wrrapd staging ingest] No Wrrapd line items in wrrapd-items.');
            return;
        }
        const hints = readAmazonDeliveryHintsFromSessionStorage();
        const orderNumber = localStorage.getItem('wrrapd-order-number') || 'unknown';
        const gifterFromCheckout = (localStorage.getItem('wrrapd-checkout-gifter-full-name') || '').trim();
        const customerName =
            gifterFromCheckout ||
            (billingDetails && billingDetails.name) ||
            (customerEmail && customerEmail.split('@')[0]) ||
            'Customer';

        const orders = [];
        for (let i = 0; i < orderData.length; i++) {
            const item = orderData[i];
            const finalAddr = item.finalShippingAddress || item.shippingAddress || {};
            const streetParts = splitStreetForIngest(finalAddr.street || '');
            const recipientName = finalAddr.name || customerName;
            const greet = localStorage.getItem('wrrapd-deliver-to-greeting');
            const payload = {
                customerName,
                customerPhone,
                customerEmail,
                ...(greet && greet.trim() ? { greetingFirstName: greet.trim() } : {}),
                recipientName,
                addressLine1: streetParts.line1 || finalAddr.line1 || 'N/A',
                addressLine2: streetParts.line2 || finalAddr.line2 || '',
                city: finalAddr.city || 'N/A',
                state: finalAddr.state || 'N/A',
                postalCode: finalAddr.postalCode || finalAddr.postal_code || '00000',
                externalOrderId: `${orderNumber}-${String(i + 1).padStart(2, '0')}`,
                sourceNote: `Staging simulate Place order — ${orderNumber} item ${i + 1}; Amazon delivery hints from checkout`,
            };
            if (hints && Array.isArray(hints.amazonDeliveryDays) && hints.amazonDeliveryDays.length > 0) {
                payload.amazonDeliveryDays = hints.amazonDeliveryDays;
                payload.wrrapdAmazonGrouping = hints.wrrapdAmazonGrouping || 'pending';
            } else {
                payload.amazonDeliveryDay = new Date().toLocaleDateString('en-CA', {
                    timeZone: 'America/New_York',
                });
            }
            orders.push(payload);
        }

        try {
            const resp = await fetch('https://api.wrrapd.com/api/proxy-tracking-ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orders }),
            });
            const text = await resp.text();
            let data = null;
            try {
                data = JSON.parse(text);
            } catch (_) {
                /* not JSON */
            }
            if (!resp.ok) {
                console.error(
                    '[Wrrapd staging ingest] api.wrrapd.com error',
                    resp.status,
                    text ? text.substring(0, 800) : '',
                );
                return;
            }
            if (data && Array.isArray(data.results)) {
                const failed = data.results.filter((r) => !r.ok);
                if (failed.length) {
                    const lines = failed.map((r) => `Line ${(r.index || 0) + 1}: ${r.reason || 'failed'}`);
                    console.error('[Wrrapd staging ingest] Partial failure:', lines.join(' | '));
                    return;
                }
                data.results.forEach((r, idx) => {
                    if (r.notify) {
                        console.info('[Wrrapd staging ingest] notify line', idx + 1, r.notify);
                    }
                });
                const notifyBits = data.results
                    .map((r, idx) => {
                        const n = r.notify;
                        if (!n || !n.message) return '';
                        return `Order ${idx + 1}: ${n.message}`;
                    })
                    .filter(Boolean);
                console.info('[Wrrapd staging ingest] OK —', data.results.length, 'line(s).');
                return;
            }
            if (data && data.ok) {
                console.info('[Wrrapd staging ingest] OK (legacy body) —', orders.length, 'line item(s).');
                return;
            }
            console.error('[Wrrapd staging ingest] Unexpected JSON from api.wrrapd.com');
        } catch (e) {
            console.error(
                '[Wrrapd staging ingest] Network error:',
                e && e.message ? e.message : String(e),
            );
        }
    }

    function createWrrapdSummary() {
        console.log("[createWrrapdSummary] Attempting to create Wrrapd summary section.");
    
        // Check if the Wrrapd summary already exists
        if (document.querySelector('#wrrapd-summary')) {
            console.log("[createWrrapdSummary] Wrrapd summary already exists. Skipping creation.");
            return;
        }
    
        // Locate the order summary container - SPC (Smart Place Order) checkout pipeline
        // The order summary is typically in the right column of the checkout page
        const findOrderSummary = () => {
            // Try the standard SPC order summary selector
            let orderSummary = document.querySelector('#spc-order-summary');
            
            // If not found, look for the right column container
        if (!orderSummary) {
                const rightColumn = document.querySelector('#checkout-experience-right-column');
                if (rightColumn) {
                    // Look for order summary within right column
                    orderSummary = rightColumn.querySelector('#spc-order-summary, [id*="order-summary"], .spc-order-summary');
                }
            }
            
            // Try finding by data attributes
        if (!orderSummary) {
                orderSummary = document.querySelector('[data-testid="order-summary"]');
            }
            
            // Try finding any element with "order" and "summary" in id or class
            if (!orderSummary) {
                const candidates = document.querySelectorAll('[id*="order"], [class*="order"]');
                for (const candidate of candidates) {
                    const id = (candidate.id || '').toLowerCase();
                    const classes = (candidate.className || '').toLowerCase();
                    if ((id.includes('summary') || classes.includes('summary')) && 
                        (id.includes('spc') || classes.includes('spc'))) {
                        orderSummary = candidate;
                        break;
                    }
                }
            }
            
            // Last resort: find the right column and use it as container
            if (!orderSummary) {
                const rightColumn = document.querySelector('#checkout-experience-right-column');
                if (rightColumn) {
                    console.log("[createWrrapdSummary] Using right column as container");
                    return rightColumn;
                }
            }
            
            return orderSummary;
        };
        
        let orderSummary = findOrderSummary();
        
        if (!orderSummary) {
            console.error("[createWrrapdSummary] ✗ Order summary container not found. Cannot create summary.");
            return;
        }
        
        console.log("[createWrrapdSummary] ✓ Found order summary container:", orderSummary.id || orderSummary.className);
    
        // Check if the Wrrapd summary already exists
        if (document.querySelector('#wrrapd-summary')) {
            console.log("[createWrrapdSummary] Wrrapd summary already exists. Skipping creation.");
            return;
        }
    
        console.log("[createWrrapdSummary] Creating new Wrrapd summary section.");
    
        // Match Amazon's order summary container structure exactly
        // Find Amazon's inner summary container to match its exact structure
        let amazonInnerContainer = orderSummary.querySelector('.a-box, .a-box-inner, [class*="a-box"]');
        if (!amazonInnerContainer && orderSummary) {
            // If no inner container found, use the order summary itself
            amazonInnerContainer = orderSummary;
        }
        
        // Get computed styles from Amazon's inner container
        let amazonInnerStyles = {};
        let amazonOuterStyles = {};
        if (amazonInnerContainer) {
            const innerComputed = window.getComputedStyle(amazonInnerContainer);
            amazonInnerStyles = {
                paddingLeft: innerComputed.paddingLeft,
                paddingRight: innerComputed.paddingRight,
                paddingTop: innerComputed.paddingTop,
                paddingBottom: innerComputed.paddingBottom
            };
        }
        if (orderSummary) {
            const outerComputed = window.getComputedStyle(orderSummary);
            amazonOuterStyles = {
                marginLeft: outerComputed.marginLeft,
                marginRight: outerComputed.marginRight,
                marginTop: outerComputed.marginTop,
                marginBottom: outerComputed.marginBottom
            };
        }
    
        const wrrapdSummary = document.createElement('div');
        wrrapdSummary.id = 'wrrapd-summary';
        // Use the same classes as Amazon's order summary container
        wrrapdSummary.className = 'a-row a-spacing-base wrrapd-checkout-summary-addon';
        
        // Match Amazon's outer margins exactly
        if (amazonOuterStyles.marginTop) wrrapdSummary.style.marginTop = amazonOuterStyles.marginTop;
        if (amazonOuterStyles.marginBottom) wrrapdSummary.style.marginBottom = amazonOuterStyles.marginBottom;
        if (amazonOuterStyles.marginLeft) wrrapdSummary.style.marginLeft = amazonOuterStyles.marginLeft;
        if (amazonOuterStyles.marginRight) wrrapdSummary.style.marginRight = amazonOuterStyles.marginRight;
    
        const paymentStatus = localStorage.getItem('wrrapd-payment-status');
    
        // Create the HTML structure based on payment status
        // Match Amazon's structure exactly - use same inner container structure
        // Build style string for inner container to match Amazon's padding exactly
        const innerStyle = [
            amazonInnerStyles.paddingLeft ? `padding-left: ${amazonInnerStyles.paddingLeft};` : '',
            amazonInnerStyles.paddingRight ? `padding-right: ${amazonInnerStyles.paddingRight};` : '',
            amazonInnerStyles.paddingTop ? `padding-top: ${amazonInnerStyles.paddingTop};` : '',
            amazonInnerStyles.paddingBottom ? `padding-bottom: ${amazonInnerStyles.paddingBottom};` : ''
        ].filter(s => s).join(' ');
        
        // Remove border by using a-box-inner or matching Amazon's exact structure
        // Check what Amazon's summary uses - likely a-box-inner without border
        const amazonBoxInner = orderSummary.querySelector('.a-box-inner');
        let boxClass = 'a-box-inner';
        if (!amazonBoxInner) {
            boxClass = 'a-box a-box-normal';
        }
        
        // Alignment is handled by ensureWrrapdSummaryAlignment() common function after creation
        
        if (paymentStatus === 'success') {
            wrrapdSummary.innerHTML = `
                <div class="${boxClass}" style="${innerStyle}; border: none; box-shadow: none;">
                    <h3 class="a-spacing-small" style="margin-top: 0;">Wrrapd Summary</h3>
                    <div id="wrrapd-summary-items" style="font-size: 12px;">
                        <!-- Line items will be inserted here -->
                    </div>
                    <hr class="a-spacing-none a-divider-normal">
                    <div id="wrrapd-summary-total" class="a-row a-spacing-small a-spacing-top-small">
                        <!-- Total will be inserted here -->
                    </div>
                    <hr class="a-spacing-mini a-divider-normal">
                    <div id="wrrapd-payment-info" class="a-row a-spacing-small a-spacing-top-small">
                        <div style="color: green; font-weight: bold; font-size: 16px;">Payment successful. Please place order with Amazon now.</div>
                    </div>
                    <button type="button" id="wrrapd-staging-place-order-btn" class="wrrapd-staging-tracking-only-btn" style="box-sizing:border-box;background:#0d3d2e;color:#e8fff4;font-weight:700;margin-top:10px;width:100%;height:40px;border-radius:8px;border:2px solid #1a9966;cursor:pointer;">Send cart to Wrrapd tracking only — does not order on Amazon</button>
                </div>
            `;
        } else {
            // Default state (payment not yet made)
            wrrapdSummary.innerHTML = `
                <div class="${boxClass}" style="${innerStyle}; border: none; box-shadow: none;">
                    <h3 class="a-spacing-small" style="margin-top: 0;">Wrrapd Summary</h3>
                    <div id="wrrapd-summary-items" style="font-size: 12px;">
                        <!-- Line items will be inserted here -->
                    </div>
                    <hr class="a-spacing-none a-divider-normal">
                    <div id="wrrapd-summary-total" class="a-row a-spacing-small a-spacing-top-small">
                        <!-- Total will be inserted here -->
                    </div>
                    <hr class="a-spacing-mini a-divider-normal">
                    <div id="wrrapd-payment-info" class="a-row a-spacing-small a-spacing-top-small">
                    </div>
                    <button id="pay-wrrapd-btn" class="a-button-primary" style="background-color: #f0c14b; color: black; font-weight: bold; margin-top: 10px; width: 100%; height: 40px; border-radius: 8px;">Pay Wrrapd</button>
                    <button type="button" id="wrrapd-staging-place-order-btn" disabled aria-disabled="true" class="wrrapd-staging-tracking-only-btn" style="box-sizing:border-box;background:#3d3d3d;color:#aaa;font-weight:700;margin-top:8px;width:100%;height:40px;border-radius:8px;border:2px solid #666;cursor:not-allowed;opacity:0.85;">Send cart to Wrrapd tracking only — pay Wrrapd first</button>
                </div>
            `;
        }
    
        // Insert the Wrrapd summary into the order summary area
        // Insert after the order summary container
        if (orderSummary.parentNode) {
        orderSummary.parentNode.insertBefore(wrrapdSummary, orderSummary.nextSibling);
            console.log("[createWrrapdSummary] ✓ Wrrapd summary inserted after order summary");
        } else {
            // Fallback: append to order summary itself
            orderSummary.appendChild(wrrapdSummary);
            console.log("[createWrrapdSummary] ✓ Wrrapd summary appended to order summary");
        }
        
        // If we used the right column, append to the end
        if (orderSummary.id === 'checkout-experience-right-column') {
            // Remove from previous location if it was inserted
            if (wrrapdSummary.parentNode) {
                wrrapdSummary.parentNode.removeChild(wrrapdSummary);
            }
            orderSummary.appendChild(wrrapdSummary);
            console.log("[createWrrapdSummary] ✓ Wrrapd summary appended to right column");
        }
        
        total = updateWrrapdSummary();
        
        // CRITICAL: Ensure summary alignment matches Amazon (common function)
        ensureWrrapdSummaryAlignment();

        wrrapdClearManualAddressTapsRequirement();
        
        // Remove loading screen now that payment summary is ready
        removeLoadingScreen();
        localStorage.removeItem('wrrapd-keep-loading-until-summary');
        console.log("[createWrrapdSummary] Payment summary created successfully - loading screen removed.");

        if (paymentStatus !== 'success') {
            // Buttons are already disabled by disablePlaceOrderButtons() in paymentSection()
            // Just ensure they're still disabled (in case page reloaded or buttons were recreated)
            disablePlaceOrderButtons();

            // Initialize pay button logic
            document.getElementById('pay-wrrapd-btn').addEventListener('click', async function () {
                console.log("[createWrrapdSummary] 'Pay Wrrapd' button clicked. Initiating payment.");

                if (!total || total <= 0) {
                    alert('Invalid total amount. Please check your order.');
                    return;
                }

                try {
                    const addressData = localStorage.getItem('wrrapd-default-address');
                    if (!addressData) {
                        alert('Default address information is missing. Please set your address before proceeding.');
                        return;
                    }

                    const addressObject = JSON.parse(addressData);

                    function getGifteeIntendedFromLocalStorage() {
                        try {
                            const raw = localStorage.getItem('wrrapd-giftee-intended-address');
                            if (raw) return JSON.parse(raw);
                        } catch (e) {}
                        return null;
                    }

                    function getGifteeFromItemsFallback() {
                        try {
                            const allItems = JSON.parse(localStorage.getItem('wrrapd-items') || '{}');
                            for (const productKey of Object.keys(allItems)) {
                                const productObj = allItems[productKey];
                                if (!productObj || !productObj.options) continue;
                                for (const subItem of productObj.options) {
                                    const sa = subItem.shippingAddress;
                                    if (sa && !isLikelyWrrapdWarehouseAddress(sa)) {
                                        return {
                                            name: sa.name,
                                            street: sa.street,
                                            city: sa.city,
                                            state: sa.state,
                                            postalCode: sa.postalCode,
                                            country: sa.country
                                        };
                                    }
                                }
                            }
                        } catch (e) {}
                        return null;
                    }

                    let gifteeOriginalAddress =
                        getGifteeIntendedFromLocalStorage() || getGifteeFromItemsFallback();
                    if (!gifteeOriginalAddress && !isLikelyWrrapdWarehouseAddress(addressObject)) {
                        gifteeOriginalAddress = {
                            name: addressObject.name,
                            street: addressObject.street,
                            city: addressObject.city,
                            state: addressObject.state,
                            postalCode: addressObject.postalCode,
                            country: addressObject.country
                        };
                    }
                    if (!gifteeOriginalAddress) {
                        gifteeOriginalAddress = {
                            name: addressObject.name || '',
                            street: addressObject.street || '',
                            city: addressObject.city || '',
                            state: addressObject.state || '',
                            postalCode: addressObject.postalCode || '',
                            country: addressObject.country || 'United States'
                        };
                    }
                    
                    // Get ZIP code for the order number
                    let zipCode = "00000";
                    if (addressObject && addressObject.postalCode) {
                        zipCode = addressObject.postalCode;
                    }

                    // Generate the order number
                    const orderNumber = generateOrderNumber(zipCode);
                    
                    // Store the order number for later use
                    localStorage.setItem('wrrapd-order-number', orderNumber);
                    
                    // ====================================================================================
                    // STRIPE WINDOW REQUIREMENTS (pay.wrrapd.com/checkout page):
                    // ====================================================================================
                    // The Stripe payment window at https://pay.wrrapd.com/checkout needs these changes:
                    //
                    // 1. Change "Billing address" label to "Final shipping address"
                    // 2. Pre-fill the "Final shipping address" section with payload.address (default Amazon address)
                    // 3. Add a checkbox BELOW the "Final shipping address" section that reads:
                    //    "Billing address same as Final shipping address" (checked by default)
                    // 4. If checkbox is UNCHECKED, show an identical address form below for billing address
                    //    (same format, fields, fonts, spacing as the Final shipping address section)
                    // 5. The billing address form should be hidden by default (only shown when checkbox unchecked)
                    //
                    // The payload.address contains the default Amazon address object with:
                    // { name, street, city, state, postalCode, country, phone }
                    // payload.gifteeOriginalAddress: intended recipient (before Wrrapd warehouse) for checkout UI.
                    // ====================================================================================
                    const payload = {
                        total: Math.round((total * 100).toFixed(2)),
                        address: addressObject, // Current/default Amazon address (often Wrrapd warehouse when selected)
                        gifteeOriginalAddress: gifteeOriginalAddress,
                        orderNumber: orderNumber // Add order number to payload
                    };

                    const encodedPayload = btoa(JSON.stringify(payload));
                    let paymentUrl = `https://pay.wrrapd.com/checkout?data=${encodedPayload}`;
                    try {
                        if (localStorage.getItem('wrrapd-checkout-debug') === '1') {
                            paymentUrl += '&wrrapdDebug=1';
                        }
                    } catch (e) { /* ignore */ }

                    const popupWidth = 480;
                    const popupHeight = 820;
                    const screenX = window.screenX !== undefined ? window.screenX : window.screenLeft;
                    const screenY = window.screenY !== undefined ? window.screenY : window.screenTop;
                    const windowWidth = window.innerWidth;
                    const windowHeight = window.innerHeight;

                    const popupLeft = screenX + (windowWidth - popupWidth) / 2;
                    const popupTop = screenY + (windowHeight - popupHeight) / 2;

                    const popup = window.open(
                        paymentUrl,
                        'Wrrapd Payment',
                        `width=${popupWidth},height=${popupHeight},left=${popupLeft},top=${popupTop},scrollbars=yes,resizable=yes`
                    );

                    if (!popup) {
                        alert('Please allow popups for this website to complete the payment.');
                        return;
                    }

                    popup.focus();

                    // Listen for messages from the popup (guard against duplicate callbacks)
                    let hasProcessedPaymentMessage = false;
                    window.addEventListener('message', async (event) => {
                        if (!event || event.source !== popup) return;
                        if (event.origin !== 'https://pay.wrrapd.com') return;
                        if (!event.data || event.data.status !== 'success') return;
                        if (hasProcessedPaymentMessage) {
                            console.log('[Payment] Duplicate success message ignored.');
                            return;
                        }
                        hasProcessedPaymentMessage = true;

                        const paymentIntentId = event.data.paymentIntentId;
                        const customerEmail = event.data.customerEmail;
                        const customerPhone = event.data.customerPhone;
                        const billingDetails = event.data.billingDetails || null;
                        const gifterFullName =
                            typeof event.data.gifterFullName === 'string'
                                ? event.data.gifterFullName.trim()
                                : '';

                            try {
                                if (customerEmail) {
                                    localStorage.setItem('wrrapd-checkout-customer-email', customerEmail);
                                }
                                if (customerPhone) {
                                    localStorage.setItem('wrrapd-checkout-customer-phone', customerPhone);
                                }
                                localStorage.setItem('wrrapd-checkout-billing', JSON.stringify(billingDetails));
                                if (gifterFullName) {
                                    localStorage.setItem('wrrapd-checkout-gifter-full-name', gifterFullName);
                                }
                            } catch (e) {
                                console.warn('[Payment] Could not persist checkout contact for staging ingest:', e);
                            }

                            // Remove the overlay buttons
                            const overlayButtons = document.querySelectorAll('button[style*="z-index: 1000"]');
                            overlayButtons.forEach((btn) => btn.remove());

                            // Remove all warning messages
                            const warningMessages = document.querySelectorAll('.wrrapd-warning');
                            warningMessages.forEach((warning) => warning.remove());
                            
                            // Restore the original Amazon buttons - try multiple selectors
                            let topAmazonButton = document.querySelector('span#submitOrderButtonId');
                            let bottomAmazonButton = document.querySelector('span#bottomSubmitOrderButtonId');
                            
                            // Try alternative selectors for new checkout flow
                            if (!topAmazonButton) {
                                topAmazonButton = document.querySelector('input[name="placeYourOrder1"]');
                            }
                            if (!topAmazonButton) {
                                topAmazonButton = document.querySelector('button[aria-labelledby*="submitOrderButtonId"]');
                            }
                            if (!topAmazonButton) {
                                // Try finding by text content
                                const allButtons = document.querySelectorAll('button, input[type="submit"], span[role="button"]');
                                topAmazonButton = Array.from(allButtons).find(btn => {
                                    const text = (btn.textContent || btn.value || btn.getAttribute('aria-label') || '').toLowerCase();
                                    return text.includes('place your order') && btn.offsetParent !== null;
                                });
                            }
                            
                            if (!bottomAmazonButton) {
                                bottomAmazonButton = document.querySelector('input[name="placeYourOrder2"]');
                            }
                            if (!bottomAmazonButton) {
                                bottomAmazonButton = document.querySelector('button[aria-labelledby*="bottomSubmitOrderButtonId"]');
                            }
                            
                            // Re-enable all Place your order buttons
                            enablePlaceOrderButtons();
                            
                            // Also try to re-enable the specific buttons found
                            if (topAmazonButton) {
                                topAmazonButton.disabled = false;
                                topAmazonButton.style.pointerEvents = 'auto';
                                topAmazonButton.style.opacity = '1';
                                topAmazonButton.style.cursor = 'pointer';
                                topAmazonButton.removeAttribute('aria-disabled');
                                topAmazonButton.removeAttribute('data-wrrapd-disabled');
                            }
                            
                            if (bottomAmazonButton) {
                                bottomAmazonButton.disabled = false;
                                bottomAmazonButton.style.pointerEvents = 'auto';
                                bottomAmazonButton.style.opacity = '1';
                                bottomAmazonButton.style.cursor = 'pointer';
                                bottomAmazonButton.removeAttribute('aria-disabled');
                                bottomAmazonButton.removeAttribute('data-wrrapd-disabled');
                            }

                            // Show success message (only if it doesn't already exist)
                            const paymentInfoContainer = document.querySelector('#wrrapd-payment-info');
                            if (paymentInfoContainer) {
                                // Check if success message already exists
                                const existingSuccessMsg = paymentInfoContainer.querySelector('div[style*="color: green"]');
                                if (!existingSuccessMsg) {
                                    const paymentInfo = document.createElement('div');
                                    paymentInfo.style.color = 'green';
                                    paymentInfo.style.fontWeight = 'bold';
                                    paymentInfo.style.fontSize = '16px';
                                    paymentInfo.textContent = 'Payment successful. Please place order with Amazon now.';
                                    paymentInfoContainer.appendChild(paymentInfo);
                                }
                            }

                            // Remove the pay button
                            const payButton = document.getElementById('pay-wrrapd-btn');
                            if (payButton) {
                                payButton.remove();
                            }

                            const stagingPyo = document.getElementById('wrrapd-staging-place-order-btn');
                            if (stagingPyo) {
                                stagingPyo.disabled = false;
                                stagingPyo.removeAttribute('aria-disabled');
                                stagingPyo.style.boxSizing = 'border-box';
                                stagingPyo.style.cursor = 'pointer';
                                stagingPyo.style.opacity = '1';
                                stagingPyo.style.background = '#0d3d2e';
                                stagingPyo.style.color = '#e8fff4';
                                stagingPyo.style.fontWeight = '700';
                                stagingPyo.style.border = '2px solid #1a9966';
                                stagingPyo.textContent =
                                    'Send cart to Wrrapd tracking only — does not order on Amazon';
                            }

                            // Store payment status in localStorage
                            localStorage.setItem('wrrapd-payment-status', 'success');

                            // Same rows as staging ingest: only true Wrrapd selections (not Amazon gift-bag-only lines).
                            const orderData = buildWrrapdOrderDataFromLocalStorage();

                            console.log('Order Data:', orderData);
                            if (!orderData.length) {
                                console.warn('[Order Data] No items found from localStorage wrrapd-items; backend will apply normalization fallback if possible.');
                            }

                            // Send paymentIntentId and orderData to backend
                            try {
                                // Retrieve the previously generated order number
                                let orderNumber = localStorage.getItem('wrrapd-order-number');
                                
                                // If for some reason we don't have an order number, generate a new one
                                if (!orderNumber) {
                                    // Get ZIP code from the shipping address
                                    let zipCode = "00000";
                                    if (orderData.length > 0 && orderData[0].shippingAddress && orderData[0].shippingAddress.postalCode) {
                                        zipCode = orderData[0].shippingAddress.postalCode;
                                    }
                                    
                                    // Generate a new order number
                                    orderNumber = generateOrderNumber(zipCode);
                                    localStorage.setItem('wrrapd-order-number', orderNumber);
                                }
                                
                                // Upload any pending files to GCS with ordernumber-asin-index filename format
                                const rawItems = localStorage.getItem('wrrapd-items');
                                if (rawItems) {
                                    console.log(`[OrderConfirmation] Processing pending file uploads with order number: ${orderNumber}`);
                                    console.log(`[OrderConfirmation] Raw items from localStorage:`, rawItems);
                                    const parsedItems = JSON.parse(rawItems);
                                    console.log(`[OrderConfirmation] Parsed items:`, JSON.stringify(parsedItems));
                                    let uploadCount = 0;
                                    let successCount = 0;
                                    
                                    // Process each item and its options
                                    for (const [titleKey, item] of Object.entries(parsedItems)) {
                                        console.log(`[OrderConfirmation] Processing item: ${titleKey}, wrappingOption: ${item.options?.[0]?.selected_wrapping_option}`);
                                        if (item.options) {
                                            for (let i = 0; i < item.options.length; i++) {
                                                const option = item.options[i];
                                                console.log(`[OrderConfirmation] Checking option ${i} for uploads:`, JSON.stringify({
                                                    title: titleKey,
                                                    wrrapd: option.checkbox_wrrapd,
                                                    option: option.selected_wrapping_option,
                                                    hasFile: option.file_data_url ? true : false
                                                }));
                                                
                                                // Check if this option has a file waiting to be uploaded
                                                if (option.checkbox_wrrapd && 
                                                    option.selected_wrapping_option === 'upload' && 
                                                    option.file_data_url) { // Changed to use file_data_url instead
                                                    
                                                    uploadCount++;
                                                    console.log(`[OrderConfirmation] Found pending upload for product: ${item.title}, ASIN: ${item.asin}, option index: ${i}`);
                                                    
                                                    try {
                                                        // Convert data URL back to Blob
                                                        console.log(`[OrderConfirmation] Converting data URL to blob`);
                                                        const dataUrl = option.file_data_url;
                                                        const byteString = atob(dataUrl.split(',')[1]);
                                                        const mimeType = dataUrl.split(',')[0].split(':')[1].split(';')[0];
                                                        
                                                        const ab = new ArrayBuffer(byteString.length);
                                                        const ia = new Uint8Array(ab);
                                                        for (let i = 0; i < byteString.length; i++) {
                                                            ia[i] = byteString.charCodeAt(i);
                                                        }
                                                        
                                                        const fileBlob = new Blob([ab], { type: mimeType });
                                                        console.log(`[OrderConfirmation] Successfully converted to blob, size: ${fileBlob.size} bytes`);
                                                        
                                                        // Format index as two digits
                                                        const paddedIndex = String(i).padStart(2, '0');
                                                        
                                                        // Get a new filename in the format: ordernumber-asin-index
                                                        const newFilename = `${orderNumber}-${item.asin}-${paddedIndex}`;
                                                        console.log(`[OrderConfirmation] Generated new filename: ${newFilename}`);
                                                        
                                                        // Get signed URL from API
                                                        console.log(`[OrderConfirmation] Requesting signed URL for ${newFilename}`);
                                                        const urlResponse = await fetch('https://api.wrrapd.com/api/get-upload-url', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({
                                                                filename: newFilename,
                                                                contentType: mimeType
                                                            })
                                                        });
                                                        
                                                        if (!urlResponse.ok) {
                                                            console.error(`[OrderConfirmation] Failed to get upload URL: ${urlResponse.status} ${urlResponse.statusText}`);
                                                            throw new Error('Failed to get upload URL');
                                                        }
                                                        
                                                        const { signedUrl, filePath } = await urlResponse.json();
                                                        console.log(`[OrderConfirmation] Received signed URL and file path: ${filePath}`);
                                                        
                                                        // Upload file directly to GCS
                                                        console.log(`[OrderConfirmation] Uploading file to GCS`);
                                                        const uploadResponse = await fetch(signedUrl, {
                                                            method: 'PUT',
                                                            headers: { 'Content-Type': mimeType },
                                                            body: fileBlob
                                                        });
                                                        
                                                        if (!uploadResponse.ok) {
                                                            console.error(`[OrderConfirmation] Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
                                                            throw new Error('Upload failed');
                                                        }
                                                        
                                                        console.log(`[OrderConfirmation] Upload successful for ${newFilename}`);
                                                        successCount++;
                                                        
                                                        // Update the file path in both localStorage and orderData
                                                        option.uploaded_design_path = filePath;
                                                        delete option.file_data_url; // Clean up the temporary file reference
                                                        
                                                        // Find the corresponding item in orderData and update it
                                                        const orderDataItem = orderData.find(od => od.asin === item.asin);
                                                        if (orderDataItem) {
                                                            orderDataItem.uploaded_design_path = filePath;
                                                            console.log(`[OrderConfirmation] Updated orderData with file path: ${filePath}`);
                                                        }
                                                        
                                                    } catch (uploadError) {
                                                        console.error(`[OrderConfirmation] Error uploading file for ${item.title}, ASIN: ${item.asin}:`, uploadError);
                                                        // Continue with the order process even if file upload fails
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    
                                    // Save updated items back to localStorage
                                    saveAllItemsToLocalStorage(parsedItems);
                                    console.log(`[OrderConfirmation] File upload process complete. Total: ${uploadCount}, Successful: ${successCount}`);
                                } else {
                                    console.log(`[OrderConfirmation] No items found in localStorage for file processing`);
                                }
                                
                                // CRITICAL: Email to admin@wrrapd.com must include:
                                // - Final shipping address (finalShippingAddress from each orderData item)
                                // - AI generated images (aiImageData from each orderData item if selected_wrapping_option === 'ai')
                                // - Gift messages (giftMessage from each orderData item)
                                // - Delivery instructions (deliveryInstructions from orderData)
                                // - Sender names (senderName from each orderData item)
                                // All this data is included in orderData array
                                syncAmazonDeliverToGreeting();
                                const greet = localStorage.getItem('wrrapd-deliver-to-greeting');
                                const amazonDeliveryHints = readAmazonDeliveryHintsFromSessionStorage();
                                const gifterFullNameStored = (
                                    localStorage.getItem('wrrapd-checkout-gifter-full-name') || ''
                                ).trim();
                                const response = await fetch('https://api.wrrapd.com/process-payment', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        paymentIntentId,
                                        orderData, // Contains all required info: finalShippingAddress, aiImageData, giftMessage, deliveryInstructions, senderName
                                        customerEmail,
                                        customerPhone,
                                        orderNumber,
                                        billingDetails: billingDetails || null, // Billing details from Stripe checkout
                                        ...(gifterFullNameStored
                                            ? { gifterFullName: gifterFullNameStored }
                                            : {}),
                                        ...(greet && greet.trim() ? { greetingFirstName: greet.trim() } : {}),
                                        ...(amazonDeliveryHints ? { amazonDeliveryHints } : {}),
                                    }),
                                });

                                const result = await response.json();
                                if (result.success) {
                                    console.log('Payment and order processed successfully.');
                                    if (result.warnings && result.warnings.length) {
                                        console.warn(
                                            '[Wrrapd process-payment] warnings (e.g. Mailgun):',
                                            result.warnings,
                                        );
                                    }
                                } else {
                                    console.error('Failed to process payment and order:', result.error);
                                }
                            } catch (error) {
                                console.error('Error sending payment and order data to backend:', error);
                            }
                    });

                } catch (error) {
                    console.error("[createWrrapdSummary] Error during payment:", error);
                    alert('Failed to initiate the payment. Please try again.');
                }
            });
        }

        const stagingPyoBtn = document.getElementById('wrrapd-staging-place-order-btn');
        if (stagingPyoBtn && stagingPyoBtn.dataset.wrrapdStagingListener !== '1') {
            stagingPyoBtn.dataset.wrrapdStagingListener = '1';
            stagingPyoBtn.addEventListener(
                'click',
                function (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    ev.stopImmediatePropagation();
                    void runStagingTrackingIngestSimulatePlaceOrder();
                },
                true,
            );
        }
    }
    
    // Updates the Wrrapd summary section with calculated totals and line items
    function updateWrrapdSummary() {
        console.log("[updateWrrapdSummary] Updating Wrrapd summary.");

        const wrrapdSummaryItems = document.querySelector('#wrrapd-summary-items');
        const wrrapdSummaryTotal = document.querySelector('#wrrapd-summary-total');

        let total = 0;

        if (wrrapdSummaryItems && wrrapdSummaryTotal) {
            const allItems = getAllItemsFromLocalStorage();
            // CRITICAL: Only use items that are actually in the current checkout
            const itemsInCurrentCheckout = filterItemsInCurrentCheckout(allItems);
            
            if (Object.keys(itemsInCurrentCheckout).length === 0) {
                console.log("[updateWrrapdSummary] No items in current checkout. Removing summary.");
                const existingSummary = document.querySelector('#wrrapd-summary');
                if (existingSummary) {
                    existingSummary.remove();
                }
                return 0;
            }

            console.log("[updateWrrapdSummary] Found summary containers. Clearing previous content.");

            // Clear existing items and totals
            wrrapdSummaryItems.innerHTML = '';
            wrrapdSummaryTotal.innerHTML = '';

            console.log("[updateWrrapdSummary] Calculating totals for selected options.");
            
            // Calculate totals based on options array
            let giftWrapTotal = 0;
            let flowersTotal = 0;
            let customDesignTotal = 0;  // New variable for AI/upload charges

            // Iterate through all items and their options (only current checkout items)
            Object.values(itemsInCurrentCheckout).forEach(item => {
                if (item.options) {
                    item.options.forEach(option => {
                        if (option.checkbox_wrrapd) {
                            giftWrapTotal += 6.99;
                            // Add $1.99 for custom uploads and $2.99 for AI designs
                            if (option.selected_wrapping_option === 'ai') {
                                customDesignTotal += 2.99;
                            } else if (option.selected_wrapping_option === 'upload') {
                                customDesignTotal += 1.99;
                            }
                        }
                        if (option.checkbox_flowers) {
                            flowersTotal += 17.99;
                        }
                    });
                }
            });

            const taxRate = getTaxRatePercentage() / 100;
            const subtotal = giftWrapTotal + flowersTotal + customDesignTotal;
            let estimatedTax = subtotal * taxRate;

            total = subtotal + estimatedTax;

            console.log(`[updateWrrapdSummary] Subtotal: $${subtotal.toFixed(2)}, Estimated Tax: $${estimatedTax.toFixed(2)}, Total: $${total.toFixed(2)}.`);

            // CRITICAL: Ensure alignment before adding items (common function)
            ensureWrrapdSummaryAlignment();

            // Add line items to the summary
            if (giftWrapTotal > 0) {
                addSummaryLineItem(wrrapdSummaryItems, 'Gift-wrapping', giftWrapTotal);
            }
            if (customDesignTotal > 0) {
                addSummaryLineItem(wrrapdSummaryItems, 'Custom Design Fee', customDesignTotal);
            }
            if (flowersTotal > 0) {
                addSummaryLineItem(wrrapdSummaryItems, 'Flowers', flowersTotal);
            }
            // Add grey dividing line before "Total before tax:"
            const dividerBeforeTax = document.createElement('hr');
            dividerBeforeTax.className = 'a-spacing-none a-divider-normal';
            dividerBeforeTax.style.marginTop = '8px';
            dividerBeforeTax.style.marginBottom = '8px';
            wrrapdSummaryItems.appendChild(dividerBeforeTax);
            addSummaryLineItem(wrrapdSummaryItems, 'Total before tax:', subtotal);
            // Always show tax line, even if 0
            addSummaryLineItem(wrrapdSummaryItems, 'Estimated tax to be collected:', estimatedTax, true);

            // Add the final total to the summary
            const totalRow = document.createElement('div');
            totalRow.className = 'a-row';
            totalRow.style.cssText =
                'display:grid;grid-template-columns:1fr auto;column-gap:12px;align-items:baseline;width:100%;box-sizing:border-box;margin-top:4px;';
            totalRow.innerHTML = `
                <span class="a-color-price break-word" style="font-size: 18px; font-weight: bold; text-align:left;">Order total</span>
                <span class="a-color-price break-word" style="font-size: 18px; font-weight: bold; text-align:right; white-space:nowrap;">$${total.toFixed(2)}</span>
            `;
            wrrapdSummaryTotal.appendChild(totalRow);

            console.log("[updateWrrapdSummary] Wrrapd summary updated successfully.");
            
            // CRITICAL: Ensure alignment after updating (common function)
            ensureWrrapdSummaryAlignment();
        } else {
            console.log("[updateWrrapdSummary] Summary containers not found. Skipping update.");
        }

        return total;
    }

    // Adds a line item to the Wrrapd summary with a description and amount
    // forceShow: if true, always show the line item even if amount is 0
    function addSummaryLineItem(container, description, amount, forceShow = false) {
        if (amount > 0 || forceShow) {
            console.log(`[addSummaryLineItem] Adding line item: ${description} - $${amount.toFixed(2)}`);
            
            // Simplified - alignment is handled by ensureWrrapdSummaryAlignment() common function
            const item = document.createElement('div');
            item.className = 'a-row';
            item.style.cssText =
                'display:grid;grid-template-columns:1fr auto;column-gap:12px;align-items:baseline;width:100%;box-sizing:border-box;text-align:left;';
            item.innerHTML = `
                <span class="a-size-base" style="text-align:left;justify-self:start;min-width:0;word-break:break-word;">${description}</span>
                <span class="a-size-base a-text-right" style="text-align:right;white-space:nowrap;">$${amount.toFixed(2)}</span>
            `;
            container.appendChild(item);
        } else {
            console.log(`[addSummaryLineItem] Skipping line item: ${description} - $${amount.toFixed(2)} (amount is zero).`);
        }
    }
    
    // Retrieves the current tax rate based on the subtotal and tax values in the order summary
    function getTaxRatePercentage() {
        console.log("[getTaxRatePercentage] Attempting to calculate the tax rate percentage.");
    
        // Try multiple selectors for the order summary
        let ulElement = document.querySelector('#subtotals-marketplace-table');
        
        // Fallback selectors
        if (!ulElement) {
            ulElement = document.querySelector('#spc-order-summary ul, #spc-order-summary [class*="subtotal"], .spc-order-summary ul');
        }
        
        if (!ulElement) {
            // Try to find any element containing order summary
            const orderSummary = document.querySelector('#spc-order-summary, [id*="order-summary"], .spc-order-summary');
            if (orderSummary) {
                ulElement = orderSummary.querySelector('ul, [class*="subtotal"]');
            }
        }
    
        if (!ulElement) {
            console.log("[getTaxRatePercentage] Subtotals element not found. Returning default tax rate of 0%.");
            return 0;
        }
    
        let subtotal = 0;
        let tax = 0;
    
        // Iterate over the <li> elements to find subtotal and tax
        const listItems = ulElement.querySelectorAll('li');
    
        listItems.forEach(li => {
            // Try multiple selector patterns for label and value
            let labelElement = li.querySelector('.order-summary-line-term span.break-word');
            let valueElement = li.querySelector('.order-summary-line-definition span.aok-nowrap');
            
            // Fallback selectors
            if (!labelElement) {
                labelElement = li.querySelector('.order-summary-line-term, [class*="term"]');
            }
            if (!valueElement) {
                valueElement = li.querySelector('.order-summary-line-definition, [class*="definition"], .aok-nowrap');
            }
            
            // If still not found, try to find by text pattern
            if (!labelElement || !valueElement) {
                const allSpans = li.querySelectorAll('span');
                allSpans.forEach(span => {
                    const text = span.textContent.trim();
                    if (text.includes('Total before tax') || text.includes('Subtotal') || text.includes('Items')) {
                        labelElement = span;
                    }
                    if (text.includes('$') && !text.includes('tax') && !text.includes('Total')) {
                        const valueMatch = text.match(/\$?([\d,]+\.?\d*)/);
                        if (valueMatch && !valueElement) {
                            valueElement = span;
                        }
                    }
                });
            }
    
            if (labelElement && valueElement) {
                const labelText = labelElement.textContent.trim();
                let valueText = valueElement.textContent.trim();
                
                // Clean value text - remove $ and commas
                valueText = valueText.replace(/[$,]/g, '');
                const valueNum = parseFloat(valueText);
    
                if (labelText.includes('Total before tax') || labelText.includes('Subtotal') || 
                    (labelText.includes('Items') && !labelText.includes('tax'))) {
                    if (!isNaN(valueNum) && valueNum > 0) {
                        subtotal = valueNum;
                        console.log(`[getTaxRatePercentage] Found subtotal: $${subtotal.toFixed(2)}.`);
                    }
                } else if (labelText.includes('Estimated tax') || labelText.includes('tax to be collected')) {
                    if (!isNaN(valueNum)) {
                        tax = valueNum;
                        console.log(`[getTaxRatePercentage] Found tax: $${tax.toFixed(2)}.`);
                    }
                }
            }
        });
        
        // If subtotal not found in list items, try searching all text in the order summary
        if (subtotal === 0 && ulElement) {
            const allText = ulElement.textContent || '';
            // Try to find "Total before tax: $X.XX" pattern
            const subtotalMatch = allText.match(/Total before tax[:\s]*\$?([\d,]+\.?\d*)/i);
            if (subtotalMatch) {
                subtotal = parseFloat(subtotalMatch[1].replace(/,/g, ''));
                console.log(`[getTaxRatePercentage] Found subtotal via text search: $${subtotal.toFixed(2)}.`);
            }
        }
    
        if (subtotal > 0) {
            const taxRatePercentage = (tax / subtotal) * 100;
            console.log(`[getTaxRatePercentage] Calculated tax rate: ${taxRatePercentage.toFixed(2)}% (tax: $${tax.toFixed(2)}, subtotal: $${subtotal.toFixed(2)}).`);
            return taxRatePercentage; // Return the tax rate percentage
        }
    
        console.log("[getTaxRatePercentage] Subtotal or tax not found or invalid. Returning default tax rate of 0%.");
        console.log("[getTaxRatePercentage] Debug - subtotal:", subtotal, "tax:", tax);
        return 0;
    }
    // ----------------------------------------------------- OFFERS SECTION  ------------------------------------------------------

    function offersSection(allItems) {
        removeNotSelectedTextInGiftOptions(allItems);
    }

    // ----------------------------------------------------- REVIEW AND SHIPPING SECTION -----------------------------------------------------

    function reviewAndShippingSection() {
        console.log("[reviewAndShippingSection] Entering review and shipping section.");

        const allItems = getAllItemsFromLocalStorage();
        
        // Monitor DOM changes for the review and shipping section
        monitorReviewPageLoader(allItems);

        checkChangeAddress(allItems);

        // checkIfWrrapdSelected(allItems);

        // scrapeUserAddress();
    }

    function monitorReviewPageLoader(allItems) {
        const intervalTime = 500; // Intervalo en milisegundos (ajusta si es necesario)
    
        const intervalId = setInterval(() => {
            const loader = document.querySelector('div.section-overwrap'); // Comprueba si existe cualquier div con la clase
    
            if (loader) {
                console.log("[monitorGenericLoader] Loader is present. Waiting...");
            } else {
                console.log("[monitorGenericLoader] Loader has disappeared. Executing logic.");
                clearInterval(intervalId); // Detiene la comprobación
                reviewAndShippingSectionLogic(allItems); // Ejecuta la función deseada
                // create summary
                checkIfWrrapdSelected(allItems);
                // override "place your order" button
                // overridePlaceYourOrderButton();
            }
        }, intervalTime);
    
        console.log("[monitorGenericLoader] Monitoring started.");
    }

    function reviewAndShippingSectionLogic(allItems) {
        console.log("[reviewAndShippingSection] Entering review and shipping section.");
    
        // Contenedor principal de pedidos
        const ordersContainer = document.querySelector('div#spc-orders');
        if (!ordersContainer) {
            console.warn("[reviewAndShippingSection] Orders container not found.");
            return;
        }
    
        // Iterar sobre cada sección de pedido
        const orderBoxes = ordersContainer.querySelectorAll('div[data-orderid]');
        console.log(`[reviewAndShippingSection] Found ${orderBoxes.length} order boxes.`);

        orderBoxes.forEach((orderBox, boxIndex) => {
            console.log(`[reviewAndShippingSection] Processing order box #${boxIndex + 1}`);

            // Buscar elementos de los artículos
            const items = orderBox.querySelectorAll('.item-row');
            console.log(`[reviewAndShippingSection] Found ${items.length} items in order box #${boxIndex + 1}`);

            // Check if any item in this order box has Wrrapd selected
            let hasWrapdItemInBox = false;

            items.forEach((item, index) => {
                // Obtener el título del artículo
                const titleElement = item.querySelector('.a-text-bold');
                if (!titleElement) {
                    console.warn(`[reviewAndShippingSection] Item title not found for item #${index + 1} in order box #${boxIndex + 1}`);
                    return;
                }
    
                const itemTitle = titleElement.textContent.trim().substring(0, 200);
                console.log(`[reviewAndShippingSection] Processing item: "${itemTitle}"`);
    
                // Verificar si el artículo coincide con los datos almacenados
                const matchedItem = resolveProductByRowTitle(allItems, itemTitle, index, item);
                if (!matchedItem) {
                    console.log(`[reviewAndShippingSection] No match found for: "${itemTitle}"`);
                    return;
                }

                // Check if this item has Wrrapd selected
                const hasWrapdSelected = matchedItem.options && matchedItem.options.some(option => option.checkbox_wrrapd);
                console.log(`[reviewAndShippingSection] Item "${itemTitle}" has Wrrapd selected: ${hasWrapdSelected}`);

                if (hasWrapdSelected) {
                    hasWrapdItemInBox = true;
                }
    
                // Find the gift wrap text element for this row
                const giftWrapTextElement = item.querySelector('[id^="review-selected-gift-options-content-gift-wrap-"] [data-testid=""]');
                if (giftWrapTextElement && hasWrapdSelected) {
                    console.log(`[reviewAndShippingSection] Updating gift wrap text for "${itemTitle}". Current text: "${giftWrapTextElement.textContent}"`);
                    giftWrapTextElement.textContent = 'Gift wrap selected with Wrrapd';
                    console.log(`[reviewAndShippingSection] Gift wrap text updated for "${itemTitle}"`);
                } else if (!giftWrapTextElement) {
                    console.log(`[reviewAndShippingSection] Gift wrap text element not found for "${itemTitle}"`);
                }
    
                // Reemplazar botón 'Add gift options'
                const addGiftButton = item.querySelector('[id^="review-selected-gift-options-"]  > .a-declarative ');
                if (addGiftButton) {
                    console.log(`[reviewAndShippingSection] Found 'Add gift options' button for "${itemTitle}"`);
                    createOverlayButton(addGiftButton, goToGiftOptionsPage);
                }
                else {
                    console.log(`[reviewAndShippingSection] 'Add gift options' button not found for "${itemTitle}"`);
                }

                // Reemplazar botón 'Change gift options'
                const changeGiftButton = item.querySelector('[id^="review-selected-gift-options-"] > .a-declarative ');
                if (changeGiftButton) {
                    console.log(`[reviewAndShippingSection] Found 'Change gift options' button for "${itemTitle}"`);
                    createOverlayButton(changeGiftButton, goToGiftOptionsPage);
                }
                else {
                    console.log(`[reviewAndShippingSection] 'Change gift options' button not found for "${itemTitle}"`);
                }
            });

            // If any item in this box has Wrrapd selected, update the delivery option text
            if (hasWrapdItemInBox) {
                console.log(`[reviewAndShippingSection] Box #${boxIndex + 1} has Wrrapd items, updating delivery text`);
                const deliveryOptionTitle = orderBox.querySelector('.shipping-speeds-title');
                if (deliveryOptionTitle) {
                    console.log(`[reviewAndShippingSection] Found delivery title. Current text: "${deliveryOptionTitle.textContent}"`);
                    deliveryOptionTitle.textContent = 'Choose a delivery option (Extra day added to the dates below if choosing Wrrapd\'s gift-wrapping):';
                    console.log('[reviewAndShippingSection] Updated delivery option text successfully');
                } else {
                    console.log('[reviewAndShippingSection] Delivery title not found');
                }
            }
        });
    }

    function createOverlayButton(originalButton, callback) {
        // Make sure the original button is disabled
        if (originalButton.tagName === 'INPUT' || originalButton.tagName === 'BUTTON') {
            originalButton.disabled = true;
        }
        originalButton.style.pointerEvents = 'none';
        originalButton.setAttribute('aria-disabled', 'true');
        
        // Remove any existing overlay for this button
        const existingOverlay = originalButton.parentNode.querySelector(`[data-wrrapd-overlay-for="${originalButton.id || 'button'}"]`);
        if (existingOverlay) {
            existingOverlay.remove();
        }
        
        // Get button position relative to its positioned parent
        const rect = originalButton.getBoundingClientRect();
        const parentRect = originalButton.parentNode.getBoundingClientRect();
        
        const overlayButton = document.createElement('div');
        overlayButton.style.position = 'absolute';
        overlayButton.style.top = `${rect.top - parentRect.top + originalButton.parentNode.scrollTop}px`;
        overlayButton.style.left = `${rect.left - parentRect.left + originalButton.parentNode.scrollLeft}px`;
        overlayButton.style.width = `${rect.width}px`;
        overlayButton.style.height = `${rect.height}px`;
        overlayButton.style.backgroundColor = 'transparent';
        overlayButton.style.border = 'none';
        overlayButton.style.cursor = 'not-allowed';
        overlayButton.style.zIndex = '10000'; // Very high z-index to ensure it's on top
        overlayButton.setAttribute('data-wrrapd-overlay-for', originalButton.id || 'button');
    
        // Intercept all click events
        overlayButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (callback) {
                callback(e);
            }
            return false;
        }, true); // Use capture phase
    
        // Also intercept mousedown and mouseup
        overlayButton.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
        }, true);
        
        overlayButton.addEventListener('mouseup', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
        }, true);
    
        // Make sure parent has position relative
        const parent = originalButton.parentNode;
        if (getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
        }
        
        parent.appendChild(overlayButton);
    }

    function goToGiftOptionsPage() {
        console.log("[goToGiftOptionsPage] Redirecting to gift options page.");

        window.location.href = 'https://www.amazon.com/gp/buy/gift/handlers/display.html';

    }
    
    // ----------------------------------------------------- DELIVERY INSTRUCTIONS -----------------------------------------------------

    /**
     * Monitors for Amazon delivery instructions popup and captures the information when saved
     */
    function monitorDeliveryInstructions() {
        // Set up a mutation observer to watch for when the cdp-close-button appears in the DOM
        const observer = new MutationObserver((mutations) => {
            const closeButton = document.getElementById('cdp-close-button');
            if (closeButton) {
                
                // Remove any existing event listeners to avoid duplicates
                closeButton.removeEventListener('click', captureDeliveryInstructions);
                
                // Add our new click handler
                closeButton.addEventListener('click', captureDeliveryInstructions);
            }
        });
        
        // Start observing the entire body for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Captures delivery instructions when the close button is clicked
     */
    function captureDeliveryInstructions() {
        console.log("[captureDeliveryInstructions] Capturing delivery instructions...");
        
        // Wait briefly to ensure the delivery instructions panel is fully loaded
        setTimeout(() => {
            // Find the summary container
            const summaryContainer = document.querySelector('.ma-cdp-summary');
            if (!summaryContainer) {
                console.warn("[captureDeliveryInstructions] Could not find delivery instructions summary.");
                return;
            }
            
            // Get property type
            const propertyTypeElement = summaryContainer.querySelector('.ma-saved-property-type-text');
            const propertyType = propertyTypeElement ? propertyTypeElement.textContent.trim() : null;
            
            // Collect all instructions in a flat structure
            const instructions = {
                propertyType,
                securityCode: getValueByLabel(summaryContainer, 'Security code:'),
                callBox: getValueByLabel(summaryContainer, 'Call box:'),
                preferredLocation: getElementValue(summaryContainer, '.ma-preferred_delivery_locations_group-preferred_delivery_locations-saved-value'),
                businessHours: getElementValue(summaryContainer, '.ma-business_hrs_group-business_hrs-saved-value'),
                additionalInstructions: getElementValue(summaryContainer, '.ma-address_instructions_group-address_instructions-saved-value')
            };
            
            // Store captured information in localStorage
            saveDeliveryInstructions(instructions);
            
            console.log("[captureDeliveryInstructions] Delivery instructions captured:", instructions);
        }, 500);
    }

  })();


