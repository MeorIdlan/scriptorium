import { Router } from 'express';
import { readJSON, writeJSON, exists } from '../services/fileService.js';
import { httpError } from '../middleware/errorHandler.js';

const router = Router({ mergeParams: true });

function shortId() {
  return Math.random().toString(36).substring(2, 7);
}

// GET /api/works/:workId/sessions/latest
router.get('/latest', (req, res, next) => {
  try {
    const { workId } = req.params;
    if (!exists(`works/${workId}`)) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const sessions = readJSON(`works/${workId}/sessions.json`) || [];
    const latest = sessions.length > 0 ? sessions[sessions.length - 1] : null;
    res.json(latest);
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/sessions
router.post('/', (req, res, next) => {
  try {
    const { workId } = req.params;
    if (!exists(`works/${workId}`)) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const { chapterId, wordsAtStart, rekindlerSnapshot } = req.body;
    const now = new Date().toISOString();

    const session = {
      id: `sess_${shortId()}`,
      workId,
      chapterId: chapterId || null,
      wordsAtStart: wordsAtStart || 0,
      wordsAtEnd: null,
      wordsWritten: null,
      rekindlerSnapshot: rekindlerSnapshot || null,
      startedAt: now,
      endedAt: null,
    };

    const sessions = readJSON(`works/${workId}/sessions.json`) || [];
    sessions.push(session);
    writeJSON(`works/${workId}/sessions.json`, sessions);

    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/sessions/:sessionId/end
router.put('/:sessionId/end', (req, res, next) => {
  try {
    const { workId, sessionId } = req.params;
    const { wordsAtEnd } = req.body;

    const sessions = readJSON(`works/${workId}/sessions.json`) || [];
    const idx = sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) return next(httpError(404, 'NOT_FOUND', 'Session not found'));

    const now = new Date().toISOString();
    const wordsWritten = (wordsAtEnd || 0) - (sessions[idx].wordsAtStart || 0);

    sessions[idx] = {
      ...sessions[idx],
      wordsAtEnd: wordsAtEnd || 0,
      wordsWritten,
      endedAt: now,
    };

    writeJSON(`works/${workId}/sessions.json`, sessions);

    // Update meta lastTouched
    const meta = readJSON(`works/${workId}/meta.json`);
    if (meta) {
      meta.lastTouched = now;
      meta.updatedAt = now;
      writeJSON(`works/${workId}/meta.json`, meta);
    }

    res.json(sessions[idx]);
  } catch (err) {
    next(err);
  }
});

export default router;
