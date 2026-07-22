import { Router } from 'express';
import Chapter from '../models/Chapter.js';
import Work from '../models/Work.js';
import { httpError } from '../middleware/errorHandler.js';
import { countWords, recalculate } from '../services/wordCountService.js';

const router = Router({ mergeParams: true });

// GET /api/works/:workId/chapters
router.get('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const chapters = await Chapter.find({ workId }).select('-content -draftHistory').sort({ order: 1 });
    res.json(chapters);
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/chapters
router.post('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const { title, order } = req.body;
    if (!title) return next(httpError(400, 'MISSING_FIELD', 'title is required'));

    const now = new Date().toISOString();
    const id = `ch_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
    const chapterCount = await Chapter.countDocuments({ workId });
    const chOrder = order !== undefined ? order : chapterCount;
    const number = chapterCount + 1;

    const chapter = await Chapter.create({
      _id: id,
      workId,
      number,
      title,
      order: chOrder,
      content: '',
      wordCount: 0,
      draftHistory: [],
      status: 'outline',
      notes: '',
      createdAt: now,
      lastEditedAt: now,
    });

    await Work.findByIdAndUpdate(workId, {
      chapterCount: chapterCount + 1,
      lastTouched: now,
      updatedAt: now,
    });

    res.status(201).json(chapter);
  } catch (err) {
    next(err);
  }
});

// PUT /reorder — must be before /:chapterId to avoid route collision
router.put('/reorder', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const { order } = req.body;
    if (!Array.isArray(order)) return next(httpError(400, 'MISSING_FIELD', 'order array is required'));

    const ops = order.map((chapterId, pos) => ({
      updateOne: {
        filter: { _id: chapterId, workId },
        update: { $set: { order: pos } },
      },
    }));
    if (ops.length > 0) await Chapter.bulkWrite(ops);

    const chapters = await Chapter.find({ workId }).select('-content -draftHistory').sort({ order: 1 });
    res.json(chapters);
  } catch (err) {
    next(err);
  }
});

// GET /api/works/:workId/chapters/:chapterId
router.get('/:chapterId', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const chapter = await Chapter.findOne({ _id: chapterId, workId });
    if (!chapter) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));
    res.json(chapter);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/chapters/:chapterId
router.put('/:chapterId', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const chapter = await Chapter.findOne({ _id: chapterId, workId });
    if (!chapter) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));

    const now = new Date().toISOString();
    const newContent = req.body.content !== undefined ? req.body.content : chapter.content;
    const words = countWords(newContent);
    const contentChanged = chapter.content !== undefined && chapter.content !== newContent;

    const setFields = { ...req.body, content: newContent, wordCount: words, updatedAt: now };
    delete setFields.id;
    delete setFields.workId;
    delete setFields.draftHistory;

    const updateOp = { $set: setFields };
    if (contentChanged) {
      updateOp.$push = {
        draftHistory: {
          $each: [{ savedAt: now, wordCount: chapter.wordCount || 0, contentSnapshot: chapter.content }],
          $slice: -10,
        },
      };
    }

    const updated = await Chapter.findOneAndUpdate({ _id: chapterId, workId }, updateOp, { new: true });

    await recalculate(workId);

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/works/:workId/chapters/:chapterId
router.delete('/:chapterId', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const deleted = await Chapter.findOneAndDelete({ _id: chapterId, workId });
    if (!deleted) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));

    const now = new Date().toISOString();
    const chapterCount = await Chapter.countDocuments({ workId });
    await Work.findByIdAndUpdate(workId, { chapterCount, updatedAt: now });

    await recalculate(workId);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
