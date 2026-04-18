/**
 * Full-screen loading overlay for checkout flows.
 */

import { getAllItemsFromLocalStorage } from './storage.js';

const SHIP_ONE_OVERLAY_ID = 'wrrapd-ship-one-guidance-overlay';
const SHIP_ONE_STYLE_ID = 'wrrapd-ship-one-guidance-styles';
const SHIP_ONE_HALO_CLASS = 'wrrapd-ship-one-halo-target';
/** Amazon often swaps nodes briefly; avoid tearing the dimmer for transient disconnects. */
const SHIP_ONE_DISCONNECT_GRACE_MS = 4200;
const SHIP_ONE_MO_DEBOUNCE_MS = 320;

let shipOneClickCapture = null;
/** @type {{ root: HTMLElement; svg: SVGSVGElement; panel: HTMLElement; haloTarget: HTMLElement; continueEl: HTMLElement; maskId: string; refit: (() => HTMLElement | null) | null; getHandoffTargets: (() => HTMLElement[]) | null; mo: MutationObserver; onScroll: () => void; onResize: () => void; raf: number; moTimer: ReturnType<typeof setTimeout> | null; pendingRemove: ReturnType<typeof setTimeout> | null } | null} */
let shipOneUi = null;

function injectShipOneStylesOnce() {
  if (document.getElementById(SHIP_ONE_STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = SHIP_ONE_STYLE_ID;
  st.textContent = `
    .${SHIP_ONE_HALO_CLASS} {
      position: relative !important;
      z-index: 2147483646 !important;
      transform: scale(1.14) !important;
      transform-origin: center center !important;
      box-shadow:
        0 0 0 4px rgba(250, 204, 21, 0.95),
        0 0 36px 10px rgba(250, 204, 21, 0.55),
        0 12px 28px rgba(0, 0, 0, 0.35) !important;
      border-radius: 10px !important;
      animation: wrrapd-ship-one-halo-pulse 1.25s ease-in-out infinite !important;
    }
    @keyframes wrrapd-ship-one-halo-pulse {
      0%, 100% {
        box-shadow:
          0 0 0 3px rgba(250, 204, 21, 0.9),
          0 0 28px 6px rgba(250, 204, 21, 0.4),
          0 10px 22px rgba(0, 0, 0, 0.3);
        transform: scale(1.1) !important;
      }
      50% {
        box-shadow:
          0 0 0 6px rgba(250, 204, 21, 1),
          0 0 52px 18px rgba(250, 204, 21, 0.65),
          0 14px 32px rgba(0, 0, 0, 0.35);
        transform: scale(1.18) !important;
      }
    }
  `;
  document.head.appendChild(st);
}

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
  clearShipOneLoadingHandoffPoll();
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) {
    loadingScreen.remove();
  } else {
    console.warn('[removeLoadingScreen] No loading screen found to remove.');
  }
}

let shipOneLoadingHandoffIntervalId = null;
let shipOneHandoffShowTimeoutId = null;

function clearShipOneLoadingHandoffPoll() {
  if (shipOneHandoffShowTimeoutId !== null) {
    clearTimeout(shipOneHandoffShowTimeoutId);
    shipOneHandoffShowTimeoutId = null;
  }
  if (shipOneLoadingHandoffIntervalId !== null) {
    clearInterval(shipOneLoadingHandoffIntervalId);
    shipOneLoadingHandoffIntervalId = null;
  }
}

/**
 * Ship-to-one Continue: avoid showing the blocking overlay in the same turn as the capture listener
 * (so Amazon’s default action can run). Then clear the spinner when checkout advances or after a cap.
 */
