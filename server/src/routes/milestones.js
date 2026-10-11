import { Router } from 'express';
import Chapter from '../models/Chapter.js';
import Work from '../models/Work.js';
import Snapshot from '../models/Snapshot.js';
import Milestone from '../models/Milestone.js';
import { httpError } from '../middleware/errorHandler.js';
import { loadWork } from '../middleware/loadWork.js';
import { countWords, recalculate } from '../services/wordCountService.js';
import { validateName } from '../services/snapshotNames.js';
import { newMilestoneId, newSnapshotId, snapshotFields } from '../services/snapshotData.js';
import { restoreFromSnapshot } from '../services/snapshotService.js';
import { sceneSummaries } from '../services/sceneMarkers.js';
import { milestoneRows } from '../services/milestoneCompare.js';

const router = Router({ mergeParams: true });
router.use(loadWork);

function listRow(milestone) {
  return {
    id: milestone._id,
    name: milestone.name,
    createdAt: milestone.createdAt,
    chapterCount: milestone.chapters.length,
    wordCount: milestone.chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0),
  };
}

async function findMilestone(req) {
  const milestone = await Milestone.findOne({ _id: req.params.id, workId: req.params.workId });
  if (!milestone) throw httpError(404, 'NOT_FOUND', 'Milestone not found');
  return milestone;
}

// GET /api/works/:workId/milestones
router.get('/', async (req, res, next) => {
  try {
    const milestones = await Milestone.find({ workId: req.params.workId }).sort({ createdAt: -1 }).lean();
    res.json(milestones.map(listRow));
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/milestones { name } — snapshot every chapter
router.post('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const name = validateName(req.body.name);
    const now = new Date().toISOString();
    const milestoneId = newMilestoneId();
    const chapters = await Chapter.find({ workId }).sort({ order: 1 }).lean();
    const snapshots = chapters.map((ch) => ({
      _id: newSnapshotId(),
      ...snapshotFields(ch),
      kind: 'milestone',
      milestoneId,
      createdAt: now,
    }));
    if (snapshots.length) await Snapshot.insertMany(snapshots);
    let milestone;
    try {
      milestone = await Milestone.create({
        _id: milestoneId,
        workId,
        name,
        createdAt: now,
        chapters: chapters.map((ch, i) => ({
          chapterId: ch._id,
          title: ch.title,
          order: ch.order,
          snapshotId: snapshots[i]._id,
          wordCount: ch.wordCount || 0,
        })),
      });
    } catch (err) {
      await Snapshot.deleteMany({ milestoneId, workId }).catch(() => {});
      throw err;
    }
    res.status(201).json(listRow(milestone));
  } catch (err) {
    next(err);
  }
});

// GET /api/works/:workId/milestones/:id — compared with today
router.get('/:id', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const milestone = await findMilestone(req);
    const [current, snapshots] = await Promise.all([
      Chapter.find({ workId }).select('title order content wordCount').sort({ order: 1 }).lean(),
      Snapshot.find({ milestoneId: milestone._id, workId }).select('content').lean(),
    ]);
    const texts = new Map(snapshots.map((s) => [s._id, s.content || '']));
    res.json({
      id: milestone._id,
      name: milestone.name,
      createdAt: milestone.createdAt,
      chapters: milestoneRows(milestone.chapters, texts, current),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/milestones/:id/chapters/:chapterId/restore
// Restores one chapter; a chapter deleted since is recreated with its original id
router.post('/:id/chapters/:chapterId/restore', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const milestone = await findMilestone(req);
    const entry = milestone.chapters.find((c) => c.chapterId === chapterId);
    if (!entry) return next(httpError(404, 'NOT_FOUND', 'Chapter is not in this milestone'));
    const snapshot = await Snapshot.findOne({ _id: entry.snapshotId, workId });
    if (!snapshot) return next(httpError(404, 'NOT_FOUND', 'Snapshot not found'));

    const existing = await Chapter.findOne({ _id: chapterId, workId });
    if (existing) {
      const chapter = await restoreFromSnapshot(existing, snapshot);
      return res.json({ chapter, recreated: false });
    }

    const now = new Date().toISOString();
    const [last, count] = await Promise.all([
      Chapter.findOne({ workId }).sort({ order: -1 }).select('order').lean(),
      Chapter.countDocuments({ workId }),
    ]);
    const content = snapshot.content || '';
    const chapter = await Chapter.create({
      _id: chapterId,
      workId,
      number: count + 1,
      title: entry.title,
      order: last ? last.order + 1 : 0,
      content,
      contentHtml: snapshot.contentHtml || '',
      scenes: sceneSummaries(snapshot.contentHtml || ''),
      wordCount: countWords(content),
      status: 'draft',
      notes: '',
      createdAt: now,
      lastEditedAt: now,
      updatedAt: now,
    });
    await Work.findByIdAndUpdate(workId, { chapterCount: count + 1, updatedAt: now });
    await recalculate(workId);
    res.status(201).json({ chapter, recreated: true });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/works/:workId/milestones/:id { name }
router.patch('/:id', async (req, res, next) => {
  try {
    const name = validateName(req.body.name);
    const milestone = await findMilestone(req);
    milestone.name = name;
    await milestone.save();
    res.json(listRow(milestone));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/works/:workId/milestones/:id — with its snapshots
router.delete('/:id', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const milestone = await findMilestone(req);
    await Snapshot.deleteMany({ milestoneId: milestone._id, workId });
    await Milestone.deleteOne({ _id: milestone._id, workId });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
