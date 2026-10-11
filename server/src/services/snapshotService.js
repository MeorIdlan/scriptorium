import Chapter from '../models/Chapter.js';
import Snapshot from '../models/Snapshot.js';
import { countWords, recalculate } from './wordCountService.js';
import { thinSnapshots } from './snapshotRetention.js';
import { newSnapshotId, snapshotFields } from './snapshotData.js';

// Autosave runs every few seconds, so keep at most one automatic snapshot per interval
export const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

export async function autoSnapshotDue(chapterId, now) {
  const last = await Snapshot.findOne({ chapterId, kind: 'auto' }).sort({ createdAt: -1 }).select('createdAt').lean();
  if (!last) return true;
  return new Date(now) - new Date(last.createdAt) >= SNAPSHOT_INTERVAL_MS;
}

async function thinChapter(chapterId, now) {
  const rows = await Snapshot.find({ chapterId, kind: 'auto' }).select('_id kind note createdAt').lean();
  const ids = thinSnapshots(rows.map((r) => ({ id: r._id, kind: r.kind, note: r.note, createdAt: r.createdAt })), now);
  if (ids.length) await Snapshot.deleteMany({ _id: { $in: ids }, kind: 'auto', note: { $in: ['', null] } });
}

// Saves the chapter's text (as passed: the pre-change document) as an
// automatic snapshot, then thins that chapter's automatic snapshots
export async function takeAutoSnapshot(chapter, now, { note = '' } = {}) {
  await Snapshot.create({ _id: newSnapshotId(), ...snapshotFields(chapter), kind: 'auto', note, createdAt: now });
  try {
    await thinChapter(chapter._id, now);
  } catch (err) {
    console.error('Snapshot thinning failed:', err);
  }
}

// Saves the current text as 'Before restore', then puts the snapshot's text back
export async function restoreFromSnapshot(chapter, snapshot) {
  const now = new Date().toISOString();
  await takeAutoSnapshot(chapter, now, { note: 'Before restore' });
  const content = snapshot.content || '';
  const updated = await Chapter.findOneAndUpdate(
    { _id: chapter._id, workId: chapter.workId },
    { $set: { content, contentHtml: snapshot.contentHtml || '', wordCount: countWords(content), updatedAt: now } },
    { new: true }
  );
  await recalculate(chapter.workId);
  return updated;
}
