import { randomBytes } from 'node:crypto';

// Pure helpers for snapshot documents

const suffix = () => randomBytes(4).toString('hex');
export const newSnapshotId = () => `snap_${Date.now()}_${suffix()}`;
export const newMilestoneId = () => `ms_${Date.now()}_${suffix()}`;

export function snapshotFields(chapter) {
  return {
    workId: chapter.workId,
    chapterId: chapter._id,
    chapterTitle: chapter.title || '',
    content: chapter.content || '',
    contentHtml: chapter.contentHtml || '',
    wordCount: chapter.wordCount || 0,
  };
}

// Old embedded `draftHistory` entries → automatic snapshots. Ids are derived
// from the chapter, time and position, so re-running the migration is safe.
// It runs once on real data and removes `draftHistory` after, so every entry
// with text is kept: a bad date falls back to the chapter's last update, and
// entries sharing a time get distinct ids.
export function snapshotsFromDraftHistory(chapter) {
  const fallback = Date.parse(chapter.updatedAt ?? chapter.createdAt);
  const seen = new Set();
  const docs = [];
  (chapter.draftHistory || []).forEach((entry, index) => {
    if (!entry || (entry.contentSnapshot == null && entry.htmlSnapshot == null)) return;
    let t = Date.parse(entry.savedAt);
    if (Number.isNaN(t)) t = Number.isNaN(fallback) ? 0 : fallback;
    let _id = `snap_${chapter._id}_${t}`;
    if (seen.has(_id)) _id = `${_id}_${index}`;
    seen.add(_id);
    docs.push({
      _id,
      workId: chapter.workId,
      chapterId: chapter._id,
      chapterTitle: chapter.title || '',
      kind: 'auto',
      name: '',
      note: '',
      milestoneId: null,
      content: entry.contentSnapshot || '',
      contentHtml: entry.htmlSnapshot || '',
      wordCount: entry.wordCount || 0,
      createdAt: new Date(t).toISOString(),
    });
  });
  return docs;
}
