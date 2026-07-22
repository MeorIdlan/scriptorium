import { randomBytes, createHash } from 'crypto';
import AuthSession from '../models/AuthSession.js';

const PENDING_TTL_MS = 15 * 60 * 1000;

function getFullTtlMs() {
  const days = parseInt(process.env.SESSION_TTL_DAYS || '30', 10);
  return days * 24 * 60 * 60 * 1000;
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function create(userId, scope) {
  const token = randomBytes(32).toString('base64url');
  const ttl = scope === 'full' ? getFullTtlMs() : PENDING_TTL_MS;
  await AuthSession.create({
    tokenHash: hashToken(token),
    userId,
    scope,
    expiresAt: new Date(Date.now() + ttl),
  });
  return token;
}

export async function validate(token) {
  const session = await AuthSession.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;

  let renewed = false;
  if (session.scope === 'full') {
    const fullTtlMs = getFullTtlMs();
    const remainingMs = session.expiresAt.getTime() - Date.now();
    if (remainingMs < fullTtlMs / 2) {
      await AuthSession.updateOne({ _id: session._id }, { expiresAt: new Date(Date.now() + fullTtlMs) });
      renewed = true;
    }
  }

  return {
    sessionId: session._id.toString(),
    userId: session.userId,
    scope: session.scope,
    renewed,
  };
}

export async function upgrade(sessionId) {
  await AuthSession.updateOne(
    { _id: sessionId },
    { scope: 'full', expiresAt: new Date(Date.now() + getFullTtlMs()) }
  );
}

export async function destroy(token) {
  await AuthSession.deleteOne({ tokenHash: hashToken(token) });
}

export function pendingTtlMs() {
  return PENDING_TTL_MS;
}

export function fullTtlMs() {
  return getFullTtlMs();
}
