/**
 * 3.0.10 and 3.0.11 ship the old hub (PO Box 26067). 3.0.12+ ships 150 Busch Dr.
 * Refuse those checkouts before a payment page or a charge exists.
 */

const RETIRED_HUB_RE = /p\.?\s*o\.?\s*box\s*26067/i;

const INSTALL_URL = 'https://chromewebstore.google.com/detail/wrrapd/lobngnjcjeimefihnobdmocicopikoip';

function textHasRetiredHub(value) {
    return RETIRED_HUB_RE.test(String(value || ''));
}

function checkoutQueryHasRetiredHub(req) {
    let raw = req && req.query ? req.query.data : '';
    if (Array.isArray(raw)) raw = raw[0];
    if (typeof raw !== 'string' || !raw) return false;
    try {
        return textHasRetiredHub(Buffer.from(raw, 'base64').toString('utf8'));
    } catch (_) {
        return textHasRetiredHub(raw);
    }
}

function bodyHasRetiredHub(body) {
    if (body == null) return false;
    try {
        return textHasRetiredHub(typeof body === 'string' ? body : JSON.stringify(body));
    } catch (_) {
        return false;
    }
}

function retiredExtensionHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wrrapd</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:#0c0638;font-family:system-ui,sans-serif;">
<div style="max-width:22rem;text-align:center;color:#fff;">
<p style="margin:0 0 1rem;font-size:1.15rem;line-height:1.4;">Please install the current Wrrapd extension, then try again.</p>
<a href="${INSTALL_URL}" style="display:inline-block;background:#f6b933;color:#0f0351;font-weight:700;text-decoration:none;border-radius:999px;padding:.75rem 1.25rem;">Install Wrrapd</a>
</div>
</body>
</html>`;
}

module.exports = {
    checkoutQueryHasRetiredHub,
    bodyHasRetiredHub,
    retiredExtensionHtml,
};