function scheduleShipOneContinueLoadingHandoff() {
  clearShipOneLoadingHandoffPoll();

  const initialUrl = window.location.href;

  shipOneHandoffShowTimeoutId = setTimeout(() => {
    shipOneHandoffShowTimeoutId = null;
    showLoadingScreen('Taking you to payment…');
  }, 0);

  const isPaymentUrl = (u) =>
    u.includes('amazon.com/gp/buy/payselect/handlers/display.html') ||
    (u.includes('/checkout/') && u.includes('/spc') && !u.includes('/gp/buy/spc/handlers/display.html'));

  const isGiftUrl = (u) =>
    u.includes('amazon.com/gp/buy/gift/handlers/display.html') ||
    (u.includes('/checkout/') && u.includes('/gift'));

  let attempts = 0;
  const maxAttempts = 48;
  const tickMs = 400;

  shipOneLoadingHandoffIntervalId = setInterval(() => {
    attempts += 1;
    if (!document.getElementById('loadingScreen')) {
      clearShipOneLoadingHandoffPoll();
      return;
    }

    const u = window.location.href;

    if (isGiftUrl(u)) {
      clearShipOneLoadingHandoffPoll();
      removeLoadingScreen();
      return;
    }

    if (initialUrl.includes('itemselect') && !u.includes('itemselect')) {
      clearShipOneLoadingHandoffPoll();
      removeLoadingScreen();
      return;
    }

    if (isPaymentUrl(u)) {
      clearShipOneLoadingHandoffPoll();
      try {
        if (localStorage.getItem('wrrapd-keep-loading-until-summary') === 'true') {
          return;
        }
      } catch (_) {
        /* ignore */
      }
      removeLoadingScreen();
      return;
    }

    if (attempts >= maxAttempts) {
      clearShipOneLoadingHandoffPoll();
      try {
        if (
          isPaymentUrl(u) &&
          localStorage.getItem('wrrapd-keep-loading-until-summary') === 'true'
        ) {
          return;
        }
      } catch (_) {
        /* ignore */
      }
      removeLoadingScreen();
    }
  }, tickMs);
}

/**
 * After Amazon re-renders checkout, the original Continue node can disconnect briefly or permanently.
 * Re-resolve via refit() before tearing the UI down.
 */
function tryRefitShipOneTarget() {
  if (!shipOneUi) return false;
  let { continueEl, haloTarget, refit } = shipOneUi;
  if (continueEl.isConnected && haloTarget.isConnected) return true;
  if (typeof refit !== 'function') return false;
  const n = refit();
  if (!n || !n.isConnected) return false;
  try {
    haloTarget.classList.remove(SHIP_ONE_HALO_CLASS);
  } catch (e) {
    /* ignore */
  }
  shipOneUi.continueEl = n;
  shipOneUi.haloTarget = n.closest('.a-button') || n;
  shipOneUi.haloTarget.classList.add(SHIP_ONE_HALO_CLASS);
  return true;
}

function layoutShipOneGuidance() {
  if (!shipOneUi) return;
  const { svg, panel, maskId } = shipOneUi;
  let { haloTarget, continueEl } = shipOneUi;

  if (!continueEl.isConnected || !haloTarget.isConnected) {
    if (tryRefitShipOneTarget()) {
      continueEl = shipOneUi.continueEl;
      haloTarget = shipOneUi.haloTarget;
    } else {
      if (shipOneUi.pendingRemove) clearTimeout(shipOneUi.pendingRemove);
      shipOneUi.pendingRemove = setTimeout(() => {
        shipOneUi.pendingRemove = null;
        if (!shipOneUi) return;
        if (!tryRefitShipOneTarget()) {
          removeWrrapdShipToOneGuidanceOverlay();
        } else {
          scheduleShipOneLayout();
        }
      }, SHIP_ONE_DISCONNECT_GRACE_MS);
      return;
    }
  }

  if (shipOneUi.pendingRemove) {
    clearTimeout(shipOneUi.pendingRemove);
    shipOneUi.pendingRemove = null;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 18;
  const br = haloTarget.getBoundingClientRect();
  const hx = Math.max(0, br.left - pad);
  const hy = Math.max(0, br.top - pad);
  const hw = Math.min(vw, br.width + pad * 2);
  const hh = Math.min(vh, br.height + pad * 2);

  const hole = svg.querySelector('[data-wrrapd="hole"]');
  const dim = svg.querySelector('[data-wrrapd="dim"]');
  const line = svg.querySelector('[data-wrrapd="arrow-line"]');
  const head = svg.querySelector('[data-wrrapd="arrow-head"]');

  if (hole) {
    hole.setAttribute('x', String(hx));
    hole.setAttribute('y', String(hy));
    hole.setAttribute('width', String(hw));
    hole.setAttribute('height', String(hh));
  }
  if (dim) {
    dim.setAttribute('width', String(vw));
    dim.setAttribute('height', String(vh));
    dim.setAttribute('mask', `url(#${maskId})`);
  }

  svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  svg.setAttribute('width', String(vw));
  svg.setAttribute('height', String(vh));

  const pr = panel.getBoundingClientRect();
  const cx = pr.left + pr.width / 2;
  const cy = pr.bottom + 6;
  const tx = br.left + br.width / 2;
  const ty = br.top;

  if (line && head) {
    const midY = cy + (ty - cy) * 0.42;
    const d = `M ${cx} ${cy} Q ${cx} ${midY} ${tx} ${ty}`;
    line.setAttribute('d', d);
    const tipX = tx;
    const tipY = Math.max(ty - 4, br.top - 2);
    head.setAttribute(
      'points',
      `${tipX},${tipY} ${tipX - 16},${tipY + 22} ${tipX + 16},${tipY + 22}`
    );
  }
}

function scheduleShipOneLayout() {
  if (!shipOneUi) return;
  if (shipOneUi.raf) cancelAnimationFrame(shipOneUi.raf);
  shipOneUi.raf = requestAnimationFrame(() => {
    shipOneUi.raf = 0;
    layoutShipOneGuidance();
  });
}

/**
 * Remove spotlight, arrow, panel, halo, and capture listener.
 */
export function removeWrrapdShipToOneGuidanceOverlay() {
  if (shipOneClickCapture) {
    document.removeEventListener('click', shipOneClickCapture, true);
    shipOneClickCapture = null;
  }

  if (shipOneUi) {
    const { root, mo, onScroll, onResize, haloTarget, moTimer, pendingRemove } = shipOneUi;
    if (moTimer) clearTimeout(moTimer);
    if (pendingRemove) clearTimeout(pendingRemove);
    try {
      mo.disconnect();
    } catch (e) {
      /* ignore */
    }
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onResize);
    haloTarget.classList.remove(SHIP_ONE_HALO_CLASS);
    root.remove();
    shipOneUi = null;
  } else {
    document.getElementById(SHIP_ONE_OVERLAY_ID)?.remove();
  }
}

