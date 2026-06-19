/**
 * Small helpers for reading Amazon UI text and generating order numbers.
 */
import { generateWrrapdOrderNumber } from "../../shared/wrrapd-order-code.js";

export function getValueByLabel(container, labelText) {
  const labels = container.querySelectorAll('.a-size-base');
  for (let i = 0; i < labels.length; i++) {
    if (labels[i].textContent.trim() === labelText) {
      const valueElement = labels[i].nextElementSibling;
      if (valueElement && valueElement.classList.contains('a-size-base')) {
        return valueElement.textContent.trim();
      }
    }
  }
  return null;
}

export function getElementValue(container, selector) {
  const element = container.querySelector(selector);
  return element ? element.textContent.trim() : null;
}

export function generateOrderNumber(_zipCode) {
  // Identical fixed-length shape for every retailer: AZ-TTTTTTTTT-RRRRRR.
  const orderNumber = generateWrrapdOrderNumber('amazon');
  console.log(`[generateOrderNumber] Generated order number: ${orderNumber}`);
  return orderNumber;
}
