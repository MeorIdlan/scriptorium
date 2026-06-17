import { Router } from 'express';
import { readJSON, writeJSON, exists } from '../services/fileService.js';
import { httpError } from '../middleware/errorHandler.js';

const router = Router({ mergeParams: true });

function shortId() {
  return Math.random().toString(36).substring(2, 7);
}

// GET /api/works/:workId/catches
router.get('/', (req, res, next) => {
  try {
    const { workId } = req.params;
    if (!exists(`works/${workId}`)) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    let catches = readJSON(`works/${workId}/catches.json`) || [];

    if (req.query.status) {
      catches = catches.filter((c) => c.status === req.query.status);
    }

    res.json(catches);
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/catches
router.post('/', (req, res, next) => {
  try {
    const { workId } = req.params;
    if (!exists(`works/${workId}`)) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const { content, capturedDuringChapterId, taggedChapterId } = req.body;
    if (!content) return next(httpError(400, 'MISSING_FIELD', 'content is required'));

    const now = new Date().toISOString();
    const catchItem = {
      id: `catch_${shortId()}`,
      content,
      capturedDuringChapterId: capturedDuringChapterId || null,
      taggedChapterId: taggedChapterId || null,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };

    const catches = readJSON(`works/${workId}/catches.json`) || [];
    catches.push(catchItem);
    writeJSON(`works/${workId}/catches.json`, catches);

    res.status(201).json(catchItem);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/catches/:catchId
router.put('/:catchId', (req, res, next) => {
  try {
    const { workId, catchId } = req.params;
    const catches = readJSON(`works/${workId}/catches.json`) || [];
    const idx = catches.findIndex((c) => c.id === catchId);
    if (idx === -1) return next(httpError(404, 'NOT_FOUND', 'Catch not found'));

    catches[idx] = { ...catches[idx], ...req.body, id: catchId, updatedAt: new Date().toISOString() };
    writeJSON(`works/${workId}/catches.json`, catches);

    res.json(catches[idx]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/works/:workId/catches/:catchId
router.delete('/:catchId', (req, res, next) => {
  try {
    const { workId, catchId } = req.params;
    const catches = readJSON(`works/${workId}/catches.json`) || [];
    const before = catches.length;
    const filtered = catches.filter((c) => c.id !== catchId);
    if (filtered.length === before) return next(httpError(404, 'NOT_FOUND', 'Catch not found'));

    writeJSON(`works/${workId}/catches.json`, filtered);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
