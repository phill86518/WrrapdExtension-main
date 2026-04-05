/**
 * Full-screen loading overlay for checkout flows.
 */

import { getAllItemsFromLocalStorage } from './storage.js';

export function hideLoadingScreen() {
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) {
    console.log('[hideLoadingScreen] Hiding loading screen temporarily...');
    loadingScreen.style.display = 'none';
  }
}

export function showLoadingScreen(
  message = 'Items selected for gift-wrapping by Wrrapd shall be re-routed to Wrrapd and then delivered to you!<br>In some cases, it may take an extra day for delivery.'
) {
  const allItems = getAllItemsFromLocalStorage();
  const hasWrrapdItems = Object.values(allItems).some(
    (item) => item.options && item.options.some((subItem) => subItem.checkbox_wrrapd === true)
  );

  if (!hasWrrapdItems) {
    console.log('[showLoadingScreen] No Wrrapd items found - NOT showing loading screen');
    return;
  }

  const existingScreen = document.getElementById('loadingScreen');
  if (existingScreen) {
    existingScreen.style.display = 'flex';
    existingScreen.style.zIndex = '999999';
    existingScreen.style.position = 'fixed';
    existingScreen.style.top = '0';
    existingScreen.style.left = '0';
    existingScreen.style.width = '100%';
    existingScreen.style.height = '100%';
    return;
  }

  const loadingScreen = document.createElement('div');
  loadingScreen.id = 'loadingScreen';
  loadingScreen.style.position = 'fixed';
  loadingScreen.style.top = '0';
  loadingScreen.style.left = '0';
  loadingScreen.style.width = '100%';
  loadingScreen.style.height = '100%';
  loadingScreen.style.backgroundColor = 'black';
  loadingScreen.style.zIndex = '999999';
  loadingScreen.style.display = 'flex';
  loadingScreen.style.flexDirection = 'column';
  loadingScreen.style.alignItems = 'center';
  loadingScreen.style.justifyContent = 'center';

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

export function removeLoadingScreen() {
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) {
    loadingScreen.remove();
  } else {
    console.warn('[removeLoadingScreen] No loading screen found to remove.');
  }
}
