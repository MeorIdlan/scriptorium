import { Router } from 'express';
import { exportWork } from '../services/exportService.js';
import { httpError } from '../middleware/errorHandler.js';

const router = Router({ mergeParams: true });

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
    const { format = 'pdf', includeNotes, draftVersion } = req.body;

    if (!MIME_TYPES[format]) {
      return next(httpError(400, 'UNSUPPORTED_FORMAT', `Unsupported format: ${format}. Use pdf, epub, or docx.`));
    }

    const buffer = await exportWork(workId, format, { includeNotes, draftVersion });

    res.setHeader('Content-Type', MIME_TYPES[format]);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="export.${EXTENSIONS[format]}"`
    );
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

export default router;
