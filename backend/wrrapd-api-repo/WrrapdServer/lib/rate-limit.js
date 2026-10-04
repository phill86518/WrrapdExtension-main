/**
 * Fixed-window per-IP rate limiter (in memory). PM2 runs wrrapd-server as a single fork
 * process, so one map covers every request.
 */

function rateLimit({ name, windowMs, max }) {
    const hits = new Map();
    setInterval(() => {
        const now = Date.now();
        for (const [ip, row] of hits) if (row.resetAt <= now) hits.delete(ip);
    }, Math.max(windowMs, 60000)).unref();

    return function rateLimitMiddleware(req, res, next) {
        if (req.method === 'OPTIONS') return next();
        const ip = String(req.ip || 'unknown');
        const now = Date.now();
        let row = hits.get(ip);
        if (!row || row.resetAt <= now) {
            row = { count: 0, resetAt: now + windowMs };
            hits.set(ip, row);
        }
        row.count += 1;
        if (row.count > max) {
            const retrySec = Math.ceil((row.resetAt - now) / 1000);
            if (row.count === max + 1) console.warn(`[rate-limit:${name}] ${ip} over ${max}/${windowMs / 1000}s`);
            res.set('Retry-After', String(retrySec));
            return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
        }
        return next();
    };
}

module.exports = { rateLimit };
