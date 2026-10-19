import { Router } from 'express';
import Work from '../models/Work.js';
import { writeAccountBackup } from '../services/backupService.js';
import { markBackedUp } from '../services/backupReminder.js';
import { contentDisposition } from './export.js';

const router = Router();

// Yields the owner's works in createdAt order. The id list is read once, up front; each work
// is then re-read as its turn comes, so a work deleted meanwhile is skipped and no cursor sits idle.
export async function* ownedWorks(userId) {
  const ids = await Work.find({ ownerId: userId }).select('_id').sort({ createdAt: 1, _id: 1 }).lean();
  for (const { _id } of ids) {
    const work = await Work.findOne({ _id, ownerId: userId }).select('_id title').lean();
    if (work) yield work;
  }
}

// POST /api/backup
router.post('/', async (req, res, next) => {
  const startedAt = new Date().toISOString();
  const date = startedAt.slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', contentDisposition(`scriptorium-backup-${date}.zip`));
  res.setHeader('X-Accel-Buffering', 'no');
  try {
    const items = await writeAccountBackup(ownedWorks(req.user.id), res);
    await markBackedUp(items.map((item) => item.workId), req.user.id, startedAt);
  } catch (err) {
    // Nothing sent yet: drop the download headers so the JSON error isn't labelled as a zip
    if (!res.headersSent) {
      res.removeHeader('Content-Type');
      res.removeHeader('Content-Disposition');
      res.removeHeader('X-Accel-Buffering');
      return next(err);
    }
    // Otherwise the zip is cut short. The output error listener in backupService.js makes destroy(err) safe
    console.error('account backup failed mid-stream', err);
    res.destroy(err);
  }
});

export default router;
