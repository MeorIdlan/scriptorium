import { Router } from 'express';
import { exportWork } from '../services/exportService.js';
import { httpError } from '../middleware/errorHandler.js';
import { loadWork } from '../middleware/loadWork.js';

const router = Router({ mergeParams: true });
router.use(loadWork);

const MIME_TYPES = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const EXTENSIONS = {
  pdf: 'pdf',
  epub: 'epub',
  docx: 'docx',
};

// POST /api/works/:workId/export
router.post('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const { format = 'pdf', includeNotes, includeOutline } = req.body;

    if (!MIME_TYPES[format]) {
      return next(httpError(400, 'UNSUPPORTED_FORMAT', `Unsupported format: ${format}. Use pdf, epub, or docx.`));
    }

    const buffer = await exportWork(workId, format, {
      includeNotes: Boolean(includeNotes),
      includeOutline: Boolean(includeOutline),
    });

    const filename = `${exportBasename(req.work.title)}.${EXTENSIONS[format]}`;
    res.setHeader('Content-Type', MIME_TYPES[format]);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// Work title as a filename: keep letters/numbers (any script), collapse the rest
export function exportBasename(title) {
  const base = (title || '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'export';
}

export default router;
