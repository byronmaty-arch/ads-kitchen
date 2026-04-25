// --- In-memory per-user/per-IP rate limiter ---
// Usage: app.use('/api/reports', createRateLimiter({ windowMs: 60_000, max: 60 }))

function createRateLimiter({ windowMs = 60_000, max = 60, message = 'Too many requests, slow down.' } = {}) {
  const hits = new Map(); // key -> [timestamps]

  // Periodic cleanup
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of hits) {
      const recent = arr.filter(t => now - t < windowMs);
      if (recent.length === 0) hits.delete(k);
      else hits.set(k, recent);
    }
  }, Math.max(windowMs, 30_000));
  if (interval.unref) interval.unref();

  return function rateLimit(req, res, next) {
    const userKey = req.user && req.user.staffId ? `u:${req.user.staffId}` : null;
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
    const key = userKey || `ip:${ip}`;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) {
      const retryAfter = Math.ceil((arr[0] + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(retryAfter, 1)));
      return res.status(429).json({ error: message });
    }
    arr.push(now);
    hits.set(key, arr);
    next();
  };
}

module.exports = { createRateLimiter };
