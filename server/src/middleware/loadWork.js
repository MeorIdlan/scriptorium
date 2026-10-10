import Work from '../models/Work.js';
import { httpError } from './errorHandler.js';

function findOwnedWork(workId, userId) {
  if (typeof workId !== 'string' || !workId) return null;
  return Work.findOne({ _id: workId, ownerId: userId });
}

export async function loadWork(req, res, next) {
  try {
    const work = await findOwnedWork(req.params.workId, req.user.id);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
    req.work = work;
    next();
  } catch (err) {
    next(err);
  }
}

// For routes that take workId in the JSON body (e.g. /api/ai/*). With
// { optional: true }, a missing workId passes through with req.work unset;
// a workId that isn't the user's still 404s.
export function loadWorkFromBody({ optional = false } = {}) {
  return async (req, res, next) => {
    try {
      const { workId } = req.body || {};
      if (!workId) {
        if (optional) return next();
        return next(httpError(400, 'MISSING_FIELD', 'workId is required'));
      }
      const work = await findOwnedWork(workId, req.user.id);
      if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
      req.work = work;
      next();
    } catch (err) {
      next(err);
    }
  };
}
