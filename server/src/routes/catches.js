import { Router } from 'express';
import CatchModel from '../models/Catch.js';
import Chapter from '../models/Chapter.js';
import { httpError } from '../middleware/errorHandler.js';
import { loadWork } from '../middleware/loadWork.js';
import { stampContentChange } from '../middleware/stampContentChange.js';
import { catchContent, catchTag, catchUpdate, newCatchId } from '../services/catchFields.js';

const router = Router({ mergeParams: true });
router.use(stampContentChange);
router.use(loadWork);

const invalid = (message) => httpError(400, 'INVALID_FIELD', message);

async function chapterOfWork(workId, chapterId) {
  return typeof chapterId === 'string' && Boolean(await Chapter.exists({ _id: chapterId, workId }));
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

    const content = catchContent(req.body.content);
    if (!content.ok) return next(invalid(content.message));
    const tag = catchTag(req.body.taggedChapterId);
    if (!tag.ok) return next(invalid(tag.message));
    if (tag.value && !(await chapterOfWork(workId, tag.value))) {
      return next(invalid('taggedChapterId is not a chapter of this work'));
    }
    const during = (await chapterOfWork(workId, req.body.capturedDuringChapterId))
      ? req.body.capturedDuringChapterId
      : null;

    const now = new Date().toISOString();
    const catchItem = await CatchModel.create({
      _id: newCatchId(),
      workId,
      content: content.value,
      capturedDuringChapterId: during,
      taggedChapterId: tag.value,
      status: 'open',
      usedAs: null,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json(catchItem);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/catches/:catchId — only content, tag, status and usedAs
router.put('/:catchId', async (req, res, next) => {
  try {
    const { workId, catchId } = req.params;

    const update = catchUpdate(req.body);
    if (!update.ok) return next(invalid(update.message));
    if (update.set.taggedChapterId && !(await chapterOfWork(workId, update.set.taggedChapterId))) {
      return next(invalid('taggedChapterId is not a chapter of this work'));
    }

    const updated = await CatchModel.findOneAndUpdate(
      { _id: catchId, workId },
      { $set: { ...update.set, updatedAt: new Date().toISOString() } },
      { new: true }
    );
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