/**
 * Spotlight (masked dimmer so the real Continue stays visible), zoom+halo on that button,
 * instruction card + arrow. Clicks on the Continue reach Amazon; capture hands off to loading screen.
 *
 * @param {HTMLElement} continueEl
 * @param {{ refit?: () => HTMLElement | null; getHandoffTargets?: () => HTMLElement[] }} [options] — Re-find Continue after Amazon DOM swaps (prevents flicker teardown). Optional getHandoffTargets treats multiple Continues as valid for the loading handoff.
 */
export function showWrrapdShipToOneGuidanceOverlay(continueEl, options = {}) {
  const refit = typeof options.refit === 'function' ? options.refit : null;
  const getHandoffTargets =
    typeof options.getHandoffTargets === 'function' ? options.getHandoffTargets : null;
  if (!continueEl || !continueEl.isConnected) {
    return;
  }

  removeWrrapdShipToOneGuidanceOverlay();
  removeWrrapdManualDeliverGuidanceOverlay();
  injectShipOneStylesOnce();

  const haloTarget = continueEl.closest('.a-button') || continueEl;
  haloTarget.classList.add(SHIP_ONE_HALO_CLASS);

  try {
    haloTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch (e) {
    /* ignore */
  }

  const maskId = `wrrapdShipOneSpotMask-${Math.random().toString(36).slice(2, 9)}`;

  const root = document.createElement('div');
  root.id = SHIP_ONE_OVERLAY_ID;
  root.setAttribute('role', 'presentation');
  root.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483640',
    'pointer-events:none',
    'font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif',
  ].join(';');

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(vw));
  svg.setAttribute('height', String(vh));
  svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  svg.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483641;pointer-events:none;';

  svg.innerHTML = `
    <defs>
      <mask id="${maskId}">
        <rect width="${vw}" height="${vh}" fill="white"/>
        <rect data-wrrapd="hole" x="0" y="0" width="1" height="1" rx="12" ry="12" fill="black"/>
      </mask>
    </defs>
    <rect data-wrrapd="dim" width="${vw}" height="${vh}" fill="rgba(8,10,16,0.92)" mask="url(#${maskId})"/>
    <path data-wrrapd="arrow-line" d="M0 0" fill="none" stroke="#fde68a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>
    <polygon data-wrrapd="arrow-head" points="0,0 0,0 0,0" fill="#fde68a" stroke="#ca8a04" stroke-width="1" opacity="0.98"/>
  `;

  const panel = document.createElement('div');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Wrrapd — confirm shipping on Amazon');
  panel.style.cssText = [
    'position:fixed',
    'top:14px',
    'left:50%',
    'transform:translateX(-50%)',
    'width:min(680px,calc(100vw - 28px))',
    'max-width:680px',
    'margin:0',
    'pointer-events:auto',
    'box-sizing:border-box',
    'padding:16px 18px 18px',
    'background:#1e293b',
    'color:#f8fafc',
    'border:1px solid #475569',
    'border-radius:14px',
    'box-shadow:0 16px 48px rgba(0,0,0,0.55)',
    'font-size:15px',
    'line-height:1.55',
    'z-index:2147483647',
  ].join(';');

  panel.innerHTML = `
    <div style="font-weight:700;font-size:17px;margin-bottom:12px;color:#fde68a;">Confirm shipping on Amazon</div>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#f1f5f9;">We’ve added the Wrrapd hub to your address book - please accept by clicking <strong style="color:#fff;">here</strong> so that Wrrapd can receive your item(s) for gift-wrapping.</p>
  `;

  root.appendChild(svg);
  root.appendChild(panel);
  document.body.appendChild(root);

  const onScroll = () => scheduleShipOneLayout();
  const onResize = () => scheduleShipOneLayout();
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);

  const checkoutRoot =
    document.getElementById('checkout-main') ||
    document.querySelector('[data-checkout-page]') ||
    document.getElementById('checkout-experience-container') ||
    document.body;

  const mo = new MutationObserver(() => {
    if (!shipOneUi) return;
    if (shipOneUi.moTimer) clearTimeout(shipOneUi.moTimer);
    shipOneUi.moTimer = setTimeout(() => {
      shipOneUi.moTimer = null;
      scheduleShipOneLayout();
    }, SHIP_ONE_MO_DEBOUNCE_MS);
  });
  mo.observe(checkoutRoot, { childList: true, subtree: true, attributes: false });

  shipOneUi = {
    root,
    svg,
    panel,
    haloTarget,
    continueEl,
    maskId,
    refit,
    getHandoffTargets,
    mo,
    onScroll,
    onResize,
    raf: 0,
    moTimer: null,
    pendingRemove: null,
  };

  scheduleShipOneLayout();
  setTimeout(() => scheduleShipOneLayout(), 350);
  setTimeout(() => scheduleShipOneLayout(), 900);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scheduleShipOneLayout();
      removeLoadingScreen();
    });
  });

  shipOneClickCapture = (ev) => {
    if (!shipOneUi) return;
    const t = ev.target;
    if (shipOneUi.panel.contains(t)) return;
    tryRefitShipOneTarget();
    const rawTargets =
      typeof shipOneUi.getHandoffTargets === 'function'
        ? shipOneUi.getHandoffTargets()
        : null;
    const controls =
      Array.isArray(rawTargets) && rawTargets.length ? rawTargets : [shipOneUi.continueEl];
    const hit = controls.some((ce) => {
      if (!ce) return false;
      const ht = ce.closest('.a-button') || ce;
      return ht.contains(t) || ce === t || (ce.contains && ce.contains(t));
    });
    if (!hit) return;
    removeWrrapdShipToOneGuidanceOverlay();
    scheduleShipOneContinueLoadingHandoff();
  };
  document.addEventListener('click', shipOneClickCapture, true);
}

