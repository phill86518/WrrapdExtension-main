/**
 * Checkout flow diagnostics — survives `esbuild` when console is dropped.
 * DevTools: `wrrapdDumpTrace()` copy JSON; `wrrapdTraceEnableHud()` on-screen lines;
 * or `localStorage.setItem('wrrapd-trace','1')` then reload Amazon checkout tab.
 */

const MAX_TRACE = 600;
const HUD_MAX_LINES = 16;

function safeData(d) {
  if (d === undefined) return undefined;
  if (d === null) return null;
  if (typeof d === 'string') return d.length > 400 ? `${d.slice(0, 400)}…` : d;
  if (typeof d === 'number' || typeof d === 'boolean') return d;
  try {
    return JSON.parse(JSON.stringify(d));
  } catch (_) {
    try {
      return String(d).slice(0, 320);
    } catch (e2) {
      return '[unserializable]';
    }
  }
}

let hudEl = null;

function traceHudEnabled() {
  try {
    return (
      window.__WRRAPD_DEBUG_UI__ === true ||
      localStorage.getItem('wrrapd-trace') === '1' ||
      localStorage.getItem('wrrapd-debug-checkout') === '1'
    );
  } catch (_) {
    return window.__WRRAPD_DEBUG_UI__ === true;
  }
}

function appendDebugHud(entry) {
  if (typeof document === 'undefined' || !document.body) return;
  if (!traceHudEnabled()) return;
  if (!hudEl || !hudEl.isConnected) {
    hudEl = document.createElement('div');
    hudEl.id = 'wrrapd-debug-hud';
    hudEl.setAttribute('data-wrrapd', 'debug-hud');
    hudEl.style.cssText = [
      'position:fixed',
      'left:6px',
      'bottom:6px',
      'max-width:46vw',
      'max-height:32vh',
      'overflow:auto',
      'z-index:2147483646',
      'background:rgba(15,23,42,0.96)',
      'color:#e2e8f0',
      'font:10px/1.3 ui-monospace,Consolas,monospace',
      'padding:6px 8px',
      'border-radius:6px',
      'border:1px solid #475569',
      'pointer-events:none',
      'box-shadow:0 6px 20px rgba(0,0,0,.5)',
    ].join(';');
    document.body.appendChild(hudEl);
  }
  const line = document.createElement('div');
  const t = entry.ts || '';
  const shortT = t.includes('T') ? t.split('T')[1].slice(0, 15) : t.slice(0, 15);
  const extra = entry.data !== undefined ? ` ${JSON.stringify(entry.data).slice(0, 140)}` : '';
  line.textContent = `${shortT} [${entry.cat}] ${entry.msg}${extra}`.slice(0, 260);
  hudEl.appendChild(line);
  while (hudEl.childNodes.length > HUD_MAX_LINES) hudEl.removeChild(hudEl.firstChild);
}

/**
 * @param {string} cat
 * @param {string} msg
 * @param {unknown} [data]
 */
export function wrrapdTrace(cat, msg, data) {
  try {
    if (typeof window === 'undefined') return;
    if (!window.__WRRAPD_TRACE__) window.__WRRAPD_TRACE__ = [];
    const entry = {
      ts: new Date().toISOString(),
      cat,
      msg,
      href: String(window.location.href || '').slice(0, 300),
    };
    if (data !== undefined) entry.data = safeData(data);
    window.__WRRAPD_TRACE__.push(entry);
    while (window.__WRRAPD_TRACE__.length > MAX_TRACE) window.__WRRAPD_TRACE__.shift();
    appendDebugHud(entry);
    try {
      if (
        typeof console !== 'undefined' &&
        console.warn &&
        (window.__WRRAPD_LOG_VERBOSE__ === true ||
          localStorage.getItem('wrrapd-trace') === '1' ||
          localStorage.getItem('wrrapd-debug-checkout') === '1')
      ) {
        console.warn('[Wrrapd]', cat, msg, entry.data);
      }
    } catch (_) {
      /* ignore */
    }
  } catch (_) {
    /* ignore */
  }
}

export function wrrapdTraceEnableHud() {
  window.__WRRAPD_DEBUG_UI__ = true;
}

/**
 * @param {{ tag?: string }} [opts]
 */
export function initWrrapdCheckoutDebug(opts) {
  if (typeof window === 'undefined') return;
  const tag = (opts && opts.tag) || window.__WRRAPD_CONTENT_BUILD_TAG__ || '?';
  window.wrrapdDumpTrace = () => JSON.stringify(window.__WRRAPD_TRACE__ || [], null, 2);
  window.wrrapdClearTrace = () => {
    window.__WRRAPD_TRACE__ = [];
    if (hudEl && hudEl.parentNode) hudEl.textContent = '';
  };
  window.wrrapdTraceEnableHud = wrrapdTraceEnableHud;
  window.wrrapdTrace = wrrapdTrace;
  wrrapdTrace('init', 'wrrapd checkout debug ready', { tag });
}
