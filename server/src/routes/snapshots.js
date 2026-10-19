import { Router } from 'express';
import Chapter from '../models/Chapter.js';
import Snapshot from '../models/Snapshot.js';
import Milestone from '../models/Milestone.js';
import { httpError } from '../middleware/errorHandler.js';
import { loadWork } from '../middleware/loadWork.js';
import { stampContentChange } from '../middleware/stampContentChange.js';
import { validateName } from '../services/snapshotNames.js';
import { newSnapshotId, snapshotFields } from '../services/snapshotData.js';
import { restoreFromSnapshot } from '../services/snapshotService.js';

const router = Router({ mergeParams: true });
router.use(stampContentChange);
router.use(loadWork);

// Every route acts on one chapter of the work
router.use(async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const chapter = await Chapter.findOne({ _id: chapterId, workId });
    if (!chapter) return next(httpError(404, 'NOT_FOUND', 'Chapter not found'));
    req.chapter = chapter;
    next();
  } catch (err) {
    next(err);
  }
});

function listRow(snapshot, milestoneName = '') {
  return {
    id: snapshot._id,
    kind: snapshot.kind,
    name: snapshot.name || '',
    note: snapshot.note || '',
    milestoneId: snapshot.milestoneId || null,
    milestoneName,
    wordCount: snapshot.wordCount || 0,
    createdAt: snapshot.createdAt,
  };
}

async function findSnapshot(req) {
  const { workId, chapterId, snapId } = req.params;
  const snapshot = await Snapshot.findOne({ _id: snapId, workId, chapterId });
  if (!snapshot) throw httpError(404, 'NOT_FOUND', 'Snapshot not found');
  return snapshot;
}

// GET /api/works/:workId/chapters/:chapterId/snapshots — newest first, without text
router.get('/', async (req, res, next) => {
  try {
    const { workId, chapterId } = req.params;
    const snapshots = await Snapshot.find({ workId, chapterId })
      .select('-content -contentHtml')
      .sort({ createdAt: -1 })
      .lean();
    const milestoneIds = [...new Set(snapshots.map((s) => s.milestoneId).filter(Boolean))];
    const milestones = milestoneIds.length
      ? await Milestone.find({ _id: { $in: milestoneIds }, workId }).select('name').lean()
      : [];
    const names = new Map(milestones.map((m) => [m._id, m.name]));
    res.json(snapshots.map((s) => listRow(s, s.milestoneId ? names.get(s.milestoneId) || '' : '')));
  } catch (err) {
    next(err);
  }
});

// GET …/snapshots/:snapId — with text
router.get('/:snapId', async (req, res, next) => {
  try {
    res.json(await findSnapshot(req));
  } catch (err) {
    next(err);
  }
});

// POST …/snapshots { name } — save the current text as a named snapshot
router.post('/', async (req, res, next) => {
  try {
    const name = validateName(req.body.name);
    const snapshot = await Snapshot.create({
      _id: newSnapshotId(),
      ...snapshotFields(req.chapter),
      kind: 'named',
      name,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json(listRow(snapshot));
  } catch (err) {
    next(err);
  }
});

// PATCH …/snapshots/:snapId { name } — rename, or name an automatic snapshot to keep it
router.patch('/:snapId', async (req, res, next) => {
  try {
    const name = validateName(req.body.name);
    const snapshot = await findSnapshot(req);
    if (snapshot.kind === 'milestone') {
      return next(httpError(400, 'NOT_ALLOWED', 'Milestone snapshots are renamed with their milestone'));
    }
    snapshot.kind = 'named';
    snapshot.name = name;
    await snapshot.save();
    res.json(listRow(snapshot));
  } catch (err) {
    next(err);
  }
});

// DELETE …/snapshots/:snapId — named snapshots only
router.delete('/:snapId', async (req, res, next) => {
  try {
    const snapshot = await findSnapshot(req);
    if (snapshot.kind !== 'named') {
      return next(httpError(400, 'NOT_ALLOWED', 'Only named snapshots can be deleted'));
    }
    await Snapshot.deleteOne({ _id: snapshot._id, workId: req.params.workId });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST …/snapshots/:snapId/restore — saves the current text first
router.post('/:snapId/restore', async (req, res, next) => {
  try {
    const snapshot = await findSnapshot(req);
    res.json(await restoreFromSnapshot(req.chapter, snapshot));
  } catch (err) {
    next(err);
  }
});

export default router;
