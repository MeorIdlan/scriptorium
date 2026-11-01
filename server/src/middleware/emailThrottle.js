import { clientIp, ipBucket } from '../utils/clientIp.js';
import { httpError } from './errorHandler.js';

const MAX_EMAIL_LENGTH = 254;
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
  // Check the email before storing anything, so junk can't fill the store.
  const raw = req.body?.email;
  if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) {
    return next(httpError(400, 'MISSING_FIELD', 'email is required'));
  }
  if (typeof raw !== 'string' || raw.trim().length > MAX_EMAIL_LENGTH) {
    return next(httpError(400, 'INVALID_FIELD', 'email is invalid'));
  }
  const email = raw.trim().toLowerCase();
  const bucket = ipBucket(clientIp(req));
  // '|' can't appear in an address or bucket, so the two keys never collide.
  const emailKey = `e|${bucket}|${email}`;
  const ipKey = `i|${bucket}`;
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
