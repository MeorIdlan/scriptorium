import { Router } from 'express';
import Session from '../models/Session.js';
import Work from '../models/Work.js';
import { httpError } from '../middleware/errorHandler.js';

const router = Router({ mergeParams: true });

function shortId() {
  return Math.random().toString(36).substring(2, 7);
}

// GET /api/works/:workId/sessions/latest
router.get('/latest', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const latest = await Session.findOne({ workId }).sort({ startedAt: -1 });
    res.json(latest || null);
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/sessions
router.post('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const { chapterId, wordsAtStart, rekindlerSnapshot } = req.body;
    const now = new Date().toISOString();

    const session = await Session.create({
      _id: `sess_${shortId()}`,
      workId,
      chapterId: chapterId || null,
      wordsAtStart: wordsAtStart || 0,
      wordsAtEnd: null,
      wordsWritten: null,
      rekindlerSnapshot: rekindlerSnapshot || null,
      startedAt: now,
      endedAt: null,
    });

    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/sessions/:sessionId/end
router.put('/:sessionId/end', async (req, res, next) => {
  try {
    const { workId, sessionId } = req.params;
    const { wordsAtEnd } = req.body;
    const now = new Date().toISOString();

    const session = await Session.findOne({ _id: sessionId, workId });
    if (!session) return next(httpError(404, 'NOT_FOUND', 'Session not found'));

    const wordsWritten = (wordsAtEnd || 0) - (session.wordsAtStart || 0);
    const updated = await Session.findOneAndUpdate(
      { _id: sessionId, workId },
      { $set: { wordsAtEnd: wordsAtEnd || 0, wordsWritten, endedAt: now } },
      { new: true }
    );

    await Work.findByIdAndUpdate(workId, { lastTouched: now, updatedAt: now });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
