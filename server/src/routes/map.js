import { Router } from 'express';
import MapModel from '../models/Map.js';
import Work from '../models/Work.js';
import { httpError } from '../middleware/errorHandler.js';

const router = Router({ mergeParams: true });

async function getMap(workId) {
  const map = await MapModel.findOne({ workId });
  return map || { framework: '', acts: [], chapters: {}, keyBeats: [], missingBeats: [] };
}

// GET /api/works/:workId/map
router.get('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
    res.json(await getMap(workId));
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/map
router.put('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const { framework, acts, keyBeats } = req.body;
    const setFields = {};
    if (framework !== undefined) setFields.framework = framework;
    if (acts !== undefined) setFields.acts = acts;
    if (keyBeats !== undefined) setFields.keyBeats = keyBeats;

    const map = await MapModel.findOneAndUpdate(
      { workId },
      { $set: setFields, $setOnInsert: { chapters: {}, missingBeats: [] } },
      { upsert: true, new: true }
    );
    res.json(map);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/map/chapters/:chapterId
router.put('/chapters/:chapterId', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const now = new Date().toISOString();
    const map = await MapModel.findOneAndUpdate(
      { workId },
      [
        {
          $set: {
            [`chapters.${chapterId}`]: {
              $mergeObjects: [
                { $ifNull: [`$chapters.${chapterId}`, {}] },
                { ...req.body, chapterId, updatedAt: now },
              ],
            },
            framework: { $ifNull: ['$framework', ''] },
            acts: { $ifNull: ['$acts', []] },
            keyBeats: { $ifNull: ['$keyBeats', []] },
            missingBeats: { $ifNull: ['$missingBeats', []] },
            workId: { $ifNull: ['$workId', workId] },
          },
        },
      ],
      { upsert: true, new: true }
    );
    res.json(map.chapters[chapterId]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/map/gaps/:gapId
router.put('/gaps/:gapId', async (req, res, next) => {
  try {
    const { workId, gapId } = req.params;
    const work = await Work.findById(workId);
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const updated = { ...req.body, id: gapId, updatedAt: new Date().toISOString() };
    const setFields = Object.fromEntries(
      Object.entries(updated).map(([k, v]) => [`missingBeats.$[g].${k}`, v])
    );
    const result = await MapModel.updateOne(
      { workId, 'missingBeats.id': gapId },
      { $set: setFields },
      { arrayFilters: [{ 'g.id': gapId }], strict: false }
    );
    if (result.matchedCount === 0) return next(httpError(404, 'NOT_FOUND', 'Gap not found'));

    const map = await MapModel.findOne({ workId });
    res.json(map.missingBeats.find((g) => g.id === gapId));
  } catch (err) {
    next(err);
  }
});

export default router;
