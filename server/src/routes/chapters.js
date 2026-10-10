import { Router } from 'express';
import Chapter from '../models/Chapter.js';
import Work from '../models/Work.js';
import { httpError } from '../middleware/errorHandler.js';
import { countWords, recalculate } from '../services/wordCountService.js';
import { scan } from '../services/consistencyService.js';
import { sanitizeChapterHtml } from '../services/htmlService.js';
import { loadWork } from '../middleware/loadWork.js';

const router = Router({ mergeParams: true });
router.use(loadWork);

// Autosave runs every few seconds, so keep at most one snapshot per interval
const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
const MAX_SNAPSHOTS = 50;

function snapshotOf(chapter, savedAt) {
  return {
    savedAt,
    wordCount: chapter.wordCount || 0,
    contentSnapshot: chapter.content,
    htmlSnapshot: chapter.contentHtml,
  };
}

function snapshotDue(chapter, now) {
  const last = chapter.draftHistory?.[chapter.draftHistory.length - 1];
  if (!last?.savedAt) return true;
  return new Date(now) - new Date(last.savedAt) >= SNAPSHOT_INTERVAL_MS;
}

// GET /api/works/:workId/chapters
router.get('/', async (req, res, next) => {
  try {
    const { workId } = req.params;

    const chapters = await Chapter.find({ workId }).select('-content -contentHtml -draftHistory').sort({ order: 1 });
    res.json(chapters);
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/chapters
router.post('/', async (req, res, next) => {
  try {
    const { workId } = req.params;

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

    const chapters = await Chapter.find({ workId }).select('-content -contentHtml -draftHistory').sort({ order: 1 });
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
    const newHtml =
      req.body.contentHtml !== undefined ? sanitizeChapterHtml(req.body.contentHtml) : chapter.contentHtml;
    const contentChanged =
      (chapter.content || '') !== newContent || (chapter.contentHtml || '') !== (newHtml || '');

    const setFields = { ...req.body, content: newContent, contentHtml: newHtml, wordCount: words, updatedAt: now };
    delete setFields.id;
    delete setFields.workId;
    delete setFields.draftHistory;
    if (chapter.status === 'outline' && words > 0 && req.body.status === undefined) {
      setFields.status = 'draft';
    }

    const updateOp = { $set: setFields };
    if (contentChanged && chapter.content && snapshotDue(chapter, now)) {
      updateOp.$push = {
        draftHistory: { $each: [snapshotOf(chapter, now)], $slice: -MAX_SNAPSHOTS },
      };
    }

    const updated = await Chapter.findOneAndUpdate({ _id: chapterId, workId }, updateOp, { new: true });

    try {
      await scan(workId, chapterId, newContent);
    } catch (scanErr) {
      console.error('Consistency scan error:', scanErr);
    }

    await recalculate(workId);

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/chapters/:chapterId/restore
// Restores the snapshot saved at `savedAt`, snapshotting the current text first
router.post('/:chapterId/restore', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const { savedAt } = req.body;
    const chapter = await Chapter.findOne({ _id: chapterId, workId });
    if (!chapter) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));

    const entry = chapter.draftHistory.find((h) => h.savedAt === savedAt);
    if (!entry) return next(httpError(404, 'NOT_FOUND', 'Snapshot not found'));

    const now = new Date().toISOString();
    const content = entry.contentSnapshot || '';
    const updated = await Chapter.findOneAndUpdate(
      { _id: chapterId, workId },
      {
        $set: {
          content,
          contentHtml: entry.htmlSnapshot || '',
          wordCount: countWords(content),
          updatedAt: now,
        },
        $push: { draftHistory: { $each: [snapshotOf(chapter, now)], $slice: -MAX_SNAPSHOTS } },
      },
      { new: true }
    );

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
