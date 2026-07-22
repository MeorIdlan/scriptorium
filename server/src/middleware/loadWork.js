import Work from '../models/Work.js';
import { httpError } from './errorHandler.js';

export async function loadWork(req, res, next) {
  try {
    const work = await Work.findOne({ _id: req.params.workId, ownerId: req.user.id });
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
    req.work = work;
    next();
  } catch (err) {
    next(err);
  }
}
