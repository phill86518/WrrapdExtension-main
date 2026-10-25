/**
 * GA4 Measurement Protocol — server-side only.
 * Set GA4_MEASUREMENT_ID + GA4_API_SECRET in .env. No-op when blank.
 */

function configured() {
    const measurementId = String(process.env.GA4_MEASUREMENT_ID || '').trim();
    const apiSecret = String(process.env.GA4_API_SECRET || '').trim();
    if (!measurementId || !apiSecret) return null;
    if (!/^G-[A-Z0-9]+$/i.test(measurementId)) return null;
    return { measurementId, apiSecret };
}

/**
 * @param {{ name: string, clientId: string, params?: Record<string, string|number|boolean> }} opts
 * @returns {Promise<boolean>}
 */
async function sendEvent({ name, clientId, params }) {
    const cfg = configured();
    if (!cfg) return false;
    const id = String(clientId || '').trim();
    const eventName = String(name || '').trim();
    if (!id || !eventName) return false;

    const url =
        'https://www.google-analytics.com/mp/collect' +
        `?measurement_id=${encodeURIComponent(cfg.measurementId)}` +
        `&api_secret=${encodeURIComponent(cfg.apiSecret)}`;

    const body = {
        client_id: id,
        events: [
            {
                name: eventName.slice(0, 40),
                params: {
                    engagement_time_msec: 1,
                    ...(params && typeof params === 'object' ? params : {}),
                },
            },
        ],
    };

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return res.ok || res.status === 204;
    } catch (_) {
        return false;
    }
}

/** Fire-and-forget from extension heartbeat. */
function trackExtensionHeartbeat({ installId, extensionVersion, isNew }) {
    const clientId = String(installId || '').trim();
    if (!clientId) return;
    const params = {
        extension_version: String(extensionVersion || '').slice(0, 20),
    };
    const jobs = [sendEvent({ name: 'extension_heartbeat', clientId, params })];
    if (isNew) {
        jobs.push(sendEvent({ name: 'extension_first_open', clientId, params }));
    }
    Promise.all(jobs).catch(() => {});
}

module.exports = { configured, sendEvent, trackExtensionHeartbeat };
