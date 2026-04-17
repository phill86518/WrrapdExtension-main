/**
 * Full-screen loading overlay for checkout flows.
 */

import { getAllItemsFromLocalStorage } from './storage.js';

const SHIP_ONE_OVERLAY_ID = 'wrrapd-ship-one-guidance-overlay';
const SHIP_ONE_STYLE_ID = 'wrrapd-ship-one-guidance-styles';
const SHIP_ONE_HALO_CLASS = 'wrrapd-ship-one-halo-target';

let shipOneClickCapture = null;
/** @type {{ root: HTMLElement; svg: SVGSVGElement; panel: HTMLElement; haloTarget: HTMLElement; continueEl: HTMLElement; mo: MutationObserver; onScroll: () => void; onResize: () => void; raf: number; moTimer: ReturnType<typeof setTimeout> | null } | null} */
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
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) {
    loadingScreen.remove();
  } else {
    console.warn('[removeLoadingScreen] No loading screen found to remove.');
  }
}

function layoutShipOneGuidance() {
  if (!shipOneUi) return;
  const { svg, panel, haloTarget, continueEl } = shipOneUi;
  if (!continueEl.isConnected || !haloTarget.isConnected) {
    removeWrrapdShipToOneGuidanceOverlay();
    return;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 18;
  const br = haloTarget.getBoundingClientRect();
  const hx = Math.max(0, br.left - pad);
  const hy = Math.max(0, br.top - pad);
  const hw = Math.min(vw, br.width + pad * 2);
  const hh = Math.min(vh, br.height + pad * 2);

  const maskId = 'wrrapdShipOneSpotMask';
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
    const { root, mo, onScroll, onResize, haloTarget, moTimer } = shipOneUi;
    if (moTimer) clearTimeout(moTimer);
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
 */
export function showWrrapdShipToOneGuidanceOverlay(continueEl) {
  if (!continueEl || !continueEl.isConnected) {
    return;
  }

  removeWrrapdShipToOneGuidanceOverlay();
  removeLoadingScreen();
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
    <rect data-wrrapd="dim" width="${vw}" height="${vh}" fill="rgba(10,12,18,0.86)" mask="url(#${maskId})"/>
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
    'background:#0f172a',
    'color:#f8fafc',
    'border:1px solid #334155',
    'border-radius:14px',
    'box-shadow:0 16px 48px rgba(0,0,0,0.55)',
    'font-size:15px',
    'line-height:1.55',
    'z-index:2147483647',
  ].join(';');

  panel.innerHTML = `
    <div style="font-weight:700;font-size:17px;margin-bottom:10px;color:#fde68a;">Confirm shipping on Amazon</div>
    <ol style="margin:0 0 10px 20px;padding:0;">
      <li style="margin-bottom:8px;">We’ve added the Wrrapd hub to your address book where needed.</li>
      <li>Use the yellow <strong>Continue</strong> directly <strong>below</strong> “Ship items to one address” — <em>not</em> the Continue in the order summary on the right.</li>
    </ol>
    <div style="font-size:13px;color:#94a3b8;">Follow the arrow. After you tap that Continue, the screen stays dark until the payment step is ready.</div>
  `;

  root.appendChild(svg);
  root.appendChild(panel);
  document.body.appendChild(root);

  const onScroll = () => scheduleShipOneLayout();
  const onResize = () => scheduleShipOneLayout();
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);

  const mo = new MutationObserver(() => {
    if (!shipOneUi) return;
    if (shipOneUi.moTimer) clearTimeout(shipOneUi.moTimer);
    shipOneUi.moTimer = setTimeout(() => {
      shipOneUi.moTimer = null;
      scheduleShipOneLayout();
    }, 120);
  });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true });

  shipOneUi = {
    root,
    svg,
    panel,
    haloTarget,
    continueEl,
    mo,
    onScroll,
    onResize,
    raf: 0,
    moTimer: null,
  };

  scheduleShipOneLayout();
  setTimeout(() => scheduleShipOneLayout(), 350);
  setTimeout(() => scheduleShipOneLayout(), 900);

  shipOneClickCapture = (ev) => {
    const t = ev.target;
    if (panel.contains(t)) return;
    const hit =
      haloTarget.contains(t) ||
      continueEl === t ||
      (continueEl.contains && continueEl.contains(t));
    if (!hit) return;
    removeWrrapdShipToOneGuidanceOverlay();
    showLoadingScreen('Taking you to payment…');
  };
  document.addEventListener('click', shipOneClickCapture, true);
}
