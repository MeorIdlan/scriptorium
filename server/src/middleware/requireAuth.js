import * as authSessionService from '../services/authSessionService.js';
import User from '../models/User.js';
import { httpError } from './errorHandler.js';
import { setSessionCookie } from '../utils/authCookie.js';

export function requireAuth({ allowPending = false } = {}) {
  return async function (req, res, next) {
    try {
      const token = req.cookies?.sid;
      if (!token) return next(httpError(401, 'UNAUTHORIZED', 'Not authenticated'));

      const session = await authSessionService.validate(token);
      if (!session) return next(httpError(401, 'UNAUTHORIZED', 'Not authenticated'));

      if (session.scope !== 'full' && !allowPending) {
        return next(httpError(401, 'PASSKEY_SETUP_INCOMPLETE', 'Passkey setup incomplete'));
      }

      const user = await User.findById(session.userId);
      if (!user) return next(httpError(401, 'UNAUTHORIZED', 'Not authenticated'));

      if (session.renewed) {
        setSessionCookie(res, token, 'full');
      }

      req.user = { id: user._id, email: user.email, scope: session.scope, sessionId: session.sessionId, isAdmin: user.isAdmin };
      next();
    } catch (err) {
      next(err);
    }
  };
}
