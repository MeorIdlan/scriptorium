import { Router } from 'express';
import { readJSON, writeJSON, ensureDir, deleteDir, exists } from '../services/fileService.js';
import { httpError } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/works
router.get('/', (req, res) => {
  const works = readJSON('works.json') || [];
  res.json(works);
});

// POST /api/works
router.post('/', (req, res, next) => {
  try {
    const { title, genre, tone, pov, protagonist, premise } = req.body;
    if (!title) return next(httpError(400, 'MISSING_FIELD', 'title is required'));

    const id = `work_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const meta = {
      id,
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
    };

    // Initialise directory structure
    ensureDir(`works/${id}`);
    ensureDir(`works/${id}/chapters`);
    writeJSON(`works/${id}/meta.json`, meta);
    writeJSON(`works/${id}/chapters.json`, []);
    writeJSON(`works/${id}/codex.json`, { characters: [], places: [], worldRules: [] });
    writeJSON(`works/${id}/catches.json`, []);
    writeJSON(`works/${id}/map.json`, {
      framework: '',
      acts: [],
      chapters: {},
      keyBeats: [],
      missingBeats: [],
    });
    writeJSON(`works/${id}/sessions.json`, []);

    // Add index entry
    const works = readJSON('works.json') || [];
    works.push(indexEntry(meta));
    writeJSON('works.json', works);

    res.status(201).json(meta);
  } catch (err) {
    next(err);
  }
});

// GET /api/works/:workId
router.get('/:workId', (req, res, next) => {
  const meta = readJSON(`works/${req.params.workId}/meta.json`);
  if (!meta) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
  res.json(meta);
});

// PUT /api/works/:workId
router.put('/:workId', (req, res, next) => {
  try {
    const { workId } = req.params;
    const meta = readJSON(`works/${workId}/meta.json`);
    if (!meta) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const updated = { ...meta, ...req.body, id: workId, updatedAt: new Date().toISOString() };
    writeJSON(`works/${workId}/meta.json`, updated);

    // Sync relevant fields to works index
    const works = readJSON('works.json') || [];
    const idx = works.findIndex((w) => w.id === workId);
    if (idx !== -1) {
      works[idx] = { ...works[idx], ...indexEntry(updated) };
      writeJSON('works.json', works);
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/works/:workId
router.delete('/:workId', (req, res, next) => {
  try {
    const { workId } = req.params;
    if (!exists(`works/${workId}`)) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    deleteDir(`works/${workId}`);

    const works = readJSON('works.json') || [];
    const filtered = works.filter((w) => w.id !== workId);
    writeJSON('works.json', filtered);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

function indexEntry(meta) {
  return {
    id: meta.id,
    title: meta.title,
    genre: meta.genre,
    status: meta.status,
    wordCount: meta.wordCount,
    chapterCount: meta.chapterCount,
    currentDraft: meta.currentDraft,
    coverColor: meta.coverColor,
    logline: meta.logline,
    lastTouched: meta.lastTouched,
    createdAt: meta.createdAt,
  };
}

const COVER_COLORS = ['#2d4a3e', '#3b2d4a', '#4a3b2d', '#2d3b4a', '#4a2d35', '#2d4a47'];

function randomCoverColor() {
  return COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)];
}

export default router;
