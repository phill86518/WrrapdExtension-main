(() => {
  // src/content/content-legacy.js
  (function() {
    let isSelectingAddresses = false;
    async function ensureCorrectAddressesForAllItems(allItems) {
      console.log("[ensureCorrectAddressesForAllItems] Starting common address selection function...");
      const itemIdentifierMap = {};
      let wrrapdCounter = 1;
      let nonWrrapdCounter = 1;
      for (const [productKey, productObj] of Object.entries(allItems)) {
        if (!productObj || !productObj.asin || !productObj.options) continue;
        const totalOptions = productObj.options.length;
        const wrrapdOptions = productObj.options.filter((opt) => opt.checkbox_wrrapd === true).length;
        const allOptionsNeedWrrapd = totalOptions > 0 && wrrapdOptions === totalOptions;
        const productNameShort = productKey.substring(0, 30).replace(/[^a-zA-Z0-9]/g, "_");
        const identifier = allOptionsNeedWrrapd ? `WRRAPD_${productNameShort}_${wrrapdCounter++}` : `DEFAULT_${productNameShort}_${nonWrrapdCounter++}`;
        itemIdentifierMap[productObj.asin] = {
          identifier,
          needsWrrapd: allOptionsNeedWrrapd,
          productKey
        };
      }
      localStorage.setItem("wrrapd-item-identifiers", JSON.stringify(itemIdentifierMap));
      console.log("[ensureCorrectAddressesForAllItems] Created item identifier mapping:", itemIdentifierMap);
      const currentUrl = window.location.href;
      const isMultiAddressPage = currentUrl.includes("itemselect") && (currentUrl.includes("multiAddress") || currentUrl.includes("useCase=multiAddress") || currentUrl.includes("multi-address"));
      if (isMultiAddressPage) {
        console.log("[ensureCorrectAddressesForAllItems] Already on multi-address page - calling selectAddressesForItemsSimple...");
        await selectAddressesForItemsSimple(allItems);
        return true;
      } else {
        const allItemsWrrapd = localStorage.getItem("wrrapd-all-items") === "true";
        if (allItemsWrrapd) {
          console.log("[ensureCorrectAddressesForAllItems] All items Wrrapd - selecting Wrrapd address on single page...");
          return false;
        } else {
          console.log("[ensureCorrectAddressesForAllItems] Mixed items - navigating to multi-address page...");
          const allLinks = Array.from(document.querySelectorAll("a, button"));
          let multiAddressLink = null;
          for (const link of allLinks) {
            const text = link.textContent?.trim() || "";
            if (text.includes("multiple addresses") || text.includes("Deliver to multiple") || text.includes("Ship to multiple")) {
              multiAddressLink = link;
              break;
            }
          }
          if (!multiAddressLink) {
            multiAddressLink = await findElementWithFallback(
              "Deliver to multiple addresses link or button on Amazon address selection page",
              ['a[href*="multiple"]', 'a[href*="multi"]', 'button[aria-label*="multiple"]'],
              "Amazon address selection page with address options displayed and a link to deliver items to multiple addresses",
              ["Deliver to multiple addresses", "multiple addresses", "Ship to multiple addresses", "Deliver to multiple", "multiple address"]
            );
          }
          if (multiAddressLink) {
            let linkURL = multiAddressLink.href || multiAddressLink.getAttribute("data-href");
            if (linkURL && linkURL !== "#" && !linkURL.includes("javascript:") && linkURL.startsWith("http")) {
              window.location.href = linkURL;
            } else {
              multiAddressLink.click();
            }
            return true;
          } else {
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
    function ensureWrrapdSummaryAlignment() {
      console.log("[ensureWrrapdSummaryAlignment] Ensuring Wrrapd summary alignment with Amazon...");
      const wrrapdSummaryItems = document.querySelector("#wrrapd-summary-items");
      if (!wrrapdSummaryItems) {
        console.warn("[ensureWrrapdSummaryAlignment] Wrrapd summary items container not found.");
        return;
      }
      const orderSummary = document.querySelector('#spc-order-summary, [id*="order-summary"], .spc-order-summary');
      if (!orderSummary) {
        console.warn("[ensureWrrapdSummaryAlignment] Amazon order summary not found.");
        return;
      }
      const amazonItemsContainer = orderSummary.querySelector('ul, #subtotals-marketplace-table, [class*="subtotal"], [class*="items"]');
      if (amazonItemsContainer) {
        const itemsComputed = window.getComputedStyle(amazonItemsContainer);
        const itemsStyle = [
          itemsComputed.paddingLeft && itemsComputed.paddingLeft !== "0px" ? `padding-left: ${itemsComputed.paddingLeft};` : "",
          itemsComputed.paddingRight && itemsComputed.paddingRight !== "0px" ? `padding-right: ${itemsComputed.paddingRight};` : "",
          itemsComputed.marginLeft && itemsComputed.marginLeft !== "0px" ? `margin-left: ${itemsComputed.marginLeft};` : "",
          itemsComputed.marginRight && itemsComputed.marginRight !== "0px" ? `margin-right: ${itemsComputed.marginRight};` : ""
        ].filter((s) => s).join(" ");
        if (itemsStyle) {
          wrrapdSummaryItems.style.cssText += itemsStyle;
          console.log("[ensureWrrapdSummaryAlignment] Applied Amazon items container styles to Wrrapd summary.");
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
        const wrrapdItems = wrrapdSummaryItems.querySelectorAll(".a-row");
        wrrapdItems.forEach((item) => {
          const itemStyleStr = [
            itemStyle.paddingLeft && itemStyle.paddingLeft !== "0px" ? `padding-left: ${itemStyle.paddingLeft};` : "",
            itemStyle.paddingRight && itemStyle.paddingRight !== "0px" ? `padding-right: ${itemStyle.paddingRight};` : "",
            itemStyle.marginLeft && itemStyle.marginLeft !== "0px" ? `margin-left: ${itemStyle.marginLeft};` : "",
            itemStyle.marginRight && itemStyle.marginRight !== "0px" ? `margin-right: ${itemStyle.marginRight};` : "",
            itemStyle.fontSize ? `font-size: ${itemStyle.fontSize};` : "",
            itemStyle.lineHeight ? `line-height: ${itemStyle.lineHeight};` : ""
          ].filter((s) => s).join(" ");
          const innerSpan = item.querySelector('span[style*="display"]');
          if (innerSpan && itemStyleStr) {
            innerSpan.style.cssText += itemStyleStr;
          }
        });
        console.log("[ensureWrrapdSummaryAlignment] Updated all Wrrapd line items to match Amazon styles.");
      }
    }
    let allowedZipCodes = [];
    let zipCodesLoaded = false;
    async function loadAllowedZipCodes() {
      if (zipCodesLoaded) return allowedZipCodes;
      try {
        const response = await fetch("https://api.wrrapd.com/api/allowed-zip-codes");
        if (response.ok) {
          const data = await response.json();
          allowedZipCodes = data.allowedZipCodes || [];
          zipCodesLoaded = true;
        } else {
          console.error("[Content] Failed to load zip codes from API. Response status:", response.status);
          allowedZipCodes = [];
          zipCodesLoaded = true;
        }
      } catch (error) {
        console.error("[Content] Error loading zip codes:", error);
        allowedZipCodes = [];
        zipCodesLoaded = true;
      }
      return allowedZipCodes;
    }
    loadAllowedZipCodes();
    function monitorURLChanges() {
      let lastURL = null;
      const checkURLAndExecute = () => {
        const currentURL = window.location.href;
        if (currentURL !== lastURL) {
          lastURL = currentURL;
          monitorDeliveryInstructions();
          const isRelevantPage = currentURL.includes("amazon.com/gp/buy/itemselect/handlers/display.html") || currentURL.includes("amazon.com/gp/buy/gift/handlers/display.html") || currentURL.includes("/checkout/") || // New checkout flow URLs (gift, address, etc.)
          currentURL.includes("/gift") || // Gift options in new checkout flow
          currentURL.includes("amazon.com/gp/cart/view.html") || currentURL.includes("amazon.com/cart") || currentURL.includes("amazon.com/gp/buy/payselect/handlers/display.html") || currentURL.includes("amazon.com/gp/buy/spc/handlers/display.html") || currentURL.includes("amazon.com/gp/buy/primeinterstitial/handlers/display.html") || currentURL.includes("amazon.com/gp/buy/addressselect/handlers/display.html");
          if (!isRelevantPage) {
            return;
          }
          const allItems = getAllItemsFromLocalStorage();
          const hasCheckoutP = currentURL.includes("/checkout/p/");
          const hasAddress = currentURL.includes("/address");
          const hasAddressSelect = currentURL.includes("addressselect");
          const isAddressPage = hasCheckoutP && hasAddress || hasAddressSelect;
          if (isAddressPage) {
            console.log("[monitorURLChanges] ===== ADDRESS PAGE DETECTED ===== ");
            console.log(`[monitorURLChanges] Current URL: ${currentURL}`);
            const comingFromCheckout = localStorage.getItem("wrrapd-coming-from-checkout");
            if (comingFromCheckout === "true") {
              console.log("[monitorURLChanges] \u2713 Coming from checkout - cart data should be saved.");
              localStorage.removeItem("wrrapd-coming-from-checkout");
            }
            const hasWrappedSubItem = Object.values(allItems).some(
              (product) => product.options && product.options.some((subItem) => subItem.checkbox_wrrapd)
            );
            console.log(`[monitorURLChanges] Has Wrrapd items: ${hasWrappedSubItem}`);
            showLoadingScreen();
            console.log("[monitorURLChanges] Scheduling handleWrrapdAddressSelection in 3 seconds...");
            setTimeout(() => {
              console.log("[monitorURLChanges] ===== NOW CALLING handleWrrapdAddressSelection() ===== ");
              try {
                handleWrrapdAddressSelection().catch((err) => {
                  console.error("[monitorURLChanges] Error in handleWrrapdAddressSelection:", err);
                });
              } catch (err) {
                console.error("[monitorURLChanges] Exception calling handleWrrapdAddressSelection:", err);
              }
            }, 3e3);
            return;
          }
          if (currentURL.includes("https://www.amazon.com/gp/buy/itemselect/handlers/display.html") || currentURL.includes("/checkout/p/") && currentURL.includes("/itemselect") && currentURL.includes("useCase=multiAddress")) {
            console.log("[monitorURLChanges] Detected multiaddress page. ");
            showLoadingScreen();
            checkChangeAddress();
            return;
          }
          if (currentURL.includes("amazon.com/gp/buy/gift/handlers/display.html") || currentURL.includes("/checkout/") && currentURL.includes("/gift")) {
            console.log("%c[monitorURLChanges] \u2713\u2713\u2713 GIFT OPTIONS PAGE DETECTED \u2713\u2713\u2713", "color: purple; font-weight: bold; font-size: 14px;");
            console.log("[monitorURLChanges] Gift options URL:", currentURL);
            console.log("[monitorURLChanges] Checking for saved cart data...");
            const savedItems = getAllItemsFromLocalStorage();
            console.log("[monitorURLChanges] Saved items in localStorage:", Object.keys(savedItems));
            console.log("[monitorURLChanges] Full saved data:", savedItems);
            const selectors = [
              ".a-box-inner > #item-0",
              '#giftOptions [id^="item-"]',
              '[id^="item-"]',
              ".gift-options-item"
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
            if (!selectorFound) {
              console.log("[monitorURLChanges] No gift options elements found yet, waiting 2 seconds...");
              setTimeout(() => {
                console.log("[monitorURLChanges] Retrying giftSection() after delay...");
                giftSection();
              }, 2e3);
            }
            const allItems2 = getAllItemsFromLocalStorage();
            if (Object.keys(allItems2).length > 0) {
              console.log("[monitorURLChanges] Setting up monitoring for dynamically appearing gift options...");
              setTimeout(() => {
                monitorAddGiftOptionsButton(allItems2);
              }, 1e3);
            }
          }
          if (currentURL.includes("amazon.com/gp/cart/view.html") || currentURL.includes("amazon.com/cart") || currentURL.includes("/cart") || currentURL.match(/amazon\.com\/.*cart/)) {
            overrideProceedToCheckoutButton().catch((err) => {
              console.error("[monitorURLChanges] Error in immediate overrideProceedToCheckoutButton:", err);
            });
            setTimeout(() => {
              overrideProceedToCheckoutButton().catch((err) => {
                console.error("[monitorURLChanges] Error in delayed overrideProceedToCheckoutButton:", err);
              });
            }, 1e3);
            waitForPageReady("div#sc-active-cart div", () => {
              cartPage(allItems);
            });
          }
          const isPaymentPage = currentURL.includes("amazon.com/gp/buy/payselect/handlers/display.html") || currentURL.includes("/checkout/") && currentURL.includes("/spc") && !currentURL.includes("/gp/buy/spc/handlers/display.html");
          if (isPaymentPage) {
            console.log("%c[monitorURLChanges] \u2713\u2713\u2713 PAYMENT PAGE DETECTED \u2713\u2713\u2713", "color: green; font-weight: bold; font-size: 14px;");
            console.log("[monitorURLChanges] Payment page URL:", currentURL);
            localStorage.removeItem("wrrapd-automatic-workflow-active");
            removeLoadingScreen();
            paymentSection(allItems);
            checkChangeAddress();
          }
          if (currentURL.includes("amazon.com/gp/buy/spc/handlers/display.html") && !currentURL.includes("/checkout/")) {
            console.log("[monitorURLChanges] Detected review & shipping page.");
            waitForPageReady("div.shipping-group", () => {
              reviewAndShippingSection();
            });
          }
          if (currentURL.includes("amazon.com/gp/buy/primeinterstitial/handlers/display.html")) {
            console.log("[monitorURLChanges] Detected Offers page.");
            waitForPageReady(".a-color-alternate-background:nth-child(1) > .a-box-inner", () => {
              offersSection(allItems);
              checkChangeAddress();
            });
          }
          if (currentURL.includes("amazon.com/gp/buy/addressselect/handlers/display.html") || currentURL.includes("amazon.com/gp/buy/itemselect/handlers/display.html")) {
            console.log("[monitorURLChanges] Detected OLD checkout/address selection page.");
            if (currentURL.includes("itemselect/handlers/display.html")) {
              waitForPageReady(".a-row.a-spacing-base.item-row", () => {
                checkChangeAddress();
              });
            } else {
              waitForPageReady("#address-list > .a-box-group", () => {
                singleSelectAddress();
              });
            }
          }
        }
      };
      checkURLAndExecute();
      setInterval(checkURLAndExecute, 1e3);
    }
    function waitForPageReady(selector, callback) {
      const checkInterval = 200;
      const timeout = 1e4;
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
    monitorURLChanges();
    function getAllItemsFromLocalStorage() {
      const storageKey = "wrrapd-items";
      const data = JSON.parse(localStorage.getItem(storageKey)) || {};
      return data;
    }
    function saveAllItemsToLocalStorage(items) {
      const storageKey = "wrrapd-items";
      localStorage.setItem(storageKey, JSON.stringify(items));
    }
    function saveItemToLocalStorage(item) {
      const storageKey = "wrrapd-items";
      const allItems = JSON.parse(localStorage.getItem(storageKey)) || {};
      const existingItem = allItems[item.title];
      if (existingItem && JSON.stringify(existingItem) === JSON.stringify(item)) {
        return;
      }
      allItems[item.title] = item;
      localStorage.setItem(storageKey, JSON.stringify(allItems));
      console.log(`[saveItemToLocalStorage] Item saved:`, item);
    }
    function retrieveItemFromLocalStorage(title) {
      const storageKey = "wrrapd-items";
      const allItems = JSON.parse(localStorage.getItem(storageKey)) || {};
      const item = allItems[title] || null;
      console.log(`[retrieveItemFromLocalStorage] Retrieved item for title "${title}":`, item);
      return item;
    }
    function removeAllItemsFromLocalStorage() {
      const storageKey = "wrrapd-items";
      localStorage.removeItem(storageKey);
    }
    function cartPage() {
      localStorage.setItem("wrrapd-payment-status", "reset");
      localStorage.removeItem("wrrapd-terms-accepted");
      localStorage.removeItem("wrrapd-should-change-address");
      localStorage.removeItem("wrrapd-addresses-changed");
      removeAllItemsFromLocalStorage();
      disableCheckoutButtons();
      monitorDomChangesForCheckoutButton();
      overrideProceedToCheckoutButton().catch((err) => {
        console.error("[cartPage] Error in initial overrideProceedToCheckoutButton:", err);
      });
      setTimeout(() => {
        overrideProceedToCheckoutButton().catch((err) => {
          console.error("[cartPage] Error in delayed overrideProceedToCheckoutButton:", err);
        });
      }, 1e3);
    }
    function disableCheckoutButtons() {
      const selectors = [
        "#sc-buy-box-ptc-button .a-button-input",
        '#sc-buy-box-ptc-button input[type="submit"]',
        "#sc-buy-box-ptc-button button",
        "#sc-buy-box-ptc-button input",
        '[data-feature-id="proceed-to-checkout-button"] input',
        '[data-feature-id="proceed-to-checkout-button"] button',
        '#sc-buy-box form input[type="submit"]',
        '#sc-buy-box form button[type="submit"]'
      ];
      selectors.forEach((selector) => {
        const buttons = document.querySelectorAll(selector);
        buttons.forEach((btn) => {
          if (btn && btn.offsetParent !== null) {
            btn.disabled = true;
            btn.style.pointerEvents = "none";
            btn.style.opacity = "0.5";
            btn.style.cursor = "not-allowed";
            btn.setAttribute("data-wrrapd-disabled", "true");
          }
        });
      });
    }
    function enableCheckoutButtons() {
      const selectors = [
        "#sc-buy-box-ptc-button .a-button-input",
        '#sc-buy-box-ptc-button input[type="submit"]',
        "#sc-buy-box-ptc-button button",
        "#sc-buy-box-ptc-button input",
        '[data-feature-id="proceed-to-checkout-button"] input',
        '[data-feature-id="proceed-to-checkout-button"] button',
        '#sc-buy-box form input[type="submit"]',
        '#sc-buy-box form button[type="submit"]'
      ];
      selectors.forEach((selector) => {
        const buttons = document.querySelectorAll(selector);
        buttons.forEach((btn) => {
          if (btn && btn.hasAttribute("data-wrrapd-disabled")) {
            btn.disabled = false;
            btn.style.pointerEvents = "auto";
            btn.style.opacity = "1";
            btn.style.cursor = "pointer";
            btn.removeAttribute("data-wrrapd-disabled");
          }
        });
      });
    }
    window.wrrapdFindCheckoutButton = function() {
      console.log("[wrrapdFindCheckoutButton] Manual trigger called");
      return overrideProceedToCheckoutButton();
    };
    function monitorDomChangesForCheckoutButton() {
      const targetNode = document.body;
      const config = { childList: true, subtree: true };
      let checkTimeout = null;
      const debouncedCheck = () => {
        if (checkTimeout) clearTimeout(checkTimeout);
        checkTimeout = setTimeout(() => {
          overrideProceedToCheckoutButton().catch((err) => {
            console.error("[monitorDomChangesForCheckoutButton] Error in overrideProceedToCheckoutButton:", err);
          });
        }, 100);
      };
      const observer = new MutationObserver(debouncedCheck);
      observer.observe(targetNode, config);
      overrideProceedToCheckoutButton().catch((err) => {
        console.error("[monitorDomChangesForCheckoutButton] Error in initial overrideProceedToCheckoutButton:", err);
      });
      const intervalId = setInterval(() => {
        overrideProceedToCheckoutButton().catch((err) => {
        });
      }, 2e3);
    }
    const elementSelectorCache = /* @__PURE__ */ new Map();
    const WRRAPD_GEMINI_API_KEY = "AIzaSyCf5zz3Nkl0E4jeiusobT-ab8Nn7xnxAfI";
    if (WRRAPD_GEMINI_API_KEY && WRRAPD_GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY") {
      localStorage.setItem("gemini-api-key", WRRAPD_GEMINI_API_KEY);
    }
    window.setGeminiAPIKey = function(apiKey) {
      if (!apiKey || typeof apiKey !== "string") {
        console.error("[setGeminiAPIKey] Invalid API key provided");
        return false;
      }
      localStorage.setItem("gemini-api-key", apiKey);
      console.log("[setGeminiAPIKey] Gemini API key has been set successfully");
      console.log("[setGeminiAPIKey] To get your API key, visit: https://makersuite.google.com/app/apikey");
      return true;
    };
    function createGeminiAPIKeyModal() {
      if (document.getElementById("wrrapd-gemini-api-modal")) {
        return;
      }
      const modal = document.createElement("div");
      modal.id = "wrrapd-gemini-api-modal";
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
      const content = document.createElement("div");
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
      document.getElementById("wrrapd-save-api-key").addEventListener("click", () => {
        const apiKey = document.getElementById("wrrapd-api-key-input").value.trim();
        if (apiKey) {
          if (setGeminiAPIKey(apiKey)) {
            modal.remove();
            const successMsg = document.createElement("div");
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
            successMsg.textContent = "\u2713 Gemini API Key saved successfully!";
            document.body.appendChild(successMsg);
            setTimeout(() => successMsg.remove(), 3e3);
          }
        } else {
          alert("Please enter a valid API key");
        }
      });
      document.getElementById("wrrapd-skip-api-key").addEventListener("click", () => {
        modal.remove();
        localStorage.setItem("wrrapd-api-key-skipped", "true");
      });
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      });
    }
    if (localStorage.getItem("gemini-api-key")) {
    }
    async function findElementWithAI(elementDescription, pageContext = "") {
      const cacheKey = `${elementDescription}-${window.location.pathname}`;
      if (elementSelectorCache.has(cacheKey)) {
        const cachedSelector = elementSelectorCache.get(cacheKey);
        const element = document.querySelector(cachedSelector);
        if (element) {
          console.log(`[findElementWithAI] Using cached selector for "${elementDescription}": ${cachedSelector}`);
          return cachedSelector;
        } else {
          elementSelectorCache.delete(cacheKey);
        }
      }
      try {
        const domSnapshot = getSimplifiedDOMSnapshot();
        const prompt = `You are analyzing an Amazon checkout page. Find the CSS selector for the following element: "${elementDescription}".

${pageContext ? `Context: ${pageContext}` : ""}

Here is a simplified DOM structure of the page:
${domSnapshot}

Provide ONLY a valid CSS selector that uniquely identifies this element. The selector should be specific enough to target only this element. Return ONLY the CSS selector, nothing else. If you cannot find the element, return "NOT_FOUND".`;
        const selector = await callGeminiAPI(prompt);
        if (selector && selector !== "NOT_FOUND" && selector.trim().length > 0) {
          const element = document.querySelector(selector.trim());
          if (element) {
            console.log(`[findElementWithAI] AI found selector for "${elementDescription}": ${selector.trim()}`);
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
    function getSimplifiedDOMSnapshot() {
      const isGiftPage = window.location.href.includes("/gift");
      const relevantSelectors = isGiftPage ? [
        "#giftOptions",
        '[id^="item-"]',
        '[data-testid*="gift"]',
        '[class*="gift"]',
        'input[type="checkbox"][id*="gift"]',
        'input[type="checkbox"][name*="gift"]',
        'label[for*="gift"]',
        '[class*="product"]',
        '[class*="item"]',
        "section",
        ".a-section"
      ] : [
        "#sc-buy-box",
        "#sc-buy-box-ptc-button",
        '[data-feature-id*="checkout"]',
        ".a-button-input",
        'button[type="submit"]',
        'input[type="submit"]',
        ".a-button-primary",
        "#sc-active-cart",
        'form[action*="checkout"]',
        '[aria-label*="checkout" i]',
        '[aria-label*="proceed" i]'
      ];
      let snapshot = "";
      const foundElements = /* @__PURE__ */ new Set();
      relevantSelectors.forEach((selector) => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach((el, index) => {
            if (index < 10 && !foundElements.has(el)) {
              foundElements.add(el);
              const text = el.textContent?.trim().substring(0, 150) || "";
              const id = el.id || "";
              const classes = el.className || "";
              const name = el.name || "";
              const value = el.value || "";
              const ariaLabel = el.getAttribute("aria-label") || "";
              const dataAttrs = Array.from(el.attributes).filter((attr) => attr.name.startsWith("data-")).map((attr) => `${attr.name}="${attr.value}"`).join(" ");
              snapshot += `
--- Element ${foundElements.size} ---
`;
              snapshot += `Selector: ${selector}
`;
              snapshot += `Tag: ${el.tagName}
`;
              snapshot += `ID: ${id}
`;
              snapshot += `Name: ${name}
`;
              snapshot += `Value: ${value}
`;
              snapshot += `Classes: ${classes}
`;
              snapshot += `Aria-label: ${ariaLabel}
`;
              snapshot += `Data attributes: ${dataAttrs}
`;
              snapshot += `Text content: ${text}
`;
              snapshot += `Parent ID: ${el.parentElement?.id || ""}
`;
              snapshot += `Parent classes: ${el.parentElement?.className || ""}
`;
            }
          });
        } catch (e) {
        }
      });
      try {
        const allButtons = document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"]');
        allButtons.forEach((el) => {
          if (foundElements.has(el)) return;
          const text = el.textContent?.trim().toLowerCase() || "";
          const value = (el.value || "").toLowerCase();
          const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
          if (text.includes("checkout") || text.includes("proceed") || value.includes("checkout") || value.includes("proceed") || ariaLabel.includes("checkout") || ariaLabel.includes("proceed")) {
            foundElements.add(el);
            snapshot += `
--- Text-based Match ---
`;
            snapshot += `Tag: ${el.tagName}
`;
            snapshot += `ID: ${el.id || ""}
`;
            snapshot += `Classes: ${el.className || ""}
`;
            snapshot += `Text: ${el.textContent?.trim().substring(0, 150) || ""}
`;
            snapshot += `Value: ${el.value || ""}
`;
            snapshot += `Aria-label: ${el.getAttribute("aria-label") || ""}
`;
          }
        });
      } catch (e) {
      }
      return snapshot || "No relevant elements found";
    }
    async function callGeminiAPI(prompt) {
      const apiKey = localStorage.getItem("gemini-api-key") || "YOUR_GEMINI_API_KEY";
      if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") {
        console.warn('[callGeminiAPI] Gemini API key not configured. Please set it in localStorage with key "gemini-api-key"');
        return null;
      }
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
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
          return text;
        }
        return null;
      } catch (error) {
        console.error("[callGeminiAPI] Error calling Gemini API:", error);
        throw error;
      }
    }
    function findElementByText(searchText, tagNames = ["button", "input", "a"]) {
      const lowerSearchText = searchText.toLowerCase();
      const selectors = tagNames.join(", ");
      try {
        const elements = document.querySelectorAll(selectors);
        for (const el of elements) {
          const text = el.textContent?.trim().toLowerCase() || "";
          const value = (el.value || "").toLowerCase();
          const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
          const title = (el.getAttribute("title") || "").toLowerCase();
          const dataLabel = (el.getAttribute("data-label") || "").toLowerCase();
          if (text.includes(lowerSearchText) || value.includes(lowerSearchText) || ariaLabel.includes(lowerSearchText) || title.includes(lowerSearchText) || dataLabel.includes(lowerSearchText)) {
            console.log(`[findElementByText] Found element by text "${searchText}":`, el);
            return el;
          }
        }
        const allElements = document.querySelectorAll("*");
        for (const el of allElements) {
          if (tagNames.includes(el.tagName.toLowerCase())) {
            const text = el.textContent?.trim().toLowerCase() || "";
            if (text.includes(lowerSearchText)) {
              console.log(`[findElementByText] Found element by text "${searchText}" (with children):`, el);
              return el;
            }
          }
        }
      } catch (e) {
        console.warn("[findElementByText] Error searching by text:", e);
      }
      return null;
    }
    async function findLinkURL(elementDescription, fallbackSelectors = [], pageContext = "", searchTexts = []) {
      console.log(`[findLinkURL] Searching for link "${elementDescription}" to extract URL...`);
      const element = await findElementWithFallback(elementDescription, fallbackSelectors, pageContext, searchTexts);
      if (!element) {
        console.warn(`[findLinkURL] Could not find element "${elementDescription}"`);
        return null;
      }
      if (element.tagName === "A" && element.href) {
        console.log(`[findLinkURL] \u2713 Found URL: ${element.href}`);
        return element.href;
      }
      const parentLink = element.closest("a");
      if (parentLink && parentLink.href) {
        console.log(`[findLinkURL] \u2713 Found URL from parent link: ${parentLink.href}`);
        return parentLink.href;
      }
      if (element.onclick) {
        const onclickStr = element.onclick.toString();
        const urlMatch = onclickStr.match(/['"](https?:\/\/[^'"]+)['"]/);
        if (urlMatch) {
          console.log(`[findLinkURL] \u2713 Found URL from onclick: ${urlMatch[1]}`);
          return urlMatch[1];
        }
      }
      const dataHref = element.getAttribute("data-href") || element.getAttribute("href");
      if (dataHref && dataHref.startsWith("http")) {
        console.log(`[findLinkURL] \u2713 Found URL from data attribute: ${dataHref}`);
        return dataHref;
      }
      console.warn(`[findLinkURL] Could not extract URL from element "${elementDescription}"`);
      return null;
    }
    async function findElementWithFallback(elementDescription, fallbackSelectors = [], pageContext = "", searchTexts = []) {
      for (const selector of fallbackSelectors) {
        try {
          const element = document.querySelector(selector);
          if (element) {
            return element;
          }
        } catch (e) {
        }
      }
      if (searchTexts && searchTexts.length > 0) {
        for (const searchText of searchTexts) {
          const element = findElementByText(searchText);
          if (element) {
            return element;
          }
        }
      }
      const apiKey = localStorage.getItem("gemini-api-key");
      if (apiKey && apiKey !== "YOUR_GEMINI_API_KEY") {
        try {
          const aiPromise = findElementWithAI(elementDescription, pageContext);
          const timeoutPromise = new Promise(
            (_, reject) => setTimeout(() => reject(new Error("AI timeout")), 5e3)
            // Increased to 5 seconds
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
          if (error.message !== "AI timeout") {
            console.warn(`[findElementWithFallback] AI search failed for "${elementDescription}":`, error.message);
          } else {
            console.warn(`[findElementWithFallback] AI search timed out for "${elementDescription}"`);
          }
        }
      }
      return null;
    }
    async function overrideProceedToCheckoutButton() {
      const checkoutBox = document.querySelector("#sc-buy-box");
      if (checkoutBox) {
        const forms = checkoutBox.querySelectorAll("form");
        forms.forEach((form2) => {
          const originalFormSubmit = form2.submit;
          form2.submit = function() {
            const syntheticEvent = new Event("click", { bubbles: true, cancelable: true });
            overrideProceedToCheckoutButtonHandler(syntheticEvent);
            return originalFormSubmit.call(this);
          };
          form2.addEventListener("submit", (e) => {
            const syntheticEvent = new Event("click", { bubbles: true, cancelable: true });
            overrideProceedToCheckoutButtonHandler(syntheticEvent);
          }, true);
        });
      }
      const proceedToCheckoutButton = await findElementWithFallback(
        "Proceed to checkout button",
        [
          "#sc-buy-box-ptc-button .a-button-input",
          '#sc-buy-box-ptc-button input[type="submit"]',
          "#sc-buy-box-ptc-button button",
          "#sc-buy-box-ptc-button input",
          "#sc-buy-box-ptc-button",
          '[data-feature-id="proceed-to-checkout-button"]',
          '[data-feature-id="proceed-to-checkout-button"] input',
          '[data-feature-id="proceed-to-checkout-button"] button',
          '[data-feature-id*="checkout"] input',
          '[data-feature-id*="checkout"] button',
          '[data-feature-id*="checkout"]',
          '.a-button-primary input[type="submit"]',
          ".a-button-primary button",
          'input[name="proceedToRetailCheckout"]',
          'button[name="proceedToRetailCheckout"]',
          'form[action*="checkout"] input[type="submit"]',
          'form[action*="checkout"] button',
          '#sc-buy-box form input[type="submit"]',
          "#sc-buy-box form button",
          '#sc-buy-box input[type="submit"]',
          '#sc-buy-box button[type="submit"]'
        ],
        'This is the Amazon cart page. The button should be in the checkout box area (#sc-buy-box) and typically says "Proceed to checkout" or similar. It is usually an input or button element inside a form.',
        ["proceed to checkout", "proceed to checkout", "checkout", "place order"]
        // Text search terms
      );
      if (!proceedToCheckoutButton) {
        let buttonAttached = false;
        const observer = new MutationObserver(async () => {
          if (buttonAttached) {
            observer.disconnect();
            return;
          }
          const button = await findElementWithFallback(
            "Proceed to checkout button",
            [
              "#sc-buy-box-ptc-button .a-button-input",
              '#sc-buy-box-ptc-button input[type="submit"]',
              "#sc-buy-box-ptc-button button",
              "#sc-buy-box-ptc-button input",
              "#sc-buy-box-ptc-button",
              '[data-feature-id="proceed-to-checkout-button"]',
              '[data-feature-id="proceed-to-checkout-button"] input',
              '[data-feature-id="proceed-to-checkout-button"] button',
              '[data-feature-id*="checkout"] input',
              '[data-feature-id*="checkout"] button',
              '.a-button-primary input[type="submit"]',
              ".a-button-primary button",
              'input[name="proceedToRetailCheckout"]',
              'button[name="proceedToRetailCheckout"]',
              '#sc-buy-box form input[type="submit"]',
              "#sc-buy-box form button",
              '#sc-buy-box input[type="submit"]',
              '#sc-buy-box button[type="submit"]'
            ],
            'This is the Amazon cart page. The button should be in the checkout box area (#sc-buy-box) and typically says "Proceed to checkout" or similar.',
            ["proceed to checkout", "checkout", "place order"]
          );
          if (button) {
            button.removeEventListener("click", overrideProceedToCheckoutButtonHandler);
            button.addEventListener("click", (e) => {
              overrideProceedToCheckoutButtonHandler(e);
            }, true);
            const form2 = button.closest("form");
            if (form2) {
              const originalFormSubmit = form2.submit;
              form2.submit = function() {
                const syntheticEvent = new Event("submit", { bubbles: true, cancelable: true });
                overrideProceedToCheckoutButtonHandler(syntheticEvent);
                return originalFormSubmit.call(this);
              };
              form2.addEventListener("submit", (e) => {
                overrideProceedToCheckoutButtonHandler(e);
              }, true);
            }
            enableCheckoutButtons();
            buttonAttached = true;
            observer.disconnect();
          }
        });
        const targetNode = document.body || document.documentElement;
        observer.observe(targetNode, {
          childList: true,
          subtree: true
        });
        setTimeout(() => {
          if (!buttonAttached) {
            observer.disconnect();
          }
        }, 3e4);
        return;
      }
      if (proceedToCheckoutButton.onclick) {
        proceedToCheckoutButton.onclick = null;
      }
      try {
        Object.defineProperty(proceedToCheckoutButton, "onclick", {
          set: function(value) {
          },
          get: function() {
            return function(e) {
              overrideProceedToCheckoutButtonHandler(e || new Event("click"));
            };
          },
          configurable: true
        });
      } catch (e) {
      }
      proceedToCheckoutButton.removeEventListener("click", overrideProceedToCheckoutButtonHandler);
      proceedToCheckoutButton.addEventListener("click", (e) => {
        overrideProceedToCheckoutButtonHandler(e);
      }, true);
      const form = proceedToCheckoutButton.closest("form");
      if (form) {
        const originalFormSubmit = form.submit;
        form.submit = function() {
          const syntheticEvent = new Event("submit", { bubbles: true, cancelable: true });
          overrideProceedToCheckoutButtonHandler(syntheticEvent);
          return originalFormSubmit.call(this);
        };
        form.addEventListener("submit", (e) => {
          overrideProceedToCheckoutButtonHandler(e);
        }, true);
      }
      enableCheckoutButtons();
      enableCheckoutButtons();
    }
    let globalNavigationBlocked = false;
    let originalLocationAssign = null;
    let originalLocationReplace = null;
    let originalLocationHrefDescriptor = null;
    function setupNavigationBlocking() {
      if (originalLocationAssign) return;
      originalLocationAssign = window.location.assign;
      originalLocationReplace = window.location.replace;
      try {
        originalLocationHrefDescriptor = Object.getOwnPropertyDescriptor(window.location, "href");
      } catch (e) {
        console.warn("[setupNavigationBlocking] Could not get href descriptor:", e);
      }
    }
    setupNavigationBlocking();
    function blockNavigation() {
      if (globalNavigationBlocked) return;
      globalNavigationBlocked = true;
      console.log("%c[blockNavigation] \u26D4 NAVIGATION BLOCKED \u26D4", "color: red; font-weight: bold; font-size: 14px;");
      window.location.assign = function(url) {
        console.log("%c[blockNavigation] BLOCKED window.location.assign:", "color: red; font-weight: bold;", url);
        return false;
      };
      window.location.replace = function(url) {
        console.log("%c[blockNavigation] BLOCKED window.location.replace:", "color: red; font-weight: bold;", url);
        return false;
      };
      try {
        let currentHref = window.location.href;
        Object.defineProperty(window.location, "href", {
          get: function() {
            return currentHref;
          },
          set: function(url) {
            if (globalNavigationBlocked) {
              console.log("%c[blockNavigation] BLOCKED window.location.href:", "color: red; font-weight: bold;", url);
              return;
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
      if (!globalNavigationBlocked) return;
      globalNavigationBlocked = false;
      console.log("[unblockNavigation] Navigation unblocked.");
      if (originalLocationAssign) {
        window.location.assign = originalLocationAssign;
      }
      if (originalLocationReplace) {
        window.location.replace = originalLocationReplace;
      }
      try {
        if (originalLocationHrefDescriptor) {
          Object.defineProperty(window.location, "href", originalLocationHrefDescriptor);
        }
      } catch (e) {
        console.warn("[unblockNavigation] Could not restore location.href:", e);
      }
    }
    async function overrideProceedToCheckoutButtonHandler(event) {
      try {
        const allItems = {};
        const allCartItems = document.querySelectorAll('div#sc-active-cart div[data-asin][data-csa-c-type="item"]');
        const cartItemsActive = Array.from(allCartItems).filter((item) => item.getAttribute("data-isselected") === "1");
        if (cartItemsActive.length === 0) {
          return;
        }
        cartItemsActive.forEach((item) => {
          const asin = item.getAttribute("data-asin");
          if (!asin) {
            return;
          }
          const titleElement = item.querySelector("span.sc-product-title");
          if (!titleElement) {
            return;
          }
          const title = titleElement.innerText.trim().substring(0, 35);
          const imageElement = item.querySelector(".sc-product-image");
          const imageUrl = imageElement ? imageElement.src || imageElement.getAttribute("src") : null;
          const quantityAttr = item.getAttribute("data-quantity");
          const quantity = parseInt(quantityAttr) || 1;
          if (!allItems[title]) {
            allItems[title] = {
              asin,
              title,
              imageUrl,
              options: []
            };
          }
          for (let i = 0; i < quantity; i++) {
            allItems[title].options.push({
              checkbox_wrrapd: false,
              checkbox_flowers: false,
              checkbox_amazon_combine: false,
              selected_wrapping_option: "wrrapd",
              selected_flower_design: null
            });
          }
        });
        saveAllItemsToLocalStorage(allItems);
        localStorage.setItem("wrrapd-coming-from-checkout", "true");
      } catch (err) {
        console.error("[overrideProceedToCheckoutButtonHandler] Error saving cart data:", err);
      }
      return;
    }
    function checkGiftWrappable(category) {
      const acceptableCategories = [
        "Books",
        "Clothing, Shoes & Jewelry",
        "Electronics",
        "Home & Kitchen",
        "Toys & Games",
        "Office Products",
        "Cell Phones & Accessories"
      ];
      return acceptableCategories.includes(category);
    }
    function giftSection() {
      console.log("[giftSection] ===== FUNCTION CALLED ===== ");
      const allItems = getAllItemsFromLocalStorage();
      const addressesChangedFlag = localStorage.getItem("wrrapd-addresses-changed") === "true";
      if (addressesChangedFlag) {
        console.log("[giftSection] \u2713\u2713\u2713 RETURN DETECTED (addressesChangedFlag=true) - clicking 'Save gift options' to proceed to Payment...");
        localStorage.setItem("wrrapd-addresses-changed", "false");
        localStorage.setItem("wrrapd-should-change-address", "false");
        localStorage.setItem("wrrapd-multi-address-completed", "false");
        setTimeout(async () => {
          await clickSaveGiftOptionsButton();
        }, 1500);
        return;
      }
      console.log("[giftSection] FIRST TIME - inserting Wrrapd options (matching old code behavior)...");
      monitorAmazonGiftCheckbox(allItems);
      overrideSaveGiftOptionsButtons();
      insertWrrapdOptions(allItems);
    }
    async function overrideSaveGiftOptionsButtons() {
      console.log("[overrideSaveGiftOptionsButtons] Overriding Amazon's save buttons.");
      const handleSaveButtonClick = function(event) {
        if (localStorage.getItem("wrrapd-programmatic-click-to-payment") === "true") {
          console.log("[overrideSaveGiftOptionsButtons] Programmatic click to payment detected - NOT intercepting.");
          localStorage.removeItem("wrrapd-programmatic-click-to-payment");
          return;
        }
        if (event.target.closest(".wrrapd-modal") !== null || event.target.classList.contains("modal-save") || event.target.classList.contains("modal-close") || event.wrrapdModalSave === true || event.wrrapdModalClick === true) {
          return;
        }
        console.log("[overrideSaveGiftOptionsButtons] \u2713 Save button clicked! Event:", event.type, "Target:", event.target);
        const allItems = getAllItemsFromLocalStorage();
        const addressesChangedFlag = localStorage.getItem("wrrapd-addresses-changed") === "true";
        if (addressesChangedFlag) {
          console.log("[overrideSaveGiftOptionsButtons] Addresses were already changed - NOT intercepting. Allowing natural flow to Payment.");
          return;
        }
        const termsAccepted = localStorage.getItem("wrrapd-terms-accepted") === "true";
        if (termsAccepted) {
          console.log("[overrideSaveGiftOptionsButtons] Terms already accepted - NOT showing Terms modal again.");
          return;
        }
        const hasWrappedSubItem = Object.values(allItems).some(
          (product) => product.options && product.options.some((subItem) => subItem.checkbox_wrrapd)
        );
        if (hasWrappedSubItem) {
          console.log("[overrideSaveGiftOptionsButtons] Wrrapd items detected - showing Terms & Conditions modal.");
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          showTermsAndConditionsModal(() => {
            console.log("[overrideSaveGiftOptionsButtons] User clicked Proceed. Continuing with address selection...");
            captureGiftMessages(allItems);
            const allItemsWrrapd = checkIfAllItemsWrrapd(allItems);
            localStorage.setItem("wrrapd-should-change-address", "true");
            localStorage.setItem("wrrapd-all-items", allItemsWrrapd ? "true" : "false");
            showLoadingScreen();
            if (allItemsWrrapd) {
              console.log("[overrideSaveGiftOptionsButtons] All items are Wrrapd - navigating to regular address page (NOT multiaddress)");
              (async () => {
                try {
                  const changeLinkURL = await findLinkURL(
                    "Change link for delivery address on Amazon gift options page (NOT multiaddress)",
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
                    "Amazon gift options page with a Change link for delivery address that navigates to address selection (single address, not multiaddress)",
                    ["Change"]
                  );
                  if (changeLinkURL && changeLinkURL !== "NO URL FOUND") {
                    if (!changeLinkURL.includes("multiAddress") && !changeLinkURL.includes("multi-address") && !changeLinkURL.includes("itemselect")) {
                      console.log(`[overrideSaveGiftOptionsButtons] ===== GEMINI FOUND "CHANGE" LINK URL (REGULAR ADDRESS PAGE) =====`);
                      console.log(`[overrideSaveGiftOptionsButtons] Change link URL: ${changeLinkURL}`);
                      console.log(`[overrideSaveGiftOptionsButtons] ==========================================`);
                      console.log(`[overrideSaveGiftOptionsButtons] Navigating to regular address page (NOT multiaddress)...`);
                      window.location.href = changeLinkURL;
                    } else {
                      console.log("[overrideSaveGiftOptionsButtons] Change link points to multiaddress, constructing regular address URL instead...");
                      const currentURL = window.location.href;
                      const purchaseIdMatch = currentURL.match(/\/p\/([^\/]+)/);
                      const purchaseId = purchaseIdMatch ? purchaseIdMatch[1] : null;
                      if (purchaseId) {
                        const regularAddressURL = `https://www.amazon.com/checkout/p/${purchaseId}/address?pipelineType=Chewbacca&referrer=gift&ref_=chk_giftselect_chg_shipaddressselect`;
                        console.log(`[overrideSaveGiftOptionsButtons] Showing loading screen before navigation...`);
                        showLoadingScreen();
                        await new Promise((r) => setTimeout(r, 100));
                        console.log(`[overrideSaveGiftOptionsButtons] Using regular address URL: ${regularAddressURL}`);
                        window.location.href = regularAddressURL;
                      }
                    }
                  } else {
                    console.error("[overrideSaveGiftOptionsButtons] Could not find 'Change' link URL using Gemini AI");
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
              console.log("[overrideSaveGiftOptionsButtons] Mixed items (Wrrapd and non-Wrrapd) - will go to multiaddress page");
              (async () => {
                try {
                  const changeLinkURL = await findLinkURL(
                    "Change link for delivery address on Amazon gift options page",
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
                    "Amazon gift options page with a Change link for delivery address that navigates to address selection",
                    ["Change"]
                  );
                  if (changeLinkURL && changeLinkURL !== "NO URL FOUND") {
                    console.log(`[overrideSaveGiftOptionsButtons] ===== GEMINI FOUND "CHANGE" LINK URL =====`);
                    console.log(`[overrideSaveGiftOptionsButtons] Change link URL: ${changeLinkURL}`);
                    console.log(`[overrideSaveGiftOptionsButtons] ==========================================`);
                    console.log(`[overrideSaveGiftOptionsButtons] Showing loading screen before navigation...`);
                    showLoadingScreen();
                    await new Promise((r) => setTimeout(r, 100));
                    console.log(`[overrideSaveGiftOptionsButtons] Navigating directly to Change link URL...`);
                    window.location.href = changeLinkURL;
                  } else {
                    console.error("[overrideSaveGiftOptionsButtons] Could not find 'Change' link URL using Gemini AI");
                    const currentURL = window.location.href;
                    const purchaseIdMatch = currentURL.match(/\/p\/([^\/]+)/);
                    const purchaseId = purchaseIdMatch ? purchaseIdMatch[1] : null;
                    if (purchaseId) {
                      const fallbackURL = `https://www.amazon.com/checkout/p/${purchaseId}/address?pipelineType=Chewbacca&referrer=gift&ref_=chk_giftselect_chg_shipaddressselect`;
                      console.log(`[overrideSaveGiftOptionsButtons] Showing loading screen before navigation...`);
                      showLoadingScreen();
                      await new Promise((r) => setTimeout(r, 100));
                      console.log(`[overrideSaveGiftOptionsButtons] Using fallback URL: ${fallbackURL}`);
                      window.location.href = fallbackURL;
                    } else {
                      console.error("[overrideSaveGiftOptionsButtons] Could not extract purchase ID for fallback");
                    }
                  }
                } catch (error) {
                  console.error("[overrideSaveGiftOptionsButtons] Error finding Change link with AI:", error);
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
          });
          return false;
        }
      };
      const delegatedHandler = function(event) {
        const target = event.target;
        if (localStorage.getItem("wrrapd-programmatic-click-to-payment") === "true") {
          console.log("[overrideSaveGiftOptionsButtons] Delegated handler: Programmatic click to payment detected - NOT intercepting.");
          localStorage.removeItem("wrrapd-programmatic-click-to-payment");
          return;
        }
        const isSaveButton = target.closest("#orderSummaryPrimaryActionBtn") !== null || target.closest(".a-button-primary") !== null || target.textContent?.toLowerCase().includes("save gift") || target.textContent?.toLowerCase().includes("continue") || target.value?.toLowerCase().includes("save") || target.value?.toLowerCase().includes("continue") || target.getAttribute("aria-label")?.toLowerCase().includes("save") || target.getAttribute("aria-label")?.toLowerCase().includes("continue");
        if (isSaveButton && target.closest(".wrrapd-modal") === null) {
          if (localStorage.getItem("wrrapd-programmatic-click-to-payment") === "true") {
            console.log("[overrideSaveGiftOptionsButtons] Delegated handler: Programmatic click detected - NOT intercepting.");
            return;
          }
          const addressesChangedFlag = localStorage.getItem("wrrapd-addresses-changed") === "true";
          const addressesShown = areAddressesShownOnGiftOptionsPage();
          if (addressesShown && addressesChangedFlag) {
            console.log("[overrideSaveGiftOptionsButtons] Delegated handler: Addresses shown AND changed by script - NOT intercepting. Allowing natural flow to Payment.");
            return;
          }
          const termsAccepted = localStorage.getItem("wrrapd-terms-accepted") === "true";
          if (termsAccepted) {
            console.log("[overrideSaveGiftOptionsButtons] Delegated handler: Terms already accepted - NOT intercepting.");
            return;
          }
          console.log("[overrideSaveGiftOptionsButtons] Delegated handler caught click on save button");
          handleSaveButtonClick(event);
        }
      };
      document.body.addEventListener("click", delegatedHandler, true);
      document.body.addEventListener("mousedown", delegatedHandler, true);
      console.log("[overrideSaveGiftOptionsButtons] Event delegation handler attached to document.body (capture phase)");
      const checkAndInterceptNavigation = () => {
        const allItems = getAllItemsFromLocalStorage();
        const hasWrappedSubItem = Object.values(allItems).some(
          (product) => product.options && product.options.some((subItem) => subItem.checkbox_wrrapd)
        );
        const isPaymentPage = window.location.href.includes("/spc") || window.location.href.includes("payselect");
        const paymentSummaryExists = document.querySelector("#wrrapd-summary") !== null;
        if (hasWrappedSubItem && localStorage.getItem("wrrapd-should-change-address") !== "true" && !isPaymentPage && !paymentSummaryExists) {
          console.log("[overrideSaveGiftOptionsButtons] Detected navigation with Wrrapd items - setting flags!");
          captureGiftMessages(allItems);
          const allItemsWrrapd = checkIfAllItemsWrrapd(allItems);
          localStorage.setItem("wrrapd-should-change-address", "true");
          localStorage.setItem("wrrapd-all-items", allItemsWrrapd ? "true" : "false");
          showLoadingScreen();
        }
      };
      let lastUrl = window.location.href;
      const urlCheckInterval = setInterval(() => {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          if (!window.location.href.includes("/gift") && !window.location.href.includes("itemselect") && localStorage.getItem("wrrapd-should-change-address") !== "true") {
            checkAndInterceptNavigation();
          }
        }
      }, 100);
      setTimeout(() => clearInterval(urlCheckInterval), 3e4);
      const findButtons = async () => {
        const buttons2 = [];
        const orderSummaryButton = document.querySelector("#orderSummaryPrimaryActionBtn .a-button-input");
        if (orderSummaryButton && orderSummaryButton.closest(".wrrapd-modal") === null) {
          buttons2.push(orderSummaryButton);
          console.log("[overrideSaveGiftOptionsButtons] Found orderSummaryPrimaryActionBtn button");
        }
        let buttonInner = document.querySelector('#a-autoid-4 [data-testid=""]');
        if (!buttonInner) {
          buttonInner = document.querySelector('.a-button-inner > [data-testid=""]');
        }
        if (buttonInner && buttonInner.closest(".wrrapd-modal") === null) {
          buttons2.push(buttonInner);
          console.log("[overrideSaveGiftOptionsButtons] Found buttonInner");
        }
        if (buttons2.length === 0) {
          console.log("[overrideSaveGiftOptionsButtons] Original selectors didn't work, using AI...");
          const pageContext = 'This is the Amazon gift options page. Find the "Save gift options" or "Continue" button that saves gift options. This is the MAIN button on the page, NOT inside any modal.';
          const aiButton = await findElementWithFallback(
            "Save gift options or Continue button on Amazon gift options page (NOT in a modal)",
            [
              "#orderSummaryPrimaryActionBtn .a-button-input",
              "#orderSummaryPrimaryActionBtn button",
              "#orderSummaryPrimaryActionBtn input",
              '#a-autoid-4 [data-testid=""]',
              '.a-button-inner > [data-testid=""]',
              ".a-button-primary input",
              ".a-button-primary button",
              'button[aria-label*="save"]',
              'button[aria-label*="continue"]'
            ],
            pageContext,
            ["save gift options", "continue"]
          );
          if (aiButton && aiButton.closest(".wrrapd-modal") === null) {
            buttons2.push(aiButton);
            console.log("[overrideSaveGiftOptionsButtons] Found button via AI");
          }
        }
        return buttons2;
      };
      let buttons = await findButtons();
      buttons.forEach((button, index) => {
        console.log(`[overrideSaveGiftOptionsButtons] Attaching handler to button #${index + 1}`, button);
        button.addEventListener("click", handleSaveButtonClick, true);
        button.addEventListener("mousedown", handleSaveButtonClick, true);
        if (button.onclick) {
          const originalOnclick = button.onclick;
          button.onclick = function(e) {
            handleSaveButtonClick(e);
            if (originalOnclick) return originalOnclick.call(this, e);
          };
        }
        const form = button.closest("form");
        if (form) {
          const originalSubmit = form.submit;
          form.submit = function() {
            const syntheticEvent = new Event("click", { bubbles: true, cancelable: true });
            handleSaveButtonClick(syntheticEvent);
            return originalSubmit.call(this);
          };
          form.addEventListener("submit", handleSaveButtonClick, true);
        }
      });
      const setupButtonHandlers = async () => {
        const foundButtons = await findButtons();
        foundButtons.forEach((button, index) => {
          if (button.dataset.wrrapdHandlerAttached === "true") {
            return;
          }
          console.log(`[overrideSaveGiftOptionsButtons] Attaching handler to button #${index + 1}`, button);
          button.dataset.wrrapdHandlerAttached = "true";
          button.addEventListener("click", handleSaveButtonClick, true);
          button.addEventListener("mousedown", handleSaveButtonClick, true);
          if (button.onclick) {
            const originalOnclick = button.onclick;
            button.onclick = function(e) {
              handleSaveButtonClick(e);
              if (originalOnclick) return originalOnclick.call(this, e);
            };
          }
          const form = button.closest("form");
          if (form) {
            const originalSubmit = form.submit;
            form.submit = function() {
              const syntheticEvent = new Event("click", { bubbles: true, cancelable: true });
              handleSaveButtonClick(syntheticEvent);
              return originalSubmit.call(this);
            };
            form.addEventListener("submit", handleSaveButtonClick, true);
          }
        });
      };
      await setupButtonHandlers();
      const buttonObserver = new MutationObserver(() => {
        setupButtonHandlers();
      });
      buttonObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
      const checkInterval = setInterval(() => {
        setupButtonHandlers();
      }, 2e3);
      setTimeout(() => {
        clearInterval(checkInterval);
      }, 6e4);
      if (buttons.length === 0) {
        console.log("[overrideSaveGiftOptionsButtons] No buttons found. Setting up MutationObserver...");
        let buttonsAttached = false;
        const observer = new MutationObserver(async () => {
          if (buttonsAttached) return;
          const foundButtons = await findButtons();
          if (foundButtons.length > 0) {
            foundButtons.forEach((button, index) => {
              console.log(`[overrideSaveGiftOptionsButtons] Attaching handler to button #${index + 1} via observer`);
              button.addEventListener("click", handleSaveButtonClick);
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
        }, 15e3);
      }
    }
    function areAddressesShownOnGiftOptionsPage() {
      const addressesBelowItems = document.querySelectorAll('[class*="address"], [class*="shipping"], [data-testid*="address"]').length > 0 || Array.from(document.querySelectorAll("span, div, p, a")).some((el) => {
        const text = (el.textContent || el.innerText || "").trim();
        return text.includes("Shipping to:") && (text.includes("PO BOX 26067") || text.includes("Wrrapd"));
      });
      if (addressesBelowItems) {
        return true;
      }
      const topAddressSection = document.querySelector('[id*="address"], [class*="address-summary"], [class*="shipping-address"], [data-testid*="address"]') || Array.from(document.querySelectorAll("div, section, header")).find((el) => {
        const text = (el.textContent || el.innerText || "").trim();
        return (text.includes("Shipping address") || text.includes("Delivery address")) && (text.includes("PO BOX 26067") || text.includes("Wrrapd"));
      });
      if (topAddressSection) {
        const sectionText = (topAddressSection.textContent || topAddressSection.innerText || "").trim();
        if (sectionText.includes("PO BOX 26067") || sectionText.includes("Wrrapd")) {
          return true;
        }
      }
      const hasWrrapdAddress = Array.from(document.querySelectorAll("*")).some((el) => {
        const text = (el.textContent || el.innerText || "").trim();
        return text.includes("PO BOX 26067") && text.includes("JACKSONVILLE") && text.includes("32226");
      });
      return hasWrrapdAddress;
    }
    function checkIfAllItemsWrrapd(allItems) {
      let totalSubItems = 0;
      let wrrapdSubItems = 0;
      for (const [title, product] of Object.entries(allItems)) {
        if (!product.options) continue;
        totalSubItems += product.options.length;
        wrrapdSubItems += product.options.filter((s) => s.checkbox_wrrapd).length;
      }
      const allWrrapd = totalSubItems > 0 && wrrapdSubItems === totalSubItems;
      console.log(`[checkIfAllItemsWrrapd] Total items: ${totalSubItems}, Wrrapd items: ${wrrapdSubItems}, All Wrrapd: ${allWrrapd}`);
      return allWrrapd;
    }
    function captureGiftMessages(allItems) {
      console.log("[captureGiftMessages] Capturing gift messages and sender names");
      const items = document.querySelectorAll('#giftOptions .a-box-group .a-box-inner .a-section.a-spacing-none[id^="item-"]');
      let subItemIndexTracker = {};
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemTitleElement = item.querySelector("span.a-truncate-cut");
        if (!itemTitleElement) {
          console.warn(`[captureGiftMessages] Row #${i}: Title element not found.`);
          continue;
        }
        const itemTitle = itemTitleElement.textContent.trim().substring(0, 35);
        console.log(`[captureGiftMessages] Processing item "${itemTitle}"`);
        const productObj = allItems[itemTitle];
        if (!productObj) {
          console.warn(`[captureGiftMessages] No product found with title "${itemTitle}".`);
          continue;
        }
        if (typeof subItemIndexTracker[itemTitle] === "undefined") {
          subItemIndexTracker[itemTitle] = 0;
        }
        const currentSubIndex = subItemIndexTracker[itemTitle];
        if (currentSubIndex >= productObj.options.length) {
          console.warn(`[captureGiftMessages] Row #${i}: No remaining sub-items for "${itemTitle}".`);
          continue;
        }
        const subItem = productObj.options[currentSubIndex];
        subItemIndexTracker[itemTitle] = currentSubIndex + 1;
        if (subItem.checkbox_wrrapd) {
          const giftMessageElement = document.getElementById(`message-area-${i}`);
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
          saveItemToLocalStorage(productObj);
        }
      }
      console.log("[captureGiftMessages] Finished capturing gift messages and sender names");
    }
    function monitorAmazonGiftCheckbox(allItems) {
      console.log("[monitorAmazonGiftCheckbox] Monitoring Amazon gift checkboxes.");
      let subItemIndexTracker = {};
      const amazonGiftCheckboxes = document.querySelectorAll('input[id^="toggle-gift-item-checkbox-"]');
      if (amazonGiftCheckboxes.length === 0) {
        console.log("[monitorAmazonGiftCheckbox] No gift checkboxes found on the page.");
        return;
      }
      amazonGiftCheckboxes.forEach((checkbox, index) => {
        const itemContainer = document.querySelector(`#item-${index}`);
        if (!itemContainer) {
          console.log(`[monitorAmazonGiftCheckbox] Row #${index}: Item container not found.`);
          return;
        }
        let itemTitleElement = itemContainer.querySelector("span.a-truncate-cut") || itemContainer.querySelector("span.a-truncate-full") || itemContainer.querySelector("a.a-link-normal.a-color-base") || itemContainer.querySelector(".a-text-bold") || itemContainer.querySelector('span[class*="truncate"]') || itemContainer.querySelector("h2") || itemContainer.querySelector("h3") || itemContainer.querySelector("[data-item-title]") || itemContainer.querySelector(".item-title") || itemContainer.querySelector('a[href*="/dp/"]') || itemContainer.querySelector('a[href*="/gp/product/"]');
        if (!itemTitleElement) {
          console.warn(`[monitorAmazonGiftCheckbox] Row #${index}: Title element not found. Trying to find any text in container...`);
          const allLinks = itemContainer.querySelectorAll("a");
          for (const link of allLinks) {
            const linkText = (link.textContent || link.innerText || "").trim();
            if (linkText.length > 10 && linkText.length < 200 && !linkText.toLowerCase().includes("remove") && !linkText.toLowerCase().includes("gift")) {
              itemTitleElement = link;
              break;
            }
          }
        }
        if (!itemTitleElement) {
          console.warn(`[monitorAmazonGiftCheckbox] Row #${index}: Title element not found. Skipping this row.`);
          return;
        }
        const itemTitle = (itemTitleElement.textContent || itemTitleElement.innerText || "").trim().substring(0, 35);
        if (!itemTitle || itemTitle.length < 5) {
          console.warn(`[monitorAmazonGiftCheckbox] Row #${index}: Unable to retrieve title. Element found but no text. Selector: ${itemTitleElement.tagName}.${itemTitleElement.className}`);
          console.warn(`[monitorAmazonGiftCheckbox] Row #${index}: Element HTML: ${itemTitleElement.outerHTML.substring(0, 200)}`);
          return;
        }
        const productObj = allItems[itemTitle];
        if (!productObj || !productObj.options || productObj.options.length === 0) {
          console.error(`[monitorAmazonGiftCheckbox] Row #${index}: No matching product or no sub-items for "${itemTitle}".`);
          return;
        }
        const currentSubIndex = subItemIndexTracker[itemTitle] || 0;
        if (currentSubIndex >= productObj.options.length) {
          console.warn(`[monitorAmazonGiftCheckbox] Row #${index}: No remaining sub-items for "${itemTitle}".`);
          return;
        }
        const subItem = productObj.options[currentSubIndex];
        subItemIndexTracker[itemTitle] = currentSubIndex + 1;
        checkbox.addEventListener("change", function() {
          console.log(`[monitorAmazonGiftCheckbox] Row #${index} ("${itemTitle}") changed. Checked: ${this.checked}`);
          if (!this.checked) {
            console.log(`[monitorAmazonGiftCheckbox] Resetting Wrrapd options for subItem #${currentSubIndex} of "${itemTitle}".`);
            subItem.checkbox_wrrapd = false;
            subItem.checkbox_flowers = false;
            subItem.checkbox_amazon_combine = false;
            subItem.selected_wrapping_option = "wrrapd";
            subItem.selected_flower_design = null;
            saveItemToLocalStorage(productObj);
            console.log(`[monitorAmazonGiftCheckbox] All Wrrapd options reset for subItem #${currentSubIndex} of "${itemTitle}" in localStorage and UI.`);
          } else {
            console.log(`[monitorAmazonGiftCheckbox] Row #${index} ("${itemTitle}") is now checked as a gift.`);
            insertWrrapdOptions(allItems);
          }
        });
      });
    }
    async function insertWrrapdOptions(allItems) {
      let subItemIndexTracker = {};
      let items = Array.from(document.querySelectorAll('#giftOptions .a-box-group .a-box-inner .a-section.a-spacing-none[id^="item-"]'));
      if (items.length === 0) {
        items = Array.from(document.querySelectorAll('[data-testid*="gift"] [id^="item-"]'));
      }
      if (items.length === 0) {
        items = Array.from(document.querySelectorAll('[id^="item-"]'));
        if (items.length > 0) {
          items = items.filter((item) => {
            const hasGiftContent = item.querySelector('input[type="checkbox"][id*="gift"], input[type="checkbox"][name*="gift"], [class*="gift"], [id*="gift"]');
            const hasProductTitle = item.textContent && item.textContent.trim().length > 20;
            return hasGiftContent || hasProductTitle;
          });
        }
      }
      if (items.length === 0) {
        const giftWrapCheckboxes = document.querySelectorAll('input[id*="gift-wrap"], input[id*="giftWrap"], input[type="checkbox"][name*="gift"], input[type="checkbox"][id*="gift"], label[for*="gift"]');
        if (giftWrapCheckboxes.length > 0) {
          items = Array.from(giftWrapCheckboxes).map((checkbox) => {
            let container = checkbox.closest('[id^="item-"]') || checkbox.closest('[data-testid*="item"]') || checkbox.closest('[class*="item"]') || checkbox.closest(".a-section") || checkbox.closest('[class*="product"]') || checkbox.closest('div[class*="gift"]') || checkbox.closest("section") || checkbox.parentElement?.parentElement;
            return container;
          }).filter(Boolean);
          items = Array.from(new Set(items));
        }
      }
      if (items.length === 0 && Object.keys(allItems).length > 0) {
        const savedTitles = Object.keys(allItems);
        const allTextElements = document.querySelectorAll("span, div, p, h1, h2, h3, h4, a");
        for (const savedTitle of savedTitles) {
          const normalizedSavedTitle = savedTitle.toLowerCase().replace(/\s+/g, " ").trim().substring(0, 30);
          for (const el of allTextElements) {
            const text = el.innerText?.trim() || "";
            const normalizedText = text.toLowerCase().replace(/\s+/g, " ").trim().substring(0, 30);
            if (normalizedText === normalizedSavedTitle && text.length > 10) {
              let container = el.closest('[id^="item-"]') || el.closest('[class*="item"]') || el.closest(".a-section") || el.closest("section") || el.parentElement?.parentElement;
              if (container && !Array.from(items).includes(container)) {
                items.push(container);
              }
            }
          }
        }
      }
      if (items.length === 0) {
        console.warn("[insertWrrapdOptions] \u26A0\uFE0F No gift options found with standard selectors.");
        try {
          const aiSelector = await findElementWithAI(
            "gift options item container for each product on Amazon gift options page",
            "This is the Amazon gift options page in the new checkout flow. Each product should have its own container with gift-wrap checkbox options. Find the CSS selector for the container that holds each product's gift options."
          );
          if (aiSelector) {
            items = Array.from(document.querySelectorAll(aiSelector));
          }
        } catch (err) {
          console.warn("[insertWrrapdOptions] AI selector detection failed:", err);
        }
      }
      if (items.length === 0) {
        console.warn("[insertWrrapdOptions] \u26A0\uFE0F No gift options found on the page with any selector.");
        console.warn("[insertWrrapdOptions] Will retry in 3 seconds...");
        setTimeout(() => {
          insertWrrapdOptions(allItems);
        }, 3e3);
        return;
      }
      console.log(`[insertWrrapdOptions] \u2713 Found ${items.length} gift option item(s) - proceeding to insert Wrrapd options`);
      subItemIndexTracker = {};
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        let itemTitleElement = null;
        let itemTitle = "";
        const savedTitles = Object.keys(allItems);
        itemTitleElement = item.querySelector('span.a-truncate-cut, h3, h4, [class*="title"], [class*="product-name"], [data-testid*="title"]');
        if (itemTitleElement && itemTitleElement.innerText?.trim()) {
          itemTitle = itemTitleElement.innerText.trim().substring(0, 35);
        }
        if (!itemTitle || itemTitle.length < 5) {
          const allTextElements = item.querySelectorAll("span, div, p, h1, h2, h3, h4, a, label");
          for (const el of allTextElements) {
            const text = el.innerText?.trim() || el.textContent?.trim() || "";
            if (text.length < 10 || text.length > 200) continue;
            if (text.includes("$") || text.includes("checkbox") || text.toLowerCase().includes("gift") || text.toLowerCase().includes("select")) continue;
            const normalizedText = text.toLowerCase().replace(/\s+/g, " ").trim();
            for (const savedTitle of savedTitles) {
              const normalizedSavedTitle = savedTitle.toLowerCase().replace(/\s+/g, " ").trim();
              if (normalizedText === normalizedSavedTitle || normalizedText.substring(0, 30) === normalizedSavedTitle.substring(0, 30) || normalizedText.includes(normalizedSavedTitle) || normalizedSavedTitle.includes(normalizedText)) {
                itemTitleElement = el;
                itemTitle = savedTitle;
                break;
              }
            }
            if (itemTitle && itemTitle.length >= 5) break;
          }
        }
        if (!itemTitle || itemTitle.length < 5) {
          const allTextElements = item.querySelectorAll("span, div, p, h1, h2, h3, h4, a");
          let bestMatch = null;
          let bestLength = 0;
          for (const el of allTextElements) {
            const text = el.innerText?.trim() || el.textContent?.trim() || "";
            if (text.length > 15 && text.length < 150 && !text.includes("$") && !text.includes("checkbox") && !text.toLowerCase().includes("gift") && !text.toLowerCase().includes("select") && !text.match(/^\d+$/) && // Not just numbers
            text.length > bestLength) {
              bestMatch = el;
              bestLength = text.length;
            }
          }
          if (bestMatch) {
            itemTitleElement = bestMatch;
            itemTitle = bestMatch.innerText?.trim() || bestMatch.textContent?.trim() || "";
            itemTitle = itemTitle.substring(0, 35);
          }
        }
        if (itemTitleElement && (!itemTitle || itemTitle.length < 5)) {
          itemTitle = itemTitleElement.innerText?.trim() || itemTitleElement.textContent?.trim() || "";
          itemTitle = itemTitle.substring(0, 35);
        }
        if (!itemTitle || itemTitle.length < 5) {
          if (i < savedTitles.length) {
            itemTitle = savedTitles[i];
          } else {
            console.warn(`[insertWrrapdOptions] \u26A0\uFE0F Skipping row #${i}: Title not found and no saved title at position ${i}.`);
            continue;
          }
        }
        let productObj = allItems[itemTitle];
        if (!productObj) {
          const savedTitles2 = Object.keys(allItems);
          for (const savedTitle of savedTitles2) {
            const normalizedPageTitle = itemTitle.toLowerCase().replace(/\s+/g, " ").trim();
            const normalizedSavedTitle = savedTitle.toLowerCase().replace(/\s+/g, " ").trim();
            if (normalizedPageTitle.substring(0, 30) === normalizedSavedTitle.substring(0, 30) || normalizedPageTitle.includes(normalizedSavedTitle) || normalizedSavedTitle.includes(normalizedPageTitle)) {
              productObj = allItems[savedTitle];
              break;
            }
          }
        }
        if (!productObj) {
          const savedTitles2 = Object.keys(allItems);
          if (i < savedTitles2.length) {
            productObj = allItems[savedTitles2[i]];
          }
        }
        if (!productObj) {
          console.warn(`[insertWrrapdOptions] \u26A0\uFE0F Skipping row #${i}: No matching data found for title "${itemTitle}".`);
          continue;
        }
        if (!productObj.options || productObj.options.length === 0) {
          continue;
        }
        const nextIndex = subItemIndexTracker[itemTitle] || 0;
        if (nextIndex >= productObj.options.length) {
          continue;
        }
        const subItem = productObj.options[nextIndex];
        subItemIndexTracker[itemTitle] = nextIndex + 1;
        const giftOptionsContainer = item.querySelector(".a-section.a-spacing-micro.a-spacing-top-mini");
        const emailRecipientCheckbox = item.querySelector(`input#digital-gift-message-checkbox-${i}`);
        const amazonGiftBagCheckbox = item.querySelector(`input#gift-wrap-checkbox-${i}`);
        if (!giftOptionsContainer) {
          continue;
        }
        let wrrapdOptionDiv = giftOptionsContainer.querySelector(".wrrapd-option");
        if (!wrrapdOptionDiv) {
          wrrapdOptionDiv = document.createElement("div");
          wrrapdOptionDiv.className = "a-section a-spacing-small a-spacing-top-small a-padding-none wrrapd-option";
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
              const giftBagImage = item.querySelector('img[alt*="gift"]') || item.querySelector('img[src*="gift"]') || item.querySelector('img[src*="bag"]');
              if (giftBagImage) {
                insertionPoint = giftBagImage.closest(".a-section") || giftBagImage.closest(".a-box-group") || giftBagImage.parentNode;
              }
              if (!insertionPoint) {
                insertionPoint = amazonGiftBagCheckbox.parentNode;
              }
            }
            if (insertionPoint) {
              insertionPoint.insertAdjacentElement("afterend", wrrapdOptionDiv);
            } else if (giftOptionsContainer) {
              giftOptionsContainer.appendChild(wrrapdOptionDiv);
            } else {
              item.appendChild(wrrapdOptionDiv);
            }
            const modalDiv = document.createElement("div");
            modalDiv.id = `wrrapd-modal-${i}`;
            modalDiv.className = "wrrapd-modal";
            modalDiv.style.display = "none";
            modalDiv.style.position = "fixed";
            modalDiv.style.top = "0";
            modalDiv.style.left = "0";
            modalDiv.style.width = "100%";
            modalDiv.style.height = "100%";
            modalDiv.style.backgroundColor = "rgba(0,0,0,0.7)";
            modalDiv.style.zIndex = "1000";
            modalDiv.style.justifyContent = "center";
            modalDiv.style.alignItems = "center";
            modalDiv.innerHTML = `
                        <div class="wrrapd-modal-content" style="background-color: white; padding: 20px; border-radius: 8px; width: 80%; max-width: 800px; 
                            max-height: 90vh; overflow-y: auto; position: relative;">
                            <button class="modal-close" style="position: absolute; right: 10px; top: 10px; border: none; background: none; 
                                font-size: 24px; cursor: pointer;">\xD7</button>
                            
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
                                        ${[1, 2, 3, 4].map((num) => `
                                            <label style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
                                                <input type="radio" name="flower-design-${i}" value="flowers-${num}" 
                                                    style="margin-bottom: 10px;">
                                                <img src="${chrome.runtime.getURL(`assets/flowers/flowers-${num}.webp`)}" 
                                                    alt="Flowers ${num}" 
                                                    style="width: 150px; height: 150px; border-radius: 4px; object-fit: cover;" 
                                                    class="flower-image-${i}-${num}">
                                            </label>
                                        `).join("")}
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
            document.body.appendChild(modalDiv);
            const modal = document.getElementById(`wrrapd-modal-${i}`);
            const wrrapdCheckbox = document.getElementById(`wrrapd-checkbox-${i}`);
            const closeBtn = modal?.querySelector(".modal-close");
            const saveBtn = modal?.querySelector(".modal-save");
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
            if (wrrapdCheckbox) {
              wrrapdCheckbox.checked = subItem.checkbox_wrrapd ?? false;
              if (subItem.selected_wrapping_option) {
                const selectedOption = modal.querySelector(`input[name="wrapping-option-${i}"][value="${subItem.selected_wrapping_option}"]`);
                if (selectedOption) {
                  selectedOption.checked = true;
                  selectedOption.dispatchEvent(new Event("change"));
                }
              }
            }
            const combineWithFlowersCheckbox = document.getElementById(`combine-with-flowers-${i}`);
            const combineWithAmazonCheckbox = document.getElementById(`combine-with-amazon-${i}`);
            const wrrapdSteps = document.getElementById(`wrrapd-steps-${i}`);
            const amazonInstructions = document.getElementById(`amazon-instructions-${i}`);
            if (wrrapdSteps) {
              wrrapdSteps.style.display = wrrapdCheckbox.checked ? "block" : "none";
            }
            if (combineWithFlowersCheckbox) {
              combineWithFlowersCheckbox.checked = subItem.checkbox_flowers ?? false;
            }
            if (combineWithAmazonCheckbox) {
              combineWithAmazonCheckbox.checked = subItem.checkbox_amazon_combine ?? false;
              if (amazonInstructions) {
                amazonInstructions.style.display = combineWithAmazonCheckbox.checked ? "block" : "none";
              }
            }
            const uncheckWrrapdAndUpdateStorage = () => {
              wrrapdCheckbox.checked = false;
              subItem.checkbox_wrrapd = false;
              saveItemToLocalStorage(productObj);
            };
            wrrapdCheckbox.addEventListener("click", function(e) {
              e.stopPropagation();
              e.stopImmediatePropagation();
            }, true);
            wrrapdCheckbox.addEventListener("change", function(e) {
              e.stopPropagation();
              e.stopImmediatePropagation();
              if (this.checked) {
                modal.style.display = "flex";
                subItem.checkbox_wrrapd = true;
                saveItemToLocalStorage(productObj);
              } else {
                modal.style.display = "none";
                subItem.checkbox_wrrapd = false;
                saveItemToLocalStorage(productObj);
              }
            });
            const label = wrrapdCheckbox.closest("label");
            if (label) {
              label.addEventListener("click", function(e) {
                e.stopPropagation();
                e.stopImmediatePropagation();
                if (e.target !== wrrapdCheckbox && e.target.tagName !== "INPUT") {
                  e.preventDefault();
                  wrrapdCheckbox.checked = !wrrapdCheckbox.checked;
                  wrrapdCheckbox.dispatchEvent(new Event("change"));
                }
              }, true);
            }
            wrrapdOptionDiv.addEventListener("click", function(e) {
              if (e.target.closest(".wrrapd-option") || e.target.id === `wrrapd-checkbox-${i}`) {
                e.stopPropagation();
                e.stopImmediatePropagation();
              }
            }, true);
            if (closeBtn) {
              closeBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                modal.style.display = "none";
                uncheckWrrapdAndUpdateStorage();
              }, true);
            }
            if (saveBtn) {
              saveBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.wrrapdModalSave = true;
                const occasionInput2 = document.getElementById(`occasion-input-${i}`);
                if (occasionInput2?.value) {
                  subItem.occasion = occasionInput2.value.trim();
                }
                const selectedWrappingOption = modal.querySelector(`input[name="wrapping-option-${i}"]:checked`);
                if (selectedWrappingOption) {
                  subItem.selected_wrapping_option = selectedWrappingOption.value;
                }
                const combineWithFlowersCheckbox2 = document.getElementById(`combine-with-flowers-${i}`);
                if (combineWithFlowersCheckbox2) {
                  subItem.checkbox_flowers = combineWithFlowersCheckbox2.checked;
                }
                const combineWithAmazonCheckbox2 = document.getElementById(`combine-with-amazon-${i}`);
                if (combineWithAmazonCheckbox2) {
                  subItem.checkbox_amazon_combine = combineWithAmazonCheckbox2.checked;
                }
                const selectedFlowerDesign = modal.querySelector(`input[name="flower-design-${i}"]:checked`);
                if (selectedFlowerDesign) {
                  subItem.selected_flower_design = selectedFlowerDesign.value;
                }
                saveItemToLocalStorage(productObj);
                modal.style.display = "none";
                return false;
              }, true);
            }
            modal.addEventListener("click", (e) => {
              if (e.target === modal) {
                const previewContainer = document.getElementById(`image-preview-${i}`);
                if (previewContainer?.dataset.blobUrl) {
                  URL.revokeObjectURL(previewContainer.dataset.blobUrl);
                }
                modal.style.display = "none";
                uncheckWrrapdAndUpdateStorage();
                return;
              }
              let target = e.target;
              while (target && target !== modal) {
                const tagName = target.tagName?.toLowerCase();
                if (["button", "input", "select", "textarea", "a", "label"].includes(tagName)) {
                  return;
                }
                target = target.parentElement;
              }
              if (e.target.closest(".wrrapd-modal-content")) {
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.wrrapdModalClick = true;
              }
            }, true);
            combineWithFlowersCheckbox?.addEventListener("change", function() {
              subItem.checkbox_flowers = this.checked;
              saveItemToLocalStorage(productObj);
              const flowerDesignsDiv = document.getElementById(`flower-designs-${i}`);
              if (flowerDesignsDiv) {
                flowerDesignsDiv.style.display = this.checked ? "block" : "none";
              }
            });
            combineWithAmazonCheckbox?.addEventListener("change", function() {
              subItem.checkbox_amazon_combine = this.checked;
              saveItemToLocalStorage(productObj);
              if (amazonInstructions) {
                amazonInstructions.style.display = this.checked ? "block" : "none";
              }
            });
            const flowerDesignRadios = document.querySelectorAll(`input[name="flower-design-${i}"]`);
            flowerDesignRadios.forEach((radio) => {
              radio.addEventListener("change", function() {
                if (this.checked) {
                  subItem.selected_flower_design = this.value;
                  saveItemToLocalStorage(productObj);
                }
              });
            });
            const wrappingOptions = modal.querySelectorAll(`input[name="wrapping-option-${i}"]`);
            const uploadBtn = document.getElementById(`upload-btn-${i}`);
            const fileInput = document.getElementById(`design-upload-${i}`);
            const aiOptions = document.getElementById(`ai-options-${i}`);
            wrappingOptions.forEach((option) => {
              option.addEventListener("change", function() {
                uploadBtn.style.display = "none";
                fileInput.style.display = "none";
                aiOptions.style.display = "none";
                subItem.selected_wrapping_option = this.value;
                saveItemToLocalStorage(productObj);
                if (this.value === "upload") {
                  uploadBtn.style.display = "block";
                  fileInput.style.display = "block";
                } else if (this.value === "ai") {
                  aiOptions.style.display = "block";
                }
              });
            });
            fileInput?.addEventListener("change", function() {
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
                uploadBtn.textContent = "Upload";
                uploadBtn.disabled = false;
                const previewContainer = document.getElementById(`image-preview-${i}`);
                const previewImage = previewContainer.querySelector("img");
                const imageUrl = URL.createObjectURL(file);
                previewImage.src = imageUrl;
                previewContainer.style.display = "block";
                previewContainer.dataset.blobUrl = imageUrl;
              }
            });
            uploadBtn?.addEventListener("click", async function() {
              if (!fileInput?.files || !fileInput.files[0]) return;
              const file = fileInput.files[0];
              const MAX_FILE_SIZE = 5 * 1024 * 1024;
              if (file.size > MAX_FILE_SIZE) {
                alert("File size exceeds 5MB limit. Please select a smaller file.");
                return;
              }
              this.textContent = "Processing...";
              this.disabled = true;
              try {
                subItem.selected_file = {
                  name: file.name,
                  type: file.type,
                  lastModified: file.lastModified
                };
                saveItemToLocalStorage(productObj);
                this.textContent = "Selected";
                this.disabled = true;
              } catch (error) {
                console.error("Error processing file:", error);
                this.textContent = "Try Again";
                this.disabled = false;
              }
            });
            const generateBtn = modal.querySelector(".generate-btn");
            const aiDesignsContainer = document.getElementById(`ai-designs-${i}`);
            const occasionInput = document.getElementById(`occasion-input-${i}`);
            generateBtn?.addEventListener("click", async function() {
              if (!occasionInput?.value) {
                alert("Please fill in the occasion first!");
                occasionInput?.focus();
                return;
              }
              try {
                this.textContent = "Generating...";
                this.disabled = true;
                aiDesignsContainer.innerHTML = `
                                <div style="text-align: center; padding: 40px; color: #666;">
                                    <div style="font-size: 16px; margin-bottom: 10px;">\u2728 Creating your custom designs...</div>
                                    <div style="font-size: 14px; color: #999;">This may take 1-2 minutes while we generate images</div>
                                    <div style="margin-top: 20px;">
                                        <div style="display: inline-block; width: 200px; height: 4px; background: #f0f0f0; border-radius: 2px; overflow: hidden;">
                                            <div id="progress-bar" style="width: 0%; height: 100%; background: #f0c14b; transition: width 0.3s;"></div>
                                        </div>
                                    </div>
                                    </div>
                                `;
                let progress = 0;
                const progressInterval = setInterval(() => {
                  progress = Math.min(progress + 2, 90);
                  const progressBar = document.getElementById("progress-bar");
                  if (progressBar) {
                    progressBar.style.width = progress + "%";
                  }
                }, 2e3);
                console.log("[AI Design Generation] Sending request to api.wrrapd.com/generate-ideas");
                console.log("[AI Design Generation] Payload:", JSON.stringify({ occasion: occasionInput.value }));
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                  console.error("[AI Design Generation] Request timeout after 4 minutes");
                  controller.abort();
                }, 24e4);
                const response = await fetch("https://api.wrrapd.com/generate-ideas", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    occasion: occasionInput.value
                  }),
                  signal: controller.signal
                });
                clearTimeout(timeoutId);
                console.log("[AI Design Generation] Response status:", response.status);
                console.log("[AI Design Generation] Response headers:", Object.fromEntries(response.headers.entries()));
                const rawData = await response.text();
                console.log("[AI Design Generation] Raw response:", rawData.substring(0, 500));
                if (!response.ok) {
                  console.error("[AI Design Generation] Server error - Status:", response.status);
                  console.error("[AI Design Generation] Server error - Response:", rawData);
                  throw new Error(`Server error (${response.status}): ${rawData.substring(0, 200)}`);
                }
                const data = JSON.parse(JSON.parse(rawData));
                console.log("[AI Design Generation] Parsed data:", data);
                console.log("[AI Design Generation] Number of designs:", data.designs?.length);
                data.designs?.forEach((design, idx) => {
                  console.log(`[AI Design Generation] Design ${idx + 1}:`, {
                    title: design.title,
                    hasDescription: !!design.description,
                    hasImageUrl: !!design.imageUrl,
                    imageUrl: design.imageUrl
                  });
                });
                const prompt = occasionInput.value;
                console.log("[AI Design Generation] Designs generated. Will save selected design when user chooses one.");
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
                                                             onload="console.log('[AI Design Generation] Image loaded successfully:', this.src);"
                                                             onerror="console.error('[AI Design Generation] Failed to load image:', this.src); this.parentElement.innerHTML='<div style=\\'padding: 20px; text-align: center; color: #999; border: 1px dashed #ddd; border-radius: 4px;\\'>Image unavailable<br><small>URL: ' + this.src.substring(0, 50) + '...</small></div>';">
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
                                        `).join("")}
                                    </div>
                                </div>
                            `;
                const designRadios = aiDesignsContainer.querySelectorAll(`input[name="ai-design-${i}"]`);
                designRadios.forEach((radio, idx) => {
                  radio.addEventListener("change", async function() {
                    if (this.checked) {
                      const selectedDesign = data.designs[idx];
                      let orderNumber = localStorage.getItem("wrrapd-order-number");
                      if (!orderNumber) {
                        const zipCode = subItem.shippingAddress?.postalCode || "00000";
                        orderNumber = generateOrderNumber(zipCode);
                        localStorage.setItem("wrrapd-order-number", orderNumber);
                        console.log("[AI Design Generation] Generated order number:", orderNumber);
                      }
                      const subItemIndex = productObj.options.findIndex((opt) => opt === subItem);
                      if (selectedDesign.imageBase64) {
                        try {
                          console.log("[AI Design Generation] Saving selected design image to GCS with order number and upscaling...");
                          const saveResponse = await fetch("https://api.wrrapd.com/api/save-ai-design", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                              imageBase64: selectedDesign.imageBase64,
                              designTitle: selectedDesign.title,
                              itemTitle: productObj.title,
                              orderNumber,
                              prompt: occasionInput.value || prompt,
                              folder: "designs",
                              asin: productObj.asin,
                              index: subItemIndex,
                              shouldUpscale: true
                              // Upscale selected design to 4x (up to 4MP)
                            })
                          });
                          if (saveResponse.ok) {
                            const saveData = await saveResponse.json();
                            console.log("[AI Design Generation] Selected design image saved to GCS:", saveData.filePath);
                            subItem.selected_ai_design = {
                              title: selectedDesign.title,
                              description: selectedDesign.description,
                              gcsPath: saveData.filePath,
                              gcsUrl: saveData.publicUrl,
                              orderNumber
                            };
                            const unusedDesigns = data.designs.filter((d, i2) => i2 !== idx);
                            console.log(`[AI Design Generation] Saving ${unusedDesigns.length} unused designs in background...`);
                            unusedDesigns.forEach(async (design, unusedIdx) => {
                              if (design.imageBase64) {
                                try {
                                  const unusedResponse = await fetch("https://api.wrrapd.com/api/save-ai-design", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json"
                                    },
                                    body: JSON.stringify({
                                      imageBase64: design.imageBase64,
                                      designTitle: design.title,
                                      itemTitle: productObj.title,
                                      prompt: occasionInput.value || prompt,
                                      folder: "designs/unused-designs",
                                      asin: productObj.asin,
                                      shouldUpscale: false
                                      // No upscaling for unselected designs
                                    }),
                                    signal: AbortSignal.timeout(6e4)
                                    // 60 second timeout
                                  });
                                  if (unusedResponse.ok) {
                                    console.log(`[AI Design Generation] \u2713 Saved unused design "${design.title}" to unused-designs`);
                                  } else {
                                    console.warn(`[AI Design Generation] Failed to save unused design "${design.title}": ${unusedResponse.status}`);
                                  }
                                } catch (error) {
                                  if (error.name !== "AbortError") {
                                    console.warn(`[AI Design Generation] Error saving unused design "${design.title}":`, error.message);
                                  }
                                }
                              }
                            });
                          } else {
                            console.error("[AI Design Generation] Failed to save image to GCS:", await saveResponse.text());
                            subItem.selected_ai_design = {
                              title: selectedDesign.title,
                              description: selectedDesign.description,
                              orderNumber
                            };
                          }
                        } catch (error) {
                          console.error("[AI Design Generation] Error saving image to GCS:", error);
                          subItem.selected_ai_design = {
                            title: selectedDesign.title,
                            description: selectedDesign.description,
                            orderNumber
                          };
                        }
                      } else {
                        subItem.selected_ai_design = {
                          title: selectedDesign.title,
                          description: selectedDesign.description,
                          orderNumber
                        };
                      }
                      saveItemToLocalStorage(productObj);
                    }
                  });
                });
              } catch (error) {
                console.error("[AI Design Generation] Error generating designs:", error);
                console.error("[AI Design Generation] Error stack:", error.stack);
                let errorMessage = "Failed to generate designs. Please try again.";
                if (error.message && error.message.includes("Server error")) {
                  errorMessage = error.message;
                }
                aiDesignsContainer.innerHTML = `
                                <div style="color: #d00; text-align: center; margin-top: 20px; padding: 15px; border: 1px solid #d00; border-radius: 4px;">
                                    <div style="font-weight: bold; margin-bottom: 8px;">\u26A0\uFE0F Error</div>
                                    <div>${errorMessage}</div>
                                        <div style="margin-top: 10px; font-size: 0.9em; color: #666;">
                                        Check the browser console (F12) for more details.
                                        </div>
                                </div>
                            `;
              } finally {
                this.textContent = "Generate Designs";
                this.disabled = false;
              }
            });
            occasionInput?.addEventListener("change", function() {
              subItem.occasion = this.value;
              saveItemToLocalStorage(productObj);
            });
            if (occasionInput) {
              occasionInput.value = subItem.occasion || "";
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
    async function isZipCodeAllowed(subItem) {
      console.log("[isZipCodeAllowed] Checking if zip code is allowed.");
      const zipCode = subItem?.shippingAddress?.postalCode;
      if (!zipCode) {
        console.log("[isZipCodeAllowed] No postalCode found, returning false.");
        return false;
      }
      if (!zipCodesLoaded) {
        await loadAllowedZipCodes();
      }
      const isAllowed = allowedZipCodes.includes(zipCode);
      console.log(`[isZipCodeAllowed] Zip code "${zipCode}" allowed: ${isAllowed}`);
      return isAllowed;
    }
    function singleSelectAddress() {
      console.log("[singleSelectAddress] Starting single address selection page processing.");
      singleSelectAddressLogic();
      extractDefaultAddress();
    }
    function singleSelectAddressLogic() {
      const allItems = getAllItemsFromLocalStorage();
      const topButton = document.querySelector("#orderSummaryPrimaryActionBtn .a-button-input");
      if (!topButton) {
        console.log("[singleSelectAddress] Top button not found.");
      } else {
        topButton.addEventListener("click", () => {
          console.log("[singleSelectAddress] Top button clicked.");
          scrapeShippingAddressOnSingle(allItems);
        });
      }
      const bottomButton = document.querySelector('input[data-testid="Address_selectShipToThisAddress"]');
      if (!bottomButton) {
        console.log("[singleSelectAddress] Bottom button not found.");
      } else {
        bottomButton.addEventListener("click", () => {
          console.log("[singleSelectAddress] Bottom button clicked.");
          scrapeShippingAddressOnSingle(allItems);
        });
      }
    }
    function scrapeShippingAddressOnSingle(allItems) {
      console.log("[scrapeShippingAddressOnSingle] Scraping shipping address on single address selection page.");
      const selectedNameElement = document.querySelector(".list-address-selected .a-text-bold > .break-word");
      const selectedAddressElement = document.querySelector(".list-address-selected .a-label > .break-word");
      const name = selectedNameElement ? selectedNameElement.innerText.trim() : null;
      const fullAddress = selectedAddressElement ? selectedAddressElement.innerText.trim() : null;
      if (fullAddress) {
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
          Object.keys(allItems).forEach((titleKey) => {
            const productObj = allItems[titleKey];
            if (!productObj.options) {
              productObj.options = [];
            }
            productObj.options.forEach((subItem) => {
              subItem.shippingAddress = addressObject;
            });
          });
          localStorage.setItem("wrrapd-items", JSON.stringify(allItems));
          console.log("[scrapeShippingAddressOnSingle] Address saved to localStorage:", addressObject);
        } else {
          console.error("[scrapeShippingAddressOnSingle] Unable to parse the address with the provided regex.");
        }
      } else {
        console.error("[scrapeShippingAddressOnSingle] No address found on the page.");
      }
    }
    function extractDefaultAddress() {
      console.log("[extractDefaultAddress] Extracting default address from the page.");
      const defaultNameElement = document.querySelector(".list-address-selected .a-text-bold > .break-word");
      const defaultAddressElement = document.querySelector(".list-address-selected .a-label > .break-word");
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
          localStorage.setItem("wrrapd-default-address", JSON.stringify(addressObject));
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
    function observeDomChanges(callback) {
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
    function createOverlayButton2(originalButton, callback, overlayId) {
      originalButton.style.pointerEvents = "none";
      originalButton.disabled = true;
      if (document.getElementById(overlayId)) {
        return;
      }
      const overlayButton = document.createElement("button");
      overlayButton.id = overlayId;
      overlayButton.style.position = "absolute";
      overlayButton.style.top = `${originalButton.offsetTop}px`;
      overlayButton.style.left = `${originalButton.offsetLeft}px`;
      overlayButton.style.width = `${originalButton.offsetWidth}px`;
      overlayButton.style.height = `${originalButton.offsetHeight}px`;
      overlayButton.style.backgroundColor = "transparent";
      overlayButton.style.border = "none";
      overlayButton.style.cursor = "pointer";
      overlayButton.style.zIndex = "1000";
      overlayButton.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        await callback();
      };
      originalButton.parentNode.appendChild(overlayButton);
    }
    function attachOverlayButtons(allItems) {
      console.log("[attachOverlayButtons] Searching Amazon buttons...");
      const addressesAlreadyChanged = localStorage.getItem("wrrapd-addresses-changed") === "true";
      const shouldChangeAddress = localStorage.getItem("wrrapd-should-change-address") === "true";
      if (addressesAlreadyChanged || shouldChangeAddress) {
        if (addressesAlreadyChanged) {
          console.log("[attachOverlayButtons] \u2713 Addresses already changed. Letting Amazon proceed naturally to payment (GOLD VERSION workflow).");
        } else {
          console.log("[attachOverlayButtons] \u2713 In address-changing flow. NOT intercepting buttons - will let Amazon proceed naturally after addresses are changed.");
        }
        console.log("[attachOverlayButtons] NOT intercepting buttons - Amazon will proceed to payment page.");
        return;
      }
      console.log("[attachOverlayButtons] First visit to multi-address page. Will intercept to scrape addresses and redirect to gift options.");
      const topButton = document.querySelector("#orderSummaryPrimaryActionBtn .a-button-input");
      const bottomButton = document.querySelector('.a-button-inner > [data-testid=""]');
      if (!topButton) {
      } else {
        createOverlayButton2(
          topButton,
          async () => {
            console.log("[attachOverlayButtons] Top button clicked. Starting scraping...");
            await scrapeShippingAddressOnMulti(allItems);
            console.log("[attachOverlayButtons] Scraping completed. Redirecting to gift options page...");
            window.location.href = "https://www.amazon.com/gp/buy/gift/handlers/display.html";
          },
          "fake-button-top"
        );
      }
      if (!bottomButton) {
      } else {
        createOverlayButton2(
          bottomButton,
          async () => {
            console.log("[attachOverlayButtons] Bottom button clicked. Starting scraping...");
            await scrapeShippingAddressOnMulti(allItems);
            console.log("[attachOverlayButtons] Scraping completed. Redirecting to gift options page...");
            window.location.href = "https://www.amazon.com/gp/buy/gift/handlers/display.html";
          },
          "fake-button-bottom"
        );
      }
    }
    function multiSelectAddress(allItems) {
      console.log("[multiSelectAddress] Starting multi address selection page processing.");
      showLoadingScreen();
      attachOverlayButtons(allItems);
      selectAddressesForItemsSimple(allItems);
    }
    let wrrapdAddressCache = null;
    function waitForElement(selector, timeout = 2e3, multiple = false) {
      return new Promise((resolve) => {
        const element = multiple ? document.querySelectorAll(selector) : document.querySelector(selector);
        if (multiple && element.length > 0 || !multiple && element) {
          return resolve(element);
        }
        const observer = new MutationObserver(() => {
          const element2 = multiple ? document.querySelectorAll(selector) : document.querySelector(selector);
          if (multiple && element2.length > 0 || !multiple && element2) {
            observer.disconnect();
            resolve(element2);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(multiple ? [] : null);
        }, timeout);
      });
    }
    function waitForPopover(timeout = 2e3) {
      return waitForElement(".a-popover", timeout);
    }
    async function selectAddressesForItemsSimple(allItems) {
      if (isSelectingAddresses) {
        console.warn("[selectAddressesForItemsSimple] Already selecting addresses - preventing duplicate call!");
        return;
      }
      isSelectingAddresses = true;
      try {
        console.log("[selectAddressesForItemsSimple] Starting address selection for items...");
        const shouldChangeAddress = localStorage.getItem("wrrapd-should-change-address") === "true";
        const termsAccepted = localStorage.getItem("wrrapd-terms-accepted") === "true";
        if (shouldChangeAddress && termsAccepted) {
          showLoadingScreen();
        }
        const addressContainer = await waitForElement(".lineitem-address, .address-dropdown", 500);
        if (!addressContainer) {
          console.warn("[selectAddressesForItemsSimple] Address container not found, waiting 200ms...");
          await new Promise((r) => setTimeout(r, 200));
        }
        const defaultAddressStr = localStorage.getItem("wrrapd-default-address");
        let defaultAddress = null;
        if (defaultAddressStr) {
          try {
            defaultAddress = JSON.parse(defaultAddressStr);
            console.log("[selectAddressesForItemsSimple] Loaded default address:", defaultAddress);
          } catch (e) {
            console.error("[selectAddressesForItemsSimple] Failed to parse default address:", e);
          }
        }
        const identifierMapStr = localStorage.getItem("wrrapd-item-identifiers");
        let identifierMap = {};
        if (identifierMapStr) {
          try {
            identifierMap = JSON.parse(identifierMapStr);
            console.log("[selectAddressesForItemsSimple] Loaded item identifier mapping:", identifierMap);
          } catch (e) {
            console.error("[selectAddressesForItemsSimple] Failed to parse identifier mapping:", e);
          }
        }
        const asinRequirements = /* @__PURE__ */ new Map();
        for (const [productKey, productObj] of Object.entries(allItems)) {
          if (!productObj || !productObj.asin || !productObj.options) continue;
          const totalOptions = productObj.options.length;
          const wrrapdOptions = productObj.options.filter((opt) => opt.checkbox_wrrapd === true).length;
          const allOptionsNeedWrrapd = totalOptions > 0 && wrrapdOptions === totalOptions;
          asinRequirements.set(productObj.asin, {
            needsWrrapd: allOptionsNeedWrrapd,
            productKey
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
        const processedASINs = /* @__PURE__ */ new Set();
        let maxIterations = 10;
        let iteration = 0;
        while (processedASINs.size < asinRequirements.size && iteration < maxIterations) {
          iteration++;
          console.log(`[selectAddressesForItemsSimple] ===== Iteration ${iteration}: Processing ${asinRequirements.size - processedASINs.size} remaining ASIN(s) =====`);
          const dropdownsReady = await waitForElement(".lineitem-address .a-dropdown-container, .address-dropdown", 2e3);
          if (!dropdownsReady) {
            await new Promise((r) => setTimeout(r, 500));
          }
          const allDropdowns = document.querySelectorAll('.lineitem-address .a-dropdown-container .a-button-text, .address-dropdown .a-button-text, [class*="lineitem-address"] .a-button-text, [class*="address-dropdown"] .a-button-text');
          console.log(`[selectAddressesForItemsSimple] Found ${allDropdowns.length} address dropdown(s) on page`);
          let changedSomethingThisIteration = false;
          for (const dropdown of allDropdowns) {
            let matchedProductKey = null;
            let matchedASIN = null;
            let matchedDropdown = dropdown;
            let container = dropdown;
            const maxDepth = 30;
            for (let depth = 0; depth < maxDepth && container && container !== document.body; depth++) {
              const allTextElements = container.querySelectorAll("*");
              const potentialTitles = [];
              for (const el of allTextElements) {
                const text = (el.textContent || el.innerText || "").trim();
                if (text.length > 15 && text.length < 200) {
                  const words = text.split(/\s+/);
                  const hasNumbers = /\d/.test(text);
                  const hasSpecialChars = /[^\w\s]/.test(text);
                  const looksLikeName = words.length === 2 && words[0].length < 15 && words[1].length < 15 && /^[A-Z][a-z]+$/.test(words[0]) && /^[A-Z][a-z]+$/.test(words[1]) && !hasNumbers && !hasSpecialChars;
                  const hasAddressWords = /address|street|city|state|zip|postal|deliver|ship|roger|phillips/i.test(text);
                  const looksLikeProduct = hasNumbers || hasSpecialChars || text.length > 30;
                  if (looksLikeProduct || !looksLikeName && !hasAddressWords) {
                    const lowerText = text.toLowerCase();
                    for (const [productKey, productObj] of Object.entries(allItems)) {
                      if (!productObj || !productObj.asin) continue;
                      const productKeyLower = productKey.toLowerCase();
                      const productKey18 = productKeyLower.substring(0, 18);
                      const text18 = lowerText.substring(0, 18);
                      if (text18 === productKey18 || text18.includes(productKey18) || productKey18.includes(text18) || lowerText.includes(productKeyLower.substring(0, 25)) || productKeyLower.includes(lowerText.substring(0, 25)) || lowerText.includes(productKeyLower.substring(0, 30)) || productKeyLower.includes(lowerText.substring(0, 30))) {
                        potentialTitles.push({ text, productKey, asin: productObj.asin, element: el });
                        console.log(`[selectAddressesForItemsSimple] Found potential match at depth ${depth}: "${text.substring(0, 60)}" matches "${productKey.substring(0, 60)}"`);
                      }
                    }
                  }
                }
              }
              if (potentialTitles.length > 0) {
                potentialTitles.sort((a, b) => {
                  const aMatch = Math.min(a.text.length, a.productKey.length);
                  const bMatch = Math.min(b.text.length, b.productKey.length);
                  return bMatch - aMatch;
                });
                const match = potentialTitles[0];
                matchedProductKey = match.productKey;
                matchedASIN = match.asin;
                console.log(`[selectAddressesForItemsSimple] \u2713 Matched title "${match.text.substring(0, 50)}" to product "${match.productKey}" with ASIN ${matchedASIN} (depth ${depth})`);
                break;
              }
              const titleSelectors = [
                "p.a-spacing-micro.a-size-base.a-text-bold",
                "h2.a-text-normal",
                "h3.a-text-normal",
                "h2",
                "h3",
                '[class*="title"]',
                'a.a-link-normal[href*="/dp/"]',
                'a.a-link-normal[href*="/gp/product/"]',
                "span.a-text-bold",
                'div[class*="product"]',
                'div[class*="item"]'
              ];
              for (const selector of titleSelectors) {
                const titleEl = container.querySelector(selector);
                if (titleEl) {
                  const titleText = titleEl.textContent?.trim() || titleEl.innerText?.trim() || "";
                  const words = titleText.split(/\s+/);
                  const hasNumbers = /\d/.test(titleText);
                  const hasSpecialChars = /[^\w\s]/.test(titleText);
                  const looksLikeName = words.length === 2 && words[0].length < 15 && words[1].length < 15 && /^[A-Z][a-z]+$/.test(words[0]) && /^[A-Z][a-z]+$/.test(words[1]) && !hasNumbers && !hasSpecialChars;
                  const hasAddressWords = /address|street|city|state|zip|postal|deliver|ship|roger|phillips/i.test(titleText);
                  const looksLikeProduct = hasNumbers || hasSpecialChars || titleText.length > 30;
                  if (titleText.length > 10 && titleText.length < 200 && (looksLikeProduct || !looksLikeName && !hasAddressWords)) {
                    console.log(`[selectAddressesForItemsSimple] Found potential title at depth ${depth}: "${titleText.substring(0, 60)}"`);
                    for (const [productKey, productObj] of Object.entries(allItems)) {
                      if (!productObj || !productObj.asin) continue;
                      const productKeyLower = productKey.toLowerCase();
                      const titleLower = titleText.toLowerCase();
                      const productKey18 = productKeyLower.substring(0, 18);
                      const productKey25 = productKeyLower.substring(0, 25);
                      const productKey30 = productKeyLower.substring(0, 30);
                      const title18 = titleLower.substring(0, 18);
                      const title25 = titleLower.substring(0, 25);
                      const title30 = titleLower.substring(0, 30);
                      const minMatchLength = 18;
                      const titleMatch = titleLower.substring(0, minMatchLength);
                      const productMatch = productKeyLower.substring(0, minMatchLength);
                      const isStrongMatch = titleMatch === productMatch || titleLower.length >= minMatchLength && productKeyLower.length >= minMatchLength && (titleLower.includes(productMatch) || productKeyLower.includes(titleMatch));
                      if (isStrongMatch) {
                        if (!matchedASIN) {
                          matchedProductKey = productKey;
                          matchedASIN = productObj.asin;
                          console.log(`[selectAddressesForItemsSimple] \u2713 Matched title "${titleText.substring(0, 50)}" to product "${productKey}" with ASIN ${matchedASIN} (depth ${depth})`);
                          break;
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
            const itemRequirements = asinRequirements.get(matchedASIN);
            if (!itemRequirements) {
              console.log(`[selectAddressesForItemsSimple] ASIN ${matchedASIN} not found in requirements map. Skipping.`);
              continue;
            }
            if (processedASINs.has(matchedASIN)) {
              console.log(`[selectAddressesForItemsSimple] ASIN ${matchedASIN} already processed. Skipping.`);
              continue;
            }
            console.log(`[selectAddressesForItemsSimple] Processing ASIN ${matchedASIN} ("${matchedProductKey}") - needs ${itemRequirements.needsWrrapd ? "Wrrapd" : "DEFAULT"} address...`);
            const currentDropdownText = dropdown.textContent?.trim() || dropdown.innerText?.trim() || "";
            const hasPOBox = currentDropdownText.includes("PO BOX 26067");
            const hasJacksonville = currentDropdownText.includes("JACKSONVILLE") || currentDropdownText.includes("Jacksonville");
            const hasZip = currentDropdownText.includes("32226");
            const isWrrapd = hasPOBox && hasJacksonville && hasZip;
            const addressIsCorrect = itemRequirements.needsWrrapd && isWrrapd || !itemRequirements.needsWrrapd && !isWrrapd;
            if (addressIsCorrect) {
              console.log(`[selectAddressesForItemsSimple] \u2713 ASIN ${matchedASIN} already has ${itemRequirements.needsWrrapd ? "Wrrapd" : "DEFAULT"} address. No change needed.`);
              processedASINs.add(matchedASIN);
              changedSomethingThisIteration = true;
              continue;
            }
            console.log(`[selectAddressesForItemsSimple] \u26A0\uFE0F ASIN ${matchedASIN} has ${isWrrapd ? "Wrrapd" : "DEFAULT"} address but needs ${itemRequirements.needsWrrapd ? "Wrrapd" : "DEFAULT"}. Fixing...`);
            if (itemRequirements.needsWrrapd) {
              console.log(`[selectAddressesForItemsSimple] \u2713\u2713\u2713 Selecting Wrrapd address for ASIN ${matchedASIN} ("${matchedProductKey}") \u2713\u2713\u2713`);
            } else {
              console.log(`[selectAddressesForItemsSimple] \u2713\u2713\u2713 Selecting DEFAULT address for ASIN ${matchedASIN} ("${matchedProductKey}") \u2713\u2713\u2713`);
            }
            const dropdownActivator = matchedDropdown.closest(".a-dropdown-container")?.querySelector(".a-button-text, .a-dropdown-prompt") || matchedDropdown;
            let success = false;
            let attempts = 0;
            const maxAttempts = 5;
            while (!success && attempts < maxAttempts) {
              attempts++;
              console.log(`[selectAddressesForItemsSimple] Attempt ${attempts}/${maxAttempts} for ASIN ${matchedASIN}...`);
              let currentDropdown = dropdownActivator;
              if (!document.contains(dropdownActivator)) {
                console.warn(`[selectAddressesForItemsSimple] Original dropdown no longer in DOM. Re-finding by product descriptor...`);
                const allCurrentDropdowns = document.querySelectorAll('.lineitem-address .a-dropdown-container .a-button-text, .address-dropdown .a-button-text, [class*="lineitem-address"] .a-button-text');
                currentDropdown = null;
                for (const dd of allCurrentDropdowns) {
                  let container2 = dd;
                  for (let depth = 0; depth < 20 && container2 && container2 !== document.body; depth++) {
                    const allTextElements = container2.querySelectorAll("*");
                    for (const el of allTextElements) {
                      const text = (el.textContent || el.innerText || "").trim();
                      if (text.length > 15 && text.length < 200) {
                        const words = text.split(/\s+/);
                        const hasNumbers = /\d/.test(text);
                        const hasSpecialChars = /[^\w\s]/.test(text);
                        const looksLikeName = words.length === 2 && words[0].length < 15 && words[1].length < 15 && /^[A-Z][a-z]+$/.test(words[0]) && /^[A-Z][a-z]+$/.test(words[1]) && !hasNumbers && !hasSpecialChars;
                        const hasAddressWords = /address|street|city|state|zip|postal|deliver|ship|roger|phillips/i.test(text);
                        const looksLikeProduct = hasNumbers || hasSpecialChars || text.length > 30;
                        if (looksLikeProduct || !looksLikeName && !hasAddressWords) {
                          const textLower = text.toLowerCase();
                          const productKeyLower = matchedProductKey.toLowerCase();
                          if (textLower.includes(productKeyLower.substring(0, 18)) || productKeyLower.includes(textLower.substring(0, 18))) {
                            currentDropdown = dd.closest(".a-dropdown-container")?.querySelector(".a-button-text, .a-dropdown-prompt") || dd;
                            break;
                          }
                        }
                      }
                    }
                    if (currentDropdown) break;
                    container2 = container2.parentElement;
                  }
                  if (currentDropdown) break;
                }
                if (!currentDropdown) {
                  console.warn(`[selectAddressesForItemsSimple] Could not re-find dropdown for "${matchedProductKey}" on attempt ${attempts}. Retrying...`);
                  await new Promise((r) => setTimeout(r, 1e3));
                  continue;
                }
              }
              if (itemRequirements.needsWrrapd) {
                success = await selectWrrapdAddressFromDropdown(currentDropdown);
              } else {
                const defaultAddressStr2 = localStorage.getItem("wrrapd-default-address");
                let defaultAddress2 = null;
                if (defaultAddressStr2) {
                  try {
                    defaultAddress2 = JSON.parse(defaultAddressStr2);
                  } catch (e) {
                    console.error("[selectAddressesForItemsSimple] Failed to parse default address:", e);
                  }
                }
                if (defaultAddress2) {
                  success = await selectDefaultAddressFromDropdown(currentDropdown, defaultAddress2);
                } else {
                  console.error("[selectAddressesForItemsSimple] No default address available!");
                  success = false;
                }
              }
              if (success) {
                console.log(`[selectAddressesForItemsSimple] \u2713\u2713\u2713 Successfully set ${itemRequirements.needsWrrapd ? "Wrrapd" : "DEFAULT"} address for ASIN ${matchedASIN} \u2713\u2713\u2713`);
                processedASINs.add(matchedASIN);
                changedSomethingThisIteration = true;
                await new Promise((r) => setTimeout(r, 200));
              } else {
                if (attempts < maxAttempts) {
                  console.warn(`[selectAddressesForItemsSimple] Attempt ${attempts} failed for ASIN ${matchedASIN}. Retrying...`);
                  showLoadingScreen();
                  await new Promise((r) => setTimeout(r, 800));
                }
              }
            }
            if (!success) {
              console.error(`[selectAddressesForItemsSimple] \u2717\u2717\u2717 FAILED to select Wrrapd address for ASIN ${matchedASIN} after ${maxAttempts} attempts! \u2717\u2717\u2717`);
            } else {
              console.log(`[selectAddressesForItemsSimple] \u2713\u2713\u2713 Successfully processed ASIN ${matchedASIN}. \u2713\u2713\u2713`);
              changedSomethingThisIteration = true;
              await new Promise((r) => setTimeout(r, 300));
              break;
            }
          }
          if (!changedSomethingThisIteration) {
            console.log("[selectAddressesForItemsSimple] No changes this iteration. Breaking out.");
            break;
          }
          await new Promise((r) => setTimeout(r, 200));
        }
        console.log(`[selectAddressesForItemsSimple] Finished. Processed ${processedASINs.size}/${asinRequirements.size} ASIN(s).`);
        if (processedASINs.size !== asinRequirements.size) {
          console.error(`[selectAddressesForItemsSimple] \u2717\u2717\u2717 CRITICAL ERROR: Only processed ${processedASINs.size} out of ${asinRequirements.size} ASINs! \u2717\u2717\u2717`);
          console.error(`[selectAddressesForItemsSimple] Cannot proceed - All addresses MUST be set correctly before returning to gift-options!`);
          const remainingASINs = Array.from(asinRequirements.keys()).filter((asin) => !processedASINs.has(asin));
          console.error(`[selectAddressesForItemsSimple] Remaining ASINs that need addresses:`, remainingASINs);
          showLoadingScreen();
          console.log(`[selectAddressesForItemsSimple] Attempting one more iteration to set remaining addresses...`);
          await new Promise((r) => setTimeout(r, 2e3));
          const retryCount = parseInt(localStorage.getItem("wrrapd-address-retry-count") || "0");
          if (retryCount < 3) {
            localStorage.setItem("wrrapd-address-retry-count", String(retryCount + 1));
            console.log(`[selectAddressesForItemsSimple] Retry attempt ${retryCount + 1}/3 - calling selectAddressesForItemsSimple again...`);
            return await selectAddressesForItemsSimple(allItems);
          } else {
            console.error(`[selectAddressesForItemsSimple] \u2717\u2717\u2717 MAX RETRIES REACHED (3 attempts) - Cannot set addresses automatically \u2717\u2717\u2717`);
            console.error(`[selectAddressesForItemsSimple] User intervention required - please set Wrrapd addresses manually`);
            localStorage.removeItem("wrrapd-address-retry-count");
            return;
          }
        }
        console.log("[selectAddressesForItemsSimple] \u2713\u2713\u2713 ALL ASINs successfully processed! \u2713\u2713\u2713");
        console.log("[selectAddressesForItemsSimple] All Wrrapd addresses are now set - safe to proceed to gift-options");
        localStorage.removeItem("wrrapd-address-retry-count");
        showLoadingScreen();
        localStorage.setItem("wrrapd-addresses-changed", "true");
        localStorage.setItem("wrrapd-should-change-address", "false");
        localStorage.setItem("wrrapd-multi-address-completed", "true");
        console.log("[selectAddressesForItemsSimple] Set wrrapd-addresses-changed flag - all addresses successfully changed, proceeding to gift-options");
        console.log("[selectAddressesForItemsSimple] Setting up automatic workflow: Continue \u2192 Gift Options \u2192 Save \u2192 Payment");
        await clickContinueAndProceedToPayment();
        if (processedASINs.size === asinRequirements.size && asinRequirements.size > 0) {
          console.log("[selectAddressesForItemsSimple] \u2713\u2713\u2713 Confirmed: ALL ASINs successfully processed! \u2713\u2713\u2713");
          localStorage.setItem("wrrapd-addresses-changed", "true");
          localStorage.setItem("wrrapd-should-change-address", "false");
          console.log("[selectAddressesForItemsSimple] Confirmed wrrapd-addresses-changed flag is set - will proceed to payment (GOLD VERSION workflow)");
          const existingOverlays = document.querySelectorAll("#fake-button-top, #fake-button-bottom");
          existingOverlays.forEach((overlay) => {
            console.log("[selectAddressesForItemsSimple] Removing existing overlay button to prevent interception.");
            overlay.remove();
          });
          const topButton = document.querySelector("#orderSummaryPrimaryActionBtn .a-button-input");
          const bottomButton = document.querySelector('.a-button-inner > [data-testid=""]');
          if (topButton) {
            topButton.style.pointerEvents = "auto";
            topButton.disabled = false;
          }
          if (bottomButton) {
            bottomButton.style.pointerEvents = "auto";
            bottomButton.disabled = false;
          }
          console.log("[selectAddressesForItemsSimple] \u2713 All addresses changed successfully!");
          console.log("[selectAddressesForItemsSimple] Automatic workflow will: Click Continue \u2192 Gift Options \u2192 Save \u2192 Payment");
          localStorage.setItem("wrrapd-addresses-changed", "true");
          localStorage.setItem("wrrapd-should-change-address", "false");
          console.log("[selectAddressesForItemsSimple] Confirmed wrrapd-addresses-changed flag is set (already set before clickContinueAndProceedToPayment)");
        }
      } finally {
        isSelectingAddresses = false;
      }
    }
    async function clickContinueAndProceedToPayment() {
      console.log("[clickContinueAndProceedToPayment] Starting automatic workflow...");
      let continueButton = null;
      const specificSelectors = [
        "#orderSummaryPrimaryActionBtn .a-button-input",
        "#orderSummaryPrimaryActionBtn button",
        '#orderSummaryPrimaryActionBtn input[type="submit"]',
        ".a-button-continue input",
        ".a-button-continue button",
        '.a-button-primary input[type="submit"]',
        '.a-button-primary button[type="submit"]',
        'input[type="submit"][value*="Continue"]',
        'button[type="submit"]:contains("Continue")'
      ];
      for (const selector of specificSelectors) {
        try {
          const element = document.querySelector(selector);
          if (element && element.offsetParent !== null && !element.disabled) {
            const text = (element.textContent || element.value || element.getAttribute("aria-label") || "").toLowerCase();
            if (text.includes("continue") && !text.includes("payment") && !text.includes("use these")) {
              continueButton = element;
              console.log(`[clickContinueAndProceedToPayment] Found Continue button using selector: ${selector}`);
              break;
            }
          }
        } catch (e) {
        }
      }
      if (!continueButton) {
        console.log("[clickContinueAndProceedToPayment] Continue button not found with specific selectors. Waiting for button to appear...");
        continueButton = await new Promise((resolve) => {
          const checkForButton = () => {
            for (const selector of specificSelectors) {
              try {
                const element = document.querySelector(selector);
                if (element && element.offsetParent !== null && !element.disabled) {
                  const text = (element.textContent || element.value || element.getAttribute("aria-label") || "").toLowerCase();
                  if (text.includes("continue") && !text.includes("payment") && !text.includes("use these")) {
                    return resolve(element);
                  }
                }
              } catch (e) {
              }
            }
            const allButtons = document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"], .a-button-input, .a-button-inner, span.a-button-text');
            const found = Array.from(allButtons).find((el) => {
              if (!el || el.offsetParent === null || el.disabled) return false;
              const text = (el.textContent || el.value || el.getAttribute("aria-label") || el.innerText || "").toLowerCase();
              return text.includes("continue") && !text.includes("payment") && !text.includes("use these") && !text.includes("place order") && !text.includes("save gift");
            });
            if (found) {
              return resolve(found);
            }
            return null;
          };
          const immediateResult = checkForButton();
          if (immediateResult) {
            return resolve(immediateResult);
          }
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
          setTimeout(() => {
            observer.disconnect();
            console.warn(
              "[clickContinueAndProceedToPayment] Continue button not found after waiting. Available buttons:",
              Array.from(document.querySelectorAll('button, input[type="submit"]')).slice(0, 10).map((el) => ({
                tag: el.tagName,
                id: el.id,
                classes: el.className,
                text: (el.textContent || el.value || "").trim().substring(0, 50),
                visible: el.offsetParent !== null
              }))
            );
            resolve(null);
          }, 1e4);
        });
      }
      if (!continueButton) {
        console.warn("[clickContinueAndProceedToPayment] Continue button not found. User will need to click manually.");
        return;
      }
      console.log("[clickContinueAndProceedToPayment] \u2713 Found Continue button. Clicking to return to gift options page...");
      const buttonText = (continueButton.textContent || continueButton.value || continueButton.getAttribute("aria-label") || "").toLowerCase();
      if (buttonText.includes("place") && buttonText.includes("order")) {
        console.error("[clickContinueAndProceedToPayment] \u26A0\uFE0F CRITICAL: Attempted to click 'Place your order' button! ABORTING!");
        return;
      }
      continueButton.click();
      console.log("[clickContinueAndProceedToPayment] Waiting for navigation to gift options page...");
      await waitForNavigation(() => window.location.href.includes("/gift"), 1e4);
      console.log("[clickContinueAndProceedToPayment] Waiting for gift options page with addresses shown...");
      await waitForAddressesOnGiftOptionsPage();
      console.log("[clickContinueAndProceedToPayment] Addresses are shown. Clicking 'Save gift options' to proceed to Payment...");
      localStorage.setItem("wrrapd-automatic-workflow-active", "true");
      await new Promise((r) => setTimeout(r, 300));
      await clickSaveGiftOptionsButton();
      setTimeout(() => {
        localStorage.removeItem("wrrapd-automatic-workflow-active");
      }, 1e4);
    }
    async function waitForNavigation(checkFn, timeout = 1e4) {
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
          resolve();
        }, timeout);
      });
    }
    async function waitForAddressesOnGiftOptionsPage() {
      return new Promise((resolve) => {
        const checkAddresses = () => {
          const addressesShown = areAddressesShownOnGiftOptionsPage();
          if (addressesShown) {
            console.log("[waitForAddressesOnGiftOptionsPage] \u2713 Addresses are now shown on gift options page (either below items or in top section)!");
            resolve();
          }
        };
        checkAddresses();
        const observer = new MutationObserver(() => {
          checkAddresses();
        });
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
        setTimeout(() => {
          observer.disconnect();
          console.log("[waitForAddressesOnGiftOptionsPage] Timeout - addresses may not be shown yet.");
          resolve();
        }, 1e4);
      });
    }
    async function clickSaveGiftOptionsButton() {
      const saveButton = await waitForElement('#orderSummaryPrimaryActionBtn .a-button-input, .a-button-primary input, button[aria-label*="save"], button[aria-label*="continue"]', 5e3);
      if (!saveButton) {
        console.warn("[clickSaveGiftOptionsButton] Save gift options button not found. User will need to click manually.");
        return;
      }
      const buttonText = (saveButton.textContent || saveButton.value || saveButton.getAttribute("aria-label") || "").toLowerCase();
      if (buttonText.includes("place") && buttonText.includes("order")) {
        console.error("[clickSaveGiftOptionsButton] \u26A0\uFE0F CRITICAL: Attempted to click 'Place your order' button! ABORTING!");
        return;
      }
      console.log("[clickSaveGiftOptionsButton] \u2713 Found Save gift options button. Clicking to proceed to Payment...");
      showLoadingScreen();
      await new Promise((r) => setTimeout(r, 200));
      localStorage.setItem("wrrapd-programmatic-click-to-payment", "true");
      setTimeout(() => {
        localStorage.removeItem("wrrapd-programmatic-click-to-payment");
      }, 5e3);
      const form = saveButton.closest("form");
      if (form) {
        console.log("[clickSaveGiftOptionsButton] Submitting form directly to avoid event handler issues");
        try {
          form.submit();
        } catch (e) {
          console.warn("[clickSaveGiftOptionsButton] Form.submit() failed, trying button click:", e);
          const fallbackText = (saveButton.textContent || saveButton.value || saveButton.getAttribute("aria-label") || "").toLowerCase();
          if (!(fallbackText.includes("place") && fallbackText.includes("order"))) {
            saveButton.click();
          } else {
            console.error("[clickSaveGiftOptionsButton] \u26A0\uFE0F CRITICAL: Fallback button is 'Place your order'! ABORTING!");
          }
        }
      } else {
        const clickText = (saveButton.textContent || saveButton.value || saveButton.getAttribute("aria-label") || "").toLowerCase();
        if (!(clickText.includes("place") && clickText.includes("order"))) {
          console.log("[clickSaveGiftOptionsButton] No form found, using direct click");
          saveButton.click();
        } else {
          console.error("[clickSaveGiftOptionsButton] \u26A0\uFE0F CRITICAL: Button is 'Place your order'! ABORTING!");
        }
      }
      console.log("[clickSaveGiftOptionsButton] \u2713 Clicked Save gift options button. Should proceed to Payment page.");
      const checkPaymentPage = () => {
        const currentURL = window.location.href;
        const isPaymentPage = currentURL.includes("amazon.com/gp/buy/payselect/handlers/display.html") || currentURL.includes("/checkout/") && currentURL.includes("/spc") && !currentURL.includes("/gp/buy/spc/handlers/display.html");
        if (isPaymentPage) {
          console.log("[clickSaveGiftOptionsButton] Payment page detected, removing loading screen");
          removeLoadingScreen();
          return true;
        }
        return false;
      };
      if (checkPaymentPage()) {
        return;
      }
      let attempts = 0;
      const maxAttempts = 30;
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
    async function selectWrrapdAddressFromDropdown(dropdownActivator) {
      try {
        let isWrrapdOption2 = function(text) {
          if (!text || text.length < 10) return false;
          const textLower = text.toLowerCase();
          const hasWrrapd = textLower.trim().startsWith("wrrapd") || textLower.includes("wrrapd");
          const hasPOBox = text.includes("PO BOX 26067") || text.includes("P.O. BOX 26067") || text.includes("26067");
          const hasJacksonville = text.includes("JACKSONVILLE") || text.includes("Jacksonville");
          const hasFL = text.includes(" FL ") || text.includes(", FL") || text.includes("FL 32226");
          const hasZip = text.includes("32226-6067") || text.includes("32226") || text.includes("32226 6067");
          return hasWrrapd || hasPOBox && hasJacksonville && (hasFL || hasZip);
        };
        var isWrrapdOption = isWrrapdOption2;
        console.log("[selectWrrapdAddressFromDropdown] Opening dropdown...");
        dropdownActivator.click();
        const popover = await waitForPopover(1500);
        if (!popover) {
          console.warn("[selectWrrapdAddressFromDropdown] Popover did not appear.");
          return false;
        }
        let optionsReady = popover.querySelectorAll('a, li a, [role="option"], li').length > 0;
        if (!optionsReady) {
          for (let i = 0; i < 5 && !optionsReady; i++) {
            await new Promise((r) => setTimeout(r, 100));
            optionsReady = popover.querySelectorAll('a, li a, [role="option"], li').length > 0;
          }
        }
        let clickableElement = null;
        let dataValue = null;
        let currentPopover = popover;
        if (wrrapdAddressCache && wrrapdAddressCache.dataValue) {
          console.log("[selectWrrapdAddressFromDropdown] Using cached Wrrapd address data-value:", wrrapdAddressCache.dataValue);
          const escapedDataValue = wrrapdAddressCache.dataValue.replace(/"/g, '\\"').replace(/\[/g, "\\[").replace(/\]/g, "\\]");
          const cachedElement = popover.querySelector(`a[data-value="${escapedDataValue}"]`);
          if (cachedElement) {
            const cachedText = cachedElement.textContent?.trim() || cachedElement.innerText?.trim() || "";
            const isInCurrentPopover = popover.contains(cachedElement);
            if (isInCurrentPopover && isWrrapdOption2(cachedText)) {
              console.log("[selectWrrapdAddressFromDropdown] \u2713 Found cached Wrrapd element in current dropdown, using it directly!");
              clickableElement = cachedElement;
              dataValue = wrrapdAddressCache.dataValue;
              try {
                clickableElement.scrollIntoView({ behavior: "auto", block: "center" });
                await new Promise((r) => setTimeout(r, 100));
              } catch (e) {
                console.warn("[selectWrrapdAddressFromDropdown] Could not scroll cached element:", e);
              }
            } else {
              if (!isInCurrentPopover) {
                console.warn("[selectWrrapdAddressFromDropdown] Cached element is NOT in current popover, clearing cache and searching...");
              } else {
                console.warn("[selectWrrapdAddressFromDropdown] Cached element found but doesn't match Wrrapd address, clearing cache and searching...");
              }
              wrrapdAddressCache = null;
            }
          } else {
            console.warn("[selectWrrapdAddressFromDropdown] Cached data-value not found in current dropdown, searching for Wrrapd address...");
            wrrapdAddressCache = null;
          }
        }
        if (!clickableElement) {
          let showMoreLink = popover.querySelector('[aria-label*="Show more" i], [aria-label*="See more" i]');
          if (!showMoreLink) {
            const links = popover.querySelectorAll("a, button");
            for (const link of links) {
              const text = link.textContent?.trim().toLowerCase() || "";
              if (text.includes("show more") || text.includes("see more")) {
                showMoreLink = link;
                break;
              }
            }
          }
          if (showMoreLink) {
            console.log("[selectWrrapdAddressFromDropdown] Found 'Show more addresses' link. Clicking to expand list...");
            showMoreLink.click();
            await new Promise((r) => setTimeout(r, 2e3));
            const updatedPopover = document.querySelector(".a-popover");
            if (updatedPopover) {
              currentPopover = updatedPopover;
              console.log("[selectWrrapdAddressFromDropdown] Updated popover reference after 'Show more addresses'");
            }
          }
          const options = currentPopover.querySelectorAll('a, li a, [role="option"], li');
          console.log(`[selectWrrapdAddressFromDropdown] Found ${options.length} address options (after checking for "Show more addresses")`);
          options.forEach((opt, idx) => {
            const optText = opt.textContent?.trim() || "";
            if (optText.length > 20) {
              console.log(`[selectWrrapdAddressFromDropdown] Option ${idx + 1}: "${optText.substring(0, 100)}"`);
            }
          });
          for (const option of options) {
            const text = option.textContent?.trim() || option.innerText?.trim() || "";
            if (isWrrapdOption2(text)) {
              console.log("[selectWrrapdAddressFromDropdown] \u2713 Found Wrrapd address. Full text:", text.substring(0, 150));
              console.log("[selectWrrapdAddressFromDropdown] Option element:", option);
              console.log("[selectWrrapdAddressFromDropdown] Option tagName:", option.tagName);
              console.log("[selectWrrapdAddressFromDropdown] Option HTML:", option.outerHTML.substring(0, 200));
              clickableElement = option.querySelector("a[href]") || option.querySelector("a") || option.closest("a") || option;
              const parentLi = option.closest("li");
              if (parentLi && parentLi.querySelector("a")) {
                clickableElement = parentLi.querySelector("a");
              }
              try {
                clickableElement.scrollIntoView({ behavior: "auto", block: "center" });
                await new Promise((r) => setTimeout(r, 100));
              } catch (e) {
                console.warn("[selectWrrapdAddressFromDropdown] Could not scroll element:", e);
              }
              console.log("[selectWrrapdAddressFromDropdown] Clickable element:", clickableElement);
              console.log("[selectWrrapdAddressFromDropdown] Clickable tagName:", clickableElement.tagName);
              console.log("[selectWrrapdAddressFromDropdown] Clickable classes:", clickableElement.className);
              console.log("[selectWrrapdAddressFromDropdown] Clickable href:", clickableElement.href || "none");
              const clickableText = clickableElement.textContent?.trim() || clickableElement.innerText?.trim() || "";
              const parentText = clickableElement.parentElement?.textContent?.trim() || clickableElement.parentElement?.innerText?.trim() || "";
              const isActuallyWrrapd = clickableText.toLowerCase().includes("wrrapd") || parentText.toLowerCase().includes("wrrapd");
              if (!isActuallyWrrapd) {
                console.error("[selectWrrapdAddressFromDropdown] \u26A0\uFE0F WARNING: Clickable element does NOT contain 'Wrrapd'! Text:", clickableText.substring(0, 100));
                console.error("[selectWrrapdAddressFromDropdown] Parent text:", parentText.substring(0, 100));
                const allLinksInOption = option.querySelectorAll("a");
                for (const link of allLinksInOption) {
                  const linkText = link.textContent?.trim() || link.innerText?.trim() || "";
                  const linkParentText = link.parentElement?.textContent?.trim() || link.parentElement?.innerText?.trim() || "";
                  if (linkText.toLowerCase().includes("wrrapd") || linkParentText.toLowerCase().includes("wrrapd")) {
                    console.log("[selectWrrapdAddressFromDropdown] Found correct Wrrapd link:", link);
                    clickableElement = link;
                    break;
                  }
                }
              }
              if (!dataValue) {
                dataValue = clickableElement.getAttribute("data-value");
              }
              console.log("[selectWrrapdAddressFromDropdown] data-value:", dataValue);
              if (!wrrapdAddressCache && dataValue) {
                wrrapdAddressCache = {
                  dataValue,
                  stringVal: JSON.parse(dataValue)?.stringVal || null
                };
                console.log("[selectWrrapdAddressFromDropdown] \u2713 Cached Wrrapd address data-value for future use:", wrrapdAddressCache);
              }
              break;
            }
          }
          if (clickableElement && dataValue) {
            if (dataValue) {
              try {
                console.log("[selectWrrapdAddressFromDropdown] Attempting to use data-value for direct selection...");
                const dropdownContainer = dropdownActivator.closest(".a-dropdown-container");
                if (dropdownContainer) {
                  const actionElement = clickableElement.closest("[data-action]");
                  if (actionElement) {
                    const allOptions = dropdownContainer.querySelectorAll('[role="option"]');
                    allOptions.forEach((opt) => opt.setAttribute("aria-selected", "false"));
                    clickableElement.setAttribute("aria-selected", "true");
                    await new Promise((r) => setTimeout(r, 100));
                    const hiddenSelect = dropdownContainer.querySelector('select[class*="native"]');
                    if (hiddenSelect && dataValue) {
                      try {
                        const parsedValue = JSON.parse(dataValue);
                        const stringVal = parsedValue.stringVal;
                        console.log("[selectWrrapdAddressFromDropdown] Trying to set native select value:", stringVal);
                        const options2 = hiddenSelect.querySelectorAll("option");
                        for (const opt of options2) {
                          if (opt.value === stringVal || opt.textContent?.includes("Wrrapd")) {
                            hiddenSelect.value = opt.value;
                            hiddenSelect.dispatchEvent(new Event("change", { bubbles: true }));
                            console.log("[selectWrrapdAddressFromDropdown] Set native select value to:", opt.value);
                            await new Promise((r) => setTimeout(r, 300));
                            break;
                          }
                        }
                      } catch (e) {
                        console.warn("[selectWrrapdAddressFromDropdown] Could not set native select:", e);
                      }
                    }
                    const actionEvent = new CustomEvent("a-dropdown-options", {
                      bubbles: true,
                      cancelable: true,
                      detail: { value: JSON.parse(dataValue) }
                    });
                    actionElement.dispatchEvent(actionEvent);
                    await new Promise((r) => setTimeout(r, 200));
                    clickableElement.click();
                    await new Promise((r) => setTimeout(r, 300));
                    clickableElement.click();
                    await new Promise((r) => setTimeout(r, 400));
                  }
                }
              } catch (e) {
                console.warn("[selectWrrapdAddressFromDropdown] data-value method failed:", e);
              }
            }
            if (dataValue && clickableElement.closest('[data-action="a-dropdown-options"]')) {
              try {
                console.log("[selectWrrapdAddressFromDropdown] Trying to trigger Amazon's dropdown action...");
                const actionElement = clickableElement.closest('[data-action="a-dropdown-options"]');
                if (actionElement && actionElement.dispatchEvent) {
                  const actionEvent = new CustomEvent("a-dropdown-options", {
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
            try {
              clickableElement.scrollIntoView({ behavior: "auto", block: "center" });
              await new Promise((r) => setTimeout(r, 100));
            } catch (e) {
              console.warn("[selectWrrapdAddressFromDropdown] Could not scroll:", e);
            }
            try {
              console.log("[selectWrrapdAddressFromDropdown] Clicking with coordinates...");
              if (clickableElement.focus) {
                clickableElement.focus();
                await new Promise((r) => setTimeout(r, 100));
              }
              const rect = clickableElement.getBoundingClientRect();
              let x = rect.left + rect.width / 2;
              let y = rect.top + rect.height / 2;
              const mouseDownEvent = new MouseEvent("mousedown", {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y,
                button: 0
              });
              const mouseUpEvent = new MouseEvent("mouseup", {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y,
                button: 0
              });
              const clickEvent = new MouseEvent("click", {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y,
                button: 0
              });
              const dropdownContainerForClick = dropdownActivator.closest(".a-dropdown-container");
              if (dropdownContainerForClick) {
                const allOptions = dropdownContainerForClick.querySelectorAll('[role="option"]');
                allOptions.forEach((opt) => {
                  if (opt !== clickableElement) {
                    opt.setAttribute("aria-selected", "false");
                  }
                });
              }
              clickableElement.setAttribute("aria-selected", "true");
              await new Promise((r) => setTimeout(r, 150));
              const elementText = clickableElement.textContent?.trim() || clickableElement.innerText?.trim() || "";
              const parentText = clickableElement.parentElement?.textContent?.trim() || clickableElement.parentElement?.innerText?.trim() || "";
              const grandParentText = clickableElement.parentElement?.parentElement?.textContent?.trim() || clickableElement.parentElement?.parentElement?.innerText?.trim() || "";
              const containsWrrapd = elementText.toLowerCase().includes("wrrapd") || parentText.toLowerCase().includes("wrrapd") || grandParentText.toLowerCase().includes("wrrapd");
              if (!containsWrrapd) {
                console.error("[selectWrrapdAddressFromDropdown] \u26A0\uFE0F CRITICAL: Clickable element does NOT contain 'Wrrapd'! Element text:", elementText.substring(0, 100));
                console.error("[selectWrrapdAddressFromDropdown] Parent text:", parentText.substring(0, 100));
                console.error("[selectWrrapdAddressFromDropdown] Grandparent text:", grandParentText.substring(0, 100));
                const allLinks = popover.querySelectorAll("a[data-value]");
                for (const link of allLinks) {
                  const linkText = link.textContent?.trim() || link.innerText?.trim() || "";
                  const linkParentText = link.parentElement?.textContent?.trim() || link.parentElement?.innerText?.trim() || "";
                  if (linkText.toLowerCase().includes("wrrapd") || linkParentText.toLowerCase().includes("wrrapd")) {
                    console.log("[selectWrrapdAddressFromDropdown] Found correct Wrrapd link by searching all links:", link);
                    clickableElement = link;
                    const newRect = clickableElement.getBoundingClientRect();
                    x = newRect.left + newRect.width / 2;
                    y = newRect.top + newRect.height / 2;
                    break;
                  }
                }
              }
              console.log("[selectWrrapdAddressFromDropdown] \u2713 Verified clickable element contains 'Wrrapd'");
              const mouseEnterEvent = new MouseEvent("mouseenter", {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y
              });
              clickableElement.dispatchEvent(mouseEnterEvent);
              await new Promise((r) => setTimeout(r, 100));
              clickableElement.dispatchEvent(mouseDownEvent);
              await new Promise((r) => setTimeout(r, 50));
              clickableElement.dispatchEvent(mouseUpEvent);
              await new Promise((r) => setTimeout(r, 50));
              clickableElement.dispatchEvent(clickEvent);
              await new Promise((r) => setTimeout(r, 100));
              clickableElement.click();
              await new Promise((r) => setTimeout(r, 200));
              clickableElement.click();
              await new Promise((r) => setTimeout(r, 300));
            } catch (e) {
              console.warn("[selectWrrapdAddressFromDropdown] Coordinate click failed:", e);
            }
            await new Promise((r) => setTimeout(r, 1500));
            let selectionPersisted = false;
            for (let pollAttempt = 0; pollAttempt < 5 && !selectionPersisted; pollAttempt++) {
              await new Promise((r) => setTimeout(r, 300));
              const originalContainer = dropdownActivator.closest(".a-dropdown-container");
              let dropdownContainer = originalContainer;
              if (!dropdownContainer || !document.body.contains(dropdownContainer)) {
                let parent = dropdownActivator.parentElement;
                for (let i = 0; i < 10 && parent; i++) {
                  dropdownContainer = parent.querySelector(".a-dropdown-container");
                  if (dropdownContainer) break;
                  parent = parent.parentElement;
                }
              }
              if (!dropdownContainer) {
                const nearbyContainers = document.querySelectorAll(".a-dropdown-container");
                for (const container of nearbyContainers) {
                  if (container.contains(dropdownActivator) || dropdownActivator.closest(".a-dropdown-container") === container) {
                    dropdownContainer = container;
                    break;
                  }
                }
              }
              const dropdownPrompt2 = dropdownContainer?.querySelector(".a-dropdown-prompt") || dropdownContainer?.querySelector(".a-button-text") || dropdownActivator.closest(".a-button-text") || dropdownActivator;
              const selectedText = dropdownPrompt2?.textContent?.trim() || dropdownPrompt2?.innerText?.trim() || "";
              if (pollAttempt === 0) {
                console.log("[selectWrrapdAddressFromDropdown] Selected text after click (poll attempt 0):", selectedText.substring(0, 150));
              }
              if (isWrrapdOption2(selectedText)) {
                console.log(`[selectWrrapdAddressFromDropdown] \u2713\u2713\u2713 Selection confirmed on poll attempt ${pollAttempt + 1}! \u2713\u2713\u2713`);
                if (!wrrapdAddressCache && dataValue) {
                  wrrapdAddressCache = {
                    dataValue,
                    stringVal: dataValue ? JSON.parse(dataValue)?.stringVal : null
                  };
                  console.log("[selectWrrapdAddressFromDropdown] \u2713 Cached Wrrapd address details for future dropdowns:", wrrapdAddressCache);
                }
                await new Promise((r) => setTimeout(r, 500));
                const finalCheck = dropdownPrompt2?.textContent?.trim() || dropdownPrompt2?.innerText?.trim() || "";
                if (isWrrapdOption2(finalCheck)) {
                  console.log("[selectWrrapdAddressFromDropdown] \u2713\u2713\u2713 Verified: Selection persisted after polling! \u2713\u2713\u2713");
                  selectionPersisted = true;
                  return true;
                } else {
                  console.warn(`[selectWrrapdAddressFromDropdown] Selection reverted on poll attempt ${pollAttempt + 1}. Continuing to poll...`);
                }
              } else if (pollAttempt === 4) {
                console.warn("[selectWrrapdAddressFromDropdown] \u26A0\uFE0F Selection did not persist after 5 poll attempts. Selected text:", selectedText.substring(0, 100));
                console.warn("[selectWrrapdAddressFromDropdown] This may indicate Amazon is reverting the selection. Will retry...");
              }
            }
            if (!selectionPersisted) {
              const errorContainer = dropdownActivator.closest(".a-dropdown-container");
              const errorPrompt = errorContainer?.querySelector(".a-dropdown-prompt") || errorContainer?.querySelector(".a-button-text") || dropdownActivator;
              const errorText = errorPrompt?.textContent?.trim() || errorPrompt?.innerText?.trim() || "";
              console.warn("[selectWrrapdAddressFromDropdown] \u26A0\uFE0F Selection verification failed after polling.");
              console.warn("[selectWrrapdAddressFromDropdown] Expected: Wrrapd PO BOX 26067");
              console.warn("[selectWrrapdAddressFromDropdown] Got:", errorText.substring(0, 100));
              console.log("[selectWrrapdAddressFromDropdown] Attempting alternative click method...");
              dropdownActivator.click();
              await new Promise((r) => setTimeout(r, 800));
              const retryPopover = document.querySelector(".a-popover");
              if (retryPopover) {
                const retryOptions = retryPopover.querySelectorAll('a, li a, [role="option"], li');
                for (const retryOption of retryOptions) {
                  const retryText = retryOption.textContent?.trim() || retryOption.innerText?.trim() || "";
                  if (isWrrapdOption2(retryText)) {
                    console.log("[selectWrrapdAddressFromDropdown] Found Wrrapd option in retry, clicking parent container...");
                    const container = retryOption.closest("li") || retryOption.parentElement || retryOption;
                    const link = container.querySelector("a") || container;
                    link.scrollIntoView({ behavior: "auto", block: "center" });
                    await new Promise((r) => setTimeout(r, 100));
                    const linkDataValue = link.getAttribute("data-value");
                    if (linkDataValue) {
                      console.log("[selectWrrapdAddressFromDropdown] Using data-value for selection:", linkDataValue);
                      const dropdownSelect = dropdownActivator.closest(".a-dropdown-container")?.querySelector("select");
                      if (dropdownSelect) {
                        dropdownSelect.value = linkDataValue;
                        dropdownSelect.dispatchEvent(new Event("change", { bubbles: true }));
                      }
                    }
                    const rect = link.getBoundingClientRect();
                    const x = rect.left + rect.width / 2;
                    const y = rect.top + rect.height / 2;
                    const clickEvent = new MouseEvent("click", {
                      view: window,
                      bubbles: true,
                      cancelable: true,
                      clientX: x,
                      clientY: y,
                      button: 0
                    });
                    link.dispatchEvent(clickEvent);
                    link.click();
                    await new Promise((r) => setTimeout(r, 800));
                    const finalSelectedText = dropdownPrompt?.textContent?.trim() || dropdownPrompt?.innerText?.trim() || "";
                    if (isWrrapdOption2(finalSelectedText)) {
                      console.log("[selectWrrapdAddressFromDropdown] \u2713\u2713\u2713 Successfully selected Wrrapd address on retry! \u2713\u2713\u2713");
                      return true;
                    } else {
                      console.error("[selectWrrapdAddressFromDropdown] \u2717 Retry also failed. Final selection:", finalSelectedText.substring(0, 100));
                    }
                  }
                }
              }
              console.error("[selectWrrapdAddressFromDropdown] \u2717 Failed to select Wrrapd address after all attempts.");
              return false;
            }
          }
        }
        console.warn("[selectWrrapdAddressFromDropdown] Wrrapd address not found in dropdown.");
        console.warn("[selectWrrapdAddressFromDropdown] Available options were logged above.");
        console.log("[selectWrrapdAddressFromDropdown] Performing FINAL comprehensive check for Wrrapd address...");
        let wrrapdFoundInFinalCheck = false;
        await new Promise((r) => setTimeout(r, 500));
        const finalCheckPopover = currentPopover;
        const refreshedOptions = finalCheckPopover.querySelectorAll('a, li a, [role="option"], li');
        for (const opt of refreshedOptions) {
          const optText = opt.textContent?.trim() || opt.innerText?.trim() || "";
          if (isWrrapdOption2(optText)) {
            console.log(`[selectWrrapdAddressFromDropdown] \u2713\u2713\u2713 FINAL CHECK: Found Wrrapd address in current popover! Text: "${optText.substring(0, 100)}"`);
            wrrapdFoundInFinalCheck = true;
            clickableElement = opt.querySelector("a[href]") || opt.querySelector("a") || opt.closest("a") || opt;
            const parentLi = opt.closest("li");
            if (parentLi && parentLi.querySelector("a")) {
              clickableElement = parentLi.querySelector("a");
            }
            dataValue = clickableElement.getAttribute("data-value");
            break;
          }
        }
        if (wrrapdFoundInFinalCheck && clickableElement && dataValue) {
          console.log("[selectWrrapdAddressFromDropdown] \u2713\u2713\u2713 Wrrapd address found in final check - will use robust selection logic below!");
          if (!popover || !document.body.contains(popover)) {
            console.warn("[selectWrrapdAddressFromDropdown] Popover closed, reopening...");
            dropdownActivator.click();
            await new Promise((r) => setTimeout(r, 1e3));
            const newPopover = document.querySelector(".a-popover");
            if (newPopover) {
              const refreshedOptions2 = newPopover.querySelectorAll('a, li a, [role="option"], li');
              for (const opt of refreshedOptions2) {
                const optText = opt.textContent?.trim() || opt.innerText?.trim() || "";
                if (isWrrapdOption2(optText)) {
                  clickableElement = opt.querySelector("a[href]") || opt.querySelector("a") || opt.closest("a") || opt;
                  const parentLi = opt.closest("li");
                  if (parentLi && parentLi.querySelector("a")) {
                    clickableElement = parentLi.querySelector("a");
                  }
                  dataValue = clickableElement.getAttribute("data-value");
                  break;
                }
              }
            }
          }
        }
        if (!wrrapdFoundInFinalCheck || !clickableElement || !dataValue) {
          console.log("[selectWrrapdAddressFromDropdown] \u2713 FINAL CHECK CONFIRMED: Wrrapd address is NOT available. Proceeding to add new address...");
          const currentURL = window.location.href;
          const isMultiAddressPage = currentURL.includes("itemselect/handlers/display.html") || currentURL.includes("/checkout/p/") && currentURL.includes("/itemselect") && currentURL.includes("useCase=multiAddress");
          if (isMultiAddressPage) {
            console.error("[selectWrrapdAddressFromDropdown] \u2717\u2717\u2717 CRITICAL: Wrrapd address not found on multi-address page, but 'Add a new delivery address' link does NOT exist on this page!");
            console.error("[selectWrrapdAddressFromDropdown] The 'Add a new delivery address' link ONLY exists on the initial address selection page (when clicking 'Change' address).");
            console.error("[selectWrrapdAddressFromDropdown] Cannot add address from multi-address page. Address must be added on the single address selection page first.");
            document.body.click();
            return false;
          }
          console.log("[selectWrrapdAddressFromDropdown] Wrrapd address missing - looking for 'Add a new delivery address' on the page...");
          console.log("[selectWrrapdAddressFromDropdown] There is ONLY ONE mention of this text on the page - searching comprehensively...");
          hideLoadingScreen();
          let newAddrLink = null;
          const searchText = "add a new delivery address";
          const searchTextLower = searchText.toLowerCase();
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
              console.log(`[selectWrrapdAddressFromDropdown] \u2713 Found text node: "${text.substring(0, 100)}"`);
              let parent = textNode.parentElement;
              while (parent && parent !== document.body) {
                if (parent.tagName === "A" || parent.tagName === "BUTTON" || parent.onclick || parent.getAttribute("role") === "link" || parent.getAttribute("role") === "button" || parent.hasAttribute("onclick") || parent.style.cursor === "pointer" || parent.classList.contains("a-link-normal")) {
                  newAddrLink = parent;
                  console.log(`[selectWrrapdAddressFromDropdown] \u2713 Found clickable parent: ${parent.tagName}, text: "${text.substring(0, 80)}"`);
                  break;
                }
                parent = parent.parentElement;
              }
              if (!newAddrLink) {
                newAddrLink = textNode.parentElement;
                console.log(`[selectWrrapdAddressFromDropdown] Using text node's parent: ${newAddrLink.tagName}`);
              }
              break;
            }
          }
          if (!newAddrLink) {
            console.log("[selectWrrapdAddressFromDropdown] METHOD 2: Using XPath search...");
            try {
              const xpath = `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${searchTextLower}')]`;
              const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
              const textElement = result.singleNodeValue;
              if (textElement) {
                console.log(`[selectWrrapdAddressFromDropdown] \u2713 Found via XPath: "${textElement.textContent?.trim().substring(0, 80)}"`);
                newAddrLink = textElement.closest('a, button, [role="link"], [role="button"], [onclick], .a-link-normal') || textElement;
              }
            } catch (e) {
              console.warn("[selectWrrapdAddressFromDropdown] XPath search failed:", e);
            }
          }
          if (!newAddrLink) {
            console.log("[selectWrrapdAddressFromDropdown] METHOD 3: Searching all elements by textContent...");
            const allElements = document.querySelectorAll("*");
            console.log(`[selectWrrapdAddressFromDropdown] Searching through ${allElements.length} elements...`);
            for (const element of allElements) {
              const elementText = (element.textContent || element.innerText || "").trim();
              if (!elementText) continue;
              const elementTextLower = elementText.toLowerCase();
              if (elementTextLower.includes(searchTextLower)) {
                console.log(`[selectWrrapdAddressFromDropdown] \u2713 Found element with text: "${elementText.substring(0, 100)}"`);
                if (element.tagName === "A" || element.tagName === "BUTTON" || element.onclick || element.getAttribute("role") === "link" || element.getAttribute("role") === "button" || element.hasAttribute("onclick") || element.style.cursor === "pointer" || element.classList.contains("a-link-normal")) {
                  newAddrLink = element;
                  console.log(`[selectWrrapdAddressFromDropdown] \u2713 Element is clickable: ${element.tagName}`);
                  break;
                }
                const clickable = element.closest('a, button, [role="link"], [role="button"], [onclick], .a-link-normal');
                if (clickable) {
                  newAddrLink = clickable;
                  console.log(`[selectWrrapdAddressFromDropdown] \u2713 Found clickable parent: ${clickable.tagName}`);
                  break;
                }
              }
            }
          }
          if (!newAddrLink) {
            console.log("[selectWrrapdAddressFromDropdown] METHOD 4: Searching all clickable elements directly...");
            const allClickable = Array.from(document.querySelectorAll('a, button, [role="link"], [role="button"], .a-link-normal'));
            console.log(`[selectWrrapdAddressFromDropdown] Checking ${allClickable.length} clickable elements...`);
            for (const clickable of allClickable) {
              const clickableText = (clickable.textContent || clickable.innerText || "").trim().toLowerCase();
              if (clickableText.includes(searchTextLower)) {
                console.log(`[selectWrrapdAddressFromDropdown] \u2713 Found clickable element: "${(clickable.textContent || clickable.innerText || "").trim().substring(0, 80)}"`);
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
              showLoadingScreen();
              newAddrLink.click();
              await new Promise((r) => setTimeout(r, 2e3));
              console.log("[selectWrrapdAddressFromDropdown] Filling Wrrapd address in form...");
              const success = await fillWrrapdAddressInModal();
              if (success) {
                console.log("[selectWrrapdAddressFromDropdown] \u2713 Wrrapd address added successfully!");
                await new Promise((r) => setTimeout(r, 3e3));
                document.body.click();
                await new Promise((r) => setTimeout(r, 1e3));
                const stillOpenPopover = document.querySelector(".a-popover");
                if (stillOpenPopover) {
                  document.body.click();
                  await new Promise((r) => setTimeout(r, 500));
                }
                console.log("[selectWrrapdAddressFromDropdown] Retrying to select Wrrapd address for THIS dropdown only...");
                return await selectWrrapdAddressFromDropdown(dropdownActivator);
              } else {
                console.error("[selectWrrapdAddressFromDropdown] \u2717 Failed to add Wrrapd address.");
                document.body.click();
                return false;
              }
            } catch (error) {
              console.error("[selectWrrapdAddressFromDropdown] Error clicking 'Add a new delivery address':", error);
              document.body.click();
              return false;
            }
          } else {
            console.warn("[selectWrrapdAddressFromDropdown] 'Add a new delivery address' option not found on page.");
            console.warn("[selectWrrapdAddressFromDropdown] Searched through all options but couldn't find 'Add new address' link.");
            showLoadingScreen();
            wrrapdAddressCache = null;
            document.body.click();
            return false;
          }
        }
      } catch (error) {
        console.error("[selectWrrapdAddressFromDropdown] Error:", error);
        return false;
      }
    }
    async function selectDefaultAddressFromDropdown(dropdownActivator, defaultAddress) {
      try {
        console.log("[selectDefaultAddressFromDropdown] Opening dropdown...");
        dropdownActivator.click();
        await new Promise((r) => setTimeout(r, 2e3));
        const popover = document.querySelector(".a-popover");
        if (!popover) {
          console.warn("[selectDefaultAddressFromDropdown] Popover did not appear.");
          return false;
        }
        const options = popover.querySelectorAll('a, li a, [role="option"]');
        const defaultName = (defaultAddress.name || "").trim();
        const defaultCity = (defaultAddress.city || "").trim();
        for (const option of options) {
          const text = option.textContent || "";
          if (defaultName && text.includes(defaultName) || defaultCity && text.includes(defaultCity)) {
            console.log("[selectDefaultAddressFromDropdown] Found default address. Clicking...");
            option.click();
            await new Promise((r) => setTimeout(r, 2e3));
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
    async function selectAddressesForRow(row, titleKey, productObj, defaultAddress, wrrapdAddress) {
      console.log(`[selectAddressesForRow] Processing addresses for "${titleKey}".`);
      try {
        const addressDropdowns = row.querySelectorAll('.a-dropdown-prompt, [class*="dropdown-prompt"], [class*="lineitem-address"] .a-dropdown-prompt');
        console.log(`[selectAddressesForRow] Found ${addressDropdowns.length} address dropdown(s) in row`);
        if (addressDropdowns.length === 0) {
          console.warn(`[selectAddressesForRow] No address dropdowns found in row for "${titleKey}"`);
          return;
        }
        const quantityDropdowns = row.querySelectorAll('.quantity-dropdown .a-dropdown-prompt, [class*="quantity"] .a-dropdown-prompt');
        const quantityValues = [];
        quantityDropdowns.forEach((dropdown) => {
          const qtyText = dropdown.textContent?.trim() || "1";
          const qty = parseInt(qtyText, 10) || 1;
          quantityValues.push(qty);
        });
        if (quantityValues.length === 0) {
          addressDropdowns.forEach(() => quantityValues.push(1));
        }
        let subItemIndex = 0;
        for (let i = 0; i < addressDropdowns.length; i++) {
          try {
            const dropdownElement = addressDropdowns[i];
            const qty = quantityValues[i] || 1;
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
            let wrrapdCount = 0;
            let defaultCount = 0;
            for (const { subItem } of subItemsForThisDropdown) {
              if (subItem.checkbox_wrrapd === true) {
                wrrapdCount++;
              } else {
                defaultCount++;
              }
            }
            if (wrrapdCount > 0) {
              const success = await selectAddressInCustomDropdown(dropdownElement, true, defaultAddress, wrrapdAddress);
              if (success) {
                console.log(`[selectAddressesForRow] Successfully selected Wrrapd address for dropdown ${i}.`);
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
              console.log(`[selectAddressesForRow] Dropdown ${i} maps to ${subItemsForThisDropdown.length} sub-item(s) - all are NOT for Wrrapd. Keeping default address.`);
              if (defaultAddress) {
                await selectAddressInCustomDropdown(dropdownElement, false, defaultAddress, wrrapdAddress);
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
    async function selectAddressesForRow_OLD(row, titleKey, productObj, defaultAddress, wrrapdAddress) {
      console.log(`[selectAddressesForRow] Processing addresses for "${titleKey}".`);
      try {
        const fullPageSnapshot = getFullPageDOMSnapshot();
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
            const cleaned = aiResponse.trim();
            const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
            const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;
            if (jsonStr.startsWith("[")) {
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
        if (addressSelects.length === 0) {
          console.log(`[selectAddressesForRow] AI didn't find selects, trying fallback - looking for all <select> elements in row...`);
          const allSelects = row.querySelectorAll("select");
          console.log(`[selectAddressesForRow] Found ${allSelects.length} <select> elements in row using fallback`);
          allSelects.forEach((select, index) => {
            let selector = "select";
            if (select.id) {
              selector = `select#${select.id}`;
            } else if (select.name) {
              selector = `select[name="${select.name}"]`;
            } else if (select.className) {
              const classes = select.className.trim().split(/\s+/).filter((c) => c.length > 0);
              if (classes.length > 0) {
                selector = `select.${classes[0]}`;
              }
            }
            const options = Array.from(select.options);
            const hasAddressOptions = options.some((opt) => {
              const text = opt.text.toLowerCase();
              return text.includes("jacksonville") || text.includes("address") || text.includes("ship") || text.includes("deliver") || /[A-Z]{2}\s+\d{5}/.test(text);
            });
            if (hasAddressOptions || options.length > 0) {
              addressSelects.push({
                selector,
                productTitle: titleKey,
                index
              });
            }
          });
        }
        let rowSelects = addressSelects.filter((s) => {
          const element = row.querySelector(s.selector);
          if (element) {
            console.log(`[selectAddressesForRow] AI selector "${s.selector}" found in row`);
          } else {
            console.log(`[selectAddressesForRow] AI selector "${s.selector}" NOT found in row`);
          }
          return element !== null;
        });
        console.log(`[selectAddressesForRow] After filtering, ${rowSelects.length} selects match this row`);
        if (rowSelects.length === 0) {
          console.log(`[selectAddressesForRow] No AI selects matched, finding all selects in row directly...`);
          const allSelectsInRow = row.querySelectorAll("select");
          console.log(`[selectAddressesForRow] Found ${allSelectsInRow.length} <select> elements directly in row`);
          allSelectsInRow.forEach((select, index) => {
            console.log(`[selectAddressesForRow] Select ${index}: id="${select.id}", name="${select.name}", classes="${select.className}", options=${select.options.length}`);
            let selector = getUniqueSelectorForElement(select, row);
            if (!selector) {
              if (select.id) {
                selector = `select#${select.id}`;
              } else if (select.name) {
                selector = `select[name="${select.name}"]`;
              } else {
                selector = `select:nth-of-type(${index + 1})`;
              }
            }
            rowSelects.push({
              selector,
              productTitle: titleKey,
              index
            });
          });
        }
        console.log(`[selectAddressesForRow] Total ${rowSelects.length} address <select> dropdown(s) found for "${titleKey}".`);
        if (rowSelects.length === 0) {
          console.warn(`[selectAddressesForRow] No address selects found for "${titleKey}".`);
          return;
        }
        const quantitySelects = row.querySelectorAll('select[class*="quantity"], select[name*="quantity"]');
        const quantityValues = [];
        quantitySelects.forEach((select) => {
          const value = parseInt(select.value, 10) || 1;
          quantityValues.push(value);
        });
        if (quantityValues.length === 0) {
          rowSelects.forEach(() => quantityValues.push(1));
        }
        let subItemIndex = 0;
        for (let i = 0; i < rowSelects.length; i++) {
          try {
            const selectInfo = rowSelects[i];
            let selectElement = row.querySelector(selectInfo.selector);
            if (!selectElement) {
              const allSelects = row.querySelectorAll("select");
              if (allSelects[selectInfo.index]) {
                selectElement = allSelects[selectInfo.index];
              }
            }
            if (!selectElement || selectElement.tagName !== "SELECT") {
              console.warn(`[selectAddressesForRow] Select element not found for selector "${selectInfo.selector}". Skipping.`);
              continue;
            }
            const qty = quantityValues[i] || 1;
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
            let wrrapdCount = 0;
            let defaultCount = 0;
            for (const { subItem } of subItemsForThisSelect) {
              if (subItem.checkbox_wrrapd === true) {
                wrrapdCount++;
              } else {
                defaultCount++;
              }
            }
            if (wrrapdCount > 0) {
              const success = await selectAddressInNativeSelect(selectElement, true, defaultAddress, wrrapdAddress);
              if (success) {
                console.log(`[selectAddressesForRow] Successfully selected Wrrapd address for select ${i}.`);
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
              console.log(`[selectAddressesForRow] Select ${i} maps to ${subItemsForThisSelect.length} sub-item(s) - all are NOT for Wrrapd. Keeping default address.`);
              if (defaultAddress) {
                await selectAddressInNativeSelect(selectElement, false, defaultAddress, wrrapdAddress);
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
    async function selectAddressFromDropdown(dropdownActivator, needsWrrapd, targetAddress) {
      try {
        console.log(`[selectAddressFromDropdown] Starting. NeedsWrrapd: ${needsWrrapd}`);
        const existingPopovers = document.querySelectorAll(".a-popover");
        if (existingPopovers.length > 0) {
          console.log("[selectAddressFromDropdown] Closing existing popovers...");
          document.body.click();
          await new Promise((r) => setTimeout(r, 1500));
        }
        console.log("[selectAddressFromDropdown] Clicking dropdown activator...");
        dropdownActivator.click();
        await new Promise((r) => setTimeout(r, 2e3));
        const popover = await waitForElement(".a-popover", 3e3);
        if (!popover) {
          console.warn("[selectAddressFromDropdown] Popover did not appear after clicking dropdown.");
          return false;
        }
        console.log("[selectAddressFromDropdown] Popover appeared. Waiting for address options...");
        await new Promise((r) => setTimeout(r, 1500));
        let addressOptions = popover.querySelectorAll("ul.a-list-link li a, .a-popover a, .a-list-link a");
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
        let targetOption = null;
        if (needsWrrapd) {
          console.log("[selectAddressFromDropdown] Searching for Wrrapd address (PO BOX 26067, Jacksonville, 32226-6067)...");
          const wrrapdAddress = buildWrrapdAddress();
          console.log(`[selectAddressFromDropdown] Available address options (${addressOptions.length}):`);
          addressOptions.forEach((opt, idx) => {
            console.log(`  [${idx}] "${opt.textContent.trim().substring(0, 100)}"`);
          });
          for (const option of addressOptions) {
            const optionText = option.textContent.trim().toUpperCase();
            const optionTextLower = option.textContent.trim().toLowerCase();
            const hasPOBox = optionText.includes("PO BOX 26067") || optionText.includes("P.O. BOX 26067") || optionText.includes("POBOX 26067") || optionText.includes("26067");
            const hasJacksonville = optionText.includes("JACKSONVILLE");
            const hasWrrapdName = optionTextLower.includes("wrrapd") || optionTextLower.includes("wrrapd.com");
            const hasCorrectZip = optionText.includes("32218") || optionText.includes("32226") || optionText.includes("32218-") || optionText.includes("32226-");
            const hasFLJacksonville = optionText.includes("FL") && hasJacksonville;
            const isMatch = hasPOBox && hasJacksonville || // PO Box + Jacksonville = definite match
            hasPOBox && hasCorrectZip || // PO Box + correct zip = definite match
            hasWrrapdName && hasJacksonville || // Wrrapd name + Jacksonville = match
            hasWrrapdName && hasPOBox || // Wrrapd name + PO Box = match
            hasPOBox && hasFLJacksonville;
            if (isMatch) {
              targetOption = option;
              console.log(`[selectAddressFromDropdown] \u2713 FOUND Wrrapd address: "${option.textContent.trim().substring(0, 100)}"`);
              console.log(`[selectAddressFromDropdown] Match criteria: POBox=${hasPOBox}, Jacksonville=${hasJacksonville}, Wrrapd=${hasWrrapdName}, Zip=${hasCorrectZip}`);
              break;
            }
          }
          if (!targetOption && addressOptions.length > 0) {
            console.log("[selectAddressFromDropdown] Wrrapd address not found with standard matching. Using Gemini API to identify...");
            try {
              const optionsText = Array.from(addressOptions).map(
                (opt, idx) => `[${idx}] ${opt.textContent.trim()}`
              ).join("\n");
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
                  console.log(`[selectAddressFromDropdown] \u2713 Gemini identified Wrrapd address at index ${matchIndex}: "${targetOption.textContent.trim().substring(0, 100)}"`);
                }
              }
            } catch (geminiError) {
              console.warn("[selectAddressFromDropdown] Gemini API failed, continuing with manual search:", geminiError);
            }
          }
        } else {
          console.log("[selectAddressFromDropdown] Searching for default address:", targetAddress);
          const defaultName = (targetAddress.name || "").trim();
          const defaultCity = (targetAddress.city || "").trim();
          const defaultState = (targetAddress.state || "").trim();
          const defaultZip = (targetAddress.postalCode || "").trim();
          const defaultStreet = (targetAddress.street || "").trim();
          for (const option of addressOptions) {
            const optionText = option.textContent.trim();
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
          await new Promise((r) => setTimeout(r, 2e3));
          const popoverStillOpen = document.querySelector(".a-popover");
          if (!popoverStillOpen) {
            console.log("[selectAddressFromDropdown] Selection successful - popover closed.");
            return true;
          } else {
            console.warn("[selectAddressFromDropdown] Popover still open after clicking. Closing manually...");
            document.body.click();
            await new Promise((r) => setTimeout(r, 1e3));
            return true;
          }
        } else {
          console.error(`[selectAddressFromDropdown] Target address not found in dropdown options.`);
          console.log(`[selectAddressFromDropdown] Available options:`);
          addressOptions.forEach((opt, idx) => {
            if (idx < 5) {
              console.log(`  [${idx + 1}] "${opt.textContent.trim().substring(0, 60)}"`);
            }
          });
          document.body.click();
          await new Promise((r) => setTimeout(r, 500));
          return false;
        }
      } catch (err) {
        console.error("[selectAddressFromDropdown] Error:", err);
        document.body.click();
        await new Promise((r) => setTimeout(r, 500));
        return false;
      }
    }
    async function processAddressChangeSimple(row, dropdownActivator, needsWrrapd, targetAddress) {
      try {
        console.log(`[processAddressChangeSimple] Starting address change. NeedsWrrapd: ${needsWrrapd}`);
        const existingPopovers = document.querySelectorAll(".a-popover");
        if (existingPopovers.length > 0) {
          document.body.click();
          await new Promise((r) => setTimeout(r, 1e3));
        }
        dropdownActivator.click();
        await new Promise((r) => setTimeout(r, 1e3));
        const popover = await waitForElement(".a-popover", 3e3);
        if (!popover) {
          console.warn("[processAddressChangeSimple] Popover did not appear.");
          return false;
        }
        let dropdownOptions = await waitForElement(".a-popover ul.a-list-link li a", 3e3, true);
        if (!dropdownOptions || dropdownOptions.length === 0) {
          console.warn("[processAddressChangeSimple] No address options found.");
          document.body.click();
          return false;
        }
        let targetOption = null;
        const searchText = needsWrrapd ? targetAddress.name + " " + targetAddress.street : targetAddress.name + " " + targetAddress.city;
        for (const option of dropdownOptions) {
          const optionText = option.textContent.trim();
          if (needsWrrapd) {
            if (optionText.includes("Wrrapd.com") && optionText.includes("PO BOX 26067")) {
              targetOption = option;
              break;
            }
          } else {
            if (targetAddress.name && optionText.includes(targetAddress.name) || targetAddress.city && optionText.includes(targetAddress.city) || targetAddress.postalCode && optionText.includes(targetAddress.postalCode)) {
              targetOption = option;
              break;
            }
          }
        }
        if (targetOption) {
          console.log(`[processAddressChangeSimple] Found target address. Clicking...`);
          targetOption.click();
          await new Promise((r) => setTimeout(r, 2e3));
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
    async function selectAddressInCustomDropdown(dropdownElement, needsWrrapd, defaultAddress, wrrapdAddress) {
      try {
        if (!dropdownElement) {
          console.error("[selectAddressInCustomDropdown] Invalid dropdown element provided.");
          return false;
        }
        console.log(`[selectAddressInCustomDropdown] Processing custom dropdown. Looking for: ${needsWrrapd ? "Wrrapd address" : "Default address"}`);
        const existingPopovers = document.querySelectorAll(".a-popover");
        if (existingPopovers.length > 0) {
          document.body.click();
          await new Promise((r) => setTimeout(r, 1e3));
        }
        console.log(`[selectAddressInCustomDropdown] Clicking dropdown to open...`);
        dropdownElement.click();
        await new Promise((r) => setTimeout(r, 1500));
        const popover = await waitForElement(".a-popover", 3e3);
        if (!popover) {
          console.warn("[selectAddressInCustomDropdown] Popover did not appear after clicking dropdown.");
          return false;
        }
        let dropdownOptions = await waitForElement(".a-popover ul.a-list-link li a", 3e3, true);
        if ((!dropdownOptions || dropdownOptions.length === 0) && popover) {
          let showMoreLink = popover.querySelector('[aria-label*="Show more" i], [aria-label*="See more" i]');
          if (!showMoreLink) {
            const links = popover.querySelectorAll("a, button");
            for (const link of links) {
              const text = link.textContent?.trim().toLowerCase() || "";
              if (text.includes("show more") || text.includes("see more")) {
                showMoreLink = link;
                break;
              }
            }
          }
          if (showMoreLink) {
            console.log("[selectAddressInCustomDropdown] Clicking 'Show more addresses' to expand list.");
            showMoreLink.click();
            await new Promise((r) => setTimeout(r, 2e3));
            dropdownOptions = await waitForElement(".a-popover ul.a-list-link li a", 3e3, true);
          }
        }
        if (!dropdownOptions || dropdownOptions.length === 0) {
          console.warn("[selectAddressInCustomDropdown] No address options found in dropdown.");
          document.body.click();
          await new Promise((r) => setTimeout(r, 1e3));
          return false;
        }
        console.log(`[selectAddressInCustomDropdown] Found ${dropdownOptions.length} address options`);
        dropdownOptions.forEach((opt, idx) => {
          const text = opt.textContent?.trim() || "";
          console.log(`[selectAddressInCustomDropdown] Option ${idx}: "${text.substring(0, 100)}"`);
        });
        let targetOption = null;
        if (needsWrrapd) {
          console.log(`[selectAddressInCustomDropdown] Searching for Wrrapd address (PO BOX 26067, JACKSONVILLE)...`);
          console.log(`[selectAddressInCustomDropdown] Available options (${dropdownOptions.length}):`);
          dropdownOptions.forEach((opt, idx) => {
            console.log(`  [${idx}] "${opt.textContent.trim().substring(0, 100)}"`);
          });
          for (const option of dropdownOptions) {
            const optionText = option.textContent.trim().toUpperCase();
            const optionTextLower = option.textContent.trim().toLowerCase();
            const hasPOBox = optionText.includes("PO BOX 26067") || optionText.includes("P.O. BOX 26067") || optionText.includes("POBOX 26067") || optionText.includes("26067");
            const hasJacksonville = optionText.includes("JACKSONVILLE");
            const hasWrrapdName = optionTextLower.includes("wrrapd") || optionTextLower.includes("wrrapd.com");
            const hasCorrectZip = optionText.includes("32218") || optionText.includes("32226") || optionText.includes("32218-") || optionText.includes("32226-");
            const hasFLJacksonville = optionText.includes("FL") && hasJacksonville;
            const isMatch = hasPOBox && hasJacksonville || hasPOBox && hasCorrectZip || hasWrrapdName && hasJacksonville || hasWrrapdName && hasPOBox || hasPOBox && hasFLJacksonville;
            if (isMatch) {
              targetOption = option;
              console.log(`[selectAddressInCustomDropdown] \u2713 FOUND Wrrapd address: "${option.textContent.trim().substring(0, 100)}"`);
              break;
            }
          }
          if (!targetOption) {
            for (const option of dropdownOptions) {
              const optionText = option.textContent.trim();
              if (optionText.includes("Ship to a new address") || optionText.includes("Add new address") || optionText.includes("Create")) {
                console.log("[selectAddressInCustomDropdown] Wrrapd address not found. Found 'new address' option - may need to create address.");
                document.body.click();
                await new Promise((r) => setTimeout(r, 1e3));
                return false;
              }
            }
          }
        } else {
          if (defaultAddress) {
            console.log(`[selectAddressInCustomDropdown] Searching for default address:`, defaultAddress);
            const defaultName = (defaultAddress.name || "").trim();
            const defaultCity = (defaultAddress.city || "").trim();
            const defaultState = (defaultAddress.state || "").trim();
            const defaultZip = (defaultAddress.postalCode || "").trim();
            const defaultStreet = (defaultAddress.street || "").trim();
            console.log(`[selectAddressInCustomDropdown] Matching criteria - Name: "${defaultName}", City: "${defaultCity}", State: "${defaultState}", Zip: "${defaultZip}", Street: "${defaultStreet}"`);
            for (const option of dropdownOptions) {
              const optionText = option.textContent.trim();
              const matchesName = defaultName && optionText.includes(defaultName);
              const matchesCity = defaultCity && optionText.includes(defaultCity);
              const matchesState = defaultState && optionText.includes(defaultState);
              const matchesZip = defaultZip && optionText.includes(defaultZip);
              const matchesStreet = defaultStreet && optionText.includes(defaultStreet);
              if (matchesName || matchesCity && matchesState || matchesZip || matchesStreet) {
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
          await new Promise((r) => setTimeout(r, 2e3));
          const newText = dropdownElement.textContent?.trim() || "";
          console.log(`[selectAddressInCustomDropdown] Dropdown now shows: "${newText.substring(0, 80)}"`);
          return true;
        } else {
          console.warn(`[selectAddressInCustomDropdown] Could not find ${needsWrrapd ? "Wrrapd" : "default"} address in dropdown.`);
          document.body.click();
          await new Promise((r) => setTimeout(r, 1e3));
          return false;
        }
      } catch (err) {
        console.error("[selectAddressInCustomDropdown] Error:", err);
        document.body.click();
        await new Promise((r) => setTimeout(r, 1e3));
        return false;
      }
    }
    async function selectAddressInNativeSelect(selectElement, needsWrrapd, defaultAddress, wrrapdAddress) {
      try {
        if (!selectElement || selectElement.tagName !== "SELECT") {
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
        console.log(`[selectAddressInNativeSelect] Looking for: ${needsWrrapd ? "Wrrapd address" : "Default address"}`);
        console.log(`[selectAddressInNativeSelect] Available options:`);
        options.forEach((opt, idx) => {
          console.log(`  [${idx}] value="${opt.value}", text="${opt.text.trim().substring(0, 100)}"`);
        });
        let targetOption = null;
        let targetValue = null;
        if (needsWrrapd) {
          console.log(`[selectAddressInNativeSelect] Searching for Wrrapd address (PO BOX 26067, JACKSONVILLE)...`);
          console.log(`[selectAddressInNativeSelect] Available options (${options.length}):`);
          options.forEach((opt, idx) => {
            console.log(`  [${idx}] "${opt.text.trim().substring(0, 100)}"`);
          });
          for (const option of options) {
            const optionText = option.text.trim().toUpperCase();
            const optionTextLower = option.text.trim().toLowerCase();
            const optionValue = option.value;
            const hasPOBox = optionText.includes("PO BOX 26067") || optionText.includes("P.O. BOX 26067") || optionText.includes("POBOX 26067") || optionText.includes("26067");
            const hasJacksonville = optionText.includes("JACKSONVILLE");
            const hasWrrapdName = optionTextLower.includes("wrrapd") || optionTextLower.includes("wrrapd.com");
            const hasCorrectZip = optionText.includes("32218") || optionText.includes("32226") || optionText.includes("32218-") || optionText.includes("32226-");
            const hasFLJacksonville = optionText.includes("FL") && hasJacksonville;
            const isMatch = hasPOBox && hasJacksonville || hasPOBox && hasCorrectZip || hasWrrapdName && hasJacksonville || hasWrrapdName && hasPOBox || hasPOBox && hasFLJacksonville;
            if (isMatch) {
              targetOption = option;
              targetValue = optionValue;
              console.log(`[selectAddressInNativeSelect] \u2713 FOUND Wrrapd address: "${option.text.trim().substring(0, 100)}"`);
              break;
            }
          }
          if (!targetOption) {
            for (const option of options) {
              const optionText = option.text.trim().toLowerCase();
              if (optionText.includes("new address") || optionText.includes("add address") || optionText.includes("create")) {
                console.log("[selectAddressInNativeSelect] Wrrapd address not found. Found 'new address' option - may need to create address.");
                return false;
              }
            }
          }
        } else {
          if (defaultAddress) {
            console.log(`[selectAddressInNativeSelect] Searching for default address:`, defaultAddress);
            const defaultName = (defaultAddress.name || "").trim();
            const defaultCity = (defaultAddress.city || "").trim();
            const defaultState = (defaultAddress.state || "").trim();
            const defaultZip = (defaultAddress.postalCode || "").trim();
            const defaultStreet = (defaultAddress.street || "").trim();
            console.log(`[selectAddressInNativeSelect] Matching criteria - Name: "${defaultName}", City: "${defaultCity}", State: "${defaultState}", Zip: "${defaultZip}", Street: "${defaultStreet}"`);
            for (const option of options) {
              const optionText = option.text.trim();
              const optionValue = option.value;
              const matchesName = defaultName && optionText.includes(defaultName);
              const matchesCity = defaultCity && optionText.includes(defaultCity);
              const matchesState = defaultState && optionText.includes(defaultState);
              const matchesZip = defaultZip && optionText.includes(defaultZip);
              const matchesStreet = defaultStreet && optionText.includes(defaultStreet);
              if (matchesName || matchesCity && matchesState || matchesZip || matchesStreet) {
                targetOption = option;
                targetValue = optionValue;
                console.log(`[selectAddressInNativeSelect] Found default address option: "${optionText.substring(0, 80)}"`);
                break;
              }
            }
          }
        }
        if (targetOption && targetValue !== null) {
          console.log(`[selectAddressInNativeSelect] Setting select value to: "${targetValue}"`);
          selectElement.value = targetValue;
          const changeEvent = new Event("change", { bubbles: true });
          selectElement.dispatchEvent(changeEvent);
          const inputEvent = new Event("input", { bubbles: true });
          selectElement.dispatchEvent(inputEvent);
          await new Promise((r) => setTimeout(r, 1e3));
          if (selectElement.value === targetValue) {
            console.log("[selectAddressInNativeSelect] Successfully selected address.");
            return true;
          } else {
            console.warn("[selectAddressInNativeSelect] Selection may not have been applied correctly.");
            return false;
          }
        } else {
          console.warn(`[selectAddressInNativeSelect] Could not find ${needsWrrapd ? "Wrrapd" : "default"} address in select options.`);
          console.log("[selectAddressInNativeSelect] Available options:", options.map((opt) => opt.text.trim().substring(0, 50)));
          return false;
        }
      } catch (err) {
        console.error("[selectAddressInNativeSelect] Error:", err);
        return false;
      }
    }
    async function selectAddressInDropdown(dropdownElement, needsWrrapd, defaultAddress, wrrapdAddress) {
      try {
        const existingPopovers = document.querySelectorAll(".a-popover");
        if (existingPopovers.length > 0) {
          document.body.click();
          await new Promise((r) => setTimeout(r, 1e3));
        }
        dropdownElement.click();
        await new Promise((r) => setTimeout(r, 1500));
        const popover = await waitForElement(".a-popover", 3e3);
        if (!popover) {
          console.warn("[selectAddressInDropdown] Popover did not appear after clicking dropdown.");
          return false;
        }
        let dropdownOptions = await waitForElement(".a-popover ul.a-list-link li a", 3e3, true);
        if ((!dropdownOptions || dropdownOptions.length === 0) && popover) {
          let showMoreLink = popover.querySelector('[aria-label*="Show more" i], [aria-label*="See more" i]');
          if (!showMoreLink) {
            const links = popover.querySelectorAll("a, button");
            for (const link of links) {
              const text = link.textContent?.trim().toLowerCase() || "";
              if (text.includes("show more") || text.includes("see more")) {
                showMoreLink = link;
                break;
              }
            }
          }
          if (showMoreLink) {
            console.log("[selectAddressInDropdown] Clicking 'Show more addresses' to expand list.");
            showMoreLink.click();
            await new Promise((r) => setTimeout(r, 2e3));
            dropdownOptions = await waitForElement(".a-popover ul.a-list-link li a", 3e3, true);
          }
        }
        if (!dropdownOptions || dropdownOptions.length === 0) {
          console.warn("[selectAddressInDropdown] No address options found in dropdown.");
          return false;
        }
        let targetOption = null;
        const targetAddress = needsWrrapd ? wrrapdAddress : defaultAddress;
        if (needsWrrapd) {
          for (const option of dropdownOptions) {
            const optionText = option.textContent.trim();
            if ((optionText.includes("Wrrapd.com") || optionText.includes("Wrrapd")) && (optionText.includes("PO BOX 26067") || optionText.includes("26067"))) {
              targetOption = option;
              console.log("[selectAddressInDropdown] Found Wrrapd address option.");
              break;
            }
          }
          if (!targetOption) {
            for (const option of dropdownOptions) {
              const optionText = option.textContent.trim();
              if (optionText.includes("Ship to a new address") || optionText.includes("Add new address")) {
                console.log("[selectAddressInDropdown] Wrrapd address not found. Need to create new address.");
                option.click();
                return false;
              }
            }
          }
        } else {
          if (defaultAddress) {
            const defaultName = defaultAddress.name || "";
            const defaultCity = defaultAddress.city || "";
            const defaultState = defaultAddress.state || "";
            const defaultZip = defaultAddress.postalCode || "";
            for (const option of dropdownOptions) {
              const optionText = option.textContent.trim();
              const matchesName = defaultName && optionText.includes(defaultName);
              const matchesCity = defaultCity && optionText.includes(defaultCity);
              const matchesState = defaultState && optionText.includes(defaultState);
              const matchesZip = defaultZip && optionText.includes(defaultZip);
              if (matchesName || matchesCity && matchesState || matchesZip) {
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
          await new Promise((r) => setTimeout(r, 2e3));
          return true;
        } else {
          console.warn(`[selectAddressInDropdown] Could not find ${needsWrrapd ? "Wrrapd" : "default"} address in dropdown.`);
          document.body.click();
          await new Promise((r) => setTimeout(r, 1e3));
          return false;
        }
      } catch (err) {
        console.error("[selectAddressInDropdown] Error:", err);
        document.body.click();
        await new Promise((r) => setTimeout(r, 1e3));
        return false;
      }
    }
    function getFullPageDOMSnapshot() {
      let snapshot = "";
      const allSelects = document.querySelectorAll("select");
      console.log(`[getFullPageDOMSnapshot] Found ${allSelects.length} <select> elements on page.`);
      snapshot += `
=== PAGE STRUCTURE ===
`;
      snapshot += `Total <select> elements found: ${allSelects.length}

`;
      const itemRows = document.querySelectorAll('.a-row.a-spacing-base.item-row, [class*="item-row"], [class*="product-row"]');
      snapshot += `Item rows found: ${itemRows.length}

`;
      allSelects.forEach((select, index) => {
        if (index < 50) {
          const id = select.id || "";
          const name = select.name || "";
          const classes = select.className || "";
          const options = Array.from(select.options);
          const selectedValue = select.value;
          const selectedText = select.options[select.selectedIndex]?.text || "";
          const parent = select.parentElement;
          const parentClasses = parent ? parent.className || "" : "";
          const parentId = parent ? parent.id || "" : "";
          let productTitle = "";
          let current = parent;
          let depth = 0;
          while (current && depth < 5) {
            const titleEl = current.querySelector('p.a-spacing-micro.a-size-base.a-text-bold, [class*="title"], [class*="product-name"]');
            if (titleEl) {
              productTitle = titleEl.textContent?.trim().substring(0, 50) || "";
              break;
            }
            current = current.parentElement;
            depth++;
          }
          snapshot += `
--- Select Element ${index + 1} ---
`;
          snapshot += `Tag: ${select.tagName}
`;
          snapshot += `ID: ${id}
`;
          snapshot += `Name: ${name}
`;
          snapshot += `Classes: ${classes}
`;
          snapshot += `Parent Classes: ${parentClasses}
`;
          snapshot += `Parent ID: ${parentId}
`;
          snapshot += `Product Title: ${productTitle}
`;
          snapshot += `Selected Value: ${selectedValue}
`;
          snapshot += `Selected Text: ${selectedText}
`;
          snapshot += `Total Options: ${options.length}
`;
          options.slice(0, 5).forEach((opt, optIndex) => {
            snapshot += `  Option ${optIndex + 1}: value="${opt.value}", text="${opt.text.trim().substring(0, 80)}"
`;
          });
          if (options.length > 5) {
            snapshot += `  ... and ${options.length - 5} more options
`;
          }
        }
      });
      itemRows.forEach((row, rowIndex) => {
        if (rowIndex < 10) {
          const titleEl = row.querySelector('p.a-spacing-micro.a-size-base.a-text-bold, [class*="title"]');
          const title = titleEl ? titleEl.textContent?.trim().substring(0, 50) : "Unknown";
          const selectsInRow = row.querySelectorAll("select");
          snapshot += `
--- Item Row ${rowIndex + 1} ---
`;
          snapshot += `Title: ${title}
`;
          snapshot += `Selects in row: ${selectsInRow.length}
`;
        }
      });
      return snapshot || "No DOM structure found";
    }
    function getSimplifiedDOMSnapshotForRow(row) {
      let snapshot = "";
      const selects = row.querySelectorAll("select");
      snapshot += `Select elements in row: ${selects.length}

`;
      selects.forEach((select, index) => {
        const id = select.id || "";
        const name = select.name || "";
        const classes = select.className || "";
        const options = Array.from(select.options);
        const selectedValue = select.value;
        snapshot += `
--- Select ${index + 1} ---
`;
        snapshot += `ID: ${id}
`;
        snapshot += `Name: ${name}
`;
        snapshot += `Classes: ${classes}
`;
        snapshot += `Selected Value: ${selectedValue}
`;
        snapshot += `Options: ${options.length}
`;
        options.slice(0, 3).forEach((opt) => {
          snapshot += `  - "${opt.text.trim().substring(0, 60)}"
`;
        });
      });
      return snapshot || "Row structure not found";
    }
    function getUniqueSelectorForElement(element, container) {
      if (!element || !container) return null;
      if (element.id) {
        const selector = `#${element.id}`;
        if (container.querySelector(selector) === element) {
          return selector;
        }
      }
      if (element.className && typeof element.className === "string") {
        const classes = element.className.trim().split(/\s+/).filter((c) => c.length > 0);
        if (classes.length > 0) {
          const selector = "." + classes.join(".");
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
      let path = [];
      let current = element;
      while (current && current !== container && path.length < 5) {
        let selector = current.tagName.toLowerCase();
        if (current.id) {
          selector += `#${current.id}`;
        } else if (current.className && typeof current.className === "string") {
          const classes = current.className.trim().split(/\s+/).filter((c) => c.length > 0);
          if (classes.length > 0) {
            selector += "." + classes[0];
          }
        }
        path.unshift(selector);
        current = current.parentElement;
      }
      return path.length > 0 ? path.join(" > ") : null;
    }
    async function scrapeShippingAddressOnMulti(allItems) {
      console.log("[scrapeShippingAddressOnMulti] Scraping shipping addresses on the multi-address selection page.");
      const rows = await waitForElement(".a-row.a-spacing-base.item-row", 6e3, true);
      if (!rows || rows.length === 0) {
        console.warn("[scrapeShippingAddressOnMulti] No item rows found.");
        return;
      }
      const addressesPageURL = "https://www.amazon.com/gp/buy/addressselect/handlers/display.html";
      const response = await fetch(addressesPageURL);
      const htmlText = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, "text/html");
      const addressElements = doc.querySelectorAll(".a-label > .break-word");
      const fullAddresses = Array.from(addressElements).map((el) => el.innerText.trim());
      console.log("[scrapeShippingAddressOnMulti] Full addresses extracted:", fullAddresses);
      const detailedAddressRegex = /^(.*?),\s*(.*?),\s*([A-Z]{2}),\s*(\d{5})(?:-\d{4})?,\s*(.*)$/;
      for (const row of rows) {
        const titleElement = row.querySelector("p.a-spacing-micro.a-size-base.a-text-bold");
        if (!titleElement) {
          console.warn("[scrapeShippingAddressOnMulti] No title element found in this row.");
          continue;
        }
        const title = titleElement.innerText.trim().substring(0, 35);
        const productObj = allItems[title];
        if (!productObj) {
          console.warn(`[scrapeShippingAddressOnMulti] Product "${title}" not found in allItems.`);
          continue;
        }
        if (!productObj.options) {
          productObj.options = [];
        }
        const addressElementsInRow = row.querySelectorAll(".lineitem-address .a-dropdown-prompt");
        const quantityElementsInRow = row.querySelectorAll(".quantity-dropdown .a-dropdown-prompt");
        if (addressElementsInRow.length === 0) {
          console.warn(`[scrapeShippingAddressOnMulti] No addresses found for "${title}".`);
          continue;
        }
        if (quantityElementsInRow.length === 0) {
          console.warn(`[scrapeShippingAddressOnMulti] No quantities found for "${title}". Defaulting them all to 1.`);
        }
        const pairs = [];
        const loopCount = Math.min(addressElementsInRow.length, quantityElementsInRow.length) || addressElementsInRow.length;
        for (let i = 0; i < loopCount; i++) {
          const addressEl = addressElementsInRow[i];
          const partialAddress = addressEl.innerText.trim();
          let qty = 1;
          if (quantityElementsInRow[i]) {
            const qtyText = quantityElementsInRow[i].innerText.trim();
            qty = parseInt(qtyText, 10) || 1;
          }
          pairs.push({ partialAddress, qty });
        }
        const totalQtyInThisRow = pairs.reduce((sum, p) => sum + p.qty, 0);
        if (productObj.options.length < totalQtyInThisRow) {
          const needed = totalQtyInThisRow - productObj.options.length;
          for (let i = 0; i < needed; i++) {
            productObj.options.push({
              checkbox_wrrapd: false,
              checkbox_flowers: false,
              checkbox_amazon_combine: false,
              selected_wrapping_option: "wrrapd",
              // Default wrapping option
              selected_flower_design: null,
              // Add this line
              shippingAddress: {}
            });
          }
          console.log(`[scrapeShippingAddressOnMulti] Added ${needed} sub-items for "${title}" to match totalQty=${totalQtyInThisRow}.`);
        } else if (productObj.options.length > totalQtyInThisRow) {
          const toRemove = productObj.options.length - totalQtyInThisRow;
          productObj.options.splice(totalQtyInThisRow, toRemove);
          console.log(`[scrapeShippingAddressOnMulti] Removed ${toRemove} sub-items for "${title}" to match totalQty=${totalQtyInThisRow}.`);
        }
        let subIndex = 0;
        for (const pair of pairs) {
          const { partialAddress, qty } = pair;
          const partialAddressWithoutName = partialAddress.replace(/^([^,]+),\s*/, "");
          const matchingFullAddress = fullAddresses.find(
            (fullAddr) => fullAddr.includes(partialAddressWithoutName)
          );
          const recipientName = partialAddress.split(",")[0];
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
        saveItemToLocalStorage(productObj);
        console.log(`[scrapeShippingAddressOnMulti] Completed addresses for "${title}".`);
      }
    }
    async function checkChangeAddress() {
      console.log("[checkChangeAddress] Checking if address change is required.");
      const allItems = getAllItemsFromLocalStorage();
      const wrrapdShouldChangeAddress = localStorage.getItem("wrrapd-should-change-address") === "true";
      const currentUrl = window.location.href;
      const isMultiAddressPage = currentUrl.includes("itemselect") && (currentUrl.includes("multiAddress") || currentUrl.includes("useCase=multiAddress") || currentUrl.includes("multi-address"));
      if (isMultiAddressPage) {
        console.log("[checkChangeAddress] Detected multi-address selection page. URL:", currentUrl);
        const addressJustAdded = localStorage.getItem("wrrapd-address-just-added") === "true";
        if (addressJustAdded) {
          console.log("[checkChangeAddress] Wrrapd address was just added - Amazon auto-selected it for all items. Using common function to fix addresses...");
          localStorage.removeItem("wrrapd-address-just-added");
          showLoadingScreen();
          localStorage.setItem("wrrapd-should-change-address", "true");
          await ensureCorrectAddressesForAllItems(allItems);
          return;
        }
        const identifierMapStr = localStorage.getItem("wrrapd-item-identifiers");
        if (!identifierMapStr) {
          console.log("[checkChangeAddress] No identifier mapping found - creating it and running address selection...");
          localStorage.removeItem("wrrapd-addresses-changed");
          localStorage.removeItem("wrrapd-multi-address-completed");
          localStorage.setItem("wrrapd-should-change-address", "true");
          showLoadingScreen();
          await ensureCorrectAddressesForAllItems(allItems);
          return;
        }
        const addressesChanged = localStorage.getItem("wrrapd-addresses-changed") === "true";
        const multiAddressCompleted = localStorage.getItem("wrrapd-multi-address-completed") === "true";
        if (addressesChanged || multiAddressCompleted) {
          console.log("[checkChangeAddress] Flags indicate addresses changed, but verifying they're actually correct...");
          localStorage.setItem("wrrapd-should-change-address", "true");
          showLoadingScreen();
          await ensureCorrectAddressesForAllItems(allItems);
          return;
        } else {
          console.log("[checkChangeAddress] Addresses not yet changed - running address selection...");
          localStorage.setItem("wrrapd-should-change-address", "true");
          showLoadingScreen();
          await ensureCorrectAddressesForAllItems(allItems);
          return;
        }
        if (wrrapdShouldChangeAddress) {
          const termsAccepted = localStorage.getItem("wrrapd-terms-accepted") === "true";
          if (!termsAccepted) {
            console.log("[checkChangeAddress] Flag set but Terms NOT accepted yet - NOT doing address manipulation. Waiting for Terms acceptance.");
            return;
          }
          if (currentUrl.includes("https://www.amazon.com/gp/buy/itemselect/handlers/display.html")) {
            console.log("[checkChangeAddress] Using old address change flow for wrrapd items.");
            showLoadingScreen();
            changeAddressForWrrapdItems(allItems);
            localStorage.setItem("wrrapd-should-change-address", "false");
          } else {
            console.log("[checkChangeAddress] Using new address selection flow for wrrapd items.");
            showLoadingScreen();
            multiSelectAddress(allItems);
            localStorage.setItem("wrrapd-should-change-address", "false");
          }
        } else {
          console.log("[checkChangeAddress] No address change flag set and addresses not changed yet. Waiting for Terms acceptance.");
        }
        return;
      }
      if (wrrapdShouldChangeAddress) {
        if (currentUrl.includes("amazon.com/gp/buy/payselect/handlers/display.html") || currentUrl.includes("amazon.com/gp/buy/spc/handlers/display.html") || currentUrl.includes("amazon.com/gp/buy/primeinterstitial/handlers/display.html")) {
          console.log("[checkChangeAddress] Showing loading screen before redirecting to address selection page.");
          showLoadingScreen();
          setTimeout(() => {
            console.log("[checkChangeAddress] Redirecting to address selection page.");
            window.location.href = "https://www.amazon.com/gp/buy/itemselect/handlers/display.html?_from=cheetah&useCase=multiAddress";
          }, 100);
        }
      } else {
        console.log("[checkChangeAddress] No address change needed and not on multi-address page.");
      }
    }
    async function changeAddressForWrrapdItems(allItems) {
      console.log("[changeAddressForWrrapdItems] Start updating Amazon's shipping addresses.");
      if (!window.location.href.includes("https://www.amazon.com/gp/buy/itemselect/handlers/display.html?_from=cheetah&useCase=multiAddress")) {
        console.error("[changeAddressForWrrapdItems] Not on the correct multi-address page. Exiting.");
        removeLoadingScreen();
        return;
      }
      showLoadingScreen();
      console.log("[changeAddressForWrrapdItems] Waiting for page to be fully ready...");
      await new Promise((r) => setTimeout(r, 500));
      let productsToChange = [];
      let mixedProducts = [];
      let processedProducts = /* @__PURE__ */ new Set();
      for (const [title, product] of Object.entries(allItems)) {
        if (!product.options) continue;
        const totalSubItems = product.options.length;
        const wrrapdSubItems = product.options.filter((s) => s.checkbox_wrrapd).length;
        if (wrrapdSubItems === totalSubItems) {
          productsToChange.push(title);
        } else if (wrrapdSubItems > 0) {
          mixedProducts.push(title);
        }
      }
      if (mixedProducts.length > 0) {
        const messageContainer = document.createElement("div");
        messageContainer.style.color = "#c40000";
        messageContainer.style.marginTop = "10px";
        messageContainer.style.padding = "10px";
        messageContainer.style.border = "1px solid #c40000";
        messageContainer.style.borderRadius = "4px";
        messageContainer.innerHTML = `Please manually select Wrrapd address for desired items.`;
        const targetElement = document.querySelector('.a-box-inner > [data-testid=""]:nth-child(1)');
        if (targetElement) {
          targetElement.parentNode.insertBefore(messageContainer, targetElement.nextSibling);
        }
        console.log("[changeAddressForWrrapdItems] Mixed products detected:", mixedProducts);
        removeLoadingScreen();
        return;
      }
      let itemsRemaining = productsToChange.length;
      console.log("[changeAddressForWrrapdItems] Products to process:", productsToChange);
      let firstItemProcessed = false;
      let justReloaded = false;
      while (itemsRemaining > 0) {
        console.log(`[changeAddressForWrrapdItems] Products remaining: ${itemsRemaining}. Checking DOM rows...`);
        let rows = await waitForElement(".a-row.a-spacing-base.item-row", 3e3, true);
        if (!rows || rows.length === 0) {
          console.log("[changeAddressForWrrapdItems] Standard selector didn't work, trying AI...");
          const pageContext = "This is Amazon's multi-address selection page. Find the container/row elements that represent each product item where users can select shipping addresses. Each row should contain a product title and address dropdown.";
          const aiSelector = await findElementWithFallback(
            "Product item row container on Amazon multi-address selection page",
            [
              ".a-row.a-spacing-base.item-row",
              "[data-orderid] .item-row",
              ".item-row",
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
        if (!rows || rows.length === 0) {
          console.log("[changeAddressForWrrapdItems] Trying to find rows by product titles...");
          const allRows = [];
          for (const titleKey of productsToChange) {
            const searchText = titleKey.substring(0, 25);
            console.log(`[changeAddressForWrrapdItems] Searching for title: "${searchText}"`);
            const allElements = Array.from(document.querySelectorAll("*"));
            for (const el of allElements) {
              const text = el.textContent?.trim() || "";
              if (text.length > 10 && text.includes(searchText)) {
                let row = el;
                let attempts = 0;
                while (row && attempts < 10) {
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
            console.log(
              `[changeAddressForWrrapdItems] No rows found by title matching. Available text on page:`,
              Array.from(document.querySelectorAll("p, h1, h2, h3, h4, span")).slice(0, 10).map((el) => el.textContent?.trim().substring(0, 50))
            );
          }
        }
        if (!rows || rows.length === 0) {
          console.warn("[changeAddressForWrrapdItems] No rows found after all attempts. Breaking.");
          console.log("[changeAddressForWrrapdItems] Page HTML sample:", document.body.innerHTML.substring(0, 1e3));
          removeLoadingScreen();
          break;
        }
        console.log(`[changeAddressForWrrapdItems] Found ${rows.length} rows`);
        let changedSomething = false;
        for (const row of rows) {
          const titleElem = row.querySelector("p.a-spacing-micro.a-size-base.a-text-bold");
          if (!titleElem) continue;
          const rowFullTitle = titleElem.innerText.trim();
          const rowTitleKey = rowFullTitle.substring(0, 35);
          if (processedProducts.has(rowTitleKey)) {
            console.log(`[changeAddressForWrrapdItems] Skipping "${rowTitleKey}" - already processed.`);
            continue;
          }
          if (productsToChange.includes(rowTitleKey)) {
            console.log(`[changeAddressForWrrapdItems] Setting Wrrapd address for "${rowTitleKey}".`);
            const success = await processAddressChange(row, rowTitleKey, 0);
            if (success) {
              itemsRemaining--;
              changedSomething = true;
              processedProducts.add(rowTitleKey);
              console.log(`[changeAddressForWrrapdItems] Successfully set address for "${rowTitleKey}".`);
              if (!firstItemProcessed && !justReloaded) {
                firstItemProcessed = true;
                const addressDropdown = row.querySelector(".lineitem-address .a-dropdown-container");
                if (addressDropdown) {
                  const dropdownText = addressDropdown.textContent;
                  if (!dropdownText.includes("Wrrapd.com")) {
                    console.log("[changeAddressForWrrapdItems] First item processed and new address created. Reloading page...");
                    await new Promise((r) => setTimeout(r, 1e3));
                    localStorage.setItem("wrrapd-address-created", "true");
                    window.location.reload();
                    return;
                  }
                }
              }
              await new Promise((r) => setTimeout(r, 1e3));
              break;
            } else {
              console.warn(`[changeAddressForWrrapdItems] Could not set Wrrapd address for "${rowTitleKey}". Will retry after delay...`);
              await new Promise((r) => setTimeout(r, 2e3));
            }
          }
        }
        if (!changedSomething) {
          console.log("[changeAddressForWrrapdItems] No changes this pass. Breaking out.");
          break;
        }
        await new Promise((r) => setTimeout(r, 2e3));
      }
      console.log("[changeAddressForWrrapdItems] Finished processing. Removing loading screen.");
      removeLoadingScreen();
      if (mixedProducts.length === 0) {
        const useTheseAddressesButton = await waitForElement("#orderSummaryPrimaryActionBtn .a-button-input", 3e3);
        if (useTheseAddressesButton) {
          console.log("[changeAddressForWrrapdItems] Clicking 'Use These Addresses' button.");
          useTheseAddressesButton.click();
        }
      }
    }
    async function processAddressChange(row, titleKey, subIndex) {
      try {
        console.log(`[processAddressChange] Starting address change for "${titleKey}"...`);
        let addressDropdownActivator = await findElementWithFallback(
          "Address dropdown button or activator for selecting shipping address on Amazon multi-address page",
          [".lineitem-address .a-dropdown-container .a-button-text", ".a-dropdown-container .a-button-text", '[class*="dropdown"] [class*="button"]'],
          "Amazon multi-address selection page with product rows, each row has an address dropdown",
          ["Send to", "Ship to"]
        );
        if (!addressDropdownActivator) {
          const rowDropdown = row.querySelector(".a-dropdown-container .a-button-text") || row.querySelector('[class*="dropdown"] [class*="button"]') || row.querySelector('button[aria-label*="address"]');
          if (rowDropdown) {
            console.log(`[processAddressChange] Found dropdown using fallback search within row.`);
            addressDropdownActivator = rowDropdown;
          } else {
            console.error(`[processAddressChange] "Send to" dropdown not found for "${titleKey}".`);
            return false;
          }
        }
        let attempts = 0;
        let dropdownOptions = null;
        let popover = null;
        while (attempts < 5) {
          console.log(`[processAddressChange] Attempt ${attempts + 1}: Clicking dropdown...`);
          const existingPopovers = document.querySelectorAll(".a-popover");
          if (existingPopovers.length > 0) {
            console.log(`[processAddressChange] Closing existing popovers...`);
            document.body.click();
            await new Promise((r) => setTimeout(r, 1e3));
          }
          addressDropdownActivator.click();
          await new Promise((r) => setTimeout(r, 1e3));
          popover = await waitForElement(".a-popover", 3e3);
          if (!popover) {
            console.log(`[processAddressChange] No popover appeared. Retrying...`);
            attempts++;
            continue;
          }
          dropdownOptions = await waitForElement(".a-popover ul.a-list-link li a", 3e3, true);
          if ((!dropdownOptions || dropdownOptions.length === 0) && popover) {
            const showMoreLink = await findElementWithFallback(
              "Show more addresses link in address dropdown popover",
              ['a:contains("Show more")', 'button:contains("Show more")', '.a-link-normal:contains("Show more")'],
              "Address dropdown popover with list of addresses",
              ["Show more addresses", "Show more", "See more addresses"]
            );
            if (showMoreLink) {
              console.log(`[processAddressChange] Found "Show more addresses" link. Clicking to expand...`);
              showMoreLink.click();
              await new Promise((r) => setTimeout(r, 2e3));
              dropdownOptions = await waitForElement(".a-popover ul.a-list-link li a", 3e3, true);
            }
          }
          if (dropdownOptions && dropdownOptions.length > 0) {
            let foundAddressOption = false;
            for (const option of dropdownOptions) {
              const text = option.textContent.trim();
              if (text.includes("JACKSONVILLE") || text.includes("Ship to a new address") || text.includes("Wrrapd.com")) {
                foundAddressOption = true;
                break;
              }
            }
            if (foundAddressOption) {
              console.log(`[processAddressChange] Found address dropdown with ${dropdownOptions.length} options.`);
              break;
            } else {
              console.log(`[processAddressChange] Wrong dropdown content. Closing and retrying...`);
              document.body.click();
              await new Promise((r) => setTimeout(r, 2e3));
            }
          } else {
            console.log(`[processAddressChange] No options found in dropdown. Retrying...`);
          }
          attempts++;
          await new Promise((r) => setTimeout(r, 2e3));
        }
        if (!dropdownOptions || dropdownOptions.length === 0) {
          console.warn(`[processAddressChange] No address options found for "${titleKey}" after ${attempts} attempts.`);
          return false;
        }
        let newAddrLink = null;
        let wrrapdLink = null;
        console.log(`[processAddressChange] Searching for Wrrapd address in ${dropdownOptions.length} options...`);
        for (const option of dropdownOptions) {
          const optionText = option.textContent.trim();
          console.log(`[processAddressChange] Checking option: "${optionText}"`);
          if (optionText.includes("Wrrapd.com") && optionText.includes("PO BOX 26067")) {
            wrrapdLink = option;
            console.log(`[processAddressChange] Found Wrrapd address option.`);
          }
          if (optionText.includes("Ship to a new address")) {
            newAddrLink = option;
          }
        }
        if (wrrapdLink) {
          console.log(`[processAddressChange] Clicking Wrrapd address option for "${titleKey}"...`);
          wrrapdLink.click();
          await new Promise((r) => setTimeout(r, 5e3));
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
          console.log(`[processAddressChange] No Wrrapd address found. Creating new address for "${titleKey}"...`);
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
    async function fillWrrapdAddressInModal() {
      console.log("[fillWrrapdAddressInModal] Filling Wrrapd address in Amazon form...");
      try {
        await new Promise((r) => setTimeout(r, 2e3));
        const nameField = await waitForElement("input#address-ui-widgets-enterAddressFullName", 5e3);
        const phoneField = await waitForElement("input#address-ui-widgets-enterAddressPhoneNumber", 5e3);
        const addressLine1Field = await waitForElement("input#address-ui-widgets-enterAddressLine1", 5e3);
        const cityField = await waitForElement("input#address-ui-widgets-enterAddressCity", 5e3);
        const postalCodeField = await waitForElement("input#address-ui-widgets-enterAddressPostalCode", 5e3);
        if (!nameField || !phoneField || !addressLine1Field || !cityField || !postalCodeField) {
          console.error("[fillWrrapdAddressInModal] Missing fields to add address.");
          return false;
        }
        nameField.value = "Wrrapd";
        await new Promise((r) => setTimeout(r, 500));
        phoneField.value = "(904) 515-2034";
        await new Promise((r) => setTimeout(r, 500));
        addressLine1Field.value = "PO BOX 26067";
        await new Promise((r) => setTimeout(r, 500));
        cityField.value = "Jacksonville";
        await new Promise((r) => setTimeout(r, 500));
        postalCodeField.value = "32226-6067";
        await new Promise((r) => setTimeout(r, 500));
        const successState = await selectStateFlorida();
        if (!successState) {
          console.error("[fillWrrapdAddressInModal] Could not select Florida state.");
          return false;
        }
        await new Promise((r) => setTimeout(r, 2e3));
        let saveButton = await waitForElement("#address-ui-widgets-form-submit-button .a-button-input", 3e3);
        if (!saveButton) {
          const allButtons = document.querySelectorAll('button, .a-button-input, [type="submit"]');
          for (const btn of allButtons) {
            const btnText = (btn.textContent || btn.innerText || "").trim().toLowerCase();
            if (btnText.includes("use this address") || btnText.includes("save address")) {
              console.log(`[fillWrrapdAddressInModal] Found button with text: "${btn.textContent?.trim()}"`);
              saveButton = btn;
              break;
            }
          }
        }
        if (!saveButton) {
          saveButton = document.querySelector('#address-ui-widgets-form-submit-button .a-button-input, #address-ui-widgets-form-submit-button button, button[type="submit"]');
        }
        if (!saveButton) {
          console.error("[fillWrrapdAddressInModal] Could not find 'Use this address' or 'Save Address' button.");
          return false;
        }
        saveButton.click();
        console.log("[fillWrrapdAddressInModal] 'Use this address' / 'Save Address' clicked. Waiting for address to be saved...");
        await new Promise((r) => setTimeout(r, 8e3));
        console.log("[fillWrrapdAddressInModal] \u2713 Wrrapd address added successfully!");
        return true;
      } catch (error) {
        console.error(`[fillWrrapdAddressInModal] Error: ${error.message}`, error);
        return false;
      }
    }
    async function addWrrapdAddress(titleKey, subIndex) {
      console.log(`[addWrrapdAddress] Creating Wrrapd address for subItem #${subIndex} of "${titleKey}".`);
      try {
        await new Promise((r) => setTimeout(r, 2e3));
        const nameField = await waitForElement("input#address-ui-widgets-enterAddressFullName", 5e3);
        const phoneField = await waitForElement("input#address-ui-widgets-enterAddressPhoneNumber", 5e3);
        const addressLine1Field = await waitForElement("input#address-ui-widgets-enterAddressLine1", 5e3);
        const cityField = await waitForElement("input#address-ui-widgets-enterAddressCity", 5e3);
        const postalCodeField = await waitForElement("input#address-ui-widgets-enterAddressPostalCode", 5e3);
        if (!nameField || !phoneField || !addressLine1Field || !cityField || !postalCodeField) {
          console.error("[addWrrapdAddress] Missing fields to add address.");
          return false;
        }
        nameField.value = "Wrrapd";
        await new Promise((r) => setTimeout(r, 500));
        phoneField.value = "(904) 515-2034";
        await new Promise((r) => setTimeout(r, 500));
        addressLine1Field.value = "PO BOX 26067";
        await new Promise((r) => setTimeout(r, 500));
        cityField.value = "Jacksonville";
        await new Promise((r) => setTimeout(r, 500));
        postalCodeField.value = "32226-6067";
        await new Promise((r) => setTimeout(r, 500));
        const successState = await selectStateFlorida();
        if (!successState) {
          console.error("[addWrrapdAddress] Could not select Florida state.");
          return false;
        }
        await new Promise((r) => setTimeout(r, 2e3));
        const saveButton = await waitForElement("#address-ui-widgets-form-submit-button .a-button-input", 5e3);
        if (!saveButton) {
          console.error("[addWrrapdAddress] Could not find 'Save Address' button.");
          return false;
        }
        saveButton.click();
        console.log("[addWrrapdAddress] 'Save Address' clicked. Waiting for address to be saved...");
        await new Promise((r) => setTimeout(r, 2e3));
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
    function buildWrrapdAddress() {
      return {
        name: "Wrrapd",
        street: "PO BOX 26067",
        city: "Jacksonville",
        state: "FL",
        postalCode: "32226-6067",
        // EXACT format as specified
        country: "United States",
        phone: "(904) 515-2034"
        // EXACT phone number
      };
    }
    async function handleWrrapdAddressSelection() {
      if (isHandlingWrrapdAddressSelection) {
        console.warn("[handleWrrapdAddressSelection] Already handling address selection - preventing duplicate call!");
        return;
      }
      const termsAccepted = localStorage.getItem("wrrapd-terms-accepted") === "true";
      if (!termsAccepted) {
        console.log("[handleWrrapdAddressSelection] Terms not yet accepted - NOT proceeding with address manipulation.");
        console.log("[handleWrrapdAddressSelection] Address manipulation will only trigger after Terms & Conditions are accepted.");
        return;
      }
      isHandlingWrrapdAddressSelection = true;
      try {
        const allItems = getAllItemsFromLocalStorage();
        const allItemsWrrapd = localStorage.getItem("wrrapd-all-items") === "true";
        showLoadingScreen();
        await new Promise((r) => setTimeout(r, 1500));
        const expandIcon = document.querySelector("i.a-icon.a-icon-expand");
        const expandLink = Array.from(document.querySelectorAll("*")).find((el) => el.textContent?.trim() === "Show more addresses");
        if (expandIcon) {
          const expanderLink = expandIcon.closest("a") || expandIcon.parentElement;
          if (expanderLink) {
            const href = expanderLink.href || expanderLink.getAttribute("href") || "";
            if (href && href.startsWith("javascript:")) {
              expanderLink.setAttribute("aria-expanded", "true");
              const collapsedContent = document.querySelector(".a-expander-collapsed-content");
              if (collapsedContent) {
                collapsedContent.style.display = "";
                collapsedContent.setAttribute("aria-hidden", "false");
              }
            } else {
              expanderLink.setAttribute("aria-expanded", "true");
              const collapsedContent = document.querySelector(".a-expander-collapsed-content");
              if (collapsedContent) {
                collapsedContent.style.display = "";
                collapsedContent.setAttribute("aria-hidden", "false");
              }
              expanderLink.click();
            }
            await new Promise((r) => setTimeout(r, 2e3));
          }
        } else if (expandLink) {
          const href = expandLink.href || expandLink.getAttribute("href") || "";
          if (href && href.startsWith("javascript:")) {
            expandLink.setAttribute("aria-expanded", "true");
            const collapsedContent = document.querySelector(".a-expander-collapsed-content");
            if (collapsedContent) {
              collapsedContent.style.display = "";
              collapsedContent.setAttribute("aria-hidden", "false");
            }
          } else {
            expandLink.setAttribute("aria-expanded", "true");
            const collapsedContent = document.querySelector(".a-expander-collapsed-content");
            if (collapsedContent) {
              collapsedContent.style.display = "";
              collapsedContent.setAttribute("aria-hidden", "false");
            }
            expandLink.click();
          }
          await new Promise((r) => setTimeout(r, 2e3));
        }
        let wrrapdAddressFound = false;
        let wrrapdAddressRadio = null;
        const allRadios = Array.from(document.querySelectorAll('input[type="radio"]'));
        for (let i = 0; i < allRadios.length; i++) {
          const radio = allRadios[i];
          let addressContainer = radio.closest('.a-box, .a-box-inner, [class*="address"], label, [class*="radio"], [data-testid*="address"], .a-radio') || radio.parentElement;
          const addressText = addressContainer ? addressContainer.textContent?.trim() || "" : "";
          const hasWrrapd = addressText.includes("Wrrapd") || addressText.includes("Wrrapd.com");
          const hasPOBox = addressText.includes("PO BOX 26067") || addressText.includes("PO Box 26067");
          const hasJacksonville = addressText.includes("JACKSONVILLE") || addressText.includes("Jacksonville");
          const hasZip = addressText.includes("32218") || addressText.includes("32226");
          const hasState = addressText.includes("FL") || addressText.includes("Florida");
          if ((hasWrrapd || hasPOBox) && hasJacksonville && hasZip && hasState) {
            wrrapdAddressFound = true;
            wrrapdAddressRadio = radio;
            break;
          }
        }
        if (wrrapdAddressFound && wrrapdAddressRadio) {
          await ensureCorrectAddressesForAllItems(allItems);
          if (allItemsWrrapd) {
            wrrapdAddressRadio.checked = true;
            wrrapdAddressRadio.dispatchEvent(new Event("change", { bubbles: true }));
            wrrapdAddressRadio.click();
            await new Promise((r) => setTimeout(r, 1e3));
            const deliverButton = await findElementWithFallback(
              "Deliver to this address button on Amazon address selection page",
              ['button:contains("Deliver to this address")', 'input[value*="Deliver to this address"]', 'a:contains("Deliver to this address")', 'button[type="submit"]', ".a-button-primary input"],
              "Amazon address selection page with a selected address and a button to proceed with delivery to that address",
              ["Deliver to this address", "Use this address", "Continue with this address", "Continue"]
            );
            if (deliverButton) {
              deliverButton.click();
              removeLoadingScreen();
              return;
            } else {
              console.error("[handleWrrapdAddressSelection] Could not find 'Deliver to this address' button.");
              removeLoadingScreen();
              return;
            }
          } else {
            console.log("[handleWrrapdAddressSelection] Mixed items with Wrrapd address present - using common function...");
            const result = await ensureCorrectAddressesForAllItems(allItems);
            if (result) {
              return;
            }
            let multiAddressLink = null;
            const allLinks = Array.from(document.querySelectorAll("a, button"));
            for (const link of allLinks) {
              const text = link.textContent?.trim() || "";
              if (text.includes("multiple addresses") || text.includes("Deliver to multiple") || text.includes("Ship to multiple")) {
                multiAddressLink = link;
                break;
              }
            }
            if (!multiAddressLink) {
              multiAddressLink = await findElementWithFallback(
                "Deliver to multiple addresses link or button on Amazon address selection page",
                ['a[href*="multiple"]', 'a[href*="multi"]', 'button[aria-label*="multiple"]'],
                "Amazon address selection page with address options displayed and a link to deliver items to multiple addresses",
                ["Deliver to multiple addresses", "multiple addresses", "Ship to multiple addresses", "Deliver to multiple", "multiple address"]
              );
            }
            if (multiAddressLink) {
              let linkURL = multiAddressLink.href || multiAddressLink.getAttribute("data-href");
              if (linkURL && linkURL !== "#" && !linkURL.includes("javascript:") && linkURL.startsWith("http")) {
                window.location.href = linkURL;
              } else {
                multiAddressLink.click();
              }
              removeLoadingScreen();
              return;
            } else {
              console.error("[handleWrrapdAddressSelection] Could not find 'Deliver to multiple addresses' link.");
              removeLoadingScreen();
              return;
            }
          }
        } else {
          const addNewAddressLink = await findElementWithFallback(
            "Add a new delivery address link or button on Amazon address selection page",
            ['a:contains("Add a new")', 'button:contains("Add a new")'],
            "Amazon address selection page with list of addresses",
            ["Add a new delivery address", "Add a new address", "Add new address"]
          );
          if (!addNewAddressLink) {
            console.error("[handleWrrapdAddressSelection] Could not find 'Add a new delivery address' link.");
            console.error("[handleWrrapdAddressSelection] This link ONLY exists on the single address selection page (when clicking 'Change' address).");
            removeLoadingScreen();
            return;
          }
          console.log("[handleWrrapdAddressSelection] Adding Wrrapd address on single address selection page (before navigating to multi-address if needed)...");
          addNewAddressLink.click();
          await new Promise((r) => setTimeout(r, 2e3));
          const success = await addWrrapdAddressSinglePage();
          if (!success) {
            console.error("[handleWrrapdAddressSelection] Failed to add Wrrapd address.");
            removeLoadingScreen();
            return;
          }
          localStorage.setItem("wrrapd-address-just-added", "true");
          console.log("[handleWrrapdAddressSelection] Wrrapd address just added - flag set. Will fix non-Wrrapd items on multi-address page.");
          const itemIdentifierMap = {};
          let wrrapdCounter = 1;
          let nonWrrapdCounter = 1;
          for (const [productKey, productObj] of Object.entries(allItems)) {
            if (!productObj || !productObj.asin || !productObj.options) continue;
            const totalOptions = productObj.options.length;
            const wrrapdOptions = productObj.options.filter((opt) => opt.checkbox_wrrapd === true).length;
            const allOptionsNeedWrrapd = totalOptions > 0 && wrrapdOptions === totalOptions;
            const productNameShort = productKey.substring(0, 30).replace(/[^a-zA-Z0-9]/g, "_");
            const identifier = allOptionsNeedWrrapd ? `WRRAPD_${productNameShort}_${wrrapdCounter++}` : `DEFAULT_${productNameShort}_${nonWrrapdCounter++}`;
            itemIdentifierMap[productObj.asin] = {
              identifier,
              needsWrrapd: allOptionsNeedWrrapd,
              productKey
            };
          }
          localStorage.setItem("wrrapd-item-identifiers", JSON.stringify(itemIdentifierMap));
          console.log("[handleWrrapdAddressSelection] Created item identifier mapping:", itemIdentifierMap);
          if (!allItemsWrrapd) {
            console.log("[handleWrrapdAddressSelection] Mixed items detected - navigating directly to multi-address page (Amazon will have Wrrapd address selected for all items, we'll fix non-Wrrapd items there)...");
            await new Promise((r) => setTimeout(r, 2e3));
            let multiAddressLink = null;
            const allLinks = Array.from(document.querySelectorAll("a, button"));
            for (const link of allLinks) {
              const text = link.textContent?.trim() || "";
              if (text.includes("multiple addresses") || text.includes("Deliver to multiple") || text.includes("Ship to multiple")) {
                multiAddressLink = link;
                break;
              }
            }
            if (!multiAddressLink) {
              multiAddressLink = await findElementWithFallback(
                "Deliver to multiple addresses link or button on Amazon address selection page",
                ['a[href*="multiple"]', 'a[href*="multi"]', 'button[aria-label*="multiple"]'],
                "Amazon address selection page with address options displayed and a link to deliver items to multiple addresses",
                ["Deliver to multiple addresses", "multiple addresses", "Ship to multiple addresses", "Deliver to multiple", "multiple address"]
              );
            }
            if (!multiAddressLink) {
              console.log("[handleWrrapdAddressSelection] Link not found - attempting to construct multi-address URL manually...");
              const currentURL = window.location.href;
              const purchaseIdMatch = currentURL.match(/\/p\/([^\/]+)/);
              const purchaseId = purchaseIdMatch ? purchaseIdMatch[1] : null;
              if (purchaseId) {
                const multiAddressURL = `https://www.amazon.com/checkout/p/${purchaseId}/itemselect?pipelineType=Chewbacca&useCase=multiAddress`;
                console.log("[handleWrrapdAddressSelection] Constructed multi-address URL:", multiAddressURL);
                window.location.href = multiAddressURL;
                return;
              }
            }
            if (multiAddressLink) {
              let linkURL = multiAddressLink.href || multiAddressLink.getAttribute("data-href");
              if (linkURL && linkURL !== "#" && !linkURL.includes("javascript:") && linkURL.startsWith("http")) {
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
          await new Promise((r) => setTimeout(r, 3e3));
          const updatedRadios = Array.from(document.querySelectorAll('input[type="radio"]'));
          let newWrrapdRadio = null;
          for (let i = 0; i < updatedRadios.length; i++) {
            const radio = updatedRadios[i];
            const addressContainer = radio.closest('.a-box, .a-box-inner, [class*="address"], label') || radio.parentElement;
            const addressText = addressContainer ? addressContainer.textContent?.trim() || "" : "";
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
          if (allItemsWrrapd) {
            if (newWrrapdRadio) {
              newWrrapdRadio.checked = true;
              newWrrapdRadio.dispatchEvent(new Event("change", { bubbles: true }));
              newWrrapdRadio.click();
              await new Promise((r) => setTimeout(r, 1e3));
              const deliverButton = await findElementWithFallback(
                "Deliver to this address button on Amazon address selection page",
                ['button:contains("Deliver to this address")', 'input[value*="Deliver to this address"]', 'a:contains("Deliver to this address")', 'button[type="submit"]', ".a-button-primary input"],
                "Amazon address selection page with a selected address and a button to proceed with delivery to that address",
                ["Deliver to this address", "Use this address", "Continue with this address", "Continue"]
              );
              if (deliverButton) {
                deliverButton.click();
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
        isHandlingWrrapdAddressSelection = false;
      }
    }
    let isAddingWrrapdAddress = false;
    let isHandlingWrrapdAddressSelection = false;
    async function addWrrapdAddressSinglePage() {
      if (isAddingWrrapdAddress) {
        console.warn("[addWrrapdAddressSinglePage] Already adding Wrrapd address - preventing duplicate!");
        return false;
      }
      isAddingWrrapdAddress = true;
      try {
        await new Promise((r) => setTimeout(r, 2e3));
        const nameField = await waitForElement("input#address-ui-widgets-enterAddressFullName", 5e3);
        const phoneField = await waitForElement("input#address-ui-widgets-enterAddressPhoneNumber", 5e3);
        const addressLine1Field = await waitForElement("input#address-ui-widgets-enterAddressLine1", 5e3);
        const cityField = await waitForElement("input#address-ui-widgets-enterAddressCity", 5e3);
        const postalCodeField = await waitForElement("input#address-ui-widgets-enterAddressPostalCode", 5e3);
        if (!nameField || !phoneField || !addressLine1Field || !cityField || !postalCodeField) {
          console.error("[addWrrapdAddressSinglePage] Missing fields to add address.");
          return false;
        }
        const triggerInputEvent = (field, value) => {
          field.value = value;
          field.dispatchEvent(new Event("input", { bubbles: true }));
          field.dispatchEvent(new Event("change", { bubbles: true }));
        };
        triggerInputEvent(nameField, "Wrrapd");
        await new Promise((r) => setTimeout(r, 500));
        triggerInputEvent(phoneField, "(904) 515-2034");
        await new Promise((r) => setTimeout(r, 500));
        triggerInputEvent(addressLine1Field, "PO BOX 26067");
        await new Promise((r) => setTimeout(r, 500));
        triggerInputEvent(cityField, "Jacksonville");
        await new Promise((r) => setTimeout(r, 500));
        triggerInputEvent(postalCodeField, "32226-6067");
        await new Promise((r) => setTimeout(r, 500));
        const successState = await selectStateFlorida();
        if (!successState) {
          console.error("[addWrrapdAddressSinglePage] Could not select Florida state.");
          return false;
        }
        await new Promise((r) => setTimeout(r, 3e3));
        let useAddressButton = document.querySelector('input[data-testid="bottom-continue-button"][type="submit"]') || document.querySelector('#checkout-primary-continue-button-id input[type="submit"]') || document.querySelector('input[aria-labelledby="checkout-primary-continue-button-id-announce"][type="submit"]');
        if (!useAddressButton) {
          console.error("[addWrrapdAddressSinglePage] Could not find 'Use this address' button.");
          return false;
        }
        const buttonName = useAddressButton.name || "";
        if (buttonName && buttonName.includes("error")) {
          console.error("[addWrrapdAddressSinglePage] Found error button instead of submit button.");
          return false;
        }
        let waitCount = 0;
        const maxWait = 20;
        while ((useAddressButton.disabled || useAddressButton.getAttribute("aria-disabled") === "true") && waitCount < maxWait) {
          await new Promise((r) => setTimeout(r, 500));
          waitCount++;
          const currentButton = document.querySelector(`[data-testid="${useAddressButton.getAttribute("data-testid")}"]`) || useAddressButton;
          if (currentButton && !currentButton.disabled && currentButton.getAttribute("aria-disabled") !== "true") {
            useAddressButton = currentButton;
            break;
          }
        }
        if (useAddressButton.disabled || useAddressButton.getAttribute("aria-disabled") === "true") {
          console.error("[addWrrapdAddressSinglePage] Button is still disabled after waiting. Cannot click.");
          return false;
        }
        useAddressButton.scrollIntoView({ behavior: "auto", block: "center" });
        await new Promise((r) => setTimeout(r, 500));
        useAddressButton.click();
        await new Promise((r) => setTimeout(r, 3e3));
        const modalStillVisible = document.querySelector('#address-ui-widgets-form-submit-button, [data-testid="secondary-continue-button"]');
        if (modalStillVisible) {
          await new Promise((r) => setTimeout(r, 3e3));
        }
        isAddingWrrapdAddress = false;
        return true;
      } catch (error) {
        console.error(`[addWrrapdAddressSinglePage] Error: ${error.message}`);
        isAddingWrrapdAddress = false;
        return false;
      }
    }
    function isSubItemWrrapdOnAmazon(subItem) {
      if (!subItem.amazonShippingAddress) return false;
      const a = subItem.amazonShippingAddress;
      return a.name === "Wrrapd.com" && a.street.includes("PO BOX 26067");
    }
    async function selectStateFlorida() {
      console.log("[selectStateFlorida] Attempting to select 'Florida' as the state.");
      try {
        const stateButton = await waitForElement("#address-ui-widgets-enterAddressStateOrRegion .a-button-text", 5e3);
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!stateButton) {
          console.error("[selectStateFlorida] State dropdown not found.");
          return false;
        }
        stateButton.click();
        console.log("[selectStateFlorida] State dropdown clicked. Waiting for options.");
        await new Promise((resolve) => setTimeout(resolve, 1e3));
        const stateOptions = document.querySelectorAll(".a-popover.a-dropdown ul.a-nostyle.a-list-link li a");
        if (stateOptions && stateOptions.length > 0) {
          console.log(`[selectStateFlorida] Found ${stateOptions.length} state options.`);
          for (const option of stateOptions) {
            if (option.innerText.includes("Florida")) {
              console.log("[selectStateFlorida] Found 'Florida' in the options. Selecting it.");
              option.click();
              await new Promise((resolve) => setTimeout(resolve, 1e3));
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
    function showTermsAndConditionsModal(onProceedCallback) {
      console.log("[showTermsAndConditionsModal] Showing Terms & Conditions modal");
      const existingModal = document.getElementById("wrrapd-terms-modal");
      if (existingModal) {
        console.log("[showTermsAndConditionsModal] Modal already exists");
        return;
      }
      const modal = document.createElement("div");
      modal.id = "wrrapd-terms-modal";
      modal.className = "wrrapd-modal";
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
      const content = document.createElement("div");
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
      const closeButton = document.createElement("button");
      closeButton.innerHTML = "&times;";
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
      closeButton.addEventListener("click", () => {
        console.log("[showTermsAndConditionsModal] Close button clicked");
        modal.remove();
      });
      content.appendChild(closeButton);
      const scrollableContent = document.createElement("div");
      scrollableContent.style.cssText = `
            padding: 40px 35px;
            overflow-y: auto;
            flex: 1;
            font-family: 'Georgia', 'Times New Roman', serif;
            line-height: 1.8;
            color: #2c3e50;
        `;
      scrollableContent.innerHTML = `
            <h1 style="margin-top: 0; margin-bottom: 30px; color: #2c3e50; font-size: 28px; text-align: center; font-weight: 600; letter-spacing: 0.5px;">Wrrapd Terms & Conditions</h1>
            <div style="font-size: 15px; line-height: 1.9;">
                <p style="margin-bottom: 16px;"><strong>1.</strong> These Terms & Conditions apply only to the gift-wrapping and related fulfillment services provided by Wrrapd Inc. ("Wrrapd," "we," "us," or "our"). Your purchase of the underlying items is governed solely by Amazon's Terms & Conditions.</p>
                <p style="margin-bottom: 16px;"><strong>2.</strong> You must be at least 18 years old or the age of majority in your jurisdiction to use the gift-wrapping service.</p>
                <p style="margin-bottom: 16px;"><strong>3.</strong> Your use of the service is subject to Wrrapd's Privacy Policy at <a href="https://www.wrrapd.com/privacy" target="_blank" style="color: #0066c0; text-decoration: none;">https://www.wrrapd.com/privacy</a>.</p>
                <p style="margin-bottom: 16px;"><strong>4.</strong> You acknowledge that Wrrapd's gift-wrapping services provide professional exterior gift-wrapping only and may include personalized options (e.g., messages, custom or AI-generated designs, gift tags, or cards).</p>
                <p style="margin-bottom: 16px;"><strong>5.</strong> You acknowledge that the Wrrapd service fee and any applicable taxes are clearly displayed at the time of selection, and by completing the order you accept and agree to pay these amounts.</p>
                <p style="margin-bottom: 16px;"><strong>6.</strong> You acknowledge and agree that selecting the Wrrapd gift-wrapping option may add one extra day to Amazon's estimated or promised delivery date. While Wrrapd will make reasonable efforts to meet Amazon's delivery timeline, an additional day is often required due to the wrapping process\u2014particularly if the item is received by Wrrapd's facilities after 2:00 p.m. local time or due to other operational factors.</p>
                <p style="margin-bottom: 16px;"><strong>7.</strong> You agree to not hold Wrrapd responsible for any delays resulting from late delivery of items from Amazon or its sellers to Wrrapd's facilities.</p>
                <p style="margin-bottom: 16px;"><strong>8.</strong> Wrrapd does not inspect, open, or handle the contents of Amazon-purchased items prior to wrapping. Wrrapd is not responsible for any damage to the underlying product, defects, missing parts, incorrect items, or any other issues with the product itself, regardless of when such issues occur. You agree to indemnify, defend, and hold harmless Wrrapd Inc., its affiliates, officers, directors, employees, and agents from any claims, liabilities, damages, losses, costs, or expenses (including reasonable attorneys' fees) arising from or related to the condition, quality, or contents of the underlying product, your use of the service, your violation of these Terms & Conditions, or your orders on Amazon.</p>
                <p style="margin-bottom: 16px;"><strong>9.</strong> All issues relating to the condition, quality, or contents of the product must be addressed directly with Amazon or the seller according to Amazon's policies.</p>
                <p style="margin-bottom: 16px;"><strong>10.</strong> Gift-wrapping fees are non-refundable except in these limited cases: (a) damage to the gift-wrapping itself (not the underlying product) during transit; or (b) failure to deliver the wrapped item within the estimated delivery window (excluding delays caused by Amazon, carriers, or events beyond our control). In these cases, Wrrapd may, at its sole discretion, refund the gift-wrapping fee or provide a replacement service. Contact info@wrrapd.com within 14 days of delivery with evidence (e.g., photos).</p>
                <p style="margin-bottom: 16px;"><strong>11.</strong> You agree not to provide false or misleading order information or use the service for fraudulent or illegal purposes.</p>
                <p style="margin-bottom: 16px;"><strong>12.</strong> The service is provided "AS IS" without warranties of any kind. Wrrapd is not liable for indirect, incidental, consequential, or punitive damages.</p>
                <p style="margin-bottom: 16px;"><strong>13.</strong> Any disputes arising from these Terms & Conditions or the service will be resolved through binding individual arbitration administered by the American Arbitration Association. You waive the right to a jury trial or to participate in class actions, to the fullest extent permitted by law. These Terms & Conditions are governed by the laws of the State of Florida, USA.</p>
            </div>
        `;
      content.appendChild(scrollableContent);
      const agreementContainer = document.createElement("div");
      agreementContainer.style.cssText = `
            padding: 25px 35px;
            border-top: 2px solid #ddd;
            text-align: center;
            font-size: 16px;
            font-family: 'Georgia', 'Times New Roman', serif;
        `;
      const agreementText = document.createElement("div");
      agreementText.innerHTML = `By clicking <span id="wrrapd-agree-link" style="color: #999; cursor: not-allowed; text-decoration: underline;">here</span>, I agree with Wrrapd's Terms & Conditions provided above.`;
      const agreeLink = agreementText.querySelector("#wrrapd-agree-link");
      let linkEnabled = false;
      const checkScrollPosition = () => {
        const scrollTop = scrollableContent.scrollTop;
        const scrollHeight = scrollableContent.scrollHeight;
        const clientHeight = scrollableContent.clientHeight;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5;
        if (isAtBottom && !linkEnabled) {
          linkEnabled = true;
          agreeLink.style.color = "#0066c0";
          agreeLink.style.cursor = "pointer";
          agreeLink.style.textDecoration = "underline";
          console.log("[showTermsAndConditionsModal] User scrolled to bottom - link enabled");
        } else if (!isAtBottom && linkEnabled) {
          linkEnabled = false;
          agreeLink.style.color = "#999";
          agreeLink.style.cursor = "not-allowed";
          agreeLink.style.textDecoration = "underline";
          console.log("[showTermsAndConditionsModal] User scrolled up - link disabled");
        }
      };
      scrollableContent.addEventListener("scroll", checkScrollPosition);
      setTimeout(() => {
        checkScrollPosition();
      }, 100);
      agreeLink.addEventListener("click", function(e) {
        if (!linkEnabled) {
          e.preventDefault();
          console.log("[showTermsAndConditionsModal] Link clicked but not enabled - user must scroll to bottom");
          return false;
        }
        console.log("[showTermsAndConditionsModal] User clicked agreement link");
        localStorage.setItem("wrrapd-terms-accepted", "true");
        showLoadingScreen();
        modal.remove();
        if (onProceedCallback) {
          onProceedCallback();
        }
      });
      agreementContainer.appendChild(agreementText);
      content.appendChild(agreementContainer);
      modal.appendChild(content);
      modal.addEventListener("click", function(e) {
        if (e.target === modal) {
          console.log("[showTermsAndConditionsModal] Clicked outside modal - closing");
          modal.remove();
        }
      });
      document.body.appendChild(modal);
    }
    function hideLoadingScreen() {
      const loadingScreen = document.getElementById("loadingScreen");
      if (loadingScreen) {
        console.log("[hideLoadingScreen] Hiding loading screen temporarily...");
        loadingScreen.style.display = "none";
      }
    }
    function showLoadingScreen(message = "Items selected for gift-wrapping by Wrrapd shall be re-routed to Wrrapd and then delivered to you!<br>In some cases, it may take an extra day for delivery.") {
      const allItems = getAllItemsFromLocalStorage();
      const hasWrrapdItems = Object.values(allItems).some(
        (item) => item.options && item.options.some((subItem) => subItem.checkbox_wrrapd === true)
      );
      if (!hasWrrapdItems) {
        console.log("[showLoadingScreen] No Wrrapd items found - NOT showing loading screen");
        return;
      }
      const existingScreen = document.getElementById("loadingScreen");
      if (existingScreen) {
        existingScreen.style.display = "flex";
        existingScreen.style.zIndex = "999999";
        existingScreen.style.position = "fixed";
        existingScreen.style.top = "0";
        existingScreen.style.left = "0";
        existingScreen.style.width = "100%";
        existingScreen.style.height = "100%";
        return;
      }
      const loadingScreen = document.createElement("div");
      loadingScreen.id = "loadingScreen";
      loadingScreen.style.position = "fixed";
      loadingScreen.style.top = "0";
      loadingScreen.style.left = "0";
      loadingScreen.style.width = "100%";
      loadingScreen.style.height = "100%";
      loadingScreen.style.backgroundColor = "black";
      loadingScreen.style.zIndex = "999999";
      loadingScreen.style.display = "flex";
      loadingScreen.style.flexDirection = "column";
      loadingScreen.style.alignItems = "center";
      loadingScreen.style.justifyContent = "center";
      loadingScreen.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: white;">
                <div style="
                    width: 50px;
                    height: 50px;
                    border: 5px solid rgba(255, 255, 255, 0.3);
                    border-top: 5px solid white;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 20px;">
                </div>
                <p style="font-size: 18px; font-weight: bold; margin: 0;">${message}</p>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;
      document.body.appendChild(loadingScreen);
    }
    function removeLoadingScreen() {
      const loadingScreen = document.getElementById("loadingScreen");
      if (loadingScreen) {
        loadingScreen.remove();
      } else {
        console.warn("[removeLoadingScreen] No loading screen found to remove.");
      }
    }
    function paymentSection(allItems) {
      console.log("[paymentSection] Entering payment section.");
      const itemsInCurrentCheckout = filterItemsInCurrentCheckout(allItems);
      if (Object.keys(itemsInCurrentCheckout).length === 0) {
        console.log("[paymentSection] No items from current checkout found. Skipping Wrrapd processing.");
        const existingSummary = document.querySelector("#wrrapd-summary");
        if (existingSummary) {
          existingSummary.remove();
        }
        return;
      }
      removeNotSelectedTextInGiftOptions(itemsInCurrentCheckout);
      const paymentStatus = localStorage.getItem("wrrapd-payment-status");
      if (paymentStatus === "success") {
        console.log("[paymentSection] Payment already successful - re-enabling Place your order buttons...");
        enablePlaceOrderButtons();
      } else {
        const wrrapdSelected = Object.values(itemsInCurrentCheckout).some((item) => {
          return item.options && item.options.some((subItem) => subItem.checkbox_wrrapd);
        });
        if (wrrapdSelected) {
          console.log("[paymentSection] Wrrapd selected - IMMEDIATELY disabling Place your order buttons...");
          disablePlaceOrderButtons();
        }
      }
      checkIfWrrapdSelected(itemsInCurrentCheckout);
      addDeliveryDateNotice(itemsInCurrentCheckout);
      monitorAddGiftOptionsButton(allItems);
    }
    function monitorAddGiftOptionsButton(allItems) {
      console.log("[monitorAddGiftOptionsButton] Setting up monitoring for gift options interface...");
      let hasInserted = false;
      const insertedKeys = /* @__PURE__ */ new Set();
      const tryInsertWrrapdOptions = () => {
        const currentURL = window.location.href;
        const urlKey = currentURL.split("?")[0];
        if (insertedKeys.has(urlKey) && hasInserted) {
          return;
        }
        const giftOptions = document.querySelector("#giftOptions");
        const giftCheckboxes = document.querySelectorAll('input[id^="gift-wrap-checkbox"], input[id^="toggle-gift-item-checkbox"]');
        const itemElements = document.querySelectorAll('[id^="item-"]');
        const giftMessageTextareas = document.querySelectorAll('textarea[id^="message-area"], textarea[id*="gift-message"]');
        const hasGiftOptions = giftOptions || giftCheckboxes.length > 0 || itemElements.length > 0 || giftMessageTextareas.length > 0;
        if (hasGiftOptions && !hasInserted) {
          console.log("[monitorAddGiftOptionsButton] \u2713\u2713\u2713 Gift options detected - calling insertWrrapdOptions (matching old code)...");
          hasInserted = true;
          insertedKeys.add(urlKey);
          setTimeout(() => {
            console.log("[monitorAddGiftOptionsButton] Executing: insertWrrapdOptions(allItems), monitorAmazonGiftCheckbox(allItems), and overrideSaveGiftOptionsButtons()");
            insertWrrapdOptions(allItems);
            monitorAmazonGiftCheckbox(allItems);
            overrideSaveGiftOptionsButtons();
          }, 1e3);
        }
      };
      tryInsertWrrapdOptions();
      const observer = new MutationObserver(() => {
        if (!hasInserted) {
          tryInsertWrrapdOptions();
        }
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      const interval = setInterval(() => {
        if (!hasInserted) {
          tryInsertWrrapdOptions();
        } else {
          clearInterval(interval);
        }
      }, 1e3);
      let lastURL = window.location.href;
      const urlCheckInterval = setInterval(() => {
        if (window.location.href !== lastURL) {
          lastURL = window.location.href;
          hasInserted = false;
          tryInsertWrrapdOptions();
        }
      }, 500);
      console.log("[monitorAddGiftOptionsButton] Monitoring active - will insert Wrrapd options when gift interface appears");
    }
    function disablePlaceOrderButtons() {
      console.log("[disablePlaceOrderButtons] Searching for Place your order buttons...");
      const findAndDisableButtons = () => {
        const allButtons = document.querySelectorAll('button, input[type="submit"], span[role="button"], input[type="button"], a[role="button"]');
        let foundAny = false;
        for (const btn of allButtons) {
          if (!btn || btn.offsetParent === null) continue;
          const text = (btn.textContent || btn.value || btn.getAttribute("aria-label") || btn.innerText || "").toLowerCase();
          if (text.includes("place your order") || text.includes("place order")) {
            console.log("[disablePlaceOrderButtons] \u2713 Found and disabling button:", text.substring(0, 50));
            btn.setAttribute("data-wrrapd-disabled", "true");
            if (btn.tagName === "INPUT" || btn.tagName === "BUTTON") {
              btn.disabled = true;
            }
            btn.style.pointerEvents = "none";
            btn.style.opacity = "0.5";
            btn.style.cursor = "not-allowed";
            btn.setAttribute("aria-disabled", "true");
            const newBtn = btn.cloneNode(true);
            newBtn.disabled = true;
            newBtn.style.pointerEvents = "none";
            newBtn.style.opacity = "0.5";
            newBtn.style.cursor = "not-allowed";
            newBtn.setAttribute("aria-disabled", "true");
            newBtn.setAttribute("data-wrrapd-disabled", "true");
            btn.parentNode.replaceChild(newBtn, btn);
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
      if (!findAndDisableButtons()) {
        console.log("[disablePlaceOrderButtons] Buttons not found yet, will retry...");
        setTimeout(() => findAndDisableButtons(), 500);
        setTimeout(() => findAndDisableButtons(), 1e3);
        setTimeout(() => findAndDisableButtons(), 2e3);
      }
    }
    function enablePlaceOrderButtons() {
      console.log("[enablePlaceOrderButtons] Re-enabling Place your order buttons...");
      const findAndEnableButtons = () => {
        const allButtons = document.querySelectorAll('button, input[type="submit"], span[role="button"], input[type="button"], a[role="button"]');
        let foundAny = false;
        for (const btn of allButtons) {
          if (!btn || btn.offsetParent === null) continue;
          const text = (btn.textContent || btn.value || btn.getAttribute("aria-label") || btn.innerText || "").toLowerCase();
          if (text.includes("place your order") || text.includes("place order")) {
            const wasWrrapdDisabled = btn.getAttribute("data-wrrapd-disabled") === "true" || btn.closest('[data-wrrapd-disabled="true"]') !== null;
            if (wasWrrapdDisabled || btn.disabled || btn.style.pointerEvents === "none") {
              console.log("[enablePlaceOrderButtons] \u2713 Found and re-enabling button:", text.substring(0, 50));
              btn.removeAttribute("data-wrrapd-disabled");
              if (btn.tagName === "INPUT" || btn.tagName === "BUTTON") {
                btn.disabled = false;
              }
              btn.style.pointerEvents = "auto";
              btn.style.opacity = "1";
              btn.style.cursor = "pointer";
              btn.removeAttribute("aria-disabled");
              const overlay = btn.parentNode?.querySelector(`[data-wrrapd-overlay-for="${btn.id || "button"}"]`);
              if (overlay) {
                overlay.remove();
              }
              const overlayButtons = btn.parentNode?.querySelectorAll('button[style*="z-index: 1000"]');
              if (overlayButtons) {
                overlayButtons.forEach((ob) => ob.remove());
              }
              foundAny = true;
            }
          }
        }
        return foundAny;
      };
      if (!findAndEnableButtons()) {
        console.log("[enablePlaceOrderButtons] Buttons not found yet, will retry...");
        setTimeout(() => findAndEnableButtons(), 500);
        setTimeout(() => findAndEnableButtons(), 1e3);
        setTimeout(() => findAndEnableButtons(), 2e3);
        setTimeout(() => findAndEnableButtons(), 3e3);
      }
    }
    function removeNotSelectedTextInGiftOptions(allItems) {
      const hasWrrapdSelected = Object.values(allItems).some(
        (item) => item.options && item.options.some((subItem) => subItem.checkbox_wrrapd)
      );
      const element = document.querySelector('#collapsed-gift-options-content-gift-wrap > [data-testid=""]');
      if (element && hasWrrapdSelected) {
        if (element.innerText === "Gift wrap: Not selected") {
          element.innerText = "Gift wrap selected with Wrrapd";
          console.log("[removeNotSelectedText] Text updated to 'Gift wrap with Wrrapd'.");
        }
      } else {
        console.log("[removeNotSelectedText] No items with Wrrapd selected or element not found.");
      }
    }
    function addDeliveryDateNotice(allItems) {
      console.log("[addDeliveryDateNotice] Checking for delivery dates to add notice...");
      const hasWrrapdItems = Object.values(allItems).some(
        (item) => item.options && item.options.some((opt) => opt.checkbox_wrrapd)
      );
      if (!hasWrrapdItems) {
        console.log("[addDeliveryDateNotice] No Wrrapd items found. Skipping notice.");
        return;
      }
      const processedItemContainers = /* @__PURE__ */ new Set();
      const isWrrapdItem = (container) => {
        const containerText = container.textContent || "";
        const hasWrrapdRecipient = containerText.includes("Delivering to Wrrapd") || containerText.includes("Wrrapd") && containerText.includes("PO BOX 26067") || containerText.includes("Wrrapd") && containerText.includes("32226-6067") || containerText.includes("Wrrapd") && containerText.includes("JACKSONVILLE") || containerText.includes("Wrrapd PO BOX 26067");
        const hasNonWrrapdRecipient = containerText.includes("Delivering to") && !containerText.includes("Wrrapd") && containerText.match(/Delivering to\s+[A-Z][a-z]+/);
        const isWrrapd = hasWrrapdRecipient && !hasNonWrrapdRecipient;
        if (isWrrapd) {
          console.log(`[isWrrapdItem] \u2713 Confirmed Wrrapd item:`, containerText.substring(0, 100));
        }
        return isWrrapd;
      };
      const addNoticesToDeliveryDates = () => {
        const allNotices = document.querySelectorAll(".wrrapd-delivery-notice");
        allNotices.forEach((notice) => notice.remove());
        processedItemContainers.clear();
        const orderItemSelectors = [
          '[id^="item-"]',
          '[data-testid*="item"]',
          ".spc-order-item",
          '[class*="order-item"]'
        ];
        let orderItems = [];
        for (const selector of orderItemSelectors) {
          orderItems = Array.from(document.querySelectorAll(selector));
          if (orderItems.length > 0) break;
        }
        if (orderItems.length === 0) {
          const allSections = document.querySelectorAll("div, section");
          orderItems = Array.from(allSections).filter((section) => {
            const text = section.textContent || "";
            return text.includes("Delivering to") && text.length < 1e4;
          });
        }
        const allItems2 = getAllItemsFromLocalStorage();
        const itemsInCheckout = filterItemsInCurrentCheckout(allItems2);
        const actualItemCount = Object.keys(itemsInCheckout).length;
        console.log(`[addDeliveryDateNotice] Found ${orderItems.length} potential order item(s), but actual checkout items: ${actualItemCount}`);
        let processedCount = 0;
        orderItems.forEach((itemContainer) => {
          if (processedCount >= actualItemCount) {
            return;
          }
          if (!isWrrapdItem(itemContainer)) {
            console.log("[addDeliveryDateNotice] Skipping non-Wrrapd item.");
            return;
          }
          if (processedItemContainers.has(itemContainer)) {
            return;
          }
          processedCount++;
          const radioButtons = Array.from(itemContainer.querySelectorAll('input[type="radio"]'));
          if (radioButtons.length > 0) {
            const firstRadio = radioButtons[0];
            let deliveryOptionsContainer = firstRadio.closest('[class*="delivery"], [class*="shipping"], [class*="option"]') || firstRadio.closest("div, fieldset") || firstRadio.parentElement?.parentElement?.parentElement;
            if (!deliveryOptionsContainer || !deliveryOptionsContainer.contains(radioButtons[radioButtons.length - 1])) {
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
            if (!deliveryOptionsContainer) {
              const allParents = [];
              radioButtons.forEach((radio) => {
                let parent = radio.parentElement;
                for (let depth = 0; depth < 10 && parent; depth++) {
                  if (!allParents.includes(parent)) {
                    allParents.push(parent);
                  }
                  parent = parent.parentElement;
                }
              });
              for (const parent of allParents) {
                const text = parent.textContent || "";
                if (text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i) || text.includes("Arriving") || text.includes("Arrives")) {
                  const radiosInParent = parent.querySelectorAll('input[type="radio"]');
                  if (radiosInParent.length === radioButtons.length) {
                    deliveryOptionsContainer = parent;
                    break;
                  }
                }
              }
            }
            if (deliveryOptionsContainer) {
              const existingNotice = deliveryOptionsContainer.querySelector(".wrrapd-delivery-notice") || deliveryOptionsContainer.nextElementSibling?.classList.contains("wrrapd-delivery-notice");
              if (!existingNotice) {
                const notice = document.createElement("div");
                notice.className = "wrrapd-delivery-notice";
                notice.style.cssText = "color: #d13212; font-size: 12px; margin-top: 8px; margin-bottom: 8px; font-style: italic; padding-left: 0; line-height: 1.4; display: block;";
                notice.textContent = "Note: Delivery date may be extended by one day due to gift-wrapping option.";
                if (deliveryOptionsContainer.nextSibling) {
                  deliveryOptionsContainer.parentNode.insertBefore(notice, deliveryOptionsContainer.nextSibling);
                } else {
                  deliveryOptionsContainer.parentNode.appendChild(notice);
                }
                processedItemContainers.add(itemContainer);
                console.log(`[addDeliveryDateNotice] \u2713 Added single notice to Wrrapd item.`);
              }
            } else {
              console.log(`[addDeliveryDateNotice] Could not find delivery options container for Wrrapd item with ${radioButtons.length} radio buttons.`);
              if (radioButtons.length > 0) {
                const lastRadio = radioButtons[radioButtons.length - 1];
                const radioParent = lastRadio.closest("label") || lastRadio.parentElement;
                if (radioParent && !radioParent.querySelector(".wrrapd-delivery-notice")) {
                  const notice = document.createElement("div");
                  notice.className = "wrrapd-delivery-notice";
                  notice.style.cssText = "color: #d13212; font-size: 12px; margin-top: 8px; margin-bottom: 8px; font-style: italic; padding-left: 0; line-height: 1.4; display: block;";
                  notice.textContent = "Note: Delivery date may be extended by one day due to gift-wrapping option.";
                  if (radioParent.nextSibling) {
                    radioParent.parentNode.insertBefore(notice, radioParent.nextSibling);
                  } else {
                    radioParent.parentNode.appendChild(notice);
                  }
                  processedItemContainers.add(itemContainer);
                  console.log(`[addDeliveryDateNotice] \u2713 Added notice after last radio button (fallback).`);
                }
              }
            }
          } else {
            const allTextElements = itemContainer.querySelectorAll("*");
            let deliveryDateElement = null;
            for (const el of allTextElements) {
              const text = el.textContent || "";
              if ((text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i) || text.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i) || text.includes("Arriving")) && text.length < 200) {
                deliveryDateElement = el;
                break;
              }
            }
            if (deliveryDateElement) {
              const targetContainer = deliveryDateElement.closest('[class*="delivery"], [class*="shipping"], [class*="option"]') || deliveryDateElement.parentElement?.parentElement || deliveryDateElement.parentElement;
              if (targetContainer && !targetContainer.querySelector(".wrrapd-delivery-notice")) {
                const notice = document.createElement("div");
                notice.className = "wrrapd-delivery-notice";
                notice.style.cssText = "color: #d13212; font-size: 12px; margin-top: 8px; margin-bottom: 8px; font-style: italic; padding-left: 0; line-height: 1.4; display: block;";
                notice.textContent = "Note: Delivery date may be extended by one day due to gift-wrapping option.";
                if (targetContainer.nextSibling) {
                  targetContainer.parentNode.insertBefore(notice, targetContainer.nextSibling);
                } else {
                  targetContainer.parentNode.appendChild(notice);
                }
                processedItemContainers.add(itemContainer);
                console.log(`[addDeliveryDateNotice] \u2713 Added single notice to Wrrapd item.`);
              }
            }
          }
        });
      };
      setTimeout(() => addNoticesToDeliveryDates(), 500);
      setTimeout(() => addNoticesToDeliveryDates(), 1500);
      setTimeout(() => addNoticesToDeliveryDates(), 3e3);
      const observer = new MutationObserver(() => {
        addNoticesToDeliveryDates();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      setTimeout(() => {
        observer.disconnect();
      }, 2e4);
    }
    function checkIfWrrapdSelected(allItems) {
      console.log("[checkIfWrrapdSelected] Checking if Wrrapd is selected for any item in CURRENT checkout.");
      const itemsInCurrentCheckout = filterItemsInCurrentCheckout(allItems);
      if (Object.keys(itemsInCurrentCheckout).length === 0) {
        console.log("[checkIfWrrapdSelected] No items from current checkout found. Not showing Wrrapd summary.");
        const existingSummary = document.querySelector("#wrrapd-summary");
        if (existingSummary) {
          existingSummary.remove();
          console.log("[checkIfWrrapdSelected] Removed Wrrapd summary - no Wrrapd items in current checkout.");
        }
        return;
      }
      const wrrapdSelected = Object.values(itemsInCurrentCheckout).some((item) => {
        return item.options && item.options.some((subItem) => subItem.checkbox_wrrapd);
      });
      if (wrrapdSelected) {
        console.log("[checkIfWrrapdSelected] Wrrapd selected for at least one item in current checkout.");
        createWrrapdSummary();
      } else {
        console.log("[checkIfWrrapdSelected] Wrrapd not selected for any item in current checkout.");
        const existingSummary = document.querySelector("#wrrapd-summary");
        if (existingSummary) {
          existingSummary.remove();
          console.log("[checkIfWrrapdSelected] Removed Wrrapd summary - no Wrrapd items selected.");
        }
      }
    }
    function filterItemsInCurrentCheckout(allItems) {
      console.log("[filterItemsInCurrentCheckout] Filtering items to only include those in current checkout...");
      const itemsInCheckout = {};
      const currentURL = window.location.href;
      const isPaymentPage = currentURL.includes("/spc") || currentURL.includes("payselect");
      if (isPaymentPage) {
        console.log("[filterItemsInCurrentCheckout] Payment page detected - using Wrrapd selection as filter criteria");
        for (const [title, item] of Object.entries(allItems)) {
          if (item.options && item.options.some((opt) => opt.checkbox_wrrapd)) {
            itemsInCheckout[title] = item;
            console.log(`[filterItemsInCurrentCheckout] Item "${title.substring(0, 40)}..." has Wrrapd selected - including in checkout.`);
          } else {
            console.log(`[filterItemsInCurrentCheckout] Item "${title.substring(0, 40)}..." does not have Wrrapd selected - filtering out.`);
          }
        }
      } else {
        const pageText = document.body.textContent || "";
        for (const [title, item] of Object.entries(allItems)) {
          const searchKey = item.asin || title;
          const titleSubstring = title.substring(0, 50);
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
    function createWrrapdSummary() {
      console.log("[createWrrapdSummary] Attempting to create Wrrapd summary section.");
      if (document.querySelector("#wrrapd-summary")) {
        console.log("[createWrrapdSummary] Wrrapd summary already exists. Skipping creation.");
        return;
      }
      const findOrderSummary = () => {
        let orderSummary2 = document.querySelector("#spc-order-summary");
        if (!orderSummary2) {
          const rightColumn = document.querySelector("#checkout-experience-right-column");
          if (rightColumn) {
            orderSummary2 = rightColumn.querySelector('#spc-order-summary, [id*="order-summary"], .spc-order-summary');
          }
        }
        if (!orderSummary2) {
          orderSummary2 = document.querySelector('[data-testid="order-summary"]');
        }
        if (!orderSummary2) {
          const candidates = document.querySelectorAll('[id*="order"], [class*="order"]');
          for (const candidate of candidates) {
            const id = (candidate.id || "").toLowerCase();
            const classes = (candidate.className || "").toLowerCase();
            if ((id.includes("summary") || classes.includes("summary")) && (id.includes("spc") || classes.includes("spc"))) {
              orderSummary2 = candidate;
              break;
            }
          }
        }
        if (!orderSummary2) {
          const rightColumn = document.querySelector("#checkout-experience-right-column");
          if (rightColumn) {
            console.log("[createWrrapdSummary] Using right column as container");
            return rightColumn;
          }
        }
        return orderSummary2;
      };
      let orderSummary = findOrderSummary();
      if (!orderSummary) {
        console.error("[createWrrapdSummary] \u2717 Order summary container not found. Cannot create summary.");
        return;
      }
      console.log("[createWrrapdSummary] \u2713 Found order summary container:", orderSummary.id || orderSummary.className);
      if (document.querySelector("#wrrapd-summary")) {
        console.log("[createWrrapdSummary] Wrrapd summary already exists. Skipping creation.");
        return;
      }
      console.log("[createWrrapdSummary] Creating new Wrrapd summary section.");
      let amazonInnerContainer = orderSummary.querySelector('.a-box, .a-box-inner, [class*="a-box"]');
      if (!amazonInnerContainer && orderSummary) {
        amazonInnerContainer = orderSummary;
      }
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
      const wrrapdSummary = document.createElement("div");
      wrrapdSummary.id = "wrrapd-summary";
      wrrapdSummary.className = orderSummary ? (orderSummary.className + " a-row").trim() : "a-row";
      if (amazonOuterStyles.marginTop) wrrapdSummary.style.marginTop = amazonOuterStyles.marginTop;
      if (amazonOuterStyles.marginBottom) wrrapdSummary.style.marginBottom = amazonOuterStyles.marginBottom;
      if (amazonOuterStyles.marginLeft) wrrapdSummary.style.marginLeft = amazonOuterStyles.marginLeft;
      if (amazonOuterStyles.marginRight) wrrapdSummary.style.marginRight = amazonOuterStyles.marginRight;
      const paymentStatus = localStorage.getItem("wrrapd-payment-status");
      const innerStyle = [
        amazonInnerStyles.paddingLeft ? `padding-left: ${amazonInnerStyles.paddingLeft};` : "",
        amazonInnerStyles.paddingRight ? `padding-right: ${amazonInnerStyles.paddingRight};` : "",
        amazonInnerStyles.paddingTop ? `padding-top: ${amazonInnerStyles.paddingTop};` : "",
        amazonInnerStyles.paddingBottom ? `padding-bottom: ${amazonInnerStyles.paddingBottom};` : ""
      ].filter((s) => s).join(" ");
      const amazonBoxInner = orderSummary.querySelector(".a-box-inner");
      let boxClass = "a-box-inner";
      if (!amazonBoxInner) {
        boxClass = "a-box a-box-normal";
      }
      if (paymentStatus === "success") {
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
                </div>
            `;
      } else {
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
                </div>
            `;
      }
      if (orderSummary.parentNode) {
        orderSummary.parentNode.insertBefore(wrrapdSummary, orderSummary.nextSibling);
        console.log("[createWrrapdSummary] \u2713 Wrrapd summary inserted after order summary");
      } else {
        orderSummary.appendChild(wrrapdSummary);
        console.log("[createWrrapdSummary] \u2713 Wrrapd summary appended to order summary");
      }
      if (orderSummary.id === "checkout-experience-right-column") {
        if (wrrapdSummary.parentNode) {
          wrrapdSummary.parentNode.removeChild(wrrapdSummary);
        }
        orderSummary.appendChild(wrrapdSummary);
        console.log("[createWrrapdSummary] \u2713 Wrrapd summary appended to right column");
      }
      total = updateWrrapdSummary();
      ensureWrrapdSummaryAlignment();
      removeLoadingScreen();
      console.log("[createWrrapdSummary] Payment summary created successfully - loading screen removed.");
      if (paymentStatus !== "success") {
        disablePlaceOrderButtons();
        document.getElementById("pay-wrrapd-btn").addEventListener("click", async function() {
          console.log("[createWrrapdSummary] 'Pay Wrrapd' button clicked. Initiating payment.");
          if (!total || total <= 0) {
            alert("Invalid total amount. Please check your order.");
            return;
          }
          try {
            const addressData = localStorage.getItem("wrrapd-default-address");
            if (!addressData) {
              alert("Default address information is missing. Please set your address before proceeding.");
              return;
            }
            const addressObject = JSON.parse(addressData);
            let zipCode = "00000";
            if (addressObject && addressObject.postalCode) {
              zipCode = addressObject.postalCode;
            }
            const orderNumber = generateOrderNumber(zipCode);
            localStorage.setItem("wrrapd-order-number", orderNumber);
            const payload = {
              total: Math.round((total * 100).toFixed(2)),
              address: addressObject,
              // This is the default Amazon address (Final shipping address)
              orderNumber
              // Add order number to payload
            };
            const encodedPayload = btoa(JSON.stringify(payload));
            const paymentUrl = `https://pay.wrrapd.com/checkout?data=${encodedPayload}`;
            const popupWidth = 400;
            const popupHeight = 680;
            const screenX = window.screenX !== void 0 ? window.screenX : window.screenLeft;
            const screenY = window.screenY !== void 0 ? window.screenY : window.screenTop;
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            const popupLeft = screenX + (windowWidth - popupWidth) / 2;
            const popupTop = screenY + (windowHeight - popupHeight) / 2;
            const popup = window.open(
              paymentUrl,
              "Wrrapd Payment",
              `width=${popupWidth},height=${popupHeight},left=${popupLeft},top=${popupTop},scrollbars=yes,resizable=yes`
            );
            if (!popup) {
              alert("Please allow popups for this website to complete the payment.");
              return;
            }
            popup.focus();
            window.addEventListener("message", async (event) => {
              if (event.data && event.data.status === "success") {
                const paymentIntentId = event.data.paymentIntentId;
                const customerEmail = event.data.customerEmail;
                const customerPhone = event.data.customerPhone;
                const billingDetails = event.data.billingDetails || null;
                const overlayButtons = document.querySelectorAll('button[style*="z-index: 1000"]');
                overlayButtons.forEach((btn) => btn.remove());
                const warningMessages = document.querySelectorAll(".wrrapd-warning");
                warningMessages.forEach((warning) => warning.remove());
                let topAmazonButton = document.querySelector("span#submitOrderButtonId");
                let bottomAmazonButton = document.querySelector("span#bottomSubmitOrderButtonId");
                if (!topAmazonButton) {
                  topAmazonButton = document.querySelector('input[name="placeYourOrder1"]');
                }
                if (!topAmazonButton) {
                  topAmazonButton = document.querySelector('button[aria-labelledby*="submitOrderButtonId"]');
                }
                if (!topAmazonButton) {
                  const allButtons = document.querySelectorAll('button, input[type="submit"], span[role="button"]');
                  topAmazonButton = Array.from(allButtons).find((btn) => {
                    const text = (btn.textContent || btn.value || btn.getAttribute("aria-label") || "").toLowerCase();
                    return text.includes("place your order") && btn.offsetParent !== null;
                  });
                }
                if (!bottomAmazonButton) {
                  bottomAmazonButton = document.querySelector('input[name="placeYourOrder2"]');
                }
                if (!bottomAmazonButton) {
                  bottomAmazonButton = document.querySelector('button[aria-labelledby*="bottomSubmitOrderButtonId"]');
                }
                enablePlaceOrderButtons();
                if (topAmazonButton) {
                  topAmazonButton.disabled = false;
                  topAmazonButton.style.pointerEvents = "auto";
                  topAmazonButton.style.opacity = "1";
                  topAmazonButton.style.cursor = "pointer";
                  topAmazonButton.removeAttribute("aria-disabled");
                  topAmazonButton.removeAttribute("data-wrrapd-disabled");
                }
                if (bottomAmazonButton) {
                  bottomAmazonButton.disabled = false;
                  bottomAmazonButton.style.pointerEvents = "auto";
                  bottomAmazonButton.style.opacity = "1";
                  bottomAmazonButton.style.cursor = "pointer";
                  bottomAmazonButton.removeAttribute("aria-disabled");
                  bottomAmazonButton.removeAttribute("data-wrrapd-disabled");
                }
                const paymentInfoContainer = document.querySelector("#wrrapd-payment-info");
                if (paymentInfoContainer) {
                  const existingSuccessMsg = paymentInfoContainer.querySelector('div[style*="color: green"]');
                  if (!existingSuccessMsg) {
                    const paymentInfo = document.createElement("div");
                    paymentInfo.style.color = "green";
                    paymentInfo.style.fontWeight = "bold";
                    paymentInfo.style.fontSize = "16px";
                    paymentInfo.textContent = "Payment successful. Please place order with Amazon now.";
                    paymentInfoContainer.appendChild(paymentInfo);
                  }
                }
                const payButton = document.getElementById("pay-wrrapd-btn");
                if (payButton) {
                  payButton.remove();
                }
                localStorage.setItem("wrrapd-payment-status", "success");
                const rawItems = localStorage.getItem("wrrapd-items");
                let orderData = [];
                try {
                  const parsedItems = JSON.parse(rawItems);
                  if (parsedItems && typeof parsedItems === "object") {
                    Object.values(parsedItems).forEach((item) => {
                      if (item.options) {
                        item.options.forEach((option) => {
                          if (option.checkbox_wrrapd === true) {
                            const shippingAddress = option.shippingAddress;
                            let deliveryInstructions = null;
                            try {
                              deliveryInstructions = JSON.parse(localStorage.getItem("wrrapd-delivery-instructions"));
                            } catch (error) {
                              console.error("[Order Data] Error parsing delivery instructions:", error);
                            }
                            let aiImageData = null;
                            if (option.selected_wrapping_option === "ai" && option.selected_ai_design) {
                              try {
                                const aiDesignData = option.selected_ai_design;
                                if (typeof aiDesignData === "string") {
                                  aiImageData = aiDesignData;
                                } else if (aiDesignData && aiDesignData.imageData) {
                                  aiImageData = aiDesignData.imageData;
                                } else if (aiDesignData && aiDesignData.url) {
                                  aiImageData = aiDesignData.url;
                                }
                              } catch (e) {
                                console.error("[Order Data] Error getting AI image:", e);
                              }
                            }
                            let finalShippingAddress = null;
                            try {
                              const defaultAddressData = localStorage.getItem("wrrapd-default-address");
                              if (defaultAddressData) {
                                finalShippingAddress = JSON.parse(defaultAddressData);
                              }
                            } catch (e) {
                              console.error("[Order Data] Error getting final shipping address:", e);
                            }
                            orderData.push({
                              asin: item.asin,
                              title: item.title,
                              imageUrl: item.imageUrl || null,
                              checkbox_flowers: option.checkbox_flowers,
                              selected_flower_design: option.selected_flower_design || null,
                              selected_wrapping_option: option.selected_wrapping_option,
                              selected_ai_design: option.selected_ai_design || null,
                              aiImageData,
                              // AI generated image data for admin email
                              uploaded_design_path: option.uploaded_design_path || null,
                              occasion: option.occasion || null,
                              shippingAddress: option.shippingAddress,
                              // Wrrapd address
                              finalShippingAddress,
                              // Final delivery address (default Amazon address)
                              deliveryInstructions,
                              giftMessage: option.giftMessage || null,
                              senderName: option.senderName || null
                              // special delivery instructions
                              // time of order
                              // day of order
                              //time of delivery (empty)
                              // day of delivery (empty)
                            });
                          }
                        });
                      }
                    });
                  }
                } catch (error) {
                  console.error("Error parsing wrrapd-items from localStorage:", error);
                }
                console.log("Order Data:", orderData);
                try {
                  let orderNumber2 = localStorage.getItem("wrrapd-order-number");
                  if (!orderNumber2) {
                    let zipCode2 = "00000";
                    if (orderData.length > 0 && orderData[0].shippingAddress && orderData[0].shippingAddress.postalCode) {
                      zipCode2 = orderData[0].shippingAddress.postalCode;
                    }
                    orderNumber2 = generateOrderNumber(zipCode2);
                    localStorage.setItem("wrrapd-order-number", orderNumber2);
                  }
                  const rawItems2 = localStorage.getItem("wrrapd-items");
                  if (rawItems2) {
                    console.log(`[OrderConfirmation] Processing pending file uploads with order number: ${orderNumber2}`);
                    console.log(`[OrderConfirmation] Raw items from localStorage:`, rawItems2);
                    const parsedItems = JSON.parse(rawItems2);
                    console.log(`[OrderConfirmation] Parsed items:`, JSON.stringify(parsedItems));
                    let uploadCount = 0;
                    let successCount = 0;
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
                          if (option.checkbox_wrrapd && option.selected_wrapping_option === "upload" && option.file_data_url) {
                            uploadCount++;
                            console.log(`[OrderConfirmation] Found pending upload for product: ${item.title}, ASIN: ${item.asin}, option index: ${i}`);
                            try {
                              console.log(`[OrderConfirmation] Converting data URL to blob`);
                              const dataUrl = option.file_data_url;
                              const byteString = atob(dataUrl.split(",")[1]);
                              const mimeType = dataUrl.split(",")[0].split(":")[1].split(";")[0];
                              const ab = new ArrayBuffer(byteString.length);
                              const ia = new Uint8Array(ab);
                              for (let i2 = 0; i2 < byteString.length; i2++) {
                                ia[i2] = byteString.charCodeAt(i2);
                              }
                              const fileBlob = new Blob([ab], { type: mimeType });
                              console.log(`[OrderConfirmation] Successfully converted to blob, size: ${fileBlob.size} bytes`);
                              const paddedIndex = String(i).padStart(2, "0");
                              const newFilename = `${orderNumber2}-${item.asin}-${paddedIndex}`;
                              console.log(`[OrderConfirmation] Generated new filename: ${newFilename}`);
                              console.log(`[OrderConfirmation] Requesting signed URL for ${newFilename}`);
                              const urlResponse = await fetch("https://api.wrrapd.com/api/get-upload-url", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  filename: newFilename,
                                  contentType: mimeType
                                })
                              });
                              if (!urlResponse.ok) {
                                console.error(`[OrderConfirmation] Failed to get upload URL: ${urlResponse.status} ${urlResponse.statusText}`);
                                throw new Error("Failed to get upload URL");
                              }
                              const { signedUrl, filePath } = await urlResponse.json();
                              console.log(`[OrderConfirmation] Received signed URL and file path: ${filePath}`);
                              console.log(`[OrderConfirmation] Uploading file to GCS`);
                              const uploadResponse = await fetch(signedUrl, {
                                method: "PUT",
                                headers: { "Content-Type": mimeType },
                                body: fileBlob
                              });
                              if (!uploadResponse.ok) {
                                console.error(`[OrderConfirmation] Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
                                throw new Error("Upload failed");
                              }
                              console.log(`[OrderConfirmation] Upload successful for ${newFilename}`);
                              successCount++;
                              option.uploaded_design_path = filePath;
                              delete option.file_data_url;
                              const orderDataItem = orderData.find((od) => od.asin === item.asin);
                              if (orderDataItem) {
                                orderDataItem.uploaded_design_path = filePath;
                                console.log(`[OrderConfirmation] Updated orderData with file path: ${filePath}`);
                              }
                            } catch (uploadError) {
                              console.error(`[OrderConfirmation] Error uploading file for ${item.title}, ASIN: ${item.asin}:`, uploadError);
                            }
                          }
                        }
                      }
                    }
                    saveAllItemsToLocalStorage(parsedItems);
                    console.log(`[OrderConfirmation] File upload process complete. Total: ${uploadCount}, Successful: ${successCount}`);
                  } else {
                    console.log(`[OrderConfirmation] No items found in localStorage for file processing`);
                  }
                  const response = await fetch("https://api.wrrapd.com/process-payment", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      paymentIntentId,
                      orderData,
                      // Contains all required info: finalShippingAddress, aiImageData, giftMessage, deliveryInstructions, senderName
                      customerEmail,
                      customerPhone,
                      orderNumber: orderNumber2,
                      billingDetails: billingDetails || null
                      // Billing details from Stripe checkout
                    })
                  });
                  const result = await response.json();
                  if (result.success) {
                    console.log("Payment and order processed successfully.");
                  } else {
                    console.error("Failed to process payment and order:", result.error);
                  }
                } catch (error) {
                  console.error("Error sending payment and order data to backend:", error);
                }
              }
            });
          } catch (error) {
            console.error("[createWrrapdSummary] Error during payment:", error);
            alert("Failed to initiate the payment. Please try again.");
          }
        });
      }
    }
    function updateWrrapdSummary() {
      console.log("[updateWrrapdSummary] Updating Wrrapd summary.");
      const wrrapdSummaryItems = document.querySelector("#wrrapd-summary-items");
      const wrrapdSummaryTotal = document.querySelector("#wrrapd-summary-total");
      let total2 = 0;
      if (wrrapdSummaryItems && wrrapdSummaryTotal) {
        const allItems = getAllItemsFromLocalStorage();
        const itemsInCurrentCheckout = filterItemsInCurrentCheckout(allItems);
        if (Object.keys(itemsInCurrentCheckout).length === 0) {
          console.log("[updateWrrapdSummary] No items in current checkout. Removing summary.");
          const existingSummary = document.querySelector("#wrrapd-summary");
          if (existingSummary) {
            existingSummary.remove();
          }
          return 0;
        }
        console.log("[updateWrrapdSummary] Found summary containers. Clearing previous content.");
        wrrapdSummaryItems.innerHTML = "";
        wrrapdSummaryTotal.innerHTML = "";
        console.log("[updateWrrapdSummary] Calculating totals for selected options.");
        let giftWrapTotal = 0;
        let flowersTotal = 0;
        let customDesignTotal = 0;
        Object.values(itemsInCurrentCheckout).forEach((item) => {
          if (item.options) {
            item.options.forEach((option) => {
              if (option.checkbox_wrrapd) {
                giftWrapTotal += 6.99;
                if (option.selected_wrapping_option === "ai") {
                  customDesignTotal += 2.99;
                } else if (option.selected_wrapping_option === "upload") {
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
        total2 = subtotal + estimatedTax;
        console.log(`[updateWrrapdSummary] Subtotal: $${subtotal.toFixed(2)}, Estimated Tax: $${estimatedTax.toFixed(2)}, Total: $${total2.toFixed(2)}.`);
        ensureWrrapdSummaryAlignment();
        if (giftWrapTotal > 0) {
          addSummaryLineItem(wrrapdSummaryItems, "Gift-wrapping", giftWrapTotal);
        }
        if (customDesignTotal > 0) {
          addSummaryLineItem(wrrapdSummaryItems, "Custom Design Fee", customDesignTotal);
        }
        if (flowersTotal > 0) {
          addSummaryLineItem(wrrapdSummaryItems, "Flowers", flowersTotal);
        }
        const dividerBeforeTax = document.createElement("hr");
        dividerBeforeTax.className = "a-spacing-none a-divider-normal";
        dividerBeforeTax.style.marginTop = "8px";
        dividerBeforeTax.style.marginBottom = "8px";
        wrrapdSummaryItems.appendChild(dividerBeforeTax);
        addSummaryLineItem(wrrapdSummaryItems, "Total before tax:", subtotal);
        addSummaryLineItem(wrrapdSummaryItems, "Estimated tax to be collected:", estimatedTax, true);
        const totalRow = document.createElement("div");
        totalRow.className = "a-row";
        totalRow.innerHTML = `
                <span class="a-color-price break-word" style="font-size: 18px; font-weight: bold;">Order total</span>
                <span class="a-color-price break-word" style="float: right; font-size: 18px; font-weight: bold;">$${total2.toFixed(2)}</span>
            `;
        wrrapdSummaryTotal.appendChild(totalRow);
        console.log("[updateWrrapdSummary] Wrrapd summary updated successfully.");
        ensureWrrapdSummaryAlignment();
      } else {
        console.log("[updateWrrapdSummary] Summary containers not found. Skipping update.");
      }
      return total2;
    }
    function addSummaryLineItem(container, description, amount, forceShow = false) {
      if (amount > 0 || forceShow) {
        console.log(`[addSummaryLineItem] Adding line item: ${description} - $${amount.toFixed(2)}`);
        const item = document.createElement("div");
        item.className = "a-row";
        item.innerHTML = `
                <span style="display: block; width: 100%;">
                    <span style="float: left;">${description}</span>
                    <span style="float: right;">$${amount.toFixed(2)}</span>
                </span>
            `;
        container.appendChild(item);
      } else {
        console.log(`[addSummaryLineItem] Skipping line item: ${description} - $${amount.toFixed(2)} (amount is zero).`);
      }
    }
    function getTaxRatePercentage() {
      console.log("[getTaxRatePercentage] Attempting to calculate the tax rate percentage.");
      let ulElement = document.querySelector("#subtotals-marketplace-table");
      if (!ulElement) {
        ulElement = document.querySelector('#spc-order-summary ul, #spc-order-summary [class*="subtotal"], .spc-order-summary ul');
      }
      if (!ulElement) {
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
      const listItems = ulElement.querySelectorAll("li");
      listItems.forEach((li) => {
        let labelElement = li.querySelector(".order-summary-line-term span.break-word");
        let valueElement = li.querySelector(".order-summary-line-definition span.aok-nowrap");
        if (!labelElement) {
          labelElement = li.querySelector('.order-summary-line-term, [class*="term"]');
        }
        if (!valueElement) {
          valueElement = li.querySelector('.order-summary-line-definition, [class*="definition"], .aok-nowrap');
        }
        if (!labelElement || !valueElement) {
          const allSpans = li.querySelectorAll("span");
          allSpans.forEach((span) => {
            const text = span.textContent.trim();
            if (text.includes("Total before tax") || text.includes("Subtotal") || text.includes("Items")) {
              labelElement = span;
            }
            if (text.includes("$") && !text.includes("tax") && !text.includes("Total")) {
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
          valueText = valueText.replace(/[$,]/g, "");
          const valueNum = parseFloat(valueText);
          if (labelText.includes("Total before tax") || labelText.includes("Subtotal") || labelText.includes("Items") && !labelText.includes("tax")) {
            if (!isNaN(valueNum) && valueNum > 0) {
              subtotal = valueNum;
              console.log(`[getTaxRatePercentage] Found subtotal: $${subtotal.toFixed(2)}.`);
            }
          } else if (labelText.includes("Estimated tax") || labelText.includes("tax to be collected")) {
            if (!isNaN(valueNum)) {
              tax = valueNum;
              console.log(`[getTaxRatePercentage] Found tax: $${tax.toFixed(2)}.`);
            }
          }
        }
      });
      if (subtotal === 0 && ulElement) {
        const allText = ulElement.textContent || "";
        const subtotalMatch = allText.match(/Total before tax[:\s]*\$?([\d,]+\.?\d*)/i);
        if (subtotalMatch) {
          subtotal = parseFloat(subtotalMatch[1].replace(/,/g, ""));
          console.log(`[getTaxRatePercentage] Found subtotal via text search: $${subtotal.toFixed(2)}.`);
        }
      }
      if (subtotal > 0) {
        const taxRatePercentage = tax / subtotal * 100;
        console.log(`[getTaxRatePercentage] Calculated tax rate: ${taxRatePercentage.toFixed(2)}% (tax: $${tax.toFixed(2)}, subtotal: $${subtotal.toFixed(2)}).`);
        return taxRatePercentage;
      }
      console.log("[getTaxRatePercentage] Subtotal or tax not found or invalid. Returning default tax rate of 0%.");
      console.log("[getTaxRatePercentage] Debug - subtotal:", subtotal, "tax:", tax);
      return 0;
    }
    function offersSection(allItems) {
      removeNotSelectedTextInGiftOptions(allItems);
    }
    function reviewAndShippingSection() {
      console.log("[reviewAndShippingSection] Entering review and shipping section.");
      const allItems = getAllItemsFromLocalStorage();
      monitorReviewPageLoader(allItems);
      checkChangeAddress(allItems);
    }
    function monitorReviewPageLoader(allItems) {
      const intervalTime = 500;
      const intervalId = setInterval(() => {
        const loader = document.querySelector("div.section-overwrap");
        if (loader) {
          console.log("[monitorGenericLoader] Loader is present. Waiting...");
        } else {
          console.log("[monitorGenericLoader] Loader has disappeared. Executing logic.");
          clearInterval(intervalId);
          reviewAndShippingSectionLogic(allItems);
          checkIfWrrapdSelected(allItems);
        }
      }, intervalTime);
      console.log("[monitorGenericLoader] Monitoring started.");
    }
    function reviewAndShippingSectionLogic(allItems) {
      console.log("[reviewAndShippingSection] Entering review and shipping section.");
      const ordersContainer = document.querySelector("div#spc-orders");
      if (!ordersContainer) {
        console.warn("[reviewAndShippingSection] Orders container not found.");
        return;
      }
      const orderBoxes = ordersContainer.querySelectorAll("div[data-orderid]");
      console.log(`[reviewAndShippingSection] Found ${orderBoxes.length} order boxes.`);
      orderBoxes.forEach((orderBox, boxIndex) => {
        console.log(`[reviewAndShippingSection] Processing order box #${boxIndex + 1}`);
        const items = orderBox.querySelectorAll(".item-row");
        console.log(`[reviewAndShippingSection] Found ${items.length} items in order box #${boxIndex + 1}`);
        let hasWrapdItemInBox = false;
        items.forEach((item, index) => {
          const titleElement = item.querySelector(".a-text-bold");
          if (!titleElement) {
            console.warn(`[reviewAndShippingSection] Item title not found for item #${index + 1} in order box #${boxIndex + 1}`);
            return;
          }
          const itemTitle = titleElement.textContent.trim().substring(0, 35);
          console.log(`[reviewAndShippingSection] Processing item: "${itemTitle}"`);
          const matchedItem = allItems[itemTitle];
          if (!matchedItem) {
            console.log(`[reviewAndShippingSection] No match found for: "${itemTitle}"`);
            return;
          }
          const hasWrapdSelected = matchedItem.options && matchedItem.options.some((option) => option.checkbox_wrrapd);
          console.log(`[reviewAndShippingSection] Item "${itemTitle}" has Wrrapd selected: ${hasWrapdSelected}`);
          if (hasWrapdSelected) {
            hasWrapdItemInBox = true;
          }
          const giftWrapTextElement = item.querySelector('[id^="review-selected-gift-options-content-gift-wrap-"] [data-testid=""]');
          if (giftWrapTextElement && hasWrapdSelected) {
            console.log(`[reviewAndShippingSection] Updating gift wrap text for "${itemTitle}". Current text: "${giftWrapTextElement.textContent}"`);
            giftWrapTextElement.textContent = "Gift wrap selected with Wrrapd";
            console.log(`[reviewAndShippingSection] Gift wrap text updated for "${itemTitle}"`);
          } else if (!giftWrapTextElement) {
            console.log(`[reviewAndShippingSection] Gift wrap text element not found for "${itemTitle}"`);
          }
          const addGiftButton = item.querySelector('[id^="review-selected-gift-options-"]  > .a-declarative ');
          if (addGiftButton) {
            console.log(`[reviewAndShippingSection] Found 'Add gift options' button for "${itemTitle}"`);
            createOverlayButton(addGiftButton, goToGiftOptionsPage);
          } else {
            console.log(`[reviewAndShippingSection] 'Add gift options' button not found for "${itemTitle}"`);
          }
          const changeGiftButton = item.querySelector('[id^="review-selected-gift-options-"] > .a-declarative ');
          if (changeGiftButton) {
            console.log(`[reviewAndShippingSection] Found 'Change gift options' button for "${itemTitle}"`);
            createOverlayButton(changeGiftButton, goToGiftOptionsPage);
          } else {
            console.log(`[reviewAndShippingSection] 'Change gift options' button not found for "${itemTitle}"`);
          }
        });
        if (hasWrapdItemInBox) {
          console.log(`[reviewAndShippingSection] Box #${boxIndex + 1} has Wrrapd items, updating delivery text`);
          const deliveryOptionTitle = orderBox.querySelector(".shipping-speeds-title");
          if (deliveryOptionTitle) {
            console.log(`[reviewAndShippingSection] Found delivery title. Current text: "${deliveryOptionTitle.textContent}"`);
            deliveryOptionTitle.textContent = "Choose a delivery option (Extra day added to the dates below if choosing Wrrapd's gift-wrapping):";
            console.log("[reviewAndShippingSection] Updated delivery option text successfully");
          } else {
            console.log("[reviewAndShippingSection] Delivery title not found");
          }
        }
      });
    }
    function createOverlayButton(originalButton, callback) {
      if (originalButton.tagName === "INPUT" || originalButton.tagName === "BUTTON") {
        originalButton.disabled = true;
      }
      originalButton.style.pointerEvents = "none";
      originalButton.setAttribute("aria-disabled", "true");
      const existingOverlay = originalButton.parentNode.querySelector(`[data-wrrapd-overlay-for="${originalButton.id || "button"}"]`);
      if (existingOverlay) {
        existingOverlay.remove();
      }
      const rect = originalButton.getBoundingClientRect();
      const parentRect = originalButton.parentNode.getBoundingClientRect();
      const overlayButton = document.createElement("div");
      overlayButton.style.position = "absolute";
      overlayButton.style.top = `${rect.top - parentRect.top + originalButton.parentNode.scrollTop}px`;
      overlayButton.style.left = `${rect.left - parentRect.left + originalButton.parentNode.scrollLeft}px`;
      overlayButton.style.width = `${rect.width}px`;
      overlayButton.style.height = `${rect.height}px`;
      overlayButton.style.backgroundColor = "transparent";
      overlayButton.style.border = "none";
      overlayButton.style.cursor = "not-allowed";
      overlayButton.style.zIndex = "10000";
      overlayButton.setAttribute("data-wrrapd-overlay-for", originalButton.id || "button");
      overlayButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (callback) {
          callback(e);
        }
        return false;
      }, true);
      overlayButton.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }, true);
      overlayButton.addEventListener("mouseup", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }, true);
      const parent = originalButton.parentNode;
      if (getComputedStyle(parent).position === "static") {
        parent.style.position = "relative";
      }
      parent.appendChild(overlayButton);
    }
    function goToGiftOptionsPage() {
      console.log("[goToGiftOptionsPage] Redirecting to gift options page.");
      window.location.href = "https://www.amazon.com/gp/buy/gift/handlers/display.html";
    }
    function monitorDeliveryInstructions() {
      const observer = new MutationObserver((mutations) => {
        const closeButton = document.getElementById("cdp-close-button");
        if (closeButton) {
          closeButton.removeEventListener("click", captureDeliveryInstructions);
          closeButton.addEventListener("click", captureDeliveryInstructions);
        }
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
    function captureDeliveryInstructions() {
      console.log("[captureDeliveryInstructions] Capturing delivery instructions...");
      setTimeout(() => {
        const summaryContainer = document.querySelector(".ma-cdp-summary");
        if (!summaryContainer) {
          console.warn("[captureDeliveryInstructions] Could not find delivery instructions summary.");
          return;
        }
        const propertyTypeElement = summaryContainer.querySelector(".ma-saved-property-type-text");
        const propertyType = propertyTypeElement ? propertyTypeElement.textContent.trim() : null;
        const instructions = {
          propertyType,
          securityCode: getValueByLabel(summaryContainer, "Security code:"),
          callBox: getValueByLabel(summaryContainer, "Call box:"),
          preferredLocation: getElementValue(summaryContainer, ".ma-preferred_delivery_locations_group-preferred_delivery_locations-saved-value"),
          businessHours: getElementValue(summaryContainer, ".ma-business_hrs_group-business_hrs-saved-value"),
          additionalInstructions: getElementValue(summaryContainer, ".ma-address_instructions_group-address_instructions-saved-value")
        };
        saveDeliveryInstructions(instructions);
        console.log("[captureDeliveryInstructions] Delivery instructions captured:", instructions);
      }, 500);
    }
    function saveDeliveryInstructions(instructions) {
      localStorage.setItem("wrrapd-delivery-instructions", JSON.stringify(instructions));
      console.log("[saveDeliveryInstructions] Saved delivery instructions:", instructions);
    }
    function getValueByLabel(container, labelText) {
      const labels = container.querySelectorAll(".a-size-base");
      for (let i = 0; i < labels.length; i++) {
        if (labels[i].textContent.trim() === labelText) {
          const valueElement = labels[i].nextElementSibling;
          if (valueElement && valueElement.classList.contains("a-size-base")) {
            return valueElement.textContent.trim();
          }
        }
      }
      return null;
    }
    function getElementValue(container, selector) {
      const element = container.querySelector(selector);
      return element ? element.textContent.trim() : null;
    }
    function generateOrderNumber(zipCode) {
      console.log("[generateOrderNumber] Generating order number.");
      const now = /* @__PURE__ */ new Date();
      const yearMod100 = now.getFullYear() % 100;
      const yearHex = yearMod100.toString(16).padStart(2, "0");
      const secondsSinceMidnight = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      const timeComponent = (1e4 + secondsSinceMidnight).toString();
      let zip = parseInt(zipCode.toString().substring(0, 5));
      if (isNaN(zip)) {
        zip = 0;
      }
      const zipComponent = (1e5 - zip).toString().padStart(5, "0");
      const counter = "01";
      const orderNumber = `100-${yearHex}${timeComponent}-${zipComponent}${counter}`;
      console.log(`[generateOrderNumber] Generated order number: ${orderNumber}`);
      return orderNumber;
    }
  })();
})();
