const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 5;
const hits = new Map();

export function emailThrottle(req, res, next) {
  const email = (req.body?.email || 'unknown').toLowerCase();
  const key = `${req.ip}:${email}`;
  const now = Date.now();
  const timestamps = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= LIMIT) {
    const retryAfterMs = WINDOW_MS - (now - timestamps[0]);
    res.set('Retry-After', Math.ceil(retryAfterMs / 1000).toString());
    return res.status(429).json({ error: 'Too many requests. Try again later.', code: 'RATE_LIMITED' });
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  next();
}
