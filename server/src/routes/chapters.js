import { Router } from 'express';
import fs from 'fs';
import { readJSON, writeJSON, exists, fullPath } from '../services/fileService.js';
import { httpError } from '../middleware/errorHandler.js';
import { countWords, recalculate } from '../services/wordCountService.js';
import { scan } from '../services/consistencyService.js';

const router = Router({ mergeParams: true });

// GET /api/works/:workId/chapters
router.get('/', (req, res, next) => {
  const { workId } = req.params;
  if (!exists(`works/${workId}`)) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
  const chapters = readJSON(`works/${workId}/chapters.json`) || [];
  res.json(chapters);
});

// POST /api/works/:workId/chapters
router.post('/', (req, res, next) => {
  try {
    const { workId } = req.params;
    if (!exists(`works/${workId}`)) return next(httpError(404, 'NOT_FOUND', 'Work not found'));

    const { title, order } = req.body;
    if (!title) return next(httpError(400, 'MISSING_FIELD', 'title is required'));

    const now = new Date().toISOString();
    const id = `ch_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;

    const chapters = readJSON(`works/${workId}/chapters.json`) || [];
    const chOrder = order !== undefined ? order : chapters.length;
    const number = chapters.length + 1;

    const chapterFile = {
      id,
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
    };

    writeJSON(`works/${workId}/chapters/${id}.json`, chapterFile);

    const indexEntry = {
      id,
      number,
      title,
      order: chOrder,
      wordCount: 0,
      status: 'outline',
      createdAt: now,
      lastEditedAt: now,
    };
    chapters.push(indexEntry);
    writeJSON(`works/${workId}/chapters.json`, chapters);

    // Update meta chapterCount
    const meta = readJSON(`works/${workId}/meta.json`);
    if (meta) {
      meta.chapterCount = chapters.length;
      meta.lastTouched = now;
      meta.updatedAt = now;
      writeJSON(`works/${workId}/meta.json`, meta);
    }

    res.status(201).json(chapterFile);
  } catch (err) {
    next(err);
  }
});

// PUT /reorder — must be before /:chapterId to avoid route collision
router.put('/reorder', (req, res, next) => {
  try {
    const { workId } = req.params;
    const { order } = req.body;
    if (!Array.isArray(order)) return next(httpError(400, 'MISSING_FIELD', 'order array is required'));

    const chapters = readJSON(`works/${workId}/chapters.json`) || [];
    const reordered = chapters.map((ch) => {
      const pos = order.indexOf(ch.id);
      return { ...ch, order: pos !== -1 ? pos : ch.order };
    });
    reordered.sort((a, b) => a.order - b.order);
    writeJSON(`works/${workId}/chapters.json`, reordered);

    // Also update order field in each chapter file
    for (const ch of reordered) {
      const chFile = readJSON(`works/${workId}/chapters/${ch.id}.json`);
      if (chFile) {
        chFile.order = ch.order;
        writeJSON(`works/${workId}/chapters/${ch.id}.json`, chFile);
      }
    }

    res.json(reordered);
  } catch (err) {
    next(err);
  }
});

// GET /api/works/:workId/chapters/:chapterId
router.get('/:chapterId', (req, res, next) => {
  const { workId, chapterId } = req.params;
  const chapter = readJSON(`works/${workId}/chapters/${chapterId}.json`);
  if (!chapter) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));
  res.json(chapter);
});

// PUT /api/works/:workId/chapters/:chapterId
router.put('/:chapterId', (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const chapter = readJSON(`works/${workId}/chapters/${chapterId}.json`);
    if (!chapter) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));

    const now = new Date().toISOString();
    const newContent = req.body.content !== undefined ? req.body.content : chapter.content;
    const words = countWords(newContent);

    // Build draft history entry from previous state when content changes
    const history = [...(chapter.draftHistory || [])];
    if (chapter.content !== undefined && chapter.content !== newContent) {
      history.push({
        savedAt: now,
        wordCount: chapter.wordCount || 0,
        contentSnapshot: chapter.content,
      });
      if (history.length > 10) history.splice(0, history.length - 10);
    }

    const updated = {
      ...chapter,
      ...req.body,
      id: chapterId,
      workId,
      content: newContent,
      wordCount: words,
      draftHistory: history,
      updatedAt: now,
    };

    writeJSON(`works/${workId}/chapters/${chapterId}.json`, updated);

    // Update chapters.json index entry
    const chapters = readJSON(`works/${workId}/chapters.json`) || [];
    const idx = chapters.findIndex((c) => c.id === chapterId);
    if (idx !== -1) {
      chapters[idx] = {
        ...chapters[idx],
        title: updated.title,
        order: updated.order,
        wordCount: words,
        status: updated.status,
        updatedAt: now,
      };
      writeJSON(`works/${workId}/chapters.json`, chapters);
    }

    // Recalculate total word count for work
    recalculate(workId);

    // Run consistency scan
    try {
      scan(workId, chapterId, newContent);
    } catch (scanErr) {
      console.error('Consistency scan error:', scanErr);
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/works/:workId/chapters/:chapterId
router.delete('/:chapterId', (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const fp = fullPath(`works/${workId}/chapters/${chapterId}.json`);
    if (!fs.existsSync(fp)) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));

    fs.unlinkSync(fp);

    const chapters = readJSON(`works/${workId}/chapters.json`) || [];
    const filtered = chapters.filter((c) => c.id !== chapterId);
    writeJSON(`works/${workId}/chapters.json`, filtered);

    const meta = readJSON(`works/${workId}/meta.json`);
    if (meta) {
      meta.chapterCount = filtered.length;
      meta.updatedAt = new Date().toISOString();
      writeJSON(`works/${workId}/meta.json`, meta);
    }

    recalculate(workId);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
