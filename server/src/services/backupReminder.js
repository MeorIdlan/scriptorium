import Work from '../models/Work.js';
import { DAY_MS } from '../utils/time.js';

export const REMINDER_DAYS = 7;
export const SNOOZE_DAYS = 3;

function toDate(value) {
  return value ? new Date(value) : null;
}

function latest(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

// Pure: the reminder result for a work. `work` is a plain object or a Work document.
export function backupReminderState(work, now) {
  const createdAt = toDate(work.createdAt);
  const updatedAt = toDate(work.updatedAt);
  const lastBackup = toDate(work.lastBackupAt);
  const dismissedAt = toDate(work.reminderState?.dismissedAt);
  const snoozedUntil = toDate(work.reminderState?.snoozedUntil);

  // Old works have no contentChangedAt; an unedited new work (updatedAt === createdAt) has no change
  const edited = updatedAt && updatedAt.getTime() !== createdAt?.getTime();
  const changedAt = toDate(work.contentChangedAt) ?? (edited ? updatedAt : null);
  const unbacked = Boolean(changedAt && (!lastBackup || changedAt > lastBackup));

  const base = latest(lastBackup, dismissedAt) ?? createdAt;
  const clockRanOut = Boolean(base && now - base >= REMINDER_DAYS * DAY_MS);
  const snoozed = Boolean(snoozedUntil && now < snoozedUntil);

  return {
    due: unbacked && clockRanOut && !snoozed,
    lastBackupAt: work.lastBackupAt ?? null,
    daysSinceBackup: lastBackup ? Math.floor((now - lastBackup) / DAY_MS) : null,
  };
}

// The work as JSON (id, not _id) with its reminder result attached
export function withBackupReminder(work, now = new Date()) {
  const json = work.toJSON?.() ?? work;
  return { ...json, backupReminder: backupReminderState(work, now) };
}

// Records a finished backup of these works. `startedAt` is when the request began, so an edit
// made while the download streamed stays later than the stamp. Never throws: the download is
// already done, so a failed stamp is only logged.
export async function markBackedUp(workIds, ownerId, startedAt) {
  try {
    await Work.updateMany(
      { _id: { $in: workIds }, ownerId },
      { $set: { lastBackupAt: startedAt }, $unset: { reminderState: 1 } }
    );
  } catch (err) {
    console.error('Failed to stamp lastBackupAt:', err);
  }
}
