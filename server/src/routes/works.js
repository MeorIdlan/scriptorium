import { Router } from 'express';
import Work from '../models/Work.js';
import Chapter from '../models/Chapter.js';
import Codex from '../models/Codex.js';
import MapModel from '../models/Map.js';
import CatchModel from '../models/Catch.js';
import Session from '../models/Session.js';
import { httpError } from '../middleware/errorHandler.js';

const router = Router();

const INDEX_FIELDS =
  'title genre status wordCount chapterCount currentDraft coverColor logline lastTouched createdAt';

// GET /api/works
router.get('/', async (req, res, next) => {
  try {
    const works = await Work.find({ ownerId: req.user.id }).select(INDEX_FIELDS).sort({ createdAt: -1 });
    res.json(works);
  } catch (err) {
    next(err);
  }
});

// POST /api/works
router.post('/', async (req, res, next) => {
  try {
    const { title, genre, tone, pov, protagonist, premise } = req.body;
    if (!title) return next(httpError(400, 'MISSING_FIELD', 'title is required'));

    const id = `work_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const work = await Work.create({
      _id: id,
      ownerId: req.user.id,
      title,
      genre: genre || '',
      tone: tone || '',
      pov: pov || '',
      protagonist: protagonist || '',
      premise: premise || '',
      status: 'drafting',
      wordCount: 0,
      chapterCount: 0,
      currentDraft: 1,
      coverColor: randomCoverColor(),
      logline: '',
      lastTouched: now,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json(work);
  } catch (err) {
    next(err);
  }
});

// GET /api/works/:workId
router.get('/:workId', async (req, res, next) => {
  try {
    const work = await Work.findOne({ _id: req.params.workId, ownerId: req.user.id });
    if (!work) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
    res.json(work);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId
router.put('/:workId', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const update = { ...req.body, updatedAt: new Date().toISOString() };
    delete update.id;
    delete update.ownerId;

    const updated = await Work.findOneAndUpdate({ _id: workId, ownerId: req.user.id }, update, { new: true });
    if (!updated) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/works/:workId
router.delete('/:workId', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const deleted = await Work.findOneAndDelete({ _id: workId, ownerId: req.user.id });
    if (!deleted) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    await Promise.all([
      Chapter.deleteMany({ workId }),
      Codex.deleteMany({ workId }),
      MapModel.deleteMany({ workId }),
      CatchModel.deleteMany({ workId }),
      Session.deleteMany({ workId }),
    ]);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

function randomCoverColor() {
  const COVER_COLORS = ['#2d4a3e', '#3b2d4a', '#4a3b2d', '#2d3b4a', '#4a2d35', '#2d4a47'];
  return COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)];
}

export default router;
