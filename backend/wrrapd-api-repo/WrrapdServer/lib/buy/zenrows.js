/**
 * Fetches a public product page through ZenRows when a direct request does not
 * return the item. The key stays in the request and is never written into errors.
 */

const MAX_BYTES = 3 * 1024 * 1024;

async function fetchHtml(url, deps) {
    const key = process.env.ZENROWS_API_KEY;
    if (!key) return { ok: false, reason: 'zenrows_not_configured' };
    const api = new URL('https://api.zenrows.com/v1/');
    api.searchParams.set('apikey', key);
    api.searchParams.set('url', url);
    api.searchParams.set('js_render', 'true');
    api.searchParams.set('premium_proxy', 'true');
    const doFetch = (deps && deps.fetch) || fetch;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
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

module.exports = { fetchHtml };
