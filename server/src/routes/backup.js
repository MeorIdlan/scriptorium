import { Router } from 'express';
import { loadWork } from '../middleware/loadWork.js';
import { writeWorkBackup } from '../services/backupService.js';
import { markBackedUp } from '../services/backupReminder.js';
import { contentDisposition, exportBasename } from './export.js';

const router = Router({ mergeParams: true });
router.use(loadWork);

// POST /api/works/:workId/backup
router.post('/', async (req, res, next) => {
  const startedAt = new Date().toISOString();
  const date = startedAt.slice(0, 10);
  const filename = `${exportBasename(req.work.title)}-backup-${date}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', contentDisposition(filename));
  res.setHeader('X-Accel-Buffering', 'no');
  try {
    await writeWorkBackup(req.work, res);
    await markBackedUp([String(req.work._id)], req.user.id, startedAt);
  } catch (err) {
    // Nothing sent yet: drop the download headers so the JSON error isn't labelled as a zip
    if (!res.headersSent) {
      res.removeHeader('Content-Type');
      res.removeHeader('Content-Disposition');
      res.removeHeader('X-Accel-Buffering');
      return next(err);
    }
    // Otherwise the zip is cut short. The output error listener in backupService.js makes destroy(err) safe
    console.error('backup failed mid-stream', err);
    res.destroy(err);
  }
});

export default router;
