/**
 * Fetches a public product page through ZenRows when a direct request does not
 * return the item. The key stays in the request and is never written into errors.
 */

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 90000;
// Kohl's and similar pages never go network-idle, so ZenRows cancels them
// (CTX0001) unless it is told to stop once the product heading renders.
const WAIT_FOR = 'h1';
const RETRY_MIN_MS = 20000;

async function fetchOnce(url, doFetch, waitFor, ms) {
    const key = process.env.ZENROWS_API_KEY;
    const api = new URL('https://api.zenrows.com/v1/');
    api.searchParams.set('apikey', key);
    api.searchParams.set('url', url);
    api.searchParams.set('js_render', 'true');
    api.searchParams.set('premium_proxy', 'true');
    api.searchParams.set('proxy_country', 'us');
    if (waitFor) api.searchParams.set('wait_for', waitFor);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        const resp = await doFetch(api, { signal: ctrl.signal });
        if (!resp.ok) return { ok: false, reason: `zenrows_http_${resp.status}` };
        const buf = Buffer.from(await resp.arrayBuffer());
        const html = buf.subarray(0, MAX_BYTES).toString('utf8');
        if (html.length < 500) return { ok: false, reason: 'zenrows_empty' };
        const finalUrl = resp.headers.get('zr-final-url') || url;
        return { ok: true, html, finalUrl };
    } catch (e) {
        const aborted = e && (e.name === 'AbortError' || /abort/i.test(String(e.message || '')));
        return { ok: false, reason: aborted ? 'zenrows_timeout' : 'zenrows_failed' };
    } finally {
        clearTimeout(timer);
    }
}

async function fetchHtml(url, deps) {
    if (!process.env.ZENROWS_API_KEY) return { ok: false, reason: 'zenrows_not_configured' };
    const doFetch = (deps && deps.fetch) || fetch;
    const started = Date.now();
    const first = await fetchOnce(url, doFetch, WAIT_FOR, TIMEOUT_MS);
    if (first.ok || first.reason === 'zenrows_timeout') return first;
    const left = TIMEOUT_MS - (Date.now() - started);
    if (left < RETRY_MIN_MS) return first;
    const second = await fetchOnce(url, doFetch, '', left);
    return second.ok ? second : first;
}

module.exports = { fetchHtml, TIMEOUT_MS, WAIT_FOR };
