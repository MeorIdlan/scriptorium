import { clientIp } from '../utils/clientIp.js';

const WINDOW_MS = 60 * 60 * 1000;
const SWEEP_EVERY_MS = 10 * 60 * 1000;
const PER_EMAIL_LIMIT = 5;
const PER_IP_LIMIT = 10;
const hits = new Map();
let lastSweep = 0;

function recentHits(key, now) {
  return (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
}

// Drop keys whose newest hit has left the window, at most once per
// SWEEP_EVERY_MS, so per-client keys don't pile up forever.
function sweep(now) {
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  for (const [key, times] of hits) {
    if (now - times[times.length - 1] >= WINDOW_MS) hits.delete(key);
  }
}

export function emailThrottle(req, res, next) {
  const now = Date.now();
  sweep(now);
  const ip = clientIp(req);
  const email = (req.body?.email || 'unknown').toLowerCase();
  const emailKey = `${ip}:${email}`;
  const ipKey = `${ip}:*`;
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

// Test hooks.
export function resetEmailThrottle() {
  hits.clear();
  lastSweep = 0;
}

export function throttleSize() {
  return hits.size;
}