// ----- Manual “Deliver / Use this address” (Amazon requires customer tap; same spotlight UX as ship-one) -----
const MANUAL_DELIVER_OVERLAY_ID = 'wrrapd-manual-deliver-guidance-overlay';

let manualDeliverClickCapture = null;
let manualDeliverUi = null;

function tryRefitManualDeliverTarget() {
  if (!manualDeliverUi) return false;
  let { continueEl, haloTarget, refit } = manualDeliverUi;
  if (continueEl.isConnected && haloTarget.isConnected) return true;
  if (typeof refit !== 'function') return false;
  const n = refit();
  if (!n || !n.isConnected) return false;
  try {
    haloTarget.classList.remove(SHIP_ONE_HALO_CLASS);
  } catch (e) {
    /* ignore */
  }
  manualDeliverUi.continueEl = n;
  manualDeliverUi.haloTarget = n.closest('.a-button') || n;
  manualDeliverUi.haloTarget.classList.add(SHIP_ONE_HALO_CLASS);
  return true;
}

function layoutManualDeliverGuidance() {
  if (!manualDeliverUi) return;
  const { svg, panel, maskId } = manualDeliverUi;
  let { haloTarget, continueEl } = manualDeliverUi;

  if (!continueEl.isConnected || !haloTarget.isConnected) {
    if (!tryRefitManualDeliverTarget()) return;
    continueEl = manualDeliverUi.continueEl;
    haloTarget = manualDeliverUi.haloTarget;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 18;
  const br = haloTarget.getBoundingClientRect();
  const hx = Math.max(0, br.left - pad);
  const hy = Math.max(0, br.top - pad);
  const hw = Math.min(vw, br.width + pad * 2);
  const hh = Math.min(vh, br.height + pad * 2);

  const hole = svg.querySelector('[data-wrrapd="hole"]');
  const dim = svg.querySelector('[data-wrrapd="dim"]');
  const line = svg.querySelector('[data-wrrapd="arrow-line"]');
  const head = svg.querySelector('[data-wrrapd="arrow-head"]');

  if (hole) {
    hole.setAttribute('x', String(hx));
    hole.setAttribute('y', String(hy));
    hole.setAttribute('width', String(hw));
    hole.setAttribute('height', String(hh));
  }
  if (dim) {
    dim.setAttribute('width', String(vw));
    dim.setAttribute('height', String(vh));
    dim.setAttribute('mask', `url(#${maskId})`);
  }

  svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  svg.setAttribute('width', String(vw));
  svg.setAttribute('height', String(vh));

  const pr = panel.getBoundingClientRect();
  const cx = pr.left + pr.width / 2;
  const cy = pr.bottom + 6;
  const tx = br.left + br.width / 2;
  const ty = br.top;

  if (line && head) {
    const midY = cy + (ty - cy) * 0.42;
    const d = `M ${cx} ${cy} Q ${cx} ${midY} ${tx} ${ty}`;
    line.setAttribute('d', d);
    const tipX = tx;
    const tipY = Math.max(ty - 4, br.top - 2);
    head.setAttribute(
      'points',
      `${tipX},${tipY} ${tipX - 16},${tipY + 22} ${tipX + 16},${tipY + 22}`,
    );
  }
}

function scheduleManualDeliverLayout() {
  if (!manualDeliverUi) return;
  if (manualDeliverUi.raf) cancelAnimationFrame(manualDeliverUi.raf);
  manualDeliverUi.raf = requestAnimationFrame(() => {
    manualDeliverUi.raf = 0;
    layoutManualDeliverGuidance();
  });
}

export function removeWrrapdManualDeliverGuidanceOverlay() {
  if (manualDeliverClickCapture) {
    document.removeEventListener('click', manualDeliverClickCapture, true);
    manualDeliverClickCapture = null;
  }
  if (manualDeliverUi) {
    const { root, mo, onScroll, onResize, haloTarget, moTimer, pendingRemove } = manualDeliverUi;
    if (moTimer) clearTimeout(moTimer);
    if (pendingRemove) clearTimeout(pendingRemove);
    try {
      mo.disconnect();
    } catch (e) {
      /* ignore */
    }
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onResize);
    try {
      haloTarget.classList.remove(SHIP_ONE_HALO_CLASS);
    } catch (e) {
      /* ignore */
    }
    root.remove();
    manualDeliverUi = null;
  } else {
    document.getElementById(MANUAL_DELIVER_OVERLAY_ID)?.remove();
  }
}

