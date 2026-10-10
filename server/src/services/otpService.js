import { randomInt, createHash } from 'crypto';
import OtpCode from '../models/OtpCode.js';

const OTP_TTL_MS = 10 * 60 * 1000;
// Wrong guesses are capped per email + purpose over this window, not per code,
// so requesting a fresh code doesn't buy more guesses.
const ATTEMPT_WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hash(code) {
  return createHash('sha256').update(code).digest('hex');
}

function windowExpired(doc, now) {
  return doc.attemptsWindowStart && now - doc.attemptsWindowStart >= ATTEMPT_WINDOW_MS;
}

export async function issue(email, purpose) {
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const normalized = email.toLowerCase();
  const filter = { email: normalized, purpose };
  const now = new Date();
  const codeExpiresAt = new Date(now.getTime() + OTP_TTL_MS);

  const existing = await OtpCode.findOne(filter);
  const keepWindow = existing?.attemptsWindowStart && !windowExpired(existing, now);
  const windowStart = keepWindow ? existing.attemptsWindowStart : now;
  const update = {
    codeHash: hash(code),
    codeExpiresAt,
    expiresAt: new Date(Math.max(codeExpiresAt.getTime(), windowStart.getTime() + ATTEMPT_WINDOW_MS)),
    consumedAt: null,
    ...(keepWindow ? {} : { attempts: 0, attemptsWindowStart: now }),
  };
  try {
    await OtpCode.findOneAndUpdate(filter, update, { upsert: true });
  } catch (err) {
    if (err.code === 11000) {
      await OtpCode.findOneAndUpdate(filter, update);
    } else {
      throw err;
    }
  }
  return code;
}

export async function verify(email, purpose, code) {
  const normalized = email.toLowerCase();
  const now = new Date();
  const doc = await OtpCode.findOne({ email: normalized, purpose });
  if (!doc || doc.consumedAt || (doc.codeExpiresAt ?? doc.expiresAt) < now) return false;

  if (windowExpired(doc, now)) {
    await OtpCode.updateOne(
      { _id: doc._id, attemptsWindowStart: doc.attemptsWindowStart },
      {
        attempts: 0,
        attemptsWindowStart: now,
        expiresAt: new Date(Math.max(doc.expiresAt.getTime(), now.getTime() + ATTEMPT_WINDOW_MS)),
      }
    );
  }

  // Count the guess before checking it, so parallel requests can't exceed the cap.
  const reserved = await OtpCode.findOneAndUpdate(
    { _id: doc._id, consumedAt: null, attempts: { $lt: MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } }
  );
  if (!reserved || reserved.codeHash !== hash(code)) return false;

  await OtpCode.updateOne({ _id: doc._id }, { consumedAt: now, attempts: 0, attemptsWindowStart: null });
  return true;
}
