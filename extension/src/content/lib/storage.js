/**
 * Wrrapd cart / item persistence (localStorage).
 */

const STORAGE_KEY = 'wrrapd-items';

export function getAllItemsFromLocalStorage() {
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  return data;
}

export function saveAllItemsToLocalStorage(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function saveItemToLocalStorage(item) {
  const allItems = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};

  const existingItem = allItems[item.title];
  if (existingItem && JSON.stringify(existingItem) === JSON.stringify(item)) {
    return;
  }

  allItems[item.title] = item;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allItems));

  console.log(`[saveItemToLocalStorage] Item saved:`, item);
}

export function retrieveItemFromLocalStorage(title) {
  const allItems = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  const item = allItems[title] || null;
  console.log(`[retrieveItemFromLocalStorage] Retrieved item for title "${title}":`, item);
  return item;
}

export function removeAllItemsFromLocalStorage() {
  localStorage.removeItem(STORAGE_KEY);
}

export function saveDeliveryInstructions(instructions) {
  localStorage.setItem('wrrapd-delivery-instructions', JSON.stringify(instructions));
  console.log('[saveDeliveryInstructions] Saved delivery instructions:', instructions);
}
