import { fullTtlMs, pendingTtlMs } from '../services/authSessionService.js';

export function setSessionCookie(res, token, scope) {
  const maxAge = scope === 'full' ? fullTtlMs() : pendingTtlMs();
  res.cookie('sid', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie('sid', { path: '/' });
}
