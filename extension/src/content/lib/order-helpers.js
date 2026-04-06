/**
 * Small helpers for reading Amazon UI text and generating order numbers.
 */

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

export function generateOrderNumber(zipCode) {
  console.log('[generateOrderNumber] Generating order number.');

  const now = new Date();
  const yearMod100 = now.getFullYear() % 100;
  const yearHex = yearMod100.toString(16).padStart(2, '0');
  const secondsSinceMidnight = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const timeComponent = (10000 + secondsSinceMidnight).toString();

  let zip = parseInt(zipCode.toString().substring(0, 5), 10);
  if (isNaN(zip)) {
    zip = 0;
  }
  const zipComponent = (100000 - zip).toString().padStart(5, '0');
  const counter = '01';
  const orderNumber = `100-${yearHex}${timeComponent}-${zipComponent}${counter}`;

  console.log(`[generateOrderNumber] Generated order number: ${orderNumber}`);
  return orderNumber;
}
