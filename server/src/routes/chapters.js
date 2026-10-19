import { Router } from 'express';
import Chapter from '../models/Chapter.js';
import Work from '../models/Work.js';
import { httpError } from '../middleware/errorHandler.js';
import { countWords, recalculate, gainFor } from '../services/wordCountService.js';
import { addDailyWords, dayKeyForRequest } from '../services/progressService.js';
import { scan } from '../services/consistencyService.js';
import { sanitizeChapterHtml } from '../services/htmlService.js';
import { loadWork } from '../middleware/loadWork.js';
import { stampContentChange } from '../middleware/stampContentChange.js';
import { summaryStatus, hashContent } from '../services/summaryText.js';
import { generateSummary } from '../services/summaryService.js';
import Snapshot from '../models/Snapshot.js';
import CatchModel from '../models/Catch.js';
import { autoSnapshotDue, takeAutoSnapshot } from '../services/snapshotService.js';
import { sceneSummaries, chapterText, chapterHtml, moveScene } from '../services/sceneMarkers.js';
import { checkTagList, knownThreadIds, filterHtmlThreads } from '../services/threadTags.js';
import { knownThreadSet } from '../services/threadScope.js';

const router = Router({ mergeParams: true });
router.use(stampContentChange);
router.use(loadWork);

// GET /api/works/:workId/chapters
router.get('/', async (req, res, next) => {
  try {
    const { workId } = req.params;

    // content is loaded only to compute summaryStatus, then left out
    const chapters = await Chapter.find({ workId }).select('-contentHtml').sort({ order: 1 });
    res.json(
      chapters.map((ch) => {
        const json = ch.toJSON();
        json.summaryStatus = summaryStatus(json);
        delete json.content;
        return json;
      })
    );
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/chapters
router.post('/', async (req, res, next) => {
  try {
    const { workId } = req.params;

    const { title, order } = req.body;
    if (!title) return next(httpError(400, 'MISSING_FIELD', 'title is required'));

    const now = new Date().toISOString();
    const id = `ch_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
    const chapterCount = await Chapter.countDocuments({ workId });
    const chOrder = order !== undefined ? order : chapterCount;
    const number = chapterCount + 1;

    const chapter = await Chapter.create({
      _id: id,
      workId,
      number,
      title,
      order: chOrder,
      content: '',
      wordCount: 0,
      status: 'outline',
      notes: '',
      createdAt: now,
      lastEditedAt: now,
    });

    await Work.findByIdAndUpdate(workId, {
      chapterCount: chapterCount + 1,
      lastTouched: now,
      updatedAt: now,
    });

    res.status(201).json(chapter);
  } catch (err) {
    next(err);
  }
});

// PUT /reorder — must be before /:chapterId to avoid route collision
router.put('/reorder', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const { order } = req.body;
    if (!Array.isArray(order)) return next(httpError(400, 'MISSING_FIELD', 'order array is required'));

    const ops = order.map((chapterId, pos) => ({
      updateOne: {
        filter: { _id: chapterId, workId },
        update: { $set: { order: pos } },
      },
    }));
    if (ops.length > 0) await Chapter.bulkWrite(ops);

    const chapters = await Chapter.find({ workId }).select('-content -contentHtml').sort({ order: 1 });
    res.json(chapters);
  } catch (err) {
    next(err);
  }
});

// GET /api/works/:workId/chapters/:chapterId
router.get('/:chapterId', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const chapter = await Chapter.findOne({ _id: chapterId, workId });
    if (!chapter) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));
    res.json(chapter);
  } catch (err) {
    next(err);
  }
});

// PUT /api/works/:workId/chapters/:chapterId
router.put('/:chapterId', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const chapter = await Chapter.findOne({ _id: chapterId, workId });
    if (!chapter) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));

    const now = new Date().toISOString();
    const newContent = req.body.content !== undefined ? req.body.content : chapter.content;
    const words = countWords(newContent);
    const newHtml =
      req.body.contentHtml !== undefined
        ? filterHtmlThreads(sanitizeChapterHtml(req.body.contentHtml), await knownThreadSet(workId))
        : chapter.contentHtml;
    const contentChanged =
      (chapter.content || '') !== newContent || (chapter.contentHtml || '') !== (newHtml || '');

    const setFields = { ...req.body, content: newContent, contentHtml: newHtml, wordCount: words, updatedAt: now };
    delete setFields.id;
    delete setFields.workId;
    delete setFields.summary;
    delete setFields.scenes;
    delete setFields.threadIds;
    if (req.body.contentHtml !== undefined) setFields.scenes = sceneSummaries(newHtml);
    if (chapter.status === 'outline' && words > 0 && req.body.status === undefined) {
      setFields.status = 'draft';
    }

    const snapshotNeeded = contentChanged && chapter.content && (await autoSnapshotDue(chapterId, now));
    // new: false returns the pre-update document, so the daily gain is measured in this same atomic write
    const before = await Chapter.findOneAndUpdate({ _id: chapterId, workId }, { $set: setFields }, { new: false });
    const updated = await Chapter.findById(chapterId);

    // `chapter` is the pre-save document, so this keeps the text being replaced.
    // A failed snapshot must not fail the save.
    if (snapshotNeeded) {
      try {
        await takeAutoSnapshot(chapter, now);
      } catch (snapErr) {
        console.error('Snapshot error:', snapErr);
      }
    }

    try {
      await scan(workId, chapterId, newContent);
    } catch (scanErr) {
      console.error('Consistency scan error:', scanErr);
    }

    await recalculate(workId);

    // A failed progress write is logged and never fails the save
    try {
      await addDailyWords(req.user.id, dayKeyForRequest(req), gainFor(before?.wordCount ?? 0, words));
    } catch (progressErr) {
      console.error('Daily progress error:', progressErr);
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

function chapterResponse(doc) {
  const json = doc.toJSON();
  json.summaryStatus = summaryStatus(json);
  return json;
}

// PUT /api/works/:workId/chapters/:chapterId/threads { threadIds }
// The autosave PUT ignores threadIds so a stale editor can't overwrite tags; this is their write path
router.put('/:chapterId/threads', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const checked = checkTagList(req.body?.threadIds);
    if (!checked.ok) return next(httpError(400, 'INVALID_FIELD', checked.message));
    const threadIds = knownThreadIds(checked.ids, await knownThreadSet(workId));
    const updated = await Chapter.findOneAndUpdate(
      { _id: chapterId, workId },
      { $set: { threadIds } },
      { new: true, timestamps: false }
    );
    if (!updated) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));
    res.json(chapterResponse(updated));
  } catch (err) {
    next(err);
  }
});

async function writeMovedChapter(chapter, html, now, known) {
  const clean = filterHtmlThreads(sanitizeChapterHtml(html), known);
  const content = chapterText(clean);
  const wordCount = countWords(content);
  const set = { contentHtml: clean, content, wordCount, scenes: sceneSummaries(clean), updatedAt: now };
  if (chapter.status === 'outline' && wordCount > 0) set.status = 'draft';
  return Chapter.findOneAndUpdate({ _id: chapter._id, workId: chapter.workId }, { $set: set }, { new: true });
}

// POST /api/works/:workId/chapters/:chapterId/scenes/move
router.post('/:chapterId/scenes/move', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const { sceneId, toChapterId, toIndex } = req.body || {};
    // Same shape as the catch routes: the message names the field
    const invalid = (field, message) => next(httpError(400, 'INVALID_FIELD', message));
    if (typeof sceneId !== 'string' || !sceneId.trim()) return invalid('sceneId', 'sceneId is required');
    if (typeof toChapterId !== 'string' || !toChapterId) return invalid('toChapterId', 'toChapterId is required');
    if (!Number.isInteger(toIndex) || toIndex < 0) return invalid('toIndex', 'toIndex must be a whole number of 0 or more');

    const source = await Chapter.findOne({ _id: chapterId, workId });
    if (!source) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));
    const sameChapter = toChapterId === chapterId;
    const target = sameChapter ? source : await Chapter.findOne({ _id: toChapterId, workId });
    if (!target) return invalid('toChapterId', 'toChapterId must be a chapter of this work');

    const result = moveScene({
      srcHtml: chapterHtml(source),
      dstHtml: chapterHtml(target),
      sceneId: sceneId.trim(),
      toIndex,
      sameChapter,
    });
    if (result.error === 'NOT_FOUND') return next(httpError(404, 'SCENE_NOT_FOUND', 'Scene not found'));
    if (result.error === 'INVALID_INDEX') return invalid('toIndex', 'toIndex is past the end of the chapter');
    if (result.error === 'NO_CHANGE') return res.json({ chapters: [] });

    const known = await knownThreadSet(workId);
    const now = new Date().toISOString();
    const changed = sameChapter ? [source] : [target, source];
    // Never move without a way back
    for (const chapter of changed) {
      await takeAutoSnapshot(chapter, now, { note: 'Before moving a scene' });
    }

    // Destination first: a failure in between duplicates the scene, never loses it
    const updatedTarget = await writeMovedChapter(target, result.dstHtml, now, known);
    let updatedSource = updatedTarget;
    if (!sameChapter) {
      try {
        updatedSource = await writeMovedChapter(source, result.srcHtml, now, known);
      } catch (err) {
        console.error('Scene move source write failed:', err);
        return next(
          httpError(500, 'MOVE_INCOMPLETE', `The scene was copied to "${target.title}" but not removed from "${source.title}".`)
        );
      }
    }

    const updated = sameChapter ? [updatedTarget] : [updatedTarget, updatedSource];
    for (const chapter of updated) {
      try {
        await scan(workId, chapter._id, chapter.content);
      } catch (scanErr) {
        console.error('Consistency scan error:', scanErr);
      }
    }
    try {
      await recalculate(workId);
    } catch (err) {
      console.error('Word count recalculation failed:', err);
    }

    res.json({ chapters: updated.map(chapterResponse) });
  } catch (err) {
    next(err);
  }
});

function summaryResponse(chapter) {
  const json = chapter.toJSON ? chapter.toJSON() : chapter;
  return { summary: json.summary, summaryStatus: summaryStatus(json) };
}

// PUT /api/works/:workId/chapters/:chapterId/summary — the writer's edit
router.put('/:chapterId/summary', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const { text } = req.body || {};
    if (typeof text !== 'string') return next(httpError(400, 'MISSING_FIELD', 'text is required'));

    const chapter = await Chapter.findOne({ _id: chapterId, workId }).select('content');
    if (!chapter) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));

    const trimmed = text.trim();
    const summary = trimmed
      ? { text: trimmed, sourceHash: hashContent(chapter.content), generatedAt: null, edited: true }
      : { text: '', sourceHash: '', generatedAt: null, edited: false };

    const updated = await Chapter.findOneAndUpdate(
      { _id: chapterId, workId },
      { $set: { summary } },
      { new: true }
    ).select('content summary');
    res.json(summaryResponse(updated));
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/chapters/:chapterId/summary/regenerate
router.post('/:chapterId/summary/regenerate', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const chapter = await Chapter.findOne({ _id: chapterId, workId }).select('number title content summary').lean();
    if (!chapter) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));
    if (!chapter.content || !chapter.content.trim()) {
      return next(httpError(400, 'EMPTY_CHAPTER', 'This chapter has no text to summarise'));
    }

    // Regenerating hands the summary back to the AI; `edited` is cleared only
    // when the new summary is saved, so a failure keeps the writer's text protected
    await generateSummary(req.work, chapter, { force: true });

    const updated = await Chapter.findOne({ _id: chapterId, workId }).select('content summary');
    res.json(summaryResponse(updated));
  } catch (err) {
    if (err.code === 'NO_API_KEY') return next(httpError(400, 'NO_API_KEY', err.message));
    if (err.code === 'EMPTY_SUMMARY') return next(httpError(502, 'EMPTY_SUMMARY', 'The AI returned an empty summary'));
    next(err);
  }
});

// DELETE /api/works/:workId/chapters/:chapterId
router.delete('/:chapterId', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const deleted = await Chapter.findOneAndDelete({ _id: chapterId, workId });
    if (!deleted) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));

    // Milestone snapshots stay so the chapter can be brought back from a milestone
    await Snapshot.deleteMany({ workId, chapterId, kind: { $in: ['auto', 'named'] } });

    // Catches tagged to the chapter stay, untagged
    await CatchModel.updateMany({ workId, taggedChapterId: chapterId }, { $set: { taggedChapterId: null } });

    const now = new Date().toISOString();
    const chapterCount = await Chapter.countDocuments({ workId });
    await Work.findByIdAndUpdate(workId, { chapterCount, updatedAt: now });

    await recalculate(workId);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
