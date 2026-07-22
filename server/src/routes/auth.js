import { Router } from 'express';
import * as authService from '../services/authService.js';
import * as webauthnService from '../services/webauthnService.js';
import * as authSessionService from '../services/authSessionService.js';
import * as auditService from '../services/auditService.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { emailThrottle } from '../middleware/emailThrottle.js';
import { httpError } from '../middleware/errorHandler.js';
import { setSessionCookie, clearSessionCookie } from '../utils/authCookie.js';

const router = Router();

router.post('/register', emailThrottle, async (req, res, next) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return next(httpError(400, 'MISSING_FIELD', 'name and email are required'));
    await authService.startRegistration(name, email);
    res.json({ message: 'Verification code sent.' });
  } catch (err) {
    next(err);
  }
});

router.post('/recover', emailThrottle, async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return next(httpError(400, 'MISSING_FIELD', 'email is required'));
    await authService.startRecovery(email);
    res.json({ message: 'Verification code sent.' });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-otp', async (req, res, next) => {
  try {
    const { email, code, purpose } = req.body;
    if (!email || !code || !purpose) {
      return next(httpError(400, 'MISSING_FIELD', 'email, code, and purpose are required'));
    }
    const token = await authService.verifyOtp(email, code, purpose);
    setSessionCookie(res, token, 'pending_passkey');
    res.json({ scope: 'pending_passkey' });
  } catch (err) {
    next(err);
  }
});

router.post('/passkey/options', requireAuth({ allowPending: true }), async (req, res, next) => {
  try {
    const options = await webauthnService.registrationOptions(req.user.id, req.user.email);
    res.json(options);
  } catch (err) {
    next(err);
  }
});

router.post('/passkey/verify', requireAuth({ allowPending: true }), async (req, res, next) => {
  try {
    const { response, deviceLabel } = req.body;
    const cred = await webauthnService.verifyRegistration(req.user.id, response, deviceLabel || 'Passkey');
    if (req.user.scope === 'pending_passkey') {
      await authSessionService.upgrade(req.user.sessionId);
      setSessionCookie(res, req.cookies.sid, 'full');
    }
    await auditService.log({ userId: req.user.id, action: 'passkey.added', metadata: { deviceLabel: cred.deviceLabel } });
    res.status(201).json({ id: cred._id, deviceLabel: cred.deviceLabel, createdAt: cred.createdAt });
  } catch (err) {
    next(err);
  }
});

router.post('/login/options', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return next(httpError(400, 'MISSING_FIELD', 'email is required'));
    res.json(await webauthnService.authenticationOptions(email));
  } catch (err) {
    next(err);
  }
});

router.post('/login/verify', async (req, res, next) => {
  try {
    const { challengeId, response } = req.body;
    if (!challengeId || !response) {
      return next(httpError(400, 'MISSING_FIELD', 'challengeId and response are required'));
    }
    const userId = await webauthnService.verifyAuthentication(challengeId, response);
    const token = await authSessionService.create(userId, 'full');
    setSessionCookie(res, token, 'full');
    await auditService.log({ userId, action: 'auth.login' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth({ allowPending: true }), async (req, res, next) => {
  try {
    await authSessionService.destroy(req.cookies.sid);
    clearSessionCookie(res);
    await auditService.log({ userId: req.user.id, action: 'auth.logout' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth({ allowPending: true }), (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, scope: req.user.scope, isAdmin: req.user.isAdmin });
});

router.get('/passkeys', requireAuth(), async (req, res, next) => {
  try {
    res.json(await webauthnService.listCredentials(req.user.id));
  } catch (err) {
    next(err);
  }
});

router.delete('/passkeys/:credentialId', requireAuth(), async (req, res, next) => {
  try {
    await webauthnService.deleteCredential(req.user.id, req.params.credentialId);
    await auditService.log({ userId: req.user.id, action: 'passkey.removed', metadata: { credentialId: req.params.credentialId } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
