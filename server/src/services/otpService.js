import { randomInt, createHash } from 'crypto';
import OtpCode from '../models/OtpCode.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hash(code) {
  return createHash('sha256').update(code).digest('hex');
}

export async function issue(email, purpose) {
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const normalized = email.toLowerCase();
  const filter = { email: normalized, purpose };
  const update = {
    codeHash: hash(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    consumedAt: null,
    attempts: 0,
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
  const doc = await OtpCode.findOne({ email: normalized, purpose });
  if (!doc || doc.consumedAt || doc.expiresAt < new Date() || doc.attempts >= MAX_ATTEMPTS) {
    return false;
  }
  if (doc.codeHash !== hash(code)) {
    await OtpCode.updateOne({ _id: doc._id }, { $inc: { attempts: 1 } });
    return false;
  }
  await OtpCode.updateOne({ _id: doc._id }, { consumedAt: new Date() });
  return true;
}
