import { Router } from 'express';
import Work from '../models/Work.js';
import { httpError } from '../middleware/errorHandler.js';
import { loadWork } from '../middleware/loadWork.js';
import { DAY_MS } from '../utils/time.js';
import { SNOOZE_DAYS, backupReminderState } from '../services/backupReminder.js';

const router = Router({ mergeParams: true });
router.use(loadWork);

// POST /api/works/:workId/backup-reminder  { action: 'snooze' | 'dismiss' }
// No stampContentChange: hiding the reminder doesn't change what a backup would capture.
router.post('/', async (req, res, next) => {
  try {
    const { action } = req.body || {};
    const now = new Date();
    let change;
    if (action === 'snooze') {
      change = { 'reminderState.snoozedUntil': new Date(now.getTime() + SNOOZE_DAYS * DAY_MS).toISOString() };
    } else if (action === 'dismiss') {
      change = { 'reminderState.dismissedAt': now.toISOString() };
    } else {
      return next(httpError(400, 'INVALID_FIELD', 'action must be snooze or dismiss'));
    }

    const updated = await Work.findOneAndUpdate(
      { _id: req.work._id, ownerId: req.user.id },
      { $set: change },
      { new: true }
    );
    if (!updated) return next(httpError(404, 'NOT_FOUND', 'Work not found'));
    res.json({ backupReminder: backupReminderState(updated, now) });
  } catch (err) {
    next(err);
  }
});

export default router;
