import { httpError } from './errorHandler.js';

export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return next(httpError(403, 'FORBIDDEN', 'Admin access required'));
  next();
}
