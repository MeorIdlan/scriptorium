const WINDOW_MS = 60 * 60 * 1000;
const PER_EMAIL_LIMIT = 5;
const PER_IP_LIMIT = 10;
const hits = new Map();

function recentHits(key, now) {
  return (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
}

export function emailThrottle(req, res, next) {
  const email = (req.body?.email || 'unknown').toLowerCase();
  const emailKey = `${req.ip}:${email}`;
  const ipKey = `${req.ip}:*`;
  const now = Date.now();
  const emailHits = recentHits(emailKey, now);
  const ipHits = recentHits(ipKey, now);

  const blocked = emailHits.length >= PER_EMAIL_LIMIT ? emailHits : ipHits.length >= PER_IP_LIMIT ? ipHits : null;
  if (blocked) {
    const retryAfterMs = WINDOW_MS - (now - blocked[0]);
    res.set('Retry-After', Math.ceil(retryAfterMs / 1000).toString());
    return res.status(429).json({ error: 'Too many requests. Try again later.', code: 'RATE_LIMITED' });
  }

  emailHits.push(now);
  ipHits.push(now);
  hits.set(emailKey, emailHits);
  hits.set(ipKey, ipHits);
  next();
}
