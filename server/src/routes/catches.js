import { Router } from 'express';
import CatchModel from '../models/Catch.js';
import { httpError } from '../middleware/errorHandler.js';
import { loadWork } from '../middleware/loadWork.js';

const router = Router({ mergeParams: true });
router.use(loadWork);

function shortId() {
  return Math.random().toString(36).substring(2, 7);
}

// GET /api/works/:workId/catches
router.get('/', async (req, res, next) => {
  try {
    const { workId } = req.params;

    const filter = { workId };
    if (req.query.status) filter.status = req.query.status;

    const catches = await CatchModel.find(filter).sort({ createdAt: 1 });
    res.json(catches);
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/catches
router.post('/', async (req, res, next) => {
  try {
    const { workId } = req.params;

    const { content, capturedDuringChapterId, taggedChapterId } = req.body;
    if (!content) return next(httpError(400, 'MISSING_FIELD', 'content is required'));

    const now = new Date().toISOString();
    const catchItem = await CatchModel.create({
      _id: `catch_${shortId()}`,
      workId,
      content,
      capturedDuringChapterId: capturedDuringChapterId || null,
      taggedChapterId: taggedChapterId || null,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json(catchItem);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/catches/:catchId
router.put('/:catchId', async (req, res, next) => {
  try {
    const { workId, catchId } = req.params;
    const update = { ...req.body, updatedAt: new Date().toISOString() };
    delete update.id;
    delete update.workId;

    const updated = await CatchModel.findOneAndUpdate({ _id: catchId, workId }, { $set: update }, { new: true });
    if (!updated) return next(httpError(404, 'NOT_FOUND', 'Catch not found'));
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/works/:workId/catches/:catchId
router.delete('/:catchId', async (req, res, next) => {
  try {
    const { workId, catchId } = req.params;
    const deleted = await CatchModel.findOneAndDelete({ _id: catchId, workId });
    if (!deleted) return next(httpError(404, 'NOT_FOUND', 'Catch not found'));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
