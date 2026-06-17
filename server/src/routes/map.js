import { Router } from 'express';
import { readJSON, writeJSON, exists } from '../services/fileService.js';
import { httpError } from '../middleware/errorHandler.js';

const router = Router({ mergeParams: true });

function getMap(workId) {
  return readJSON(`works/${workId}/map.json`) || {
    framework: '',
    acts: [],
    chapters: {},
    keyBeats: [],
    missingBeats: [],
  };
}

// GET /api/works/:workId/map
router.get('/', (req, res, next) => {
  const { workId } = req.params;
  if (!exists(`works/${workId}`)) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
  res.json(getMap(workId));
});

// PUT /api/works/:workId/map
router.put('/', (req, res, next) => {
  try {
    const { workId } = req.params;
    if (!exists(`works/${workId}`)) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const map = getMap(workId);
    const { framework, acts, keyBeats } = req.body;

    if (framework !== undefined) map.framework = framework;
    if (acts !== undefined) map.acts = acts;
    if (keyBeats !== undefined) map.keyBeats = keyBeats;

    writeJSON(`works/${workId}/map.json`, map);
    res.json(map);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/map/chapters/:chapterId
router.put('/chapters/:chapterId', (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    if (!exists(`works/${workId}`)) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const map = getMap(workId);
    if (!map.chapters) map.chapters = {};

    const existing = map.chapters[chapterId] || {};
    map.chapters[chapterId] = {
      ...existing,
      ...req.body,
      chapterId,
      updatedAt: new Date().toISOString(),
    };

    writeJSON(`works/${workId}/map.json`, map);
    res.json(map.chapters[chapterId]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/map/gaps/:gapId
router.put('/gaps/:gapId', (req, res, next) => {
  try {
    const { workId, gapId } = req.params;
    if (!exists(`works/${workId}`)) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const map = getMap(workId);
    const gapIdx = (map.missingBeats || []).findIndex((g) => g.id === gapId);
    if (gapIdx === -1) return next(httpError(404, 'NOT_FOUND', 'Gap not found'));

    map.missingBeats[gapIdx] = {
      ...map.missingBeats[gapIdx],
      ...req.body,
      id: gapId,
      updatedAt: new Date().toISOString(),
    };

    writeJSON(`works/${workId}/map.json`, map);
    res.json(map.missingBeats[gapIdx]);
  } catch (err) {
    next(err);
  }
});

export default router;
