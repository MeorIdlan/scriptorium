import { Router } from 'express';
import { readJSON, writeJSON, exists } from '../services/fileService.js';
import { httpError } from '../middleware/errorHandler.js';

const router = Router({ mergeParams: true });

function shortId() {
  return Math.random().toString(36).substring(2, 7);
}

function getCodex(workId) {
  return readJSON(`works/${workId}/codex.json`) || { characters: [], places: [], worldRules: [] };
}

function saveCodex(workId, codex) {
  writeJSON(`works/${workId}/codex.json`, codex);
}

// GET /api/works/:workId/codex
router.get('/', (req, res, next) => {
  const { workId } = req.params;
  if (!exists(`works/${workId}`)) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
  res.json(getCodex(workId));
});

// ─── Characters ───────────────────────────────────────────────────────────────

// POST /api/works/:workId/codex/characters
router.post('/characters', (req, res, next) => {
  try {
    const { workId } = req.params;
    const codex = getCodex(workId);
    const id = `char_${shortId()}`;
    const character = {
      flags: [],
      aliases: [],
      createdAt: new Date().toISOString(),
      ...req.body,
      id, // always override any id from body
    };
    codex.characters.push(character);
    saveCodex(workId, codex);
    res.status(201).json(character);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/codex/characters/:charId
router.put('/characters/:charId', (req, res, next) => {
  try {
    const { workId, charId } = req.params;
    const codex = getCodex(workId);
    const idx = codex.characters.findIndex((c) => c.id === charId);
    if (idx === -1) return next(httpError(404, 'NOT_FOUND', 'Character not found'));
    codex.characters[idx] = { ...codex.characters[idx], ...req.body, id: charId, updatedAt: new Date().toISOString() };
    saveCodex(workId, codex);
    res.json(codex.characters[idx]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/works/:workId/codex/characters/:charId
router.delete('/characters/:charId', (req, res, next) => {
  try {
    const { workId, charId } = req.params;
    const codex = getCodex(workId);
    const before = codex.characters.length;
    codex.characters = codex.characters.filter((c) => c.id !== charId);
    if (codex.characters.length === before) return next(httpError(404, 'NOT_FOUND', 'Character not found'));
    saveCodex(workId, codex);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ─── Places ───────────────────────────────────────────────────────────────────

// POST /api/works/:workId/codex/places
router.post('/places', (req, res, next) => {
  try {
    const { workId } = req.params;
    const codex = getCodex(workId);
    const id = `place_${shortId()}`;
    const place = {
      flags: [],
      createdAt: new Date().toISOString(),
      ...req.body,
      id,
    };
    codex.places.push(place);
    saveCodex(workId, codex);
    res.status(201).json(place);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/codex/places/:placeId
router.put('/places/:placeId', (req, res, next) => {
  try {
    const { workId, placeId } = req.params;
    const codex = getCodex(workId);
    const idx = codex.places.findIndex((p) => p.id === placeId);
    if (idx === -1) return next(httpError(404, 'NOT_FOUND', 'Place not found'));
    codex.places[idx] = { ...codex.places[idx], ...req.body, id: placeId, updatedAt: new Date().toISOString() };
    saveCodex(workId, codex);
    res.json(codex.places[idx]);
  } catch (err) {
    next(err);
  }
});

// ─── World Rules ──────────────────────────────────────────────────────────────

// POST /api/works/:workId/codex/rules
router.post('/rules', (req, res, next) => {
  try {
    const { workId } = req.params;
    const codex = getCodex(workId);
    const id = `rule_${shortId()}`;
    const rule = {
      flags: [],
      createdAt: new Date().toISOString(),
      ...req.body,
      id,
    };
    codex.worldRules.push(rule);
    saveCodex(workId, codex);
    res.status(201).json(rule);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/codex/rules/:ruleId
router.put('/rules/:ruleId', (req, res, next) => {
  try {
    const { workId, ruleId } = req.params;
    const codex = getCodex(workId);
    const idx = codex.worldRules.findIndex((r) => r.id === ruleId);
    if (idx === -1) return next(httpError(404, 'NOT_FOUND', 'Rule not found'));
    codex.worldRules[idx] = { ...codex.worldRules[idx], ...req.body, id: ruleId, updatedAt: new Date().toISOString() };
    saveCodex(workId, codex);
    res.json(codex.worldRules[idx]);
  } catch (err) {
    next(err);
  }
});

// ─── Flags ────────────────────────────────────────────────────────────────────

// GET /api/works/:workId/codex/flags
router.get('/flags', (req, res, next) => {
  try {
    const { workId } = req.params;
    const codex = getCodex(workId);
    const result = [];

    const entityGroups = [
      { type: 'character', list: codex.characters || [] },
      { type: 'place', list: codex.places || [] },
      { type: 'worldRule', list: codex.worldRules || [] },
    ];

    for (const { type, list } of entityGroups) {
      for (const entity of list) {
        for (const flag of entity.flags || []) {
          if (flag.status === 'unresolved') {
            result.push({
              ...flag,
              entityType: type,
              entityId: entity.id,
              entityName: entity.name || entity.title || entity.id,
            });
          }
        }
      }
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/codex/flags/:flagId
router.put('/flags/:flagId', (req, res, next) => {
  try {
    const { workId, flagId } = req.params;
    const codex = getCodex(workId);

    const entityGroups = [
      codex.characters || [],
      codex.places || [],
      codex.worldRules || [],
    ];

    let found = false;
    for (const list of entityGroups) {
      for (const entity of list) {
        const flagIdx = (entity.flags || []).findIndex((f) => f.id === flagId);
        if (flagIdx !== -1) {
          entity.flags[flagIdx] = { ...entity.flags[flagIdx], ...req.body, id: flagId };
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) return next(httpError(404, 'NOT_FOUND', 'Flag not found'));

    saveCodex(workId, codex);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