/**
 * Spotlight + halo on Amazon’s Deliver/Use this address control (customer must tap; we do not synthesize it).
 * @param {HTMLElement} continueEl
 * @param {{ refit?: () => HTMLElement | null }} [options]
 */
export function showWrrapdManualDeliverGuidanceOverlay(continueEl, options = {}) {
  const refit = typeof options.refit === 'function' ? options.refit : null;
  if (!continueEl || !continueEl.isConnected) return;

  removeWrrapdManualDeliverGuidanceOverlay();
  removeWrrapdShipToOneGuidanceOverlay();
  injectShipOneStylesOnce();

  const haloTarget = continueEl.closest('.a-button') || continueEl;
  haloTarget.classList.add(SHIP_ONE_HALO_CLASS);

  try {
    haloTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch (e) {
    /* ignore */
  }

  const maskId = `wrrapdManualDeliverMask-${Math.random().toString(36).slice(2, 9)}`;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const root = document.createElement('div');
  root.id = MANUAL_DELIVER_OVERLAY_ID;
  root.setAttribute('role', 'presentation');
  root.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483638',
    'pointer-events:none',
    'font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif',
  ].join(';');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(vw));
  svg.setAttribute('height', String(vh));
  svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  svg.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483639;pointer-events:none;';

  svg.innerHTML = `
    <defs>
      <mask id="${maskId}">
        <rect width="${vw}" height="${vh}" fill="white"/>
        <rect data-wrrapd="hole" x="0" y="0" width="1" height="1" rx="12" ry="12" fill="black"/>
      </mask>
    </defs>
    <rect data-wrrapd="dim" width="${vw}" height="${vh}" fill="rgba(10,12,18,0.88)" mask="url(#${maskId})"/>
    <path data-wrrapd="arrow-line" d="M0 0" fill="none" stroke="#fbcfe8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>
    <polygon data-wrrapd="arrow-head" points="0,0 0,0 0,0" fill="#fbcfe8" stroke="#db2777" stroke-width="1" opacity="0.98"/>
  `;

  const panel = document.createElement('div');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Wrrapd — confirm delivery address on Amazon');
  panel.style.cssText = [
    'position:fixed',
    'top:14px',
    'left:50%',
    'transform:translateX(-50%)',
    'width:min(640px,calc(100vw - 28px))',
    'max-width:640px',
    'margin:0',
    'pointer-events:auto',
    'box-sizing:border-box',
    'padding:14px 16px 16px',
    'background:linear-gradient(145deg,#1e1b4b 0%,#312e81 55%,#4c1d95 100%)',
    'color:#f5f3ff',
    'border:1px solid rgba(244,114,182,0.45)',
    'border-radius:16px',
    'box-shadow:0 18px 50px rgba(0,0,0,0.55),0 0 0 1px rgba(255,255,255,0.06) inset',
    'font-size:14px',
    'line-height:1.5',
    'z-index:2147483647',
  ].join(';');

  panel.innerHTML = `
    <div style="font-weight:800;font-size:17px;margin-bottom:8px;letter-spacing:0.02em;background:linear-gradient(90deg,#fde68a,#fbcfe8,#e9d5ff);-webkit-background-clip:text;background-clip:text;color:transparent;">Confirm on Amazon</div>
    <ol style="margin:0 0 8px 18px;padding:0;font-size:12.5px;color:#e9d5ff;line-height:1.45;">
      <li style="margin-bottom:6px;">We’ve added the Wrrapd hub to your Amazon address book where needed — handy for future gift-wrap checkouts.</li>
      <li>Tap the yellow <strong style="color:#fff;">Deliver to this address</strong> or <strong style="color:#fff;">Use this address</strong> Amazon highlights for you — that authorizes items to ship to Wrrapd for gift wrapping.</li>
    </ol>
    <div style="font-size:11.5px;color:#c4b5fd;opacity:0.95;">Follow the arrow to the glowing button. We can’t tap it for you; once you do, checkout continues.</div>
  `;

  root.appendChild(svg);
  root.appendChild(panel);
  document.body.appendChild(root);

  const onScroll = () => scheduleManualDeliverLayout();
  const onResize = () => scheduleManualDeliverLayout();
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);

  const checkoutRoot =
    document.getElementById('checkout-main') ||
    document.querySelector('[data-checkout-page]') ||
    document.getElementById('checkout-experience-container') ||
    document.body;

  const mo = new MutationObserver(() => {
    if (!manualDeliverUi) return;
    if (manualDeliverUi.moTimer) clearTimeout(manualDeliverUi.moTimer);
    manualDeliverUi.moTimer = setTimeout(() => {
      manualDeliverUi.moTimer = null;
      scheduleManualDeliverLayout();
    }, SHIP_ONE_MO_DEBOUNCE_MS);
  });
  mo.observe(checkoutRoot, { childList: true, subtree: true, attributes: false });

  manualDeliverUi = {
    root,
    svg,
    panel,
    haloTarget,
    continueEl,
    maskId,
    refit,
    mo,
    onScroll,
    onResize,
    raf: 0,
    moTimer: null,
    pendingRemove: null,
  };

  scheduleManualDeliverLayout();
  setTimeout(() => scheduleManualDeliverLayout(), 350);
  setTimeout(() => scheduleManualDeliverLayout(), 900);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scheduleManualDeliverLayout();
      removeLoadingScreen();
    });
  });

  manualDeliverClickCapture = (ev) => {
    if (!manualDeliverUi) return;
    const t = ev.target;
    if (manualDeliverUi.panel.contains(t)) return;
    tryRefitManualDeliverTarget();
    const ht = manualDeliverUi.haloTarget;
    const ce = manualDeliverUi.continueEl;
    const hit =
      ht.contains(t) ||
      ce === t ||
      (ce.contains && ce.contains(t));
    if (!hit) return;
    try {
      localStorage.setItem('wrrapd-addresses-changed', 'true');
    } catch (e) {
      /* ignore */
    }
    removeWrrapdManualDeliverGuidanceOverlay();
  };
  document.addEventListener('click', manualDeliverClickCapture, true);
}
