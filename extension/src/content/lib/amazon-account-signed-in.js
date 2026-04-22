/**
 * Amazon top nav: signed-out shows "Hello, sign in" on #nav-link-accountList-nav-line-1;
 * signed-in shows "Hello, &lt;FirstName&gt;". Wrrapd checkout UI should run only when signed in.
 */

function readAmazonAccountNavLine1Text() {
  const byId = document.querySelector('#nav-link-accountList-nav-line-1');
  if (byId && (byId.textContent || '').trim()) return (byId.textContent || '').replace(/\s+/g, ' ').trim();
  const scope = document.querySelector('#nav-link-accountList');
  const inner = scope?.querySelector('span.nav-line-1.nav-progressive-content');
  if (inner && (inner.textContent || '').trim()) return (inner.textContent || '').replace(/\s+/g, ' ').trim();
  return '';
}

export function wrrapdIsAmazonAccountSignedIn() {
  const t = readAmazonAccountNavLine1Text();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (/\bhello\s*,\s*sign\s+in\b/i.test(t)) return false;
  if (lower.includes('sign in') && lower.includes('hello')) return false;
  if (/^hello\s*,/i.test(t)) return true;
  return false;
}

if (typeof window !== 'undefined') {
  window.wrrapdIsAmazonAccountSignedIn = wrrapdIsAmazonAccountSignedIn;
}
