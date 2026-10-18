import { Router } from 'express';
import { exportWork } from '../services/exportService.js';
import { httpError } from '../middleware/errorHandler.js';
import { loadWork } from '../middleware/loadWork.js';
import { getManuscriptDetails, saveManuscriptDetails } from '../services/manuscriptDetails.js';
import Work from '../models/Work.js';

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

const LAYOUTS = ['reading', 'manuscript'];

// GET /api/works/:workId/export/manuscript
router.get('/manuscript', async (req, res, next) => {
  try {
    res.json(await getManuscriptDetails(req.work, req.user.id));
  } catch (err) {
    next(err);
  }
});

// POST /api/works/:workId/export
router.post('/', async (req, res, next) => {
  try {
    const { workId } = req.params;
    const { format = 'pdf', includeNotes, includeOutline, layout = 'reading', manuscript } = req.body;

    if (!MIME_TYPES[format]) {
      return next(httpError(400, 'UNSUPPORTED_FORMAT', `Unsupported format: ${format}. Use pdf, epub, or docx.`));
    }
    if (!LAYOUTS.includes(layout)) {
      return next(httpError(400, 'UNSUPPORTED_LAYOUT', `Unsupported layout: ${layout}. Use reading or manuscript.`));
    }
    if (layout === 'manuscript' && format === 'epub') {
      return next(httpError(400, 'UNSUPPORTED_LAYOUT', 'The manuscript layout is available for pdf and docx only.'));
    }

    // Everything is validated before the first save, so a refused request writes nothing
    let details;
    if (layout === 'manuscript') {
      if (manuscript !== undefined && (manuscript === null || typeof manuscript !== 'object' || Array.isArray(manuscript))) {
        return next(httpError(400, 'VALIDATION_ERROR', 'manuscript must be an object'));
      }
      await saveManuscriptDetails(req.work, req.user.id, manuscript);
      // req.work was loaded before the save, so read the work again for the saved details
      const work = await Work.findById(workId);
      details = await getManuscriptDetails(work, req.user.id);
    }

    const buffer = await exportWork(workId, format, {
      includeNotes: Boolean(includeNotes),
      includeOutline: Boolean(includeOutline),
      layout,
      manuscript: details,
    });

    const filename = `${exportBasename(req.work.title)}.${EXTENSIONS[format]}`;
    res.setHeader('Content-Type', MIME_TYPES[format]);
    res.setHeader('Content-Disposition', contentDisposition(filename));
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// Attachment header: ASCII fallback plus RFC 5987 filename*
export function contentDisposition(filename) {
  const plain = filename.replace(/[^\x20-\x7e]|"/g, '_');
  return `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

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
