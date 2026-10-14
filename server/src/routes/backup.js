import { Router } from 'express';
import { loadWork } from '../middleware/loadWork.js';
import { writeWorkBackup } from '../services/backupService.js';
import { exportBasename } from './export.js';

const router = Router({ mergeParams: true });
router.use(loadWork);

// Same header scheme as the export route: ASCII fallback plus RFC 5987 filename*
function contentDisposition(filename) {
  const plain = filename.replace(/[^\x20-\x7e]|"/g, '_');
  return `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// POST /api/works/:workId/backup
router.post('/', async (req, res, next) => {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${exportBasename(req.work.title)}-backup-${date}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', contentDisposition(filename));
  res.setHeader('X-Accel-Buffering', 'no');
  try {
    await writeWorkBackup(req.work, res);
  } catch (err) {
    // Nothing sent yet: the normal error response. Otherwise the zip is cut short
    if (!res.headersSent) return next(err);
    console.error('backup failed mid-stream', err);
    res.destroy(err);
  }
});

export default router;
