/**
 * Full-screen loading overlay for checkout flows.
 */

import { getAllItemsFromLocalStorage } from './storage.js';

const SHIP_ONE_OVERLAY_ID = 'wrrapd-ship-one-guidance-overlay';
let shipOneClickCapture = null;

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
    existingScreen.style.zIndex = '2147483647';
    existingScreen.style.position = 'fixed';
    existingScreen.style.top = '0';
    existingScreen.style.left = '0';
    existingScreen.style.width = '100%';
    existingScreen.style.height = '100%';
    const p = existingScreen.querySelector('p');
    if (p && message) {
      p.innerHTML = message;
    }
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
  loadingScreen.style.zIndex = '2147483647';
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
                <p style="font-size: 18px; font-weight: bold; margin: 0; max-width: 92vw;">${message}</p>
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

/**
 * Remove the semi-transparent "ship to one address" guidance layer and its click listener.
 */
export function removeWrrapdShipToOneGuidanceOverlay() {
  if (shipOneClickCapture) {
    document.removeEventListener('click', shipOneClickCapture, true);
    shipOneClickCapture = null;
  }
  document.getElementById(SHIP_ONE_OVERLAY_ID)?.remove();
}

/**
 * Full-viewport dimmer (pointer-events none) + top instruction card. Clicks reach Amazon's Continue.
 * On Continue, switches to blocking {@link showLoadingScreen} until payment UI is ready.
 */
export function showWrrapdShipToOneGuidanceOverlay(continueEl) {
  if (!continueEl || !continueEl.isConnected) {
    return;
  }

  removeWrrapdShipToOneGuidanceOverlay();
  removeLoadingScreen();

  const root = document.createElement('div');
  root.id = SHIP_ONE_OVERLAY_ID;
  root.setAttribute('role', 'presentation');
  root.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483640',
    'pointer-events:none',
    'background:rgba(0,0,0,0.88)',
    'font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif',
  ].join(';');

  const panel = document.createElement('div');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Wrrapd — confirm shipping on Amazon');
  panel.style.cssText = [
    'position:fixed',
    'top:16px',
    'left:16px',
    'right:16px',
    'max-width:680px',
    'margin:0 auto',
    'pointer-events:auto',
    'box-sizing:border-box',
    'padding:18px 20px',
    'background:#0f172a',
    'color:#f8fafc',
    'border:1px solid #334155',
    'border-radius:12px',
    'box-shadow:0 12px 40px rgba(0,0,0,0.45)',
    'font-size:15px',
    'line-height:1.55',
  ].join(';');

  panel.innerHTML = `
    <div style="font-weight:700;font-size:16px;margin-bottom:10px;color:#fde68a;">Confirm shipping on Amazon</div>
    <ol style="margin:0 0 12px 20px;padding:0;">
      <li style="margin-bottom:8px;">We’ve added the Wrrapd hub to your address book where needed.</li>
      <li>Scroll if needed, then tap the yellow <strong>Continue</strong> in the main list (under “Ship … one address”) — not the sidebar.</li>
    </ol>
    <div style="font-size:13px;color:#94a3b8;">After you tap Continue, this screen will stay dark until the payment step is ready.</div>
  `;

  root.appendChild(panel);
  document.body.appendChild(root);

  shipOneClickCapture = (ev) => {
    const path = typeof ev.composedPath === 'function' ? ev.composedPath() : [];
    const hit =
      path.includes(continueEl) ||
      continueEl === ev.target ||
      (continueEl.contains && continueEl.contains(ev.target));
    if (!hit) return;
    removeWrrapdShipToOneGuidanceOverlay();
    showLoadingScreen('Taking you to payment…');
  };
  document.addEventListener('click', shipOneClickCapture, true);
}
