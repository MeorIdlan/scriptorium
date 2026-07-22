import { Router } from 'express';
import Codex from '../models/Codex.js';
import { httpError } from '../middleware/errorHandler.js';

const router = Router({ mergeParams: true });

function shortId() {
  return Math.random().toString(36).substring(2, 7);
}

async function getCodex(workId) {
  const codex = await Codex.findOne({ workId });
  return codex || { characters: [], places: [], worldRules: [] };
}

// GET /api/works/:workId/codex
router.get('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    res.json(await getCodex(workId));
  } catch (err) {
    next(err);
  }
});

// ─── Characters ───────────────────────────────────────────────────────────────

// POST /api/works/:workId/codex/characters
router.post('/characters', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const id = `char_${shortId()}`;
    const character = { flags: [], aliases: [], createdAt: new Date().toISOString(), ...req.body, id };
    await Codex.findOneAndUpdate(
      { workId },
      { $push: { characters: character }, $setOnInsert: { places: [], worldRules: [] } },
      { upsert: true }
    );
    res.status(201).json(character);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/codex/characters/:charId
router.put('/characters/:charId', async (req, res, next) => {
  try {
    const { workId, charId } = req.params;
    const updated = { ...req.body, id: charId, updatedAt: new Date().toISOString() };
    const setFields = Object.fromEntries(
      Object.entries(updated).map(([k, v]) => [`characters.$[c].${k}`, v])
    );
    const result = await Codex.updateOne(
      { workId, 'characters.id': charId },
      { $set: setFields },
      { arrayFilters: [{ 'c.id': charId }], strict: false }
    );
    if (result.matchedCount === 0) return next(httpError(404, 'NOT_FOUND', 'Character not found'));
    const codex = await Codex.findOne({ workId });
    res.json(codex.characters.find((c) => c.id === charId));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/works/:workId/codex/characters/:charId
router.delete('/characters/:charId', async (req, res, next) => {
  try {
    const { workId, charId } = req.params;
    const result = await Codex.updateOne({ workId }, { $pull: { characters: { id: charId } } });
    if (result.matchedCount === 0 || result.modifiedCount === 0) {
      return next(httpError(404, 'NOT_FOUND', 'Character not found'));
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ─── Places ───────────────────────────────────────────────────────────────────

// POST /api/works/:workId/codex/places
router.post('/places', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const id = `place_${shortId()}`;
    const place = { flags: [], createdAt: new Date().toISOString(), ...req.body, id };
    await Codex.findOneAndUpdate(
      { workId },
      { $push: { places: place }, $setOnInsert: { characters: [], worldRules: [] } },
      { upsert: true }
    );
    res.status(201).json(place);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/codex/places/:placeId
router.put('/places/:placeId', async (req, res, next) => {
  try {
    const { workId, placeId } = req.params;
    const updated = { ...req.body, id: placeId, updatedAt: new Date().toISOString() };
    const setFields = Object.fromEntries(
      Object.entries(updated).map(([k, v]) => [`places.$[p].${k}`, v])
    );
    const result = await Codex.updateOne(
      { workId, 'places.id': placeId },
      { $set: setFields },
      { arrayFilters: [{ 'p.id': placeId }], strict: false }
    );
    if (result.matchedCount === 0) return next(httpError(404, 'NOT_FOUND', 'Place not found'));
    const codex = await Codex.findOne({ workId });
    res.json(codex.places.find((p) => p.id === placeId));
  } catch (err) {
    next(err);
  }
});

// ─── World Rules ──────────────────────────────────────────────────────────────

// POST /api/works/:workId/codex/rules
router.post('/rules', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const id = `rule_${shortId()}`;
    const rule = { flags: [], createdAt: new Date().toISOString(), ...req.body, id };
    await Codex.findOneAndUpdate(
      { workId },
      { $push: { worldRules: rule }, $setOnInsert: { characters: [], places: [] } },
      { upsert: true }
    );
    res.status(201).json(rule);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/codex/rules/:ruleId
router.put('/rules/:ruleId', async (req, res, next) => {
  try {
    const { workId, ruleId } = req.params;
    const updated = { ...req.body, id: ruleId, updatedAt: new Date().toISOString() };
    const setFields = Object.fromEntries(
      Object.entries(updated).map(([k, v]) => [`worldRules.$[r].${k}`, v])
    );
    const result = await Codex.updateOne(
      { workId, 'worldRules.id': ruleId },
      { $set: setFields },
      { arrayFilters: [{ 'r.id': ruleId }], strict: false }
    );
    if (result.matchedCount === 0) return next(httpError(404, 'NOT_FOUND', 'Rule not found'));
    const codex = await Codex.findOne({ workId });
    res.json(codex.worldRules.find((r) => r.id === ruleId));
  } catch (err) {
    next(err);
  }
});

// ─── Flags ────────────────────────────────────────────────────────────────────

// GET /api/works/:workId/codex/flags
router.get('/flags', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const result = await Codex.aggregate([
      { $match: { workId } },
      {
        $project: {
          entries: {
            $concatArrays: [
              {
                $map: {
                  input: { $ifNull: ['$characters', []] },
                  as: 'e',
                  in: { entityType: 'character', entityId: '$$e.id', entityName: '$$e.name', flags: { $ifNull: ['$$e.flags', []] } },
                },
              },
              {
                $map: {
                  input: { $ifNull: ['$places', []] },
                  as: 'e',
                  in: { entityType: 'place', entityId: '$$e.id', entityName: '$$e.name', flags: { $ifNull: ['$$e.flags', []] } },
                },
              },
              {
                $map: {
                  input: { $ifNull: ['$worldRules', []] },
                  as: 'e',
                  in: { entityType: 'worldRule', entityId: '$$e.id', entityName: '$$e.rule', flags: { $ifNull: ['$$e.flags', []] } },
                },
              },
            ],
          },
        },
      },
      { $unwind: '$entries' },
      { $unwind: '$entries.flags' },
      { $match: { 'entries.flags.status': 'unresolved' } },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              '$entries.flags',
              { entityType: '$entries.entityType', entityId: '$entries.entityId', entityName: '$entries.entityName' },
            ],
          },
        },
      },
    ]);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/codex/flags/:flagId
router.put('/flags/:flagId', async (req, res, next) => {
  try {
    const { workId, flagId } = req.params;
    const updateBody = { ...req.body, id: flagId };
    const arrayNames = ['characters', 'places', 'worldRules'];

    for (const arrayName of arrayNames) {
      const setFields = Object.fromEntries(
        Object.entries(updateBody).map(([k, v]) => [`${arrayName}.$[e].flags.$[f].${k}`, v])
      );
      const result = await Codex.updateOne(
        { workId, [`${arrayName}.flags.id`]: flagId },
        { $set: setFields },
        { arrayFilters: [{ 'e.flags.id': flagId }, { 'f.id': flagId }], strict: false }
      );
      if (result.matchedCount > 0) {
        return res.json({ ok: true });
      }
    }

    next(httpError(404, 'NOT_FOUND', 'Flag not found'));
  } catch (err) {
    next(err);
  }
});

export default router;
